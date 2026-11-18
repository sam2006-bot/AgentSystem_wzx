import { DatabaseSync } from 'node:sqlite';
import { createHash } from 'node:crypto';
import { config, levels, matchEvents, generateBrief } from './agents.mjs';
import { cleanGeo, readExifGps, inconclusivePhoto } from './evidence.mjs';
import { planReport, dedupStep, briefStep } from './orchestrator.mjs';

export class Store {
  constructor(filename) {
    this.db = new DatabaseSync(filename);
    this.db.exec(
      'PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000',
    );
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS reports(id INTEGER PRIMARY KEY,time INTEGER NOT NULL,requestId TEXT UNIQUE,
        text TEXT,photo BLOB,mime TEXT,hash TEXT,evidence TEXT,receipt TEXT);
      CREATE TABLE IF NOT EXISTS events(id INTEGER PRIMARY KEY,status TEXT DEFAULT '待确认',previous INTEGER,
        candidates TEXT DEFAULT '[]',department TEXT,location TEXT,manualUrgency TEXT,redirect INTEGER,reviewed INTEGER DEFAULT 0);
      CREATE TABLE IF NOT EXISTS items(id INTEGER PRIMARY KEY,event INTEGER REFERENCES events(id),
        reportId INTEGER REFERENCES reports(id),analysis TEXT,supplement INTEGER);
      CREATE INDEX IF NOT EXISTS items_event ON items(event);
      CREATE TABLE IF NOT EXISTS orders(id INTEGER PRIMARY KEY,event INTEGER UNIQUE REFERENCES events(id),department TEXT,time INTEGER);
      CREATE TABLE IF NOT EXISTS logs(id INTEGER PRIMARY KEY,event INTEGER,action TEXT,time INTEGER);
      CREATE TABLE IF NOT EXISTS briefs(id INTEGER PRIMARY KEY,time INTEGER,body TEXT,period TEXT UNIQUE);
    `);
    if (
      !this.all('PRAGMA table_info(events)').some(
        (c) => c.name === 'manualType',
      )
    )
      this.db.exec('ALTER TABLE events ADD COLUMN manualType TEXT');
    if (!this.all('PRAGMA table_info(reports)').some((c) => c.name === 'dhash'))
      this.db.exec('ALTER TABLE reports ADD COLUMN dhash TEXT');
  }
  one(sql, ...args) {
    return this.db.prepare(sql).get(...args);
  }
  all(sql, ...args) {
    return this.db.prepare(sql).all(...args);
  }
  run(sql, ...args) {
    return this.db.prepare(sql).run(...args);
  }
  tx(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const out = fn();
      this.db.exec('COMMIT');
      return out;
    } catch (error) {
      this.db.exec('ROLLBACK');
      throw error;
    }
  }
  record(id, msg) {
    this.run(
      'INSERT INTO logs(event,action,time) VALUES(?,?,?)',
      id,
      msg,
      Date.now(),
    );
  }
  receipt(key) {
    const row =
      key && this.one('SELECT receipt FROM reports WHERE requestId=?', key);
    return row?.receipt ? JSON.parse(row.receipt) : null;
  }
  items() {
    return this.all(
      `SELECT i.*,r.time,r.hash,r.dhash,r.mime,r.evidence FROM items i JOIN reports r ON r.id=i.reportId ORDER BY i.id`,
    ).map(({ analysis, evidence, ...row }) => ({
      ...row,
      ...JSON.parse(analysis),
      evidence: JSON.parse(evidence),
    }));
  }
  events(items = this.items()) {
    const records = this.all(
      'SELECT * FROM events WHERE redirect IS NULL ORDER BY id DESC',
    );
    const active = new Set(
      records.filter((r) => r.status !== '已办结').map((e) => e.id),
    );
    const grouped = Map.groupBy(items, (i) => i.event);
    return records
      .map((e) => {
        const data = grouped.get(e.id),
          first = data[0];
        // 早期版本只保存候选事件编号
        const matches = JSON.parse(e.candidates)
          .map((c) =>
            typeof c === 'number' ? { id: c, score: null, reasons: [] } : c,
          )
          .filter((c) => active.has(c.id));
        const urgency =
          levels[Math.max(...data.map((i) => levels.indexOf(i.urgency)))];
        return {
          ...e,
          type: e.manualType || first.type,
          asset: data.find((i) => i.asset)?.asset || '',
          location: e.location || data.find((i) => i.location)?.location || '',
          // 管理员确认过位置时以确认结果为准
          places: e.location
            ? [e.location]
            : [...new Set(data.map((i) => i.location).filter(Boolean))],
          department: e.department || first.department,
          candidates: matches.map((c) => c.id),
          matches,
          urgency: e.manualUrgency || urgency,
          count: new Set(data.map((i) => i.reportId)).size,
          last: Math.max(...data.map((i) => i.time)),
          hashes: data.map((i) => i.hash).filter(Boolean),
          dhashes: data.map((i) => i.dhash).filter(Boolean),
          coords: data.map((i) => i.geo).filter(Boolean),
          photoReview:
            !e.reviewed &&
            data.some(
              (i) =>
                i.mime &&
                (inconclusivePhoto(i.evidence) ||
                  !i.evidence.status.startsWith('模型观察')),
            ),
          // 文本模型推断的类型、位置或紧急等级须经管理员确认
          modelReview: !e.reviewed && data.some((i) => i.inferred?.length),
        };
      })
      .sort((a, b) => b.last - a.last || b.id - a.id);
  }
  detail(id) {
    const items = this.items();
    const event = this.events(items).find((e) => e.id === id);
    if (!event) {
      const old = this.one('SELECT redirect FROM events WHERE id=?', id);
      if (old?.redirect) return this.detail(old.redirect);
      throw Error('事件不存在');
    }
    return {
      ...event,
      items: items
        .filter((i) => i.event === id)
        .map((i) => ({
          ...i,
          text: this.one('SELECT text FROM reports WHERE id=?', i.reportId)
            .text,
        })),
      log: this.all(
        'SELECT action,time FROM logs WHERE event=? ORDER BY id DESC',
        id,
      ),
      order: this.one('SELECT * FROM orders WHERE event=?', id) || null,
    };
  }
  // planned：编排层 prepareReport 的结果（已完成解析与归属研判）；
  // 未提供时按规则同步解析
  submit(input, evidence, photo = null, planned = null) {
    return this.tx(() => {
      const old = this.receipt(input.requestId);
      if (old) return old;
      const now = Date.now();
      const hash = photo
        ? createHash('sha256').update(photo.bytes).digest('hex')
        : null;
      // 感知哈希由市民端浏览器解码图片后计算，原图重新压缩后仍然接近
      const dhash =
        photo && /^[0-9a-f]{16}$/.test(input.dhash || '') ? input.dhash : null;
      const geo =
        (photo && readExifGps(photo.bytes)) || cleanGeo(input.geo) || null;
      const reportId = Number(
        this.run(
          'INSERT INTO reports(time,requestId,text,photo,mime,hash,dhash,evidence) VALUES(?,?,?,?,?,?,?,?)',
          now,
          input.requestId || null,
          input.text || '',
          photo?.bytes || null,
          photo?.mime || null,
          hash,
          dhash,
          JSON.stringify(evidence),
        ).lastInsertRowid,
      );
      const ids = [];
      const history = this.events();
      const issues = planned || planReport(input, evidence);
      // 一条上报含多个不同位置时，无法确定坐标对应哪一处
      const located =
        new Set(issues.map((i) => i.location)).size === 1 ? geo : null;
      for (const issue of issues) {
        const match = matchEvents(
          issue,
          history,
          { hash, dhash, geo: located },
          now,
        );
        const id =
          match.target ||
          Number(
            this.run(
              'INSERT INTO events(previous,candidates) VALUES(?,?)',
              match.previous,
              JSON.stringify(match.candidates),
            ).lastInsertRowid,
          );
        this.run(
          'INSERT INTO items(event,reportId,analysis,supplement) VALUES(?,?,?,?)',
          id,
          reportId,
          JSON.stringify({
            ...issue,
            geo: located,
            link: match.link,
            trace: [...issue.trace, dedupStep(match)],
          }),
          match.target ? 1 : 0,
        );
        if (match.target && (photo || issue.inferred?.length))
          this.run('UPDATE events SET reviewed=0 WHERE id=?', id);
        if (match.target && issue.urgency === '紧急')
          this.run('UPDATE events SET manualUrgency=NULL WHERE id=?', id);
        const pct = (n) => Math.round(n * 100) + '%';
        this.record(
          id,
          match.target
            ? '关联补充线索 #' +
                reportId +
                ' · 相似度 ' +
                pct(match.link.score) +
                ' · ' +
                match.link.reasons.join('、')
            : '建立事件 · 线索 #' +
                reportId +
                (match.candidates.length
                  ? ' · 疑似重复 ' +
                    match.candidates
                      .map((c) => 'E-' + c.id + '（' + pct(c.score) + '）')
                      .join('、')
                  : ''),
        );
        ids.push(id);
      }
      const receipt = { reportId, events: [...new Set(ids)] };
      this.run(
        'UPDATE reports SET receipt=? WHERE id=?',
        JSON.stringify(receipt),
        reportId,
      );
      return receipt;
    });
  }
  active(id) {
    const e = this.detail(id);
    if (e.id !== id || e.status === '已办结')
      throw Error('事件已合并或办结，请刷新');
    return e;
  }
  review(id, department, location, urgency = '', type = '') {
    if (!config.departments.includes(department) || !location?.trim())
      throw Error('请选择职能部门并确认位置');
    if (urgency && !levels.includes(urgency)) throw Error('紧急等级无效');
    if (
      type &&
      ![...config.rules.map((r) => r.type), '其他设施问题'].includes(type)
    )
      throw Error('请选择已确认的问题类型');
    return this.tx(() => {
      const e = this.active(id);
      if (!type && e.type === '待识别问题') throw Error('请确认问题类型');
      if (e.order && department !== e.order.department)
        throw Error('已派工单的主责部门不能修改');
      this.run(
        "UPDATE events SET department=?,location=?,manualUrgency=?,manualType=?,candidates='[]',reviewed=1 WHERE id=?",
        department,
        location.trim(),
        urgency || e.manualUrgency,
        type || e.manualType,
        id,
      );
      this.record(
        id,
        '人工复核 · ' +
          (type || e.type) +
          ' · ' +
          department +
          ' · ' +
          location.trim() +
          ' · ' +
          (urgency || e.urgency) +
          ' · 已核对证据和独立性',
      );
    });
  }
  dispatch(id, department) {
    return this.tx(() => {
      const e = this.active(id);
      if (e.order) return e.order;
      if (
        e.candidates.length ||
        !e.location ||
        e.photoReview ||
        e.modelReview ||
        e.type === '待识别问题' ||
        !config.departments.includes(e.department)
      )
        throw Error('请先核对图片、模型推断、类型、位置、归属和疑似重复事项');
      if (department !== e.department) throw Error('请先复核主责部门');
      this.run(
        'INSERT INTO orders(event,department,time) VALUES(?,?,?)',
        id,
        department,
        Date.now(),
      );
      this.run("UPDATE events SET status='已派单' WHERE id=?", id);
      this.record(id, '确认派单 · ' + department);
      return this.one('SELECT * FROM orders WHERE event=?', id);
    });
  }
  closeEvent(id) {
    this.tx(() => {
      const e = this.active(id);
      if (!e.order) throw Error('请先确认派单');
      this.run("UPDATE events SET status='已办结' WHERE id=?", id);
      this.record(id, '确认已修复并办结');
    });
  }
  merge(source, target) {
    return this.tx(() => {
      const from = this.active(source),
        to = this.active(target);
      if (source === target || from.type !== to.type || from.order)
        throw Error('请选择同类事件，已派单事件应作为保留事件');
      this.run(
        'UPDATE items SET event=?,supplement=1 WHERE event=?',
        target,
        source,
      );
      this.run('UPDATE events SET redirect=? WHERE id=?', target, source);
      this.run('UPDATE events SET reviewed=0 WHERE id=?', target);
      const msg = '人工合并 E-' + source + ' → E-' + target;
      this.record(target, msg);
      this.record(source, msg);
      return target;
    });
  }
  split(id, itemId) {
    return this.tx(() => {
      const e = this.active(id);
      if (e.items.length < 2 || !e.items.some((i) => i.id === itemId))
        throw Error('请选择该事件中一条补充事项');
      const newId = Number(
        this.run('INSERT INTO events DEFAULT VALUES').lastInsertRowid,
      );
      this.run(
        'UPDATE items SET event=?,supplement=0 WHERE id=?',
        newId,
        itemId,
      );
      this.run(
        'UPDATE items SET supplement=0 WHERE id=(SELECT MIN(id) FROM items WHERE event=?)',
        id,
      );
      this.record(id, '人工拆分事项 #' + itemId + ' 至 E-' + newId);
      this.record(newId, '由 E-' + id + ' 拆分');
      return newId;
    });
  }
  brief(start, end, period = null) {
    if (
      !Number.isSafeInteger(start) ||
      !Number.isSafeInteger(end) ||
      end <= start
    )
      throw Error('请选择有效的起止时间');
    return this.tx(() => {
      const items = this.items();
      const time = Date.now();
      const body = generateBrief(items, this.events(items), start, end, {
        orders: this.all('SELECT event,time FROM orders'),
        now: time,
      });
      body.trace = [briefStep(body)];
      const id = Number(
        this.run(
          'INSERT INTO briefs(time,body,period) VALUES(?,?,?)',
          time,
          JSON.stringify(body),
          period,
        ).lastInsertRowid,
      );
      return { ...body, id, time };
    });
  }
  updateBrief({ id, time, ...body }) {
    this.run('UPDATE briefs SET body=? WHERE id=?', JSON.stringify(body), id);
    return { ...body, id, time };
  }
  inbox() {
    return this.all('SELECT id,time,body FROM briefs ORDER BY id DESC').map(
      ({ body, ...row }) => {
        const brief = JSON.parse(body);
        if (brief.summary?.template && !brief.summary.focusIds) {
          brief.summary = {
            text: brief.summary.template,
            method: '规则模板',
            note: '旧版模型摘要未经逐事件核对，展示生成时保存的模板摘要',
          };
          brief.trace = [briefStep(brief)];
        }
        return { ...brief, ...row };
      },
    );
  }
  daily() {
    const created = [];
    const days = this.all(
      "SELECT DISTINCT date(time/1000,'unixepoch','localtime') AS day FROM reports EXCEPT SELECT period FROM briefs WHERE period IS NOT NULL",
    );
    for (const { day } of days) {
      const start = new Date(day + 'T00:00:00'),
        end = new Date(start);
      end.setDate(end.getDate() + 1);
      if (+end <= Date.now()) created.push(this.brief(+start, +end, day));
    }
    return created;
  }
}
