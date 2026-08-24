// GaPon — the shopkeeper. Poko minds the counter: greets you, teaches the
// place on your first visit, reacts to what happens, and keeps your stamp
// rally card. Change SHOPKEEPER below to rename or re-skin them; set `art`
// to a PNG path when real art arrives (same idea as the sticker artDir).

const SHOPKEEPER = {
  name: 'Poko',        // tanuki — the lucky shop statue you see outside real
  emoji: '🦝',         // Japanese stores. "pon poko" = their belly-drum sound
  dir: 'assets/poko',  // set to null to fall back to the emoji everywhere
  // The maple leaf is Poko's mark. In folklore a tanuki puts a leaf on his
  // head to work its transformation magic, which is why it recurs in the art
  // — so it doubles as the shop's stamp. Rendered as a flat silhouette by
  // masking a solid fill with this file's alpha (see .leaf-mark).
  leaf: 'assets/poko/tanuki_maple_leaf.png',
  pose: 'welcome',     // current pose; keeperSay swaps it per mood
};

// Which drawing goes with which moment. Every mood Poko already reacts to is
// covered; anything unlisted falls back to `welcome`, so adding a line never
// requires adding art.
const KEEPER_POSES = {
  welcome:    'tanuki_welcome',
  greet:      'tanuki_welcome',
  greetFirst: 'tanuki_welcome',
  greetStreak:'tanuki_welcome',
  chase:      'tanuki_gacha_capsule',
  ticket:     'tanuki_gacha_capsule',
  setDone:    'tanuki_gacha_capsule',
  foil:       'tanuki_dazzled',
  stamp:      'tanuki_stamp_card',
  cardFull:   'tanuki_stamp_card',
  soldOut:    'tanuki_apologetic',
  broke:      'tanuki_apologetic',
  gift:       'tanuki_parcel',
  wants:      'tanuki_thoughtful',
  closed:     'tanuki_dozing',
};

function keeperPoseSrc(mood) {
  if (!SHOPKEEPER.dir) return null;
  return `${SHOPKEEPER.dir}/${KEEPER_POSES[mood] || KEEPER_POSES.welcome}.png`;
}

const KEEPER_LINES = {
  greetFirst: [`Oh! A new face! Welcome to GaPon — I'm ${SHOPKEEPER.name}.`],
  greet: [
    'Back again! The capsules missed you.',
    'Afternoon! Machines are all stocked up.',
    'Take a look around — no rush.',
    'Something good in there today, I can feel it.',
  ],
  greetStreak: [
    'day streak! You practically work here.',
    'days running! Here, the good machine is on the left.',
  ],
  chase: [
    'WHOA! A chase capsule! Let me see that!',
    "That's a chase! I'm putting that on the wall!",
  ],
  setDone: [
    "A whole set finished! That calls for a bonus.",
    "Look at that — completed! Nicely done.",
  ],
  soldOut: [
    "Ah — that one's cleaned out. New capsules at restock!",
    "Empty, sorry! Try another machine?",
  ],
  ticket: [
    "A golden one! That's a free play, on the house!",
    'Ha! The lucky capsule! Spend it wherever you like.',
  ],
  stamp: ["That's a stamp on your card!", 'Stamp! Keep going.'],
  cardFull: ["Your card's full! Come see me for your reward."],
  foil: [
    'A FOIL one! Oh, hold it to the light — go on!',
    "Shiny! I've only seen a handful of those.",
    "A foil! Careful with that one, they don't come round often.",
  ],
  gift: ['Something came for you! A friend sent it over.'],
  wantsTip: [
    'See those empty sleeves with the little star? Tap one to say you want it.',
  ],
  askName: ["What should I call you? It goes on the capsules you send."],
  wantsTip2: [
    "Once you've swapped friend codes, anyone holding a spare of it gets told. That's how the good trades start.",
  ],
  broke: ['Coins running low? Sell your doubles at the market.'],
};

function keeperPick(key) {
  const arr = KEEPER_LINES[key];
  return arr[Math.floor(Math.random() * arr.length)];
}

