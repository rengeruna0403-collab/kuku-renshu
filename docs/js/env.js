// 公開環境のチェック（HTTPS・音声認識・読み上げ・端末）と、ホーム画面アプリ（PWA）の登録
// 音声や認識結果を独自のサーバーへ送る処理はない。
// ※ ただしブラウザの音声認識そのもの（Chrome＝Google、Safari＝Apple）は、音声を各社のサーバーで文字にする。
const Env = (() => {
  const ua = navigator.userAgent;
  const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const isStandalone = (window.matchMedia && matchMedia('(display-mode: standalone)').matches) || navigator.standalone === true;
  const secure = window.isSecureContext !== false;
  const srSupported = !!(window.SpeechRecognition || window.webkitSpeechRecognition);
  const ttsSupported = !!window.speechSynthesis;
  const browser = /Edg\//.test(ua) ? 'Edge'
    : /CriOS|Chrome\//.test(ua) ? 'Chrome'
      : /FxiOS|Firefox\//.test(ua) ? 'Firefox'
        : /Safari\//.test(ua) ? 'Safari' : 'その他';

  // おうちのひと向けの注意（使えないものがあるときだけ）
  function problems() {
    const out = [];
    if (!secure) out.push('このページは https で開かれていないため、マイクが使えません。公開URL（https://…）から開いてください。');
    if (!srSupported) {
      out.push(isIOS
        ? 'このブラウザでは音声認識が使えません。iPad・iPhone は Safari で開いてください（「設定」→「一般」→「キーボード」→「音声入力」をオン）。'
        : 'このブラウザでは音声認識が使えません。Android・PC は Chrome で開いてください。');
    }
    if (navigator.onLine === false) out.push('インターネットにつながっていません。音声認識にはインターネットが必要です。');
    if (!ttsSupported) out.push('このブラウザでは問題の読み上げができません。');
    if (out.length && (!srSupported || !secure)) out.push('音声認識が使えなくても、「🎤 うまくきこえない」→「○ いえた」で、おうちのひとが判定して練習できます。');
    return out;
  }

  function renderNotice() {
    const el = document.getElementById('env-notice');
    if (!el) return;
    const p = problems();
    el.hidden = !p.length;
    el.innerHTML = p.length ? `<b>おうちのかたへ</b><br>${p.join('<br>')}` : '';
  }

  // マイクを許可する手順（端末・ブラウザ別）
  function micPermissionHelp() {
    if (isIOS) return 'iPad・iPhone：アドレスバーの「ぁあ」→「Webサイトの設定」→「マイク」を「許可」、または「設定」→「Safari」→「マイク」。';
    if (isAndroid) return 'Android：アドレスバー左のアイコン →「権限」→「マイク」を許可。';
    return 'PC：アドレスバー左のアイコン →「マイク」を許可して、ページを再読み込み。';
  }

  // ホーム画面アプリ用（オフラインでも画面は開ける。音声認識はオフラインでは使えない）
  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || !secure) return;
    navigator.serviceWorker.register('sw.js').catch(() => { /* 登録できなくても通常どおり使える */ });
  }

  function init() {
    renderNotice();
    window.addEventListener('online', renderNotice);
    window.addEventListener('offline', renderNotice);
    registerServiceWorker();
  }

  return { init, problems, micPermissionHelp, isIOS, isAndroid, isStandalone, secure, srSupported, ttsSupported, browser };
})();
