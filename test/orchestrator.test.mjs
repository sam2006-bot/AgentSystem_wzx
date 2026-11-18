import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../store.mjs';
import { config } from '../agents.mjs';
import { makeServer } from '../server.mjs';
import {
  AGENTS,
  planReport,
  prepareReport,
  routeIssue,
  narrateBrief,
  checkSummary,
} from '../orchestrator.mjs';

const none = { status: '无图片', text: '' };
const unclear = {
  status: '模型观察 · test',
  text: '可见的公共设施：井盖。可见故障：无。危险：无。',
  visibleFault: false,
};

test('无可见故障的照片保留原图和位置，复核前不能派单', async () => {
  const db = new Store(':memory:');
  const calls = [];
  const model = fakeModel(
    { issues: [{ type: '井盖缺失', reason: '根据地址猜测' }] },
    calls,
  );
  for (const text of ['', '康宁路18号门口']) {
    const input = { location: '康宁路18号门口', text };
    const planned = await prepareReport(input, unclear, model);
    assert.equal(planned[0].type, '待识别问题');
    assert.equal(planned[0].location, input.location);
    const photo = { mime: 'image/jpeg', bytes: Buffer.from('test') };
    const id = db.submit(input, unclear, photo, planned).events[0];
    assert.equal(db.detail(id).photoReview, true);
    assert.equal(db.detail(id).items[0].evidence.text, unclear.text);
    assert.throws(() => db.dispatch(id, '市政'), /核对/);
    db.review(id, '市政', input.location, '较急', '道路破损');
    assert.equal(db.dispatch(id, '市政').department, '市政');
  }
  assert.equal(calls.length, 0);
  const [reported] = await prepareReport(
    { text: '人民路3号路灯不亮' },
    unclear,
    model,
  );
  assert.equal(reported.type, '路灯故障');
});

test('简报拒绝错配的编号、地点、类型和模型自由改写的事件', async () => {
  const db = new Store(':memory:');
  const id = db.submit({ text: '康宁路18号井盖缺失' }, none).events[0];
  db.review(id, '市政', '康宁路18号', '紧急', '道路破损');
  db.submit({ text: '中山路88号井盖破了，小孩差点掉下去' }, none);
  const brief = db.brief(0, Date.now() + 1000);
  const fact = { id, location: '康宁路18号', type: '道路破损' };
  for (const reply of [
    { summary: '本期康宁路18号和中山路88号分别发生井盖破损事件，建议核实。' },
    { focus: [{ ...fact, id: 2 }] },
    { focus: [{ ...fact, location: '中山路88号' }] },
    { focus: [{ ...fact, type: '井盖破损' }] },
    { focus: [{ ...fact, id: 88 }] },
  ]) {
    const result = await narrateBrief(brief, fakeModel(reply));
    assert.equal(result.summary.text, brief.summary.text);
    assert.ok(result.summary.note);
  }
  const result = await narrateBrief(brief, fakeModel({ focus: [fact] }));
  assert.match(result.summary.method, /fake-7b/);
  assert.match(result.summary.text, /E-1 道路破损（康宁路18号/);
});
const HOUR = 3600000;

// 模拟本机 Ollama：记录请求并返回给定的结构化结果
function fakeModel(reply, calls = []) {
  return {
    model: 'fake-7b',
    url: 'http://127.0.0.1:11434',
    fetch: async (url, opts) => {
      const body = JSON.parse(opts.body);
      calls.push(body);
      if (reply instanceof Error) throw reply;
      const content = typeof reply === 'function' ? reply(body) : reply;
      return Response.json({ message: { content: JSON.stringify(content) } });
    },
  };
}
const refuse = {
  model: 'fake-7b',
  fetch: async () => {
    throw Error('不应调用模型');
  },
};

