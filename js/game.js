// GaPon — state, save/load, daily logic, seeded rotation, weighted pulls.

const SAVE_KEY = 'gapon-save-v1';

let state = null;

function defaultState() {
  return {
    coins: ECON.startCoins,
    inv: {},            // itemId -> count
    claimedSets: [],    // collection ids whose completion bonus was claimed
    lastDaily: null,    // 'YYYY-MM-DD' of last daily bonus
    streak: 0,
    totalPulls: 0,
    days: [],           // distinct days played
    arcade: { date: null, used: 0 },  // daily minigame plays
    stock: null,        // per-rotation capsule stock: { period, left: {low,mid,high} }
    fernDay: null,      // 'YYYY-MM-DD' the fern last paid out (once a day)
    wall: [],           // placed stickers: { id, x, y, rot, s } (x/y normalized 0–1)
    wallBg: 'plum',     // sticker wall wallpaper id
  };
}

// ---- capsule stock (lazily refilled each half-day rotation) ----

const STOCK_TIERS = ['low', 'mid', 'high', 'special'];

// 1–2 golden FREE PLAY ticket positions among the capsules still in the
// machine — never the final slot, which is reserved for the pity sticker.
function seedTicketPositions(done = 0) {
  const open = [];
  for (let i = done; i < ECON.machineStock - 1; i++) open.push(i);
  const n = Math.min(open.length, Math.random() < 0.35 ? 2 : 1);
  const picks = new Set();
  while (picks.size < n) picks.add(open[Math.floor(Math.random() * open.length)]);
  return [...picks];
}

function machineStock() {
  const period = currentPeriod();
  if (!state.stock || state.stock.period !== period) {
    state.stock = { period, left: {}, tickets: {} };
    for (const t of STOCK_TIERS) {
      state.stock.left[t] = ECON.machineStock;
      state.stock.tickets[t] = seedTicketPositions();
    }
    saveGame();
  }
  // older saves mid-rotation (pre-ticket or pre-special builds): fill gaps
  if (!state.stock.tickets) state.stock.tickets = {};
  let patched = false;
  for (const t of STOCK_TIERS) {
    if (state.stock.left[t] == null) {
      state.stock.left[t] = ECON.machineStock;
      patched = true;
    }
    if (!state.stock.tickets[t]) {
      state.stock.tickets[t] = seedTicketPositions(ECON.machineStock - state.stock.left[t]);
      patched = true;
    }
  }
  if (patched) saveGame();
  return state.stock;
}

function stockLeft(tierId) { return machineStock().left[tierId]; }

// 0-based index of the NEXT pull from this machine this rotation.
function pullsDone(tierId) { return ECON.machineStock - machineStock().left[tierId]; }

function nextPullIsTicket(tierId) {
  return machineStock().tickets[tierId].includes(pullsDone(tierId));
}

// How many golden capsules are still in the dome (drives the visible pile).
function goldCapsulesLeft(tierId) {
  const done = pullsDone(tierId);
  return machineStock().tickets[tierId].filter(i => i >= done).length;
}

function useStock(tierId) {
  const s = machineStock();
  if (s.left[tierId] <= 0) return false;
  s.left[tierId]--;
  saveGame();
  return true;
}

// Lazily resets the play counter when the half-day period rolls over.
function arcadeState() {
  const period = currentPeriod();
  if (!state.arcade || state.arcade.date !== period) {
    state.arcade = { date: period, used: 0 };
    saveGame();
  }
  return state.arcade;
}

function arcadePlaysLeft() {
  return Math.max(0, ARCADE.playsPerRotation - arcadeState().used);
}

function useArcadePlay() {
  if (arcadePlaysLeft() <= 0) return false;
  arcadeState().used++;
  saveGame();
  return true;
}

function saveGame() {
  localStorage.setItem(SAVE_KEY, JSON.stringify(state));
}

function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    state = raw ? Object.assign(defaultState(), JSON.parse(raw)) : defaultState();
  } catch (e) {
    state = defaultState();
  }
}

function resetGame() {
  localStorage.removeItem(SAVE_KEY);
  location.reload();
}

// ---- dates ----

function pad2(n) { return String(n).padStart(2, '0'); }

