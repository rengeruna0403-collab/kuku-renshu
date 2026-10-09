// 画面制御
let DAN = DANS.includes(+Store.settings.dan) ? +Store.settings.dan : 5;
const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- 画面切り替え ----------
function show(screen) {
  document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === 'screen-' + screen));
  $('test-badge').hidden = !Store.testMode || screen === 'parent';
  window.scrollTo(0, 0);
}

function goTop() {
  stopPlay();
  Store.endSession();
  renderDanPicker();
  show('top');
}

// ---------- トップ：段えらび → その段のメニューへ ----------
function renderDanPicker() {
  const box = $('dan-picker');
  box.innerHTML = '';
  DANS.forEach((d) => {
    const b = document.createElement('button');
    b.className = 'dan' + (d === DAN ? ' on' : '');
    b.innerHTML = `<b>${d}</b>のだん`;
    b.onclick = () => { DAN = d; Store.setSetting('dan', d); openMenu(); };
    box.appendChild(b);
  });
}

function setDanTitles() {
  document.querySelectorAll('.dan-title').forEach((el) => { el.textContent = `${DAN}のだん`; });
}

// ---------- レベル選択（1もんずつ / じゅんばん / ばらばら 共通） ----------
function renderLevelPickers() {
  document.querySelectorAll('.level-picker').forEach((box) => {
    box.innerHTML = '';
    Object.keys(LEVELS).forEach((lv) => {
      const b = document.createElement('button');
      b.className = 'chip' + (+lv === Store.settings.level ? ' on' : '');
      b.textContent = LEVELS[lv].name;
      b.onclick = () => { Store.setSetting('level', +lv); renderLevelPickers(); };
      box.appendChild(b);
    });
  });
}

// ---------- 段のメニュー（4つのモード） ----------
//   🔵 1もんずつ            … 問題をえらんで1問ずつ
//   🟢 じゅんばんに 9もん   … アプリが1問ずつ読み上げ、のぼり／くだりの順に9問（支援ありの連続練習）
//   🟣 ばらばら 9もん       … ×1〜×9 を毎回シャッフルして1回ずつ
//   ⭐ みないで いえるかな？ … 本番暗唱。アプリは読み上げず、子どもが自分で最初から最後まで（recital.js）
function openMenu() {
  stopPlay();
  const done = Store.data.chain[DAN] || {};
  $('mark-seq').hidden = !(done[CHAIN_MAIN] || done[`${CHAIN_MAIN}-down`]);
  $('mark-random').hidden = !done[`${CHAIN_MAIN}-random`];
  const box = $('chain-short');
  box.hidden = true;   // ちょっとだけ は開くたびに閉じた状態から
  box.innerHTML = '';
  CHAIN_SHORT.forEach((size) => {
    const b = document.createElement('button');
    b.className = 'step';
    b.innerHTML = `<span class="step-n">${size}もん</span><span class="step-r">${DAN}×1 〜 ${DAN}×${size}</span>${done[size] ? '<span class="step-mark">✨</span>' : ''}`;
    b.onclick = () => startPlay('chain', range(size), { order: 'up' });
    box.appendChild(b);
  });
  setDanTitles();
  renderLevelPickers();
  show('menu');
  prewarmMic();
}

// ---------- のぼり／くだり えらび ----------
let dirContext = 'seq';   // 'seq'（じゅんばんに 9もん）| 'recital'（みないで いえるかな？）
function openDir(context) {
  dirContext = context;
  $('dir-context').textContent = context === 'recital' ? 'みないで いえるかな？' : 'じゅんばんに 9もん';
  setDanTitles();
  show('dir');
  prewarmMic();
}

function onDir(order) {
  if (dirContext === 'recital') Recital.open(order);
  else startPlay('chain', orderedList(order), { order });
}

// ---------- 1もんずつ：問題えらび ----------
function openSelect() {
  const grid = $('select-grid');
  grid.innerHTML = '';
  MULTIPLIERS.forEach((n) => {
    const p = Store.problem(DAN, n);
    const b = document.createElement('button');
    b.className = 'pick';
    b.innerHTML = `<span class="pick-q">${DAN}×${n}</span><span class="pick-g">${GROWTH_ICONS[p.growthLevel]}</span>`;
    b.onclick = () => startPlay('single', [n]);
    grid.appendChild(b);
  });
  setDanTitles();
  renderLevelPickers();
  show('select');
  prewarmMic();
}

