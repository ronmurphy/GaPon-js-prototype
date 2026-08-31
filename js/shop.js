// GaPon — the shop scene. Full-body machines standing in a store interior,
// with the pull ritual: tap a machine → it zooms to center → tap the slot to
// insert a coin → turn the crank (drag OR press-and-hold) → capsule drops.
// All input is Pointer Events so mouse and touch behave identically.

let machineSims = {};       // floor slot id -> MachineSim
let shopMachines = [];      // [{ m, card }] as currently rendered
let renderedPeriod = null;
let pulling = false;
let shopInited = false;

const CRANK_TURN = 480;     // degrees of crank travel needed to vend

// One machine at a time goes through the ritual. `stage` is the state machine:
// idle → zoom → coin → crank → vend → capsule → (reveal overlay) → idle
const focusState = { card: null, m: null, ghost: null, stage: 'idle', autoSpin: null };

// ---------- rendering ----------

function oddsRow(odds) {
  return RARITY_ORDER.filter(r => odds[r] > 0).map(r =>
    `<span class="odd"><i class="dot" style="background:${RARITIES[r].color}"></i>${(odds[r] * 100).toFixed(0)}%</span>`
  ).join('');
}

function shopTimeClass() {
  const h = new Date().getHours();
  if (h >= 6 && h < 11) return 'shop-morning';
  if (h < 17) return 'shop-day';
  if (h < 21) return 'shop-dusk';
  return 'shop-night';
}

// Lighting + the window's sky follow the real clock.
function applyShopTime() {
  const shop = document.querySelector('#shop');
  if (!shop) return;
  shop.classList.remove('shop-morning', 'shop-day', 'shop-dusk', 'shop-night');
  shop.classList.add(shopTimeClass());
  shop.classList.toggle('special-day', isSpecialDay());
}

function machineMarkup(m, col) {
  const isClaw = m.kind === 'claw';
  const isFuku = m.kind === 'fuku';
  const glass = isFuku
    // the drum is wood and paper, not a glass dome — no capsule sim here
    ? `<div class="fuku-drum">
         <div class="drum-body"><i></i><i></i><i></i></div>
         <div class="drum-tray"></div>
       </div>`
    : `<canvas width="220" height="${isClaw ? 180 : 130}"></canvas>
       <i class="dome-shine"></i>`;
  const band = isFuku
    ? `<span class="m-col" style="color:#ffd54f">any set — you choose!</span>
       <span class="m-prog">${stockLeft(m.id)} left</span>`
    : `<span class="m-col" style="color:${col.color}">${col.name}</span>
       <span class="m-prog">${collectionProgress(col)}/${col.items.length}</span>`;
  return `
    <div class="mach-topper">${isClaw ? 'Claw ' + m.tier.name.split(' ')[0] : m.tier.name}</div>
    <div class="mach-dome">${glass}</div>
    <div class="mach-band">${band}</div>
    <div class="soldout-sign">SOLD OUT!<small>back after restock</small></div>
    <div class="mach-cab">
      <div class="m-odds">${isFuku ? fukuOddsRow() : oddsRow(m.tier.odds)}</div>
      <div class="mach-panel">
        <div class="coin-col">
          <div class="coin-slot"><i></i></div>
          <div class="mach-price">${coinIcon()} ${m.tier.cost}</div>
        </div>
        ${isClaw
          ? '<button class="claw-drop-btn" disabled>DROP</button>'
          : `<div class="crank">
               <div class="crank-disc"><i class="crank-arm"></i><i class="crank-knob"></i></div>
             </div>`}
      </div>
      <div class="mach-chute"><div class="chute-hole"></div></div>
    </div>
    <div class="mach-feet"><i></i><i></i></div>`;
}

// The drum shows marble colours where a Pon machine lists rarity odds.
function fukuOddsRow() {
  return FUKU.marbles.map(mb =>
    `<span class="odd"><i class="dot" style="background:${mb.hex}"></i>${(mb.p * 100).toFixed(0)}%</span>`
  ).join('');
}

