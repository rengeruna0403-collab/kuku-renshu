// 開発確認用のテンポ計測（子ども画面には出さない。親画面の「開発用：テンポ計測」で見る）
// 1問ごとに performance.now() の時刻を記録する。学習記録とは別に保存し、テストモードでも記録する。
const Perf = (() => {
  const KEY = 'kuku-dev-timing';
  const MAX = 400;
  let list = [];
  try { list = JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch (e) { list = []; }
  let cur = null;

  const now = () => performance.now();
  const save = () => { try { sessionStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* noop */ } };

  return {
    // 問題の開始（読み上げ前）
    begin(info) {
      if (!Store.settings.devTools) { cur = null; return; }
      cur = { at: new Date().toISOString(), ...info, t0: now(), m: {} };
      list.push(cur);
      if (list.length > MAX) list.shift();
    },
    // 最初の1回だけ記録（ms、問題開始からの相対時刻）
    mark(name, extra) {
      if (!cur) return;
      if (cur.m[name] === undefined) cur.m[name] = Math.round(now() - cur.t0);
      if (extra) Object.assign(cur, extra);
      save();
    },
    // 絶対時刻（performance.now）を相対に直して記録
    markAt(name, t) {
      if (!cur || !t) return;
      if (cur.m[name] === undefined) cur.m[name] = Math.round(t - cur.t0);
      save();
    },
    set(extra) { if (cur) { Object.assign(cur, extra); save(); } },
    get list() { return list; },
    clear() { list = []; cur = null; save(); },
  };
})();

// 開発確認用：音声認識の生ログ（Chrome が実際に何を返したか）。
// 全イベント（start / audiostart / soundstart / speechstart / speechend / result / error / end）と、
// result の resultIndex・各 result の isFinal・全 alternative と confidence、判定時の正規化結果を残す。
// 子ども画面には出さない。学習記録とは別（タブを閉じると消える）
const RawLog = (() => {
  const KEY = 'kuku-dev-raw';
  const MAX = 3000;
  let list = [];
  try { list = JSON.parse(sessionStorage.getItem(KEY) || '[]'); } catch (e) { list = []; }
  let ctx = '';
  let timer = null;
  const save = () => {
    clearTimeout(timer);
    timer = setTimeout(() => { try { sessionStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* noop */ } }, 300);
  };
  return {
    setContext(label) { ctx = label; },
    get context() { return ctx; },
    add(type, data) {
      if (!Store.settings.devTools) return;
      list.push({ t: Math.round(performance.now()), clock: new Date().toISOString().slice(11, 23), ctx, type, ...(data || {}) });
      if (list.length > MAX) list.splice(0, list.length - MAX);
      save();
    },
    get list() { return list; },
    clear() { list = []; save(); },
  };
})();
