// 音声認識結果 → 数値変換・判定（1〜9の段共通）
// 方針：正しく答えた子を「ちがう」にしないこと。迷ったら C（もういっかい きかせて）。
//   A = 正解と判断できる
//   B = 明確に別の（同じ段の）答えを言った
//   C = 聞き取れない・自信がない（不正解扱いしない）
//
// 数値への変換は2種類：
//   strict : 数字・漢数字・ひらがな数詞として素直に読めるもの。A/B 両方に使う
//   loose  : 同音の漢字（「中五」「語」など）を数字に寄せたもの。
//            「いま出している問題の正解と一致し、他の候補と矛盾しない」ときだけ A の裏付けに使う。B には絶対に使わない。

const Judge = (() => {
  function toHiragana(s) {
    return s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
  }

  // 長音や「う」の揺れを吸収：じゅう/じゅー/じゅ → じゅ、きゅう → きゅ
  function squash(s) {
    return toHiragana(s).replace(/ー/g, '').replace(/([ゃゅょ])う/g, '$1');
  }

  // 前後のつなぎ言葉・句読点を落とす
  function clean(s) {
    let t = toHiragana(String(s || '').normalize('NFKC').toLowerCase())
      .replace(/[\s、。,.!?！？・~〜♪「」『』()（）"'=＝]/g, '');
    t = t.replace(/^(えっと|えーと|えと|うーんと|うんと|うーん|んーと|んー|あのー|あの|えー)+/, '');
    if (t.length > 1) t = t.replace(/(です|でーす|だよ|だね|かな|だ|よ|ね)$/, '');
    return t;
  }

  // ---------- strict：数詞トークン ----------
  const KANA_TOKENS = [
    ['ひゃく', 'H'], ['じゅっ', 'T'], ['じゅ', 'T'],
    ['いち', 1], ['しち', 7], ['なな', 7], ['はち', 8], ['きゅ', 9], ['ろく', 6], ['さん', 3], ['よん', 4],
    ['ごう', 5], ['ごお', 5], ['ぜろ', 0], ['れい', 0],
    ['に', 2], ['し', 4], ['よ', 4], ['ご', 5], ['く', 9],
  ];
  const KANJI = { '〇': 0, '零': 0, '一': 1, '二': 2, '三': 3, '四': 4, '五': 5, '六': 6, '七': 7, '八': 8, '九': 9, '十': 'T', '百': 'H' };

  function tokenize(s) {
    const toks = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (/\d/.test(c)) {
        let j = i;
        while (j < s.length && /\d/.test(s[j])) j++;
        const v = parseInt(s.slice(i, j), 10);
        toks.push(s.slice(i, j).length === 1 ? { d: v } : { num: v });
        i = j;
        continue;
      }
      if (c in KANJI) {
        const v = KANJI[c];
        toks.push(v === 'T' ? { T: 1 } : v === 'H' ? { H: 1 } : { d: v });
        i++;
        continue;
      }
      const hit = KANA_TOKENS.find(([k]) => s.startsWith(k, i));
      if (!hit) return null;
      const v = hit[1];
      toks.push(v === 'T' ? { T: 1 } : v === 'H' ? { H: 1 } : { d: v });
      i += hit[0].length;
    }
    return toks;
  }

  // 日本語の数の並びとして正しいものだけ数値にする（「ごご」「じゅうごじゅうご」は null）
  function compose(toks) {
    if (!toks || !toks.length) return null;
    let i = 0, val = 0;
    if (toks[0].num !== undefined) {
      val = toks[0].num;
      i = 1;
      if (toks[1] && toks[1].d !== undefined && val >= 10 && val % 10 === 0) { val += toks[1].d; i = 2; }
      return i === toks.length ? val : null;
    }
    const isD = (t) => t && t.d !== undefined;
    if (isD(toks[i]) && toks[i + 1] && toks[i + 1].H) { val += toks[i].d * 100; i += 2; }
    else if (toks[i] && toks[i].H) { val += 100; i++; }
    if (isD(toks[i]) && toks[i + 1] && toks[i + 1].T) { val += toks[i].d * 10; i += 2; }
    else if (toks[i] && toks[i].T) { val += 10; i++; }
    if (isD(toks[i])) { val += toks[i].d; i++; }
    return i === toks.length && i > 0 ? val : null;
  }

  function parseStrict(raw) {
    const s = squash(clean(raw));
    if (!s) return null;
    return compose(tokenize(s));
  }

  // ---------- loose：同音・誤認識の補正候補（Aの裏付け専用） ----------
  // 1文字ずつ数字の漢字に寄せる。ここに入れるのは「数の読みと同じ音」のものだけ。
  // 「なんで」「英語」のように普通の言葉として成り立つ語は入れない（判断できなければ C）。
  const SOUND_ALIKE_CHARS = {
    '中': '十', '銃': '十', '重': '十', '住': '十', '充': '十', '柔': '十', '獣': '十', '従': '十', '拾': '十', '汁': '十',
    '後': '五', '語': '五', '碁': '五', '午': '五', '呉': '五', '娯': '五', '御': '五', '互': '五',
    '死': '四', '氏': '四', '詩': '四', '師': '四', '詞': '四', '紙': '四',
    '似': '二', '煮': '二', '荷': '二', '児': '二', '仁': '二',
    '山': '三', '産': '三', '参': '三', '散': '三',
    '録': '六', '苦': '九', '区': '九', '句': '九', '駆': '九',
    '質': '七', '蜂': '八', '鉢': '八', '位置': '一',
  };
  // 文字列まるごとの補正（英字読みなど）。値は「その数として聞こえた可能性がある」だけの意味
  const SOUND_ALIKE_WORDS = {
    'go': 5, 'q': 9, 'c': 4, 'she': 4, '始終': 40, '自由': 10, '十後': 15, 'ろぐ': 6,
  };
  // 実児童テストで実際に出た誤認識の記録（どの問題で出たか）。
  // ここにある語も loose 扱いなので、その問題の正解と一致し他候補と矛盾しない場合だけ A の裏付けになる。
  const OBSERVED = [
    { heard: '中五', value: 15, seen: '2026-10 5×3' },
    { heard: '2525', value: 25, seen: '2026-10 5×5（くり返し発話）' },
    // { heard: 'なんで', ... } は日本語として成立するため登録しない
    // { heard: '英語英語', ... } も同様に登録しない
  ];

  // 「しじゅう（40）」「しじゅうご（45）」と同じ音の候補。2026-10 実機で 5×8・5×9 の学校式の読みが受け付けられなかったため。
  // Chrome が実際に何を返しているかは未確認（親画面の開発ログで確認する）。loose なので A の裏付けにしか使わない。
  const SHIJUU_ALIKE = ['始終', '刺繍', '詩集', '歯周', '死守', '四重', 'ししゅ', 'しじゅ'];
  const GO_TAIL = ['五', '5', '後', '語', 'ご'];
  function parseShijuu(sq) {
    for (const b of SHIJUU_ALIKE) {
      if (sq === b) return 40;
      if (GO_TAIL.some((g) => sq === b + g)) return 45;
    }
    return null;
  }

  function parseLoose(raw) {
    const s = clean(raw);
    if (!s) return null;
    const sq = squash(s);
    if (sq in SOUND_ALIKE_WORDS) return SOUND_ALIKE_WORDS[sq];
    const shijuu = parseShijuu(sq);
    if (shijuu !== null) return shijuu;
    const obs = OBSERVED.find((o) => clean(o.heard) === s);
    if (obs) return obs.value;
    // 漢字の同音置き換え
    let t = s;
    for (const [k, v] of Object.entries(SOUND_ALIKE_CHARS).sort((a, b) => b[0].length - a[0].length)) t = t.split(k).join(v);
    if (t !== s) {
      const v = compose(tokenize(squash(t)));
      if (v !== null) return v;
    }
    // 同じ答えを2回言った（「2525」「にじゅうごにじゅうご」）
    if (s.length % 2 === 0 && s.length >= 2) {
      const h = s.slice(0, s.length / 2);
      if (h === s.slice(s.length / 2)) {
        const v = parseStrict(h);
        if (v !== null) return v;
        const w = parseLoose(h);
        if (w !== null) return w;
      }
    }
    return null;
  }

  // ---------- 問題部分（「ごさん じゅうご」の「ごさん」）を取り除く ----------
  const DAN_KANA = { 1: ['いん', 'いち'], 2: ['に'], 3: ['さん', 'さ', 'さぶ', 'さざん'], 4: ['し'], 5: ['ご'], 6: ['ろく', 'ろっ'], 7: ['しち'], 8: ['はち', 'はっ'], 9: ['く'] };
  const MUL_KANA = { 1: ['いち'], 2: ['に', 'にん'], 3: ['さん', 'ざん'], 4: ['し'], 5: ['ご'], 6: ['ろく'], 7: ['しち'], 8: ['はち', 'は', 'ぱ'], 9: ['く', 'っく'] };
  const KANJI_DIGITS = '〇一二三四五六七八九';
  const prefixCache = {};

  function questionPrefixes(entry) {
    const key = entry.dan + 'x' + entry.multiplier;
    if (prefixCache[key]) return prefixCache[key];
    const { dan, multiplier: n } = entry;
    const list = [squash(entry.promptText)];
    // ひらがな・数字・漢数字の混ざった言い方（「5に」「ご3」「五3」など。Chrome は混ぜて返すことがある）
    const danForms = [...DAN_KANA[dan], String(dan), KANJI_DIGITS[dan]];
    const mulForms = [...MUL_KANA[n], String(n), KANJI_DIGITS[n]];
    danForms.forEach((a) => mulForms.forEach((b) => list.push(squash(a + b))));
    list.push(`${dan}${n}`, `${dan}×${n}`, `${dan}x${n}`, `${dan}*${n}`, `${dan}かける${n}`, KANJI_DIGITS[dan] + KANJI_DIGITS[n]);
    const withGa = [];
    list.forEach((p) => { withGa.push(p, p.replace(/が$/, ''), p.replace(/が$/, '') + 'が', p + 'は'); });
    prefixCache[key] = [...new Set(withGa)].filter(Boolean).sort((a, b) => b.length - a.length);
    return prefixCache[key];
  }

  // 問題部分を除いた残りの候補（長い接頭辞から順に、すべて）
  function stripPrefix(raw, entry) {
    const s = squash(clean(raw));
    return questionPrefixes(entry).filter((p) => s.startsWith(p) && s.length > p.length).map((p) => s.slice(p.length));
  }

  // 空白で区切られた「20 5」→ 25
  function splitTens(raw) {
    const t = String(raw || '').normalize('NFKC').trim().split(/\s+/);
    if (t.length < 2) return null;
    const a = parseStrict(t[t.length - 2]), b = parseStrict(t[t.length - 1]);
    return a !== null && b !== null && a >= 10 && a % 10 === 0 && b < 10 ? a + b : null;
  }

  // 受け付ける読み（acceptedReadings：学校式の読み＋よんじゅう 等）とそのまま一致するか
  function readingMatches(raw, entry) {
    const acc = (entry.acceptedReadings || [entry.answerText]).map(squash);
    return [squash(clean(raw)), ...stripPrefix(raw, entry)].some((r) => acc.includes(r));
  }

  // strict で読める答え候補（全体・問題部分を除いたもの・空白区切りの後ろ側）
  function strictCandidates(raw, entry) {
    const out = [];
    const add = (v) => { if (v !== null && v !== undefined) out.push(v); };
    if (readingMatches(raw, entry)) add(entry.answer);
    add(parseStrict(raw));
    stripPrefix(raw, entry).forEach((r) => add(parseStrict(r)));
    const tokens = String(raw || '').normalize('NFKC').trim().split(/\s+/);
    for (let i = 1; i < tokens.length; i++) add(parseStrict(tokens.slice(i).join('')));
    add(splitTens(raw));
    return out;
  }

  function looseCandidates(raw, entry) {
    const out = [];
    const add = (v) => { if (v !== null && v !== undefined) out.push(v); };
    add(parseLoose(raw));
    stripPrefix(raw, entry).forEach((r) => add(parseLoose(r)));
    return out;
  }

  // B判定用の主な値（問題部分を除いた値 → 「20 5」 → 全体 の順）
  function primaryValue(raw, entry) {
    for (const r of stripPrefix(raw, entry)) {
      const v = parseStrict(r);
      if (v !== null) return v;
    }
    const st = splitTens(raw);
    if (st !== null) return st;
    return parseStrict(raw);
  }

  // 聞き間違えやすい数字の組（いち/しち/はち、し/しち、に/し、く/ろく）
  const CONFUSABLE = new Set(['1-7', '1-8', '7-8', '4-7', '2-4', '6-9']);
  function confusable(a, b) {
    const x = String(a), y = String(b);
    if (x.length !== y.length) return false;
    let diff = 0, pair = '';
    for (let i = 0; i < x.length; i++) {
      if (x[i] !== y[i]) { diff++; pair = [x[i], y[i]].sort().join('-'); }
    }
    return diff === 1 && CONFUSABLE.has(pair);
  }

  // ある数のひらがなの読み一覧（KANA_NUM の逆引き）
  const READINGS_OF = (() => {
    const ones = { 1: ['いち'], 2: ['に'], 3: ['さん'], 4: ['し', 'よん'], 5: ['ご'], 6: ['ろく'], 7: ['しち', 'なな'], 8: ['はち'], 9: ['く', 'きゅう'] };
    const tens = { 1: [''], 2: ['に'], 3: ['さん'], 4: ['し', 'よん'], 5: ['ご'], 6: ['ろく'], 7: ['しち', 'なな'], 8: ['はち'], 9: ['きゅう'] };
    const map = {};
    const put = (v, k) => { (map[v] = map[v] || []).push(squash(k)); };
    for (const o in ones) ones[o].forEach((r) => put(+o, r));
    for (const t in tens) tens[t].forEach((tp) => {
      put(t * 10, tp + 'じゅう');
      for (const o in ones) ones[o].forEach((r) => put(t * 10 + +o, tp + 'じゅう' + r));
    });
    return map;
  })();

  // v が「正解の読みの一部（頭か終わり）」になっているか。
  // 例：45「しじゅうご」に対して 15「じゅうご」・5「ご」・40「しじゅう」・4「し」。
  // Chrome が子どもの声の一部だけを拾った可能性があるので、B（別の答え）にしない
  function partOfAnswer(v, entry) {
    const answer = entry.answer;
    if (v === answer) return false;
    const a = String(answer), b = String(v);
    if (a.length > b.length && (a.endsWith(b) || a.startsWith(b))) return true;
    const ar = [...(READINGS_OF[answer] || []), ...(entry.acceptedReadings || []).map(squash)];
    const vr = READINGS_OF[v] || [];
    return ar.some((x) => vr.some((y) => x !== y && x.length > y.length && (x.endsWith(y) || x.startsWith(y))));
  }

  // 「015」「2025」のような、九九の答えとしては不自然な数字の並び
  const oddDigits = (raw) => /(^|\D)0\d|\d{3,}/.test(String(raw || '').normalize('NFKC'));

  // 途中で切れた可能性（「じゅうご」→「じゅう」、「にじゅうし」→「に」/「し」）
  function truncated(v, answer) {
    if (v % 10 === 0 && answer - v > 0 && answer - v < 10) return true;
    if (v < 10 && answer >= 10 && (answer % 10 === v || Math.floor(answer / 10) === v)) return true;
    return false;
  }

  const confOf = (alt) => (alt && typeof alt.confidence === 'number' && alt.confidence > 0 ? alt.confidence : null);

  // alts: [{transcript, confidence}]
  function judge(alts, entry) {
    const answer = entry.answer;
    alts = (alts || []).filter((a) => a && typeof a.transcript === 'string');
    if (!alts.length) return { kind: 'C', reason: 'empty', heard: '' };
    const top = alts[0];
    const topConf = confOf(top);
    const topValue = primaryValue(top.transcript, entry);
    // 最上位が高い確信度で別の数。ただし正解の読みの一部（15 と 45 など）なら、下位候補の正解を優先して拾う
    const strongOther = topValue !== null && topValue !== answer && topConf !== null && topConf >= 0.85 && !partOfAnswer(topValue, entry);

    // A-1：最上位候補が strict で正解
    if (strictCandidates(top.transcript, entry).includes(answer)) {
      return { kind: 'A', value: answer, heard: top.transcript, via: 'strict' };
    }
    // A-2：下位候補が strict で正解（最上位が高い確信度で別の数を言っていなければ）
    if (!strongOther) {
      for (const alt of alts.slice(1)) {
        if (strictCandidates(alt.transcript, entry).includes(answer)) {
          return { kind: 'A', value: answer, heard: alt.transcript, via: 'strict-alt' };
        }
      }
    }
    // A-3：loose（同音補正）で正解。どの候補も strict で別の数になっていないときだけ
    const strictOthers = alts.map((a) => primaryValue(a.transcript, entry)).filter((v) => v !== null && v !== answer && v <= 100);
    if (!strictOthers.length) {
      for (const alt of alts) {
        const c = confOf(alt);
        if (c !== null && c < 0.3) continue;
        if (looseCandidates(alt.transcript, entry).includes(answer)) {
          return { kind: 'A', value: answer, heard: alt.transcript, via: 'loose' };
        }
      }
    }

    // B：最上位候補が「同じ段の別の答え」として strict に読め、Chrome の聞き間違いらしさがない場合だけ。
    // （正しく答えた子を Chrome の誤認識だけで「プッ♪」にしないため、迷ったら C）
    const C = (reason) => ({ kind: 'C', reason, value: topValue, heard: top.transcript });
    if (topValue === null) return C('unparsed');
    if (oddDigits(top.transcript)) return C('odd-digits');
    if (!danAnswers(entry.dan).includes(topValue)) return C('not-in-dan');
    if (topConf !== null && topConf < 0.7) return C('low-confidence');
    if (truncated(topValue, answer) || partOfAnswer(topValue, entry)) return C('part-of-answer');
    if (topValue < 10 && !(topConf !== null && topConf >= 0.8)) return C('short-utterance');
    if (alts.slice(1).some((a) => { const w = primaryValue(a.transcript, entry); return w !== null && w !== topValue; })) return C('alts-disagree');
    if (confusable(topValue, answer) && !(topConf !== null && topConf >= 0.9)) {
      return { kind: 'C', reason: 'similar-sound', value: topValue, heard: top.transcript };
    }
    // 下位候補に正解らしいもの（同音）があれば判断しない
    if (alts.slice(1).some((a) => looseCandidates(a.transcript, entry).includes(answer))) return C('alt-may-be-answer');
    return { kind: 'B', value: topValue, heard: top.transcript };
  }

  // 「問題の読み＋答え」の形になっているか（読み上げの聞こえ残りと子どもの答えがつながった場合の判定用）
  const hasPromptPrefix = (raw, entry) => stripPrefix(raw, entry).length > 0;

  // 開発ログ用：候補ごとに、どう正規化・数値化されたか
  function explain(alts, entry) {
    return (alts || []).map((a) => ({
      transcript: a.transcript,
      confidence: a.confidence,
      normalized: squash(clean(a.transcript)),
      strict: parseStrict(a.transcript),
      withoutPrompt: stripPrefix(a.transcript, entry),
      readingMatch: readingMatches(a.transcript, entry),
      strictCandidates: strictCandidates(a.transcript, entry),
      looseCandidates: looseCandidates(a.transcript, entry),
      primary: primaryValue(a.transcript, entry),
    }));
  }

  return { judge, explain, partOfAnswer, hasPromptPrefix, questionPrefixes, parseNumber: parseStrict, parseLoose, clean, squash, OBSERVED };
})();

if (typeof module !== 'undefined') module.exports = { Judge };
