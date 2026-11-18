import http from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { Store } from './store.mjs';
import { parseClue, config } from './agents.mjs';
import { analyzePhoto, cleanGeo, decodePhoto } from './evidence.mjs';
import { llmOptions } from './llm.mjs';
import { prepareReport, narrateBrief } from './orchestrator.mjs';

const publicDir = fileURLToPath(new URL('./public/', import.meta.url));
const types = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.svg': 'image/svg+xml',
};
// 只提供白名单内的静态文件；public/vendor/ 下的第三方库按扩展名登记
const assets = {
  '/': 'index.html',
  '/admin': 'admin.html',
  '/app.css': 'app.css',
  '/supported.js': 'supported.js',
  '/citizen.js': 'citizen.js',
  '/admin.js': 'admin.js',
};
for (const file of readdirSync(path.join(publicDir, 'vendor'), {
  recursive: true,
})) {
  const name = path.join('vendor', file).split(path.sep).join('/');
  if (Object.hasOwn(types, path.extname(name))) assets['/' + name] = name;
}
function send(res, status, body, type = 'application/json') {
  res.writeHead(status, {
    'Content-Type': type + (type.startsWith('image/') ? '' : '; charset=utf-8'),
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy':
      "default-src 'self'; img-src 'self' data: blob:; style-src 'self'; script-src 'self'; frame-ancestors 'none'; base-uri 'none'",
  });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}
async function body(req) {
  if (!req.headers['content-type']?.startsWith('application/json'))
    throw Error('请求格式应为 JSON');
  const parts = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 7 * 1024 * 1024) throw Error('提交内容过大');
    parts.push(chunk);
  }
  let obj;
  try {
    obj = JSON.parse(Buffer.concat(parts).toString());
  } catch {
    throw Error('无效 JSON');
  }
  if (!obj || Array.isArray(obj) || typeof obj !== 'object')
    throw Error('无效请求');
  return obj;
}
function field(obj, name, limit) {
  const value = obj[name] ?? '';
  if (typeof value !== 'string' || value.length > limit)
    throw Error('输入字段类型或长度不正确');
  return value.trim();
}
// 简报统计在事务内同步生成；配置了文本模型时再请模型撰写摘要
export async function finishBrief(db, brief, llm) {
  if (!llm.model) return brief;
  return db.updateBrief(await narrateBrief(brief, llm));
}