// 🛠 開発用：マイク受付方式の比較（おうちのひと →「開発用：マイク受付方式」）
//   A … 読み上げ中から受付（continuous + interim、練習中1つの認識を使い回す）＝通常
//   B … 読み上げ中は止め、読み上げ終了直後に新しい認識を開始（continuous + interim）
//   C … B と同じタイミングで、「音声認識テスト」と同じ単発設定（continuous=false, interim=false）
const MIC_MODES = {
  A: { continuous: true, interimResults: true, overlap: true },
  B: { continuous: true, interimResults: true, overlap: false },
  C: { continuous: false, interimResults: false, overlap: false },
};
const micMode = () => (MIC_MODES[Store.settings.micMode] ? Store.settings.micMode : 'A');

// 練習画面に入る前からマイクを開いておく（最初の1問の受付開始待ちをなくす）。この間の結果は使わない
function prewarmMic() {
  if (!Mic.supported) return;
  P.phase = 'idle';
  const m = MIC_MODES[micMode()];
  Mic.configure({ continuous: m.continuous, interimResults: m.interimResults });
  if (m.overlap) Mic.start();
}

function range(k) { return Array.from({ length: k }, (_, i) => i + 1); }

// のぼり ×1→×9 ／ くだり ×9→×1
function orderedList(order) { return order === 'down' ? range(CHAIN_MAIN).reverse() : range(CHAIN_MAIN); }

// ばらばら：Fisher-Yates で毎回シャッフル（重複なし）
function shuffled(list) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- 練習本体 ----------
// テンポの方針：アプリが子どもの発話テンポに合わせる。
//   ・マイクは練習中ずっと開いておく（Mic）。読み上げ中も受付を止めない。
//   ・読み上げ中に始まった音声区間は「自分の読み上げの聞こえ」かもしれないので、
//     はっきり正解（問題の後ろに答えが続いている等）のときだけ採用し、それ以外は黙って捨てる。
//   ・答えを含む読み上げ（みながら・こたえをみる・正解後の復唱）のあとは Mic.flush() で中身を捨てる。
//   ・つづけてモードは正解音を待たずにすぐ次の問題へ。
const CHAIN_ADVANCE_MS = 300;   // つづけて：正解 → 次の問題の読み上げ開始
const ECHO_EDGE_MS = 250;       // 読み上げ終了からこの時間内に始まった音声区間も「読み上げ中」扱い
const OTHER_PAUSE = { chain: 650, single: 900 };  // 別の答え → 問題を読み直すまで

const P = {
  mode: 'single', level: 2, list: [], idx: 0,
  order: 'up',        // じゅんばん：'up'（のぼり）| 'down'（くだり）| ばらばら：'random'
  run: 0,             // 非同期処理の世代。画面を離れたり次へ進むと増える
  phase: 'idle',      // idle | speaking（問題を読み上げ中）| listening | paused（マイク停止中）| locked（判定しない）
  ttsEndAt: 0, qStartAt: 0, lastCorrectAt: 0, answerSpoken: false,
  hintStage: 0, hintUsed: false,
  qTime: 0, silence: 0, retries: 0, unclear: 0,
  done: 0, clean: true, micBroken: false, answered: false,
};

const entryNow = () => kukuEntry(DAN, P.list[P.idx]);

function startPlay(mode, list, { order = 'up' } = {}) {
  P.mode = mode;
  P.order = mode === 'chain' ? order : 'up';
  P.level = Store.settings.level;
  P.list = list;
  P.idx = 0;
  P.done = 0;
  P.clean = true;
  P.micBroken = !Mic.supported;
  P.lastCorrectAt = 0;
  Store.beginSession({ dan: DAN, mode, level: P.level, order: P.order });
  $('play-dots').style.visibility = mode === 'chain' ? 'visible' : 'hidden';
  $('btn-play-back').textContent = mode === 'chain' ? 'おしまい' : '← もどる';
  $('play-dots').classList.toggle('numbered', mode === 'chain' && P.order !== 'random');
  show('play');
  resetProblem();
  ask();
}

