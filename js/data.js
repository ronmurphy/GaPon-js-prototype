// GaPon — all game-design data lives here (ports to Godot as-is later).

// `foil` is the chance this sticker arrives shiny, rolled after rarity.
//
// It scales with rarity rather than being flat, and that was decided by
// simulation, not taste: a flat 3% left the average player with 0.4 foil
// chases after THREE MONTHS — the feature's best moment would essentially
// never fire — while 70% of the foils they did get were commons. Scaling
// triples foil chases to roughly one a season and halves the clutter.
const RARITIES = {
  common:   { label: 'Common',   sell: 2,  color: '#b0bec5', foil: 0.010 },
  uncommon: { label: 'Uncommon', sell: 6,  color: '#66bb6a', foil: 0.020 },
  rare:     { label: 'Rare',     sell: 15, color: '#42a5f5', foil: 0.050 },
  chase:    { label: 'Chase ★',  sell: 45, color: '#ffc107', foil: 0.100 },
};

const RARITY_ORDER = ['common', 'uncommon', 'rare', 'chase'];

// Nickname suggestions. A blank box asking for your name is work, and work at
// the exact moment someone is trying to do something else is what gets skipped
// — David played for weeks without realising the name was changeable. A filled
// box asks for approval instead, which is a much smaller thing to ask.
//
// Drawn from the game's own vocabulary so the suggestion reads as part of
// GaPon rather than a random username generator. Pairs are capped at 14 chars
// to match the input's maxlength.
//
// NOT unique, and deliberately not: identity is the friend code, and the
// server only ever answers "what name goes with this code?". Two Lucky Tanukis
// break nothing.
const NICK_ADJ = ['Lucky', 'Golden', 'Foil', 'Shiny', 'Sleepy', 'Speedy', 'Cosmic',
                  'Sunny', 'Mellow', 'Peppy', 'Tiny', 'Grand', 'Neon', 'Cosy',
                  'Sly', 'Merry', 'Bold', 'Swift'];
const NICK_NOUN = ['Tanuki', 'Capsule', 'Marble', 'Crank', 'Chaser', 'Sticker',
                   'Pon', 'Fox', 'Cat', 'Comet', 'Pebble', 'Drum', 'Token',
                   'Leaf', 'Star', 'Bloom', 'Cub', 'Moth'];

// Capsule SHAPE is the machine's price tag, readable before the coin slot is.
// People look at the capsules first and the cost second, if at all — so once
// these are learned, "that's a hex, so it's 25 to play" arrives without
// reading anything. It stacks with capsule SIZE, which already grades by tier
// (see ECON.stockBudget), so a Lucky Pon's three fat squares read as premium
// rather than as nearly-sold-out.
//
// Three shapes is the ceiling, not a choice: at r=9.5 in a stuffed Pebble Pon
// an octagon is indistinguishable from a circle. So this maps price BANDS,
// and Special Pon shares the square with Lucky — it's gold-accented, Saturday
// only, and three enormous capsules, so nothing is ambiguous.
const CAP_SHAPES = { low: 'round', mid: 'hex', high: 'square', special: 'square' };
const CAP_SHAPE_LIST = ['round', 'hex', 'square'];

function capShapeFor(tierId) {
  return CAP_SHAPES[tierId] || 'round';
}

const TIERS = {
  low:  { name: 'Pebble Pon', cost: 10, accent: '#26a69a',
          odds: { common: 0.70, uncommon: 0.24, rare: 0.05, chase: 0.01 } },
  mid:  { name: 'Prize Pon',  cost: 25, accent: '#ab47bc',
          odds: { common: 0.55, uncommon: 0.30, rare: 0.12, chase: 0.03 } },
  high: { name: 'Lucky Pon',  cost: 50, accent: '#ffb300',
          odds: { common: 0.40, uncommon: 0.32, rare: 0.20, chase: 0.08 } },
  // Saturday-only deluxe machine: pulls from EVERY collection, no commons.
  // Pricier per pull, but the best chase rate in the shop.
  special: { name: 'Special Pon', cost: 100, accent: '#ffc107',
             odds: { common: 0, uncommon: 0.55, rare: 0.33, chase: 0.12 } },
};

// Fukubiki (福引き) — the hand-cranked lottery drum from Japanese shopping
// streets. A coloured marble drops out and its colour decides the RARITY;
// you then choose which collection to fill from, and always get something
// you're missing. Guaranteed-new makes it the machine for finishing sets,
// so it's priced well above a normal pull and the good colours are rare.
const FUKU = {
  name: 'Fukubiki', cost: 60, accent: '#c62828',
  marbles: [
    { color: 'white', rarity: 'common',   hex: '#f5f2ea', p: 0.55, label: 'a common!' },
    { color: 'blue',  rarity: 'uncommon', hex: '#42a5f5', p: 0.28, label: 'an uncommon!' },
    { color: 'red',   rarity: 'rare',     hex: '#e53935', p: 0.14, label: 'a RARE!' },
    { color: 'gold',  rarity: 'chase',    hex: '#ffc107', p: 0.03, label: 'GOLD — a CHASE!' },
  ],
};

// コリントゲーム (Corinth game) — the peg-and-pocket bagatelle that was
// popular in 1920s–30s Japan and became the ancestor of pachinko. Michelle's
// design: three balls, you choose where each one drops, and the three slot
// values are SUMMED to decide the rarity.
//
// The slot values are INVERTED on purpose — high at the edges, low in the
// middle. A peg field scatters balls around the drop point, so with the big
// numbers in the centre (the Plinko convention) "always drop centre" would be
// strictly optimal and the choice would be fake. This way the good numbers
// sit exactly where the physics doesn't want to take you.
const CORINTH = {
  name: 'Corinth', cost: 25, accent: '#00897b', balls: 3,
  slots: [5, 4, 3, 2, 1, 2, 3, 4, 5],
  // Sum of three balls (3–15) → rarity, tuned against 3000 simulated games
  // per strategy. Safe centre play lands almost exactly on Prize Pon's odds
  // (its price peer): ~54% common, 37% uncommon, 7% rare, 1% chase. Skilled
  // edge play shifts that to ~30/51/17/2 — noticeably fewer junk pulls, but
  // no better at chases, so the board never obsoletes the shop floor.
  // A chase needs a perfect 15: all three balls in a 5-pocket.
  tiers: [
    { min: 15, rarity: 'chase' },
    { min: 13, rarity: 'rare' },
    { min: 10, rarity: 'uncommon' },
    { min: 0,  rarity: 'common' },
  ],
};