function dateStr(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function todayStr() { return dateStr(new Date()); }

// Machines, bonus, and arcade plays all reset at midnight AND noon.
// Periods look like '2026-07-19a' (morning) / '2026-07-19b' (afternoon).
function currentPeriod() {
  return todayStr() + (new Date().getHours() < 12 ? 'a' : 'b');
}

function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return dateStr(d);
}

function msUntilRotate() {
  const now = new Date();
  const next = new Date(now);
  next.setHours(now.getHours() < 12 ? 12 : 24, 0, 0, 0);
  return next - now;
}

// Returns {bonus, streak} if a login bonus was granted, else null.
// The bonus is claimable once per half-day period, but the streak only
// counts calendar days — evening-only players never lose their streak.
function checkDaily() {
  const period = currentPeriod();
  if (state.lastDaily === period) return null;
  const today = todayStr();
  if (!state.days.includes(today)) {
    state.streak = state.days.includes(yesterdayStr()) ? state.streak + 1 : 1;
    state.days.push(today);
  }
  const bonus = ECON.dailyBase +
    Math.min(ECON.dailyStreakCap, (state.streak - 1) * ECON.dailyStreakStep);
  state.coins += bonus;
  state.lastDaily = period;
  saveGame();
  return { bonus, streak: state.streak };
}

// ---- seeded daily rotation ----

function hashString(s) {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The Special Pon rolls into the shop every Saturday, all day.
function isSpecialDay(d = new Date()) { return d.getDay() === 6; }

// 3 of the collections are available each half-day, one per cost tier —
// plus the Special Pon on Saturdays.
function getTodaysMachines() {
  const rng = mulberry32(hashString('gapon:' + currentPeriod()));
  const pool = COLLECTIONS.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const machines = ['low', 'mid', 'high'].map((tierId, i) => ({
    tierId,
    tier: TIERS[tierId],
    collection: pool[i],
  }));
  if (isSpecialDay()) {
    machines.push({ tierId: 'special', tier: TIERS.special, collection: SPECIAL_COLLECTION });
  }
  return machines;
}

// ---- pulls ----

function rollRarity(odds) {
  let r = Math.random();
  let last = 'common';
  for (const rar of RARITY_ORDER) {
    if (!odds[rar]) continue;   // zero-odds rarities (Special Pon commons) never roll
    last = rar;
    r -= odds[rar];
    if (r < 0) return rar;
  }
  return last;                  // float-dust fallback: highest nonzero rarity
}

function rollItem(machine) {
  const rarity = rollRarity(machine.tier.odds);
  const candidates = machine.collection.items.filter(it => it.rarity === rarity);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// Pity roll for a machine's LAST capsule: guaranteed to be a sticker you
// don't own from its collection (weighted by the tier's odds so commons
// stay likelier). Falls back to a normal roll if the set is complete.
function rollPityItem(machine) {
  const unowned = machine.collection.items.filter(it => !ownedCount(it.id));
  if (!unowned.length) return rollItem(machine);
  const odds = machine.tier.odds;
  const total = unowned.reduce((s, it) => s + odds[it.rarity], 0);
  let r = Math.random() * total;
  for (const it of unowned) {
    r -= odds[it.rarity];
    if (r < 0) return it;
  }
  return unowned[unowned.length - 1];
}

// ---- inventory helpers ----

function ownedCount(itemId) { return state.inv[itemId] || 0; }

function addItem(itemId) {
  state.inv[itemId] = ownedCount(itemId) + 1;
}

function sellItem(itemId, qty) {
  const have = ownedCount(itemId);
  const n = Math.min(qty, have);
  if (n <= 0) return 0;
  const value = RARITIES[ITEMS_BY_ID[itemId].rarity].sell * n;
  state.inv[itemId] = have - n;
  if (state.inv[itemId] === 0) delete state.inv[itemId];
  state.coins += value;
  saveGame();
  return value;
}

function sellAllDupes() {
  let total = 0;
  for (const id of Object.keys(state.inv)) {
    if (state.inv[id] > 1) total += sellItem(id, state.inv[id] - 1);
  }
  return total;
}

function collectionProgress(col) {
  return col.items.filter(it => ownedCount(it.id) > 0).length;
}

function isSetComplete(col) {
  return collectionProgress(col) === col.items.length;
}

function claimSetBonus(col) {
  if (!isSetComplete(col) || state.claimedSets.includes(col.id)) return 0;
  state.claimedSets.push(col.id);
  state.coins += ECON.setBonus;
  saveGame();
  return ECON.setBonus;
}
