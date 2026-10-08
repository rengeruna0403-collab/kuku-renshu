// 本番暗唱の追跡（Recital.align）の機械チェック： node tests/recital-test.js
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'js');
const src = ['data.js', 'judge.js', 'recital.js'].map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
// eslint-disable-next-line no-new-func
const { Recital, kukuEntry, DANS, MULTIPLIERS } = new Function(src + '\nreturn { Recital, kukuEntry, DANS, MULTIPLIERS };')();

let pass = 0, fail = 0;
const fails = [];
const check = (label, cond, detail = '') => { if (cond) pass++; else { fail++; fails.push(`${label} ${detail}`); } };
const seq = (order) => (order === 'down' ? [...MULTIPLIERS].reverse() : MULTIPLIERS);
const KD = '〇一二三四五六七八九';
const kanjiNum = (v) => (v < 10 ? KD[v] : (Math.floor(v / 10) === 1 ? '' : KD[Math.floor(v / 10)]) + '十' + (v % 10 ? KD[v % 10] : ''));

for (const dan of DANS) {
  for (const order of ['up', 'down']) {
    const items = seq(order).map((m) => kukuEntry(dan, m));
    const forms = {
      kanaSpaced: items.map((e) => e.fullText).join(' '),
      kanaRunTogether: items.map((e) => e.fullText.replace(' ', '')).join(''),
      katakana: items.map((e) => e.fullText).join('、').replace(/[ぁ-ゖ]/g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60)),
      digits: items.map((e) => `${e.dan}${e.multiplier}${/が$/.test(e.promptText) ? 'が' : ''} ${e.answer}`).join(' '),
      digitsRunTogether: items.map((e) => `${e.dan}${e.multiplier}${e.answer}`).join(''),
      kanji: items.map((e) => `${KD[e.dan]}${KD[e.multiplier]}${/が$/.test(e.promptText) ? 'が' : ''}${kanjiNum(e.answer)}`).join(' '),
      mixed: items.map((e, i) => (i % 2 ? e.fullText : `${e.dan} ${e.multiplier} ${e.answer}`)).join(' '),
      withIntroEcho: `${dan}のだんどうぞ ` + items.map((e) => e.fullText).join(' '),
    };
    for (const [name, text] of Object.entries(forms)) {
      const r = Recital.align(text, dan, order);
      check(`${dan}の段 ${order} ${name} → 9`, r.matched.length === 9 && r.missing.length === 0, `${r.matched.length} 「${text.slice(0, 60)}」`);
      check(`${dan}の段 ${order} ${name} 順番`, JSON.stringify(r.matched) === JSON.stringify(seq(order)), JSON.stringify(r.matched));
    }
    // 1つだけ誤認識（4番目を雑音に）→ 8つ拾えて、欠けたのはその1つだけ
    const garbled = items.map((e, i) => (i === 3 ? 'えいごえいご' : e.fullText)).join(' ');
    const g = Recital.align(garbled, dan, order);
    check(`${dan}の段 ${order} 1つ誤認識 → 8`, g.matched.length === 8 && g.missing.length === 1 && g.missing[0] === seq(order)[3], JSON.stringify(g));
    // 途中まで（5つ）
    const half = Recital.align(items.slice(0, 5).map((e) => e.fullText).join(' '), dan, order);
    check(`${dan}の段 ${order} 途中まで → 5`, half.matched.length === 5, half.matched.length);
    // 逆の順番で言った → 9つそろうことはない（「ごごにじゅうご」の中の「ごにじゅう」など偶然の一致で2〜3になることはある）
    const rev = Recital.align([...items].reverse().map((e) => e.fullText).join(' '), dan, order);
    check(`${dan}の段 ${order} 逆順 → 3以下`, rev.matched.length <= 3, rev.matched.length);
    // 「どうぞ」だけ・雑音だけ → 0
    check(`${dan}の段 ${order} どうぞだけ → 0`, Recital.align(`${dan}のだんどうぞ`, dan, order).matched.length === 0);
    check(`${dan}の段 ${order} 雑音 → 0`, Recital.align('なんで えいご あのね', dan, order).matched.length === 0);
  }
}

// 5の段：5×5 を取りこぼしたとき、その中の「ごにじゅう」を 5×2 と数え直さない
const five = MULTIPLIERS.map((m) => kukuEntry(5, m).fullText);
const missing2 = five.filter((_, i) => i !== 1).join(' ');   // 5×2 を言っていない
const r2 = Recital.align(missing2, 5, 'up');
check('5の段 5×2なし → 5×2は欠け', r2.missing.includes(2) && r2.matched.length === 8, JSON.stringify(r2));
// 実際の認識で起こりそうな表記の混在
const realistic = '5 1 が 5 5 2 10 ごさん 15 5 4 20 五五 二十五 56 30 ごしち さんじゅうご 5 8 40 5 9 45';
check('5の段 表記混在 → 9', Recital.align(realistic, 5, 'up').matched.length === 9, JSON.stringify(Recital.align(realistic, 5, 'up')));