// メダルゲーム — the medal pusher, reworked to shove CAPSULES over the ledge
// instead of paying coins. Keeping every sink pointed at stickers means it
// can never become a coin faucet, and the loaded shelf doubles as the
// machine's stock display the same way the claw machine's dome does.
//
// The shelf persists between plays and between visits, so a run of stingy
// pushes leaves the next player (or the next you) a teetering pile.
// Geometry swept against simulation: a wide shelf lets the capsules sit in a
// single rank that crosses the lip all at once (85% of plays paid nothing,
// then the whole shelf dumped). Narrow and deep makes them stack in ragged
// ranks that shed a few at a time.
const PUSHER = {
  name: 'Medal Pusher', cost: 15, accent: '#5c6bc0',
  shelfW: 120,          // simulation space
  shelfD: 150,          // depth; the lip is at shelfD
  shelfCount: 14,       // capsules on a freshly loaded shelf
  ramStep: 8,           // how far one play shoves the pile forward
};                      // → ~68% of plays pay nothing, but a payout averages ~3
                        //   capsules at once; ~15 coins per capsule overall

// おみくじ — the paper fortune. Free once a calendar day from the box beside
// the counter; it holds until you spend it on your next capsule pull.
//
// The boost MULTIPLIES the rare and chase odds rather than converting common
// mass into them. That matters: an additive boost is worth most on the
// cheapest machine (it has the most common mass to convert), which would make
// "burn it on a 10-coin pull" strictly optimal and kill the decision.
// Multiplying instead makes a good fortune worth far more on a good machine —
// 大吉 on the Special Pon takes its chase odds from 12% to 30%.
const OMIKUJI = [
  { id: 'daikichi', kanji: '大吉', name: 'Great Blessing', mult: 2.5,  p: 0.12,
    line: 'Fortune smiles on you! Spend it somewhere worthy.' },
  { id: 'kichi',    kanji: '吉',   name: 'Blessing',       mult: 1.8,  p: 0.28,
    line: 'A good day for capsules.' },
  { id: 'shokichi', kanji: '小吉', name: 'Small Blessing', mult: 1.4,  p: 0.25,
    line: 'A little luck goes a little way.' },
  { id: 'suekichi', kanji: '末吉', name: 'Future Blessing', mult: 1.15, p: 0.25,
    line: 'Luck is on its way. Slowly.' },
  { id: 'kyo',      kanji: '凶',   name: 'Curse',          mult: 1,    p: 0.10,
    line: 'Ah… tie it to the rack and leave the bad luck behind.' },
];

// The Corinth board has no odds to multiply — its rarity comes from the ball
// total — so a fortune adds to that total instead. Deliberately small: the
// thresholds are only 3 apart, so +2 already turns a 15-only chase into a
// realistic one for a good player.
const OMIKUJI_BALL_BONUS = { daikichi: 2, kichi: 1, shokichi: 1, suekichi: 0, kyo: 0 };

// How many stickers you can flag as wanted. Short on purpose: a list of
// everything you're missing would be ~60 entries and a match would mean
// nothing. Ten means "these are the ones I actually care about".
const WANTS_MAX = 10;

const ECON = {
  startCoins: 100,
  dailyBase: 30,
  dailyStreakStep: 5,   // +5 per consecutive day...
  dailyStreakCap: 20,   // ...up to +20
  setBonus: 150,        // claim once per completed collection
  swapCost: 3,          // spare copies traded for one sticker of the same tier
                        // (foil odds live on RARITIES, keyed by rarity)
  // Capsules per machine per rotation — the dome empties as you pull, and a
  // drained machine sells out until the next restock.
  //
  // NOT a flat count: every machine holds the same COINS' worth of capsules,
  // so the LAST capsule — the pity sticker, guaranteed to be one you're
  // missing — costs the same wherever you buy it. See stockFor() in game.js.
  //
  // This is the rule real arcades run on: the 50p machine is stuffed, and the
  // one with three prizes in it is the one you can't win. Stock size IS the
  // price of the guarantee. With a flat 10 everywhere, emptying a Pebble Pon
  // bought a guaranteed missing sticker for 100 coins against Lucky Pon's 500,
  // making a whole set 4.3x cheaper to finish on the cheapest machine — the
  // fifth time flat per-pull rewards had handed the game to the 10-coin
  // machine, and by far the largest.
  stockBudget: 250,     // → Pebble 25, Prize 10, Lucky 5
  stockSpecial: 3,      // Saturday machine, pinned. At 1 EVERY pull would be
                        // the pity capsule and its odds table (no commons,
                        // best chase rate in the shop) would never once apply
                        // — it would stop being a gachapon and start being a
                        // vending machine, and the cheapest guarantee in the
                        // game at that.
  stockFuku: 10,        // the drum is guaranteed-new by design and already
                        // priced for it; normalising it would charge twice
};