function renderMachines() {
  initShopOnce();
  clearSims();
  machineSims = {};
  shopMachines = [];
  renderedPeriod = currentPeriod();
  applyShopTime();
  const host = document.querySelector('#machines');
  host.innerHTML = '';
  for (const m of getTodaysMachines()) {
    const col = m.collection;
    const card = document.createElement('div');
    card.className = 'mach';
    if (m.kind === 'claw') card.classList.add('clawmach');
    if (m.kind === 'fuku') card.classList.add('fukumach');
    if (m.tierId === 'special') card.classList.add('deluxe');
    card.style.setProperty('--accent', m.tier.accent);
    card.innerHTML = machineMarkup(m, col);
    host.appendChild(card);
    if (m.kind !== 'fuku') {          // the drum has no capsule pile to sim
      // stockMax, not stockLeft, for the size — a half-empty machine's capsules
      // must look the same as when it was full.
      machineSims[m.id] = new MachineSim(card.querySelector('canvas'),
        stockLeft(m.id), goldCapsulesLeft(m.id, m.kind), m.kind === 'claw',
        stockMax(m.id), capShapeFor(m.tierId));
    }
    card.classList.toggle('soldout', stockLeft(m.id) <= 0);
    card.addEventListener('click', () => {
      if (focusState.stage !== 'idle' || pulling) return;
      if (stockLeft(m.id) <= 0) {
        sfx.buzz();
        card.animate([
          { transform: 'translateX(0)' }, { transform: 'translateX(-5px)' },
          { transform: 'translateX(5px)' }, { transform: 'translateX(0)' },
        ], { duration: 250 });
        const ms = msUntilRotate();
        keeperSay(`${keeperPick('soldOut')} (${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m)`, 4200, 'soldOut');
        return;
      }
      focusMachine(m, card);
    });
    // slot (and price tag) taps insert the coin once the machine is focused
    card.querySelector('.coin-col').addEventListener('click', e => {
      if (focusState.card !== card || focusState.stage !== 'coin') return;
      e.stopPropagation();
      tryInsertCoin();
    });
    shopMachines.push({ m, card });
  }
  updateRotateTimer();
  syncKeeperOpen();
}

// Poko dozes off when there's nothing left to sell — it makes the restock
// clock feel like the shop having hours rather than a timer running out.
function syncKeeperOpen() {
  const keeper = document.querySelector('#shopkeeper');
  if (!keeper || !shopMachines.length) return;
  const closed = shopMachines.every(({ m }) => stockLeft(m.id) <= 0);
  if (keeper.classList.contains('closed') === closed) return;
  keeper.classList.toggle('closed', closed);
  keeperSetPose(closed ? 'closed' : 'welcome');
}

function shopSyncProgress() {
  for (const { m, card } of shopMachines) {
    // the drum isn't tied to one collection, so it counts marbles instead
    card.querySelector('.m-prog').textContent = m.kind === 'fuku'
      ? `${stockLeft(m.id)} left`
      : `${collectionProgress(m.collection)}/${m.collection.items.length}`;
    card.classList.toggle('soldout', stockLeft(m.id) <= 0);
  }
  syncKeeperOpen();
}

function updateRotateTimer() {
  // if the half-day rolled over while the page sat open, restock the shop
  if (renderedPeriod && renderedPeriod !== currentPeriod() &&
      focusState.stage === 'idle' && !pulling) {
    renderMachines();
    toast('The shop restocked — fresh machines!', 'good');
    return;
  }
  applyShopTime();
  const ms = msUntilRotate();
  const h = Math.floor(ms / 3600000), min = Math.floor((ms % 3600000) / 60000);
  const el = document.querySelector('#rotate-timer');
  if (el) el.textContent = `restock in ${h}h ${min}m`;
}
setInterval(updateRotateTimer, 60000);

// A focused machine is lifted into #focus-layer and everything behind it is
// dimmed — including the header, where the coin counter lives. So spending
// was correct but invisible: Chris pointed out you never see the number move
// while you're standing at the machine. Show the cost coming off AT the slot,
// where the player is already looking.
function spendFloat(card, cost) {
  const slot = card && card.querySelector('.coin-slot');
  if (slot) fxFloat('−' + cost, slot, '#ff8a65');
}

// ---------- focus (zoom to machine) ----------

