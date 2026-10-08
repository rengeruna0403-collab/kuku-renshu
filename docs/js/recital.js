// ⭐ みないで いえるかな？（本番暗唱モード）
// 「じゅんばんに 9もん」（アプリが1問ずつ読み上げ → 子どもが答える → 判定）とは別物。
// ここではアプリは「5のだん、どうぞ♪」とだけ言い、あとは黙って聞く。
//   ・1問ごとのピンポン／プッ♪／もういっかい／次の問題の読み上げ／画面切替は一切しない
//   ・マイクは Mic（continuous + interimResults）で開きっぱなし。Chrome が止めたら onend で自動再開
//   ・認識結果は内部で「期待される9つの九九」にどこまで沿っているかを追跡するだけ（親の分析用）
//   ・認識が不完全でも子どもには「できなかった」と見せない。最後は親が ○／△ を記録できる

const Recital = (() => {
  // ---------- 追跡（純粋関数。tests/recital-test.js で検証） ----------
  const KD = '〇一二三四五六七八九';
  const ONES = { 1: 'いち', 2: 'に', 3: 'さん', 4: 'よん', 5: 'ご', 6: 'ろく', 7: 'なな', 8: 'はち', 9: 'きゅう' };
  const kanjiNum = (v) => (v < 10 ? KD[v] : (Math.floor(v / 10) === 1 ? '' : KD[Math.floor(v / 10)]) + '十' + (v % 10 ? KD[v % 10] : ''));
  const altKana = (v) => (v < 10 ? ONES[v] : (Math.floor(v / 10) === 1 ? '' : ONES[Math.floor(v / 10)]) + 'じゅう' + (v % 10 ? ONES[v % 10] : ''));

  // 認識文字列を比較用に正規化（ひらがな化・長音/記号除去）。
  // 空白・読点・「……」などの区切りは文字列からは消すが、位置（bounds）として覚えておく。
  // ＝ 子どもが間をあけた・言いよどんだ場所。「じゅう」と「ご」の間に区切りがあれば 15 ではなく 10 で切れている
  function normalizeWithBounds(text) {
    const t = Judge.squash(String(text || '').normalize('NFKC').toLowerCase())
      .replace(/[\s、。,.!?！？・~〜♪「」『』()（）"'…‥]+/g, '|')
      .replace(/[=＝×x*＊]/g, '')
      .replace(/かける/g, '');
    let s = '';
    const bounds = new Set();
    for (const c of t) {
      if (c === '|') bounds.add(s.length);
      else s += c;
    }
    return { s, bounds };
  }
  const normalize = (text) => normalizeWithBounds(text).s;

  const formCache = {};
  // 1つの九九の「問題の読み」と「答え」の書き方の一覧
  function forms(dan, m) {
    const key = dan + 'x' + m;
    if (formCache[key]) return formCache[key];
    const e = kukuEntry(dan, m);
    const prompts = [...new Set(Judge.questionPrefixes(e).map(normalize).filter(Boolean))];
    const answers = [...new Set([...e.acceptedReadings, altKana(e.answer), String(e.answer), kanjiNum(e.answer)].map(normalize))];
    const sigs = [];
    prompts.forEach((p) => answers.forEach((a) => sigs.push({ sig: p + a, a })));
    sigs.sort((x, y) => y.sig.length - x.sig.length);
    formCache[key] = { answer: e.answer, prompts, answers, sigs };
    return formCache[key];
  }
  // 「問題の読み＋答え」の文字列一覧（従来の API）
  const signatures = (dan, m) => forms(dan, m).sigs.map((x) => x.sig);

  // 答えの直後の文字で、別の数に続いてしまうか（「じゅう」の後の「ご」→ 15）。区切りがあれば続かない
  function extendsAnswer(s, bounds, end, ansForm, answer) {
    if (end >= s.length || bounds.has(end)) return false;
    for (let k = 1; k <= 3 && end + k <= s.length; k++) {
      if (k > 1 && bounds.has(end + k - 1)) break;
      const v = Judge.parseNumber(ansForm + s.slice(end, end + k));
      if (v !== null && v !== answer) return true;
    }
    return false;
  }

  // 区切りで分けたかたまりのうち、数の手がかりが何もないもの（えーと・うーん・なんだっけ・わからん 等）を
  // 追跡用の文字列から外す。「ごに えーと じゅう」が「ごにじゅう」としてつながる。
  // ※ フィラー辞書は使わない。「数や九九の読みを1つも含まない」かたまりを外すだけ（transcript 自体はそのまま残る）
  function dropNonNumeric(s, bounds, dan) {
    const marks = [...MULTIPLIERS.flatMap((m) => [...forms(dan, m).prompts, ...forms(dan, m).answers])];
    const cuts = [0, ...[...bounds].filter((b) => b > 0 && b < s.length).sort((x, y) => x - y), s.length];
    let out = '';
    const nb = new Set();
    for (let i = 0; i < cuts.length - 1; i++) {
      const seg = s.slice(cuts[i], cuts[i + 1]);
      if (!seg) continue;
      const numeric = /[0-9〇一二三四五六七八九十百]/.test(seg) || marks.some((x) => seg.includes(x));
      if (!numeric) continue;
      if (out.length) nb.add(out.length);
      out += seg;
    }
    return { s: out, bounds: nb };
  }

  // 期待される順番（のぼり ×1→×9 ／ くだり ×9→×1）
  const sequence = (order) => (order === 'down' ? [...MULTIPLIERS].reverse() : [...MULTIPLIERS]);

  // text の中で、期待される九九を「順番どおり・重ならず」にいくつ拾えるかを最大化する。
  // 九九として読める部分だけを使い、それ以外（えーと・うーん・なんだっけ・わからん 等）は追跡上ただ無視する。
  // 戻り値：
  //   matched       拾えたかける数（言った順）
  //   missing       拾えなかったかける数
  //   restated      言い直しのあと、最終的に「問題＋答え」で言えたもの（例：「ごに……えーと、ごにじゅう」）
  //   selfCorrected 拾えなかったが、問題のあとに答えだけ言い直して正しい答えが出ていたもの
  //                 （例：「ごに……じゅうご、あ、じゅう」）。自動では正解に数えない（親が判断する）
  function align(text, dan, order) {
    const raw = normalizeWithBounds(text);
    const { s, bounds } = dropNonNumeric(raw.s, raw.bounds, dan);
    const seq = sequence(order);
    const occ = [];
    seq.forEach((m, k) => {
      const f = forms(dan, m);
      const seen = new Set();
      f.sigs.forEach(({ sig, a }) => {
        let i = s.indexOf(sig);
        while (i !== -1) {
          if (!seen.has(i)) {
            seen.add(i);
            const e = i + sig.length;
            // 答えが別の数に続いてしまう出現は「弱い」：すぐ後に次の九九がつながっている場合だけ使う
            occ.push({ k, m, s: i, e, weak: extendsAnswer(s, bounds, e, a, f.answer) });
          }
          i = s.indexOf(sig, i + 1);
        }
      });
    });
    occ.sort((a, b) => a.e - b.e || a.s - b.s);
    // 最長の「順番どおり・重ならない」並び（DP）
    const best = occ.map(() => 1);
    const prev = occ.map(() => -1);
    for (let i = 0; i < occ.length; i++) {
      for (let j = 0; j < i; j++) {
        const linked = !occ[j].weak || occ[i].s === occ[j].e;
        if (linked && occ[j].e <= occ[i].s && occ[j].k < occ[i].k && best[j] + 1 > best[i]) { best[i] = best[j] + 1; prev[i] = j; }
      }
    }
    let end = -1;
    best.forEach((v, i) => { if (!occ[i].weak && (end === -1 || v > best[end])) end = i; });
    const chain = [];
    for (let i = end; i !== -1; i = prev[i]) chain.unshift(occ[i]);
    const matched = chain.map((o) => o.m);

    // 言い直しの手がかり（親画面の参考情報。合否には使わない）
    const restated = [];
    const selfCorrected = [];
    seq.forEach((m, k) => {
      const f = forms(dan, m);
      const before = chain.filter((o) => o.k < k).pop();
      const after = chain.find((o) => o.k > k);
      const mine = chain.find((o) => o.m === m);
      const from = before ? before.e : 0;
      const to = mine ? mine.s : after ? after.s : s.length;
      // この区間に、この九九の「問題の読み」が出ているか
      const promptAt = [];
      f.prompts.forEach((p) => {
        for (let i = s.indexOf(p, from); i !== -1 && i + p.length <= to; i = s.indexOf(p, i + 1)) promptAt.push(i);
      });
      if (!promptAt.length) return;
      if (mine) { restated.push(m); return; }
      // 問題のあとに、区切りから始まる「答えだけ」の正しい言い直しがあるか
      const first = Math.min(...promptAt);
      const ok = f.answers.some((a) => {
        for (let i = s.indexOf(a, first + 1); i !== -1 && i + a.length <= to; i = s.indexOf(a, i + 1)) {
          if ((bounds.has(i) || i === 0) && !extendsAnswer(s, bounds, i + a.length, a, f.answer)) return true;
        }
        return false;
      });
      if (ok) selfCorrected.push(m);
    });

    return { matched, missing: seq.filter((m) => !matched.includes(m)), restated, selfCorrected, normalized: s };
  }

  // ---------- 画面とマイク ----------
  const S = {
    phase: 'idle',   // idle | ready | intro（どうぞ♪を読み上げ中）| listening | done
    dan: 5, order: 'up',
    startAt: 0, ttsEndAt: 0, firstSpeechAt: null,
    finals: [], interims: {}, restarts: 0, gapMs: 0, offlineSince: null, micError: '',
    autoTimer: null, run: 0,
    // 開発用の診断（0/9 の原因を切り分けるため）
    diag: null, timeline: [],
  };
  const now = () => performance.now();

  const freshDiag = () => ({ resultEvents: 0, interimUpdates: 0, finals: 0, finalsDuringStop: 0, maxAlts: 0, longestInterim: '', speechstarts: 0, errors: [] });
  function tl(ev, data) {
    if (S.timeline.length >= 400) return;
    S.timeline.push({ t: S.startAt ? Math.round(now() - S.startAt) : -1, ev, ...(data || {}) });
  }

  function streamText(withInterim) {
    const f = S.finals.map((x) => x.text).join(' ');
    if (!withInterim) return f;
    return f + ' ' + Object.keys(S.interims).sort((a, b) => a - b).map((k) => S.interims[k]).join(' ');
  }

  const handlers = {
    onLive() {
      if (S.offlineSince !== null) { S.gapMs += now() - S.offlineSince; S.offlineSince = null; }
      S.interims = {};
      tl('start');
    },
    onEnded() {
      // Chrome が自動で認識を終えた → Mic がすぐ再開する。回数と「聞けていない時間」を記録
      if (S.phase === 'listening') { S.restarts++; S.offlineSince = now(); }
      tl('end');
    },
    onInterim(text, segStart, i) {
      if (S.phase !== 'listening' && S.phase !== 'intro' && S.phase !== 'finishing') return;
      if (S.firstSpeechAt === null && S.ttsEndAt && segStart >= S.ttsEndAt) S.firstSpeechAt = now();
      if (S.diag) {
        S.diag.resultEvents++;
        S.diag.interimUpdates++;
        if (text.length > S.diag.longestInterim.length) S.diag.longestInterim = text;
      }
      if (S.interims[i] !== text) tl('interim', { i, text });
      S.interims[i] = text;
    },
    onFinal(alts, segStart, i) {
      if (S.phase !== 'listening' && S.phase !== 'intro' && S.phase !== 'finishing') return;
      delete S.interims[i];
      if (!alts.length) return;
      if (S.diag) {
        S.diag.resultEvents++;
        S.diag.finals++;
        if (S.phase === 'finishing') S.diag.finalsDuringStop++;
        S.diag.maxAlts = Math.max(S.diag.maxAlts, alts.length);
      }
      tl('final', { i, alts: alts.map((a) => [a.transcript, typeof a.confidence === 'number' ? Math.round(a.confidence * 1000) / 1000 : null]) });
      if (S.firstSpeechAt === null && S.ttsEndAt && segStart >= S.ttsEndAt) S.firstSpeechAt = now();
      // 「どうぞ」の読み上げ中に始まった区間（アプリ自身の声の聞こえ）は intro として区別する
      const intro = !S.ttsEndAt || segStart < S.ttsEndAt + 250;
      S.finals.push({ t: Math.round(now() - (S.startAt || now())), text: alts[0].transcript, alts: alts.slice(1).map((a) => a.transcript), intro });
      // 確定した結果だけで9つそろったら、少し待って自動で終わる（途中の認識だけでは終わらない）
      if (S.phase === 'listening' && align(streamText(false), S.dan, S.order).matched.length === MULTIPLIERS.length) {
        clearTimeout(S.autoTimer);
        S.autoTimer = setTimeout(() => finish('auto'), 900);
      }
    },
    onSpeechStart() { if (S.diag) S.diag.speechstarts++; tl('speechstart'); },
    // 黙っていても何も言わない（Mic が自動で開き直す）
    onNoSpeech() { if (S.diag) S.diag.errors.push('no-speech'); tl('no-speech'); },
    onUnavailable(code) { S.micError = code; if (S.diag) S.diag.errors.push(code); tl('error', { code }); $('recital-sub').textContent = 'おわったら ボタンを おしてね'; },
  };

  function setView(phase) {
    S.phase = phase;
    $('recital-start').hidden = phase !== 'ready';
    $('recital-finish').hidden = phase !== 'listening';
    $('recital-sub').textContent = phase === 'ready' ? 'じゅんびできたら' : phase === 'listening' ? '🎤 きいてるよ' : '';
    $('recital-sub').classList.toggle('listening', phase === 'listening');
  }

  function open(order) {
    S.dan = DAN;
    S.order = order;
    S.run++;
    setDanTitles();
    $('recital-dir').textContent = order === 'down' ? '⬇️ くだり' : '⬆️ のぼり';
    setView('ready');
    show('recital');
    prewarmMic();
  }

  async function start() {
    const id = ++S.run;
    Store.beginSession({ dan: S.dan, mode: 'recital', level: 4, order: S.order });
    Object.assign(S, { startAt: 0, ttsEndAt: 0, firstSpeechAt: null, finals: [], interims: {}, restarts: 0, gapMs: 0, offlineSince: null, micError: '', diag: freshDiag(), timeline: [] });
    RawLog.setContext(`recital-${S.order} ${S.dan}のだん`);
    clearTimeout(S.autoTimer);
    // マイクは「どうぞ♪」の前から開いておく（どうぞ直後の「ごいちがご」の頭を取りこぼさない）
    Mic.setHandlers(handlers);
    Mic.configure({ continuous: true, interimResults: true });
    if (Mic.supported) Mic.start();
    setView('intro');
    await Voice.speak(`${S.dan}のだん、どうぞ`);
    if (id !== S.run) return;
    S.ttsEndAt = now();
    S.startAt = S.ttsEndAt;
    setView('listening');
  }

  function stopMic() {
    clearTimeout(S.autoTimer);
    Mic.stop();
    Mic.setHandlers(PLAY_MIC_HANDLERS);
  }

  // 9つそろわなかったときの「アプリ側から見た原因の目安」（子どもの九九の成績ではない）
  function diagnose(confirmed, provisional) {
    const d = S.diag;
    const childFinals = S.finals.filter((f) => !f.intro).length;
    if (S.micError) return 'mic-error';                                  // マイク・通信のエラー
    if (!d.resultEvents) return 'no-results';                             // Chrome から結果が1つも来なかった
    if (confirmed.matched.length === MULTIPLIERS.length) return 'complete';
    if (!childFinals && d.interimUpdates) return 'interim-only';          // 途中の認識だけで、確定（final）が来なかった
    if (childFinals && !confirmed.matched.length) return 'finals-unmatched';  // 確定はあるが九九の形に読めない
    if (provisional.matched.length > confirmed.matched.length) return 'partly-interim';  // 一部は確定前の認識にだけあった
    return 'partial';
  }

  function summary(endedBy) {
    const endAt = now();
    const confirmed = align(streamText(false), S.dan, S.order);
    const provisional = align(streamText(true), S.dan, S.order);
    if (S.offlineSince !== null) S.gapMs += endAt - S.offlineSince;
    return {
      order: S.order,
      endedBy,
      durationMs: Math.round(endAt - S.startAt),
      firstSpeechMs: S.firstSpeechAt !== null ? Math.round(S.firstSpeechAt - S.startAt) : null,
      matched: confirmed.matched,
      missing: confirmed.missing,
      restated: confirmed.restated,            // 言い直して、さいごは言えた
      selfCorrected: confirmed.selfCorrected,  // 答えだけ言い直して正しい答えが出た（自動では正解に数えない）
      provisionalMatched: provisional.matched,
      restarts: S.restarts,
      offlineMs: Math.round(S.gapMs),
      micError: S.micError || null,
      finals: S.finals,
      interimAtEnd: Object.values(S.interims).join(' '),
      parentJudge: null,
      diag: { ...S.diag, cause: diagnose(confirmed, provisional) },
      timeline: S.timeline,
    };
  }

  async function finish(endedBy) {
    if (S.phase !== 'listening') return;
    const id = ++S.run;
    clearTimeout(S.autoTimer);
    // 画面はすぐ終わりにする。確定していない認識は Chrome に確定させてから集計する（abort だと捨てられる）
    S.phase = 'finishing';
    $('recital-finish').hidden = true;
    Sound.pinpon();
    const firstTitle = align(streamText(false), S.dan, S.order).matched.length === MULTIPLIERS.length;
    $('done-icon').textContent = '✨';
    $('done-title').textContent = firstTitle ? 'さいごまで いえた！✨' : 'おつかれさま！✨';
    $('done-recite').hidden = true;
    $('done-next').hidden = true;
    $('done-again').onclick = () => open(S.order);
    show('done');
    tl('finish', { endedBy });
    await Mic.stopGracefully(1500);
    Mic.setHandlers(PLAY_MIC_HANDLERS);
    if (id !== S.run) return;
    const sum = summary(endedBy);
    S.phase = 'done';
    Store.recordRecital(S.dan, sum);
    // 確定した結果で9つそろっていれば、あとから「いえた」にする（下げることはしない）
    if (!firstTitle && sum.matched.length === MULTIPLIERS.length) $('done-title').textContent = 'さいごまで いえた！✨';
  }

  // ← もどる（途中でやめた）
  function cancel() {
    const wasListening = S.phase === 'listening';
    if (wasListening) Store.recordRecital(S.dan, summary('stopped'));
    S.run++;
    setView('idle');
    stopMic();
    openMenu();
  }

  return { open, start, finish: () => finish('manual'), cancel, align, signatures, normalize };
})();

if (typeof module !== 'undefined') module.exports = { Recital };