// Cosmetics — Poko's prize counter.
//
// The problem these solve: all four coin sinks are machine pulls, so a player
// who owns a set stops having anywhere to spend. This is the sink that isn't
// a pull, and it is deliberately DEAD-END money — cosmetics only, never buffs.
// A buff sink doesn't absorb surplus, it launders it: coins become better odds
// become more stickers, and you're back where you started.
//
// SLOTS, not a flat list. Two wallpapers can't both be on, so each slot holds
// exactly one choice and slots never touch each other's CSS tokens (see
// css/objects.css). That's what lets "the list is the on/off" work with no
// hidden precedence: what's ticked is what you see.
//
// The themes are in here at price 0, owned by everyone from the first launch.
// Three reasons: the counter is never an empty shop full of locked things, the
// toggle teaches itself on something the player already has, and it advertises
// the whole category to people who'd otherwise never find it. They were free
// in the gear menu and stay free — charging for something players already had
// is a takeaway, and the JP theme isn't only paint anyway: it swaps machine
// names into Japanese (see corinth.js, pusher.js), and language shouldn't sit
// behind a price.
//
// NOTHING here may repaint a surface that carries information. Capsule shape
// is the price band and gold is a golden ticket; both were just taught, and a
// cosmetic that overrides them would be selling the player confusion.
const COSMETICS = {
  slots: [
    { id: 'theme',    name: 'Look',          note: 'the whole building' },
    { id: 'look',     name: 'Sets',          note: 'fills every slot at once' },
    { id: 'walls',    name: 'Wall colour',   note: 'every room' },
    { id: 'wallpat',  name: 'Wall surface',  note: 'paper, panels, brick' },
    { id: 'floor',    name: 'Floor colour',  note: 'every room' },
    { id: 'floorpat', name: 'Floor surface', note: 'replaces the carpet' },
    { id: 'sign',     name: 'Signage',       note: 'the lit signs' },
  ],
  // Colour and surface are separate slots because they are separate promises.
  // A palette recolours what the room already has — in the arcade that means
  // oak-toned CARPET, which is fine as a colour and was a lie when the item
  // was called "Oak Boards". A surface is what actually replaces the carpet,
  // and it costs about twice as much because it changes about twice as much.
  //
  // `swatch` is [top, bottom] for the preview chip. `price: 0` means owned
  // from the start: the two themes, plus one palette per slot lifted straight
  // out of each theme. Those cost nothing to give away, roughly triple what a
  // new player can play with on day one, and teach the slots better than any
  // label — mixing the game center's pale walls with the American arcade's
  // carpet is an obviously deliberate act.
  items: [
    { id: 'us',        slot: 'theme', name: 'American Arcade',
      blurb: 'Dark room, neon carpet.',        price: 0, swatch: ['#46335f', '#634c41'] },
    { id: 'jp',        slot: 'theme', name: 'Game Center',
      blurb: 'Bright halls, shoji panelling.', price: 0, swatch: ['#e8eef7', '#7a5c46'] },

    { id: 'w-plum',    slot: 'walls', name: 'Arcade Plum',
      blurb: 'The shop as it always was.',     price: 0,   swatch: ['#46335f', '#3d2c55'] },
    { id: 'w-pale',    slot: 'walls', name: 'Hall Pale',
      blurb: 'Fluorescent, from the ゲーセン.',  price: 0,   swatch: ['#e8eef7', '#dbe4f2'] },
    { id: 'w-lantern', slot: 'walls', name: 'Lantern Red',
      blurb: 'Borrowed from the parlour.',     price: 0,   swatch: ['#b3202b', '#8e1a23'] },
    { id: 'w-sakura',  slot: 'walls', name: 'Sakura Plaster',
      blurb: 'Dusty pink, like late blossom.', price: 250, swatch: ['#6e4257', '#5c374a'] },
    { id: 'w-mint',    slot: 'walls', name: 'Mint Parlour',
      blurb: 'Cool green, very 1950s.',        price: 250, swatch: ['#2f5a52', '#274b45'] },
    { id: 'w-ink',     slot: 'walls', name: 'Ink Blue',
      blurb: 'Deep and quiet.',                price: 250, swatch: ['#24365c', '#1e2d4d'] },

    { id: 'f-timber',  slot: 'floor', name: 'Shop Timber',
      blurb: 'The floorboards you know.',      price: 0,   swatch: ['#634c41', '#4c3a33'] },
    { id: 'f-midnight',slot: 'floor', name: 'Midnight',
      blurb: 'The arcade\'s near-black.',       price: 0,   swatch: ['#0d0a1e', '#131026'] },
    { id: 'f-stage',   slot: 'floor', name: 'Stage Maroon',
      blurb: 'Straight off the parlour floor.', price: 0,  swatch: ['#1f0a17', '#2a1220'] },
    { id: 'f-oak',     slot: 'floor', name: 'Oak',
      blurb: 'Warm, well-walked timber.',      price: 200, swatch: ['#8a6440', '#6b4d31'] },
    { id: 'f-tatami',  slot: 'floor', name: 'Tatami',
      blurb: 'Woven rush, soft underfoot.',    price: 200, swatch: ['#9a9459', '#7d7847'] },
    { id: 'f-slate',   slot: 'floor', name: 'Slate',
      blurb: 'Scuffed grey, honest.',          price: 200, swatch: ['#4a4a52', '#35353c'] },

    { id: 'p-neon',    slot: 'floorpat', name: 'Neon Carpet',
      blurb: 'Arcade flecks, in every room.',  price: 0,   swatch: ['#00e5ff', '#ff4081'] },
    { id: 'p-boards',  slot: 'floorpat', name: 'Plank Boards',
      blurb: 'Real timber seams. No carpet.',  price: 400, swatch: ['#7a5c46', '#5d4636'] },
    { id: 'p-tile',    slot: 'floorpat', name: 'Tile Grid',
      blurb: 'Square tiles, scrubbed clean.',  price: 400, swatch: ['#9aa0ad', '#6d7280'] },
    { id: 'p-polish',  slot: 'floorpat', name: 'Polished',
      blurb: 'No texture at all — just shine.', price: 300, swatch: ['#d8d4e6', '#a49dbd'] },

    { id: 'q-stripe',  slot: 'wallpat', name: 'Papered',
      blurb: 'The shop\'s own quiet stripe.',   price: 0,   swatch: ['#5b4a75', '#4a3c60'] },
    { id: 'q-shoji',   slot: 'wallpat', name: 'Shoji Lattice',
      blurb: 'Paper screens, from the ゲーセン.', price: 0,  swatch: ['#8d7f9c', '#6f6480'] },
    { id: 'q-curtain', slot: 'wallpat', name: 'Stage Curtain',
      blurb: 'Heavy velvet folds.',             price: 0,   swatch: ['#3a2436', '#2a1a28'] },
    { id: 'q-panel',   slot: 'wallpat', name: 'Wood Panelling',
      blurb: 'Tongue and groove, waist high.',  price: 350, swatch: ['#6b533f', '#4f3d2f'] },
    { id: 'q-brick',   slot: 'wallpat', name: 'Painted Brick',
      blurb: 'Courses under thick paint.',      price: 350, swatch: ['#6d5a5a', '#514343'] },

    // The cheap rung of the ladder. A sign is a small change and should cost
    // like one — without something at this price the counter is only ever
    // rewarding after a long save-up, and a normal evening's play buys nothing.
    { id: 's-neon',    slot: 'sign', name: 'Neon Pink',
      blurb: 'The arcade\'s own tubes.',        price: 0,   swatch: ['#ff5c94', '#ff4081'] },
    { id: 's-ice',     slot: 'sign', name: 'Ice Blue',
      blurb: 'Cool, from the game center.',     price: 0,   swatch: ['#7ce0ff', '#40c4ff'] },
    { id: 's-gold',    slot: 'sign', name: 'Marquee Gold',
      blurb: 'The parlour\'s warm bulbs.',      price: 0,   swatch: ['#ffd54f', '#ffc107'] },
    { id: 's-lime',    slot: 'sign', name: 'Lime',
      blurb: 'Loud, and it knows it.',          price: 150, swatch: ['#b2ff59', '#76ff03'] },
    { id: 's-ember',   slot: 'sign', name: 'Ember',
      blurb: 'Warm orange, late evening.',      price: 150, swatch: ['#ffab6b', '#ff7043'] },

    // ---- sets ----
    // A set is a preset, not a garment: buying one fills your slots with its
    // parts and hands you the parts outright. There is deliberately no
    // "equipped set", because the moment you changed its floor the shelf would
    // have to claim you were wearing something you no longer were.
    //
    // A third THEME was the other way to do this, and it was the wrong one:
    // the two themes carry language (メダル, コリントゲーム, the ゲームセンター
    // sign), which is what makes them themes rather than paint. A third would
    // either invent a language or duplicate the American one — at which point
    // it is exactly this, for far more work.
    //
    // Parts are `bundled`: price 0 because they have no individual price, and
    // never free — cosOwned refuses the price-0 shortcut for them.
    { id: 'lk-showa', slot: 'look', name: 'Showa Yokochō', price: 450,
      blurb: 'A back-alley shopping street after dark.', swatch: ['#5a2a2e', '#4a3527'],
      sets: { walls: 'lk-showa-w', wallpat: 'lk-showa-q',
              floor: 'lk-showa-f', floorpat: 'lk-showa-p', sign: 's-gold' } },
    { id: 'lk-pier',  slot: 'look', name: 'Seaside Amusements', price: 450,
      blurb: 'A pier arcade, salt-bleached and cheerful.', swatch: ['#7fa8a0', '#8f8474'],
      sets: { walls: 'lk-pier-w', wallpat: 'lk-pier-q',
              floor: 'lk-pier-f', floorpat: 'lk-pier-p', sign: 's-ice' } },
    { id: 'lk-snow',  slot: 'look', name: 'Winter Fair', price: 450,
      blurb: 'Frost, pale timber and cold light.', swatch: ['#44607e', '#9aa7b5'],
      sets: { walls: 'lk-snow-w', wallpat: 'lk-snow-q',
              floor: 'lk-snow-f', floorpat: 'lk-snow-p', sign: 's-ice' } },

    { id: 'lk-showa-w', slot: 'walls',    name: 'Lantern Walls',  bundled: true, price: 0,
      blurb: 'From Showa Yokochō.',   swatch: ['#5a2a2e', '#4a2226'] },
    { id: 'lk-showa-q', slot: 'wallpat',  name: 'Timber Battens', bundled: true, price: 0,
      blurb: 'From Showa Yokochō.',   swatch: ['#4a2226', '#38191c'] },
    { id: 'lk-showa-f', slot: 'floor',    name: 'Alley Umber',    bundled: true, price: 0,
      blurb: 'From Showa Yokochō.',   swatch: ['#4a3527', '#382818'] },
    { id: 'lk-showa-p', slot: 'floorpat', name: 'Worn Planks',    bundled: true, price: 0,
      blurb: 'From Showa Yokochō.',   swatch: ['#5c452f', '#3d2c1d'] },

    { id: 'lk-pier-w',  slot: 'walls',    name: 'Bleached Mint',  bundled: true, price: 0,
      blurb: 'From Seaside Amusements.', swatch: ['#7fa8a0', '#6d938c'] },
    { id: 'lk-pier-q',  slot: 'wallpat',  name: 'Beach Hut',      bundled: true, price: 0,
      blurb: 'From Seaside Amusements.', swatch: ['#6d938c', '#557a73'] },
    { id: 'lk-pier-f',  slot: 'floor',    name: 'Driftwood',      bundled: true, price: 0,
      blurb: 'From Seaside Amusements.', swatch: ['#8f8474', '#6f6659'] },
    { id: 'lk-pier-p',  slot: 'floorpat', name: 'Board Gaps',     bundled: true, price: 0,
      blurb: 'From Seaside Amusements.', swatch: ['#7d735f', '#5b5344'] },

    { id: 'lk-snow-w',  slot: 'walls',    name: 'Frost Blue',     bundled: true, price: 0,
      blurb: 'From Winter Fair.',     swatch: ['#44607e', '#3a5169'] },
    { id: 'lk-snow-q',  slot: 'wallpat',  name: 'Snow Drift',     bundled: true, price: 0,
      blurb: 'From Winter Fair.',     swatch: ['#5b7896', '#43607c'] },
    { id: 'lk-snow-f',  slot: 'floor',    name: 'Pale Timber',    bundled: true, price: 0,
      blurb: 'From Winter Fair.',     swatch: ['#9aa7b5', '#7c8794'] },
    { id: 'lk-snow-p',  slot: 'floorpat', name: 'Swept Ice',      bundled: true, price: 0,
      blurb: 'From Winter Fair.',     swatch: ['#c3ced9', '#93a0ad'] },

    // Autumn is a SEASON, not a day: it has to look right in mid-September as
    // well as on the 31st, so it is warm and harvest-toned rather than spooky.
    // Halloween borrows these four surfaces and adds its own signage, which is
    // what lets one set's worth of design cover both.
    { id: 'lk-fall',  slot: 'look', name: 'Autumn Market', price: 450,
      blurb: 'Lantern light, dry leaves, late harvest.', swatch: ['#6b4a33', '#7a5b3a'],
      sets: { walls: 'lk-fall-w', wallpat: 'lk-fall-q',
              floor: 'lk-fall-f', floorpat: 'lk-fall-p', sign: 'lk-fall-s' } },

    { id: 'lk-fall-w', slot: 'walls',    name: 'Harvest Amber', bundled: true, price: 0,
      blurb: 'From Autumn Market.',   swatch: ['#6b4a33', '#593d2a'] },
    { id: 'lk-fall-q', slot: 'wallpat',  name: 'Market Boards', bundled: true, price: 0,
      blurb: 'From Autumn Market.',   swatch: ['#593d2a', '#41291b'] },
    { id: 'lk-fall-f', slot: 'floor',    name: 'Dry Leaf',      bundled: true, price: 0,
      blurb: 'From Autumn Market.',   swatch: ['#7a5b3a', '#5e4529'] },
    { id: 'lk-fall-p', slot: 'floorpat', name: 'Scattered Leaves', bundled: true, price: 0,
      blurb: 'From Autumn Market.',   swatch: ['#8a6a44', '#63492c'] },
    { id: 'lk-fall-s', slot: 'sign',     name: 'Lantern Amber', bundled: true, price: 0,
      blurb: 'From Autumn Market.',   swatch: ['#f5a623', '#e8890b'] },

    // Halloween started out borrowing autumn's surfaces and bringing only its
    // signage. That was cheap, but the shop floor has no lit sign — so on the
    // busiest screen in the game, Halloween was autumn with a lantern. It has
    // its own look now, which also resolves a tension in sharing: autumn must
    // hold up for ten weeks and wants to be tasteful; Halloween has two nights
    // and can afford to be loud.
    { id: 'lk-hw',  slot: 'look', name: 'Haunted Arcade', price: 450,
      blurb: 'Cobwebs, dark carpet, pumpkins underfoot.', swatch: ['#2e1f3d', '#1d1526'],
      sets: { walls: 'hw-w', wallpat: 'hw-q',
              floor: 'hw-f', floorpat: 'hw-p', sign: 'hw-sign' } },

    { id: 'hw-w',    slot: 'walls',    name: 'Midnight Plum', bundled: true, price: 0,
      blurb: 'From Haunted Arcade.',  swatch: ['#2e1f3d', '#241830'] },
    { id: 'hw-q',    slot: 'wallpat',  name: 'Cobwebs',       bundled: true, price: 0,
      blurb: 'From Haunted Arcade.',  swatch: ['#3b2a4d', '#2a1c39'] },
    { id: 'hw-f',    slot: 'floor',    name: 'Dark Carpet',   bundled: true, price: 0,
      blurb: 'From Haunted Arcade.',  swatch: ['#1d1526', '#261c31'] },
    { id: 'hw-p',    slot: 'floorpat', name: 'Pumpkin Patch', bundled: true, price: 0,
      blurb: 'From Haunted Arcade.',  swatch: ['#ff8c1a', '#ff7014'] },
    { id: 'hw-sign', slot: 'sign',     name: 'Pumpkin Neon',  bundled: true, price: 0,
      blurb: 'From Haunted Arcade.',  swatch: ['#ff8c1a', '#8e44ad'] },
  ],
};

