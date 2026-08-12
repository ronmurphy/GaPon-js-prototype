// GaPon — the shop scene. Full-body machines standing in a store interior,
// with the pull ritual: tap a machine → it zooms to center → tap the slot to
// insert a coin → turn the crank (drag OR press-and-hold) → capsule drops.
// All input is Pointer Events so mouse and touch behave identically.

let machineSims = {};       // tierId -> MachineSim
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
  return RARITY_ORDER.map(r =>
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
}

function machineMarkup(m, col) {
  return `
    <div class="mach-topper">${m.tier.name}</div>
    <div class="mach-dome">
      <canvas width="220" height="130"></canvas>
      <i class="dome-shine"></i>
    </div>
    <div class="mach-band">
      <span class="m-col" style="color:${col.color}">${col.name}</span>
      <span class="m-prog">${collectionProgress(col)}/${col.items.length}</span>
    </div>
    <div class="soldout-sign">SOLD OUT!<small>back after restock</small></div>
    <div class="mach-cab">
      <div class="m-odds">${oddsRow(m.tier.odds)}</div>
      <div class="mach-panel">
        <div class="coin-col">
          <div class="coin-slot"><i></i></div>
          <div class="mach-price">${coinIcon()} ${m.tier.cost}</div>
        </div>
        <div class="crank">
          <div class="crank-disc"><i class="crank-arm"></i><i class="crank-knob"></i></div>
        </div>
      </div>
      <div class="mach-chute"><div class="chute-hole"></div></div>
    </div>
    <div class="mach-feet"><i></i><i></i></div>`;
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
    card.style.setProperty('--accent', m.tier.accent);
    card.innerHTML = machineMarkup(m, col);
    host.appendChild(card);
    machineSims[m.tierId] = new MachineSim(card.querySelector('canvas'),
      stockLeft(m.tierId), goldCapsulesLeft(m.tierId));
    card.classList.toggle('soldout', stockLeft(m.tierId) <= 0);
    card.addEventListener('click', () => {
      if (focusState.stage !== 'idle' || pulling) return;
      if (stockLeft(m.tierId) <= 0) {
        sfx.buzz();
        card.animate([
          { transform: 'translateX(0)' }, { transform: 'translateX(-5px)' },
          { transform: 'translateX(5px)' }, { transform: 'translateX(0)' },
        ], { duration: 250 });
        const ms = msUntilRotate();
        toast(`All out of capsules — restock in ${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m!`, 'warn');
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
}

function shopSyncProgress() {
  for (const { m, card } of shopMachines) {
    card.querySelector('.m-prog').textContent =
      `${collectionProgress(m.collection)}/${m.collection.items.length}`;
    card.classList.toggle('soldout', stockLeft(m.tierId) <= 0);
  }
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

// ---------- focus (zoom to machine) ----------

function initShopOnce() {
  if (shopInited) return;
  shopInited = true;
  document.querySelector('#focus-layer').addEventListener('click', e => {
    if (e.target.closest('.mach')) return;
    if (focusState.stage === 'zoom' || focusState.stage === 'coin') shopUnfocus();
    else if (focusState.stage === 'crank') setHint('turn the crank!');
  });
  addEventListener('resize', () => {
    const card = focusState.card;
    if (!card) return;
    positionFocused(parseFloat(card.style.width), card.offsetHeight,
      { left: parseFloat(card.style.left), top: parseFloat(card.style.top) });
  });
  addEventListener('keydown', e => {
    if (e.key === 'Escape' &&
        (focusState.stage === 'zoom' || focusState.stage === 'coin')) shopUnfocus();
  });
  initFern();
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
    const found = 8 + Math.floor(Math.random() * 18);   // 8–25 coins
    state.coins += found;
    saveGame();
    updateHeader();
    sfx.coin();
    sfx.chime();
    fxSparkleBurst(fern, { count: 16, color: '#9ccc65', spread: 90 });
    toast(`You found ${found} coins in the fern?! 🌿`, 'good');
  });
}

function setHint(text) {
  const h = document.querySelector('#focus-hint');
  h.textContent = text;
  h.classList.toggle('show', !!text);
}

function positionFocused(w, h, from) {
  const vw = innerWidth, vh = innerHeight;
  const s = Math.max(1, Math.min((vw - 28) / w, (vh - 170) / h, 1.9));
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
  const layer = document.querySelector('#focus-layer');
  layer.classList.remove('lit');
  setHint('');
  card.classList.remove('await-coin', 'coin-in', 'broke');
  const put = () => {
    card.classList.remove('focused');
    card.style.transform = card.style.left = card.style.top = card.style.width = '';
    ghost.parentNode.insertBefore(card, ghost);
    ghost.remove();
    layer.hidden = true;
    Object.assign(focusState, { card: null, m: null, ghost: null, stage: 'idle', autoSpin: null });
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
  card.classList.remove('await-coin');
  setHint('');
  flyCoin(document.querySelector('.coin-chip'), card.querySelector('.coin-slot'), () => {
    sfx.coin();
    card.classList.add('coin-in');
    focusState.stage = 'crank';
    setHint('turn the crank!');
    armCrank(card, vend);
  });
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
  const ticket = nextPullIsTicket(m.tierId);
  useStock(m.tierId);
  // the machine's last capsule is the pity capsule — see rollPityItem
  const pity = !ticket && stockLeft(m.tierId) === 0;
  const item = ticket ? null : (pity ? rollPityItem(m) : rollItem(m));
  const isNew = item ? ownedCount(item.id) === 0 : false;
  if (item) addItem(item.id);
  state.totalPulls++;
  saveGame();
  updateFooter();
  sfx.rattle();
  card.classList.add('dispensing');
  const capColor = machineSims[m.tierId].shakeAndDispense(ticket);
  setTimeout(() => {
    card.classList.remove('dispensing');
    sfx.thunk();
    showChuteCapsule(card, capColor, () => {
      focusState.stage = 'capsule';
      if (ticket) showTicketReveal(m);
      else showReveal(item, isNew, m, card, capColor, { fromChute: true, pity });
    });
  }, 950);
}

function showChuteCapsule(card, color, onOpen) {
  const hole = card.querySelector('.chute-hole');
  const cap = document.createElement('div');
  cap.className = 'chute-cap';
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
  if (stockLeft(m.tierId) <= 0) {
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
  flyCoin(document.querySelector('.coin-chip'), card.querySelector('.coin-slot'), () => {
    sfx.coin();
    focusState.stage = 'crank';
    armCrank(card, vend);
    focusState.autoSpin();
  });
}
