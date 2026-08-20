// GaPon — trading. Give a sticker to a friend as a short code or a capsule-
// card PNG (code printed on it AND hidden in the pixels; the filename is the
// code too, so any one of the three survives). No server: the sticker leaves
// the giver's binder the moment the capsule is made, so it only exists in one
// place, and redeemed codes are remembered per-device. Beyond that it's
// honor-system — this is a game for friends.

// The order of this list is a permanent contract with every code ever issued —
// see js/tradeids.js. Anything in the game but missing from the ledger gets
// appended at runtime so it can still be traded today, but that ordering only
// holds until the next set ships: fix the ledger, don't rely on this.
// Entries are NEVER dropped, even if the sticker leaves the game — removing
// one would shift every index after it, which is the whole bug this fixes. A
// code for a sticker that no longer exists simply fails to parse.
const TRADE_ITEM_IDS = (() => {
  const ledger = TRADE_ID_LEDGER.slice();
  const known = new Set(ledger);
  const missing = Object.keys(ITEMS_BY_ID).filter(id => !known.has(id)).sort();
  if (missing.length) {
    console.warn('[GaPon] not in the trade ledger — add to js/tradeids.js:', missing.join(', '));
  }
  return ledger.concat(missing);
})();
const TRADE_MAGIC = 'GPT1';

// ---------- codes (filename-safe: A–Z, 0–9, dashes) ----------

function tradeChk(body) {
  return hashString('gapon-trade:' + body).toString(36).toUpperCase()
    .padStart(2, '0').slice(0, 2);
}

// A foil capsule is a GF- code instead of GP-. The flag is folded into the
// CHECKSUM as well as the prefix, so flipping that one character invalidates
// the code rather than upgrading a plain sticker into a foil. Plain codes
// hash exactly as before, so every GP- code ever issued still resolves.
function makeTradeCode(itemId, foil = false) {
  const idx = TRADE_ITEM_IDS.indexOf(itemId).toString(36).toUpperCase();
  let nonce = '';
  for (let i = 0; i < 4; i++) nonce += Math.floor(Math.random() * 36).toString(36).toUpperCase();
  const body = idx + '-' + nonce;
  return (foil ? 'GF-' : 'GP-') + body + tradeChk((foil ? 'F:' : '') + body);
}

function parseTradeCode(raw) {
  const code = String(raw || '').trim().toUpperCase();
  const m = code.match(/^G([PF])-([0-9A-Z]{1,2})-([0-9A-Z]{4})([0-9A-Z]{2})$/);
  if (!m) return null;
  const [, kind, idx, nonce, chk] = m;
  const foil = kind === 'F';
  if (tradeChk((foil ? 'F:' : '') + idx + '-' + nonce) !== chk) return null;
  const itemId = TRADE_ITEM_IDS[parseInt(idx, 36)];
  const item = itemId && ITEMS_BY_ID[itemId];
  if (!item) return null;      // ledger slot for a sticker that's left the game
  return { code, item, foil };
}

// ---------- trade state ----------

function createTrade(item, foil = false) {
  const pile = foil ? state.foils : state.inv;
  if (!pile[item.id]) return null;
  pile[item.id]--;
  if (!pile[item.id]) delete pile[item.id];
  const code = makeTradeCode(item.id, foil);
  // `foil` is stored so a take-back returns exactly what was sealed
  state.trades.push({ code, itemId: item.id, at: todayStr(), foil });
  saveGame();
  return code;
}

function cancelTrade(code) {
  const i = state.trades.findIndex(t => t.code === code);
  if (i < 0) return false;
  // returns exactly what was sealed — never re-rolls (see addItem)
  addItem(state.trades[i].itemId, !!state.trades[i].foil);
  state.redeemed.push(code);   // dead code now — can't be redeemed here later
  state.trades.splice(i, 1);
  saveGame();
  return true;
}

// Server-verified when possible, honour system when not. `serverSaid` is the
// answer from netClaimTrade: 'taken' means someone genuinely beat you to it,
// null means the server never heard of this code (a capsule made offline), in
// which case we fall back to the local behaviour rather than refusing a
// perfectly good trade.
function redeemTrade(raw, sender, serverSaid) {
  const parsed = parseTradeCode(raw);
  if (!parsed) return { err: "that code doesn't look right — check it and try again" };
  if (serverSaid === 'taken') {
    return { err: 'someone already opened that capsule!' };
  }
  if (state.redeemed.includes(parsed.code)) {
    return { err: 'that capsule was already opened on this device' };
  }
  const isNew = !hasItem(parsed.item.id);
  addItem(parsed.item.id, parsed.foil);   // foilness rides in the code itself
  state.redeemed.push(parsed.code);
  // redeeming your own outstanding code = quietly taking it back
  const mine = state.trades.findIndex(t => t.code === parsed.code);
  if (mine >= 0) {
    state.trades.splice(mine, 1);
    netCancelTrade(parsed.code);     // release the server copy too
  }
  saveGame();
  return { item: parsed.item, isNew, sender, foil: parsed.foil };
}