function initShopOnce() {
  if (shopInited) return;
  shopInited = true;
  document.querySelector('#focus-layer').addEventListener('click', e => {
    if (e.target.closest('.mach')) return;
    if (focusState.stage === 'zoom' || focusState.stage === 'coin') shopUnfocus();
    else if (focusState.stage === 'crank') setHint('turn the crank!');
    else if (focusState.stage === 'claw') setHint('drop when the ring lights up!');
  });
  // Phone browsers fire `resize` every time the URL bar slides away while
  // scrolling — height changes, width doesn't. Recomputing the zoom on that
  // makes a focused machine visibly swell and shrink mid-pull, so only a
  // width change (a real rotation) is allowed to rescale. The position is
  // still updated either way, so the machine stays centred.
  let lastVW = innerWidth;
  addEventListener('resize', () => {
    const card = focusState.card;
    const rotated = innerWidth !== lastVW;
    lastVW = innerWidth;
    if (!card) return;
    positionFocused(parseFloat(card.style.width), card.offsetHeight,
      { left: parseFloat(card.style.left), top: parseFloat(card.style.top) },
      rotated ? null : focusState.scale);
  });
  addEventListener('keydown', e => {
    if (e.key === 'Escape' &&
        (focusState.stage === 'zoom' || focusState.stage === 'coin')) shopUnfocus();
  });
  initFern();
  initShopkeeper();
  initOmikuji();
  updateFortuneChip();
}

// Secret: each visit, the shop fern hides a few coins. Tap it enough times
// (a random 5–15, rerolled per page load) and they shake loose. No hints —
// it's an easter egg for the curious.
function initFern() {
  const fern = document.querySelector('.dec-plant');
  if (!fern) return;
  const goal = 5 + Math.floor(Math.random() * 11);
  let taps = 0;
  // once per calendar day, persisted — refreshing the page won't re-arm it
  let paid = state.fernDay === todayStr();
  fern.addEventListener('click', () => {
    sfx.rustle();
    // wiggles get more excited the closer you are
    const amp = paid ? 4 : 4 + (taps / goal) * 10;
    fern.animate([
      { transform: 'rotate(0deg)' },
      { transform: `rotate(${-amp}deg)` },
      { transform: `rotate(${amp * 0.8}deg)` },
      { transform: 'rotate(0deg)' },
    ], { duration: 260, easing: 'ease-in-out' });
    if (paid) return;
    if (++taps < goal) return;
    paid = true;
    state.fernDay = todayStr();
    // A held fortune makes the fern generous — but is deliberately NOT spent
    // here. Cashing a great blessing for pocket change would be strictly
    // worse than saving it for a pull, so this stays a wink, never a trap.
    const luck = heldFortune();
    const base = 8 + Math.floor(Math.random() * 18);    // 8–25 coins
    const found = Math.round(base * (luck ? luck.mult : 1));
    state.coins += found;
    saveGame();
    updateHeader();
    sfx.coin();
    sfx.chime();
    fxSparkleBurst(fern, { count: luck ? 24 : 16, color: '#9ccc65', spread: luck ? 120 : 90 });
    toast(luck
      ? `You found ${found} coins in the fern?! ${luck.kanji} is treating you well 🌿`
      : `You found ${found} coins in the fern?! 🌿`, 'good');
    if (luck) keeperSay(`${luck.kanji} luck even in the pot plant! You've still got the fortune, mind.`, 4200, 'wants');
  });
}

function setHint(text) {
  const h = document.querySelector('#focus-hint');
  h.textContent = text;
  h.classList.toggle('show', !!text);
}

// `keepScale` reuses the zoom already in effect instead of recomputing it —
// see the resize handler for why that matters.
function positionFocused(w, h, from, keepScale) {
  const vw = innerWidth, vh = innerHeight;
  const s = keepScale != null
    ? keepScale
    : Math.max(1, Math.min((vw - 28) / w, (vh - 170) / h, 1.9));
  focusState.scale = s;
  const dx = vw / 2 - (from.left + w / 2);
  const dy = (vh - 90) / 2 - (from.top + h / 2);
  focusState.card.style.transform = `translate(${dx}px, ${dy}px) scale(${s})`;
}

