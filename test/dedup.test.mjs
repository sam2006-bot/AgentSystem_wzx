import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../store.mjs';
import { hamming } from '../agents.mjs';
import { readExifGps } from '../evidence.mjs';

const none = { status: '无图片', text: '' };
const pending = { status: '待人工核图', text: '' };
const corner = '人民路与建设路交叉口东侧';

// 构造一张只含 EXIF GPS 段的最小 JPEG
function jpegAt(lat, lng) {
  const t = Buffer.alloc(128);
  t.write('II', 0, 'latin1');
  t.writeUInt16LE(42, 2);
  t.writeUInt32LE(8, 4);
  t.writeUInt16LE(1, 8);
  t.writeUInt16LE(0x8825, 10);
  t.writeUInt16LE(4, 12);
  t.writeUInt32LE(1, 14);
  t.writeUInt32LE(26, 18);
  t.writeUInt16LE(4, 26);
  let o = 28;
  const entry = (tag, type, value) => {
    t.writeUInt16LE(tag, o);
    t.writeUInt16LE(type, o + 2);
    t.writeUInt32LE(type === 2 ? 2 : 3, o + 4);
    if (type === 2) t.write(value, o + 8, 'latin1');
    else t.writeUInt32LE(value, o + 8);
    o += 12;
  };
  entry(1, 2, lat < 0 ? 'S' : 'N');
  entry(2, 5, 80);
  entry(3, 2, lng < 0 ? 'W' : 'E');
  entry(4, 5, 104);
  const dms = (v, at) => {
    v = Math.abs(v);
    const d = Math.floor(v),
      m = Math.floor((v - d) * 60),
      s = Math.round(((v - d) * 60 - m) * 60 * 10000);
    [
      [d, 1],
      [m, 1],
      [s, 10000],
    ].forEach(([n, den], k) => {
      t.writeUInt32LE(n, at + 8 * k);
      t.writeUInt32LE(den, at + 8 * k + 4);
    });
  };
  dms(lat, 80);
  dms(lng, 104);
  const app1 = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), t]);
  const size = Buffer.alloc(2);
  size.writeUInt16BE(app1.length + 2);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8, 0xff, 0xe1]),
    size,
    app1,
    Buffer.from([0xff, 0xd9]),
  ]);
}

test('精确点位的文字一致即可自动合并，写法差异不影响', () => {
  const db = new Store(':memory:');
  const a = db.submit({ text: '井盖缺失', location: corner }, none).events[0];
  const b = db.submit({ text: '井盖不见了', location: corner }, none).events[0];
  const c = db.submit(
    { text: '这里井盖没了', location: '人民路建设路路口东边' },
    none,
  ).events[0];
  const d = db.submit({ text: '人民路和建设路的交叉口东侧井盖丢了' }, none)
    .events[0];
  assert.deepEqual([b, c, d], [a, a, a]);
  const e = db.detail(a);
  assert.equal(e.items.length, 4);
  assert.match(e.items[1].link.reasons.join(), /同一路口同一方位|精确点位/);
  assert.match(e.log.at(-2).action, /相似度 \d+%/);
});

test('只有道路相同时列为疑似，并给出相似度和依据', () => {
  const db = new Store(':memory:');
  const a = db.submit({ text: '人民路路灯不亮' }, none).events[0];
  const b = db.submit({ text: '路灯不亮', location: '人民路中段' }, none)
    .events[0];
  assert.notEqual(a, b);
  const [match] = db.detail(b).matches;
  assert.equal(match.id, a);
  assert.ok(match.score > 0 && match.score < 0.7);
  assert.ok(match.reasons.includes('同一道路'));
  assert.ok(match.reasons.some((r) => r.startsWith('间隔')));
});