// ---------- steganography (LSBs of RGB; survives PNG, not chat re-compress) ----------

function stegWrite(ctx, w, h, text) {
  const bytes = new TextEncoder().encode(text);
  if ((32 + bytes.length * 8) > w * h * 3) return;   // never (cards are big)
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  let i = 0;
  const putBit = bit => {
    const px = Math.floor(i / 3), ch = i % 3;
    d[px * 4 + ch] = (d[px * 4 + ch] & 0xfe) | bit;
    d[px * 4 + 3] = 255;   // opaque pixels read back exactly
    i++;
  };
  for (let b = 31; b >= 0; b--) putBit((bytes.length >> b) & 1);
  for (const byte of bytes) for (let b = 7; b >= 0; b--) putBit((byte >> b) & 1);
  ctx.putImageData(img, 0, 0);
}

function stegRead(imgEl) {
  try {
    const w = imgEl.naturalWidth, h = imgEl.naturalHeight;
    if (!w || !h) return null;
    const cv = document.createElement('canvas');
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext('2d');
    ctx.drawImage(imgEl, 0, 0);
    const d = ctx.getImageData(0, 0, w, h).data;
    let i = 0;
    const getBit = () => {
      const px = Math.floor(i / 3), ch = i % 3;
      i++;
      return d[px * 4 + ch] & 1;
    };
    let len = 0;
    for (let b = 0; b < 32; b++) len = (len * 2) + getBit();
    if (len <= 0 || len > 2048 || (32 + len * 8) > w * h * 3) return null;
    const bytes = new Uint8Array(len);
    for (let k = 0; k < len; k++) {
      let v = 0;
      for (let b = 0; b < 8; b++) v = (v * 2) + getBit();
      bytes[k] = v;
    }
    const obj = JSON.parse(new TextDecoder().decode(bytes));
    return obj && obj.m === TRADE_MAGIC ? obj : null;
  } catch (e) {
    return null;
  }
}

// ---------- the capsule-card PNG ----------

function tradeLoadImg(src) {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = src;
  });
}

async function renderTradeCard(item, code, sender, foil = false) {
  const W = 480, H = 640;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext('2d');
  const col = COLLECTIONS.find(c => c.id === item.collection);
  const rar = RARITIES[item.rarity];
  try {
    await document.fonts.load('700 36px Fredoka');
    await document.fonts.load('150px "Material Symbols Rounded"');
  } catch (e) {}

  // card body
  ctx.fillStyle = '#241a47';
  ctx.beginPath();
  ctx.roundRect(0, 0, W, H, 28);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,193,7,0.55)';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.roundRect(6, 6, W - 12, H - 12, 22);
  ctx.stroke();

  // header
  ctx.fillStyle = '#ffc107';
  ctx.font = '700 30px Fredoka, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('★ GaPon TRADE ★', W / 2, 58);

  // capsule
  const cx = W / 2, cy = 250, R = 130;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, R, Math.PI, 0);
  ctx.closePath();
  ctx.fillStyle = col.color;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI);
  ctx.closePath();
  ctx.fillStyle = '#f2f0eb';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy, R, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 5;
  ctx.stroke();
  // shine
  ctx.beginPath();
  ctx.arc(cx - R * 0.4, cy - R * 0.45, R * 0.18, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fill();
  ctx.restore();

  // sticker face in a white window
  ctx.beginPath();
  ctx.arc(cx, cy, R * 0.68, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  let drewArt = false;
  const src = itemArtSrc(item);
  if (src) {
    try {
      const img = await tradeLoadImg(src);
      const s = R * 1.05;
      // baked at a fixed angle — a saved PNG wants one flattering sheen
      if (foil) drawFoilImage(ctx, img, cx - s / 2, cy - s / 2, s, s);
      else ctx.drawImage(img, cx - s / 2, cy - s / 2, s, s);
      drewArt = true;
    } catch (e) {}   // art missing/blocked — glyph below
  }
  if (!drewArt) {
    ctx.fillStyle = col.color;
    ctx.font = '120px "Material Symbols Rounded"';
    ctx.textBaseline = 'middle';
    ctx.fillText(item.icon, cx, cy + 4);
    ctx.textBaseline = 'alphabetic';
  }

  // name + rarity + sender
  ctx.fillStyle = '#f5f2ff';
  ctx.font = '700 36px Fredoka, sans-serif';
  ctx.fillText(item.name, W / 2, 435);
  ctx.fillStyle = rar.color;
  ctx.font = '600 24px Fredoka, sans-serif';
  ctx.fillText((foil ? '✨ FOIL ' : '') + rar.label + ' · ' + col.name, W / 2, 470);
  ctx.fillStyle = '#b3a8dc';
  ctx.font = '600 22px Fredoka, sans-serif';
  ctx.fillText(sender ? 'from ' + sender : 'a gift for you!', W / 2, 505);

  // code panel (high contrast — this is the fallback that always survives)
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.roundRect(48, 532, W - 96, 64, 14);
  ctx.fill();
  ctx.fillStyle = '#1c1428';
  ctx.font = '700 34px "Courier New", monospace';
  ctx.fillText(code, W / 2, 575);

  stegWrite(ctx, W, H, JSON.stringify({ m: TRADE_MAGIC, c: code, s: sender || '' }));
  return cv;
}

function downloadTradeCard(cv, code) {
  cv.toBlob(blob => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Trade-${code}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }, 'image/png');
}

