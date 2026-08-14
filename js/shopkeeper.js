// GaPon — the shopkeeper. Poko minds the counter: greets you, teaches the
// place on your first visit, reacts to what happens, and keeps your stamp
// rally card. Change SHOPKEEPER below to rename or re-skin them; set `art`
// to a PNG path when real art arrives (same idea as the sticker artDir).

const SHOPKEEPER = {
  name: 'Poko',        // tanuki — the lucky shop statue you see outside real
  emoji: '🦝',         // Japanese stores. "pon poko" = their belly-drum sound
  art: null,           // e.g. 'assets/keeper/poko.png' — replaces the emoji
};

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
  broke: ['Coins running low? Sell your doubles at the market.'],
};

function keeperPick(key) {
  const arr = KEEPER_LINES[key];
  return arr[Math.floor(Math.random() * arr.length)];
}

function keeperFaceHTML(cls = '') {
  return SHOPKEEPER.art
    ? `<img class="keeper-img ${cls}" src="${SHOPKEEPER.art}" alt="${SHOPKEEPER.name}">`
    : `<span class="keeper-emoji ${cls}">${SHOPKEEPER.emoji}</span>`;
}

// ---------- speech bubble ----------

let kbTimer = null;
let kbQueue = [];
let kbShowing = false;

function keeperSay(text, ms = 4200) {
  // Poko lives in the shop — if the player is off in another tab, they call
  // out with a toast instead of talking to an empty room
  const shopTab = document.querySelector('#tab-machines');
  if (!shopTab || shopTab.hidden) {
    toast(`${SHOPKEEPER.emoji} ${text}`, 'good');
    return;
  }
  kbQueue.push({ text, ms });
  if (!kbShowing) keeperNext();
}

// A tutorial-style run of lines, shown back to back.
function keeperSayAll(lines, ms = 5200) {
  for (const l of lines) keeperSay(l, ms);
}

function keeperNext() {
  const bubble = document.querySelector('#keeper-bubble');
  if (!bubble) return;
  const next = kbQueue.shift();
  if (!next) {
    kbShowing = false;
    if (!FX_REDUCED) bubble.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease-in' });
    // hide on a timer, never on an animation event — a stalled animation
    // must not be able to strand the bubble on screen
    setTimeout(() => { if (!kbShowing) bubble.hidden = true; }, FX_REDUCED ? 0 : 200);
    return;
  }
  kbShowing = true;
  bubble.hidden = false;
  bubble.querySelector('.kb-text').textContent = next.text;
  bubble.classList.toggle('more', kbQueue.length > 0);
  clearTimeout(kbTimer);
  kbTimer = setTimeout(keeperNext, next.ms);
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
  keeperSay(extra ? `${extra} ${keeperPick(key)}` : keeperPick(key));
}

// ---------- setup ----------

function initShopkeeper() {
  const keeper = document.querySelector('#shopkeeper');
  const bubble = document.querySelector('#keeper-bubble');
  if (!keeper || !bubble) return;
  keeper.querySelector('.keeper-char').innerHTML = keeperFaceHTML();
  bubble.querySelector('.kb-face').innerHTML = keeperFaceHTML('mini');
  // tapping the bubble skips ahead; tapping Poko opens the stamp card
  bubble.addEventListener('click', () => { clearTimeout(kbTimer); keeperNext(); });
  keeper.addEventListener('click', () => {
    sfx.tick();
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
    keeperSay(`${state.streak} ${keeperPick('greetStreak')}`);
  } else {
    keeperSay(keeperPick('greet'));
  }
  if (stampCardFull()) keeperSay(keeperPick('cardFull'), 5200);
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

// ---------- stamp rally card ----------

function stampSlotsHTML() {
  const have = Math.min(cardStamps(), STAMP.cardSize);
  let out = '';
  for (let i = 0; i < STAMP.cardSize; i++) {
    out += `<div class="stamp-slot${i < have ? ' stamped' : ''}">
      ${i < have ? `<span class="stamp-mark">${SHOPKEEPER.emoji}</span>` : `<span class="stamp-no">${i + 1}</span>`}
    </div>`;
  }
  return out;
}

function stampBar(done, total, label) {
  return `<div class="stamp-task">
    <span class="st-label">${label}</span>
    <span class="st-bar"><i style="width:${(done / total * 100).toFixed(0)}%"></i></span>
    <span class="st-n">${done}/${total}</span>
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
function stampMiniHTML() {
  const s = stampState();
  return `<span class="stamp-mini">${SHOPKEEPER.emoji} stamp card —
    pulls ${s.pulls}/${STAMP.perPulls} · games ${s.plays}/${STAMP.perPlays} ·
    album ${s.binderDone ? '✓' : '–'}</span>`;
}

function noteStamp(kind) {
  const s = stampState();
  const was = { pulls: s.pulls, plays: s.plays, binder: s.binderDone };
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
  if (!filled) return;
  const label = kind === 'pull' ? 'Capsule pulls' : kind === 'play' ? 'Arcade games' : 'Album visit';
  sfx.tick();
  keeperSay(`${label} done on your stamp card! Still need ${stampNeeds().join(' and ')}.`, 5600);
}
