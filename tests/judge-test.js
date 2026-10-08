// 判定ロジックの機械チェック（依存なし）： node tests/judge-test.js
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..', 'js');
const src = ['data.js', 'judge.js'].map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
// eslint-disable-next-line no-new-func
const ctx = new Function(src + '\nreturn { Judge, kukuEntry, danAnswers, DANS, MULTIPLIERS };')();
const { Judge, kukuEntry, danAnswers, DANS, MULTIPLIERS } = ctx;

let pass = 0, fail = 0;
const fails = [];
function check(label, cond, detail) {
  if (cond) pass++;
  else { fail++; fails.push(`${label} ${detail || ''}`); }
}
const J = (entry, ...ts) => Judge.judge(ts.map((t) => (Array.isArray(t) ? { transcript: t[0], confidence: t[1] } : { transcript: t, confidence: 0.9 })), entry);

// 漢数字表記
const KD = '〇一二三四五六七八九';
const kanjiNum = (v) => (v < 10 ? KD[v] : (Math.floor(v / 10) === 1 ? '' : KD[Math.floor(v / 10)]) + '十' + (v % 10 ? KD[v % 10] : ''));
const fullWidth = (s) => s.replace(/\d/g, (d) => String.fromCharCode(0xff10 + +d));
// 一般的な別読み（よん・なな・きゅう）
const ONES = { 1: 'いち', 2: 'に', 3: 'さん', 4: 'よん', 5: 'ご', 6: 'ろく', 7: 'なな', 8: 'はち', 9: 'きゅう' };
const altKana = (v) => (v < 10 ? ONES[v] : (Math.floor(v / 10) === 1 ? '' : ONES[Math.floor(v / 10)]) + 'じゅう' + (v % 10 ? ONES[v % 10] : ''));

const table = [];
for (const dan of DANS) {
  for (const m of MULTIPLIERS) {
    const e = kukuEntry(dan, m);
    const id = `${dan}×${m}`;
    check(id + ' answer', e.answer === dan * m);
    check(id + ' fields', e.promptText && e.ttsText && e.answerText && e.fullText && e.fullTtsText);
    check(id + ' fullText', e.fullText === `${e.promptText} ${e.answerText}`, e.fullText);
    // 答えの読み → 数値
    check(id + ' answerText→num', Judge.parseNumber(e.answerText) === e.answer, `${e.answerText}→${Judge.parseNumber(e.answerText)}`);
    check(id + ' altKana→num', Judge.parseNumber(altKana(e.answer)) === e.answer, `${altKana(e.answer)}→${Judge.parseNumber(altKana(e.answer))}`);
    // A になるべき表記
    const forms = [
      String(e.answer), fullWidth(String(e.answer)), e.answer + '。', kanjiNum(e.answer), e.answerText,
      e.answerText.replace(/./g, (c) => String.fromCharCode(c.charCodeAt(0) + 0x60)), // カタカナ
      e.fullText, e.fullText.replace(' ', ''), `${dan}${m} ${e.answer}`, `${dan}×${m}=${e.answer}`, altKana(e.answer), e.answer + 'です',
    ];
    if (e.answer >= 10 && e.answer % 10) forms.push(e.answerText.replace(/(じゅう).*$/, '$1') + (e.answer % 10)); // にじゅう5
    if (e.answer >= 10 && e.answer % 10) forms.push(`${e.answer - (e.answer % 10)} ${e.answer % 10}`); // 20 5
    if (e.answer >= 10) forms.push(String(e.answer).repeat(2)); // 2525（1桁の「55」は問題の読み「ごご」と区別できないので対象外）
    for (const f of forms) {
      const r = J(e, f);
      check(`${id} A「${f}」`, r.kind === 'A', `→${r.kind} ${r.reason || ''}`);
    }
    // 問題だけ繰り返した → C
    for (const f of [e.promptText, `${dan}${m}`, e.promptText.replace(/が$/, '')]) {
      const r = J(e, f);
      check(`${id} C(問題だけ)「${f}」`, r.kind === 'C', `→${r.kind} ${r.value ?? ''}`);
    }
    // 明確な別の答え（高確信度）→ B（ただし似た音・途中切れは C で正しい）
    let bCount = 0, cCount = 0;
    for (const other of danAnswers(dan)) {
      if (other === e.answer) continue;
      const r = J(e, [String(other), 0.95]);
      check(`${id} 別答え${other}はA以外`, r.kind !== 'A', `→${r.kind}`);
      if (r.kind === 'B') bCount++; else cCount++;
    }
    // 低確信度の別答えは B にしない
    const other = danAnswers(dan).find((v) => v !== e.answer);
    const rl = J(e, [String(other), 0.4]);
    check(`${id} 低確信度の別答え→C`, rl.kind === 'C', `→${rl.kind}`);
    // 雑音 → C
    for (const f of ['', 'あのね', 'なんで', '英語 英語', 'わかんない']) {
      const r = J(e, f);
      check(`${id} C「${f}」`, r.kind === 'C', `→${r.kind} ${r.value ?? ''}`);
    }
    table.push({ id, prompt: e.promptText, tts: e.ttsText, full: e.fullText, B: bCount, C: cCount });
  }
}

