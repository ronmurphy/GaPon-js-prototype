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
    // omikuji-shrine.png and omikuji.png are interchangeable — measured object
    // 179x344 vs 178x341 with the same margins, so swapping the filename here
    // is the whole change. The shrine adds tied bad-luck ribbons and a small
    // hex box at its side, which is the box you shake in the modal.
    omikuji:      'omikuji-shrine.png',
    'omi-box':       'omikuji_hex_box_empty.png',
    'omi-box-drawn': 'omikuji_hex_box_fortune.png',
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
  applySeasonalProps();
}

// The shop dresses ITSELF on the calendar — the fern becomes a pumpkin in
// autumn the way the window goes dark at night. Nobody bought the fern, so
// nobody is asked; that consent line belongs to cosmetics, which are the
// player's own belongings.
//
// A holiday outranks its season for the two nights it runs.
//
// Every swap is PROVEN before it is applied. A seasonal file can be missing —
// the art may not have been drawn yet, or a deploy may land mid-season — and a
// 404 in a background shorthand paints nothing at all, which would leave a
// hole in the room where the fern used to be. Loading it first means the worst
// case is last month's scenery instead of no scenery.
function applySeasonalProps() {
  if (!PROPS.dir) return;
  const dressing = Object.assign(
    {},
    (typeof activeSeason === 'function' && activeSeason() || {}).props,
    (typeof activeHoliday === 'function' && activeHoliday() || {}).props,
  );
  for (const [name, file] of Object.entries(dressing)) {
    if (!(name in PROPS.files)) continue;         // never invent a new prop slot
    const url = `${PROPS.dir}/${file}`;
    const img = new Image();
    img.onload = () =>
      document.documentElement.style.setProperty('--prop-' + name, cssUrl(url));
    img.src = url;                                 // onerror: keep what's there
  }
}
