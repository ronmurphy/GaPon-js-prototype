// GaPon — room styling. Two dressings of the same building:
//
//   'us' — the 80s American arcade this started as: dark room, neon-fleck
//          carpet, hot-pink "ARCADE" sign.
//   'jp' — a Japanese ゲームセンター: bright fluorescent light, pale patterned
//          carpet, cool signage, shoji panelling in the shop.
//
// Only the paint changes. Every machine, price, and rule is identical, so
// this is purely a look preference and lives outside the save.

const THEME_KEY = 'gapon-theme';
const THEMES = ['us', 'jp'];
const THEME = { id: 'us' };

try {
  const saved = localStorage.getItem(THEME_KEY);
  if (THEMES.includes(saved)) THEME.id = saved;
} catch (e) {}

function applyTheme() {
  document.body.classList.toggle('theme-jp', THEME.id === 'jp');
  const btn = document.querySelector('#toggle-theme');
  if (btn) {
    btn.textContent = THEME.id === 'jp' ? '🇯🇵' : '🇺🇸';
    btn.title = THEME.id === 'jp'
      ? 'Game center look — tap for the American arcade'
      : 'American arcade look — tap for the Japanese game center';
  }
}

function cycleTheme() {
  THEME.id = THEMES[(THEMES.indexOf(THEME.id) + 1) % THEMES.length];
  try { localStorage.setItem(THEME_KEY, THEME.id); } catch (e) {}
  applyTheme();
}
