import test from 'node:test';
import assert from 'node:assert/strict';
import { parseClue } from '../agents.mjs';

const parse = (text) =>
  parseClue({ text }, {}).map(({ type, location, department, urgency }) => ({
    type,
    location,
    department,
    urgency,
  }));

test('位置写在问题之后、口语化的丢失描述', () => {
  assert.deepEqual(parse('井盖丢了，位置在中山路88号门口'), [
    {
      type: '井盖缺失',
      location: '中山路88号门口',
      department: '市政',
      urgency: '紧急',
    },
  ]);
  assert.equal(parse('路灯不亮人民路3号门口')[0].location, '人民路3号门口');
  assert.equal(parse('人民东路３号门口路灯不亮')[0].location, '人民东路3号门口');
});

test('泛称道路不当作路名，地标可作为位置', () => {
  assert.equal(parse('我家附近道路破损严重')[0].location, '');
  assert.equal(parse('我家附近的中山路路面坑洼')[0].location, '中山路');
  assert.equal(parse('万达广场北门垃圾很多')[0].location, '万达广场北门');
  assert.equal(parse('人民公园东门贴满了小广告')[0].type, '违规广告张贴');
  assert.equal(parse('学校门口很黑，路灯坏了')[0].location, '');
});

test('参照物不单独建事件', () => {
  assert.deepEqual(
    parse('中山路路灯下有一堆垃圾').map((i) => i.type),
    ['垃圾堆积'],
  );
  assert.deepEqual(
    parse('人民路井盖旁边的路面破了').map((i) => i.type),
    ['道路破损'],
  );
  assert.equal(parse('人民路井盖边缘破损')[0].type, '井盖破损');
});

test('已修复和否定表述不建立故障', () => {
  const fixed = parseClue({ text: '中山路的路灯已经修好了，不用处理' }, {});
  assert.equal(fixed.length, 1);
  assert.equal(fixed[0].type, '待识别问题');
  assert.equal(fixed[0].location, '中山路');
  assert.match(fixed[0].reason, /已修复/);
  assert.equal(
    parse('人民路路灯不亮好几天了，昨天已经修好了')[0].type,
    '待识别问题',
  );
  assert.deepEqual(parse('中山路路灯修好了，但是人民路路灯还不亮'), [
    {
      type: '路灯故障',
      location: '人民路',
      department: '市政',
      urgency: '一般',
    },
  ]);
  assert.deepEqual(parse('不是井盖的问题，是中山路路面塌陷'), [
    {
      type: '道路破损',
      location: '中山路',
      department: '市政',
      urgency: '紧急',
    },
  ]);
  assert.deepEqual(
    parse('人民路下雨后没有积水，就是路灯不亮').map((i) => i.type),
    ['路灯故障'],
  );
});

test('催办和疑问不当作已修复', () => {
  for (const text of [
    '人民路路灯还没修好',
    '人民路路灯早就该修好了，还是不亮',
    '人民路路灯什么时候能修好',
    '人民路路灯修好了吗',
  ])
    assert.equal(parse(text)[0].type, '路灯故障', text);
});

test('口语化险情升为紧急，否定的伤情不升级', () => {
  assert.equal(
    parse('中山路井盖破了个大洞，小孩差点掉下去，太危险了')[0].urgency,
    '紧急',
  );
  assert.equal(parse('解放路积水很深，车都熄火了')[0].urgency, '紧急');
  assert.equal(
    parse('人民路路灯一闪一闪的，旁边裸露的电线很危险')[0].urgency,
    '紧急',
  );
  assert.equal(parse('人民路路灯不亮，幸好没人受伤')[0].urgency, '一般');
  assert.equal(parse('人民路路灯不亮，不太危险')[0].urgency, '一般');
});

test('新增问题类型与职责外事项', () => {
  assert.deepEqual(parse('中山路红绿灯坏了')[0], {
    type: '信号灯故障',
    location: '中山路',
    department: '待复核',
    urgency: '较急',
  });
  assert.match(
    parseClue({ text: '中山路红绿灯坏了' }, {})[0].route,
    /公安交管/,
  );
  assert.equal(parse('中山路护栏被撞倒了')[0].type, '交通设施损坏');
  assert.equal(parse('阳光小区3栋门口垃圾桶坏了')[0].type, '环卫设施损坏');
  assert.equal(parse('建设北路共享单车乱停')[0].type, '占道问题');
  assert.deepEqual(
    parse('人民路行道树倒了').map((i) => i.type),
    ['树木断枝或倾倒'],
  );
});
