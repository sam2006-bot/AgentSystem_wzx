import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../store.mjs';
import { parseClue } from '../agents.mjs';
import { analyzePhoto } from '../evidence.mjs';

const east = '人民路与建设路交叉口东侧';
const west = '人民路与建设路交叉口西侧';
const well = { text: '机动车道井盖缺失', location: east, asset: 'J-017' };
const tree = { text: '断枝悬挂在人行道上方', location: west };
function submit(db, input) {
  return db.submit(input, { status: '无图片', text: '' });
}

test('三条上报、两个事件、紧急提醒和可追溯简报', () => {
  const db = new Store(':memory:');
  const a = submit(db, well);
  const b = submit(db, { ...well, text: '机动车道井口敞开' });
  submit(db, tree);
  assert.equal(a.events[0], b.events[0]);
  const events = db.events();
  assert.equal(events.length, 2);
  assert.deepEqual(
    events.map((e) => e.department).sort(),
    ['园林', '市政'].sort(),
  );
  assert.ok(events.every((e) => e.urgency === '紧急'));
  const brief = db.brief(0, Date.now() + 1000);
  assert.equal(brief.reports, 3);
  assert.equal(brief.events.length, 2);
  assert.equal(brief.supplements, 1);
  assert.equal(db.inbox()[0].id, brief.id);
  assert.equal(db.brief(0, 1).reports, 0);
  assert.equal(db.detail(a.events[0]).items.length, 2);
});

test('重复提交和派单重试，已修复后复发关联旧事件', () => {
  const db = new Store(':memory:');
  const a = submit(db, { ...well, requestId: 'request-1' });
  assert.deepEqual(submit(db, { ...well, requestId: 'request-1' }), a);
  assert.equal(db.detail(a.events[0]).items.length, 1);
  const first = db.dispatch(a.events[0], '市政');
  assert.deepEqual(db.dispatch(a.events[0], '市政'), first);
  db.closeEvent(a.events[0]);
  const b = submit(db, well);
  assert.notEqual(b.events[0], a.events[0]);
  assert.equal(db.detail(b.events[0]).previous, a.events[0]);
});

test('不同灯杆、相反方向、同一设施的不同故障独立建档', () => {
  const db = new Store(':memory:');
  for (const [location, asset, text] of [
    [east, 'L-023', '路灯不亮'],
    [east, 'L-024', '路灯不亮'],
    [west, 'L-023', '路灯不亮'],
    [east, 'L-023', '路灯杆倾斜'],
  ])
    submit(db, { location, asset, text });
  assert.equal(db.events().length, 4);
});

test('模糊位置须人工合并，可拆回独立事件并保留记录', () => {
  const db = new Store(':memory:');
  const a = submit(db, { location: '人民路', text: '路灯不亮' }).events[0];
  const b = submit(db, { location: '人民路', text: '路灯熄灭' }).events[0];
  assert.notEqual(a, b);
  assert.ok(db.detail(b).candidates.includes(a));
  db.merge(b, a);
  assert.equal(db.events().length, 1);
  const item = db.detail(a).items.find((i) => i.reportId === 2);
  const separate = db.split(a, item.id);
  assert.notEqual(separate, a);
  assert.equal(db.events().length, 2);
  assert.ok(db.detail(a).log.length >= 2);
});

test('多问题拆分、照片证据及未知类型复核', () => {
  const issues = parseClue(
    { text: '人民路路灯不亮，还有垃圾堆积' },
    { status: '图片文字识别', text: '' },
  );
  assert.equal(issues.length, 2);
  assert.equal(issues.find((i) => i.department === '市政').location, '人民路');
  assert.equal(issues.find((i) => i.department === '城管').location, '人民路');
  assert.equal(
    parseClue(
      { text: '请查看照片' },
      { text: '路灯不亮', status: '模型观察' },
    )[0].department,
    '市政',
  );
  assert.equal(
    parseClue({ text: '有些奇怪' }, { text: '' })[0].department,
    '待复核',
  );
});

test('视觉接口使用原始像素并保留模型来源', async () => {
  const evidence = await analyzePhoto(
    { bytes: Buffer.from('photo') },
    {
      model: 'test',
      url: 'http://localhost:11434',
      fetch: async (url, opts) => {
        assert.equal(new URL(url).pathname, '/api/chat');
        assert.deepEqual(JSON.parse(opts.body).messages.at(-1).images, [
          Buffer.from('photo').toString('base64'),
        ]);
        return Response.json({
          message: { content: JSON.stringify({ observation: '树枝断裂悬挂' }) },
        });
      },
    },
  );
  assert.equal(evidence.text, '树枝断裂悬挂');
  assert.match(evidence.status, /test/);
});