// ---- the calendar ----
//
// Two kinds of thing, and the difference decides who gets asked.
//
// A SEASON dresses the shop itself: props, scenery, the things nobody bought.
// The fern becomes a pumpkin in autumn the same way the window goes dark at
// night — it is the building, not the player's belongings, so it needs no
// permission and writes nothing to the save.
//
// A HOLIDAY additionally lends the player a LOOK for a day or two. That IS
// their belongings, so Poko asks, and a no is respected for that holiday. It is
// never written to state.cos.on either: the preview is painted over the top, so
// November 1st needs no revert and nobody who paid 450 for Showa Yokochō
// watches their room turn orange and then turn back into something they did not
// choose.
//
// Dates are [month, day] inclusive, 1-based months. A range that wraps the new
// year (Dec 20 – Jan 6) is handled by dateInRange.
const SEASONS = [
  {
    id: 'fall', name: 'Autumn', from: [9, 22], to: [11, 30],
    // Only the shop's own scenery. Nothing here touches what the player wears.
    props: { fern: 'pumpkin.png' },
  },
];

const HOLIDAYS = [
  {
    // The 30th is included on purpose: shops dress up a few days early, and one
    // night is a very small window to be seen at all.
    id: 'halloween', name: 'Halloween', from: [10, 30], to: [10, 31],
    props: { fern: 'jackolantern.png' },
    // Autumn's own surfaces plus one unmistakable accent. A holiday has to read
    // as ITSELF for the loan to sell anything afterwards — a slightly warmer
    // room on the 31st makes nobody want to buy an autumn set. The cheapest way
    // to get there is the signage, which is why it is the only part that isn't
    // shared with the set on sale.
    // Exactly the Haunted Arcade set's parts — see the test that pins this.
    // The moment the loan and the set drift apart, Poko's follow-up ("that look
    // is my X set") quietly becomes a lie, and nothing else would notice.
    look: {
      walls: 'hw-w', wallpat: 'hw-q',
      floor: 'hw-f', floorpat: 'hw-p', sign: 'hw-sign',
    },
    ask: 'It\'s Halloween! Want me to dress the place up for the night?',
    // What Poko says afterwards, once the loan is over. Selling the costume
    // itself beats pointing at a neighbouring set: they have just spent two
    // nights in this exact room, so "you can keep it" is the honest pitch.
    sell: 'lk-hw',
  },
];