// ---------- 考え中の言葉・言い直し（フィラーは追跡上ただ無視する。間違い・減点にはしない） ----------
const A = (text, order = 'up', dan = 5) => Recital.align(text, dan, order);
const same = (x, y) => JSON.stringify(x) === JSON.stringify(y);
const fillerCases = [
  // [名前, 文字列, matched, restated, selfCorrected]
  ['例1 えーと・うーん', 'えーと ごいちがご ごにじゅう うーん ごさんじゅうご ごしにじゅう', [1, 2, 3, 4], [], []],
  ['例2 えっと・あれ', 'ごいちがご えっと ごにじゅう あれ ごさんじゅうご', [1, 2, 3], [], []],
  ['例3 なんだっけ', 'ごいちがご ごにじゅう なんだっけ……ごさんじゅうご', [1, 2, 3], [], []],
  ['例4 言い直し（問題だけ→最初から）', 'ごいちがご ごに……えーと、ごにじゅう', [1, 2], [2], []],
  ['例5 答えを間違えて答えだけ訂正', 'ごいちがご、ごに……じゅうご、あ、じゅう', [1], [], [2]],
  ['例6 長めの思考', 'ごいちがご……うーん……えーっと……ごにじゅう', [1, 2], [], []],
  ['例7 わからん', 'ごいちがご、うーん、わからん……ごにじゅう', [1, 2], [], []],
  // 追加
  ['問題と答えの間で考える', 'ごいちがご ごに えーと じゅう ごさん うーん じゅうご', [1, 2, 3], [], []],
  ['空白なしでつながった認識', 'えーとごいちがごうーんごにじゅうなんだっけごさんじゅうご', [1, 2, 3], [], []],
  ['数字の認識＋フィラー', 'えっと 5 1 が 5 うーん 5 2 10 あれ 5 3 15', [1, 2, 3], [], []],
  ['まちがった答えで終わる（15）は5×2にしない', 'ごいちがご ごにじゅうご', [1], [], []],
  ['まちがい→最初から言い直し', 'ごいちがご ごにじゅうご あ ごにじゅう', [1, 2], [2], []],
  ['まちがった答えだけ（訂正なし）', 'ごいちがご ごに にじゅう', [1], [], []],
  ['数字で答えを間違えて答えだけ訂正', '5 1 が 5 5 2 15 あ 10', [1], [], [2]],
  ['くだり＋フィラー', 'えーと ごっくしじゅうご うーん ごはしじゅう なんだっけ ごしちさんじゅうご', [9, 8, 7], [], [], 'down'],
  ['フィラーだけ', 'えーと うーん あの あれ なんだっけ わからん', [], [], []],
  ['無意味な短い発声', 'あ ごいちがご う ん ごにじゅう え', [1, 2], [], []],
];
fillerCases.forEach(([name, text, mt, rs, sc, order]) => {
  const r = A(text, order || 'up');
  check(`${name} matched`, same(r.matched, mt), JSON.stringify(r.matched) + ' 正規化=' + r.normalized);
  check(`${name} 言い直し`, same(r.restated, rs), JSON.stringify(r.restated));
  check(`${name} 答えだけ訂正`, same(r.selfCorrected, sc), JSON.stringify(r.selfCorrected));
});
// 全段・のぼり/くだり：九九のあいだに毎回フィラーが入っても 9 つ追えて、言い直し扱いにもならない
const FILLERS = ['えーと', 'うーん', 'あの', 'あれ', 'なんだっけ', 'えっと', 'わからん', 'う', 'あ'];
for (const dan of DANS) for (const order of ['up', 'down']) {
  const items = seq(order).map((m) => kukuEntry(dan, m));
  const spaced = items.map((e, i) => `${FILLERS[i % FILLERS.length]} ${e.fullText}`).join('……');
  const r1 = Recital.align(spaced, dan, order);
  check(`${dan}の段 ${order} フィラー入り → 9`, r1.matched.length === 9 && r1.restated.length === 0 && r1.selfCorrected.length === 0, JSON.stringify(r1));
  const midPause = items.map((e) => `${e.promptText} えーと ${e.answerText}`).join(' ');
  const r2 = Recital.align(midPause, dan, order);
  check(`${dan}の段 ${order} 問題と答えの間で考える → 9`, r2.matched.length === 9, JSON.stringify(r2.matched));
}

console.log(`${pass} passed, ${fail} failed`);
fails.slice(0, 40).forEach((f) => console.log('FAIL', f));
process.exit(fail ? 1 : 0);