// A missing or blocked PNG swaps itself for the emoji, so the shop is never
// left with a broken-image icon where the shopkeeper should be.
function keeperFaceHTML(cls = '', mood = SHOPKEEPER.pose) {
  const src = keeperPoseSrc(mood);
  return src
    ? `<img class="keeper-img ${cls}" src="${src}" alt="${SHOPKEEPER.name}"
            data-cls="${cls}" onerror="keeperArtFallback(this)">`
    : `<span class="keeper-emoji ${cls}">${SHOPKEEPER.emoji}</span>`;
}

function keeperArtFallback(img) {
  const span = document.createElement('span');
  span.className = 'keeper-emoji ' + (img.dataset.cls || '');
  span.textContent = SHOPKEEPER.emoji;
  img.replaceWith(span);
}

// Swap the pose in place rather than re-rendering — the counter portrait is
// mid-bob animation and rebuilding it would restart the bob every line.
function keeperSetPose(mood) {
  SHOPKEEPER.pose = mood;
  const src = keeperPoseSrc(mood);
  if (!src) return;
  for (const [sel, cls] of [['#shopkeeper .keeper-char', ''], ['#keeper-bubble .kb-face', 'mini']]) {
    const host = document.querySelector(sel);
    if (!host) continue;
    const img = host.querySelector('.keeper-img');
    if (img) img.src = src;
    else host.innerHTML = keeperFaceHTML(cls, mood);   // was showing the emoji
  }
}

// ---------- speech bubble ----------

let kbTimer = null;
let kbQueue = [];
let kbShowing = false;
let kbAsking = false;      // a question is on screen and waiting for an answer

// Poko is only on screen in the shop. Anywhere else he calls out with a toast
// instead of talking to an empty room — which matters for pacing, because the
// bubble has a queue and toasts do not.
function keeperOnScreen() {
  const shopTab = document.querySelector('#tab-machines');
  return !!shopTab && !shopTab.hidden;
}

function keeperSay(text, ms = 4200, mood = null) {
  if (!keeperOnScreen()) {
    // pass the duration through, clamped — a long line needs reading time
    toast(`${SHOPKEEPER.emoji} ${text}`, 'good', Math.max(2600, Math.min(ms, 6000)));
    return;
  }
  // the mood rides with the line, so the pose changes exactly when the words
  // do — including partway through a queued run of tutorial lines
  kbQueue.push({ text, ms, mood });
  if (!kbShowing) keeperNext();
}

// A tutorial-style run of lines, shown back to back.
// On the shop floor the bubble queue paces these one after another. Anywhere
// else every line becomes a toast, and toasts have NO queue — pushing them in
// one tick stacks them on top of each other and they all expire together, so
// the player sees a wall of text for two seconds and reads none of it. Space
// them by hand in that case.
function keeperSayAll(lines, ms = 5200) {
  if (keeperOnScreen()) {
    for (const l of lines) keeperSay(l, ms);
    return;
  }
  const hold = Math.max(2600, Math.min(ms, 6000));
  lines.forEach((l, i) => setTimeout(() => keeperSay(l, ms), i * (hold + 500)));
}

// A yes/no from Poko. Goes through the SAME queue as everything else — an ask
// that jumped the line would wipe the daily greeting mid-sentence, and one
// that fired early would arrive before the player has seen the room.
//
// Returns false if the keeper isn't on screen. There is no toast fallback on
// purpose: a toast can't hold buttons, and a question with nowhere to answer
// is worse than no question.
function keeperAsk(text, opts = {}) {
  if (!keeperOnScreen()) return false;
  kbQueue.push({ text, ms: 0, mood: opts.mood || null, ask: opts });
  if (!kbShowing) keeperNext();
  return true;
}

function keeperShowAsk(bubble, ask) {
  kbAsking = true;
  bubble.classList.remove('more');     // not "tap to continue" — it's a choice
  bubble.classList.add('asking');
  const row = document.createElement('span');
  row.className = 'kb-ask';
  const add = (label, cls, fn) => {
    const b = document.createElement('button');
    b.className = 'kb-btn' + (cls ? ' ' + cls : '');
    b.textContent = label;
    b.addEventListener('click', e => {
      e.stopPropagation();            // the bubble's own click skips ahead
      keeperClearAsk(bubble);
      kbShowing = false;
      keeperNext();                   // drain anything behind it, or hide
      if (fn) fn();
    });
    row.appendChild(b);
  };
  add(ask.yes || 'Yes please', 'yes', ask.onYes);
  add(ask.no || 'Not now', '', ask.onNo);
  bubble.appendChild(row);
  // Deliberately no kbTimer. Nothing times out a decision.
}