const COS_BY_ID = Object.fromEntries(COSMETICS.items.map(i => [i.id, i]));

// Stamp rally card. A stamp needs ALL THREE tracks filled, not any one of
// them — otherwise stamps-per-pull don't scale with pull cost and the card
// quietly pays 5× better for spamming the cheap machine. The counters never
// reset daily (so a Lucky Pon player loses nothing by pulling once a day),
// but the album visit credits only once per calendar day, which paces the
// card to about a stamp a day — a five-day "school week" rally.
const STAMP = {
  perPulls: 3,      // capsule pulls needed, any machine
  perPlays: 3,      // arcade games needed
  cardSize: 5,      // stamps to fill a card
  reward: 75,       // coins on redeem
  // ...plus arcade tokens. Michelle and Chris wanted a reason to go back to the
  // arcade; this is the version that works, because it closes a loop rather
  // than bolting on an incentive: a card needs arcade plays to fill, so it pays
  // out in arcade plays. A card takes about five days, so this is ~0.4 tokens a
  // day against a baseline of six — special without moving the economy.
  //
  // Earlier ideas were rejected for good reasons, recorded so they are not
  // re-tried: paying golden tickets in tokens FLATTENS the tiers (a ticket is
  // 2x machine cost, so 100 coins on a Lucky Pon against ~16 for two tokens),
  // and paying dupe sales in tokens makes the game's recovery mechanism
  // skill-gated — punishing exactly the players who need it most.
  rewardTokens: 2,
  tokenBank: 6,     // capped so nobody hoards a month of them and then farms
};

// Arcade: capped plays per half-day rotation so minigames stay a snack,
// not the meal. Every game tops out at 15 coins, so max arcade income
// (3 × 15 = 45 per rotation) stays in the same league as the login bonus
// and capsule pulls remain the scarce, exciting spend.
const ARCADE = {
  playsPerRotation: 3,
  timing: { gold: 15, silver: 10, bronze: 5, miss: 2 },
  match:  { perfect: 15, missPenalty: 3, floor: 5 },
  chase:  { seconds: 10, goldTaps: 10, silverTaps: 7, bronzeTaps: 4,
            gold: 15, silver: 10, bronze: 5, miss: 2 },
  shell:  { swaps: 6, win: 12, wrong: 3 },
  echo:   { rounds: [5, 10, 15], flub: 2 },  // payout per round survived
  pong:   { winScore: 3, win: 12, sweep: 15, lose: 3 },
  // Claw: bigger prizes pay more but the grip is weaker — the authentic
  // UFO-catcher tradeoff. Expected value of going for the big plush is
  // roughly the same as the safe small one, so it's a nerve game, not a
  // math one.
  claw:   { big: 15, med: 10, small: 5, miss: 2,
            grip: { big: 0.45, med: 0.65, small: 0.85 } },
};