function resetProblem() {
  P.hintStage = 0;
  P.hintUsed = false;
  P.silence = 0;
  P.unclear = 0;
  P.answered = false;
  setSub('');
  nudgeCantHear(false);
  renderDots();
}

function stopPlay() {
  P.run++;
  P.phase = 'idle';
  Mic.stop();
  Listener.stop();
  Voice.cancel();
  closeRescue();
}

function renderDots() {
  const box = $('play-dots');
  if (P.mode !== 'chain') { box.innerHTML = ''; return; }
  box.innerHTML = P.list.map((_, i) => {
    const cls = i < P.done ? 'dot done' : i === P.idx ? 'dot now' : 'dot';
    // のぼり／くだりは、どの問題か分かるように番号を入れる（ばらばらは次が分からないように入れない）
    return `<span class="${cls}">${P.order !== 'random' ? P.list[i] : ''}</span>`;
  }).join('');
}

function setMsg(text, tone = '') {
  const el = $('play-msg');
  el.textContent = text;
  el.className = 'play-msg' + (tone ? ' ' + tone : '');
}
function setSub(text) { $('play-sub').textContent = text; }

function setMic(state) {
  // state: 'off' | 'on' | 'tap'
  const el = $('play-mic');
  el.className = 'mic ' + state;
  el.hidden = state === 'off' || P.micBroken;
  $('play-mic-label').textContent = state === 'tap' ? 'おして はなしてね' : '';
}

// 🎤と「いってみよう」は、実際に受付中（onstart 済み）になってから出す
function refreshMicUi() {
  if (P.phase !== 'listening') return;
  if (Mic.live) {
    setMic('on');
    if (!$('play-msg').textContent || $('play-msg').textContent === '🔊 きいてね') {
      setMsg(P.level === 1 ? 'まねして いってみよう♪' : 'いってみよう');
    }
  }
}

// 同じ問題で聞き取れないことが続いたら「うまくきこえない」を押しやすくする
function nudgeCantHear(on) { $('btn-cant-hear').classList.toggle('nudge', on); }

function renderQuestion({ reveal = false } = {}) {
  const e = entryNow();
  const showAnswer = reveal || P.level === 1;
  const audioOnly = P.level === 3 && !reveal;
  $('play-label').textContent = audioOnly ? `${DAN}のだん` : '';
  $('play-label').hidden = !audioOnly;
  // 音声OFFで「おとだけ」は問題が分からないので、小さく表示する
  const q = $('play-q');
  q.hidden = audioOnly && Store.settings.voiceEnabled;
  q.classList.toggle('small', audioOnly);
  q.innerHTML = `${e.dan}<span class="op">×</span>${e.multiplier}<span class="op">＝</span>${showAnswer ? `<span class="ans">${e.answer}</span>` : '<span class="qm">？</span>'}`;
  $('play-reading').textContent = showAnswer ? e.fullText : '';
  $('btn-hint').hidden = P.level === 1 || reveal || P.answered;
  $('btn-replay').hidden = reveal || P.answered;
  $('btn-cant-hear').hidden = reveal || P.answered;
}

