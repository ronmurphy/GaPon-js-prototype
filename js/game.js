// GaPon — state, save/load, daily logic, seeded rotation, weighted pulls.

const SAVE_KEY = 'gapon-save-v1';

let state = null;

function defaultState() {
  return {
    coins: ECON.startCoins,
    inv: {},            // itemId -> count of PLAIN copies
    foils: {},          // itemId -> count of FOIL copies (never sold in bulk)
    claimedSets: [],    // collection ids whose completion bonus was claimed
    lastDaily: null,    // 'YYYY-MM-DD' of last daily bonus
    streak: 0,
    totalPulls: 0,
    days: [],           // distinct days played
    arcade: { date: null, used: 0 },  // daily minigame plays
    stock: null,        // per-rotation capsule stock, keyed by floor slot:
                        // { period, left: {m0..m4,special}, tickets: {…} }
    fernDay: null,      // 'YYYY-MM-DD' the fern last paid out (once a day)
    shelves: null,      // medal pusher piles: { period, by: { slot: [[x,y]…] } }
    omikujiDay: null,   // 'YYYY-MM-DD' of the last fortune drawn (one a day)
    fortune: null,      // held fortune id, spent on the next capsule pull
    friends: [],        // [{ code, id, name }] — kept locally, not server-side
    wants: [],          // sticker ids you're hunting, shared with friends
    // stamp rally: `earned` is every stamp ever, `cards` is cards redeemed —
    // so overflow past a full card is never lost, it lands on the next one
    stamps: { earned: 0, cards: 0, pulls: 0, plays: 0, binderDay: null, binderDone: false },
    tutorialSeen: false,
    wantsTipSeen: false, // Poko explains the wants list once, at the binder
    trades: [],         // outgoing trade capsules: { code, itemId, at }
    redeemed: [],       // trade codes already opened on this device
    playerName: '',     // name printed on trade cards
    nameAsked: false,   // Poko asks once, at the Trading Post
    wall: [],           // placed stickers: { id, x, y, rot, s } (x/y normalized 0–1)
    wallBg: 'plum',     // sticker wall wallpaper id
  };
}

// ---- capsule stock (lazily refilled each half-day rotation) ----