// ---------- give flow (opened by tapping an owned card in the binder) ----------

function closeTradeOverlay() {
  const ov = $('#overlay');
  ov.hidden = true;
  ov.innerHTML = '';
}

// `to` is an optional friend from the friend list. Addressing a capsule only
// decides whose Trading Post it shows up in — the code still works for anyone
// who holds it, so offline and pass-along trading are untouched.
function openShareDialog(item, to) {
  const n = ownedCount(item.id);
  const foils = foilCount(item.id);
  if (!n && !foils) return;
  // Plain unless you have nothing but foils. Sending a foil should always be
  // a deliberate act, never the path of least resistance.
  let sendFoil = !n;
  const rar = RARITIES[item.rarity];
  const friends = (typeof NET !== 'undefined' && NET.ready) ? friendList() : [];
  const ov = $('#overlay');
  ov.hidden = false;
  ov.innerHTML = `
    <div class="ov-stage share-stage">
      <div class="r-ring" style="--glow:${rar.color}">${stickerFace(item, { cls: 'r-icon' })}</div>
      <div class="r-name">${item.name}</div>
      <div class="r-chips">
        <span class="chip" style="background:${rar.color}">${rar.label}</span>
        <span class="chip dupe">×${n + foils} owned</span>
      </div>
      ${n && foils ? `
        <div class="tr-pick" role="group" aria-label="which copy to send">
          <button type="button" class="tr-opt active" data-foil="0">plain ×${n}</button>
          <button type="button" class="tr-opt" data-foil="1">✨ foil ×${foils}</button>
        </div>` : ''}
      <p class="r-note" id="tr-note"></p>
      <label class="tr-from">from
        <input id="tr-name" maxlength="14" placeholder="your name" value="${(state.playerName || '').replace(/["<>&]/g, '')}">
      </label>
      ${friends.length ? `
        <label class="tr-from tr-to">to
          <select id="tr-to">
            <option value="">anyone with the code</option>
            ${friends.map(f => `<option value="${escHTML(f.code)}"${to && to.code === f.code ? ' selected' : ''}>${escHTML(f.name)}</option>`).join('')}
          </select>
        </label>` : ''}
      <div class="r-btns">
        <button class="btn ghost" id="tr-cancel">Never mind</button>
        <button class="btn" id="tr-make">🎁 Make trade capsule</button>
      </div>
    </div>`;
  // One note element, rewritten by the picker, so the warning always matches
  // what's actually about to be sent.
  const noteEl = $('#tr-note');
  const ring = ov.querySelector('.r-ring');
  const syncPick = () => {
    const left = (sendFoil ? foils : n) - 1;
    noteEl.innerHTML = sendFoil
      ? (foils === 1
          ? '✨ <b>this is your only foil of it</b> — sending it means finding another.'
          : `sealing a foil copy · ✨${left} would stay with you`)
      : (n === 1 && !foils
          ? '⚠️ your only copy — giving it leaves a hole in your set!'
          : 'seal one copy into a trade capsule for a friend');
    // the ring previews what's leaving, so a foil is visibly a foil
    ring.className = 'r-ring' + (sendFoil ? ' ' + foilClass(item) : '');
    ring.setAttribute('style',
      `--glow:${sendFoil ? '#ffd54f' : rar.color}` + (sendFoil && foilStyle(item) ? ';' + foilStyle(item) : ''));
    ov.querySelectorAll('.tr-opt').forEach(b =>
      b.classList.toggle('active', (b.dataset.foil === '1') === sendFoil));
  };
  syncPick();
  ov.querySelectorAll('.tr-opt').forEach(b => b.addEventListener('click', () => {
    sendFoil = b.dataset.foil === '1';
    sfx.tick();
    syncPick();
  }));
  $('#tr-cancel').addEventListener('click', closeTradeOverlay);
  $('#tr-make').addEventListener('click', async () => {
    state.playerName = $('#tr-name').value.trim().slice(0, 14);
    const pick = $('#tr-to');
    const dest = pick ? friends.find(f => f.code === pick.value) : null;
    const code = createTrade(item, sendFoil);
    if (!code) return;
    // registers it; harmless if offline, and the capsule works either way
    const posted = await netPostTrade(code, item.id, dest && dest.id, sendFoil);
    sfx.pop();
    renderBinderPage();          // the hole appears behind the dialog
    updateBinderNav();
    await showTradeResult(item, code, posted && dest ? dest : null, sendFoil);
  });
}

