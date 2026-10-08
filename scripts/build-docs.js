// 公開用フォルダ docs/ を作る（GitHub Pages は main ブランチの /docs を配信する）。
//   node scripts/build-docs.js
// アプリ本体（このフォルダ直下の index.html・style.css・js/・icons/ など）はそのまま。
// 公開するファイルだけを docs/ にコピーする。tests/・server.js・start.bat・scripts/ は配信しない。
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'docs');

// 公開するもの（ここにないファイルは配信されない）
const PUBLIC = [
  'index.html',
  'style.css',
  'manifest.webmanifest',
  'sw.js',
  '.nojekyll',
  'js',
  'icons',
];

function copy(src, dst) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const name of fs.readdirSync(src)) copy(path.join(src, name), path.join(dst, name));
  } else {
    fs.copyFileSync(src, dst);
  }
}

fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
for (const p of PUBLIC) copy(path.join(ROOT, p), path.join(OUT, p));

// 確認：sw.js が保存するファイルがすべて docs/ にあるか、配信しないファイルが混ざっていないか
const sw = fs.readFileSync(path.join(OUT, 'sw.js'), 'utf8');
const assets = [...sw.matchAll(/'\.\/([^']*)'/g)].map((m) => m[1]).filter(Boolean);
const missing = assets.filter((a) => !fs.existsSync(path.join(OUT, a)));
const list = [];
(function walk(d, rel) {
  for (const n of fs.readdirSync(d)) {
    const full = path.join(d, n);
    const r = rel ? `${rel}/${n}` : n;
    if (fs.statSync(full).isDirectory()) walk(full, r); else list.push(r);
  }
})(OUT, '');
const forbidden = list.filter((f) => /^(tests|scripts)\/|^server\.js$|^start\.bat$|^README\.md$/.test(f));
// index.html が読み込む js がすべて docs/ にあるか
const html = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
const refs = [...html.matchAll(/(?:src|href)="([^"#:]+)"/g)].map((m) => m[1]);
const brokenRefs = refs.filter((r) => !fs.existsSync(path.join(OUT, r)));

console.log(`docs/ に ${list.length} ファイル`);
list.forEach((f) => console.log('  ' + f));
if (missing.length || forbidden.length || brokenRefs.length) {
  if (missing.length) console.error('sw.js の ASSETS にあるのに docs/ にないファイル:', missing);
  if (forbidden.length) console.error('配信しないはずのファイルが入っている:', forbidden);
  if (brokenRefs.length) console.error('index.html から参照しているのに docs/ にないファイル:', brokenRefs);
  process.exit(1);
}
console.log('OK：sw.js の保存対象・index.html の参照はすべて docs/ にあり、開発用ファイルは含まれていません');