// Each collection: 6 common, 3 uncommon, 2 rare, 1 chase.
// icon = Material Symbols ligature name.
const COLLECTIONS = [
  {
    id: 'space', name: 'Cosmo Club', color: '#7e57c2', artDir: 'CosmoClubPngs',
    items: [
      { id: 'sp_star',    name: 'Twinkle',        icon: 'star',          rarity: 'common' },
      { id: 'sp_sun',     name: 'Sunny Boi',      icon: 'sunny',         rarity: 'common' },
      { id: 'sp_moon',    name: 'Moon Nap',       icon: 'dark_mode',     rarity: 'common' },
      { id: 'sp_planet',  name: 'Home World',     icon: 'public',        rarity: 'common' },
      { id: 'sp_flare',   name: 'Solar Flare',    icon: 'flare',         rarity: 'common' },
      { id: 'sp_night',   name: 'Night Cap',      icon: 'nightlight',    rarity: 'common' },
      { id: 'sp_rocket',  name: "Li'l Rocket",    icon: 'rocket',        rarity: 'uncommon' },
      { id: 'sp_sat',     name: 'Beep Beep Sat',  icon: 'satellite_alt', rarity: 'uncommon' },
      { id: 'sp_spark',   name: 'Stardust',       icon: 'auto_awesome',  rarity: 'uncommon' },
      { id: 'sp_launch',  name: 'Launch Day!',    icon: 'rocket_launch', rarity: 'rare' },
      { id: 'sp_robo',    name: 'Robo-Buddy',     icon: 'smart_toy',     rarity: 'rare' },
      { id: 'sp_nova',    name: 'SUPERSTAR NOVA', icon: 'stars',         rarity: 'chase' },
    ],
  },
  {
    id: 'critters', name: 'Critter Pals', color: '#66bb6a', artDir: 'CritterPalsPngs',
    items: [
      { id: 'cr_paw',     name: 'Paw Print',      icon: 'pets',                icon_note: '', rarity: 'common' },
      { id: 'cr_egg',     name: 'Mystery Egg',    icon: 'egg',                 rarity: 'common' },
      { id: 'cr_bee',     name: 'Buzzy',          icon: 'emoji_nature',        rarity: 'common' },
      { id: 'cr_leaf',    name: 'Nibble Leaf',    icon: 'spa',                 rarity: 'common' },
      { id: 'cr_hive',    name: 'Honeycomb Home', icon: 'hive',                rarity: 'common' },
      { id: 'cr_bug',     name: 'Beetle Bro',     icon: 'bug_report',          rarity: 'common' },
      { id: 'cr_bun',     name: 'Bun Bun',        icon: 'cruelty_free',        rarity: 'uncommon' },
      { id: 'cr_fish',    name: "Gone Fishin'",   icon: 'phishing',            rarity: 'uncommon' },
      { id: 'cr_mouse',   name: 'Squeakers',      icon: 'pest_control_rodent', rarity: 'uncommon' },
      { id: 'cr_raven',   name: 'Sir Caw',        icon: 'raven',               rarity: 'rare' },
      { id: 'cr_hunt',    name: 'Bug Hunter',     icon: 'pest_control',        rarity: 'rare' },
      { id: 'cr_dashy',   name: 'DASHY',          icon: 'flutter_dash',        rarity: 'chase' },
    ],
  },
  {
    id: 'snacks', name: 'Snack Attack', color: '#ff8a65', artDir: 'SnackAttackPngs',
    items: [
      { id: 'sn_cookie',  name: 'Choco Chip',     icon: 'cookie',              rarity: 'common' },
      { id: 'sn_ice',     name: 'Drippy Cone',    icon: 'icecream',            rarity: 'common' },
      { id: 'sn_coffee',  name: 'Bean Juice',     icon: 'local_cafe',          rarity: 'common' },
      { id: 'sn_tea',     name: 'Cozy Tea',       icon: 'emoji_food_beverage', rarity: 'common' },
      { id: 'sn_egg',     name: 'Sunny Egg',      icon: 'egg_alt',             rarity: 'common' },
      { id: 'sn_crois',   name: 'Croissant Pal',  icon: 'bakery_dining',       rarity: 'common' },
      { id: 'sn_cake',    name: 'B-Day Cake',     icon: 'cake',                rarity: 'uncommon' },
      { id: 'sn_donut',   name: 'Donut Worry',    icon: 'donut_large',         rarity: 'uncommon' },
      { id: 'sn_ramen',   name: 'Midnight Ramen', icon: 'ramen_dining',        rarity: 'uncommon' },
      { id: 'sn_pizza',   name: 'Last Slice',     icon: 'local_pizza',         rarity: 'rare' },
      { id: 'sn_tapas',   name: 'Fancy Tapas',    icon: 'tapas',               rarity: 'rare' },
      { id: 'sn_party',   name: 'PARTY PARFAIT',  icon: 'celebration',         rarity: 'chase' },
    ],
  },
  {
    id: 'music', name: 'Beat Box', color: '#42a5f5', artDir: 'BeatBoxPngs',
    items: [
      { id: 'mu_note',    name: 'One Note',       icon: 'music_note',    rarity: 'common' },
      { id: 'mu_phones',  name: 'Lo-Fi Phones',   icon: 'headphones',    rarity: 'common' },
      { id: 'mu_radio',   name: 'Retro Radio',    icon: 'radio',         rarity: 'common' },
      { id: 'mu_speaker', name: 'Boom Box',       icon: 'speaker',       rarity: 'common' },
      { id: 'mu_vol',     name: 'Crank It',       icon: 'volume_up',     rarity: 'common' },
      { id: 'mu_album',   name: 'Vinyl Drop',     icon: 'album',         rarity: 'common' },
      { id: 'mu_queue',   name: 'The Playlist',   icon: 'queue_music',   rarity: 'uncommon' },
      { id: 'mu_eq',      name: 'Wavy Levels',    icon: 'graphic_eq',    rarity: 'uncommon' },
      { id: 'mu_mic',     name: 'Open Mic',       icon: 'mic',           rarity: 'uncommon' },
      { id: 'mu_lib',     name: 'Crate Digger',   icon: 'library_music', rarity: 'rare' },
      { id: 'mu_mega',    name: 'Hype Horn',      icon: 'campaign',      rarity: 'rare' },
      { id: 'mu_piano',   name: 'GRAND PIANO',    icon: 'piano',         rarity: 'chase' },
    ],
  },
  {
    id: 'ocean', name: 'Tide Pool', color: '#1e88e5', artDir: 'TidePoolPngs',
    items: [
      { id: 'oc_wave',    name: 'Lil Waves',      icon: 'waves',            rarity: 'common' },
      { id: 'oc_drip',    name: 'Bubbly',         icon: 'bubble_chart',     rarity: 'common' },
      { id: 'oc_anchor',  name: "Ol' Anchor",     icon: 'anchor',           rarity: 'common' },
      { id: 'oc_pool',    name: 'Floatie Time',   icon: 'pool',             rarity: 'common' },
      { id: 'oc_brella',  name: 'Shade Day',      icon: 'beach_access',     rarity: 'common' },
      { id: 'oc_sail',    name: 'Day Sail',       icon: 'sailing',          rarity: 'common' },
      { id: 'oc_surf',    name: 'Wave Rider',     icon: 'surfing',          rarity: 'uncommon' },
      { id: 'oc_scuba',   name: 'Deep Diver',     icon: 'scuba_diving',     rarity: 'uncommon' },
      { id: 'oc_kayak',   name: 'Paddle Pal',     icon: 'kayaking',         rarity: 'uncommon' },
      { id: 'oc_boat',    name: 'Captain Toot',   icon: 'directions_boat',  rarity: 'rare' },
      { id: 'oc_house',   name: 'Lake House',     icon: 'houseboat',        rarity: 'rare' },
      { id: 'oc_tsunami', name: 'THE BIG ONE',    icon: 'tsunami',          rarity: 'chase' },
    ],
  },
  {
    id: 'garden', name: 'Bloom Crew', color: '#ec407a', artDir: 'BloomCrewPngs',
    items: [
      { id: 'gd_bloom',   name: 'Lil Bloom',      icon: 'local_florist',    rarity: 'common' },
      { id: 'gd_grass',   name: 'Touch Grass',    icon: 'grass',            rarity: 'common' },
      { id: 'gd_sprout',  name: 'Sproutling',     icon: 'eco',              rarity: 'common' },
      { id: 'gd_yard',    name: 'Backyard Boss',  icon: 'yard',             rarity: 'common' },
      { id: 'gd_compost', name: 'Compost Cutie',  icon: 'compost',          rarity: 'common' },
      { id: 'gd_pot',     name: 'Pot Pal',        icon: 'potted_plant',     rarity: 'common' },
      { id: 'gd_park',    name: 'Picnic Spot',    icon: 'park',             rarity: 'uncommon' },
      { id: 'gd_hug',     name: 'Tree Hugger',    icon: 'nature_people',    rarity: 'uncommon' },
      { id: 'gd_farm',    name: 'Farm Hand',      icon: 'agriculture',      rarity: 'uncommon' },
      { id: 'gd_forest',  name: 'Deep Woods',     icon: 'forest',           rarity: 'rare' },
      { id: 'gd_tree',    name: 'Elder Oak',      icon: 'nature',           rarity: 'rare' },
      { id: 'gd_rose',    name: 'GOLDEN BLOOM',   icon: 'filter_vintage',   rarity: 'chase' },
    ],
  },
  {
    id: 'retro', name: 'Pixel Party', color: '#9ccc65', artDir: 'PixelPartyPngs',
    items: [
      { id: 'px_cart',    name: 'Dusty Cart',     icon: 'videogame_asset',  rarity: 'common' },
      { id: 'px_stick',   name: 'Joy Stick',      icon: 'joystick',         rarity: 'common' },
      { id: 'px_keys',    name: 'Clacky',         icon: 'keyboard',         rarity: 'common' },
      { id: 'px_mouse',   name: 'Click Click',    icon: 'mouse',            rarity: 'common' },
      { id: 'px_save',    name: 'Lil Floppy',     icon: 'save',             rarity: 'common' },
      { id: 'px_chip',    name: 'Chippy',         icon: 'sim_card',         rarity: 'common' },
      { id: 'px_ram',     name: 'Mega Brain',     icon: 'memory',           rarity: 'uncommon' },
      { id: 'px_cable',   name: 'Spaghetti',      icon: 'cable',            rarity: 'uncommon' },
      { id: 'px_pad',     name: 'Pad Bro',        icon: 'gamepad',          rarity: 'uncommon' },
      { id: 'px_board',   name: 'Mother Board',   icon: 'developer_board',  rarity: 'rare' },
      { id: 'px_term',    name: 'Green Screen',   icon: 'terminal',         rarity: 'rare' },
      { id: 'px_token',   name: 'GOLDEN TOKEN',   icon: 'token',            rarity: 'chase' },
    ],
  },
  {
    id: 'roadtrip', name: 'Road Trip', color: '#ffa726', artDir: 'RoadTripPngs',
    items: [
      { id: 'rt_car',     name: 'Beep Beep',      icon: 'directions_car',     rarity: 'common' },
      { id: 'rt_gas',     name: "Fill 'Er Up",    icon: 'local_gas_station',  rarity: 'common' },
      { id: 'rt_map',     name: "Ol' Map",        icon: 'map',                rarity: 'common' },
      { id: 'rt_bag',     name: 'Pack Light',     icon: 'luggage',            rarity: 'common' },
      { id: 'rt_sign',    name: 'Which Way?',     icon: 'signpost',           rarity: 'common' },
      { id: 'rt_snack',   name: 'Pit Stop',       icon: 'fastfood',           rarity: 'common' },
      { id: 'rt_bus',     name: 'Party Bus',      icon: 'directions_bus',     rarity: 'uncommon' },
      { id: 'rt_moto',    name: 'Zoom Zoom',      icon: 'two_wheeler',        rarity: 'uncommon' },
      { id: 'rt_view',    name: 'Scenic Route',   icon: 'landscape',          rarity: 'uncommon' },
      { id: 'rt_wheel',   name: 'Fun Park',       icon: 'attractions',        rarity: 'rare' },
      { id: 'rt_tent',    name: 'Big Tent',       icon: 'festival',           rarity: 'rare' },
      { id: 'rt_world',   name: 'WORLD TOUR',     icon: 'travel_explore',     rarity: 'chase' },
    ],
  },
  {
    id: 'sports', name: 'Ball Game', color: '#ef5350', artDir: 'BallGamePngs',
    items: [
      { id: 'sb_soccer',  name: 'Goooal!',        icon: 'sports_soccer',       rarity: 'common' },
      { id: 'sb_hoop',    name: 'Swish',          icon: 'sports_basketball',   rarity: 'common' },
      { id: 'sb_base',    name: 'Home Run',       icon: 'sports_baseball',     rarity: 'common' },
      { id: 'sb_volley',  name: 'Set! Spike!',    icon: 'sports_volleyball',   rarity: 'common' },
      { id: 'sb_foot',    name: 'Hut Hut',        icon: 'sports_football',     rarity: 'common' },
      { id: 'sb_golf',    name: 'Hole in Fun',    icon: 'sports_golf',         rarity: 'common' },
      { id: 'sb_hockey',  name: 'Slapshot',       icon: 'sports_hockey',       rarity: 'uncommon' },
      { id: 'sb_karate',  name: 'Hi-YA!',         icon: 'sports_martial_arts', rarity: 'uncommon' },
      { id: 'sb_skate',   name: 'Kickflip',       icon: 'skateboarding',       rarity: 'uncommon' },
      { id: 'sb_trophy',  name: 'Big Trophy',     icon: 'emoji_events',        rarity: 'rare' },
      { id: 'sb_finish',  name: 'Photo Finish',   icon: 'sports_score',        rarity: 'rare' },
      { id: 'sb_medal',   name: 'GOLD MEDAL',     icon: 'military_tech',       rarity: 'chase' },
    ],
  },
  {
    id: 'weather', name: 'Sky Diary', color: '#26c6da', artDir: 'SkyDiaryPngs',
    items: [
      { id: 'wx_cloud',   name: 'Puffy',          icon: 'cloud',        rarity: 'common' },
      { id: 'wx_rain',    name: 'Drizzle Day',    icon: 'rainy',        rarity: 'common' },
      { id: 'wx_wind',    name: 'Whoosh',         icon: 'air',          rarity: 'common' },
      { id: 'wx_drop',    name: 'Dewdrop',        icon: 'water_drop',   rarity: 'common' },
      { id: 'wx_fog',     name: 'Foggy Morning',  icon: 'foggy',        rarity: 'common' },
      { id: 'wx_dusk',    name: 'Golden Hour',    icon: 'wb_twilight',  rarity: 'common' },
      { id: 'wx_thunder', name: 'Rumbler',        icon: 'thunderstorm', rarity: 'uncommon' },
      { id: 'wx_snow',    name: 'First Snow',     icon: 'ac_unit',      rarity: 'uncommon' },
      { id: 'wx_storm',   name: 'Storm Watch',    icon: 'storm',        rarity: 'uncommon' },
      { id: 'wx_cyclone', name: 'Big Swirl',      icon: 'cyclone',      rarity: 'rare' },
      { id: 'wx_bolt',    name: 'Zap!',           icon: 'bolt',         rarity: 'rare' },
      { id: 'wx_rainbow', name: 'DOUBLE RAINBOW', icon: 'looks',        rarity: 'chase' },
    ],
  },
  {
    id: 'cats', name: 'Cat Cafe', color: '#a1887f', artDir: 'CatCafePngs',
    items: [
      { id: 'ct_paw',     name: 'Bean Toes',      icon: 'pets',             rarity: 'common' },
      { id: 'ct_milk',    name: 'Milk Moustache', icon: 'local_drink',      rarity: 'common' },
      { id: 'ct_box',     name: 'If I Fits',      icon: 'inventory_2',      rarity: 'common' },
      { id: 'ct_mouse',   name: 'Squeaky Friend', icon: 'toys',             rarity: 'common' },
      { id: 'ct_window',  name: 'Window Watch',   icon: 'window',           rarity: 'common' },
      { id: 'ct_nap',     name: 'Sunbeam Nap',    icon: 'bedtime',          rarity: 'common' },
      { id: 'ct_latte',   name: 'Latte Art',      icon: 'local_cafe',       rarity: 'uncommon' },
      { id: 'ct_loaf',    name: 'Perfect Loaf',   icon: 'bakery_dining',    rarity: 'uncommon' },
      { id: 'ct_kitten',  name: 'Tiny Menace',    icon: 'child_care',       rarity: 'uncommon' },
      { id: 'ct_tuxedo',  name: 'House Manager',  icon: 'styler',           rarity: 'rare' },
      { id: 'ct_zoom',    name: '3AM Zoomies',    icon: 'bolt',             rarity: 'rare' },
      { id: 'ct_maneki',  name: 'LUCKY CAT',      icon: 'star',             rarity: 'chase' },
    ],
  },
  {
    // Ships alongside the Autumn Market look, so the season reads as deliberate
    // rather than as a room dressing nobody asked for.
    //
    // BRIEF NOTE for the art: "autumn" invites twelve brown things, and a set
    // where nine of twelve read the same at thumbnail size has happened here
    // before (Ball Game). The subjects below are chosen to force PALETTE
    // variety — russet, gold, deep green, grey sky, white, one cold blue — so
    // ask for that spread explicitly rather than for "autumn colours".
    id: 'autumn', name: 'Sweater Weather', color: '#c0663a', artDir: 'SweaterWeatherPngs',
    unreleased: true,        // ← delete this line on the 15th, and that is the reveal
    items: [
      { id: 'aw_leaf',    name: 'First Red Leaf',  icon: 'eco',              rarity: 'common' },
      { id: 'aw_boot',    name: 'Puddle Boots',    icon: 'steps',            rarity: 'common' },
      { id: 'aw_cocoa',   name: 'Cocoa Mug',       icon: 'emoji_food_beverage', rarity: 'common' },
      { id: 'aw_acorn',   name: 'Fat Acorn',       icon: 'spa',              rarity: 'common' },
      { id: 'aw_scarf',   name: 'Long Scarf',      icon: 'checkroom',        rarity: 'common' },
      { id: 'aw_rain',    name: 'Grey Afternoon',  icon: 'umbrella',         rarity: 'common' },
      { id: 'aw_pie',     name: 'Cooling Pie',     icon: 'pie_chart',        rarity: 'uncommon' },
      { id: 'aw_lantern', name: 'Porch Lantern',   icon: 'light',            rarity: 'uncommon' },
      { id: 'aw_pine',    name: 'Green Pinecone',  icon: 'park',             rarity: 'uncommon' },
      { id: 'aw_hedgehog',name: 'Hedgehog',        icon: 'cruelty_free',     rarity: 'rare' },
      { id: 'aw_moon',    name: 'Harvest Moon',    icon: 'brightness_3',     rarity: 'rare' },
      { id: 'aw_fox',     name: 'FIRST FROST FOX', icon: 'auto_awesome',     rarity: 'chase' },
    ],
  },
];

