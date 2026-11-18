import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Store } from '../store.mjs';
import { makeServer } from '../server.mjs';
import { FONT_STACK, patchCss, patchJs } from '../scripts/vendor-frontend.mjs';

async function start(t) {
  const server = makeServer(new Store(':memory:'), 'operator', async () => ({
    status: '无图片',
    text: '',
  }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  return 'http://127.0.0.1:' + server.address().port;
}

test('两个页面引用的本地脚本、样式和图标都能取到', async (t) => {
  const base = await start(t);
  for (const [page, file] of [
    ['/', 'index.html'],
    ['/admin', 'admin.html'],
  ]) {
    const res = await fetch(base + page);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /^text\/html/);
    // 页面不含内联脚本或样式，CSP 保持 'self'
    assert.match(res.headers.get('content-security-policy'), /script-src 'self';/);
    const html = await res.text();
    assert.equal(html, readFileSync(new URL('../public/' + file, import.meta.url), 'utf8'));
    assert.doesNotMatch(html, /<script>|<style|style="/);
    const refs = [...html.matchAll(/(?:src|href)="(\/[^"#]*)"/g)]
      .map((m) => m[1])
      .filter((r) => r !== '/' && r !== '/admin');
    assert.ok(refs.length >= 4);
    for (const ref of refs)
      assert.equal((await fetch(base + ref)).status, 200, page + ' 引用 ' + ref);
  }
  const css = await fetch(base + '/vendor/moj/moj-frontend.min.css');
  assert.match(css.headers.get('content-type'), /^text\/css/);
  for (const image of (await css.text()).matchAll(/url\((\/vendor\/[^)]+)\)/g)) {
    const res = await fetch(base + image[1]);
    assert.equal(res.status, 200, image[1]);
    assert.equal(res.headers.get('content-type'), 'image/svg+xml');
  }
  const js = await fetch(base + '/vendor/govuk/govuk-frontend.min.js');
  assert.match(js.headers.get('content-type'), /^text\/javascript/);
});

test('静态文件只提供白名单内的文件', async (t) => {
  const base = await start(t);
  for (const path of [
    '/vendor/README.md',
    '/vendor/../server.mjs',
    '/vendor/%2e%2e/server.mjs',
    '/vendor/govuk/',
    '/style.css',
    '/data/admin-key.txt',
  ])
    assert.equal((await fetch(base + path)).status, 404, path);
});

test('第三方样式去掉 GOV.UK 专用字体并改写图标路径', () => {
  const css =
    '@font-face{font-family:GDS Transport;src:url(/assets/fonts/bold.woff2)}' +
    'body{font-family:GDS Transport,arial,sans-serif}' +
    '.x{background:url(/assets/images/icon.svg)}' +
    '.govuk-footer__copyright-logo:before{background-image:url(/assets/images/govuk-crest.svg)}';
  assert.equal(
    patchCss(css, 'moj'),
    'body{font-family:' + FONT_STACK + '}' + '.x{background:url(/vendor/moj/images/icon.svg)}' +
      '.govuk-footer__copyright-logo:before{background-image:url(/vendor/moj/images/govuk-crest.svg)}',
  );
  assert.equal(
    patchCss(css, 'govuk').includes('background-image:none'),
    true,
  );
  assert.throws(() => patchCss('a{font-family:GDS Transport}', 'govuk'));
  assert.equal(patchJs('export{a};//# sourceMappingURL=a.js.map\n'), 'export{a};\n');
  for (const file of ['govuk/govuk-frontend.min.css', 'moj/moj-frontend.min.css']) {
    const vendored = readFileSync(new URL('../public/vendor/' + file, import.meta.url), 'utf8');
    assert.doesNotMatch(vendored, /GDS Transport|\/assets\//, file);
  }
});
