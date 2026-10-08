// ホーム画面アプリ用のサービスワーカー
// 方針：ネットワーク優先（つながっていれば常に最新を使う）。つながらないときだけ保存しておいた画面を出す。
// 音声認識はブラウザがインターネット経由で行うため、オフラインでは使えない（画面が開けるだけ）。
// ファイルを追加・改名したら ASSETS を直し、CACHE の番号を上げる。
const CACHE = 'kuku-renshu-v2';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './manifest.webmanifest',
  './js/data.js',
  './js/judge.js',
  './js/store.js',
  './js/perf.js',
  './js/env.js',
  './js/audio.js',
  './js/recital.js',
  './js/parent.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './icons/favicon-32.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match('./index.html'))),
  );
});
