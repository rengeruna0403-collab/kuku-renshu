// 効果音（Web Audio API で生成。外部素材なし）・読み上げ・音声認識
const Sound = (() => {
  let ctx = null;
  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, start, dur, vol, type) {
    const c = ensure();
    if (!c) return;
    const t0 = c.currentTime + start;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  return {
    unlock: ensure,
    // ピンポン♪：明るい2音
    pinpon() {
      if (!Store.settings.soundEnabled) return;
      tone(1318.5, 0, 0.32, 0.22, 'sine');      // E6
      tone(1046.5, 0.16, 0.5, 0.2, 'sine');     // C6
    },
    // プッ♪：短く低刺激
    pu() {
      if (!Store.settings.soundEnabled) return;
      tone(392, 0, 0.11, 0.09, 'sine');          // G4
    },
  };
})();

const Voice = (() => {
  const synth = window.speechSynthesis || null;
  let voices = [];
  let seq = 0;

  function loadVoices() {
    if (!synth) return;
    voices = synth.getVoices().filter((v) => /^ja/i.test(v.lang));
  }
  if (synth) {
    loadVoices();
    synth.onvoiceschanged = loadVoices;
  }

  function pickVoice() {
    const name = Store.settings.voiceName;
    if (name) {
      const v = voices.find((x) => x.name === name);
      if (v) return v;
    }
    // ローカル音声を優先（onend が安定しているため）
    return voices.find((v) => v.localService) || voices[0] || null;
  }

  function cancel() {
    seq++;
    if (synth) synth.cancel();
  }

  // 読み上げ終了で resolve（値は終わり方：'end' | 'fallback' | 'nostart' | 'error' | 'skip'）。
  // 余計な待ち時間は入れない：onend を受けたら即 resolve。
  // onend が来ない端末への保険は、読み上げが始まってからの推定時間で打ち切る。
  function speak(text, { force = false, onStart } = {}) {
    return new Promise((resolve) => {
      if (!synth || (!Store.settings.voiceEnabled && !force) || !text) { resolve('skip'); return; }
      ++seq;
      if (synth.speaking || synth.pending) synth.cancel();
      const rate = Store.settings.speechRate || 0.85;
      let done = false;
      let timer = null;
      const finish = (how) => { if (done) return; done = true; clearTimeout(timer); RawLog.add('ttsEnd', { text, how }); resolve(how); };
      RawLog.add('ttsRequest', { text });
      // 1.5秒たっても読み上げが始まらなければ、音が出ていないとみなして先へ進む
      timer = setTimeout(() => finish('nostart'), 1500);
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'ja-JP';
      u.rate = rate;
      const v = pickVoice();
      if (v) u.voice = v;
      u.onstart = () => {
        RawLog.add('ttsStart', { text });
        clearTimeout(timer);
        timer = setTimeout(() => finish('fallback'), 400 + (text.length * 220) / rate);
        if (onStart) onStart();
      };
      u.onend = () => finish('end');
      u.onerror = () => finish('error');
      synth.speak(u);
    });
  }

  // iPad・iPhone の Safari は、最初の読み上げを画面タップの中で行わないと音が出ない。
  // 最初のタップで無音の読み上げをしておく（以後はタップの外でも読み上げられる）
  let unlocked = false;
  function unlock() {
    if (!synth || unlocked) return;
    unlocked = true;
    try { const u = new SpeechSynthesisUtterance(''); u.volume = 0; synth.speak(u); } catch (e) { /* noop */ }
  }

  return { speak, cancel, unlock, get voices() { loadVoices(); return voices; }, supported: !!synth };
})();

