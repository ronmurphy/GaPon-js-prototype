// GaPon — illustrated room props.
//
// Same shape as the shopkeeper (js/shopkeeper.js): a directory and a set of
// filenames, and setting `dir` to null puts the whole room back to its CSS
// version in one move. That matters more here than it did for Poko — these
// props are load-bearing scenery, and "revert" has to be one line, not a
// per-prop hunt.
//
// The URLs are handed to CSS as custom properties rather than being set as
// inline backgrounds, because the props have hover states and time-of-day
// variants that belong in the stylesheet. They are built with cssUrl() — a
// bare url() inside a custom property resolves against the STYLESHEET, not
// the element, which has silently broken two features already (see js/art.js).
const PROPS = {
  dir: 'assets/props',        // ← null falls the whole room back to CSS
  files: {
    fern:         'fern.png',
    omikuji:      'omikuji.png',
    'door-arcade': 'door_arcade.png',
    'door-parlour': 'door_parlor.png',
    // Frame only, panes transparent — so the CSS sky underneath keeps all FOUR
    // of its time-of-day states instead of two baked ones. Confirmed
    // transparent at every pane rather than assumed: white panes here would
    // have silently boarded the window up.
    'window-frame': 'window_frame.png',
    counter:      'counter.png',
  },
};

function initProps() {
  if (!PROPS.dir) return;
  const root = document.documentElement;
  for (const [name, file] of Object.entries(PROPS.files)) {
    root.style.setProperty('--prop-' + name, cssUrl(`${PROPS.dir}/${file}`));
  }
  document.body.classList.add('props-on');
}
