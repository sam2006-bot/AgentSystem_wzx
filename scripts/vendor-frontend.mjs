// 下载固定版本的 GOV.UK Frontend 和 MOJ Frontend 预编译文件，放到 public/vendor/。
// 运行时不需要 npm；只有升级这两个库时才在联网环境运行一次：
//   node scripts/vendor-frontend.mjs
//
// 处理内容：
// - 删除 GDS Transport 字体（仅限 GOV.UK 域名使用），改用中文字体栈
// - MOJ 样式中的图标路径改为 /vendor/moj/images/，只复制样式引用到的图标
// - 去掉 sourceMappingURL 注释（不分发 .map 文件）
import { execFileSync } from 'node:child_process';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const FONT_STACK =
  '"PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC","Source Han Sans SC",arial,sans-serif';

const packages = [
  {
    name: 'govuk',
    spec: 'govuk-frontend@6.6.0',
    root: 'dist/govuk',
    files: ['govuk-frontend.min.css', 'govuk-frontend.min.js'],
  },
  {
    name: 'moj',
    spec: '@ministryofjustice/frontend@12.0.1',
    root: 'moj',
    files: ['moj-frontend.min.css', 'moj-frontend.min.js'],
  },
];

export function patchCss(css, name) {
  let out = css
    .replace(/@font-face\{[^}]*GDS Transport[^}]*\}/g, '')
    .replaceAll('GDS Transport,arial,sans-serif', FONT_STACK)
    .replaceAll('url(/assets/images/', `url(/vendor/${name}/images/`);
  if (out.includes('GDS Transport')) throw Error(name + ' 样式中仍有 GDS Transport');
  // 页脚王冠版权标志只在 GOV.UK 页脚中使用，本项目不使用该组件
  out = out.replaceAll(
    'url(/vendor/govuk/images/govuk-crest.svg)',
    'none',
  );
  return out;
}

export function patchJs(js) {
  return js.replace(/\n?\/\/# sourceMappingURL=\S+\s*$/, '\n');
}

function main() {
  const project = fileURLToPath(new URL('..', import.meta.url));
  const vendor = path.join(project, 'public', 'vendor');
  const work = mkdtempSync(path.join(tmpdir(), 'vendor-frontend-'));
  try {
    for (const pkg of packages) {
      const dir = path.join(work, pkg.name);
      mkdirSync(dir);
      const tarball = execFileSync(
        'npm',
        ['pack', pkg.spec, '--silent', '--pack-destination', dir],
        { encoding: 'utf8', shell: process.platform === 'win32' },
      ).trim();
      execFileSync('tar', ['-xzf', path.join(dir, tarball), '-C', dir]);
      const src = path.join(dir, 'package', pkg.root);
      const dest = path.join(vendor, pkg.name);
      rmSync(dest, { recursive: true, force: true });
      mkdirSync(dest, { recursive: true });
      for (const file of pkg.files) {
        const text = readFileSync(path.join(src, file), 'utf8');
        const patched = file.endsWith('.css')
          ? patchCss(text, pkg.name)
          : patchJs(text);
        writeFileSync(path.join(dest, file), patched);
        if (!file.endsWith('.css')) continue;
        const images = [
          ...patched.matchAll(/url\(\/vendor\/[a-z]+\/images\/([\w.-]+)\)/g),
        ].map((m) => m[1]);
        if (images.length) mkdirSync(path.join(dest, 'images'), { recursive: true });
        for (const image of new Set(images))
          copyFileSync(
            path.join(src, 'assets', 'images', image),
            path.join(dest, 'images', image),
          );
      }
      console.log(pkg.spec, '→', path.relative(project, dest));
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  main();