// The machine element itself is re-parented into the fixed focus layer (a
// placeholder keeps its spot in the shop row), then transformed to center
// screen — so the zoom is literally the same machine, capsules and all.
function focusMachine(m, card) {
  const layer = document.querySelector('#focus-layer');
  const rect = card.getBoundingClientRect();
  const ghost = document.createElement('div');
  ghost.className = 'mach-ghost';
  ghost.style.width = rect.width + 'px';
  ghost.style.height = rect.height + 'px';
  card.parentNode.insertBefore(ghost, card);
  Object.assign(focusState, { card, m, ghost, stage: 'zoom' });

  layer.hidden = false;
  layer.appendChild(card);
  card.classList.add('focused');
  card.style.left = rect.left + 'px';
  card.style.top = rect.top + 'px';
  card.style.width = rect.width + 'px';
  void card.offsetWidth;              // commit start position before animating
  positionFocused(rect.width, rect.height, rect);
  requestAnimationFrame(() => layer.classList.add('lit'));
  setTimeout(beginCoinStage, FX_REDUCED ? 0 : 480);
}

function shopUnfocus(instant = false) {
  const { card, ghost } = focusState;
  if (!card) return;
  // Stepping back from a machine is the real end of a session — "pull again"
  // keeps you standing here, so the reveal isn't it. Emptying a 25-coin
  // machine one pull at a time would otherwise send the whole save, photos
  // and all, once per capsule.
  if (typeof netFlushCloud === 'function') netFlushCloud();
  clearInterval(focusState.clawLoop);
  for (const sim of Object.values(machineSims)) {
    if (sim.claw) sim.claw.aiming = false;
  }
  const layer = document.querySelector('#focus-layer');
  layer.classList.remove('lit');
  setHint('');
  card.classList.remove('await-coin', 'coin-in', 'broke');
  const put = () => {
    card.classList.remove('focused');
    card.style.transform = card.style.left = card.style.top = card.style.width = '';
    // The row can be rebuilt while a machine is lifted out (a restock), which
    // takes the ghost with it. Putting the card back then throws and strands
    // it forever, so fall back to discarding this now-stale card — the fresh
    // row already contains its replacement.
    if (ghost && ghost.parentNode) {
      ghost.parentNode.insertBefore(card, ghost);
      ghost.remove();
    } else {
      card.remove();
    }
    layer.hidden = true;
    Object.assign(focusState, { card: null, m: null, ghost: null, stage: 'idle',
                                autoSpin: null, scale: null });
    pulling = false;
  };
  if (instant || FX_REDUCED) { put(); return; }
  card.style.transform = 'translate(0px, 0px) scale(1)';
  setTimeout(put, 480);
}

// ---------- coin ----------

function beginCoinStage() {
  const { m, card } = focusState;
  if (!card) return;
  focusState.stage = 'coin';
  if (state.coins >= m.tier.cost) {
    card.classList.add('await-coin');
    setHint(`tap the coin slot · ${m.tier.cost} coins`);
  } else {
    card.classList.add('broke');
    setHint(`need ${m.tier.cost} coins — sell dupes at the market!`);
  }
}

function tryInsertCoin() {
  const { m, card } = focusState;
  if (state.coins < m.tier.cost) {
    sfx.buzz();
    card.animate([
      { transform: card.style.transform + ' translateX(0)' },
      { transform: card.style.transform + ' translateX(-6px)' },
      { transform: card.style.transform + ' translateX(6px)' },
      { transform: card.style.transform + ' translateX(0)' },
    ], { duration: 260 });
    return;
  }
  focusState.stage = 'inserting';
  state.coins -= m.tier.cost;
  saveGame();
  updateHeader();
  spendFloat(card, m.tier.cost);
  card.classList.remove('await-coin');
  setHint('');
  flyCoin(document.querySelector('.coin-chip'), card.querySelector('.coin-slot'), () => {
    sfx.coin();
    card.classList.add('coin-in');
    if (m.kind === 'claw') {
      focusState.stage = 'claw';
      setHint('drop when the ring lights up!');
      armClaw(card, m);
    } else if (m.kind === 'fuku') {
      focusState.stage = 'crank';
      setHint('turn the drum!');
      armCrank(card, () => vendFuku(m, card));
    } else {
      focusState.stage = 'crank';
      setHint('turn the crank!');
      armCrank(card, vend);
    }
  });
}

// ---------- fukubiki drum ----------