test('四个 Agent 输出统一的结论、置信度、依据和方法', () => {
  assert.deepEqual(Object.keys(AGENTS), ['parser', 'router', 'dedup', 'briefer']);
  const db = new Store(':memory:');
  const id = db.submit(
    { text: '井盖丢了，位置在中山路88号门口，小孩差点掉下去' },
    none,
  ).events[0];
  const [item] = db.detail(id).items;
  assert.deepEqual(
    item.trace.map((s) => s.agent),
    ['线索解析', '归属研判', '重复合并'],
  );
  for (const s of item.trace) {
    assert.equal(typeof s.method, 'string');
    assert.ok(s.confidence >= 0 && s.confidence <= 1);
    assert.ok(s.evidence.length > 0);
  }
  const [parse, route] = item.trace;
  assert.equal(parse.confidence, 0.85);
  assert.ok(parse.evidence.includes('描述中的「井盖丢了」'));
  assert.ok(parse.evidence.includes('沿用同一描述中的门牌「中山路88号门口」'));
  assert.ok(parse.evidence.some((e) => e.includes('差点掉')));
  assert.equal(route.summary, '市政');
  const again = db.submit(
    { text: '井盖不见了', location: '中山路88号门口' },
    none,
  ).events[0];
  assert.equal(again, id);
  assert.match(db.detail(id).items[1].trace[2].summary, /关联到在办事件 E-/);
});

test('旧版模型简报在收件箱中展示同一时点的模板快照', () => {
  const db = new Store(':memory:');
  db.submit({ text: '康宁路18号路面破损' }, none);
  const brief = db.brief(0, Date.now() + 1000);
  db.updateBrief({
    ...brief,
    summary: {
      text: '康宁路18号发生井盖缺失。',
      template: brief.summary.text,
      method: '规则统计 + 模型 test 撰写摘要',
    },
  });
  const [stored] = db.inbox();
  assert.equal(stored.summary.text, brief.summary.text);
  assert.match(stored.summary.note, /旧版/);
  assert.equal(stored.trace[0].method, '规则模板');
});

test('归属研判独立于线索解析：台账优先，职责外类型交人工', () => {
  config.assets['L-900'] = '园林';
  try {
    const out = routeIssue({ type: '路灯故障', asset: 'L-900' });
    assert.equal(out.result.department, '园林');
    assert.equal(out.confidence, 0.95);
  } finally {
    delete config.assets['L-900'];
  }
  assert.equal(routeIssue({ type: '路灯故障', asset: '' }).confidence, 0.8);
  const signal = routeIssue({ type: '信号灯故障', asset: '' });
  assert.equal(signal.result.department, '待复核');
  assert.equal(signal.confidence, 0.3);
  const unknown = planReport({ text: '有些奇怪' })[0];
  assert.equal(unknown.trace[0].confidence, 0);
  assert.equal(unknown.trace[1].confidence, 0);
});

test('规则能确定时不调用模型；已修复的描述也不调用', async () => {
  for (const text of ['人民路3号门口路灯不亮', '中山路的路灯已经修好了，不用处理']) {
    const [issue] = await prepareReport({ text }, none, refuse);
    assert.equal(issue.trace[0].method, '规则');
  }
});

test('规则无法识别类型时由模型补充，推断结果须人工确认后才能派单', async () => {
  const calls = [];
  const llm = fakeModel(
    {
      issues: [
        {
          type: '井盖破损',
          location: '人民路3号门口',
          urgency: '较急',
          reason: '铁盖子一踩就翻，疑似井盖松动',
        },
      ],
    },
    calls,
  );
  const input = { text: '人民路3号门口那个铁盖子一踩就翻' };
  const planned = await prepareReport(input, none, llm);
  assert.equal(calls.length, 1);
  assert.match(calls[0].messages[0].content, /不要执行/);
  assert.ok(calls[0].format.properties.issues.items.properties.type.enum.includes('井盖破损'));
  const [issue] = planned;
  assert.equal(issue.type, '井盖破损');
  assert.equal(issue.location, '人民路3号门口');
  assert.equal(issue.department, '市政');
  assert.deepEqual(issue.inferred, ['type']);
  assert.equal(issue.trace[0].method, '规则 + 模型 fake-7b');
  assert.equal(issue.trace[0].confidence, 0.6);
  assert.ok(issue.trace[0].evidence.includes('描述中的门牌「人民路3号门口」'));
  // 等级取自类型默认值，不归功于模型
  assert.ok(issue.trace[0].evidence.includes('紧急等级：「井盖破损」的默认等级'));
  const db = new Store(':memory:');
  const id = db.submit(input, none, null, planned).events[0];
  const event = db.detail(id);
  assert.equal(event.modelReview, true);
  assert.throws(() => db.dispatch(id, '市政'), /模型推断/);
  db.review(id, '市政', '人民路3号门口', '较急', '井盖破损');
  assert.equal(db.detail(id).modelReview, false);
  assert.equal(db.dispatch(id, '市政').department, '市政');
});