test('重新压缩的同一张照片按感知哈希合并，不同照片不合并', () => {
  const db = new Store(':memory:');
  const photo = (s) => ({ mime: 'image/jpeg', bytes: Buffer.from(s) });
  const a = db.submit(
    { text: '路灯不亮', location: '人民路', dhash: 'f0e1d2c3b4a59687' },
    pending,
    photo('v1'),
  ).events[0];
  // 与第一张相差 2 位
  const b = db.submit(
    { text: '路灯熄灭', location: '人民路', dhash: 'f0e1d2c3b4a59684' },
    pending,
    photo('v1-recompressed'),
  ).events[0];
  assert.equal(hamming('f0e1d2c3b4a59687', 'f0e1d2c3b4a59684'), 2);
  assert.equal(b, a);
  assert.match(db.detail(a).items[1].link.reasons.join(), /照片高度相似/);
  const c = db.submit(
    { text: '路灯不亮', location: '人民路', dhash: '0f1e2d3c4b5a6978' },
    pending,
    photo('other'),
  ).events[0];
  assert.notEqual(c, a);
  // 门牌不同的硬性否决不会被相似照片推翻
  const d = db.submit(
    { text: '路灯不亮', location: '人民路9号门口', dhash: 'f0e1d2c3b4a59687' },
    pending,
    photo('v1-again'),
  ).events[0];
  const e = db.submit(
    { text: '路灯不亮', location: '人民路10号门口', dhash: 'f0e1d2c3b4a59687' },
    pending,
    photo('v1-third'),
  ).events[0];
  assert.notEqual(e, d);
});

test('照片 EXIF 坐标：相距 10 米自动合并，相距 2 公里不合并', () => {
  assert.deepEqual(
    readExifGps(jpegAt(30.27415, 120.15515)).source,
    '照片 EXIF',
  );
  assert.ok(
    Math.abs(readExifGps(jpegAt(-33.8688, 151.2093)).lat + 33.8688) < 1e-5,
  );
  assert.equal(readExifGps(Buffer.from('ffd8ffd9', 'hex')), null);
  const db = new Store(':memory:');
  const shot = (lat, lng) => ({ mime: 'image/jpeg', bytes: jpegAt(lat, lng) });
  const a = db.submit({ text: '井盖缺失' }, pending, shot(30.27415, 120.15515))
    .events[0];
  const b = db.submit({ text: '井盖不见了' }, pending, shot(30.27424, 120.15515))
    .events[0];
  assert.equal(b, a);
  assert.match(db.detail(a).items[1].link.reasons.join(), /坐标相距 10 米/);
  assert.equal(db.detail(a).items[1].geo.source, '照片 EXIF');
  const c = db.submit({ text: '井盖缺失' }, pending, shot(30.29215, 120.15515))
    .events[0];
  assert.notEqual(c, a);
  assert.deepEqual(db.detail(c).candidates, []);
});

test('文字一致但坐标矛盾时只列为疑似，由人工判断', () => {
  const db = new Store(':memory:');
  const here = { lat: 30.27415, lng: 120.15515, accuracy: 15 };
  const far = { lat: 30.29215, lng: 120.15515, accuracy: 15 };
  const a = db.submit(
    { text: '井盖缺失', location: '中山路88号门口', geo: here },
    none,
  ).events[0];
  const b = db.submit(
    { text: '井盖缺失', location: '中山路88号门口', geo: far },
    none,
  ).events[0];
  assert.notEqual(b, a);
  const [match] = db.detail(b).matches;
  assert.equal(match.id, a);
  assert.ok(match.reasons.some((r) => /需核实：坐标相距 \d+ 米/.test(r)));
  // 同一设施编号仍以编号为准，并优先于坐标吻合的其他事件
  const c = db.submit(
    { text: '井盖缺失', location: '中山路', asset: 'J-001', geo: here },
    none,
  ).events[0];
  const d = db.submit(
    { text: '井盖缺失', location: '中山路', asset: 'J-001', geo: far },
    none,
  ).events[0];
  assert.equal(d, c);
  assert.equal(db.detail(c).asset, 'J-001');
});

test('一条上报含多个位置时不使用坐标，旧格式的候选仍可读取', () => {
  const db = new Store(':memory:');
  const geo = { lat: 30.27415, lng: 120.15515, accuracy: 10 };
  const out = db.submit(
    { text: '南京路12号门口路灯不亮，人民路3号门口垃圾很多', geo },
    none,
  );
  assert.equal(out.events.length, 2);
  assert.ok(db.detail(out.events[0]).items.every((i) => i.geo === null));
  const a = db.submit({ text: '路灯不亮', location: '光明路' }, none).events[0];
  const b = db.submit({ text: '路灯熄灭', location: '光明路' }, none).events[0];
  db.run('UPDATE events SET candidates=? WHERE id=?', JSON.stringify([a]), b);
  assert.deepEqual(db.detail(b).candidates, [a]);
  assert.equal(db.detail(b).matches[0].score, null);
});