function vendFuku(m, card) {
  focusState.stage = 'vend';
  pulling = true;
  setHint('');
  useStock(m.id);
  const marble = drawMarble();
  state.totalPulls++;
  saveGame();
  updateFooter();
  shopSyncProgress();
  card.querySelector('.drum-body').classList.add('spinning');
  sfx.rattle();
  setTimeout(() => {
    card.querySelector('.drum-body').classList.remove('spinning');
    if (!marble) {
      // Nothing left in the whole album to give, so the shop declines the sale
      // and hands the coins straight back — a REFUND, not a reward. It paid 1.5x
      // once, which meant the one player who can reach this path (they own every
      // sticker, so their coins already have nowhere to go) was also the only
      // one earning a passive income. That is the exact pile the prize counter
      // exists to drain; a faucet feeding it would turn buying into waiting.
      state.coins += m.tier.cost;
      // Empty the drum too. At a flat refund the other marbles are all zero-net
      // cranks, so hang up the SOLD OUT sign the machines already have rather
      // than let someone turn it nine more times for nothing.
      emptyStock(m.id);
      saveGame();
      updateHeader();
      shopSyncProgress();
      sfx.coin();
      toast(`You own every sticker! Poko won't take your money — here's your ${m.tier.cost} back.`, 'good');
      pulling = false;
      shopUnfocus();
      return;
    }
    dropMarble(card, marble, () => showMarbleResult(m, marble));
  }, 1400);
}

function dropMarble(card, marble, done) {
  const tray = card.querySelector('.drum-tray');
  const ball = document.createElement('div');
  ball.className = 'marble';
  ball.style.setProperty('--mb', marble.hex);
  tray.appendChild(ball);
  sfx.thunk();
  if (!FX_REDUCED) {
    ball.animate([
      { transform: 'translate(-26px, -34px) scale(0.7)' },
      { transform: 'translate(0, 0) scale(1)' },
    ], { duration: 420, easing: 'cubic-bezier(.3,1.4,.5,1)' });
  }
  setHint('tap the marble!');
  let opened = false;
  const open = () => {
    if (opened) return;
    opened = true;
    setHint('');
    ball.remove();
    done();
  };
  ball.addEventListener('click', e => { e.stopPropagation(); open(); });
  setTimeout(open, 2600);
}

// Marble colour decided the rarity; now the player picks the collection.
function showMarbleResult(m, marble) {
  const rar = RARITIES[marble.rarity];
  const targets = swapTargets(marble.rarity);
  const ov = $('#overlay');
  ov.hidden = false;
  ov.innerHTML = `
    <div class="ov-stage share-stage">
      <div class="big-marble" style="--mb:${marble.hex}"></div>
      <div class="r-name">${marble.label}</div>
      <div class="r-chips">
        <span class="chip" style="background:${rar.color}">${rar.label}</span>
        ${marble.bumped ? '<span class="chip dupe">bumped — your set was full</span>' : ''}
      </div>
      <p class="r-note">pick a set — you'll get one you're missing</p>
      <div class="swap-picks">
        ${targets.map(t => `
          <button class="swap-pick" data-col="${t.col.id}" style="--c:${t.col.color}">
            <span class="sp-name">${t.col.name}</span>
            <span class="sp-miss">${t.missing.length} missing</span>
          </button>`).join('')}
      </div>
    </div>`;
  sfx.chime();
  ov.querySelectorAll('[data-col]').forEach(b =>
    b.addEventListener('click', () => {
      const got = claimFuku(marble.rarity, b.dataset.col);
      if (!got) return;
      updateFooter();
      pulling = false;
      focusState.stage = 'capsule';
      showGiftReveal(got.item, true, null, {
        chip: `🎊 ${marble.color} marble`,
        pull: true,
        foil: got.foil,
        again: { label: 'Draw again', cost: m.tier.cost, fn: shopAutoPull },
        onClose: () => { shopSyncProgress(); shopUnfocus(); },
      });
    }));
}

// ---------- claw machines ----------

