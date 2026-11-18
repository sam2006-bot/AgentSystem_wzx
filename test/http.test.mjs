import test from 'node:test';
import assert from 'node:assert/strict';
import { Store } from '../store.mjs';
import { makeServer } from '../server.mjs';

test('市民图文提交，证据受保护，管理员收件及并行派单防重', async (t) => {
  const db = new Store(':memory:');
  const server = makeServer(db, 'operator', async () => ({
    status: '待人工核图',
    text: '',
  }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = (route, data, key) =>
    fetch(base + route, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(key ? { Authorization: 'Bearer operator' } : {}),
      },
      body: JSON.stringify(data),
    });
  assert.equal((await fetch(base + '/api/state')).status, 401);
  const image =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aVA0AAAAASUVORK5CYII=';
  assert.equal(
    (await post('/api/reports', { image: 'data:image/png;base64,AAAA' }))
      .status,
    400,
  );
  const receipt = await (
    await post('/api/reports', {
      text: '井盖缺失',
      location: '人民路1号门口',
      image,
    })
  ).json();
  const id = receipt.events[0];
  assert.equal(
    (await fetch(base + '/api/photos/' + receipt.reportId)).status,
    401,
  );
  assert.equal(
    (
      await fetch(base + '/api/photos/' + receipt.reportId, {
        headers: { Authorization: 'Bearer operator' },
      })
    ).headers.get('content-type'),
    'image/png',
  );
  assert.equal(
    (
      await post(
        '/api/events/' + id + '/dispatch',
        { department: '市政' },
        true,
      )
    ).status,
    400,
  );
  assert.equal(
    (
      await post(
        '/api/events/' + id + '/review',
        { department: '市政', location: '人民路1号门口' },
        true,
      )
    ).status,
    200,
  );
  const orders = await Promise.all(
    [1, 2].map(async () =>
      (
        await post(
          '/api/events/' + id + '/dispatch',
          { department: '市政' },
          true,
        )
      ).json(),
    ),
  );
  assert.ok(orders[0].id);
  assert.equal(orders[0].id, orders[1].id);
  const brief = await (
    await post('/api/briefs', { start: 0, end: Date.now() + 1 }, true)
  ).json();
  assert.equal(brief.reports, 1);
  const state = await (
    await fetch(base + '/api/state', {
      headers: { Authorization: 'Bearer operator' },
    })
  ).json();
  assert.equal(state.inbox[0].id, brief.id);
});

test('上报接口校验定位和图片指纹', async (t) => {
  const db = new Store(':memory:');
  const server = makeServer(db, 'operator', async () => ({
    status: '无图片',
    text: '',
  }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const post = (data) =>
    fetch('http://127.0.0.1:' + server.address().port + '/api/reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: '人民路路灯不亮', ...data }),
    });
  assert.equal((await post({ geo: { lat: 'x', lng: 1 } })).status, 400);
  assert.equal((await post({ geo: { lat: 91, lng: 1 } })).status, 400);
  assert.equal((await post({ dhash: 'not-a-hash' })).status, 400);
  const ok = await post({
    geo: { lat: 30.27415, lng: 120.15515, accuracy: 12.4 },
    dhash: 'F0E1D2C3B4A59687',
  });
  assert.equal(ok.status, 201);
  const { events } = await ok.json();
  assert.deepEqual(db.detail(events[0]).items[0].geo, {
    lat: 30.27415,
    lng: 120.15515,
    accuracy: 12,
    source: '浏览器定位',
  });
});
