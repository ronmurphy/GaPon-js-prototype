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

// Second guard, and the stronger of the two: if a save was already on disk
// when we booted, storage demonstrably survives here whatever the UA claims.
// Never warn someone whose progress is visibly persisting.
function storageProven() {
  return !!SAVE_EXISTED;
}

function shouldWarnWebView() {
  return isInAppBrowser() && !storageProven();
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
  const bar = document.createElement('div');
  bar.className = 'wv-warn';
  bar.innerHTML = `
    <div class="wv-inner">
      <b>This collection won't follow you</b>
      <p>You're in an app's built-in browser, and it keeps its own separate
         save. Open GaPon in your real browser or you'll end up with two
         half-finished binders — and this one can be wiped by the app.</p>
      <div class="wv-acts">
        ${android
          ? `<a class="btn small" id="wv-open" href="${browserHandoffURL()}">Open in my browser</a>`
          : `<span class="wv-tip">Tap <b>⋯</b> and choose <b>Open in Browser</b></span>`}
        <button class="btn small ghost" id="wv-copy">Copy link</button>
      </div>
    </div>
    <button class="wv-x" id="wv-close" aria-label="dismiss">×</button>`;
  document.body.appendChild(bar);

  bar.querySelector('#wv-copy').addEventListener('click', () => {
    const url = location.href;
    navigator.clipboard?.writeText(url)
      .then(() => toast('Link copied — paste it into your browser', 'good'))
      .catch(() => toast('Long-press the address bar to copy the link', 'warn'));
  });
  bar.querySelector('#wv-close').addEventListener('click', () => bar.remove());
  return true;
}