// 練習中ずっと開いておくマイク（問題ごとに作り直さない）
//   continuous で開きっぱなしにし、終わってしまったら onend で同じインスタンスを即 start し直す。
//   読み上げ中も受付を止めないので、読み上げ直後の即答の頭を取りこぼさない。
//   答えを含む読み上げ（みながら・こたえをみる 等）の前後は flush() で中身を捨てて開き直す。
const Mic = (() => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  let rec = null;
  let want = false;      // 開いておきたいか
  let live = false;      // onstart 済み（実際に受付中）
  let starting = false;
  let h = {};            // onLive, onFinal(alts), onInterim, onSpeechStart, onNoSpeech, onUnavailable
  let lastStartCall = 0;
  let lastOnstart = 0;
  let segFirst = [];     // 音声区間（result の番号）ごとの最初の検知時刻
  let liveWaiters = [];
  let endWaiter = null;  // stopGracefully() の終了待ち
  let capsLogged = false;
  const round = (c) => (typeof c === 'number' ? Math.round(c * 1000) / 1000 : c);
  // 認識の設定（開発用の比較で切り替える。通常は continuous + interim）
  let cfg = { continuous: true, interimResults: true };
  let recNo = 0;         // 作った認識インスタンスの通し番号（resultIndex はインスタンスごとに 0 から）

  function create() {
    const r = new SR();
    r._no = ++recNo;
    r.lang = 'ja-JP';
    r.continuous = cfg.continuous;
    r.interimResults = cfg.interimResults;
    r.maxAlternatives = 5;
    RawLog.add('create', { rec: r._no, continuous: r.continuous, interimResults: r.interimResults, maxAlternatives: r.maxAlternatives, lang: r.lang });
    if (!capsLogged) {
      capsLogged = true;
      RawLog.add('caps', { maxAlternativesSet: r.maxAlternatives, continuous: r.continuous, interimResults: r.interimResults, hasPhrases: 'phrases' in r, hasProcessLocally: 'processLocally' in r, ua: navigator.userAgent });
    }
    ['audiostart', 'soundstart', 'speechend', 'soundend', 'audioend'].forEach((ev) => {
      r['on' + ev] = () => { if (r === rec) RawLog.add(ev, { rec: r._no }); };
    });
    r.onstart = () => {
      RawLog.add('start', { rec: r._no });
      if (r !== rec) return;
      starting = false;
      live = true;
      lastOnstart = performance.now();
      segFirst = [];
      liveWaiters.forEach((f) => f(true));
      liveWaiters = [];
      if (h.onLive) h.onLive();
    };
    r.onspeechstart = () => { if (r !== rec) return; RawLog.add('speechstart', { rec: r._no }); if (h.onSpeechStart) h.onSpeechStart(); };
    r.onresult = (e) => {
      if (r !== rec) return;
      const snap = [];
      const nowT = performance.now();
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (!res) continue;
        if (segFirst[i] === undefined) segFirst[i] = nowT;
        const alts = [];
        for (let j = 0; j < res.length; j++) alts.push([res[j].transcript, round(res[j].confidence)]);
        // firstSeen：この区間（result の番号）が最初に届いた時刻（performance.now）
        snap.push({ i, isFinal: res.isFinal, alts, firstSeen: Math.round(segFirst[i]) });
      }
      RawLog.add('result', { rec: r._no, resultIndex: e.resultIndex, total: e.results.length, results: snap });
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const res = e.results[i];
        if (!res) continue;
        if (segFirst[i] === undefined) segFirst[i] = performance.now();
        if (!res.isFinal) { if (h.onInterim) h.onInterim(res[0].transcript, segFirst[i], i); continue; }
        const alts = [];
        for (let j = 0; j < res.length; j++) alts.push({ transcript: res[j].transcript, confidence: res[j].confidence });
        h.onFinal(alts, segFirst[i], i);
      }
    };
    r.onerror = (e) => {
      if (r !== rec) return;
      RawLog.add('error', { rec: r._no, error: e.error, message: e.message || '' });
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture' || e.error === 'network') {
        want = false;
        if (h.onUnavailable) h.onUnavailable(e.error);
      } else if (e.error === 'no-speech') {
        if (h.onNoSpeech) h.onNoSpeech();
      }
    };
    r.onend = () => {
      if (r !== rec) return;
      RawLog.add('end', { rec: r._no, autoRestart: want });
      live = false;
      starting = false;
      if (endWaiter) { const f = endWaiter; endWaiter = null; f(); return; }
      if (want) {
        if (h.onEnded) h.onEnded();
        kick();   // 待たずにすぐ開き直す
      }
    };
    return r;
  }

  function kick() {
    if (!SR || live || starting) return;
    if (!rec) rec = create();
    starting = true;
    lastStartCall = performance.now();
    RawLog.add('startCall', { rec: rec._no });
    try {
      rec.start();
    } catch (e) {
      // 再利用できなかったときだけ作り直す
      rec = create();
      try { rec.start(); } catch (e2) { starting = false; }
    }
  }

  return {
    supported: !!SR,
    setHandlers(handlers) { h = handlers; },
    // 認識の設定を変える（変わったら今の認識は止める。次の start で新しい設定で作る）
    configure(next) {
      const c = { ...cfg, ...next };
      if (c.continuous === cfg.continuous && c.interimResults === cfg.interimResults) return;
      cfg = c;
      this.stop();
      RawLog.add('configure', { ...cfg });
    },
    get config() { return { ...cfg }; },
    start() { want = true; kick(); },
    stop() {
      want = false;
      live = false;
      starting = false;
      if (rec) { const r = rec; rec = null; RawLog.add('abort', { rec: r._no }); try { r.abort(); } catch (e) { /* noop */ } }
    },
    // 確定していない認識を Chrome に確定させてから止める（abort だと途中の認識が捨てられる）。
    // stop() のあと最後の final result → onend が来るのを最大 timeout ms 待つ
    stopGracefully(timeout = 1500) {
      return new Promise((resolve) => {
        want = false;
        const r = rec;
        if (!r || (!live && !starting)) { this.stop(); resolve(); return; }
        let done = false;
        const fin = () => { if (done) return; done = true; endWaiter = null; this.stop(); resolve(); };
        endWaiter = fin;
        RawLog.add('stopGracefully');
        try { r.stop(); } catch (e) { fin(); return; }
        setTimeout(fin, timeout);
      });
    },
    // 聞いた中身を捨てて開き直す（アプリ自身が答えを読み上げた後など）
    flush() {
      this.stop();
      want = true;
      kick();
    },
    // 受付中になるまで待つ（最大 timeout ms）。読み上げを「聞いていないマイク」に向けて始めないため
    whenLive(timeout) {
      if (live || !SR) return Promise.resolve(live);
      return new Promise((res) => {
        liveWaiters.push(res);
        setTimeout(() => res(live), timeout);
      });
    },
    get live() { return live; },
    get wanted() { return want; },
    get lastStartCall() { return lastStartCall; },
    get lastOnstart() { return lastOnstart; },
  };
})();