// ---- monthly rotation ----
//
// Which sets are IN THE MACHINES this month. Hand-picked and committed, NOT
// computed from a query: the shop floor is seeded client-side off the period
// string so it works offline and is identical for every player, and a
// server-derived pool would break both of those.
//
// Rules that keep this healthy:
//   • KEEP IT AT TEN. With five floor slots a specific set shows up about
//     5/N of rotations, so the wait for one is roughly N/10 days — one day at
//     ten sets, three days at thirty. Letting the pool grow slowly ruins the
//     hunt. One set in, one set out.
//   • Out of rotation is NOT retired. Nothing is ever discontinued: the
//     Fukubiki drum, the Swap Shop and the Special Pon all still reach every
//     set in the game, so an out-of-rotation set is expensive to chase, never
//     impossible. The binder keeps its page and marks it.
//   • Bring every set back within about three months, popular or not.
//     Popularity decides the ORDER, never whether a set returns — otherwise
//     an unloved set leaves, nobody new starts it, and it never comes back.
//   • What to swap in is a judgement call informed by real demand. Run this
//     once a month; item ids carry their set as a prefix:
//       select split_part(item_id,'_',1) as set_prefix, count(*) as hunters
//       from public.wants group by 1 order by hunters desc;
//     A set that is OUT of rotation collects wants from people who cannot
//     finish it, which is exactly the signal that it is time to bring it back.
//   • Seasonal sets (a Halloween or Christmas set) are exempt from the
//     three-month rule — they come back annually, on the calendar.
//
// An empty or missing list means "everything", so the game still works if
// this is ever mangled.
const ROTATION = [
  'space', 'critters', 'snacks', 'music', 'ocean',
  'garden', 'retro', 'roadtrip', 'sports', 'cats',
];