// Drives the claw inside the machine's own glass box. Unlike the Pon
// ritual, this one can fail: a missed grab keeps your coins spent but
// leaves the capsule in the machine, exactly like the real cabinet.
function armClaw(card, m) {
  const sim = machineSims[m.id];
  const btn = card.querySelector('.claw-drop-btn');
  // the rig is put away after each attempt, so rebuild it for a retry
  if (!sim.claw) sim.claw = { x: sim.w / 2, y: 16, open: 1, holding: null };
  const cl = sim.claw;
  const W = sim.w;
  let phase = 'slide', dir = 1, timer = 0, grabbed = null, done = false;
  cl.x = W / 2;
  cl.y = 16;
  cl.open = 1;
  cl.aiming = true;
  cl.holding = null;
  btn.disabled = false;

  const drop = () => {
    if (phase !== 'slide') return;
    phase = 'down';
    cl.aiming = false;
    btn.disabled = true;
    sfx.tick();
  };
  btn.addEventListener('click', e => { e.stopPropagation(); drop(); });
  card.querySelector('.mach-dome').addEventListener('click', e => { e.stopPropagation(); drop(); });

  const finishClaw = () => {
    if (done) return;
    done = true;
    cl.aiming = false;
    sim.claw = null;                 // put the rig away until the next coin
    clearInterval(loopId);
    clawResult(m, card, grabbed);
  };

  const tick = () => {
    if (done) return;
    if (!card.isConnected) { clearInterval(loopId); return; }
    if (phase === 'slide') {
      cl.x += dir * 2.2;
      if (cl.x < 24) { cl.x = 24; dir = 1; }
      if (cl.x > W - 24) { cl.x = W - 24; dir = -1; }
    } else if (phase === 'down') {
      cl.y += 3.4;
      const t = sim.capsuleNear(cl.x, sim.grabReach());
      const floor = t ? t.y - t.r - 4 : sim.h - 26;
      if (cl.y >= floor) { cl.y = floor; phase = 'grip'; timer = 0; }
    } else if (phase === 'grip') {
      timer++;
      cl.open = Math.max(0, 1 - timer / 14);
      if (timer > 18) {
        const t = sim.capsuleNear(cl.x, sim.grabReach());
        if (!t) {
          sfx.thunk();                                  // closed on nothing
        } else {
          // centred grabs hold; edge grabs usually slip off the round shell
          const centred = Math.abs(t.x - cl.x) < 11;
          if (Math.random() < (centred ? 0.9 : 0.5)) {
            t.heldByClaw = true;
            cl.holding = t;
            grabbed = t;
            sfx.chime();
          } else {
            sfx.buzz();
          }
        }
        phase = 'up';
        timer = 0;
      }
    } else if (phase === 'up') {
      cl.y -= 2.8;
      if (cl.holding) { cl.holding.x = cl.x; cl.holding.y = cl.y + 20; }
      if (cl.y <= 16) { cl.y = 16; phase = 'carry'; }
    } else if (phase === 'carry') {
      cl.x -= 3;
      if (cl.holding) { cl.holding.x = cl.x; cl.holding.y = cl.y + 20; }
      if (cl.x <= 24) { phase = 'let-go'; timer = 0; }
    } else if (phase === 'let-go') {
      timer++;
      cl.open = Math.min(1, timer / 10);
      if (cl.holding) {
        cl.holding.heldByClaw = false;
        cl.holding.dispensing = true;     // falls out of the machine
        cl.holding = null;
      }
      if (timer > 14) finishClaw();
    }
  };
  // setInterval rather than rAF: the sim already owns the animation frame,
  // and this only needs to nudge the claw's position each tick
  const loopId = setInterval(tick, 16);
  focusState.clawLoop = loopId;
}

function clawResult(m, card, grabbed) {
  setHint('');
  if (!grabbed) {
    // stock is untouched — you paid for the attempt, not the capsule
    pulling = false;
    // deliberately NOT 'idle': the card is still lifted out of the row, and
    // 'idle' would let the restock timer rebuild the row underneath it
    focusState.stage = 'retry';
    sfx.buzz();
    toast('The claw came up empty! Your capsule is still in there.', 'warn');
    keeperSay('Ooh, so close! The claw never grips on the first try.', 4200, 'soldOut');
    setTimeout(() => {
      if (focusState.card === card) beginCoinStage();   // straight into a retry
    }, 900);
    return;
  }
  pulling = true;
  useStock(m.id);
  const gold = grabbed.gold;
  machineSims[m.id].removeCapsule(grabbed);
  const capColor = grabbed.color;
  if (gold) takeClawGold(m.id);
  let item = null, isNew = false, foil = false;
  if (!gold) {
    const pity = stockLeft(m.id) === 0;
    item = pity ? rollPityItem(m) : rollItem(m);
    isNew = !hasItem(item.id);
    foil = addItem(item.id);
  }
  // The band reads "3/12" for the set — your progress, not capsules left — so
  // it has to refresh once the sticker is actually yours. It used to wait
  // until you walked away from the machine, which is what Chris noticed.
  shopSyncProgress();
  state.totalPulls++;
  saveGame();
  updateFooter();
  sfx.thunk();
  showChuteCapsule(card, capColor, () => {
    focusState.stage = 'capsule';
    if (gold) showTicketReveal(m);
    else showReveal(item, isNew, m, card, capColor, { fromChute: true, foil, pity: stockLeft(m.id) === 0 });
  }, capShapeFor(m.tierId));
}