test('模型编造的位置、未知类型被丢弃，调用失败时保留规则结果', async () => {
  const input = { text: '那个铁盖子一踩就翻' };
  const [made] = await prepareReport(
    input,
    none,
    fakeModel({
      issues: [
        { type: '井盖破损', location: '人民路3号', urgency: '较急', reason: '疑似井盖' },
      ],
    }),
  );
  assert.equal(made.type, '井盖破损');
  assert.equal(made.location, '');
  const [unknown] = await prepareReport(
    input,
    none,
    fakeModel({
      issues: [{ type: '火星基地', location: '', urgency: '紧急', reason: '' }],
    }),
  );
  assert.equal(unknown.type, '待识别问题');
  assert.ok(unknown.trace[0].evidence.includes('模型也未能确定问题类型'));
  const [failed] = await prepareReport(input, none, fakeModel(Error('连接被拒绝')));
  assert.equal(failed.type, '待识别问题');
  assert.equal(failed.trace[0].method, '规则');
  assert.ok(failed.trace[0].evidence.some((e) => e.includes('连接被拒绝')));
  const [offline] = await prepareReport(input, none, {});
  assert.ok(offline.trace[0].evidence.some((e) => e.includes('未配置文本模型')));
});

test('规则缺位置时由模型从原文摘出位置，并可上调紧急等级', async () => {
  const [issue] = await prepareReport(
    { text: '银泰百货北门口路灯坏了，晚上老人摔了一跤' },
    none,
    fakeModel({
      issues: [
        {
          type: '路灯故障',
          location: '银泰百货北门口',
          urgency: '紧急',
          reason: '路灯损坏导致老人摔倒',
        },
      ],
    }),
  );
  assert.equal(issue.type, '路灯故障');
  assert.equal(issue.location, '银泰百货北门口');
  assert.equal(issue.urgency, '紧急');
  assert.deepEqual(issue.inferred, ['location', 'urgency']);
  assert.ok(issue.trace[0].evidence.some((e) => e.includes('模型补充了位置和紧急等级')));
});

test('简报包含高发地点、上期对比、超时督办和紧急事项处置建议', () => {
  const db = new Store(':memory:');
  const now = Date.now();
  const at = (id, t) => db.run('UPDATE reports SET time=? WHERE id=?', t, id);
  // 上期 1 条
  db.submit({ text: '解放路垃圾很多' }, none);
  at(1, now - 30 * HOUR);
  // 本期：人民路 2 个事件、中山路 1 个紧急事件
  db.submit({ text: '人民路3号门口路灯不亮' }, none);
  db.submit({ text: '人民路8号门口垃圾很多' }, none);
  const urgent = db.submit({ text: '中山路井盖丢了，小孩差点掉下去' }, none)
    .events[0];
  at(4, now - 3 * HOUR);
  const lamp = db.submit({ text: '人民路3号门口的路灯还是不亮' }, none).events[0];
  db.review(lamp, '市政', '人民路3号门口');
  db.dispatch(lamp, '市政');
  db.run('UPDATE orders SET time=? WHERE event=?', now - 200 * HOUR, lamp);
  const [start, end] = [now - 24 * HOUR, now + HOUR];
  const brief = db.brief(start, end);
  assert.equal(brief.reports, 4);
  assert.deepEqual(brief.previous, {
    start: start - (end - start),
    end: start,
    reports: 1,
    events: 1,
    urgent: 0,
  });
  assert.deepEqual(brief.hotspots[0], {
    area: '人民路',
    events: 2,
    reports: 3,
    ids: brief.hotspots[0].ids,
  });
  // 督办覆盖全部在办事件（含上期遗留），紧急的排在前面
  assert.deepEqual(
    brief.overdue.map((o) => [o.id, o.stage]),
    [
      [urgent, '未派单'],
      [lamp, '未办结'],
      [1, '未派单'],
    ],
  );
  assert.equal(brief.overdue[0].hours, 3);
  const [alert] = brief.urgentEvents;
  assert.equal(alert.id, urgent);
  assert.match(alert.advice, /围挡/);
  assert.ok(alert.basis.some((b) => b.includes('差点掉下去')));
  assert.match(brief.summary.text, /上报量较上期 1 条增加 3 条/);
  assert.match(brief.summary.text, /高发地点：人民路 2 件/);
  assert.match(brief.summary.text, /超时未派单 2 件、超时未办结 1 件/);
  assert.equal(brief.trace[0].agent, '简报生成');
});