async function ask() {
  const id = ++P.run;
  closeRescue();
  $('hint-box').hidden = true;
  $('after-box').hidden = true;
  $('solo-box').hidden = true;
  P.hintStage = 0;
  renderQuestion();
  setMsg(P.level === 3 ? '🔊 きいてね' : '');
  setMic('off');
  const e = entryNow();
  P.qStartAt = performance.now();
  const mm = micMode();
  Perf.begin({
    q: `${e.dan}×${e.multiplier}`, mode: P.mode, order: P.order, level: P.level, micMode: mm, judges: [],
    fromPrevCorrect: P.lastCorrectAt ? Math.round(P.qStartAt - P.lastCorrectAt) : null,
    liveAtAsk: Mic.live,
  });
  P.lastCorrectAt = 0;
  RawLog.setContext(`[${mm}] ${P.mode}${P.mode === 'chain' ? '-' + P.order : ''} ${e.dan}×${e.multiplier}`);
  RawLog.add('question', { answer: e.answer, accepted: e.acceptedReadings, level: P.level, micMode: mm, micConfig: Mic.config });
  P.ttsEndAt = 0;
  P.silence = 0;
  P.retries = 0;

  // マイク：
  //   A（通常）… 読み上げの前から開いておく。レベル1は答えまで読むので、読み終わるまで閉じる
  //   B / C   … 読み上げ中は閉じ、読み上げ終了直後に新しい認識を開始する（待ち時間は入れない）
  const overlap = MIC_MODES[mm].overlap && P.level !== 1;
  if (!P.micBroken) {
    Mic.configure({ continuous: MIC_MODES[mm].continuous, interimResults: MIC_MODES[mm].interimResults });
    if (!overlap) Mic.stop();
    else if (P.answerSpoken) Mic.flush();
    else Mic.start();
  }
  P.answerSpoken = P.level === 1;
  // まだ受付が始まっていなければ（その日の最初の1問など）、読み上げを少しだけ待つ（A のみ）
  if (!P.micBroken && overlap && !Mic.live) {
    await Mic.whenLive(1500);
    if (id !== P.run) return;
    Perf.mark('waitedForMic');
  }
  P.phase = P.level === 1 ? 'locked' : 'speaking';

  const how = await Voice.speak(P.level === 1 ? e.fullTtsText : e.ttsText, { onStart: () => Perf.mark('ttsStart') });
  if (id !== P.run) return;
  P.ttsEndAt = performance.now();
  P.qTime = P.ttsEndAt;
  Perf.mark('ttsEnd', { ttsHow: how, liveAtTtsEnd: Mic.live });
  if (!overlap && !P.micBroken) { Mic.flush(); P.answerSpoken = false; }   // 読み上げ終了 → 即開始
  P.phase = 'listening';
  if (P.micBroken) {
    setMsg(P.level === 1 ? 'まねして いってみよう♪' : 'いってみよう');
    openRescue(true);
    return;
  }
  if (!Mic.wanted) Mic.start();
  refreshMicUi();
}

// ---------- マイクからのイベント ----------
function onMicLive() {
  Perf.markAt('startCall', Mic.lastStartCall >= P.qStartAt ? Mic.lastStartCall : 0);
  Perf.markAt('onstart', Mic.lastOnstart >= P.qStartAt ? Mic.lastOnstart : 0);
  refreshMicUi();
}

// 確定した認識結果。segStart = その音声区間を最初に検知した時刻
function onMicFinal(alts, segStart) {
  Perf.mark('final', { heard: alts[0] && alts[0].transcript });
  if (P.phase !== 'speaking' && P.phase !== 'listening') return;
  const e = entryNow();
  const r = Judge.judge(alts, e);
  // 読み上げ中（または直前の問題）から始まった音声区間か
  const fromTts = P.phase === 'speaking' || !P.ttsEndAt || segStart < P.ttsEndAt + ECHO_EDGE_MS;
  const cur = Perf.list[Perf.list.length - 1];
  if (cur && cur.judges) cur.judges.push({ kind: r.kind, reason: r.reason || null, heard: alts[0] && alts[0].transcript, fromTts, afterTtsMs: P.ttsEndAt ? Math.round(performance.now() - P.ttsEndAt) : null });
  RawLog.add('judge', { kind: r.kind, reason: r.reason || null, via: r.via || null, value: r.value ?? null, fromTts, altCount: alts.length, candidates: Judge.explain(alts, e) });
  if (fromTts) {
    // 自分の読み上げを拾った可能性がある区間：問題の読みと重なる数（段・かける数）は信用しない
    const echoNums = [e.dan, e.multiplier];
    const viaPrompt = alts.some((a) => Judge.hasPromptPrefix(a.transcript, e));
    const suspicious =
      r.kind === 'C' ||
      (r.kind === 'B' && echoNums.includes(r.value)) ||
      (r.kind === 'A' && echoNums.includes(e.answer) && !viaPrompt);
    if (suspicious) {
      const last = Perf.list[Perf.list.length - 1];
      if (last) Perf.set({ echoIgnored: (last.echoIgnored || 0) + 1 });
      return;
    }
  }
  Perf.set({ kind: r.kind });
  if (r.kind === 'A') onCorrect(false);
  else if (r.kind === 'B') onOther(r);
  else onUnclear(r);
}

