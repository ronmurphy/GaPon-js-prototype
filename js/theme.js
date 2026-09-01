// GaPon — room styling. Two dressings of the same building:
//
//   'us' — the 80s American arcade this started as: dark room, neon-fleck
//          carpet, hot-pink "ARCADE" sign.
//   'jp' — a Japanese ゲームセンター: bright fluorescent light, pale patterned
//          carpet, cool signage, shoji panelling in the shop.
//
// Only the paint changes. Every machine, price, and rule is identical.
//
// The choice USED to live in localStorage on its own, deliberately outside the
// save. That stopped being defensible once both looks moved into Poko's prize
// counter next to cosmetics that ride the cloud save: buy a wallpaper on your
// phone and it follows you to the laptop, flip to the game center and it
// wouldn't. `state.cos.on.theme` is now the source of truth (see
// migrateCosmetics, which folds the old localStorage value in once).
//
// localStorage is kept as a pre-boot CACHE only. Themes are applied from the
// save, but the save loads a moment after first paint, so without it the JP
// player would see a flash of the American arcade on every launch.

const THEME_KEY = 'gapon-theme';
const THEMES = ['us', 'jp'];
const THEME = { id: 'us' };

try {
  const saved = localStorage.getItem(THEME_KEY);
  if (THEMES.includes(saved)) THEME.id = saved;
} catch (e) {}

function applyTheme() {
  document.body.classList.toggle('theme-jp', THEME.id === 'jp');
  // refresh the pre-boot cache; the save stays the authority
  try { localStorage.setItem(THEME_KEY, THEME.id); } catch (e) {}
  const btn = document.querySelector('#toggle-theme');
  if (btn) {
    btn.textContent = THEME.id === 'jp' ? '🇯🇵' : '🇺🇸';
    btn.title = THEME.id === 'jp'
      ? 'Game center look — tap for the American arcade'
      : 'American arcade look — tap for the Japanese game center';
  }
}

function cycleTheme() {
  const next = THEMES[(THEMES.indexOf(THEME.id) + 1) % THEMES.length];
  // route through the counter so the choice lands in the save and syncs
  if (typeof equipCosmetic === 'function' && typeof state === 'object' && state.cos) {
    equipCosmetic(next);
  } else {
    THEME.id = next;
    applyTheme();
  }
}