// A coin flies from the header counter into the machine's slot. The ritual
// must never stall on a lost animation event, so completion also has a
// timer fallback — whichever fires first wins.
function flyCoin(fromEl, toEl, done) {
  if (FX_REDUCED || !fromEl) { done(); return; }
  let called = false;
  const once = () => { if (!called) { called = true; c.remove(); done(); } };
  const a = fromEl.getBoundingClientRect(), b = toEl.getBoundingClientRect();
  const c = document.createElement('span');
  c.className = 'msr fly-coin';
  c.textContent = 'toll';
  c.style.left = (a.left + a.width / 2) + 'px';
  c.style.top = (a.top + a.height / 2) + 'px';
  document.body.appendChild(c);
  const dx = (b.left + b.width / 2) - (a.left + a.width / 2);
  const dy = (b.top + b.height / 2) - (a.top + a.height / 2);
  c.animate([
    { transform: 'translate(-50%,-50%) scale(1) rotate(0deg)', opacity: 1 },
    { transform: `translate(calc(-50% + ${(dx * 0.55).toFixed(1)}px), calc(-50% + ${(dy * 0.3).toFixed(1)}px)) scale(1.3) rotate(180deg)`, offset: 0.5 },
    { transform: `translate(calc(-50% + ${dx.toFixed(1)}px), calc(-50% + ${dy.toFixed(1)}px)) scale(0.45) rotate(360deg)`, opacity: 0.9 },
  ], { duration: 520, easing: 'cubic-bezier(.3,.7,.4,1)' }).onfinish = once;
  setTimeout(once, 620);
}

// ---------- crank ----------

