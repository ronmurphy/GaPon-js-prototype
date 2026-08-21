// GaPon — in-app browser warning.
//
// Facebook and Messenger can open a link two very different ways:
//
//   • a CUSTOM TAB — the real Chrome or Firefox in a slim frame. It shares
//     the browser's storage, so the save persists and everything is fine.
//   • an in-app WEBVIEW — a private browser inside the Facebook app with its
//     own storage, commonly discarded when the app closes. GaPon's whole save
//     lives in localStorage, so a player here can put in an hour and lose the
//     lot without ever being told.
//
// Only the second one deserves a warning, and telling them apart matters:
// Brad has Firefox set as his custom-tab provider, and those users must never
// see this. The distinction is that WEBVIEWS stamp the user agent
// (FB_IAB / FBAN / FBAV) while custom tabs do not — they're indistinguishable
// from the real browser because they ARE the real browser.

const IN_APP_UA = /(FB_IAB|FBAN|FBAV|FBIOS|FB4A|Instagram|MicroMessenger|Snapchat|Line\/)/i;

function isInAppBrowser() {
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
      <b>Your progress won't be saved here</b>
      <p>You're in Facebook's built-in browser. It forgets everything when you
         close it — coins, pulls, your whole binder.</p>
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