// `dest` is set only when the capsule actually reached the server addressed to
// someone — if the post failed we must not promise a delivery that isn't there.
async function showTradeResult(item, code, dest, foil = false) {
  const cv = await renderTradeCard(item, code, state.playerName, foil);
  const ov = $('#overlay');
  ov.innerHTML = `
    <div class="ov-stage share-stage">
      <img class="trade-preview" src="${cv.toDataURL()}" alt="trade capsule card">
      <div class="tr-code">${code}</div>
      <div class="r-btns">
        <button class="btn small ghost" id="tr-copy">copy code</button>
        <button class="btn small" id="tr-save">save PNG</button>
      </div>
      <p class="r-note">${dest
        ? `📬 on its way to <b>${escHTML(dest.name)}</b> — it's waiting in their Trading Post.<br>
           send them the code too if you like; either way it opens once.`
        : `send either one to a friend — they redeem it at the Market.<br>
           changed your mind? take it back at the Market's Trading Post.`}</p>
      <div class="r-btns"><button class="btn ghost" id="tr-done">Done</button></div>
    </div>`;
  $('#tr-save').addEventListener('click', () => downloadTradeCard(cv, code));
  $('#tr-copy').addEventListener('click', () => {
    navigator.clipboard?.writeText(code)
      .then(() => toast('code copied!', 'good'))
      .catch(() => toast('copy blocked — long-press the code instead', 'warn'));
  });
  $('#tr-done').addEventListener('click', closeTradeOverlay);
}

// ---------- redeem flow (Trading Post section in the Market) ----------

function tradePostHTML() {
  const rows = state.trades.map(t => {
    const it = ITEMS_BY_ID[t.itemId];
    return `<div class="tp-trade">
      ${stickerFace(it, { cls: 'tp-ic' })}
      <span class="row-name">${t.foil ? '✨ ' : ''}${it.name}<small>${t.code}</small></span>
      <button class="btn small ghost" data-tpcopy="${t.code}">copy</button>
      <button class="btn small ghost" data-tppng="${t.code}">PNG</button>
      <button class="btn small danger" data-tpcancel="${t.code}">take back</button>
    </div>`;
  }).join('');
  return `
    <h2 class="market-head">Trading Post</h2>
    <div class="trade-post">
      ${netStatusHTML()}
      ${inboxHTML()}
      ${NET.ready ? friendsHTML() : ''}
      ${matchesHTML()}
      <div class="tp-redeem">
        <input id="tp-code" placeholder="GP-XX-XXXXXX" autocomplete="off" spellcheck="false">
        <button class="btn small" id="tp-redeem">Redeem</button>
        <button class="btn small ghost" id="tp-import">Import PNG</button>
        <input type="file" id="tp-file" accept="image/*" hidden>
      </div>
      <p class="tp-tip">got a trade capsule from a friend? paste the code or import the PNG.
        to give a sticker away, tap its card in your album.</p>
      ${rows ? `<div class="tp-list"><p class="tp-tip">your outgoing capsules (unclaimed):</p>${rows}</div>` : ''}
    </div>`;
}

async function doRedeem(raw, sender) {
  // ask the server first; it knows whether this capsule is still sealed
  const claim = await netClaimTrade(String(raw || '').trim().toUpperCase());
  const said = claim === 'taken' ? 'taken' : null;
  const res = redeemTrade(raw, claim && claim !== 'taken' ? claim.sender || sender : sender, said);
  if (res.err) {
    sfx.buzz();
    toast(res.err, 'warn');
    return;
  }
  showGiftReveal(res.item, res.isNew, res.sender, { foil: res.foil });
  netCheckInbox();     // it's opened — drop it from the waiting list
}

// Poko asks for a nickname the first time you walk up to the Trading Post —
// not at launch. A name only starts mattering when you're about to trade or
// swap codes, and asking before any of that is a signup wall in disguise.
// Skippable, changeable, no validation: it's a nickname, not an account.
function maybeAskName(host) {
  if (!NET.ready || state.playerName || state.nameAsked) return;
  state.nameAsked = true;      // asked once; the *from* box is always there
  saveGame();
  const row = document.createElement('div');
  row.className = 'ask-name';
  row.innerHTML = `
    <p class="tp-tip">${SHOPKEEPER.emoji} <b>${escHTML(keeperPick('askName'))}</b></p>
    <div class="friend-add">
      <input id="ask-name-in" maxlength="14" placeholder="your name" autocomplete="off">
      <button class="btn small" id="ask-name-ok">That's me</button>
    </div>`;
  const anchor = host.querySelector('.trade-post .tp-redeem');
  if (!anchor) return;
  anchor.parentNode.insertBefore(row, anchor);
  const input = row.querySelector('#ask-name-in');
  row.querySelector('#ask-name-ok').addEventListener('click', () => {
    const name = input.value.trim().slice(0, 14);
    if (!name) { row.remove(); return; }      // left blank = fine, stay Collector
    state.playerName = name;
    saveGame();
    if (typeof netSetName === 'function') netSetName(name);
    sfx.chime();
    toast(`Nice to meet you, ${escHTML(name)}!`, 'good');
    renderMarket();
  });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') row.querySelector('#ask-name-ok').click();
  });
}

function wireTradePost(host) {
  maybeAskName(host);
  const codeInput = host.querySelector('#tp-code');
  host.querySelector('#tp-redeem').addEventListener('click', () => {
    if (codeInput.value.trim()) doRedeem(codeInput.value);
  });
  codeInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && codeInput.value.trim()) doRedeem(codeInput.value);
  });
  host.querySelector('#tp-import').addEventListener('click', () =>
    host.querySelector('#tp-file').click());
  host.querySelector('#tp-file').addEventListener('change', e => {
    const file = e.target.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const hidden = stegRead(img);
      if (hidden && hidden.c) {
        doRedeem(hidden.c, hidden.s);
        return;
      }
      // chat app squished the pixels? the filename IS the code
      const fn = (file.name || '').match(/Trade-(GP-[0-9A-Z-]+)\.png/i);
      if (fn) {
        doRedeem(fn[1]);
        return;
      }
      sfx.buzz();
      toast("couldn't read that image — type the code from the card instead", 'warn');
    };
    img.onerror = () => toast("that file didn't load as an image", 'warn');
    img.src = url;
    e.target.value = '';
  });
  host.querySelectorAll('[data-tpcopy]').forEach(b => b.addEventListener('click', () => {
    navigator.clipboard?.writeText(b.dataset.tpcopy)
      .then(() => toast('code copied!', 'good'))
      .catch(() => toast('copy blocked — write it down instead', 'warn'));
  }));
  host.querySelectorAll('[data-tppng]').forEach(b => b.addEventListener('click', async () => {
    const t = state.trades.find(x => x.code === b.dataset.tppng);
    if (!t) return;
    downloadTradeCard(await renderTradeCard(ITEMS_BY_ID[t.itemId], t.code, state.playerName, !!t.foil), t.code);
  }));
  // ASK FIRST, then restore. Retracting a capsule someone has already opened
  // used to hand the sticker back while they kept theirs — a clean duplicate.
  // The server decides, and only an unclaimed capsule comes home.
  host.querySelectorAll('[data-tpcancel]').forEach(b => b.addEventListener('click', async () => {
    const t = state.trades.find(x => x.code === b.dataset.tpcancel);
    if (!t) return;
    b.disabled = true;                      // no double-tapping the race open
    const said = await netCancelTrade(t.code);
    if (said === 'taken') {
      // It's theirs now. Drop the dead row so the button stops tempting them.
      state.trades = state.trades.filter(x => x.code !== t.code);
      saveGame();
      sfx.buzz();
      toast(`Too late — that capsule was already opened!`, 'warn');
      renderMarket();
      return;
    }
    // 'ok' (we won the race) or 'unknown' (offline capsule the server never
    // saw — honour system, exactly as before there was a server at all).
    cancelTrade(t.code);
    sfx.thunk();
    toast(`${ITEMS_BY_ID[t.itemId].name} is back in your binder`, 'good');
    renderMarket();
  }));
}

// A friend's capsule opening in your hands.
// `opts.foil` must be passed by EVERY caller that awards a sticker — this is
// the second reveal path (showReveal in main.js is the shop's), and a foil
// arriving here silently plain is exactly the bug that shipped once already.
function showGiftReveal(item, isNew, sender, opts = {}) {
  const rar = RARITIES[item.rarity];
  const col = COLLECTIONS.find(c => c.id === item.collection);
  const ringStyle = `--glow:${opts.foil ? '#ffd54f' : rar.color}`
    + (opts.foil && foilStyle(item) ? ';' + foilStyle(item) : '');
  const ov = $('#overlay');
  ov.hidden = false;
  ov.innerHTML = `
    <div class="ov-stage">
      <div class="capsule" style="--cap:${col.color};--glow:${rar.color}">
        <div class="cap-top"></div><div class="cap-bottom"></div>
      </div>
      <div class="ov-hint">tap the capsule!</div>
      <div class="result" hidden>
        <div class="r-ring${opts.foil ? ' ' + foilClass(item) : ''}" style="${ringStyle}">${stickerFace(item, { cls: 'r-icon' })}</div>
        <div class="r-name">${opts.foil ? '✨ ' : ''}${item.name}</div>
        <div class="r-chips">
          <span class="chip" style="background:${rar.color}">${rar.label}</span>
          ${opts.foil ? '<span class="chip foil-chip">FOIL!</span>' : ''}
          ${isNew ? '<span class="chip new">NEW!</span>'
                  : `<span class="chip dupe">×${ownedCount(item.id) + foilCount(item.id)} owned</span>`}
          <span class="chip lucky">${opts.chip || `🎁 from ${sender || 'a friend'}`}</span>
        </div>
        <div class="r-btns"><button class="btn" id="gift-close">Sweet!</button></div>
      </div>
    </div>`;
  const cap = ov.querySelector('.capsule');
  const hint = ov.querySelector('.ov-hint');
  const result = ov.querySelector('.result');
  if (!FX_REDUCED) {
    cap.animate([
      { transform: 'scale(0.3)', opacity: 0.3 },
      { transform: 'scale(1.1)', offset: 0.75, easing: 'ease-out' },
      { transform: 'scale(1)' },
    ], { duration: 350 });
  }
  setTimeout(() => {
    cap.classList.add('wobble', item.rarity === 'chase' ? 'glow-big' : 'glow');
    hint.classList.add('show');
  }, 360);
  let opened = false;
  const open = () => {
    if (opened) return;
    opened = true;
    hint.remove();
    cap.classList.remove('wobble');
    cap.classList.add('open');
    sfx.pop();
    setTimeout(() => {
      cap.remove();
      result.hidden = false;
      if (item.rarity === 'chase' || opts.foil) {
        sfx.fanfare();
        confetti(30);
        keeperReact(opts.foil ? 'foil' : 'chase');
      }
      else if (isNew) sfx.chime();
      fxSparkleBurst(ov.querySelector('.r-ring'),
        { count: opts.foil ? 24 : 14, color: opts.foil ? '#ffd54f' : rar.color, spread: opts.foil ? 130 : 100 });
      const closeBtn = ov.querySelector('#gift-close');
      if (!closeBtn) return;      // another reveal replaced us mid-animation
      closeBtn.addEventListener('click', () => {
        closeTradeOverlay();
        // Machines that charge coins for a sticker (the drum, the Corinth
        // board) credit the stamp card just like a capsule pull — otherwise
        // playing them would actively cost you card progress. Trades and
        // swaps deliberately don't: swaps are free, so counting them would
        // make the pull track farmable from a pile of doubles.
        if (opts.pull) noteStamp('pull');
        else renderMarket();
      });
    }, 450);
  };
  cap.addEventListener('click', open);
  setTimeout(open, 5000);
}
