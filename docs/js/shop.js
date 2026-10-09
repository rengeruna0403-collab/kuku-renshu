// 🏪 九九のおみせタウン（Phase 1：1・2・3・5の段のお店）
// 九九を「セットの数」で体験するあそび。暗唱練習とは別の画面で、マイク（音声認識）は使わない。
//   1. お客さんが「いちごを 3セット おねがい！」と注文する（1〜9セット）
//   2. 子どもが「ならべる」「もどす」でセットを用意する（1セットに 段の数だけ。答えはまだ見せない）
//   3. 「ぜんぶで なんこ？ かくにん！」→ セットが1つずつ光って累計（スキップ可）→「段 × セット ＝ 合計」
//   4. 確認したあとだけ「おとどけ」できる。間違い・時間制限・スコアはない
//   5. おとどけの回数で商品がふえる（2・4・6回）。モチーフ（いちご・にんじん…）は変えず、種類が発展する
// 進み具合はお店ごとに Store.shopOf(段) に保存する。
// ※ 将来の「ごちゃまぜやさん」（遊んだ段を混ぜる／全店の全商品で解放）はまだ作らない。
const Shop = (() => {
  const UNLOCK_AT = [0, 2, 4, 6];   // 商品の解放（おとどけ回数）

  // 全9店舗。ready: false は Phase 1 では「じゅんびちゅう」（学習の成果によるロックではない）
  const SHOPS = [
    {
      dan: 1, name: 'いちごやさん', item: 'いちご', unit: 'こ', intro: 'いちごの「いち」は 1', introSub: 'いちご 1こで 1セット', dish: 'dish-1', ready: true,
      items: [{ id: 'normal', label: 'いちご' }, { id: 'big', label: 'おおつぶ いちご' }, { id: 'heart', label: 'ハート いちご' }, { id: 'gold', label: 'きんいろ いちご' }],
    },
    {
      dan: 2, name: 'にんじんやさん', item: 'にんじん', unit: 'ほん', intro: 'にんじんの「に」は 2', introSub: 'にんじん 2ほんで 1セット', dish: 'dish-2', ready: true,
      items: [{ id: 'normal', label: 'にんじん' }, { id: 'leafy', label: 'はっぱつき にんじん' }, { id: 'color', label: 'カラフル にんじん' }, { id: 'sparkle', label: 'キラキラ にんじん' }],
    },
    {
      dan: 3, name: 'サンドイッチやさん', item: 'サンドイッチ', unit: 'こ', intro: 'サンドイッチの「サン」は 3', introSub: 'サンドイッチ 3こで 1セット', dish: 'dish-3', ready: true,
      items: [{ id: 'egg', label: 'たまごサンド' }, { id: 'ham', label: 'ハムサンド' }, { id: 'mix', label: 'ミックスサンド' }, { id: 'fruit', label: 'フルーツサンド' }],
    },
    { dan: 4, name: 'しばいぬやさん', emoji: '🐕', ready: false },
    {
      dan: 5, name: 'ごはんやさん', item: 'ごはん', unit: 'こ', intro: 'ごはんの「ご」は 5', introSub: 'おちゃわん 5こで 1セット', dish: 'dish-5', ready: true,
      items: [{ id: 'rice', label: 'しろい ごはん' }, { id: 'furikake', label: 'ふりかけ ごはん' }, { id: 'takikomi', label: 'たきこみ ごはん' }, { id: 'curry', label: 'カレーライス' }],
    },
    { dan: 6, name: 'ロールケーキやさん', emoji: '🍰', ready: false },
    { dan: 7, name: '七色インコやさん', emoji: '🦜', ready: false },
    { dan: 8, name: 'たこのうみ', emoji: '🐙', ready: false },
    { dan: 9, name: 'クッキーやさん', emoji: '🍪', ready: false },
  ];
  const shopOfDan = (dan) => SHOPS.find((s) => s.dan === dan);

  // 1セットの中の並べ方（%）と、1こあたりの大きさ（%）。数がひと目で分かる形にする
  const LAYOUT = {
    1: { size: 64, pos: [[50, 52]] },
    2: { size: 48, pos: [[30, 52], [70, 52]] },
    3: { size: 42, pos: [[29, 31], [71, 31], [50, 71]] },
    5: { size: 34, pos: [[24, 24], [76, 24], [50, 50], [24, 76], [76, 76]] },   // さいころの「5」
  };

  const ANIMALS = [
    { id: 'bear', name: 'くまさん', hello: 'こんにちは！', thanks: 'わーい！ ありがとう！ おなか ぺこぺこ だったんだ' },
    { id: 'rabbit', name: 'うさぎさん', hello: 'こんにちは〜', thanks: 'おいしそう！ うれしいな、ありがとう！' },
    { id: 'cat', name: 'ねこさん', hello: 'にゃあ、こんにちは！', thanks: 'にゃ〜ん！ ありがとう、いただきます！' },
  ];

  // ---------- え（SVG） ----------
  const BOWL = '<path d="M9 52 H91 Q89 82 63 87 H37 Q11 82 9 52 Z" fill="#3f6fb5"/><path d="M9 52 H91 Q90.6 57 89.8 61 H10.2 Q9.4 57 9 52 Z" fill="#6f96d0"/><ellipse cx="50" cy="52" rx="41" ry="4.5" fill="#e8eef8" stroke="#2f5a99" stroke-width="2.5"/><circle cx="30" cy="72" r="3.4" fill="#fff" opacity=".85"/><circle cx="50" cy="75" r="3.4" fill="#fff" opacity=".85"/><circle cx="70" cy="72" r="3.4" fill="#fff" opacity=".85"/><path d="M37 87 H63 L60 95 H40 Z" fill="#2f5a99"/>';
  const RICE_MOUND = (fill, stroke) => `<path d="M17 54 Q17 20 50 17 Q83 20 83 54 Z" fill="${fill}" stroke="${stroke}" stroke-width="3"/>`;
  const RICE_GRAINS = '<path d="M30 33 l5 -2 M47 26 l5 1 M62 32 l4 3 M38 44 l5 -1 M56 43 l5 1 M70 47 l3 -3 M25 47 l4 -2" stroke="#ddd5c4" stroke-width="2.6" stroke-linecap="round"/>';
  const STRAW_BODY = 'M50 92 C30 84 14 62 18 44 C22 30 38 28 50 34 C62 28 78 30 82 44 C86 62 70 84 50 92 Z';
  const STRAW_SEEDS = (c) => [[36, 50], [50, 46], [64, 50], [30, 62], [43, 60], [57, 60], [70, 62], [38, 72], [50, 72], [62, 72], [50, 83]]
    .map(([x, y]) => `<ellipse cx="${x}" cy="${y}" rx="1.8" ry="2.6" fill="${c}"/>`).join('');
  const STRAW_LEAF = '<path d="M50 38 L37 25 L45 36 L28 31 L42 41 L50 43 L58 41 L72 31 L55 36 L63 25 Z" fill="#4caf50" stroke="#3a8f3e" stroke-width="1.5" stroke-linejoin="round"/><path d="M50 30 Q51 22 55 16" stroke="#3a8f3e" stroke-width="3" fill="none" stroke-linecap="round"/>';
  const SPARK = (x, y, s, c) => `<path d="M${x} ${y - s} L${x + s * 0.28} ${y - s * 0.28} L${x + s} ${y} L${x + s * 0.28} ${y + s * 0.28} L${x} ${y + s} L${x - s * 0.28} ${y + s * 0.28} L${x - s} ${y} L${x - s * 0.28} ${y - s * 0.28} Z" fill="${c}"/>`;
  const CARROT_BODY = 'M33 32 Q50 26 67 32 Q63 62 53 92 Q50 97 47 92 Q37 62 33 32 Z';
  const CARROT_RIDGES = '<path d="M40 44 h8 M54 52 h8 M42 62 h6 M53 70 h6 M46 80 h5" stroke="#d96f12" stroke-width="2.6" stroke-linecap="round"/>';
  const CARROT_LEAVES = '<path d="M50 32 C46 20 38 12 30 6 C40 8 48 16 51 30 Z" fill="#5fae4b"/><path d="M50 32 C50 18 52 8 56 2 C58 12 56 22 52 32 Z" fill="#4c9b3a"/><path d="M51 32 C56 20 64 14 72 10 C66 18 58 26 52 33 Z" fill="#6cbf55"/>';
  // サンドイッチ：三角の断面（上のパン・具・下のパン）。具の色で種類が分かる
  const SAND = (layers) => `<defs><clipPath id="kk-sand-clip"><path d="M14 80 L50 16 L86 80 Z"/></clipPath></defs><g clip-path="url(#kk-sand-clip)"><rect x="0" y="0" width="100" height="100" fill="#fff6df"/>${layers}</g><path d="M14 80 L50 16 L86 80 Z" fill="none" stroke="#d9a45b" stroke-width="6" stroke-linejoin="round"/>`;

  const SVG = {
    1: {
      normal: `<g transform="translate(50 56) scale(.84) translate(-50 -56)"><path d="${STRAW_BODY}" fill="#e8414f"/>${STRAW_SEEDS('#ffe08a')}${STRAW_LEAF}</g>`,
      big: `<path d="${STRAW_BODY}" fill="#d9213a" transform="translate(50 60) scale(1.08) translate(-50 -60)"/>${STRAW_SEEDS('#ffe9a8')}<ellipse cx="34" cy="52" rx="6" ry="11" fill="#fff" opacity=".45" transform="rotate(-20 34 52)"/>${STRAW_LEAF}`,
      heart: `<path d="M50 92 C20 72 8 52 14 38 C20 24 40 24 50 38 C60 24 80 24 86 38 C92 52 80 72 50 92 Z" fill="#ef4a6b"/>${STRAW_SEEDS('#ffe08a')}${STRAW_LEAF}`,
      gold: `<defs><linearGradient id="kk-gold" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff2a8"/><stop offset=".55" stop-color="#f3c623"/><stop offset="1" stop-color="#d49b12"/></linearGradient></defs><path d="${STRAW_BODY}" fill="url(#kk-gold)" stroke="#c48d0f" stroke-width="2"/>${STRAW_SEEDS('#fff')}${STRAW_LEAF}${SPARK(16, 22, 8, '#f6c64e')}${SPARK(86, 70, 7, '#f6c64e')}`,
    },
    2: {
      normal: `<path d="${CARROT_BODY}" fill="#f28c28"/>${CARROT_RIDGES}<path d="M46 31 Q47 24 45 20 M54 31 Q53 24 56 20" stroke="#5fae4b" stroke-width="4" fill="none" stroke-linecap="round"/>`,
      leafy: `${CARROT_LEAVES}<path d="${CARROT_BODY}" fill="#f28c28"/>${CARROT_RIDGES}`,
      color: `<defs><linearGradient id="kk-rainbow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8e5bd0"/><stop offset=".34" stop-color="#8e5bd0"/><stop offset=".34" stop-color="#f28c28"/><stop offset=".67" stop-color="#f28c28"/><stop offset=".67" stop-color="#f6d047"/><stop offset="1" stop-color="#f6d047"/></linearGradient></defs>${CARROT_LEAVES}<path d="${CARROT_BODY}" fill="url(#kk-rainbow)"/><path d="M40 44 h8 M54 52 h8 M42 62 h6 M53 70 h6" stroke="#fff" stroke-width="2" stroke-linecap="round" opacity=".5"/>`,
      sparkle: `${CARROT_LEAVES}<path d="${CARROT_BODY}" fill="#ff9a2e" stroke="#f6c64e" stroke-width="3"/>${CARROT_RIDGES}${SPARK(20, 50, 8, '#f6c64e')}${SPARK(80, 40, 7, '#f6c64e')}${SPARK(76, 80, 6, '#f6c64e')}`,
    },
    3: {
      egg: SAND('<rect x="0" y="50" width="100" height="14" fill="#f6d55c"/><circle cx="40" cy="57" r="2.5" fill="#fff"/><circle cx="58" cy="55" r="2.5" fill="#fff"/><rect x="0" y="64" width="100" height="16" fill="#fff6df"/>'),
      ham: SAND('<rect x="0" y="48" width="100" height="5" fill="#7cc35a"/><rect x="0" y="53" width="100" height="11" fill="#f3a1a6"/><rect x="0" y="64" width="100" height="16" fill="#fff6df"/>'),
      mix: SAND('<rect x="0" y="47" width="100" height="5" fill="#7cc35a"/><rect x="0" y="52" width="100" height="6" fill="#e8504a"/><rect x="0" y="58" width="100" height="6" fill="#f6d55c"/><rect x="0" y="64" width="100" height="16" fill="#fff6df"/>'),
      fruit: SAND('<rect x="0" y="48" width="100" height="16" fill="#fffaf0"/><circle cx="36" cy="56" r="5" fill="#e8414f"/><circle cx="52" cy="56" r="5" fill="#8cc63f"/><circle cx="66" cy="57" r="4.5" fill="#f6a623"/><rect x="0" y="64" width="100" height="16" fill="#fff6df"/>'),
    },
    5: {
      rice: `${RICE_MOUND('#fff', '#c9bfab')}${RICE_GRAINS}${BOWL}`,
      furikake: `${RICE_MOUND('#fff', '#c9bfab')}${RICE_GRAINS}${[[32, 34, '#6aa84f'], [44, 28, '#f1c232'], [56, 32, '#e06666'], [66, 40, '#6aa84f'], [38, 44, '#2f3b33'], [52, 44, '#f1c232'], [28, 48, '#e06666'], [62, 26, '#2f3b33'], [74, 48, '#f1c232']].map(([x, y, c]) => `<rect x="${x}" y="${y}" width="5" height="4" rx="1" fill="${c}" transform="rotate(${(x * 7) % 40 - 20} ${x} ${y})"/>`).join('')}${BOWL}`,
      takikomi: `${RICE_MOUND('#e9cf9e', '#c9a96b')}${[[30, 36, '#f28c28'], [46, 28, '#8a5a2b'], [60, 34, '#f28c28'], [40, 44, '#6aa84f'], [56, 44, '#8a5a2b'], [70, 46, '#6aa84f'], [26, 48, '#8a5a2b']].map(([x, y, c]) => `<rect x="${x}" y="${y}" width="6" height="5" rx="1.5" fill="${c}"/>`).join('')}${BOWL}`,
      curry: `${RICE_MOUND('#fff', '#c9bfab')}<path d="M50 17 Q83 20 83 54 L46 54 Q44 40 50 30 Q52 24 50 17 Z" fill="#b0651e"/><rect x="58" y="32" width="8" height="7" rx="2" fill="#f28c28"/><rect x="66" y="44" width="8" height="7" rx="2" fill="#f3d58b"/><rect x="54" y="45" width="7" height="6" rx="2" fill="#f28c28"/>${BOWL}`,
    },
  };

  // SVG の id（グラデーション・切り抜き）は絵ごとに別の名前にする。
  // 同じ id が非表示の画面に先にあると、Chrome ではほかの絵でも効かなくなることがあるため
  let uid = 0;
  function itemSVG(dan, id) {
    const s = (SVG[dan] && (SVG[dan][id] || SVG[dan][Object.keys(SVG[dan])[0]])) || '';
    const n = ++uid;
    return `<svg viewBox="0 0 100 100" aria-hidden="true">${s.replace(/kk-[a-z-]+/g, (m) => `${m}-${n}`)}</svg>`;
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
  // phase: 'order'（セットを用意）| 'counting'（数をかくにん中）| 'confirmed'（かくにんずみ）| 'delivered'（おとどけずみ）
  const S = { dan: 5, phase: 'order', animal: ANIMALS[0], order: 3, plates: 0, deck: [], lastAnimal: null, timer: null, run: 0 };

  const shop = () => shopOfDan(S.dan);
  const progress = () => Store.shopOf(S.dan);
  const items = () => shop().items.map((it, i) => ({ ...it, unlockAt: UNLOCK_AT[i] }));
  const unlocked = (it) => progress().deliveries >= it.unlockAt;
  const item = () => items().find((it) => it.id === progress().selected && unlocked(it)) || items()[0];

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

  function orderLine() { return `${item().label}を ${S.order}セット おねがい！`; }

  function setHTML(withBadge) {
    const lay = LAYOUT[S.dan];
    const svg = itemSVG(S.dan, item().id);
    return `<div class="plate-dish ${shop().dish}">${lay.pos.map(([x, y]) => `<span class="food" style="left:${x}%;top:${y}%;width:${lay.size}%">${svg}</span>`).join('')}</div>${withBadge ? '<span class="plate-badge"></span>' : ''}`;
  }

  function renderPlates() {
    const box = $('shop-plates');
    box.innerHTML = Array.from({ length: S.plates }, (_, i) => `<div class="plate" data-i="${i}">${setHTML(true)}</div>`).join('')
      + (S.phase === 'order' && S.plates < S.order ? Array.from({ length: S.order - S.plates }, () => `<div class="plate empty"><div class="plate-dish ${shop().dish}"></div></div>`).join('') : '');
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
    check.textContent = k === n ? 'ぜんぶで なんこ？ かくにん！' : k < n ? `あと ${n - k}セット ならべてね` : `${k - n}セット おおいよ`;
    $('shop-plate-count').textContent = p === 'order' ? `${k}セット` : '';
    $('shop-skip').hidden = p !== 'counting';
    $('shop-result').hidden = !(p === 'confirmed' || p === 'delivered' || p === 'counting');
    $('shop-deliver').hidden = p !== 'confirmed';
    $('shop-next').hidden = p !== 'delivered';
    $('shop-foods').classList.toggle('locked-now', p !== 'order');
    renderItems();
  }

  function renderItems() {
    const pr = progress();
    $('shop-foods').innerHTML = items().map((it) => {
      const ok = unlocked(it);
      const on = item().id === it.id;
      const left = it.unlockAt - pr.deliveries;
      return `<button class="food-chip${on ? ' on' : ''}${ok ? '' : ' locked'}" data-id="${it.id}" ${ok && S.phase === 'order' ? '' : 'disabled'} aria-label="${it.label}">
        <span class="food-chip-ico">${itemSVG(S.dan, it.id)}</span><span class="food-chip-name">${ok ? it.label : '？？？'}</span>${ok ? '' : `<span class="food-chip-lock">あと${left}かい おとどけ</span>`}</button>`;
    }).join('');
    $('shop-foods').querySelectorAll('button.food-chip').forEach((b) => {
      b.onclick = () => {
        if (S.phase !== 'order') return;
        Store.setShop(S.dan, { selected: b.dataset.id });
        renderPlates();
        renderItems();
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
    if (S.plates > S.order) renderCustomer('wonder', `あれ？ ${S.order}セットで いいよ`);
    else renderCustomer('order', orderLine());
  }

  // 数をかくにん：1セットずつ光らせて 段 → 段×2 → …
  async function startCount() {
    if (S.phase !== 'order' || S.plates !== S.order) return;
    const id = ++S.run;
    S.phase = 'counting';
    renderControls();
    const plates = [...$('shop-plates').querySelectorAll('.plate:not(.empty)')];
    for (let i = 0; i < plates.length; i++) {
      if (id !== S.run) return;
      plates[i].classList.add('lit');
      plates[i].querySelector('.plate-badge').textContent = (i + 1) * S.dan;
      $('shop-total').textContent = `${(i + 1) * S.dan}${shop().unit}`;
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
    const e = kukuEntry(S.dan, S.order);
    [...$('shop-plates').querySelectorAll('.plate:not(.empty)')].forEach((p, i) => {
      p.classList.add('lit');
      p.querySelector('.plate-badge').textContent = (i + 1) * S.dan;
    });
    $('shop-total').textContent = `ぜんぶで ${e.answer}${shop().unit}`;
    $('shop-eq').textContent = `${S.dan} × ${S.order} ＝ ${e.answer}`;
    $('shop-reading').textContent = e.fullText;
    S.phase = 'confirmed';
    renderControls();
    Voice.speak(e.fullTtsText);
  }

  function readAloud() {
    const e = kukuEntry(S.dan, S.order);
    Voice.speak(e.fullTtsText, { force: true });
  }

  function deliver() {
    // 数のかくにんが終わっていなければ、おとどけできない
    if (S.phase !== 'confirmed') return;
    S.phase = 'delivered';
    const before = progress().deliveries;
    const it = item();
    Store.recordShopDelivery(S.dan, { dan: S.dan, plates: S.order, total: S.dan * S.order, food: it.id, animal: S.animal.id });
    Sound.pinpon();
    renderCustomer('happy', S.animal.thanks);
    $('shop-thanks').textContent = `${it.label} ${S.dan * S.order}${shop().unit}、おとどけ できたね！`;
    renderControls();
    // 新しい商品が増えたら、わかりやすく知らせる
    const newly = items().find((x) => x.unlockAt > before && x.unlockAt <= progress().deliveries);
    if (newly) showUnlock(newly);
  }

  function showUnlock(it) {
    $('shop-unlock-food').innerHTML = itemSVG(S.dan, it.id);
    $('shop-unlock-name').textContent = it.label;
    $('shop-unlock').hidden = false;
    Voice.speak(`あたらしい しょうひん、${it.label}が できるように なったよ`);
  }

  // お店のはじめての紹介（「いちごの『いち』は 1」）
  function showIntro() {
    const sh = shop();
    $('shop-intro-item').innerHTML = itemSVG(S.dan, sh.items[0].id);
    $('shop-intro-title').textContent = sh.name;
    // 「…の『サン』」と「は 3」で折り返す（数字だけが次の行に残らないように）
    const cut = sh.intro.lastIndexOf('は ');
    $('shop-intro-line').innerHTML = `<span class="nowrap">${sh.intro.slice(0, cut)}</span><span class="nowrap">${sh.intro.slice(cut)}</span>`;
    $('shop-intro-sub').textContent = sh.introSub;
    $('shop-intro').hidden = false;
    Voice.speak(`${sh.intro.replace('は ', 'は、')}。${sh.introSub}`);
  }

  // ---------- まち（お店えらび） ----------
  function renderTown() {
    $('town-grid').innerHTML = SHOPS.map((sh) => {
      if (!sh.ready) {
        return `<div class="town-shop soon" aria-label="${sh.name}（じゅんびちゅう）">
          <span class="town-dan">${sh.dan}のだん</span><span class="town-ico emoji">${sh.emoji}</span>
          <span class="town-name">${sh.name}</span><span class="town-soon">🚧 じゅんびちゅう</span></div>`;
      }
      const pr = Store.shopOf(sh.dan);
      const got = sh.items.filter((_, i) => pr.deliveries >= UNLOCK_AT[i]);
      return `<button class="town-shop open" data-dan="${sh.dan}">
        <span class="town-dan">${sh.dan}のだん</span><span class="town-ico">${itemSVG(sh.dan, sh.items[0].id)}</span>
        <span class="town-name">${sh.name}</span>
        <span class="town-got">${got.map((it) => `<span class="town-mini">${itemSVG(sh.dan, it.id)}</span>`).join('')}</span></button>`;
    }).join('');
    $('town-grid').querySelectorAll('button.town-shop').forEach((b) => { b.onclick = () => openShop(+b.dataset.dan); });
  }

  // マイクを使わない画面に入るとき：暗唱練習のマイク（事前準備も含む）を確実に止める
  function stopPracticeMic() {
    if (typeof stopPlay === 'function') stopPlay();
    Mic.stop();
    Listener.stop();
    Store.endSession();
  }

  function openTown() {
    S.run++;
    clearTimeout(S.timer);
    Voice.cancel();
    stopPracticeMic();
    renderTown();
    show('town');
  }

  function openShop(dan) {
    const sh = shopOfDan(dan);
    if (!sh || !sh.ready) return;
    stopPracticeMic();
    S.dan = dan;
    S.deck = [];
    S.lastAnimal = null;
    $('shop-title').textContent = sh.name;
    $('shop-unlock').hidden = true;
    $('shop-intro').hidden = true;
    show('shop');
    newCustomer();
    if (!progress().introSeen) showIntro();
  }

  function init() {
    $('btn-shop').onclick = openTown;
    $('town-back').onclick = () => goTop();
    $('shop-back').onclick = openTown;
    $('shop-add').onclick = () => addPlate(1);
    $('shop-remove').onclick = () => addPlate(-1);
    $('shop-check').onclick = startCount;
    $('shop-skip').onclick = skipCount;
    $('shop-read').onclick = readAloud;
    $('shop-deliver').onclick = deliver;
    $('shop-next').onclick = newCustomer;
    $('shop-unlock-ok').onclick = () => { $('shop-unlock').hidden = true; };
    $('shop-intro-ok').onclick = () => {
      $('shop-intro').hidden = true;
      Store.setShop(S.dan, { introSeen: true });
      Voice.speak(orderLine());
    };
  }

  return {
    init, openTown, openShop, SHOPS, UNLOCK_AT, LAYOUT, itemSVG, animalSVG,
    // 旧版との互換（5の段の商品一覧）
    get FOODS() { return shopOfDan(5).items.map((it, i) => ({ ...it, unlockAt: UNLOCK_AT[i] })); },
    get state() { return S; },
  };
})();
