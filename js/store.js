// localStorage への記録
//   multiplication[段][かける数] … 問題ごとの累計（成長表示に使う）
//   sessions[]                   … 1回の練習ごとのイベント記録（親画面で確認・外部ヒントの付け外し）
// 旧形式（multiplication5 / log）は読み込み時に自動で移行し、移行前のデータは別キーに退避する。
// 動作テストモード中は、設定以外の記録を一切書き込まない。
const Store = (() => {
  const KEY = 'kuku-renshu-v1';          // キー名は旧版と共通（既存データをそのまま引き継ぐため）
  const BACKUP_KEY = 'kuku-renshu-v1-backup';
  const VERSION = 2;
  const MAX_TIMES = 10;
  const MAX_SESSIONS = 300;
  const SESSION_GAP_MS = 15 * 60 * 1000;  // これ以上あいたら別セッション

  const defaultSettings = () => ({
    voiceEnabled: true,
    soundEnabled: true,
    speechRate: 0.85,
    voiceName: '',      // 空 = 自動選択
    level: 2,           // 子どもが最後に選んだ練習レベル
    dan: 5,             // 子どもが最後に選んだ段
    testMode: false,    // 🧪 動作テストモード
    devTools: false,    // 🛠 開発用ツールの表示（OFF のときは開発用ログも残さない）
    micMode: 'A',       // 🛠 開発用：マイク受付方式の比較（A=読み上げ中から受付 / B=読み上げ後すぐ開始 / C=読み上げ後すぐ・テストと同じ単発設定）
  });

  const defaultProblem = () => ({
    attempts: 0,                 // 判定できた回答の回数（A/B/手動）
    correct: 0,
    correctWithoutHint: 0,
    correctWithHint: 0,          // アプリのヒントあり
    correctWithExternalHint: 0,  // おうちのひと等のヒントあり（親画面で後から付ける）
    manualCorrect: 0,            // 親の「○ いえた」
    recognitionErrors: 0,        // 聞き取れず（C）の回数
    lastPracticed: null,
    recentResponseTimes: [],     // 秒。新しいものが末尾
    noHintDays: [],              // ヒントなしで言えた日（YYYY-MM-DD）
    growthLevel: 0,              // 0🌱 1🌿 2🌷 3⭐
  });

  const dayOf = (iso) => {
    const t = new Date(iso);
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
  };
  const nowIso = () => new Date().toISOString();
  const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

  // 🏪 九九のおみせタウン の進行状況（お店ごとに独立）。暗唱練習の記録とは別。
  //   shops[段] = { deliveries：おとどけ回数（商品の解放に使う）, selected：選んでいる商品, history：最近のおとどけ, introSeen：紹介を見たか }
  //   ※ 将来の「ごちゃまぜやさん」は、deliveries > 0 のお店（＝遊んだ段）と全商品の解放状況から判定する想定
  const defaultShop = () => ({ deliveries: 0, selected: null, history: [], introSeen: false });

  // 旧形式：ごちそうやさん（5の段だけ・shop キー・料理 rice/onigiri/tamago/dango）→ ごはんやさん（shops["5"]）
  // おとどけ回数をそのまま引き継ぐので解放段階は変わらない。選んでいた料理は同じ段階の新しい料理へ。
  const OLD_FOOD_TO_GOHAN = { rice: 'rice', onigiri: 'furikake', tamago: 'takikomi', dango: 'curry' };
  function migrateShops(saved) {
    const shops = {};
    if (saved && saved.shops && typeof saved.shops === 'object') {
      Object.keys(saved.shops).forEach((k) => { shops[k] = { ...defaultShop(), ...saved.shops[k] }; });
    }
    if (saved && saved.shop && !shops['5']) {
      const old = saved.shop;
      shops['5'] = {
        ...defaultShop(),
        deliveries: old.deliveries || 0,
        selected: OLD_FOOD_TO_GOHAN[old.selected] || 'rice',
        history: (old.history || []).map((h) => ({ ...h, food: OLD_FOOD_TO_GOHAN[h.food] || h.food })),
        migratedFrom: 'gochisouya',
      };
    }
    return shops;
  }

  function emptyData(settings) {
    const multiplication = {};
    DANS.forEach((d) => {
      multiplication[d] = {};
      MULTIPLIERS.forEach((m) => { multiplication[d][m] = defaultProblem(); });
    });
    return { version: VERSION, settings: { ...defaultSettings(), ...settings }, multiplication, chain: {}, recitation: {}, recital: {}, shops: {}, sessions: [] };
  }

  // ---------- 旧形式（v1：multiplication5 + log）からの移行 ----------
  function migrateV1(saved) {
    const d = emptyData({ ...saved.settings, dan: 5 });
    Object.keys(saved).forEach((k) => {
      const m = k.match(/^multiplication(\d)$/);
      if (!m) return;
      Object.keys(saved[k] || {}).forEach((n) => {
        if (d.multiplication[m[1]] && d.multiplication[m[1]][n]) {
          d.multiplication[m[1]][n] = { ...defaultProblem(), ...saved[k][n] };
        }
      });
    });
    d.chain = { ...(saved.chain || {}) };
    d.recitation = { ...(saved.recitation || {}) };
    d.sessions = logToSessions(Array.isArray(saved.log) ? saved.log : []);
    return d;
  }

  // 旧ログ（1行1件）を、時間・モードのまとまりでセッションに変換する
  function logToSessions(log) {
    const sessions = [];
    let cur = null;
    log.forEach((l) => {
      const time = new Date(l.t).toISOString();
      const mode = l.mode || 'single';
      if (!cur || cur.mode !== mode || cur.level !== l.level || l.t - cur._last > SESSION_GAP_MS) {
        cur = { sessionId: 'legacy-' + l.t, startedAt: time, endedAt: time, dan: l.dan || 5, mode, level: l.level, legacy: true, events: [], _last: l.t };
        sessions.push(cur);
      }
      cur._last = l.t;
      cur.endedAt = time;
      const base = { time, multiplier: l.n };
      if (mode === 'recite') cur.events.push({ time, event: 'recite_done', hint: l.hint ? 'app' : 'none' });
      else if (l.result === 'correct' || l.result === 'manual') {
        const retries = countRetries(cur.events, l.n);
        cur.events.push({ ...base, event: 'correct', via: l.result === 'manual' ? 'parent' : 'voice', hint: l.hint ? 'app' : 'none', responseTime: typeof l.sec === 'number' ? Math.round(l.sec * 10) / 10 : null, retries });
      } else if (l.result === 'other') cur.events.push({ ...base, event: 'other_answer', transcript: l.heard || '' });
      else if (l.result === 'unheard') cur.events.push({ ...base, event: 'recognition_failed', transcript: l.heard || '' });
      else if (l.result === 'chain-clean' || l.result === 'chain-done') cur.events.push({ time, event: 'chain_complete', size: l.size });
      else if (l.result === 'chain-stop') cur.events.push({ time, event: 'chain_stop', size: l.size, count: l.count });
    });
    sessions.forEach((s) => delete s._last);
    return sessions;
  }

  // 直前の正解・別答えより後の「聞き取り直し」の回数
  function countRetries(events, multiplier) {
    let n = 0;
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i];
      if (e.multiplier !== multiplier) continue;
      if (e.event === 'correct' || e.event === 'other_answer') break;
      if (e.event === 'recognition_failed' || e.event === 'no_speech') n++;
    }
    return n;
  }

  function load() {
    let raw = null, saved = null;
    try { raw = localStorage.getItem(KEY); saved = JSON.parse(raw || 'null'); } catch (e) { saved = null; }
    if (!saved) return emptyData();
    if (!saved.version || saved.version < 2) {
      try { if (!localStorage.getItem(BACKUP_KEY)) localStorage.setItem(BACKUP_KEY, raw); } catch (e) { /* noop */ }
      const d = migrateV1(saved);
      persist(d);
      return d;
    }
    // v2：足りない段・項目を補う
    const d = emptyData(saved.settings);
    DANS.forEach((dan) => MULTIPLIERS.forEach((m) => {
      const p = saved.multiplication && saved.multiplication[dan] && saved.multiplication[dan][m];
      if (p) d.multiplication[dan][m] = { ...defaultProblem(), ...p };
    }));
    d.chain = saved.chain || {};
    d.recitation = saved.recitation || {};
    d.recital = saved.recital || {};
    d.shops = migrateShops(saved);
    d.sessions = Array.isArray(saved.sessions) ? saved.sessions : [];
    return d;
  }

  function persist(d) {
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { /* 保存できなくても練習は続ける */ }
  }

  let data = load();
  let current = null;   // 進行中のセッション

  const testing = () => !!data.settings.testMode;
  const save = () => persist(data);

  function problem(dan, m) { return data.multiplication[dan][m]; }

  function computeGrowth(p) {
    if (p.noHintDays.length >= 2) return 3;
    if (p.correctWithoutHint > 0) return 2;
    if (p.correct > 0) return 1;
    return 0;
  }

  // ---------- セッション ----------
  // 同じ段・モード・レベルで続けて練習している間は1つのセッションにまとめる
  // mode: 'single' | 'chain'（order: up/down/random）| 'recital'（本番暗唱。order: up/down）
  function beginSession({ dan, mode, level, order }) {
    if (testing()) { current = null; return; }
    const last = current && current.events.length ? Date.parse(current.endedAt) : current ? Date.parse(current.startedAt) : 0;
    if (current && current.dan === dan && current.mode === mode && current.level === level && current.order === order && Date.now() - last < SESSION_GAP_MS) return;
    endSession();
    current = { sessionId: newId(), startedAt: nowIso(), endedAt: nowIso(), dan, mode, level, order, events: [] };
  }

  function endSession() {
    if (!current) return;
    if (current.events.length) { current.endedAt = current.events[current.events.length - 1].time; save(); }
    current = null;
  }

  function addEvent(ev) {
    if (testing() || !current) return null;
    const e = { time: nowIso(), ...ev };
    if (!data.sessions.includes(current)) {
      data.sessions.push(current);
      if (data.sessions.length > MAX_SESSIONS) data.sessions.splice(0, data.sessions.length - MAX_SESSIONS);
    }
    current.events.push(e);
    current.endedAt = e.time;
    return e;
  }

  // ---------- 記録 ----------
  // 正解（音声 or 手動）。hint: 'none' | 'app'。戻り値：成長段階が上がったら新しい段階、それ以外は null
  function recordCorrect(dan, m, { hint, seconds, retries, manual }) {
    if (testing()) return null;
    const p = problem(dan, m);
    const before = p.growthLevel;
    p.attempts++;
    p.correct++;
    if (hint === 'app') p.correctWithHint++; else p.correctWithoutHint++;
    if (manual) p.manualCorrect++;
    p.lastPracticed = nowIso();
    const sec = typeof seconds === 'number' && !manual ? Math.round(seconds * 10) / 10 : null;
    if (sec !== null) {
      p.recentResponseTimes.push(sec);
      if (p.recentResponseTimes.length > MAX_TIMES) p.recentResponseTimes.shift();
    }
    const today = dayOf(nowIso());
    if (hint === 'none' && !p.noHintDays.includes(today)) {
      p.noHintDays.push(today);
      if (p.noHintDays.length > 10) p.noHintDays.shift();
    }
    p.growthLevel = Math.max(before, computeGrowth(p));
    addEvent({ multiplier: m, event: 'correct', via: manual ? 'parent' : 'voice', hint, responseTime: sec, retries: retries || 0 });
    save();
    return p.growthLevel > before ? p.growthLevel : null;
  }

  function recordOther(dan, m, { value, heard }) {
    if (testing()) return;
    const p = problem(dan, m);
    p.attempts++;
    p.lastPracticed = nowIso();
    addEvent({ multiplier: m, event: 'other_answer', value, transcript: heard || '' });
    save();
  }

  function recordUnheard(dan, m, { heard, reason }) {
    if (testing()) return;
    problem(dan, m).recognitionErrors++;
    addEvent({ multiplier: m, event: 'recognition_failed', transcript: heard || '', reason });
    save();
  }

  function recordSilence(dan, m) {
    if (testing()) return;
    addEvent({ multiplier: m, event: 'no_speech' });
    save();
  }

  function recordHint(dan, m, stage) {
    if (testing()) return;
    addEvent({ multiplier: m, event: 'hint', stage });
    save();
  }

  // 完走の記録。のぼりは従来どおり size、くだり・ばらばらは "9-down" / "9-random"
  function recordChain(dan, size, { completed, clean, count, order = 'up' }) {
    if (testing()) return;
    if (completed) {
      data.chain[dan] = data.chain[dan] || {};
      data.chain[dan][order === 'up' ? size : `${size}-${order}`] = true;
    }
    addEvent(completed ? { event: 'chain_complete', size, clean, order } : { event: 'chain_stop', size, count, order });
    save();
  }

  // ⭐ 本番暗唱の記録（認識の追跡結果・時間・再起動回数・transcript）。親が後から ○／△ を付けられる
  function recordRecital(dan, summary) {
    if (testing()) return;
    const r = data.recital[dan] || { count: 0, autoComplete: 0, last: null };
    if (summary.endedBy !== 'stopped') r.count++;
    if (summary.matched.length === MULTIPLIERS.length) r.autoComplete++;
    r.last = nowIso();
    data.recital[dan] = r;
    addEvent({ event: 'recital', ...summary });
    save();
  }

  // 親の判定：'full'（○ ぜんぶ言えていた）| 'helped'（△ 手助けあり）| null（未記録）。音声認識より優先する
  function setRecitalJudge(sessionId, index, value) {
    const s = data.sessions.find((x) => x.sessionId === sessionId);
    const e = s && s.events[index];
    if (!e || e.event !== 'recital') return false;
    e.parentJudge = value;
    save();
    return true;
  }

  function recordRecitation(dan, { hint }) {
    if (testing()) return;
    const r = data.recitation[dan] || { done: 0, withHint: 0, last: null };
    r.done++;
    if (hint) r.withHint++;
    r.last = nowIso();
    data.recitation[dan] = r;
    addEvent({ event: 'recite_done', hint: hint ? 'app' : 'none' });
    save();
  }

  // ---------- 親画面：外部ヒントの付け外し ----------
  // none ⇄ external のみ。成長・累計もあわせて直す（external は「ヒントなし成功」に数えない）
  function setExternalHint(sessionId, index, on) {
    const s = data.sessions.find((x) => x.sessionId === sessionId);
    const e = s && s.events[index];
    if (!e || e.event !== 'correct' || e.hint === 'app') return false;
    const to = on ? 'external' : 'none';
    if (e.hint === to) return true;
    const p = problem(s.dan, e.multiplier);
    const day = dayOf(e.time);
    if (on) {
      p.correctWithoutHint = Math.max(0, p.correctWithoutHint - 1);
      p.correctWithExternalHint++;
      e.hint = 'external';
      const stillNone = data.sessions.some((x) => x.dan === s.dan && x.events.some((y) =>
        y !== e && y.event === 'correct' && y.multiplier === e.multiplier && y.hint === 'none' && dayOf(y.time) === day));
      if (!stillNone) p.noHintDays = p.noHintDays.filter((d) => d !== day);
    } else {
      p.correctWithExternalHint = Math.max(0, p.correctWithExternalHint - 1);
      p.correctWithoutHint++;
      e.hint = 'none';
      if (!p.noHintDays.includes(day)) p.noHintDays.push(day);
    }
    p.growthLevel = computeGrowth(p);
    save();
    return true;
  }

  // ---------- 🏪 おみせ（お店ごと） ----------
  // テストモード中は端末に保存しない（その場かぎりのコピーで遊べる）
  let shopsTemp = null;
  const shopData = (dan) => {
    const key = String(dan);
    let shops;
    if (!testing()) { shopsTemp = null; shops = data.shops; } else {
      if (!shopsTemp) shopsTemp = JSON.parse(JSON.stringify(data.shops));
      shops = shopsTemp;
    }
    if (!shops[key]) shops[key] = defaultShop();
    return shops[key];
  };
  function setShop(dan, patch) {
    Object.assign(shopData(dan), patch);
    if (!testing()) save();
  }
  function recordShopDelivery(dan, entry) {
    const sh = shopData(dan);
    sh.deliveries++;
    sh.history.push({ time: nowIso(), ...entry });
    if (sh.history.length > 50) sh.history.splice(0, sh.history.length - 50);
    if (!testing()) save();
  }

  // 記録の書き出し（設定・成長・セッションをそのまま JSON に）
  function exportJSON() {
    return JSON.stringify({ app: 'kuku-renshu', exportedAt: nowIso(), data }, null, 1);
  }

  // 記録の読み込み：中身を確認してから保存し直す（旧形式でも load() が移行する）
  function importJSON(text) {
    let parsed;
    try { parsed = JSON.parse(text); } catch (e) { return { ok: false, reason: 'JSON として読めません' }; }
    const d = parsed && parsed.app === 'kuku-renshu' ? parsed.data : parsed;
    if (!d || typeof d !== 'object' || !(d.multiplication || d.multiplication5)) return { ok: false, reason: 'くく れんしゅう の記録ファイルではありません' };
    try { localStorage.setItem(KEY, JSON.stringify(d)); } catch (e) { return { ok: false, reason: '保存できませんでした' }; }
    current = null;
    data = load();
    return { ok: true, sessions: data.sessions.length };
  }

  function resetRecords() {
    current = null;
    data = emptyData(data.settings);
    save();
  }

  return {
    get data() { return data; },
    get settings() { return data.settings; },
    get testMode() { return testing(); },
    setSetting(k, v) { data.settings[k] = v; save(); },
    problem, beginSession, endSession, countRetries,
    recordCorrect, recordOther, recordUnheard, recordSilence, recordHint, recordChain, recordRecitation, recordRecital,
    setExternalHint, setRecitalJudge, exportJSON, importJSON,
    shopOf: shopData, setShop, recordShopDelivery, resetRecords, dayOf,
  };
})();
