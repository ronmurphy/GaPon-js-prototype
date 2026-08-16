// GaPon — all game-design data lives here (ports to Godot as-is later).

const RARITIES = {
  common:   { label: 'Common',   sell: 2,  color: '#b0bec5' },
  uncommon: { label: 'Uncommon', sell: 6,  color: '#66bb6a' },
  rare:     { label: 'Rare',     sell: 15, color: '#42a5f5' },
  chase:    { label: 'Chase ★',  sell: 45, color: '#ffc107' },
};

const RARITY_ORDER = ['common', 'uncommon', 'rare', 'chase'];

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

const ECON = {
  startCoins: 100,
  dailyBase: 30,
  dailyStreakStep: 5,   // +5 per consecutive day...
  dailyStreakCap: 20,   // ...up to +20
  setBonus: 150,        // claim once per completed collection
  swapCost: 3,          // spare copies traded for one sticker of the same tier
  machineStock: 10,     // real capsules per machine per rotation — the dome
                        // empties as you pull, and a drained machine sells
                        // out until the next restock
};

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
    id: 'music', name: 'Beat Box', color: '#42a5f5', artDir: 'BeatBoxPngs'    items: [
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
    id: 'ocean', name: 'Tide Pool', color: '#1e88e5',
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
    id: 'garden', name: 'Bloom Crew', color: '#ec407a',
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
    id: 'roadtrip', name: 'Road Trip', color: '#ffa726',
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
    id: 'sports', name: 'Ball Game', color: '#ef5350',
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
];

const ITEMS_BY_ID = {};
for (const col of COLLECTIONS) {
  for (const it of col.items) {
    it.collection = col.id;
    ITEMS_BY_ID[it.id] = it;
  }
}

// Virtual "collection" for the Special Pon — every sticker in the game.
// Items keep their real `collection`, so art and album placement still work.
const SPECIAL_COLLECTION = {
  id: 'special', name: 'Every Set!', color: '#ffc107',
  items: COLLECTIONS.flatMap(c => c.items),
};