function keeperClearAsk(bubble) {
  kbAsking = false;
  bubble.classList.remove('asking');
  const row = bubble.querySelector('.kb-ask');
  if (row) row.remove();
}

function keeperNext() {
  const bubble = document.querySelector('#keeper-bubble');
  if (!bubble) return;
  const next = kbQueue.shift();
  if (!next) {
    kbShowing = false;
    keeperClearAsk(bubble);
    keeperSetPose('welcome');      // back to standing behind the counter
    if (!FX_REDUCED) bubble.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-in' });
    // hide on a timer, never on an animation event — a stalled animation
    // must not be able to strand the bubble on screen
    setTimeout(() => { if (!kbShowing) bubble.hidden = true; }, FX_REDUCED ? 0 : 200);
    return;
  }
  kbShowing = true;
  bubble.hidden = false;
  if (next.mood) keeperSetPose(next.mood);
  bubble.querySelector('.kb-text').textContent = next.text;
  bubble.classList.toggle('more', kbQueue.length > 0);
  clearTimeout(kbTimer);
  keeperClearAsk(bubble);
  if (next.ask) keeperShowAsk(bubble, next.ask);
  else kbTimer = setTimeout(keeperNext, next.ms);
  if (!FX_REDUCED) {
    // transform-only entrance: even if the animation never runs, the bubble
    // is readable — nothing here is allowed to make it invisible
    bubble.animate([
      { transform: 'translateY(10px) scale(0.97)' },
      { transform: 'translateY(0) scale(1)' },
    ], { duration: 240, easing: 'cubic-bezier(.2,1.4,.4,1)' });
    bubble.querySelector('.kb-face').animate([
      { transform: 'translateY(0) rotate(0deg)' },
      { transform: 'translateY(-4px) rotate(-6deg)' },
      { transform: 'translateY(0) rotate(0deg)' },
    ], { duration: 420, easing: 'ease-out' });
  }
}

// Reaction helper — every game event routes through here.
function keeperReact(key, extra = '') {
  keeperSay(extra ? `${extra} ${keeperPick(key)}` : keeperPick(key), 4200, key);
}

// ---------- setup ----------

function initShopkeeper() {
  const keeper = document.querySelector('#shopkeeper');
  const bubble = document.querySelector('#keeper-bubble');
  if (!keeper || !bubble) return;
  keeper.querySelector('.keeper-char').innerHTML = keeperFaceHTML();
  bubble.querySelector('.kb-face').innerHTML = keeperFaceHTML('mini');
  // tapping the bubble skips ahead; tapping Poko opens the stamp card
  bubble.addEventListener('click', () => {
    if (kbAsking) return;      // tapping past a question would answer it by accident
    clearTimeout(kbTimer);
    keeperNext();
  });
  keeper.addEventListener('click', () => {
    sfx.hello();
    openStampCard();
  });
  updateKeeperBadge();
}

// Little "!" on the counter when a card is ready to redeem.
function updateKeeperBadge() {
  const badge = document.querySelector('#keeper-badge');
  if (badge) badge.hidden = !stampCardFull();
}

function keeperGreet(firstRun, daily) {
  if (!state.tutorialSeen) {
    keeperTutorial();
    return;
  }
  if (daily && state.streak > 1) {
    keeperSay(`${state.streak} ${keeperPick('greetStreak')}`, 4200, 'greetStreak');
  } else {
    keeperSay(keeperPick('greet'), 4200, 'greet');
  }
  if (stampCardFull()) keeperSay(keeperPick('cardFull'), 5200, 'cardFull');
}

