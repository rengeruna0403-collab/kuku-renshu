// 🍚 ちいさな ごちそうやさん（Phase 1：5の段）
// 九九を「料理の数」で体験するあそび。暗唱練習とは別の画面で、マイク（音声認識）は使わない。
//   1. お客さんが「ごはんを 3さら おねがい！」と注文する（1〜9さら）
//   2. 子どもが「ならべる」「もどす」で皿を用意する（1さらに 5こ。答えはまだ見せない）
//   3. 「ぜんぶで なんこ？ かくにん！」→ 皿が1まいずつ光って 5 → 10 → 15…（スキップ可）→「5 × 3 ＝ 15」
//   4. 確認したあとだけ「おとどけ」できる。間違い・時間制限・スコアはない
//   5. おとどけの回数で料理がふえる（ごはん → おにぎり 2回 → たまごやき 4回 → おだんご 6回）
const Shop = (() => {
  const DAN = 5;   // Phase 1 は 5の段だけ（1さらに入る数）

  const FOODS = [
    { id: 'rice', name: 'ごはん', label: 'しろい ごはん', unlockAt: 0 },
    { id: 'onigiri', name: 'おにぎり', label: 'おにぎり', unlockAt: 2 },
    { id: 'tamago', name: 'たまごやき', label: 'たまごやき', unlockAt: 4 },
    { id: 'dango', name: 'おだんご', label: 'おだんご', unlockAt: 6 },
  ];

  const ANIMALS = [
    { id: 'bear', name: 'くまさん', hello: 'こんにちは！', thanks: 'わーい！ ありがとう！ おなか ぺこぺこ だったんだ' },
    { id: 'rabbit', name: 'うさぎさん', hello: 'こんにちは〜', thanks: 'おいしそう！ うれしいな、ありがとう！' },
    { id: 'cat', name: 'ねこさん', hello: 'にゃあ、こんにちは！', thanks: 'にゃ〜ん！ ありがとう、いただきます！' },
  ];

  // ---------- え（SVG） ----------
  function foodSVG(id) {
    const s = {
      rice: '<path d="M17 54 Q17 20 50 17 Q83 20 83 54 Z" fill="#fff" stroke="#c9bfab" stroke-width="3"/><path d="M30 33 l5 -2 M47 26 l5 1 M62 32 l4 3 M38 44 l5 -1 M56 43 l5 1 M70 47 l3 -3 M25 47 l4 -2" stroke="#ddd5c4" stroke-width="2.6" stroke-linecap="round"/><path d="M9 52 H91 Q89 82 63 87 H37 Q11 82 9 52 Z" fill="#3f6fb5"/><path d="M9 52 H91 Q90.6 57 89.8 61 H10.2 Q9.4 57 9 52 Z" fill="#6f96d0"/><ellipse cx="50" cy="52" rx="41" ry="4.5" fill="#e8eef8" stroke="#2f5a99" stroke-width="2.5"/><circle cx="30" cy="72" r="3.4" fill="#fff" opacity=".85"/><circle cx="50" cy="75" r="3.4" fill="#fff" opacity=".85"/><circle cx="70" cy="72" r="3.4" fill="#fff" opacity=".85"/><path d="M37 87 H63 L60 95 H40 Z" fill="#2f5a99"/>',
      onigiri: '<path d="M50 10 Q58 10 86 66 Q92 84 76 86 L24 86 Q8 84 14 66 Q42 10 50 10 Z" fill="#fff" stroke="#bfb39b" stroke-width="5"/><rect x="33" y="58" width="34" height="28" rx="4" fill="#2f3b33"/>',
      tamago: '<rect x="6" y="18" width="88" height="64" rx="14" fill="#f8d35a" stroke="#d99f25" stroke-width="4"/><path d="M9 30 Q50 18 91 30" stroke="#e39a2c" stroke-width="6" fill="none" opacity=".55"/><path d="M50 52 m-7 0 a7 7 0 1 1 14 0 a14 14 0 1 1 -28 0 a21 21 0 1 1 42 0" stroke="#e2a82e" stroke-width="4" fill="none" stroke-linecap="round"/>',
      dango: '<line x1="50" y1="4" x2="50" y2="97" stroke="#b98a52" stroke-width="6" stroke-linecap="round"/><circle cx="50" cy="22" r="15" fill="#f6a8bb" stroke="#e48aa1" stroke-width="3"/><circle cx="50" cy="49" r="15" fill="#fff" stroke="#d6cdbb" stroke-width="3"/><circle cx="50" cy="76" r="15" fill="#9fd08a" stroke="#7fb86b" stroke-width="3"/>',
    }[id];
    return `<svg viewBox="0 0 100 100" aria-hidden="true">${s}</svg>`;
  }

  // mood: 'order'（ふつう）| 'happy'（よろこぶ）| 'wonder'（あれ？）
  function animalSVG(id, mood) {
    const c = { bear: ['#b07a4f', '#e3b88f'], rabbit: ['#fbf8f3', '#f4b8c6'], cat: ['#f2a35c', '#fbd3a8'] }[id];
    const ears = {
      bear: `<circle cx="28" cy="34" r="15" fill="${c[0]}"/><circle cx="92" cy="34" r="15" fill="${c[0]}"/><circle cx="28" cy="34" r="8" fill="${c[1]}"/><circle cx="92" cy="34" r="8" fill="${c[1]}"/>`,
      rabbit: `<ellipse cx="44" cy="20" rx="11" ry="30" fill="${c[0]}" stroke="#e6dccf" stroke-width="3"/><ellipse cx="76" cy="20" rx="11" ry="30" fill="${c[0]}" stroke="#e6dccf" stroke-width="3"/><ellipse cx="44" cy="22" rx="5" ry="20" fill="${c[1]}"/><ellipse cx="76" cy="22" rx="5" ry="20" fill="${c[1]}"/>`,
      cat: `<path d="M22 50 L28 14 L54 34 Z" fill="${c[0]}"/><path d="M98 50 L92 14 L66 34 Z" fill="${c[0]}"/><path d="M30 40 L32 24 L44 34 Z" fill="${c[1]}"/><path d="M90 40 L88 24 L76 34 Z" fill="${c[1]}"/>`,
    }[id];
    const stroke = id === 'rabbit' ? ' stroke="#e6dccf" stroke-width="3"' : '';
    const eyes = mood === 'happy'
      ? '<path d="M38 66 Q46 56 54 66" stroke="#3b3a36" stroke-width="5" fill="none" stroke-linecap="round"/><path d="M66 66 Q74 56 82 66" stroke="#3b3a36" stroke-width="5" fill="none" stroke-linecap="round"/>'
      : '<circle cx="46" cy="64" r="6" fill="#3b3a36"/><circle cx="74" cy="64" r="6" fill="#3b3a36"/><circle cx="48" cy="62" r="2" fill="#fff"/><circle cx="76" cy="62" r="2" fill="#fff"/>';
    const mouth = mood === 'happy'
      ? '<path d="M48 80 Q60 98 72 80 Z" fill="#e8737f"/>'
      : mood === 'wonder'
        ? '<circle cx="60" cy="84" r="5" fill="#3b3a36"/>'
        : '<path d="M52 80 Q56 86 60 80 Q64 86 68 80" stroke="#3b3a36" stroke-width="4" fill="none" stroke-linecap="round"/>';
    const muzzle = id === 'bear' ? `<ellipse cx="60" cy="82" rx="18" ry="13" fill="${c[1]}"/>` : '';
    const hearts = mood === 'happy'
      ? '<path class="heart h1" d="M104 22 c-4-6-14-2-10 6 l10 10 l10-10 c4-8-6-12-10-6z" fill="#f27a8f"/><path class="heart h2" d="M14 16 c-3-5-11-2-8 5 l8 8 l8-8 c3-7-5-10-8-5z" fill="#f6a8bb"/>'
      : '';
    return `<svg viewBox="0 0 120 120" aria-hidden="true">${ears}<circle cx="60" cy="70" r="42" fill="${c[0]}"${stroke}/>${muzzle}${eyes}<ellipse cx="34" cy="80" rx="8" ry="5" fill="#f7a3b4" opacity=".7"/><ellipse cx="86" cy="80" rx="8" ry="5" fill="#f7a3b4" opacity=".7"/>${mouth}${hearts}</svg>`;
  }

  // ---------- 状態 ----------
  // phase: 'order'（皿を用意）| 'counting'（数をかくにん中）| 'confirmed'（かくにんずみ）| 'delivered'（おとどけずみ）
  const S = { phase: 'order', animal: ANIMALS[0], order: 3, plates: 0, deck: [], lastAnimal: null, timer: null, run: 0 };

  const food = () => FOODS.find((f) => f.id === Store.shop.selected) || FOODS[0];
  const unlocked = (f) => Store.shop.deliveries >= f.unlockAt;

  // 1〜9 をまんべんなく出す（山札をシャッフル。同じ数が続かない）
  function nextOrder() {
    if (!S.deck.length) {
      S.deck = Array.from({ length: 9 }, (_, i) => i + 1);
      for (let i = S.deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [S.deck[i], S.deck[j]] = [S.deck[j], S.deck[i]]; }
      if (S.deck[S.deck.length - 1] === S.order && S.deck.length > 1) [S.deck[0], S.deck[S.deck.length - 1]] = [S.deck[S.deck.length - 1], S.deck[0]];
    }
    return S.deck.pop();
  }

  function nextAnimal() {
    const pool = ANIMALS.filter((a) => a !== S.lastAnimal);
    const a = pool[Math.floor(Math.random() * pool.length)];
    S.lastAnimal = a;
    return a;
  }

  // ---------- 画面 ----------
  function renderCustomer(mood, line) {
    $('shop-animal').innerHTML = animalSVG(S.animal.id, mood);
    $('shop-animal').className = 'shop-animal ' + mood;
    $('shop-name').textContent = S.animal.name;
    $('shop-line').textContent = line;
  }

  function orderLine() { return `${food().name}を ${S.order}さら おねがい！`; }

  function renderPlates() {
    const box = $('shop-plates');
    const svg = foodSVG(food().id);
    box.innerHTML = Array.from({ length: S.plates }, (_, i) =>
      `<div class="plate" data-i="${i}"><div class="plate-dish">${Array.from({ length: DAN }, (_, k) => `<span class="food f${k}">${svg}</span>`).join('')}</div><span class="plate-badge"></span></div>`).join('')
      + (S.phase === 'order' && S.plates < S.order ? Array.from({ length: S.order - S.plates }, () => '<div class="plate empty"><div class="plate-dish"></div></div>').join('') : '');
    box.dataset.count = Math.max(S.plates, S.phase === 'order' ? S.order : 0);
  }

  function renderControls() {
    const p = S.phase;
    const k = S.plates, n = S.order;
    $('shop-add').disabled = p !== 'order' || k >= 9;
    $('shop-remove').disabled = p !== 'order' || k <= 0;
    $('shop-prep').hidden = p !== 'order';
    const check = $('shop-check');
    check.hidden = p !== 'order';
    check.disabled = k !== n;
    check.textContent = k === n ? 'ぜんぶで なんこ？ かくにん！' : k < n ? `あと ${n - k}さら ならべてね` : `${k - n}さら おおいよ`;
    $('shop-plate-count').textContent = p === 'order' ? `おさら ${k}まい` : '';
    $('shop-skip').hidden = p !== 'counting';
    $('shop-result').hidden = !(p === 'confirmed' || p === 'delivered' || p === 'counting');
    $('shop-deliver').hidden = p !== 'confirmed';
    $('shop-next').hidden = p !== 'delivered';
    $('shop-foods').classList.toggle('locked-now', p !== 'order');
    renderFoods();
  }

  function renderFoods() {
    $('shop-foods').innerHTML = FOODS.map((f) => {
      const ok = unlocked(f);
      const on = Store.shop.selected === f.id;
      const left = f.unlockAt - Store.shop.deliveries;
      return `<button class="food-chip${on ? ' on' : ''}${ok ? '' : ' locked'}" data-id="${f.id}" ${ok && S.phase === 'order' ? '' : 'disabled'} aria-label="${f.label}">
        <span class="food-chip-ico">${foodSVG(f.id)}</span><span class="food-chip-name">${ok ? f.label : '？？？'}</span>${ok ? '' : `<span class="food-chip-lock">🔒 あと${left}かい</span>`}</button>`;
    }).join('');
    $('shop-foods').querySelectorAll('button.food-chip').forEach((b) => {
      b.onclick = () => {
        if (S.phase !== 'order') return;
        Store.setShop({ selected: b.dataset.id });
        renderPlates();
        renderFoods();
        renderCustomer('order', orderLine());
      };
    });
  }

  // ---------- 進行 ----------
  function newCustomer() {
    S.run++;
    clearTimeout(S.timer);
    S.animal = nextAnimal();
    S.order = nextOrder();
    S.plates = 0;
    S.phase = 'order';
    $('shop-total').textContent = '';
    $('shop-eq').textContent = '';
    $('shop-reading').textContent = '';
    $('shop-thanks').textContent = '';
    renderCustomer('order', `${S.animal.hello} ${orderLine()}`);
    renderPlates();
    renderControls();
    Voice.speak(orderLine());
  }

  function addPlate(d) {
    if (S.phase !== 'order') return;
    S.plates = Math.max(0, Math.min(9, S.plates + d));
    renderPlates();
    renderControls();
    // 多すぎても失敗にしない。お客さんが「あれ？」と気づくだけ
    if (S.plates > S.order) renderCustomer('wonder', `あれ？ ${S.order}さらで いいよ`);
    else renderCustomer('order', orderLine());
  }

  // 数をかくにん：1まいずつ光らせて 5 → 10 → 15…
  async function startCount() {
    if (S.phase !== 'order' || S.plates !== S.order) return;
    const id = ++S.run;
    S.phase = 'counting';
    renderControls();
    const plates = [...$('shop-plates').querySelectorAll('.plate:not(.empty)')];
    for (let i = 0; i < plates.length; i++) {
      if (id !== S.run) return;
      plates[i].classList.add('lit');
      plates[i].querySelector('.plate-badge').textContent = (i + 1) * DAN;
      $('shop-total').textContent = `${(i + 1) * DAN}こ`;
      await new Promise((r) => { S.timer = setTimeout(r, 650); });
    }
    if (id !== S.run) return;
    finishCount();
  }

  // スキップ：アニメーションを飛ばして結果だけ出す（確認そのものは飛ばさない）
  function skipCount() {
    if (S.phase !== 'counting') return;
    S.run++;
    clearTimeout(S.timer);
    finishCount();
  }

  function finishCount() {
    const e = kukuEntry(DAN, S.order);
    [...$('shop-plates').querySelectorAll('.plate:not(.empty)')].forEach((p, i) => {
      p.classList.add('lit');
      p.querySelector('.plate-badge').textContent = (i + 1) * DAN;
    });
    $('shop-total').textContent = `ぜんぶで ${e.answer}こ`;
    $('shop-eq').textContent = `${DAN} × ${S.order} ＝ ${e.answer}`;
    $('shop-reading').textContent = e.fullText;
    S.phase = 'confirmed';
    renderControls();
    Voice.speak(e.fullTtsText);
  }

  function readAloud() {
    const e = kukuEntry(DAN, S.order);
    Voice.speak(e.fullTtsText, { force: true });
  }

  function deliver() {
    // 数のかくにんが終わっていなければ、おとどけできない
    if (S.phase !== 'confirmed') return;
    S.phase = 'delivered';
    const before = Store.shop.deliveries;
    Store.recordShopDelivery({ dan: DAN, plates: S.order, total: DAN * S.order, food: food().id, animal: S.animal.id });
    Sound.pinpon();
    renderCustomer('happy', S.animal.thanks);
    $('shop-thanks').textContent = `${food().name} ${DAN * S.order}こ、おとどけ できたね！`;
    renderControls();
    // 新しい料理が増えたら、わかりやすく知らせる
    const newly = FOODS.find((f) => f.unlockAt > before && f.unlockAt <= Store.shop.deliveries);
    if (newly) showUnlock(newly);
  }

  function showUnlock(f) {
    $('shop-unlock-food').innerHTML = foodSVG(f.id);
    $('shop-unlock-name').textContent = f.label;
    $('shop-unlock').hidden = false;
    Voice.speak(`あたらしい りょうり、${f.name}が つくれるように なったよ`);
  }

  function open() {
    // お店モードではマイクを使わない。暗唱練習のマイク（事前準備も含む）を確実に止める
    if (typeof stopPlay === 'function') stopPlay();
    Mic.stop();
    Listener.stop();
    Store.endSession();
    $('shop-unlock').hidden = true;
    show('shop');
    newCustomer();
  }

  function close() {
    S.run++;
    clearTimeout(S.timer);
    Voice.cancel();
    goTop();
  }

  function init() {
    $('btn-shop').onclick = open;
    $('shop-back').onclick = close;
    $('shop-add').onclick = () => addPlate(1);
    $('shop-remove').onclick = () => addPlate(-1);
    $('shop-check').onclick = startCount;
    $('shop-skip').onclick = skipCount;
    $('shop-read').onclick = readAloud;
    $('shop-deliver').onclick = deliver;
    $('shop-next').onclick = newCustomer;
    $('shop-unlock-ok').onclick = () => {
      $('shop-unlock').hidden = true;
      // 解放した料理をすぐ選べるように（次のお客さんから）
    };
  }

  return { init, open, FOODS, foodSVG, animalSVG, get state() { return S; } };
})();