// llm：文本模型配置 { model, url, fetch? }；model 为空时只用规则
export function makeServer(db, key, vision = analyzePhoto, llm = llmOptions()) {
  const pending = new Map();
  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost'),
        p = url.pathname,
        method = req.method;
      if (method === 'GET' && Object.hasOwn(assets, p)) {
        const name = assets[p];
        return send(
          res,
          200,
          readFileSync(path.join(publicDir, name)),
          types[path.extname(name)],
        );
      }
      if (!p.startsWith('/api/'))
        return send(res, 404, { error: '页面不存在' });
      if (method === 'POST' && p === '/api/reports') {
        const input = await body(req);
        const clue = {
          text: field(input, 'text', 3000),
          location: field(input, 'location', 150),
          asset: field(input, 'asset', 50),
          requestId: field(input, 'requestId', 100),
          dhash: field(input, 'dhash', 16).toLowerCase(),
          geo: input.geo == null ? null : cleanGeo(input.geo),
        };
        if (clue.dhash && !/^[0-9a-f]{16}$/.test(clue.dhash))
          throw Error('图片指纹格式不正确');
        if (input.geo != null && !clue.geo) throw Error('定位数据无效');
        if (!clue.text && !input.image)
          throw Error('请填写现场描述或上传现场图片');
        const previous = db.receipt(clue.requestId);
        if (previous) return send(res, 200, previous);
        const photo = decodePhoto(input.image);
        const alertId = randomBytes(8).toString('hex');
        if (photo && parseClue(clue).some((i) => i.urgency === '紧急'))
          pending.set(alertId, {
            text: clue.text,
            location: clue.location,
            time: Date.now(),
          });
        try {
          const evidence = await vision(photo);
          const planned = await prepareReport(clue, evidence, llm);
          return send(res, 201, db.submit(clue, evidence, photo, planned));
        } finally {
          pending.delete(alertId);
        }
      }
      const auth = Buffer.from(req.headers.authorization || ''),
        expected = Buffer.from('Bearer ' + key);
      if (auth.length !== expected.length || !timingSafeEqual(auth, expected))
        return send(res, 401, { error: '请输入本机管理员口令' });
      if (method === 'GET' && p === '/api/state') {
        const events = db
          .events()
          .map(({ hashes, dhashes, coords, places, ...e }) => e);
        return send(res, 200, {
          events,
          inbox: db.inbox(),
          pending: [...pending.values()],
          departments: config.departments,
          types: [...config.rules.map((r) => r.type), '其他设施问题'],
          reports: db.one('SELECT COUNT(*) AS n FROM reports').n,
        });
      }
      const photoRoute = p.match(/^\/api\/photos\/(\d+)$/);
      if (method === 'GET' && photoRoute) {
        const img = db.one(
          'SELECT mime,photo FROM reports WHERE id=?',
          Number(photoRoute[1]),
        );
        if (!img?.photo) return send(res, 404, { error: '图片不存在' });
        return send(res, 200, Buffer.from(img.photo), img.mime);
      }
      if (method === 'POST' && p === '/api/briefs') {
        const { start, end } = await body(req);
        return send(res, 201, await finishBrief(db, db.brief(start, end), llm));
      }
      const route = p.match(
        /^\/api\/events\/(\d+)(?:\/(review|dispatch|close|merge|split))?$/,
      );
      if (route) {
        const id = Number(route[1]);
        if (method === 'GET' && !route[2]) return send(res, 200, db.detail(id));
        if (method === 'POST' && route[2]) {
          const data = await body(req);
          switch (route[2]) {
            case 'review':
              db.review(
                id,
                field(data, 'department', 20),
                field(data, 'location', 150),
                field(data, 'urgency', 10),
                field(data, 'type', 50),
              );
              break;
            case 'dispatch':
              return send(
                res,
                200,
                db.dispatch(id, field(data, 'department', 20)),
              );
            case 'close':
              db.closeEvent(id);
              break;
            case 'merge':
              return send(res, 200, { id: db.merge(id, Number(data.target)) });
            case 'split':
              return send(res, 200, { id: db.split(id, Number(data.item)) });
          }
          return send(res, 200, { id });
        }
      }
      send(res, 404, { error: '接口不存在' });
    } catch (err) {
      const internal =
        err.code?.startsWith('ERR_SQLITE') || err.code === 'ENOENT';
      if (internal) console.error(err.message);
      send(res, internal ? 500 : 400, {
        error: internal ? '存储或服务异常，请重试' : err.message,
      });
    }
  });
}

if (
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url
) {
  const dir =
    process.env.DATA_DIR || fileURLToPath(new URL('./data/', import.meta.url));
  mkdirSync(dir, { recursive: true });
  const keyPath = path.join(dir, 'admin-key.txt');
  if (!process.env.ADMIN_KEY && !existsSync(keyPath))
    writeFileSync(keyPath, randomBytes(18).toString('base64url'), {
      mode: 0o600,
      flag: 'wx',
    });
  const key = process.env.ADMIN_KEY || readFileSync(keyPath, 'utf8').trim();
  const db = new Store(path.join(dir, 'facilities.sqlite'));
  const llm = llmOptions();
  const daily = () => {
    try {
      for (const brief of db.daily())
        finishBrief(db, brief, llm).catch((error) =>
          console.error('日报摘要生成失败', error.message),
        );
    } catch (error) {
      console.error('日报生成失败', error.message);
    }
  };
  daily();
  setInterval(daily, 60000).unref();
  const port = Number(process.env.PORT || 4317);
  makeServer(db, key, analyzePhoto, llm).listen(port, '127.0.0.1', () =>
    console.log(
      '市民上报 http://127.0.0.1:' +
        port +
        '/\n管理员 http://127.0.0.1:' +
        port +
        '/admin\n口令来源 ' +
        (process.env.ADMIN_KEY ? 'ADMIN_KEY' : keyPath) +
        '\n文本模型 ' +
        (llm.model || '未配置（仅使用规则）'),
    ),
  );
}