const Listener = (() => {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  let rec = null;
  let token = 0;

  function stop() {
    token++;
    if (rec) {
      try { rec.onresult = rec.onerror = rec.onend = null; rec.abort(); } catch (e) { /* noop */ }
      rec = null;
    }
  }

  // handlers: onResult(alts), onNoSpeech(), onUnavailable(code), onStart()
  function listen(handlers) {
    stop();
    if (!SR) { handlers.onUnavailable && handlers.onUnavailable('unsupported'); return; }
    const my = ++token;
    const r = new SR();
    rec = r;
    r.lang = 'ja-JP';
    r.continuous = false;
    r.interimResults = false;
    r.maxAlternatives = 5;
    let got = false;
    let errored = false;
    r.onstart = () => { if (my === token && handlers.onStart) handlers.onStart(); };
    r.onresult = (e) => {
      if (my !== token) return;
      got = true;
      const res = e.results[e.results.length - 1];
      const alts = [];
      for (let i = 0; i < res.length; i++) alts.push({ transcript: res[i].transcript, confidence: res[i].confidence });
      handlers.onResult(alts);
    };
    r.onerror = (e) => {
      if (my !== token) return;
      errored = true;
      if (e.error === 'no-speech' || e.error === 'aborted') handlers.onNoSpeech();
      else if (e.error === 'not-allowed' || e.error === 'service-not-allowed' || e.error === 'audio-capture') handlers.onUnavailable(e.error);
      else if (e.error === 'network') handlers.onUnavailable('network');
      else handlers.onNoSpeech();
    };
    r.onend = () => {
      if (my !== token) return;
      rec = null;
      if (!got && !errored) handlers.onNoSpeech();
    };
    try { r.start(); } catch (e) { handlers.onNoSpeech(); }
  }

  return { listen, stop, supported: !!SR };
})();