const ITEMS_BY_ID = {};
for (const col of COLLECTIONS) {
  for (const it of col.items) {
    it.collection = col.id;
    ITEMS_BY_ID[it.id] = it;
  }
}

// ---- release gating ----
//
// A set can sit fully wired in the repo — data, trade ids, art — before it is
// meant to exist. `unreleased: true` is what makes that safe.
//
// This is NOT the same as being out of rotation, and confusing the two has
// already cost a reveal once: rotation only filters the SHOP FLOOR, while the
// Fukubiki drum, the Swap Shop and the Special Pon reach every collection. A
// set added early leaks through those routes — and it leaks HARDEST, because
// nobody owns any of it, so the drum's "give them something they're missing"
// logic favours it above every other set.
//
// Releasing is one line deleted. Deliberately not a date: a reveal should
// happen when the art is finished and Brad says so, not when a clock says so.
//
// ITEMS_BY_ID deliberately still contains unreleased stickers, so ids resolve
// everywhere and nothing has to guard against a missing item.
let SHOW_UNRELEASED = false;

// Console helper, for checking new art in the binder before anyone else can
// reach it:  showUnreleased(); renderAlbum();
function showUnreleased(on = true) {
  SHOW_UNRELEASED = !!on;
  return SHOW_UNRELEASED;
}

function liveCollections() {
  return COLLECTIONS.filter(c => !c.unreleased || SHOW_UNRELEASED);
}

// Virtual "collection" for the Special Pon — every sticker in the game.
// Items keep their real `collection`, so art and album placement still work.
const SPECIAL_COLLECTION = {
  id: 'special', name: 'Every Set!', color: '#ffc107',
  // A getter, not a computed array: the pool has to answer to the release flag
  // at the moment it is rolled, or a set held back would still be handed out by
  // the machine that pulls from everything.
  get items() { return liveCollections().flatMap(c => c.items); },
};