function keeperTutorial() {
  state.tutorialSeen = true;
  saveGame();
  keeperSayAll([
    keeperPick('greetFirst'),
    'Tap a machine to step up to it, then drop a coin in the slot.',
    'Turn the crank — drag it round, or just hold it — and out pops a capsule!',
    "Stickers go in your Album. Doubles can be sold at the Market for coins.",
    'Machines restock twice a day, so come back often. Tap me any time!',
  ]);
}

// The wants list is the engine of the whole social layer, and it was sitting
// unused because nobody knew it existed — the only hints an empty pocket was
// tappable were `cursor: pointer` and a tooltip, both invisible on a phone.
// The hollow star fixes the affordance; this explains the part a star can't:
// that friends holding a spare are told about it.
//
// Held back until there's something to point at — a binder with no gaps has
// no empty sleeves to tap, and a brand-new player has nothing else either.
function maybeExplainWants() {
  if (state.wantsTipSeen) return;
  if ((state.wants || []).length) { state.wantsTipSeen = true; saveGame(); return; }
  const owned = COLLECTIONS.reduce((n, c) => n + collectionProgress(c), 0);
  const gaps = COLLECTIONS.some(c => c.items.some(it => !hasItem(it.id)));
  if (owned < 3 || !gaps) return;
  state.wantsTipSeen = true;
  saveGame();
  keeperSayAll([keeperPick('wantsTip'), keeperPick('wantsTip2')], 6000);
}

// ---------- stamp rally card ----------

// Poko's mark. The art is a painted leaf, so it's masked down to a flat
// silhouette and filled with `currentColor` — that turns one file into a
// stamp that can be inked red on the card, gold on a finished one, without
// asking for more art. Falls back to the emoji if the file won't load.
function leafMarkHTML(cls = '') {
  return SHOPKEEPER.leaf
    ? `<i class="leaf-mark ${cls}" style="--leaf:${cssUrl(SHOPKEEPER.leaf)}" role="img"
          aria-label="stamp"></i>`
    : `<span class="${cls}">${SHOPKEEPER.emoji}</span>`;
}

function stampSlotsHTML() {
  const have = Math.min(cardStamps(), STAMP.cardSize);
  let out = '';
  for (let i = 0; i < STAMP.cardSize; i++) {
    out += `<div class="stamp-slot${i < have ? ' stamped' : ''}">
      ${i < have ? leafMarkHTML('stamp-mark') : `<span class="stamp-no">${i + 1}</span>`}
    </div>`;
  }
  return out;
}

function stampBar(done, total, label) {
  const complete = done >= total;
  return `<div class="stamp-task${complete ? ' done' : ''}">
    <span class="st-label">${label}</span>
    <span class="st-bar"><i style="width:${(done / total * 100).toFixed(0)}%"></i></span>
    <span class="st-n">${complete ? '✓' : `${done}/${total}`}</span>
  </div>`;
}

function openStampCard() {
  const s = stampState();
  const full = stampCardFull();
  const over = Math.max(0, cardStamps() - STAMP.cardSize);
  const ov = $('#overlay');
  ov.hidden = false;
  ov.innerHTML = `
    <div class="ov-stage share-stage">
      <div class="keeper-title">${keeperFaceHTML('mini')}<span>${SHOPKEEPER.name}'s Stamp Rally</span></div>
      <div class="stamp-card">
        <div class="stamp-slots">${stampSlotsHTML()}</div>
        <p class="stamp-goal">fill all three for a stamp:</p>
        <div class="stamp-tasks">
          ${stampBar(s.pulls, STAMP.perPulls, 'capsule pulls')}
          ${stampBar(s.plays, STAMP.perPlays, 'arcade games')}
          ${stampBar(s.binderDone ? 1 : 0, 1,
            `visit your album${!s.binderDone && s.binderDay === todayStr() ? ' (tomorrow)' : ''}`)}
        </div>
        <p class="stamp-note">${full
          ? `Card full! ${STAMP.reward} coins waiting.${over ? ` (+${over} stamp${over > 1 ? 's' : ''} already on the next card)` : ''}`
          : `${STAMP.cardSize} stamps fills the card — ${STAMP.reward} coins. Cards done: ${s.cards}`}</p>
      </div>
      <div class="r-btns">
        <button class="btn ghost" id="stamp-close">Close</button>
        ${full ? `<button class="btn" id="stamp-redeem">${coinIcon()} Redeem ${STAMP.reward}</button>` : ''}
      </div>
    </div>`;
  ov.querySelector('#stamp-close').addEventListener('click', () => {
    ov.hidden = true;
    ov.innerHTML = '';
  });
  const redeem = ov.querySelector('#stamp-redeem');
  if (redeem) redeem.addEventListener('click', () => {
    const got = redeemStampCard();
    if (!got) return;
    sfx.fanfare();
    confetti(24);
    updateHeader();
    updateKeeperBadge();
    toast(`Stamp card complete! +${got} coins`, 'good');
    openStampCard();          // fresh card, with any overflow already on it
  });
}

