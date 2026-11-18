import test from 'node:test';
import assert from 'node:assert/strict';
import { parseClue } from '../agents.mjs';
import { Store } from '../store.mjs';
const evidence = { text: '', status: '待人工核图' };
const photo = { mime: 'image/png', bytes: Buffer.from('same image') };
test('险情补充与位置参照物正确归入故障', () => {
  const result = parseClue({ text: '人民路路灯旁的井盖缺失，已经伤人' });
  assert.equal(result.length, 1);
  assert.match(result[0].reason, /已经伤人/);
  assert.equal(
    parseClue({ text: '人民路路灯不亮，正在漏电' })[0].urgency,
    '紧急',
  );
});
test('同一原图中的两个明确位置应各建事件', () => {
  const db = new Store(':memory:');
  const out = db.submit(
    { text: '南京路12号门口路灯不亮，人民路3号门口路灯不亮' },
    evidence,
    photo,
  );
  assert.equal(out.events.length, 2);
  db.submit({ text: '光明路17号门口路灯不亮' }, evidence, photo);
  assert.equal(db.events().length, 3);
});
test('照片待核进入简报、管理员可纠正图像单独上报的类型', () => {
  const db = new Store(':memory:');
  const a = db.submit({ text: '井盖缺失', location: '人民路' }, evidence, photo)
    .events[0];
  assert.equal(db.brief(0, Date.now() + 100).review, 1);
  const b = db.submit({}, evidence, photo).events[0];
  db.review(b, '园林', '人民路对面', '较急', '绿化养护');
  assert.equal(db.detail(b).type, '绿化养护');
  assert.equal(db.detail(b).items[0].type, '待识别问题');
  assert.equal(db.detail(a).photoReview, true);
});
test('同一路不同门牌即使重复使用照片也不能合并', () => {
  const db = new Store(':memory:');
  for (const n of [1, 2])
    db.submit(
      { text: '路灯不亮', location: '人民路' + n + '号门口' },
      evidence,
      photo,
    );
  assert.equal(db.events().length, 2);
});