function onMicSpeechStart() { Perf.mark('speechstart'); }
// 発話検知の時刻は、読み上げ後に始まった区間（＝子どもの声）だけ記録する
function onMicInterim(text, segStart) {
  if (P.ttsEndAt && segStart >= P.ttsEndAt + ECHO_EDGE_MS) Perf.mark('interim');
}

// 無音で認識が切れた：1回目は静かに開き直す（Mic が自動で再開）。2回続いたらマイクを止めて「おして はなしてね」
function onSilence() {
  if (P.phase !== 'listening') return;
  const e = entryNow();
  Store.recordSilence(e.dan, e.multiplier);
  P.silence++;
  P.retries++;
  if (P.silence < 2) return;
  P.unclear++;
  Mic.stop();
  P.phase = 'paused';
  setMsg('もういっかい きかせて♪', 'soft');
  setMic('tap');
  if (P.unclear >= 2) nudgeCantHear(true);
}

function resumeListening() {
  P.silence = 0;
  P.phase = 'listening';
  setMic('off');
  Mic.start();
  refreshMicUi();
}

// 何か聞こえたが判定できない：不正解にしない。効果音なし。マイクは開いたまま
function onUnclear(r) {
  const e = entryNow();
  Store.recordUnheard(e.dan, e.multiplier, { heard: r.heard, reason: r.reason });
  setMsg('もういっかい きかせて♪', 'soft');
  P.silence = 0;
  P.retries++;
  P.unclear++;
  if (P.unclear >= 2) nudgeCantHear(true);
}

// 明確に別の答え：軽い「プッ♪」→ もういっかい♪ → 同じ問題をもう一度読む
async function onOther(r) {
  const e = entryNow();
  Store.recordOther(e.dan, e.multiplier, { value: r.value, heard: r.heard });
  P.clean = false;
  P.unclear = 0;
  P.phase = 'locked';
  const id = ++P.run;
  setMic('off');
  Sound.pu();
  setMsg('もういっかい♪', 'soft');
  if (P.mode === 'chain' && P.done > 0) setSub(`${P.done}こ つづけて できたね！`);
  await wait(OTHER_PAUSE[P.mode] || 900);
  if (id !== P.run) return;
  ask();
}

function onMicUnavailable(code) {
  P.micBroken = true;
  P.phase = 'paused';
  setMic('off');
  setMsg(P.level === 1 ? 'まねして いってみよう♪' : 'いってみよう');
  openRescue(true, code);
}

async function onCorrect(manual) {
  const id = ++P.run;
  P.phase = 'locked';
  closeRescue();
  nudgeCantHear(false);
  const e = entryNow();
  const now = performance.now();
  // 読み上げ中に答えた場合は 0 秒
  const seconds = P.ttsEndAt ? Math.max(0, (now - P.qTime) / 1000) : 0;
  const hint = P.hintUsed || P.level === 1 ? 'app' : 'none';
  P.answered = true;
  const grew = Store.recordCorrect(e.dan, e.multiplier, { hint, seconds, retries: P.retries, manual });
  if (hint !== 'none') P.clean = false;

  Sound.pinpon();   // 鳴り終わりは待たない
  $('hint-box').hidden = true;
  $('solo-box').hidden = true;
  renderQuestion({ reveal: true });
  setMsg('できた！✨', 'good');
  setMic('off');

  if (P.mode === 'single') {
    setSub(grew !== null ? `${GROWTH_ICONS[grew]} に なったよ` : '');
    $('after-next').hidden = !MULTIPLIERS.includes(e.multiplier + 1);
    $('after-box').hidden = false;
    // 1もんずつは余韻あり：答えを読み上げる（このあとマイクの中身は捨てる）
    P.answerSpoken = true;
    await wait(700);
    if (id !== P.run) return;
    Voice.speak(e.fullTtsText);
    return;
  }

  // つづけて：マイクは開いたまま、すぐ次の問題へ
  P.done++;
  renderDots();
  P.lastCorrectAt = now;
  await wait(CHAIN_ADVANCE_MS);
  if (id !== P.run) return;
  P.idx++;
  if (P.idx >= P.list.length) { finishChain(true); return; }
  resetProblem();
  ask();
}