// Called by the game whenever something might earn a stamp.
// What's still missing before this stamp lands, in plain words.
function stampNeeds() {
  const s = stampState();
  const need = [];
  const n = (x, one, many) => `${x} more ${x === 1 ? one : many}`;
  if (s.pulls < STAMP.perPulls) need.push(n(STAMP.perPulls - s.pulls, 'pull', 'pulls'));
  if (s.plays < STAMP.perPlays) need.push(n(STAMP.perPlays - s.plays, 'arcade game', 'arcade games'));
  if (!s.binderDone) {
    need.push(s.binderDay === todayStr()
      ? 'an album visit (tomorrow — one a day!)'
      : 'a look at your album');
  }
  return need;
}

// Compact card status for screens outside the shop (e.g. the arcade).
// Finished tracks read as ✓ rather than "3/3", which looks stuck.
function stampMiniHTML() {
  const s = stampState();
  const t = (n, of) => n >= of ? '✓' : `${n}/${of}`;
  return `<span class="stamp-mini">${SHOPKEEPER.emoji} stamp card —
    pulls ${t(s.pulls, STAMP.perPulls)} · games ${t(s.plays, STAMP.perPlays)} ·
    album ${s.binderDone ? '✓' : '–'}</span>`;
}

// `count` lets one event credit several pulls — the medal pusher can tip four
// capsules over the lip at once, and crediting that as a single pull would
// look broken to anyone watching four stickers land.
function noteStamp(kind, count = 1) {
  const s = stampState();
  const was = { pulls: s.pulls, plays: s.plays, binder: s.binderDone };
  // advance the extra credits quietly; the last one below does the talking
  for (let i = 1; i < count; i++) stampProgress(kind);
  const wasFull = (kind === 'pull' && was.pulls >= STAMP.perPulls) ||
                  (kind === 'play' && was.plays >= STAMP.perPlays);
  const earned = stampProgress(kind);
  updateKeeperBadge();

  if (earned) {
    sfx.chime();
    if (stampCardFull()) keeperReact('cardFull');
    else if (stampState().earned === 1) {
      keeperSay(`Your first stamp! Fill ${STAMP.cardSize} and I'll swap the card for ` +
        `${STAMP.reward} coins — tap me any time to see it.`, 6400);
    } else keeperReact('stamp');
    return;
  }

  // No stamp yet — but if a whole track just filled, say so. Silence here is
  // what makes progress feel broken: you finish three arcade games and the
  // game says nothing at all.
  const now = stampState();
  const filled =
    (kind === 'pull' && was.pulls < STAMP.perPulls && now.pulls >= STAMP.perPulls) ||
    (kind === 'play' && was.plays < STAMP.perPlays && now.plays >= STAMP.perPlays) ||
    (kind === 'binder' && !was.binder && now.binderDone);
  if (filled) {
    const label = kind === 'pull' ? 'Capsule pulls' : kind === 'play' ? 'Arcade games' : 'Album visit';
    sfx.tick();
    keeperSay(`${label} done on your stamp card! Still need ${stampNeeds().join(' and ')}.`, 5600, 'stamp');
    return;
  }
  // That track was already finished, so this play couldn't move the card at
  // all. Saying nothing here reads as "it didn't register" — two playtesters
  // hit exactly that.
  if (wasFull) {
    keeperSay(`That one's already stamped! For the next stamp you still need ` +
      `${stampNeeds().join(' and ')}.`, 5200);
  }
}