// 実児童テストで出た例
const e53 = kukuEntry(5, 3), e55 = kukuEntry(5, 5), e52 = kukuEntry(5, 2), e51 = kukuEntry(5, 1);
const special = [
  ['5×3「中五」→A', J(e53, '中五').kind === 'A'],
  ['5×3「なんで」→C', J(e53, 'なんで').kind === 'C'],
  ['5×3「英語 英語」→C', J(e53, '英語 英語').kind === 'C'],
  ['5×5「2525」→A', J(e55, '2525').kind === 'A'],
  ['5×5「25 25」→A', J(e55, '25 25').kind === 'A'],
  ['5×3「中五」でも他候補が20なら→C', J(e53, ['中五', 0.7], ['20', 0]).kind === 'C'],
  ['5×2「銃」→A', J(e52, '銃').kind === 'A'],
  ['5×1「語」→A', J(e51, '語').kind === 'A'],
  ['5×3「語」→C（Bにしない）', J(e53, '語').kind === 'C'],
  ['5×3「10」0.7→C（途中切れ）', J(e53, ['10', 0.7]).kind === 'C'],
  ['5×3「20」0.9→B', J(e53, ['20', 0.9]).kind === 'B'],
  ['5×3 候補[20,15]→A', J(e53, ['20', 0], ['15', 0]).kind === 'A'],
  ['5×3 候補[20(0.95),15]→C（候補が食い違う）', J(e53, ['20', 0.95], ['15', 0]).kind === 'C'],
  ['2×2「死」→A', J(kukuEntry(2, 2), '死').kind === 'A'],
  ['2×2「C」→A', J(kukuEntry(2, 2), 'C').kind === 'A'],
  ['3×3「苦」→A', J(kukuEntry(3, 3), '苦').kind === 'A'],
  ['1×2「似」→A', J(kukuEntry(1, 2), '似').kind === 'A'],
  ['1×1「7」0.8→C（いち/しち）', J(kukuEntry(1, 1), ['7', 0.8]).kind === 'C'],
  ['1×1「5」0.8→B', J(kukuEntry(1, 1), ['5', 0.8]).kind === 'B'],
  ['1×4「7」0.95→B', J(kukuEntry(1, 4), ['7', 0.95]).kind === 'B'],
  ['9×9「はちじゅういち」→A', J(kukuEntry(9, 9), 'はちじゅういち').kind === 'A'],
  ['7×7「しじゅうく」→A', J(kukuEntry(7, 7), 'しじゅうく').kind === 'A'],
  ['7×7「よんじゅうきゅう」→A', J(kukuEntry(7, 7), 'よんじゅうきゅう').kind === 'A'],
  ['8×9「しちじゅうに」→A', J(kukuEntry(8, 9), 'しちじゅうに').kind === 'A'],
  ['8×9「ななじゅうに」→A', J(kukuEntry(8, 9), 'ななじゅうに').kind === 'A'],
  ['6×8「えっと しじゅうはち」→A', J(kukuEntry(6, 8), 'えっと しじゅうはち').kind === 'A'],
  ['6×8「48」0.95→A', J(kukuEntry(6, 8), ['48', 0.95]).kind === 'A'],
  ['6×8「42」0.95→B', J(kukuEntry(6, 8), ['42', 0.95]).kind === 'B'],
  ['6×8「47」0.95→C（段の答えでない）', J(kukuEntry(6, 8), ['47', 0.95]).kind === 'C'],
  ['7×4「21」0.8→C（いち/はち）', J(kukuEntry(7, 4), ['21', 0.8]).kind === 'C'],
];
special.forEach(([l, ok]) => check(l, ok));

