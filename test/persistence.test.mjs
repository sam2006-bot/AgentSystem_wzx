import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Store } from '../store.mjs';
import { parseClue } from '../agents.mjs';

test('跨日补充按实际提交时间入报，重启保留数据并补发一次日报', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'facility-db-'));
  const file = path.join(dir, 'db');
  let db = new Store(file);
  try {
    const clue = { text: '井盖缺失', asset: 'J-017', location: '人民路' };
    db.submit(clue, { text: '', status: '无图片' });
    db.submit(clue, { text: '', status: '无图片' });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    db.run('UPDATE reports SET time=? WHERE id=1', +today - 1);
    db.db.close();
    db = new Store(file);
    db.daily();
    db.daily();
    assert.equal(db.inbox().length, 1);
    assert.equal(db.inbox()[0].reports, 1);
    const b = db.brief(+today, Date.now() + 1);
    assert.equal(b.supplements, 1);
    assert.deepEqual(b.events[0].reportIds, [2]);
  } finally {
    db.db.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
test('图像单独上报保留模型的规范类别，文字上报不因图像弱候选多建事件', () => {
  const evidence = {
    status: '本地图像分类 · CLIP · 待核图',
    candidate: '照明设施倾斜',
    text: '图像候选问题为「照明设施倾斜」，待核实。',
  };
  assert.equal(parseClue({}, evidence)[0].type, '照明设施倾斜');
  const result = parseClue({ text: '垃圾堆积' }, evidence);
  assert.equal(result.length, 1);
  assert.equal(result[0].type, '垃圾堆积');
});