// Drag the crank in a circle, or press-and-hold to let it spin itself.
// Accumulated rotation (either direction) past CRANK_TURN vends.
function armCrank(card, onComplete) {
  const crank = card.querySelector('.crank');
  const disc = card.querySelector('.crank-disc');
  crank.classList.add('armed');
  let total = 0, lastA = null, ticks = 0, pid = null;
  let holdTimer = null, spinning = false, done = false, raf = null;

  const center = () => {
    const r = crank.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  };
  const finish = () => {
    if (done) return;
    done = true;
    cancelAnimationFrame(raf);
    clearTimeout(holdTimer);
    crank.classList.remove('armed');
    crank.removeEventListener('pointerdown', downH);
    crank.removeEventListener('pointermove', moveH);
    crank.removeEventListener('pointerup', upH);
    crank.removeEventListener('pointercancel', upH);
    disc.style.transform = `rotate(${Math.round(total / 360) * 360}deg)`;
    onComplete();
  };
  const bump = d => {
    total += d;
    disc.style.transform = `rotate(${total}deg)`;
    const t = Math.floor(Math.abs(total) / 40);
    if (t > ticks) { ticks = t; sfx.tick(); }
    if (Math.abs(total) >= CRANK_TURN) finish();
  };
  const spin = () => {                 // assisted spin: hold, or "pull again"
    if (done || spinning) return;
    spinning = true;
    const step = () => {
      if (done) return;
      bump(total < 0 ? -9 : 9);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
  };
  const downH = e => {
    if (done || pid !== null) return;
    pid = e.pointerId;
    crank.setPointerCapture(pid);
    const c = center();
    lastA = Math.atan2(e.clientY - c.y, e.clientX - c.x);
    holdTimer = setTimeout(spin, 450);
    e.preventDefault();
    e.stopPropagation();
  };
  const moveH = e => {
    if (e.pointerId !== pid || done || spinning) return;
    const c = center();
    const a = Math.atan2(e.clientY - c.y, e.clientX - c.x);
    let d = (a - lastA) * 180 / Math.PI;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    lastA = a;
    if (Math.abs(d) > 2) {             // real dragging cancels the hold-assist
      clearTimeout(holdTimer);
      holdTimer = setTimeout(spin, 450);
    }
    bump(d);
  };
  const upH = e => {
    if (e.pointerId !== pid) return;
    pid = null;
    lastA = null;
    clearTimeout(holdTimer);
    // if the assist already kicked in, it keeps spinning to the vend
  };
  crank.addEventListener('pointerdown', downH);
  crank.addEventListener('pointermove', moveH);
  crank.addEventListener('pointerup', upH);
  crank.addEventListener('pointercancel', upH);
  focusState.autoSpin = spin;
}

// ---------- vend ----------

function vend() {
  const { m, card } = focusState;
  focusState.stage = 'vend';
  pulling = true;
  setHint('');
  // golden ticket capsule? (seeded per rotation, never the last slot)
  const ticket = nextPullIsTicket(m.id);
  useStock(m.id);
  // the machine's last capsule is the pity capsule — see rollPityItem
  const pity = !ticket && stockLeft(m.id) === 0;
  const item = ticket ? null : (pity ? rollPityItem(m) : rollItem(m));
  const isNew = item ? !hasItem(item.id) : false;
  const foil = item ? addItem(item.id) : false;
  shopSyncProgress();      // set progress updates now, not when you step back
  state.totalPulls++;
  saveGame();
  updateFooter();
  sfx.rattle();
  card.classList.add('dispensing');
  const capColor = machineSims[m.id].shakeAndDispense(ticket);
  setTimeout(() => {
    card.classList.remove('dispensing');
    sfx.thunk();
    showChuteCapsule(card, capColor, () => {
      focusState.stage = 'capsule';
      if (ticket) showTicketReveal(m);
      else showReveal(item, isNew, m, card, capColor, { fromChute: true, foil, pity });
    }, capShapeFor(m.tierId));
  }, 950);
}

function showChuteCapsule(card, color, onOpen, shape = 'round') {
  const hole = card.querySelector('.chute-hole');
  const cap = document.createElement('div');
  cap.className = 'chute-cap cap-' + shape;
  cap.style.setProperty('--cap', color);
  hole.appendChild(cap);
  if (!FX_REDUCED) {
    cap.animate([
      { transform: 'translateY(-30px)' },
      { transform: 'translateY(0)', offset: 0.6, easing: 'ease-in' },
      { transform: 'translateY(-7px)', offset: 0.8, easing: 'ease-out' },
      { transform: 'translateY(0)', easing: 'ease-in' },
    ], { duration: 420 });
  }
  setHint('tap the capsule!');
  let opened = false;
  const open = () => {
    if (opened) return;
    opened = true;
    setHint('');
    cap.remove();
    onOpen();
  };
  cap.addEventListener('click', e => { e.stopPropagation(); open(); });
  setTimeout(open, 3000);              // auto-open if they wait
}

// "Pull again" from the reveal: the machine is still focused, so replay the
// ritual quickly — coin flies in, crank spins itself, capsule drops.
function shopAutoPull() {
  const { m, card } = focusState;
  if (!m) return;
  if (stockLeft(m.id) <= 0) {
    toast('That was the last capsule — machine\'s empty until restock!', 'warn');
    shopSyncProgress();
    shopUnfocus();
    return;
  }
  if (state.coins < m.tier.cost) {
    toast(`Not enough coins for ${m.tier.name}! Sell some dupes?`, 'warn');
    shopSyncProgress();
    shopUnfocus();
    return;
  }
  focusState.stage = 'inserting';
  state.coins -= m.tier.cost;
  saveGame();
  updateHeader();
  spendFloat(card, m.tier.cost);
  flyCoin(document.querySelector('.coin-chip'), card.querySelector('.coin-slot'), () => {
    sfx.coin();
    if (m.kind === 'claw') {
      focusState.stage = 'claw';
      setHint('drop when the ring lights up!');
      armClaw(card, m);
      return;
    }
    focusState.stage = 'crank';
    if (m.kind === 'fuku') {
      setHint('turn the drum!');
      armCrank(card, () => vendFuku(m, card));
    } else {
      setHint('turn the crank!');
      armCrank(card, vend);
    }
    focusState.autoSpin();
  });
}