// ---------- ヒント ----------
function hintClue(n) {
  const a = (k) => DAN * k;
  // くだりは上から下がってくる手がかり（×8・×9 は上に2つないので、のぼりと同じ形）
  if (P.order === 'down' && n <= 7) return `${a(n + 2)} → ${a(n + 1)} → ？`;
  if (n === 1) return `？ → ${a(2)} → ${a(3)}`;
  if (n === 2) return `${a(1)} → ？`;
  return `${a(n - 2)} → ${a(n - 1)} → ？`;
}

function onHint() {
  const e = entryNow();
  P.hintUsed = true;
  P.hintStage = 1;
  Store.recordHint(e.dan, e.multiplier, 'clue');
  $('hint-clue').textContent = hintClue(e.multiplier);
  $('hint-note').textContent = P.order === 'down' && e.multiplier <= 7 ? `${DAN}ずつ へるよ` : `${DAN}ずつ ふえるよ`;
  $('hint-box').hidden = false;
  $('btn-hint').hidden = true;
  if (P.mode === 'chain' && P.done > 0) setSub(`${P.done}こ つづけて できたね！`);
  // マイクはそのまま。思い出したらいつでも答えてよい
  if (P.phase === 'paused' && !P.micBroken) resumeListening();
}

async function onRevealAnswer() {
  const id = ++P.run;
  P.phase = 'locked';
  P.answerSpoken = true;
  P.hintUsed = true;
  P.hintStage = 2;
  $('hint-box').hidden = true;
  setMic('off');
  const e = entryNow();
  Store.recordHint(e.dan, e.multiplier, 'answer');
  renderQuestion({ reveal: true });
  setMsg('');
  await Voice.speak(e.fullTtsText);
  if (id !== P.run) return;
  setMsg('いっしょに いってみよう♪', 'good');
  await wait(500);
  if (id !== P.run) return;
  await Voice.speak(e.fullTtsText);
  if (id !== P.run) return;
  await wait(400);
  if (id !== P.run) return;
  setMsg('');
  $('solo-box').hidden = false;
}

function onSolo() {
  $('solo-box').hidden = true;
  ask();
}

// ---------- マイクの救済（おうちのひとが判定） ----------
function openRescue(auto = false, code = '') {
  Mic.stop();
  if (P.phase === 'listening' || P.phase === 'speaking') P.phase = 'paused';
  setMic('off');
  const reason = {
    'not-allowed': 'マイクが つかえない せっていに なっています',
    'service-not-allowed': 'マイクが つかえない せっていに なっています',
    'audio-capture': 'マイクが みつかりません',
    network: 'インターネットに つながっていないため こえを ききとれません',
    unsupported: 'このブラウザでは こえの ききとりが できません',
  }[code] || (auto && !Mic.supported ? 'このブラウザでは こえの ききとりが できません' : '');
  // おうちのひと向けに、マイクを許可する手順を添える
  const help = code === 'not-allowed' || code === 'service-not-allowed' ? Env.micPermissionHelp()
    : !Env.secure ? 'https で開いていないため、マイクが使えません。'
      : !Mic.supported ? (Env.isIOS ? 'iPad・iPhone は Safari で開いてください。' : 'Android・PC は Chrome で開いてください。') : '';
  $('rescue-reason').textContent = reason + (help ? `（おうちのかたへ：${help}）` : '');
  $('rescue-retry').hidden = P.micBroken;
  $('rescue').hidden = false;
}

function closeRescue() { $('rescue').hidden = true; }

