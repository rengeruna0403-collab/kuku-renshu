// ローカル確認用の静的サーバー（依存なし）。公開には使わない（公開は GitHub Pages）。
//   node server.js                      → http://localhost:4610/
//   node server.js --base /kuku-renshu/ --port 4620 → http://localhost:4620/kuku-renshu/ （GitHub Pages のサブディレクトリと同じ形で確認）
//   node server.js --dir docs --base /kuku-renshu/ --port 4620 → 公開用フォルダ docs/ をそのまま確認
const http = require('http');
const fs = require('fs');
const path = require('path');

const portArg = process.argv.indexOf('--port');
const PORT = portArg > -1 ? +process.argv[portArg + 1] : process.env.PORT || 4610;
const dirArg = process.argv.indexOf('--dir');
const ROOT = dirArg > -1 ? path.resolve(__dirname, process.argv[dirArg + 1]) : __dirname;
const baseArg = process.argv.indexOf('--base');
const BASE = baseArg > -1 ? ('/' + process.argv[baseArg + 1].replace(/^\/+|\/+$/g, '') + '/').replace('//', '/') : '/';
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml',
};

http.createServer((req, res) => {
  let url = decodeURIComponent(req.url.split('?')[0]);
  if (BASE !== '/') {
    if (url === BASE.slice(0, -1)) { res.writeHead(301, { Location: BASE }); res.end(); return; }
    if (!url.startsWith(BASE)) { res.writeHead(404); res.end('not found'); return; }
    url = '/' + url.slice(BASE.length);
  }
  const file = path.normalize(path.join(ROOT, url.endsWith('/') ? url + 'index.html' : url));
  if (!file.startsWith(ROOT)) { res.writeHead(403); res.end(); return; }
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(buf);
  });
}).listen(PORT, () => console.log(`kuku: http://localhost:${PORT}${BASE}`));