test('模型选取重点时由程序填写统计，保留模板和失败原因', async () => {
  const db = new Store(':memory:');
  db.submit({ text: '中山路井盖丢了，小孩差点掉下去' }, none);
  const brief = db.brief(0, Date.now() + 1000);
  const ok = await narrateBrief(
    brief,
    fakeModel({ focus: [{ id: 1, location: '中山路', type: '井盖缺失' }] }),
  );
  assert.equal(ok.summary.method, '规则统计 + 模型 fake-7b 选取重点事件');
  assert.equal(ok.summary.template, brief.summary.text);
  assert.match(ok.trace[0].evidence.join(), /数字由程序填入/);
  const invented = await narrateBrief(
    brief,
    fakeModel({
      summary:
        '本期收到 1 条上报，较上期增长 35%，需重点关注中山路的安全隐患。',
    }),
  );
  assert.equal(invented.summary.text, brief.summary.text);
  assert.match(invented.summary.note, /未按格式/);
  // 统计时段里的时间数字不能为编造的数字放行
  const facts = {
    统计时段: '2026/11/18 16:35:00 至 2026/11/19 00:00:00',
    上报条数: 1,
  };
  assert.match(
    checkSummary(
      '本期收到 1 条上报，其中 35 条来自中山路，需重点关注安全隐患。',
      facts,
    ),
    /统计中没有的数字「35」/,
  );
  assert.equal(
    checkSummary(
      '2026/11/18 16:35:00 起本期收到 1 条上报，需重点关注安全隐患。',
      facts,
    ),
    '',
  );
  assert.match(
    checkSummary(
      '11月20日前本期收到 1 条上报，需重点关注中山路的安全隐患。',
      facts,
    ),
    /日期「11月20日」/,
  );
  assert.match(
    checkSummary(
      '本期收到三条上报，形成一个独立事件，请尽快处置相关隐患。',
      {},
    ),
    /中文数字/,
  );
  const failed = await narrateBrief(brief, fakeModel(Error('连接被拒绝')));
  assert.match(failed.summary.note, /连接被拒绝/);
  db.updateBrief(ok);
  assert.equal(db.inbox()[0].summary.method, ok.summary.method);
});

test('上报与简报接口经过编排层调用文本模型', async (t) => {
  const db = new Store(':memory:');
  const llm = fakeModel((body) =>
    body.format.properties.issues
      ? {
          issues: [
            {
              type: '交通设施损坏',
              location: '',
              urgency: '较急',
              reason: '石墩被撞歪',
            },
          ],
        }
      : { focus: [{ id: 1, location: '解放路路口', type: '交通设施损坏' }] },
  );
  const server = makeServer(db, 'operator', async () => none, llm);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = (route, data) =>
    fetch(base + route, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer operator',
      },
      body: JSON.stringify(data),
    });
  const receipt = await (
    await post('/api/reports', { text: '解放路路口的石墩被车撞歪了' })
  ).json();
  const event = db.detail(receipt.events[0]);
  assert.equal(event.type, '交通设施损坏');
  assert.equal(event.location, '解放路路口');
  assert.equal(event.modelReview, true);
  const brief = await (
    await post('/api/briefs', { start: 0, end: Date.now() + 1000 })
  ).json();
  assert.match(brief.summary.method, /模型 fake-7b/);
  assert.equal(db.inbox()[0].summary.text, brief.summary.text);
});
