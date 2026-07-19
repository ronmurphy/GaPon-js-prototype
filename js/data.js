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
};

const ECON = {
  startCoins: 100,
  dailyBase: 30,
  dailyStreakStep: 5,   // +5 per consecutive day...
  dailyStreakCap: 20,   // ...up to +20
  setBonus: 150,        // claim once per completed collection
};

// Arcade: capped daily plays so minigames stay a snack, not the meal.
// Every game tops out at 15 coins, so max arcade income (3 × 15 = 45/day)
// stays in the same league as the daily login bonus and capsule pulls
// remain the scarce, exciting spend.
const ARCADE = {
  playsPerDay: 3,
  timing: { gold: 15, silver: 10, bronze: 5, miss: 2 },
  match:  { perfect: 15, missPenalty: 3, floor: 5 },
  chase:  { seconds: 10, goldTaps: 12, silverTaps: 8, bronzeTaps: 4,
            gold: 15, silver: 10, bronze: 5, miss: 2 },
  shell:  { swaps: 6, win: 12, wrong: 3 },
  echo:   { rounds: [5, 10, 15], flub: 2 },  // payout per round survived
};

// Each collection: 6 common, 3 uncommon, 2 rare, 1 chase.
// icon = Material Symbols ligature name.
const COLLECTIONS = [
  {
    id: 'space', name: 'Cosmo Club', color: '#7e57c2',
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
    id: 'critters', name: 'Critter Pals', color: '#66bb6a',
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
    id: 'snacks', name: 'Snack Attack', color: '#ff8a65',
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
    id: 'music', name: 'Beat Box', color: '#42a5f5',
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
    id: 'weather', name: 'Sky Diary', color: '#26c6da',
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