// ---------- じゅんばん／ばらばら：おわり ----------
function finishChain(completed) {
  stopPlay();
  const size = P.list.length;
  const main = size === CHAIN_MAIN;
  let title, icon = '✨';
  if (completed) {
    Store.recordChain(DAN, size, { completed: true, clean: P.clean, order: P.order });
    title = main ? 'さいごまで できた！✨' : (P.clean ? `${size}もん つづけて できた！✨` : `${size}もん さいごまで いえた！✨`);
  } else {
    Store.recordChain(DAN, size, { completed: false, count: P.done, order: P.order });
    title = `${P.done}もん つづけて できたね！`;
    icon = '🌷';
  }
  $('done-icon').textContent = icon;
  $('done-title').textContent = title;

  // 9もん完走：「こんどは じぶんで いってみる？」（⭐へ。任意）と「おしまい」を同じ大きさで
  const recitalOrder = P.order === 'down' ? 'down' : 'up';
  $('done-recite').hidden = !(completed && main);
  $('done-recite').onclick = () => Recital.open(recitalOrder);
  // ちょっとだけ れんしゅう：つぎの長さを任意で
  const steps = [...CHAIN_SHORT, CHAIN_MAIN];
  const next = completed && !main ? steps[steps.indexOf(size) + 1] : null;
  $('done-next').hidden = !next;
  $('done-next').textContent = next ? `${next}もんに してみる？` : '';
  $('done-next').onclick = () => startPlay('chain', next === CHAIN_MAIN ? orderedList('up') : range(next), { order: 'up' });
  const again = P.order === 'random' ? shuffled(range(CHAIN_MAIN)) : [...P.list];
  const againOrder = P.order;
  $('done-again').onclick = () => startPlay('chain', againOrder === 'random' ? shuffled(range(CHAIN_MAIN)) : again, { order: againOrder });
  show('done');
}

function onPlayBack() {
  if (P.mode === 'chain') {
    if (P.done > 0) { finishChain(false); return; }
    openMenu();
  } else {
    stopPlay();
    openSelect();
  }
}

// ---------- 起動 ----------
// 練習中（1もんずつ／じゅんばん／ばらばら）のマイク処理。本番暗唱中は Recital が自分の処理に差し替える
const PLAY_MIC_HANDLERS = {
  onLive: onMicLive,
  onFinal: onMicFinal,
  onInterim: onMicInterim,
  onSpeechStart: onMicSpeechStart,
  onNoSpeech: onSilence,
  onUnavailable: onMicUnavailable,
};

function init() {
  $('btn-parent').onclick = () => Parent.open();
  document.querySelectorAll('[data-go="top"]').forEach((b) => (b.onclick = goTop));
  document.querySelectorAll('[data-go="menu"]').forEach((b) => (b.onclick = openMenu));

  $('mode-single').onclick = openSelect;
  $('mode-seq').onclick = () => openDir('seq');
  $('mode-random').onclick = () => startPlay('chain', shuffled(range(CHAIN_MAIN)), { order: 'random' });
  $('mode-recital').onclick = () => openDir('recital');
  $('dir-up').onclick = () => onDir('up');
  $('dir-down').onclick = () => onDir('down');
  $('chain-short-toggle').onclick = () => { $('chain-short').hidden = !$('chain-short').hidden; };

  $('btn-play-back').onclick = onPlayBack;
  $('btn-hint').onclick = onHint;
  $('btn-reveal').onclick = onRevealAnswer;
  $('btn-solo').onclick = onSolo;
  $('btn-replay').onclick = () => { if (!P.answered) ask(); };
  $('play-mic').onclick = () => { if (!P.answered && P.phase === 'paused') resumeListening(); };
  $('btn-cant-hear').onclick = () => openRescue(false);
  $('rescue-ok').onclick = () => onCorrect(true);
  $('rescue-retry').onclick = () => { closeRescue(); resumeListening(); };
  $('rescue-close').onclick = () => { closeRescue(); if (!P.micBroken && !P.answered) setMic('tap'); };

  Mic.setHandlers(PLAY_MIC_HANDLERS);

  $('after-again').onclick = () => startPlay('single', [P.list[0]]);
  $('after-next').onclick = () => startPlay('single', [P.list[0] + 1]);
  $('after-list').onclick = () => { stopPlay(); openSelect(); };

  $('done-end').onclick = openMenu;

  $('recital-start').onclick = () => Recital.start();
  $('recital-finish').onclick = () => Recital.finish();
  $('btn-recital-back').onclick = () => Recital.cancel();

  // 効果音は最初のタップ後でないと鳴らないブラウザがあるため
  document.addEventListener('pointerdown', () => { Sound.unlock(); Voice.unlock(); }, { once: true });
  Env.init();

  Parent.init();
  Shop.init();
  renderDanPicker();
  show('top');
}

document.addEventListener('DOMContentLoaded', init);
