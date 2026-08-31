// GaPon — in-app browser warning.
//
// Facebook and Messenger can open a link two very different ways:
//
//   • a CUSTOM TAB — the real Chrome or Firefox in a slim frame. It shares
//     the browser's storage, so the save persists and everything is fine.
//   • an in-app WEBVIEW — a browser inside the Facebook app with its OWN
//     storage bucket. Measured on a real phone: storage there does persist
//     across reloads, but it is completely separate from the real browser's
//     (0 KB used in the webview vs 1.7 MB in Firefox on the same device, and
//     a different anonymous account). So a player builds a collection that
//     silently isn't there the day they open the link properly — and that the
//     app may clear whenever it likes.
//
// Only the second one deserves a warning, and custom tabs must never see it —
// they're indistinguishable from the real browser because they ARE it.
//
// Measured on a real device (Android 16, Messenger) rather than guessed. Three
// signals, in order of how much they can be trusted:
//
//   1. `brands` reports "Android WebView". Structural, app-agnostic, and it
//      catches in-app browsers from apps nobody has heard of yet.
//   2. `; wv)` in the UA — the same thing for older Android WebViews.
//   3. Named apps (FB_IAB / FBAN / Instagram …). The only option on iOS, where
//      every webview is honestly indistinguishable from Safari.
//
// `storage.persisted()` was tried and dropped: it returns false in real
// Firefox where storage demonstrably works, so it says nothing useful.
const IN_APP_UA = /(FB_IAB|FBAN|FBAV|FBIOS|FB4A|Instagram|MicroMessenger|Snapchat|Line\/|;\s*wv[;)])/i;

function isInAppBrowser() {
  const brands = (navigator.userAgentData && navigator.userAgentData.brands) || [];
  if (brands.some(b => /Android WebView/i.test(b.brand || ''))) return true;
  return IN_APP_UA.test(navigator.userAgent || '');
}

// This used to be suppressed whenever a save already existed, on the theory
// that storage evidently worked so there was nothing to warn about. Measuring
// it killed that: a webview save persists perfectly well — across reloads, app
// restarts, even a phone reboot — it is simply a DIFFERENT save. Brad ended up
// on day 3 with 0 pulls in Messenger and day 9 with 104 pulls in Firefox, and
// the game never said a word. Having a save here is the reason to warn, not a
// reason to stay quiet.
// Dismissal is tracked PER WORDING, not once overall. The banner says two very
// different things — "start in your real browser" to someone with nothing yet,
// and "copy your backup code" to someone holding a collection. A single flag
// meant tapping × on day one, when there was nothing to lose, also silenced
// the migration version forever — so the one message that comes with a working
// tool was only ever shown to people who had no use for it.
const WV_DISMISSED = 'gapon-wv-ok';

// 'save' once they've actually played here, 'new' before that.
function wvVariant() {
  return (SAVE_EXISTED && state && state.totalPulls > 0) ? 'save' : 'new';
}

function wvSeen() {
  try { return (localStorage.getItem(WV_DISMISSED) || '').split(',').filter(Boolean); }
  catch (e) { return []; }
}

function shouldWarnWebView() {
  return isInAppBrowser() && !wvSeen().includes(wvVariant());
}

// Android can hand off to whatever the player's default browser is. The
// package is deliberately NOT pinned to Chrome — someone who has set Firefox
// as their default should land in Firefox.
function browserHandoffURL() {
  const scheme = location.protocol.replace(':', '');
  return `intent://${location.host}${location.pathname}${location.search}#Intent;scheme=${scheme};end`;
}

function showWebViewWarning() {
  if (!shouldWarnWebView()) return false;
  const android = /Android/i.test(navigator.userAgent || '');
  // Someone who has already played here needs a way to CARRY the collection
  // over, not just a warning. The backup code is that way, so offer it inline
  // rather than making them find it in the footer.
  const variant = wvVariant();
  const hasSave = variant === 'save';
  const bar = document.createElement('div');
  bar.className = 'wv-warn';
  bar.innerHTML = `
    <div class="wv-inner">
      <b>${hasSave ? "This collection won't follow you" : 'Start in your real browser'}</b>
      <p>${hasSave
        ? `You're in an app's built-in browser, and it keeps a <b>separate</b> save
           from your normal one. Copy your backup code, open GaPon properly, and
           paste it into <b>restore</b> to bring this collection with you.`
        : `You're in an app's built-in browser. Anything you collect here stays
           here — it won't be in your normal browser, and the app can wipe it.`}</p>
      <div class="wv-acts">
        ${android
          ? `<a class="btn small" id="wv-open" href="${browserHandoffURL()}">Open in my browser</a>`
          : `<span class="wv-tip">Tap <b>⋯</b> and choose <b>Open in Browser</b></span>`}
        <button class="btn small ghost" id="wv-copy">${hasSave ? 'Copy backup code' : 'Copy link'}</button>
      </div>
    </div>
    <button class="wv-x" id="wv-close" aria-label="dismiss">×</button>`;
  document.body.appendChild(bar);

  bar.querySelector('#wv-copy').addEventListener('click', () => {
    // the backup code IS the whole save — verified byte-identical on restore
    const text = hasSave
      ? btoa(unescape(encodeURIComponent(JSON.stringify(state))))
      : location.href;
    const ok = () => toast(hasSave
      ? 'Backup copied — paste it into restore in your real browser'
      : 'Link copied — paste it into your browser', 'good', 5000);
    navigator.clipboard?.writeText(text).then(ok,
      () => toast('Copy blocked — use backup under the gear instead', 'warn'));
  });
  bar.querySelector('#wv-close').addEventListener('click', () => {
    // remembered in the webview's own storage, which does persist. Only THIS
    // wording is silenced — the migration one still gets its one showing once
    // there's a collection worth carrying.
    const seen = wvSeen();
    if (!seen.includes(variant)) seen.push(variant);
    try { localStorage.setItem(WV_DISMISSED, seen.join(',')); } catch (e) {}
    bar.remove();
  });
  return true;
}
