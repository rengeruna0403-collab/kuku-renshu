// おうちのひと画面（セッション記録・累計・音声認識テスト・設定）
const Parent = (() => {
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const pad = (n) => String(n).padStart(2, '0');
  const fmtDate = (iso) => {
    if (!iso) return '—';
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${pad(d.getMinutes())}`;
  };
  const fmtTime = (iso) => { const d = new Date(iso); return `${d.getHours()}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`; };
  const MODE = { single: '1もんずつ', chain: 'じゅんばん', recite: 'じぶんでいってみよう（旧）', recital: '⭐みないで' };
  const ORDER = { up: 'のぼり', down: 'くだり' };
  // セッションの練習名（じゅんばん・ばらばら・ちょっとだけ を区別）
  function modeLabel(s) {
    if (s.mode === 'chain') {
      if (s.order === 'random') return '🟣ばらばら 9もん';
      const size = (s.events.find((e) => e.size) || {}).size;
      if (size && size < CHAIN_MAIN) return `ちょっとだけ（${size}もん）`;
      return `🟢じゅんばんに 9もん（${ORDER[s.order] || 'のぼり'}）`;
    }
    if (s.mode === 'recital') return `⭐みないで いえるかな？（${ORDER[s.order] || 'のぼり'}）`;
    return MODE[s.mode] || s.mode;
  }
  const sec = (ms) => (typeof ms === 'number' ? `${(ms / 1000).toFixed(1)}秒` : '—');

  const CAUSE = {
    complete: '確定した認識で9つそろった',
    'no-results': 'Chrome から結果が1つも返らなかった（マイク・通信・権限の可能性）',
    'interim-only': '途中の認識（interim）だけで、確定（final）が来なかった',
    'finals-unmatched': '確定した認識はあるが、九九の形として読めなかった（transcript を確認）',
    'partly-interim': '一部の九九は確定前の認識にだけ出ていた',
    partial: '確定した認識の一部だけが九九として読めた',
    'mic-error': 'マイクまたは通信のエラー',
  };
  const fmtAlts = (alts) => alts.map(([t, c]) => `${rawShowLite(t)}${typeof c === 'number' && c > 0 ? `(${c})` : ''}`).join(' / ');
  const rawShowLite = (s) => `<code>${esc(JSON.stringify(String(s ?? '')))}</code>`;

  // 本番暗唱の1回分
  function recitalBlock(s, e, i) {
    const seq = s.order === 'down' ? [...MULTIPLIERS].reverse() : MULTIPLIERS;
    const cells = seq.map((m) => {
      const ok = e.matched.includes(m);
      const fix = !ok && (e.selfCorrected || []).includes(m);
      const prov = !ok && !fix && (e.provisionalMatched || []).includes(m);
      const re = ok && (e.restated || []).includes(m);
      const cls = ok ? 'ok' : fix ? 'fix' : prov ? 'prov' : 'miss';
      const title = ok ? (re ? '言い直して、さいごは言えた' : '認識できた') : fix ? '答えだけ言い直して正しい答え（自動では数えていない）' : prov ? '確定前の認識のみ' : '認識できなかった';
      return `<span class="rc ${cls}" title="${title}">${s.dan}×${m}${re ? ' ↺' : ''}${fix ? ' ✎' : ''}</span>`;
    }).join('');
    const ended = { auto: '自動（9つ認識）', manual: '「おわった！」', stopped: '途中でもどる' }[e.endedBy] || e.endedBy;
    const fmtList = (xs) => (xs || []).map((m) => `${s.dan}×${m}`).join('・');
    const redo = [
      (e.restated || []).length ? `↺ 言い直しあり（さいごは言えた）：${fmtList(e.restated)}` : '',
      (e.selfCorrected || []).length ? `✎ 答えだけ言い直して正しい答え（自動では数えていません）：${fmtList(e.selfCorrected)}` : '',
    ].filter(Boolean).join('<br>');
    const judge = (v, label) => `<button class="tiny rj ${e.parentJudge === v ? 'on' : ''}" data-s="${esc(s.sessionId)}" data-i="${i}" data-v="${v}">${label}</button>`;
    const transcript = e.finals.map((f) => `<li><span class="t">+${sec(f.t)}</span>${f.intro ? ' <span class="x">（どうぞの読み上げ）</span>' : ''} <code>${esc(f.text)}</code>${f.alts && f.alts.length ? ` <span class="x">（ほかの候補：${f.alts.map(esc).join(' / ')}）</span>` : ''}</li>`).join('');
    return `<tr><td colspan="5"><div class="recital-log">
      <div class="rc-row">${cells}</div>
      <div class="note">認識できた ${e.matched.length}/9（確定前の認識を含めると ${(e.provisionalMatched || []).length}/9）・終わり方：${ended}<br>
        全体時間 ${sec(e.durationMs)}（「どうぞ」から終了まで）・話し始めまで ${sec(e.firstSpeechMs)}・音声認識の再起動 ${e.restarts}回（聞けていなかった時間 合計 ${sec(e.offlineMs)}）${e.micError ? `・マイクのエラー：${esc(e.micError)}` : ''}</div>
      ${redo ? `<div class="note">${redo}</div>` : ''}
      ${e.diag ? `<div class="note diag">🛠 アプリ側から見た原因の目安：<b>${CAUSE[e.diag.cause] || esc(e.diag.cause)}</b><br>
        結果イベント ${e.diag.resultEvents}回（途中 ${e.diag.interimUpdates}・確定 ${e.diag.finals}、うち「おわった」後に確定 ${e.diag.finalsDuringStop}）・候補数 最大 ${e.diag.maxAlts}・speechstart ${e.diag.speechstarts}回${e.diag.errors.length ? `・エラー ${esc(e.diag.errors.join(','))}` : ''}<br>
        いちばん長かった途中の認識：<code>${esc(e.diag.longestInterim || '—')}</code><br>
        ※ これは子どもの九九の成績ではありません</div>` : ''}
      <div class="rc-judge">おうちのひとの判定：${judge('full', '○ ぜんぶ言えていた')} ${judge('helped', '△ 手助けあり')}</div>
      ${e.timeline && e.timeline.length ? `<details><summary>🛠 認識の推移（interim → final）</summary><ul class="log">${e.timeline.map((x) =>
        `<li><span class="t">${x.t >= 0 ? '+' + sec(x.t) : 'どうぞ前'}</span> ${esc(x.ev)}${x.i !== undefined ? ` [${x.i}]` : ''} ${x.text !== undefined ? `<code>${esc(x.text)}</code>` : ''}${x.alts ? fmtAlts(x.alts) : ''}${x.code ? esc(x.code) : ''}${x.endedBy ? esc(x.endedBy) : ''}</li>`).join('')}</ul></details>` : ''}
      <details><summary>transcript（認識された文字）</summary><ul class="log">${transcript || '<li>なし</li>'}</ul>${e.interimAtEnd ? `<p class="note">終了時に確定していなかった認識：<code>${esc(e.interimAtEnd)}</code></p>` : ''}</details>
    </div></td></tr>`;
  }
  const LV = { 1: 'みながら', 2: 'こたえをかくす', 3: 'おとだけ', 4: 'レベル4' };
  const HINT = { none: 'ヒントなし', app: '💡アプリのヒント', external: '👋おうちのひとがヒント' };

  let tabDan = 5;

  // ---------- 練習セッション ----------
  function rtText(e) {
    if (e.via === 'parent') return '—（おうちのひとが判定）';
    if (typeof e.responseTime !== 'number') return '—';
    return `${e.responseTime.toFixed(1)}秒${e.retries ? ` <span class="warn">※聞き取り直し${e.retries}回</span>` : ''}`;
  }

  function eventRow(s, e, i) {
    const q = e.multiplier ? `${s.dan}×${e.multiplier}` : '';
    let what = '', rt = '', hint = '', cls = '';
    switch (e.event) {
      case 'correct':
        what = e.via === 'parent' ? '言えた（○ いえた）' : '言えた';
        rt = rtText(e);
        // アプリのヒントはそのまま表示。それ以外は「👋」ボタンの ON/OFF で none ⇄ external
        hint = e.hint === 'app' ? HINT.app
          : `<button class="tiny ext ${e.hint === 'external' ? 'on' : ''}" data-s="${esc(s.sessionId)}" data-i="${i}">👋 おうちのひとがヒント</button>`;
        cls = 'ok';
        break;
      case 'other_answer': what = `別の答え「${esc(e.transcript)}」`; break;
      case 'recognition_failed': what = `聞き取れず「${esc(e.transcript)}」`; cls = 'muted'; break;
      case 'no_speech': what = '無音'; cls = 'muted'; break;
      case 'hint': what = e.stage === 'answer' ? '💡 こたえをみる' : '💡 ヒント（手がかり）'; cls = 'muted'; break;
      case 'chain_complete': what = `${e.size}もん さいごまで`; cls = 'ok'; break;
      case 'chain_stop': what = `${e.count}もん で おしまい（${e.size}もん中）`; break;
      case 'recital': return recitalBlock(s, e, i);
      case 'recite_done': what = `じぶんで いえた（おうちのひとが判定・${HINT[e.hint] || ''}）`; cls = 'ok'; break;
      default: what = esc(e.event);
    }
    return `<tr class="${cls}"><td class="t">${fmtTime(e.time)}</td><td>${q}</td><td class="w">${what}</td><td>${rt}</td><td class="h">${hint}</td></tr>`;
  }

  function sessionSummary(s) {
    if (s.mode === 'recital') {
      const rs = s.events.filter((e) => e.event === 'recital');
      return `本番暗唱 ${rs.length}回・おうちのひと判定 ○${rs.filter((e) => e.parentJudge === 'full').length} △${rs.filter((e) => e.parentJudge === 'helped').length}`;
    }
    const corrects = s.events.filter((e) => e.event === 'correct');
    const noHint = corrects.filter((e) => e.hint === 'none').length;
    const clean = corrects.filter((e) => e.via !== 'parent' && !e.retries && typeof e.responseTime === 'number');
    const avg = clean.length ? (clean.reduce((a, e) => a + e.responseTime, 0) / clean.length).toFixed(1) + '秒' : '—';
    const fails = s.events.filter((e) => e.event === 'recognition_failed').length;
    return `言えた ${corrects.length}（ヒントなし ${noHint}）・聞き取れず ${fails}・聞き取り直しなしの反応時間平均 ${avg}`;
  }

  function renderSessions() {
    const list = Store.data.sessions.filter((s) => s.events.length).slice().reverse().slice(0, 40);
    if (!list.length) { $('session-list').innerHTML = '<p class="note">まだ記録がありません</p>'; return; }
    const today = Store.dayOf(new Date().toISOString());
    let lastDay = '';
    $('session-list').innerHTML = list.map((s, idx) => {
      const day = Store.dayOf(s.startedAt);
      const head = day !== lastDay ? `<h3 class="day">${day === today ? '今日' : day}</h3>` : '';
      lastDay = day;
      const end = s.endedAt ? new Date(s.endedAt) : null;
      return `${head}<details class="session" ${idx === 0 ? 'open' : ''}>
        <summary><b>${fmtDate(s.startedAt)}${end ? `〜${end.getHours()}:${pad(end.getMinutes())}` : ''}</b>
          ${s.dan}のだん・${modeLabel(s)}${s.level && s.mode !== 'recite' && s.mode !== 'recital' ? '・' + (LV[s.level] || '') : ''}
          ${s.legacy ? '<span class="tag">旧記録から移行</span>' : ''}
          <div class="sum">${sessionSummary(s)}</div></summary>
        <div class="table-wrap"><table class="events"><tbody>${s.events.map((e, i) => eventRow(s, e, i)).join('')}</tbody></table></div>
      </details>`;
    }).join('');
    $('session-list').querySelectorAll('button.rj').forEach((b) => {
      b.onclick = (ev) => {
        ev.preventDefault();
        const on = b.classList.contains('on');
        Store.setRecitalJudge(b.dataset.s, +b.dataset.i, on ? null : b.dataset.v);
        renderSessions();
        renderRecords();
      };
    });
    $('session-list').querySelectorAll('button.ext').forEach((b) => {
      b.onclick = (ev) => {
        ev.preventDefault();
        const on = !b.classList.contains('on');
        Store.setExternalHint(b.dataset.s, +b.dataset.i, on);
        renderSessions();
        renderRecords();
      };
    });
  }

  // ---------- 累計 ----------
  function recentTime(times) {
    if (!times.length) return '—';
    const last = times.slice(-3);
    return `${(last.reduce((a, b) => a + b, 0) / last.length).toFixed(1)}秒程度`;
  }

  function renderDanTabs() {
    $('parent-dan-tabs').innerHTML = DANS.map((d) => `<button class="tiny ${d === tabDan ? 'on' : ''}" data-d="${d}">${d}のだん</button>`).join('');
    $('parent-dan-tabs').querySelectorAll('button').forEach((b) => {
      b.onclick = () => { tabDan = +b.dataset.d; renderDanTabs(); renderRecords(); };
    });
  }

  function renderRecords() {
    const rows = MULTIPLIERS.map((n) => {
      const p = Store.problem(tabDan, n);
      return `<tr>
        <th>${tabDan}×${n}</th>
        <td class="g">${GROWTH_ICONS[p.growthLevel]}</td>
        <td>${p.correctWithoutHint}</td>
        <td>${p.correctWithHint}</td>
        <td>${p.correctWithExternalHint}</td>
        <td>${p.attempts}</td>
        <td>${p.recognitionErrors}</td>
        <td>${recentTime(p.recentResponseTimes)}</td>
        <td>${p.noHintDays.length}</td>
        <td>${fmtDate(p.lastPracticed)}</td>
      </tr>`;
    }).join('');
    $('parent-table').innerHTML = `<table>
      <thead><tr><th></th><th>成長</th><th>ヒントなし<br>成功</th><th>アプリの<br>ヒントあり</th><th>おうちの<br>ヒントあり</th><th>判定<br>回数</th><th>聞き取れず</th><th>最近の<br>反応時間</th><th>ヒントなし<br>成功日数</th><th>最終練習</th></tr></thead>
      <tbody>${rows}</tbody></table>`;

    const chain = Store.data.chain[tabDan] || {};
    const rec = Store.data.recitation[tabDan];
    $('parent-chain').innerHTML =
      `じゅんばん（のぼり）${chain[CHAIN_MAIN] ? '✓' : '—'}・じゅんばん（くだり）${chain[`${CHAIN_MAIN}-down`] ? '✓' : '—'}・ばらばら ${chain[`${CHAIN_MAIN}-random`] ? '✓' : '—'}・ちょっとだけ ${CHAIN_SHORT.map((s) => `${s}もん${chain[s] ? '✓' : '—'}`).join(' ')}<br>` +
      `⭐みないで いえるかな？：${recitalStats(tabDan)}` +
      (rec ? `<br>（旧）じぶんでいってみよう：できた ${rec.done}回（うちヒントあり ${rec.withHint}回）` : '');
  }

  function recitalStats(dan) {
    const rs = Store.data.sessions.filter((s) => s.dan === dan && s.mode === 'recital').flatMap((s) => s.events.filter((e) => e.event === 'recital' && e.endedBy !== 'stopped'));
    if (!rs.length) return '記録なし';
    return `${rs.length}回（認識で9つそろった ${rs.filter((e) => e.matched.length === 9).length}回／おうちのひと ○ ${rs.filter((e) => e.parentJudge === 'full').length}回・△ ${rs.filter((e) => e.parentJudge === 'helped').length}回）`;
  }

  // ---------- 設定 ----------
  function renderSettings() {
    const s = Store.settings;
    $('set-test').checked = !!s.testMode;
    $('test-banner').hidden = !s.testMode;
    $('set-voice').checked = s.voiceEnabled;
    $('set-sound').checked = s.soundEnabled;
    $('set-rate').value = s.speechRate;
    $('set-rate-val').textContent = (+s.speechRate).toFixed(2);
    const sel = $('set-voice-name');
    const voices = Voice.voices;
    sel.innerHTML = '<option value="">自動</option>' + voices.map((v) => `<option value="${esc(v.name)}">${esc(v.name)}${v.localService ? '' : '（オンライン）'}</option>`).join('');
    sel.value = s.voiceName || '';
    $('env-status').innerHTML = [
      `この端末：${Env.isIOS ? 'iPad/iPhone' : Env.isAndroid ? 'Android' : 'PC'}・${esc(Env.browser)}${Env.isStandalone ? '・ホーム画面から起動' : ''}`,
      Listener.supported ? '音声認識：利用可能' : '<b>音声認識：このブラウザでは使えません</b>',
      Voice.supported ? `読み上げ：利用可能（日本語音声 ${voices.length}件）` : '<b>読み上げ：使えません</b>',
      ...Env.problems().map((p) => `<b>${esc(p)}</b>`),
      `マイクが使えないとき：${esc(Env.micPermissionHelp())}`,
    ].filter(Boolean).join('<br>');
    $('set-dev').checked = !!s.devTools;
    $('dev-tools').hidden = !s.devTools;
  }

  // ---------- 音声認識テスト ----------
  const testEntry = () => kukuEntry(+$('test-dan').value, +$('test-target').value);

  function renderTestPrompt() {
    const e = testEntry();
    $('test-prompt').textContent = `「${e.answerText}」って いってみて（${e.dan}×${e.multiplier}＝${e.answer}）`;
  }

  function runTest() {
    const e = testEntry();
    const out = $('test-out');
    out.textContent = '🎤 きいています…';
    $('btn-test').disabled = true;
    Listener.listen({
      onResult: (alts) => {
        $('btn-test').disabled = false;
        const r = Judge.judge(alts, e);
        RawLog.setContext(`認識テスト ${e.dan}×${e.multiplier}`);
        RawLog.add('result', { resultIndex: 0, total: 1, results: [{ i: 0, isFinal: true, alts: alts.map((a) => [a.transcript, a.confidence]) }] });
        RawLog.add('judge', { kind: r.kind, reason: r.reason || null, via: r.via || null, value: r.value ?? null, fromTts: false, altCount: alts.length, candidates: Judge.explain(alts, e) });
        const kind = { A: 'A：正解と判断（ピンポン♪）', B: 'B：別の答え（プッ♪）', C: 'C：聞き取れず（もういっかい きかせて♪）' }[r.kind];
        const via = { strict: '', 'strict-alt': '（下位候補で一致）', loose: '（同音補正で一致）' }[r.via] || '';
        out.innerHTML =
          `<div>認識結果：<code>${esc(alts[0].transcript)}</code></div>` +
          `<div>数値変換：<code>${Judge.parseNumber(alts[0].transcript) ?? '（変換できず）'}</code></div>` +
          `<div>判定：<b>${kind}</b>${via}${r.reason ? `（${r.reason}）` : ''}</div>` +
          `<details><summary>ほかの候補</summary><ul>${alts.map((a) =>
            `<li><code>${esc(a.transcript)}</code> → ${Judge.parseNumber(a.transcript) ?? Judge.parseLoose(a.transcript) ?? '—'}（確信度 ${a.confidence ? a.confidence.toFixed(2) : '不明'}）</li>`).join('')}</ul></details>`;
      },
      onNoSpeech: () => { $('btn-test').disabled = false; out.textContent = '声が聞こえませんでした（判定C：不正解にはしません）'; },
      onUnavailable: (code) => { $('btn-test').disabled = false; out.textContent = `マイクが使えません：${code}`; },
    });
  }

  // ---------- 開発用：テンポ計測 ----------
  const ms = (v) => (typeof v === 'number' ? `${v}` : '—');
  const avg = (xs) => (xs.length ? Math.round(xs.reduce((a, b) => a + b, 0) / xs.length) : null);

  // TTS終了 → 受付可能 までの待ち（読み上げ中から受付済みなら 0）
  function acceptLag(r) {
    if (r.m.ttsEnd === undefined) return null;
    if (r.liveAtTtsEnd) return 0;
    return r.m.onstart !== undefined ? Math.max(0, r.m.onstart - r.m.ttsEnd) : null;
  }

  function renderPerf() {
    const rows = Perf.list.slice(-40).reverse();
    if (!rows.length) { $('perf-table').innerHTML = '<p class="note">まだ計測記録がありません（練習すると記録されます）</p>'; return; }
    const lags = rows.map(acceptLag).filter((v) => v !== null);
    const trans = rows.filter((r) => r.fromPrevCorrect !== null && r.m.ttsStart !== undefined).map((r) => r.fromPrevCorrect + r.m.ttsStart);
    $('perf-table').innerHTML =
      `<p class="note">平均：TTS終了→受付 ${ms(avg(lags))}ms ／ 正解→次の読み上げ開始（つづけて）${ms(avg(trans))}ms</p>
      <table class="events"><thead><tr><th>問題</th><th>モード</th><th>読み上げ<br>開始〜終了</th><th>TTS終了→<br>受付</th><th>正解→次の<br>読み上げ開始</th><th>発話検知<br>(TTS終了から)</th><th>確定<br>(TTS終了から)</th><th>判定</th><th>聞こえた</th><th>捨てた<br>読み上げ</th></tr></thead><tbody>` +
      rows.map((r) => {
        const te = r.m.ttsEnd;
        const rel = (k) => (te !== undefined && r.m[k] !== undefined ? r.m[k] - te : undefined);
        const lag = acceptLag(r);
        return `<tr><td>${esc(r.q)}</td><td>${MODE[r.mode] || ''}${r.level ? '・' + r.level : ''}</td>
          <td>${ms(r.m.ttsStart)}〜${ms(te)}${r.ttsHow && r.ttsHow !== 'end' ? ` <span class="warn">(${esc(r.ttsHow)})</span>` : ''}</td>
          <td>${lag === 0 ? '0（読み上げ中から受付済）' : ms(lag)}</td>
          <td>${r.fromPrevCorrect !== null && r.m.ttsStart !== undefined ? r.fromPrevCorrect + r.m.ttsStart : '—'}</td>
          <td>${ms(rel('interim') ?? rel('speechstart'))}</td><td>${ms(rel('final'))}</td>
          <td>${esc(r.kind || '')}</td><td>${esc(r.heard || '')}</td><td>${r.echoIgnored || ''}</td></tr>`;
      }).join('') + '</tbody></table>';
  }

  // ---------- 開発用：マイク受付方式の比較 ----------
  // Chrome が返した文字列をそのまま見せる（JSON 表記＋ふつうでない文字のコード）。補正はしない
  function rawShow(s) {
    const str = String(s ?? '');
    const odd = [...new Set([...str].filter((c) => !/[ぁ-ゖァ-ヺー一-龠々〆0-9０-９\s]/.test(c)))];
    return `<code>${esc(JSON.stringify(str))}</code>${odd.length ? ` <span class="x">［${odd.map((c) => `${esc(c)} = U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`).join('、')}］</span>` : ''}`;
  }

  function renderAB() {
    const rows = Perf.list.filter((x) => x.judges && x.q && x.q.startsWith('5×'));
    if (!rows.length) { $('ab-table').innerHTML = '<p class="note">まだ記録がありません（5の段を練習すると記録されます）</p>'; return; }
    const groups = {};
    rows.forEach((x) => { const k = `${x.micMode || 'A'}|${x.q}`; (groups[k] = groups[k] || []).push(x); });
    const keys = Object.keys(groups).sort((a, b) => a.localeCompare(b, 'ja', { numeric: true }));
    $('ab-table').innerHTML = `<table class="events"><thead><tr><th>方式</th><th>問題</th><th>出題</th><th>1回目で正解</th><th>正解までの<br>聞き取り直し（平均）</th><th>判定の内訳</th><th>TTS終了→正解<br>（平均）</th><th>Chrome が返した文字列（正解以外）</th></tr></thead><tbody>${keys.map((k) => {
      const [mode, q] = k.split('|');
      const xs = groups[k];
      const firstA = xs.filter((x) => x.judges.filter((j) => !j.fromTts)[0] && x.judges.filter((j) => !j.fromTts)[0].kind === 'A').length;
      const retries = xs.map((x) => { const real = x.judges.filter((j) => !j.fromTts); const ai = real.findIndex((j) => j.kind === 'A'); return ai === -1 ? real.length : ai; });
      const all = xs.flatMap((x) => x.judges);
      const count = (pred) => all.filter(pred).length;
      const toA = xs.map((x) => (x.judges.find((j) => j.kind === 'A') || {}).afterTtsMs).filter((v) => typeof v === 'number');
      const misses = all.filter((j) => j.kind !== 'A').map((j) => `${rawShow(j.heard)}→${j.kind}${j.fromTts ? '（読み上げ中に始まった区間）' : ''}`).slice(-8).join('<br>');
      return `<tr><td><b>${mode}</b></td><td>${q}</td><td>${xs.length}</td><td>${firstA}/${xs.length}</td><td>${(retries.reduce((a, b) => a + b, 0) / xs.length).toFixed(1)}回</td>
        <td>A${count((j) => j.kind === 'A')}・B${count((j) => j.kind === 'B')}・C${count((j) => j.kind === 'C' && !j.fromTts)}・読み上げ由来${count((j) => j.fromTts)}</td>
        <td>${toA.length ? Math.round(toA.reduce((a, b) => a + b, 0) / toA.length) + 'ms' : '—'}</td><td class="w">${misses || '—'}</td></tr>`;
    }).join('')}</tbody></table>`;
  }

  // 生ログを「問題」ごとに区切る
  function questionGroups() {
    const all = RawLog.list;
    const groups = [];
    let cur = null;
    all.forEach((x) => {
      if (x.type === 'question') { cur = { head: x, items: [x] }; groups.push(cur); } else if (cur) cur.items.push(x);
    });
    return groups;
  }

  function renderTimelinePicker() {
    const gs = questionGroups();
    const sel = $('tl-pick');
    const prev = sel.value;
    sel.innerHTML = gs.map((g, i) => `<option value="${i}">${esc(g.head.clock)} ${esc(g.head.ctx)}</option>`).reverse().join('');
    if (prev && +prev < gs.length) sel.value = prev;
  }

  function renderTimeline() {
    const gs = questionGroups();
    const g = gs[+$('tl-pick').value];
    if (!g) { $('tl-view').innerHTML = '<p class="note">練習すると、問題ごとのタイムラインが表示されます</p>'; return; }
    const t0 = g.head.t;
    const ttsEnd = (g.items.find((x) => x.type === 'ttsEnd') || {}).t;
    const rel = (t) => `${t - t0 >= 0 ? '+' : ''}${t - t0}ms`;
    const flag = (t) => (ttsEnd === undefined ? '' : t < ttsEnd ? ' <b class="warn">← 読み上げ終了前</b>' : ` <span class="x">（読み上げ終了から ${t - ttsEnd}ms）</span>`);
    const LABEL = {
      question: '問題', ttsRequest: '読み上げ 要求', ttsStart: '読み上げ 開始', ttsEnd: '読み上げ 終了', create: '認識 作成', configure: '認識 設定変更',
      startCall: 'recognition.start()', start: 'recognition onstart（受付開始）', audiostart: 'audiostart', soundstart: 'soundstart', speechstart: 'speechstart',
      speechend: 'speechend', soundend: 'soundend', audioend: 'audioend', result: 'result', judge: '判定', end: 'recognition onend', abort: 'abort', error: 'error',
    };
    $('tl-view').innerHTML = `<p class="note">${esc(g.head.ctx)}・方式 ${esc(g.head.micMode || 'A')}・設定 ${esc(JSON.stringify(g.head.micConfig || {}))}${ttsEnd !== undefined ? `・読み上げ終了 ${rel(ttsEnd)}` : ''}</p>
      <table class="events"><tbody>${g.items.map((x) => {
        let detail = '';
        if (x.type === 'question') detail = `正解 ${x.answer}（受け付ける読み ${(x.accepted || []).map(esc).join(' / ')}）`;
        else if (x.type === 'ttsRequest' || x.type === 'ttsStart') detail = `「${esc(x.text)}」`;
        else if (x.type === 'ttsEnd') detail = `「${esc(x.text)}」（${esc(x.how)}）`;
        else if (x.type === 'create') detail = `#${x.rec} continuous=${x.continuous} interim=${x.interimResults} maxAlternatives=${x.maxAlternatives} lang=${esc(x.lang)}`;
        else if (x.type === 'result') {
          detail = `#${x.rec} resultIndex ${x.resultIndex}／全${x.total}<br>` + x.results.map((rr) =>
            `[${rr.i}] ${rr.isFinal ? '<b>final</b>' : 'interim'} 区間の最初の検知 ${rr.firstSeen !== undefined ? rel(rr.firstSeen) + flag(rr.firstSeen) : '—'}<br>　Chrome raw：${rr.alts.map(([t, c]) => `${rawShow(t)}${typeof c === 'number' && c > 0 ? `（${c}）` : ''}`).join(' / ')}`).join('<br>');
        } else if (x.type === 'judge') {
          detail = x.candidates.map((c) => `Chrome raw ${rawShow(c.transcript)} → 正規化 <code>${esc(c.normalized)}</code> → 数 ${c.strict ?? '—'}（問題を除く [${c.withoutPrompt.map(esc).join(', ')}]・候補 [${c.strictCandidates.join(', ')}]）`).join('<br>') +
            `<br>→ 判定 <b>${x.kind}</b>${x.reason ? '（' + esc(x.reason) + '）' : ''}${x.fromTts ? ' <b class="warn">読み上げ中に始まった区間として扱った</b>' : ''}`;
        } else if (x.rec) detail = `#${x.rec}${x.error ? ' ' + esc(x.error) : ''}${x.autoRestart ? '（自動で開き直す）' : ''}`;
        const showFlag = ['speechstart', 'soundstart', 'start', 'startCall', 'speechend'].includes(x.type) ? flag(x.t) : '';
        return `<tr><td class="t">${rel(x.t)}</td><td><b>${esc(LABEL[x.type] || x.type)}</b>${showFlag}</td><td class="w">${detail}</td></tr>`;
      }).join('')}</tbody></table>
      <p class="note">※ continuous（A・B）では Chrome は speechstart を認識1回につき最初の1回しか出さないことが多いため、各結果の「区間の最初の検知」もあわせて見てください。</p>`;
  }

  // ---------- 開発用：音声認識の生ログ ----------
  function renderRaw() {
    const all = RawLog.list;
    const caps = [...all].reverse().find((x) => x.type === 'caps');
    const results = all.filter((x) => x.type === 'result');
    const maxReturned = results.reduce((m, x) => Math.max(m, ...x.results.map((r) => r.alts.length)), 0);
    $('raw-caps').innerHTML = caps
      ? `maxAlternatives 設定 ${caps.maxAlternativesSet} ／ Chrome が実際に返した候補数 最大 <b>${results.length ? maxReturned : '—'}</b>（結果 ${results.length}件）・continuous ${caps.continuous}・interimResults ${caps.interimResults}・phrases ${caps.hasPhrases ? 'あり' : 'なし'}・processLocally ${caps.hasProcessLocally ? 'あり' : 'なし'}`
      : 'まだ音声認識を開始していません';
    const f = $('raw-filter').value;
    let rows = all;
    if (f === 'key') rows = all.filter((x) => ['question', 'result', 'judge', 'error', 'caps'].includes(x.type));
    if (f === 'recital') rows = all.filter((x) => String(x.ctx).startsWith('recital'));
    rows = rows.slice(-200).reverse();
    const t0 = all.length ? all[0].t : 0;
    $('raw-log').innerHTML = rows.length ? `<table class="events"><tbody>${rows.map((x) => {
      let detail = '';
      if (x.type === 'result') {
        detail = `resultIndex ${x.resultIndex} / 全${x.total}<br>` + x.results.map((r) => `[${r.i}] ${r.isFinal ? '<b>final</b>' : 'interim'}：${fmtAlts(r.alts)}`).join('<br>');
      } else if (x.type === 'judge') {
        detail = `<b>${x.kind}</b>${x.reason ? '（' + esc(x.reason) + '）' : ''}${x.via ? ' via ' + esc(x.via) : ''}${x.fromTts ? ' ※読み上げ中に始まった区間' : ''}<br>` +
          x.candidates.map((c) => `<code>${esc(c.transcript)}</code>(${c.confidence ? Math.round(c.confidence * 1000) / 1000 : '—'}) → 正規化 <code>${esc(c.normalized)}</code>・数 ${c.strict ?? '—'}・問題を除く [${c.withoutPrompt.map(esc).join(', ')}]・読み一致 ${c.readingMatch ? '○' : '×'}・候補 [${c.strictCandidates.join(', ')}]／同音 [${c.looseCandidates.join(', ')}]`).join('<br>');
      } else if (x.type === 'question') {
        detail = `正解 ${x.answer}・受け付ける読み ${(x.accepted || []).map(esc).join(' / ')}`;
      } else if (x.type === 'error') {
        detail = esc(x.error);
      } else if (x.type === 'caps') {
        detail = esc(x.ua);
      } else if (x.type === 'end') {
        detail = x.autoRestart ? '（自動で開き直す）' : '';
      }
      return `<tr><td class="t">+${((x.t - t0) / 1000).toFixed(2)}s<br><span class="x">${esc(x.clock)}</span></td><td>${esc(x.ctx)}</td><td><b>${esc(x.type)}</b></td><td class="w">${detail}</td></tr>`;
    }).join('')}</tbody></table>` : '<p class="note">ログはまだありません</p>';
  }

  // 同じ端末で 旧方式（読み上げ終了後に新しく作って start）と 新方式（開きっぱなし）を比べる
  async function measureLag() {
    const out = $('lag-out');
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR || !window.speechSynthesis) { out.textContent = 'この端末では音声認識か読み上げが使えません'; return; }
    $('btn-lag').disabled = true;
    Mic.stop();
    Listener.stop();
    const e = kukuEntry(5, 3);
    const sleep = (t) => new Promise((r) => setTimeout(r, t));
    const waitStart = (r) => new Promise((res) => {
      r.onstart = () => res(performance.now());
      r.onerror = (ev) => res({ error: ev.error });
      setTimeout(() => res(null), 5000);
    });
    const oldLags = [], newLags = [], heard = [];
    out.textContent = '旧方式を計測中…（声を出さないでください）';

    for (let i = 0; i < 3; i++) {
      // 旧方式：60ms 待って読み上げ → onend の 120ms 後に解決 → 新しいインスタンスを start
      const tEnd = await new Promise((res) => {
        speechSynthesis.cancel();
        setTimeout(() => {
          const u = new SpeechSynthesisUtterance(e.ttsText);
          u.lang = 'ja-JP'; u.rate = Store.settings.speechRate || 0.85;
          u.onend = () => { const t = performance.now(); setTimeout(() => res(t), 120); };
          u.onerror = () => res(null);
          speechSynthesis.speak(u);
        }, 60);
        setTimeout(() => res(null), 6000);
      });
      const r = new SR(); r.lang = 'ja-JP'; r.continuous = false;
      const p = waitStart(r);
      r.start();
      const t = await p;
      if (t && t.error) { out.textContent = `マイクが使えません：${t.error}`; $('btn-lag').disabled = false; return; }
      if (tEnd && t) oldLags.push(Math.round(t - tEnd));
      try { r.abort(); } catch (err) { /* noop */ }
      await sleep(600);
    }

    out.textContent = '新方式を計測中…（声を出さないでください）';
    for (let i = 0; i < 3; i++) {
      // 新方式：読み上げ前から開いておく（continuous）
      const r = new SR(); r.lang = 'ja-JP'; r.continuous = true; r.interimResults = true; r.maxAlternatives = 5;
      r.onresult = (ev) => {
        for (let k = ev.resultIndex; k < ev.results.length; k++) {
          if (!ev.results[k].isFinal) continue;
          const alts = [...ev.results[k]].map((a) => ({ transcript: a.transcript, confidence: a.confidence }));
          heard.push({ transcript: alts[0].transcript, kind: Judge.judge(alts, e).kind });
        }
      };
      const p = waitStart(r);
      r.start();
      let onstartAt = null;
      p.then((t) => { if (typeof t === 'number') onstartAt = t; });
      await Voice.speak(e.ttsText, { force: true });
      const tEnd = performance.now();
      await sleep(30);
      if (onstartAt === null) await p;
      if (onstartAt !== null) newLags.push(Math.max(0, Math.round(onstartAt - tEnd)));
      await sleep(1800);   // 読み上げの聞こえ残りが結果として来るか待つ
      try { r.abort(); } catch (err) { /* noop */ }
      await sleep(400);
    }

    out.innerHTML =
      `<div>旧方式　TTS終了→受付開始：<b>${oldLags.join(' / ') || '—'} ms</b>（平均 ${ms(avg(oldLags))}ms）</div>` +
      `<div>新方式　TTS終了→受付開始：<b>${newLags.join(' / ') || '—'} ms</b>（平均 ${ms(avg(newLags))}ms、0 = 読み上げ中から受付済み）</div>` +
      `<div>新方式で読み上げ「${esc(e.ttsText)}」をマイクが拾った結果：${heard.length
        ? heard.map((x) => `<code>${esc(x.transcript)}</code>→${x.kind}`).join(' ') + '（A以外はアプリ内で黙って捨てます）'
        : 'なし'}</div>`;
    $('btn-lag').disabled = false;
  }

  function open() {
    if (typeof stopPlay === 'function') stopPlay();
    Store.endSession();
    tabDan = DAN;
    $('test-dan').value = String(DAN);
    renderSettings();
    renderSessions();
    renderDanTabs();
    renderRecords();
    renderTestPrompt();
    renderPerf();
    renderRaw();
    document.querySelectorAll('input[name="mic-mode"]').forEach((x) => { x.checked = x.value === (Store.settings.micMode || 'A'); });
    renderAB();
    renderTimelinePicker();
    renderTimeline();
    $('test-out').textContent = '';
    show('parent');
  }

  function init() {
    $('set-test').onchange = (ev) => {
      Store.endSession();
      Store.setSetting('testMode', ev.target.checked);
      $('test-banner').hidden = !ev.target.checked;
    };
    $('set-voice').onchange = (ev) => Store.setSetting('voiceEnabled', ev.target.checked);
    $('set-dev').onchange = (ev) => {
      Store.setSetting('devTools', ev.target.checked);
      $('dev-tools').hidden = !ev.target.checked;
      if (!ev.target.checked) { RawLog.clear(); Perf.clear(); }   // OFF にしたら一時保存していた開発用ログも消す
    };
    $('btn-export').onclick = () => {
      const blob = new Blob([Store.exportJSON()], { type: 'application/json' });
      const a = document.createElement('a');
      const d = new Date();
      a.href = URL.createObjectURL(blob);
      a.download = `kuku-renshu-${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}.json`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    };
    $('file-import').onchange = async (ev) => {
      const f = ev.target.files && ev.target.files[0];
      ev.target.value = '';
      if (!f) return;
      if (!confirm('この端末の今の記録を、ファイルの記録に置きかえます。よろしいですか？')) return;
      const res = Store.importJSON(await f.text());
      $('import-result').textContent = res.ok ? `読み込みました（練習セッション ${res.sessions}件）` : `読み込めませんでした：${res.reason}`;
      if (res.ok) { DAN = Store.settings.dan || 5; open(); }
    };
    $('set-sound').onchange = (ev) => Store.setSetting('soundEnabled', ev.target.checked);
    $('set-rate').oninput = (ev) => {
      Store.setSetting('speechRate', +ev.target.value);
      $('set-rate-val').textContent = (+ev.target.value).toFixed(2);
    };
    $('set-voice-name').onchange = (ev) => Store.setSetting('voiceName', ev.target.value);
    $('btn-rate-test').onclick = () => Voice.speak(testEntry().fullTtsText, { force: true });
    $('btn-sound-test').onclick = () => { Sound.unlock(); Sound.pinpon(); setTimeout(() => Sound.pu(), 900); };

    $('test-dan').innerHTML = DANS.map((d) => `<option value="${d}">${d}のだん</option>`).join('');
    $('test-target').innerHTML = MULTIPLIERS.map((n) => `<option value="${n}">×${n}</option>`).join('');
    $('test-target').value = '3';
    $('test-dan').onchange = renderTestPrompt;
    $('test-target').onchange = renderTestPrompt;
    $('btn-test').onclick = runTest;
    $('btn-lag').onclick = measureLag;
    $('raw-filter').onchange = renderRaw;
    document.querySelectorAll('input[name="mic-mode"]').forEach((x) => { x.onchange = () => { Store.setSetting('micMode', x.value); }; });
    $('btn-ab-refresh').onclick = renderAB;
    $('tl-pick').onchange = renderTimeline;
    $('btn-tl-refresh').onclick = () => { renderTimelinePicker(); renderTimeline(); };
    $('btn-raw-refresh').onclick = renderRaw;
    $('btn-raw-clear').onclick = () => { RawLog.clear(); renderRaw(); };
    $('btn-raw-copy').onclick = () => {
      const text = JSON.stringify(RawLog.list, null, 1);
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => { $('btn-raw-copy').textContent = 'コピーしました'; });
    };
    $('btn-perf-clear').onclick = () => { Perf.clear(); renderPerf(); };
    $('btn-perf-copy').onclick = () => {
      const text = JSON.stringify(Perf.list, null, 1);
      if (navigator.clipboard) navigator.clipboard.writeText(text).then(() => { $('btn-perf-copy').textContent = 'コピーしました'; });
    };

    $('btn-reset').onclick = () => {
      if (!confirm('成長記録と練習セッションをすべて消します。よろしいですか？（設定は残ります）')) return;
      Store.resetRecords();
      renderSessions();
      renderRecords();
    };
    $('btn-parent-back').onclick = () => { Listener.stop(); goTop(); };
  }

  return { open, init };
})();