// ---------- 2026-10 実機テストを受けた確認（5の段） ----------
const e = (m) => kukuEntry(5, m);
const K = (m, ...ts) => J(e(m), ...ts).kind;
const real = [
  // 学校式の読み（しじゅう・しじゅうご）をそのまま受け付ける
  ['5×8「しじゅう」→A', K(8, 'しじゅう') === 'A'],
  ['5×8「シジュウ」→A', K(8, 'シジュウ') === 'A'],
  ['5×8「しじゅー」→A', K(8, 'しじゅー') === 'A'],
  ['5×8「四十」→A', K(8, '四十') === 'A'],
  ['5×8「40」→A', K(8, '40') === 'A'],
  ['5×8「よんじゅう」→A', K(8, 'よんじゅう') === 'A'],
  ['5×8「ごはしじゅう」→A', K(8, 'ごはしじゅう') === 'A'],
  ['5×8「始終」→A', K(8, '始終') === 'A'],
  ['5×8「ししゅう」→A（しじゅうと同じ音）', K(8, 'ししゅう') === 'A'],
  ['5×8「刺繍」→A（しじゅうと同じ音）', K(8, '刺繍') === 'A'],
  ['5×9「しじゅうご」→A', K(9, 'しじゅうご') === 'A'],
  ['5×9「四十五」→A', K(9, '四十五') === 'A'],
  ['5×9「45」→A', K(9, '45') === 'A'],
  ['5×9「よんじゅうご」→A', K(9, 'よんじゅうご') === 'A'],
  ['5×9「ごっくしじゅうご」→A', K(9, 'ごっくしじゅうご') === 'A'],
  ['5×9「始終5」→A', K(9, '始終5') === 'A'],
  ['5×9「ししゅうご」→A', K(9, 'ししゅうご') === 'A'],
  ['5×5「にじゅうご」→A', K(5, 'にじゅうご') === 'A'],
  ['5×5「二十五」→A', K(5, '二十五') === 'A'],
  ['5×7「さんじゅうご」→A', K(7, 'さんじゅうご') === 'A'],
  ['5×7「三十五」→A', K(7, '三十五') === 'A'],
  // 同じ音の補正は B に使わない：5×3 に「始終」→ A でも B でもない
  ['5×3「始終」→C', K(3, ['始終', 0.95]) === 'C'],
  // 実機で出た誤認識：正しく答えた子を「プッ♪」にしない（C）
  ['5×9「15」0.95→C（しじゅうご の一部）', K(9, ['15', 0.95]) === 'C'],
  ['5×9「015」0.95→C', K(9, ['015', 0.95]) === 'C'],
  ['5×9「じゅうご」0.95→C', K(9, ['じゅうご', 0.95]) === 'C'],
  ['5×7「5」0.95→C（さんじゅうご の一部）', K(7, ['5', 0.95]) === 'C'],
  ['5×6「3」0.95→C（さんじゅう の一部）', K(6, ['3', 0.95]) === 'C'],
  ['5×5「2025」0.95→C', K(5, ['2025', 0.95]) === 'C'],
  ['5×5「1010」0.95→C', K(5, ['1010', 0.95]) === 'C'],
  ['5×8「4」0.95→C（しじゅう の一部）', K(8, ['4', 0.95]) === 'C'],
  ['5×9「40」0.95→C（しじゅうご の一部）', K(9, ['40', 0.95]) === 'C'],
  // 「015→45」等の固定補正はしていない（Aにならない）
  ['5×9「015」はAにしない', K(9, '015') !== 'A'],
  ['5×7「5」はAにしない', K(7, '5') !== 'A'],
  ['5×5「2025」はAにしない', K(5, '2025') !== 'A'],
  // 第2候補に正解 → A（第1候補が正解の一部なら確信度が高くても拾う）
  ['5×9 候補[15(0.9), 45]→A', K(9, ['15', 0.9], ['45', 0]) === 'A'],
  ['5×9 候補[015(0.9), しじゅうご]→A', K(9, ['015', 0.9], ['しじゅうご', 0]) === 'A'],
  ['5×8 候補[4(0.9), 40]→A', K(8, ['4', 0.9], ['40', 0]) === 'A'],
  // 本当に別の答え（高確信度・候補一致・正解の一部ではない）→ B は残る
  ['5×9「35」0.95→B', K(9, ['35', 0.95]) === 'B'],
  ['5×8「35」0.95→B', K(8, ['35', 0.95]) === 'B'],
  ['5×5「20」0.95→C（にじゅうご の一部）', K(5, ['20', 0.95]) === 'C'],
  ['5×5「30」0.95→B', K(5, ['30', 0.95]) === 'B'],
  ['5×3「20」0.95→B', K(3, ['20', 0.95]) === 'B'],
  ['5×3「20」0.65→C（低確信度）', K(3, ['20', 0.65]) === 'C'],
  // ひらがな・数字の混ざった問題の言い方
  ['5×2「5に10」→A', K(2, '5に10') === 'A'],
  ['5×3「ご3 15」→A', K(3, 'ご3 15') === 'A'],
];
real.forEach(([l, ok]) => check(l, ok));

console.log('dan×m  prompt / tts / full / 別答えB / 別答えC');
table.forEach((r) => console.log(`${r.id}\t${r.prompt}\t${r.tts}\t${r.full}\tB${r.B} C${r.C}`));
console.log(`\n${pass} passed, ${fail} failed`);
fails.slice(0, 60).forEach((f) => console.log('FAIL', f));
process.exit(fail ? 1 : 0);