// Stock is keyed by FLOOR SLOT, not by price tier — two machines on the
// floor can share a tier (there are five slots and three tiers), and if they
// shared a stock key they'd drain each other and their capsule sims would
// collide. `special` is the Saturday machine's own slot.
const STOCK_SLOTS = ['m0', 'm1', 'm2', 'm3', 'm4', 'special'];

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
    for (const t of STOCK_SLOTS) {
      state.stock.left[t] = ECON.machineStock;
      state.stock.tickets[t] = seedTicketPositions();
    }
    saveGame();
  }
  // older saves mid-rotation (pre-ticket or pre-special builds): fill gaps
  if (!state.stock.tickets) state.stock.tickets = {};
  let patched = false;
  for (const t of STOCK_SLOTS) {
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

function stockLeft(slot) { return machineStock().left[slot]; }

// 0-based index of the NEXT pull from this machine this rotation.
function pullsDone(slot) { return ECON.machineStock - machineStock().left[slot]; }

function nextPullIsTicket(slot) {
  return machineStock().tickets[slot].includes(pullsDone(slot));
}

// How many golden capsules are still in the dome (drives the visible pile).
// Pon machines store ticket *positions* (which pull number is golden); claw
// machines can't work that way because the player picks the capsule, so
// there the array is just a tally that shrinks when a gold one is grabbed.
function goldCapsulesLeft(slot, kind = 'pon') {
  const t = machineStock().tickets[slot];
  if (kind === 'claw') return t.length;
  const done = pullsDone(slot);
  return t.filter(i => i >= done).length;
}

// Player grabbed a golden capsule out of a claw machine.
function takeClawGold(slot) {
  const t = machineStock().tickets[slot];
  if (!t.length) return false;
  t.pop();
  saveGame();
  return true;
}

function useStock(slot) {
  const s = machineStock();
  if (s.left[slot] <= 0) return false;
  s.left[slot]--;
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
    if (!state.foils || typeof state.foils !== 'object') state.foils = {};   // pre-foil saves
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

// Five machines stand on the floor each rotation. The price spread is fixed
// at two cheap / two middling / one expensive so there is always something
// affordable, while the collections, the running order, and whether each is
// a Pon or a claw machine are all randomised.
const FLOOR_TIERS = ['low', 'low', 'mid', 'mid', 'high'];

// 5 of the collections are available each half-day —
// plus the Special Pon on Saturdays.
function getTodaysMachines() {
  const rng = mulberry32(hashString('gapon:' + currentPeriod()));
  const pool = COLLECTIONS.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  // shuffle the price spread so the expensive machine isn't always last
  const tiers = FLOOR_TIERS.slice();
  for (let i = tiers.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [tiers[i], tiers[j]] = [tiers[j], tiers[i]];
  }
  // Some machines are claw machines instead of Pon machines — seeded off the
  // period, so the mix is the same for everyone all rotation and changes at
  // restock. At least one Pon machine always stays.
  const kinds = tiers.map(() => rng() < 0.35 ? 'claw' : 'pon');
  // the fukubiki drum turns up on roughly half of rotations, in one slot
  if (rng() < 0.5) kinds[Math.floor(rng() * tiers.length)] = 'fuku';
  // Keep at least two plain Pon machines. A claw can eat a coin and give
  // nothing and the drum is expensive, so a floor without them leaves no
  // dependable way to just buy a capsule. Counts Pon directly so any future
  // machine kind is covered automatically.
  while (kinds.filter(k => k === 'pon').length < 2) {
    const i = Math.floor(rng() * tiers.length);
    if (kinds[i] !== 'pon') kinds[i] = 'pon';
  }
  const machines = tiers.map((tierId, i) => {
    const isFuku = kinds[i] === 'fuku';
    return {
      id: 'm' + i,               // floor slot — the key for stock and sims
      tierId: isFuku ? 'fuku' : tierId,
      tier: isFuku ? FUKU : TIERS[tierId],
      collection: pool[i],
      kind: kinds[i],
    };
  });
  if (isSpecialDay()) {
    machines.push({ id: 'special', tierId: 'special', tier: TIERS.special,
                    collection: SPECIAL_COLLECTION, kind: 'pon' });
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

// ---- omikuji ----

function omikujiAvailable() { return state.omikujiDay !== todayStr(); }

function heldFortune() {
  return state.fortune ? OMIKUJI.find(f => f.id === state.fortune) : null;
}

function drawOmikuji() {
  state.omikujiDay = todayStr();
  let r = Math.random();
  let drawn = OMIKUJI[OMIKUJI.length - 1];
  for (const f of OMIKUJI) {
    r -= f.p;
    if (r < 0) { drawn = f; break; }
  }
  state.fortune = drawn.mult > 1 ? drawn.id : null;   // a curse holds nothing
  saveGame();
  return drawn;
}

function clearFortune() {
  state.fortune = null;
  saveGame();
}

// Bend a machine's odds by the held fortune. Multiplying the good rarities
// (rather than converting common mass) keeps a fortune worth more on an
// expensive machine, which is the whole decision the item exists to create.
function luckyOdds(odds, mult) {
  if (!mult || mult <= 1) return odds;
  const out = {
    common: odds.common,
    uncommon: odds.uncommon,
    rare: odds.rare * (1 + (mult - 1) * 0.55),
    chase: odds.chase * mult,
  };
  // Pay for the boost out of common first, then uncommon. Without the second
  // step the Special Pon — which has no commons at all — got its gain eaten
  // by renormalising, ending up luckier on a Lucky Pon than on the best
  // machine in the shop.
  let extra = (out.rare - odds.rare) + (out.chase - odds.chase);
  const fromCommon = Math.min(odds.common, extra);
  out.common = odds.common - fromCommon;
  extra -= fromCommon;
  out.uncommon = Math.max(0, odds.uncommon - extra);
  const total = RARITY_ORDER.reduce((s, k) => s + out[k], 0);
  for (const k of RARITY_ORDER) out[k] /= total;   // keep it a distribution
  return out;
}

function rollItem(machine) {
  // a held fortune bends this one roll, then it's spent
  const f = heldFortune();
  const rarity = rollRarity(f ? luckyOdds(machine.tier.odds, f.mult) : machine.tier.odds);
  if (f) {
    clearFortune();
    if (typeof updateFortuneChip === 'function') updateFortuneChip();
  }
  const candidates = machine.collection.items.filter(it => it.rarity === rarity);
  return candidates[Math.floor(Math.random() * candidates.length)];
}

// Pity roll for a machine's LAST capsule: guaranteed to be a sticker you
// don't own from its collection (weighted by the tier's odds so commons
// stay likelier). Falls back to a normal roll if the set is complete.
function rollPityItem(machine) {
  const unowned = machine.collection.items.filter(it => !hasItem(it.id));
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

// Foils live in their own map rather than as a flag inside `inv`, which buys
// three things for free: old saves stay valid, `ownedCount` keeps meaning
// PLAIN copies (so the spares rule can never offer up someone's only foil),
// and anything that walks `state.inv` — the Swap Shop, dupe counting, bulk
// selling — cannot consume a foil by accident.
function ownedCount(itemId) { return state.inv[itemId] || 0; }
function foilCount(itemId) { return (state.foils && state.foils[itemId]) || 0; }

// "Is this pocket filled at all?" — the question almost everything actually
// wants to ask. Use this for set progress, pity rolls, NEW! badges and wants;
// use ownedCount only where PLAIN copies are specifically what's meant.
function hasItem(itemId) { return ownedCount(itemId) + foilCount(itemId) > 0; }

// `foil` left undefined means "this is a fresh sticker — roll for it". Every
// acquisition route already funnels through here, so a new machine gets foils
// for free and an existing one can't forget. Pass an explicit true/false only
// where foilness is already decided: a trade carries the sender's, and a
// take-back must return exactly what was sealed (rolling again would let you
// launder a plain copy into a foil by cancelling your own capsule).
// Returns true if the sticker landed foil.
function addItem(itemId, foil) {
  if (foil === undefined) foil = Math.random() < RARITIES[ITEMS_BY_ID[itemId].rarity].foil;
  const wasWanted = !hasItem(itemId) && (state.wants || []).includes(itemId);
  if (foil) state.foils[itemId] = foilCount(itemId) + 1;
  else state.inv[itemId] = ownedCount(itemId) + 1;
  // Getting something clears it off your wants list, freeing a slot. Doing it
  // here rather than at each machine means every route — pulls, claw, Corinth,
  // pusher, drum, swaps, trades — is covered without having to remember.
  if (wasWanted) {
    state.wants = state.wants.filter(id => id !== itemId);
    if (typeof netSyncWants === 'function') netSyncWants();
    if (typeof toast === 'function') {
      toast(`★ ${ITEMS_BY_ID[itemId].name} was on your wants list!`, 'good');
    }
  }
  return foil;
}

// Wants can go stale if a sticker arrives by a route that predates the list,
// or from another device. Cheap to re-check on load.
function pruneWants() {
  if (!state.wants || !state.wants.length) return false;
  const before = state.wants.length;
  state.wants = state.wants.filter(id => ITEMS_BY_ID[id] && !hasItem(id));
  if (state.wants.length === before) return false;
  saveGame();
  return true;
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

// ---- stamp rally card ----

function stampState() {
  if (!state.stamps) {
    state.stamps = { earned: 0, cards: 0, pulls: 0, plays: 0, binderDay: null, binderDone: false };
  }
  if (state.stamps.binderDone == null) state.stamps.binderDone = false;   // older saves
  return state.stamps;
}

// Stamps on the card in hand (can exceed cardSize — extras roll onto the next).
function cardStamps() {
  const s = stampState();
  return Math.max(0, s.earned - s.cards * STAMP.cardSize);
}

function stampCardFull() { return cardStamps() >= STAMP.cardSize; }

// Record progress on one track. A stamp lands only when all three are full.
// Counters stop at their target so nothing is silently wasted on the display.
function stampProgress(kind) {
  const s = stampState();
  if (kind === 'pull') {
    s.pulls = Math.min(STAMP.perPulls, s.pulls + 1);
  } else if (kind === 'play') {
    s.plays = Math.min(STAMP.perPlays, s.plays + 1);
  } else if (kind === 'binder') {
    // one credit per calendar day — this is what paces the card
    if (!s.binderDone && s.binderDay !== todayStr()) {
      s.binderDone = true;
      s.binderDay = todayStr();
    }
  }
  const earned = s.pulls >= STAMP.perPulls && s.plays >= STAMP.perPlays && s.binderDone;
  if (earned) {
    s.pulls = 0;
    s.plays = 0;
    s.binderDone = false;   // binderDay stays set, so the next credit is tomorrow
    s.earned++;
  }
  saveGame();
  return earned;
}

function redeemStampCard() {
  if (!stampCardFull()) return 0;
  stampState().cards++;
  state.coins += STAMP.reward;
  saveGame();
  return STAMP.reward;
}

// ---- dupe swap ----
// Same tier only, deliberately: chaining tiers (3 commons → 1 uncommon → …)
// would mean ~27 commons buys any chase in the game, which would gut the
// chase fantasy. You choose the collection, not the sticker, so the album
// keeps its mystery and you still get to aim at the set you're chasing.

// Spare copies of a rarity — the first of each sticker is never spendable.
function dupeCount(rarity) {
  return Object.keys(state.inv).reduce((n, id) =>
    ITEMS_BY_ID[id].rarity === rarity ? n + (state.inv[id] - 1) : n, 0);
}

// Collections still missing at least one sticker of this rarity.
function swapTargets(rarity) {
  return COLLECTIONS
    .map(col => ({ col, missing: col.items.filter(it => it.rarity === rarity && !hasItem(it.id)) }))
    .filter(x => x.missing.length);
}

function swapDupes(rarity, colId) {
  if (dupeCount(rarity) < ECON.swapCost) return null;
  const target = swapTargets(rarity).find(x => x.col.id === colId);
  if (!target) return null;
  // spend from the deepest stacks first, so collections keep their variety
  const stacks = Object.keys(state.inv)
    .filter(id => ITEMS_BY_ID[id].rarity === rarity && state.inv[id] > 1)
    .sort((a, b) => state.inv[b] - state.inv[a]);
  const spent = [];
  let need = ECON.swapCost;
  for (const id of stacks) {
    while (need > 0 && state.inv[id] > 1) { state.inv[id]--; need--; spent.push(id); }
    if (!need) break;
  }
  const got = target.missing[Math.floor(Math.random() * target.missing.length)];
  const foil = addItem(got.id);
  saveGame();
  return { got, spent, foil };
}

// ---- medal pusher shelves ----
// The shelf persists: its capsule layout is saved so the pile you leave is
// the pile you come back to. It reloads with the rotation, like every other
// machine's stock.

function pusherShelf(slot) {
  const period = currentPeriod();
  if (!state.shelves || state.shelves.period !== period) {
    state.shelves = { period, by: {} };
  }
  if (!state.shelves.by[slot]) {
    state.shelves.by[slot] = freshShelf(PUSHER.shelfCount).map(c => [c.x, c.y]);
    saveGame();
  }
  return state.shelves.by[slot].map(([x, y]) => ({ x, y, gold: false }));
}

function saveShelf(slot, caps) {
  state.shelves.by[slot] = caps.map(c => [Math.round(c.x * 10) / 10, Math.round(c.y * 10) / 10]);
  saveGame();
}

// ---- fukubiki ----

// Draw a marble. If you already own everything of that rarity, the drum is
// kind about it and bumps you to a rarity you can still use.
function drawMarble() {
  // a held fortune weights the good marbles — an omikuji should be felt at
  // every machine that decides a rarity, not just the ones rolling odds
  const f = heldFortune();
  const weights = FUKU.marbles.map(mb =>
    f && (mb.rarity === 'chase' || mb.rarity === 'rare') ? mb.p * f.mult : mb.p);
  const total = weights.reduce((s, w) => s + w, 0);
  if (f) {
    clearFortune();
    if (typeof updateFortuneChip === 'function') updateFortuneChip();
  }
  let r = Math.random() * total;
  let picked = FUKU.marbles[0];
  for (let i = 0; i < FUKU.marbles.length; i++) {
    r -= weights[i];
    if (r < 0) { picked = FUKU.marbles[i]; break; }
  }
  if (swapTargets(picked.rarity).length) return picked;
  const fallback = FUKU.marbles.find(mb => swapTargets(mb.rarity).length);
  return fallback ? Object.assign({}, fallback, { bumped: true }) : null;
}

// Hand over a missing sticker of that rarity from the chosen collection.
function claimFuku(rarity, colId) {
  const target = swapTargets(rarity).find(x => x.col.id === colId);
  if (!target) return null;
  const got = target.missing[Math.floor(Math.random() * target.missing.length)];
  const foil = addItem(got.id);
  saveGame();
  return { item: got, foil };
}

function collectionProgress(col) {
  return col.items.filter(it => hasItem(it.id)).length;
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
