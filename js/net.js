// GaPon — the online layer. Trades get verified by a server so a capsule
// can't be opened twice; friends' wants lists get shared.
//
// The single rule this file obeys: GaPon must work perfectly with none of it.
// The library is fetched asynchronously after boot, every call is wrapped, and
// every failure path falls back to the offline behaviour that already exists.
// Being on a plane, having the CDN blocked, or Supabase being down should be
// indistinguishable from before this file was written.
//
// The key below is the PUBLISHABLE key and is meant to be readable — the
// database is protected by row-level security, not by hiding this.

const SUPABASE_URL = 'https://cjgkxeknvzbscfoldnec.supabase.co';
const SUPABASE_KEY = 'sb_publishable_KpCiKRi_FuNmR-MsB-RKfw_Ox9p7IwU';
const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';

const NET = {
  ready: false,      // signed in and the player row exists
  client: null,
  authId: null,      // THIS device's anonymous login
  playerId: null,    // who that login plays as — usually the same, not always
  friendCode: null,
};

function loadSupabaseLib() {
  return new Promise(resolve => {
    if (window.supabase) return resolve(window.supabase);
    const tag = document.createElement('script');
    tag.src = SUPABASE_CDN;
    tag.async = true;
    tag.onload = () => resolve(window.supabase || null);
    tag.onerror = () => resolve(null);     // offline / blocked — stay local
    document.head.appendChild(tag);
    setTimeout(() => resolve(window.supabase || null), 8000);   // never hang
  });
}

// Called after boot. Nothing waits on it.
async function netInit() {
  try {
    const lib = await loadSupabaseLib();
    if (!lib) return;
    NET.client = lib.createClient(SUPABASE_URL, SUPABASE_KEY, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
    let { data: { session } } = await NET.client.auth.getSession();
    if (!session) {
      const { data, error } = await NET.client.auth.signInAnonymously();
      if (error) return;
      session = data.session;
    }
    if (!session?.user) return;
    NET.authId = session.user.id;
    NET.playerId = await netResolvePlayer(NET.authId);
    await netEnsurePlayer();
    NET.ready = true;
    await netSyncWants();                      // push any wants set while offline
    await netPruneClaimedTrades();             // forget capsules already opened
    await netCheckInbox({ announce: true });    // "a capsule is waiting for you"
    netCheckMatches({ announce: true });        // "you're holding 3 they need"
    netRefreshUI();
  } catch (e) {
    NET.ready = false;      // any surprise at all: stay offline, stay working
  }
}

// Who this device plays as.
//
// It is NOT necessarily this device's login. A device that has adopted a save
// is bound to an existing player, and every query in this file keys off
// NET.playerId — so resolving it correctly here is the whole account model as
// far as the client is concerned.
//
// Falls back to the login id, which is what an unmapped device resolves to
// anyway. That keeps the rule this file has always obeyed: a surprise leaves
// the game working, it doesn't break it.
async function netResolvePlayer(fallbackId) {
  try {
    const { data, error } = await NET.client.rpc('current_player_id');
    if (!error && data) return data;
  } catch (e) {}
  return fallbackId;
}

// One row per player: a nickname and a friend code. Nothing else about them
// is ever stored server-side.
async function netEnsurePlayer() {
  const { data } = await NET.client
    .from('players').select('friend_code, display_name').eq('id', NET.playerId).maybeSingle();
  if (data) {
    NET.friendCode = data.friend_code;
    if (state.playerName && state.playerName !== data.display_name) await netSetName(state.playerName);
    else if (!state.playerName && data.display_name && data.display_name !== 'Collector') {
      state.playerName = data.display_name;
      saveGame();
    }
    // Touch the row on every boot so `updated_at` means LAST SEEN. It's the
    // only retention signal that exists — nothing else about a player is
    // stored server-side, deliberately — and it costs one write per launch.
    //   select count(*) from players where updated_at > now() - interval '7 days';
    try {
      await NET.client.from('players')
        .update({ updated_at: new Date().toISOString() }).eq('id', NET.playerId);
    } catch (e) {}
    return;
  }
  const { data: made } = await NET.client
    .from('players')
    .insert({ id: NET.playerId, display_name: state.playerName || 'Collector' })
    .select('friend_code').single();
  if (made) NET.friendCode = made.friend_code;
}

async function netSetName(name) {
  if (!NET.client || !NET.playerId) return;
  try {
    await NET.client.from('players')
      .update({ display_name: name.slice(0, 14), updated_at: new Date().toISOString() })
      .eq('id', NET.playerId);
  } catch (e) {}
}

// Display names are typed by other players, so they never go into markup raw.
function escHTML(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- trades ----------

// Register a capsule so it can be verified. Failing here is not fatal: the
// code still works by the honour system, exactly as it did before.
// `toId` addresses it to a friend so it appears in their Trading Post — see
// sql/addressed-capsules.sql. Addressing is delivery, not permission: the
// code still works for whoever holds it.
async function netPostTrade(code, itemId, toId, foil = false) {
  if (!NET.ready) return false;
  // The bare row is what every version of the schema has had. Anything added
  // since goes in `extra`, so an unmigrated database degrades to a plain but
  // still server-verified capsule rather than to no registration at all.
  const row = {
    code, item_id: itemId, from_id: NET.playerId,
    from_name: (state.playerName || 'a friend').slice(0, 14),
  };
  const extra = { to_id: toId || null, foil };
  try {
    const { error } = await NET.client.from('trades').insert({ ...row, ...extra });
    if (!error) return true;
    const { error: e2 } = await NET.client.from('trades').insert(row);
    return !e2;
  } catch (e) { return false; }
}

// Has this code been opened? true / false / null (no such code), or
// undefined if we couldn't ask at all.
//
// Goes through an RPC rather than reading `trades` directly, because that
// table's SELECT policy is now "rows you are party to". The open read it used
// to rely on also handed anyone with the publishable key every outstanding
// capsule code in the game — see sql/02-trade-status.sql.
async function netTradeStatus(code) {
  try {
    const { data, error } = await NET.client.rpc('trade_status', { p_code: code });
    if (error) return undefined;
    return data;                    // true | false | null
  } catch (e) { return undefined; }
}

// Returns { item, sender } on success, 'taken' if someone already opened it,
// or null if the server doesn't know this code (so we fall back to local).
async function netClaimTrade(code) {
  if (!NET.ready) return null;
  try {
    const { data, error } = await NET.client.rpc('claim_trade', { p_code: code });
    if (!error && data && data.length) {
      return { item: ITEMS_BY_ID[data[0].item_id], sender: data[0].from_name };
    }
    // Nothing came back. Three reasons are possible and they are NOT the same:
    //   • someone genuinely claimed it  → block
    //   • it's your own capsule (the function refuses self-claims) → let the
    //     local path take it back, as it always has
    //   • the server never saw this code → let the local honour system run
    // Only the first should ever stop a redemption.
    return (await netTradeStatus(code)) === true ? 'taken' : null;
  } catch (e) { return null; }
}

// Retract a capsule — but ONLY if nobody has opened it.
//
// This is the same atomic trick as claiming: a conditional DELETE the database
// resolves in one statement, so a take-back and a redemption racing each other
// cannot both win. Without it, retracting an already-opened capsule duplicated
// the sticker — the giver got it back while the receiver kept theirs. (Found
// by David and Chris independently, within a day of each other.)
//
// Returns 'ok' (retracted), 'taken' (someone opened it — hands off), or
// 'unknown' (the server never saw this code, so fall back to the honour system
// exactly as an offline capsule always has).
async function netCancelTrade(code) {
  if (!NET.ready) return 'unknown';
  try {
    const { data } = await NET.client
      .from('trades').delete().eq('code', code).is('claimed_by', null).select('code');
    if (data && data.length) return 'ok';
    // The conditional delete matched nothing. Either someone opened it, or the
    // server never had it. Anything else can't happen from your own outstanding
    // list, so it falls through to the honour system exactly as before.
    return (await netTradeStatus(code)) === true ? 'taken' : 'unknown';
  } catch (e) { return 'unknown'; }
}

// At boot, drop outstanding capsules that have since been opened, so the
// Trading Post lists only what is genuinely still yours to retract.
async function netPruneClaimedTrades() {
  if (!NET.ready || !state.trades || !state.trades.length) return 0;
  try {
    const { data } = await NET.client
      .from('trades').select('code')
      .eq('from_id', NET.playerId).not('claimed_by', 'is', null);
    if (!data || !data.length) return 0;
    const opened = new Set(data.map(r => r.code));
    const before = state.trades.length;
    state.trades = state.trades.filter(t => !opened.has(t.code));
    const gone = before - state.trades.length;
    if (gone) saveGame();
    return gone;
  } catch (e) { return 0; }
}

// ---------- cloud saves ----------
//
// The point of this is NOT "backups on a server" — the save was always
// backup-able. It's that moving a collection between a PC and a phone meant
// carrying a 3,000-character string. This turns that into twelve characters.
//
// The recovery code does two jobs: it finds the save, and it decrypts it.
// That's why encrypting costs the player nothing — the code was already
// mandatory. See js/crypt.js.
//
// The code is cached OUTSIDE the save on purpose. It must survive a restore
// that replaces everything, and it must not travel inside a payload that gets
// pasted into chat apps.
const RECOVERY_KEY = 'gapon-recovery';

// The updated_at of the copy we believe is sitting on the server. Cached
// beside the code and outside the save for the same reason — it has to survive
// a restore that replaces everything. An empty stamp means "no idea what's up
// there", which is deliberately NOT treated as permission to overwrite.
const CLOUD_STAMP_KEY = 'gapon-cloud-stamp';

function storedRecoveryCode() {
  try { return localStorage.getItem(RECOVERY_KEY) || ''; } catch (e) { return ''; }
}

function storedCloudStamp() {
  try { return localStorage.getItem(CLOUD_STAMP_KEY) || ''; } catch (e) { return ''; }
}

function rememberCloudStamp(iso) {
  try { localStorage.setItem(CLOUD_STAMP_KEY, iso || ''); } catch (e) {}
}

function rememberRecoveryCode(code) {
  try { localStorage.setItem(RECOVERY_KEY, cleanRecoveryCode(code)); } catch (e) {}
}

// Upload. Returns { code, updatedAt }, { conflict, updatedAt }, or { err }.
//
// The write is conditional on updated_at: it lands only if the row is still
// the one this device last saw. That is the whole defence against "last upload
// wins" — play on the tablet, then on the phone, and the tablet's next upload
// is refused rather than quietly erasing the phone's afternoon.
//
// `force` drops the condition. Nothing calls it without asking the player
// first, in so many words, which copy they want to keep.
async function netUploadSave({ force = false } = {}) {
  if (!NET.ready) return { err: "you're offline — GaPon can't reach the server right now" };
  if (!cryptoReady()) {
    return { err: "this browser can't encrypt, so online saving isn't available here" };
  }
  try {
    // Get (or mint) the row first, so the server decides the code.
    let { data: row } = await NET.client
      .from('saves').select('recovery_code, updated_at')
      .eq('player_id', NET.playerId).maybeSingle();
    if (!row) {
      const made = await NET.client
        .from('saves')
        .insert({ player_id: NET.playerId, payload: 'x' })
        .select('recovery_code, updated_at').single();
      if (made.error) return { err: "couldn't start an online save just now" };
      row = made.data;
      rememberCloudStamp(row.updated_at);   // we just made it, so it is ours
    }
    const code = row.recovery_code;
    const stamp = storedCloudStamp();
    // A stamp we hold that doesn't match the row means somebody else has been
    // here. Stop before spending a second on encryption.
    if (!force && stamp && stamp !== row.updated_at) {
      return { conflict: true, updatedAt: row.updated_at, code };
    }
    const payload = await encryptSave(JSON.stringify(state), code);
    if (!payload) return { err: 'encryption failed, so nothing was uploaded' };
    let q = NET.client.from('saves').update({ payload }).eq('player_id', NET.playerId);
    // No stamp means this device opted in before conditional writes existed.
    // It gets the old unconditional behaviour rather than being locked out.
    if (!force && stamp) q = q.eq('updated_at', stamp);
    const { data: done, error } = await q.select('updated_at');
    if (error) return { err: "couldn't upload just now — try again in a moment" };
    // Zero rows back = another device wrote in the gap between read and write.
    if (!done || !done.length) return { conflict: true, updatedAt: row.updated_at, code };
    rememberRecoveryCode(code);
    rememberCloudStamp(done[0].updated_at);
    return { code, updatedAt: done[0].updated_at };
  } catch (e) {
    return { err: "couldn't reach the server" };
  }
}

// Bind this device to whoever owns that code, and bring the save back.
// Returns { save, updatedAt, playerId } or { err }.
//
// One path for both cases on purpose. A brand-new phone adopts a player it has
// never been; the PC that made the save "adopts" itself, which is a harmless
// self-mapping. Two branches here would be two chances to get identity wrong.
async function netAdoptSave(code) {
  if (!NET.ready) return { err: "you're offline — GaPon can't reach the server right now" };
  if (!cryptoReady()) return { err: "this browser can't decrypt, so online saves aren't available here" };
  const clean = cleanRecoveryCode(code);
  try {
    const { data, error } = await NET.client.rpc('adopt_device', { p_code: clean });
    if (error) return { err: "couldn't reach the server just now" };
    const row = data && data[0];
    if (!row) return { err: "no save found for that code — check it and try again" };
    const plain = await decryptSave(row.payload, clean);
    // The code both finds the save and opens it, so a decrypt failure here
    // means the row was written by a different code — corruption, not a typo.
    if (!plain) return { err: "that save wouldn't open — the code may be damaged" };
    // Deliberately does NOT stamp the cloud copy here. Looking at a save is not
    // taking it: the player still gets a confirm, and backing out of that must
    // not leave this device believing it holds the server's copy — its next
    // auto-upload would overwrite the very save they just declined.
    return { save: plain, updatedAt: row.updated_at, playerId: row.player_id };
  } catch (e) {
    return { err: "couldn't reach the server" };
  }
}

// ---------- keeping the online save fresh ----------
//
// Opting in stays manual. Staying current does not: waiting to be asked a
// second time is how a device ends up holding a save three weeks older than
// the collection sitting on it.
//
// Two rules keep this from being a background process that eats data and
// battery. It only runs when the save actually changed, and it never runs on a
// schedule — a tab left parked open for a week uploads nothing at all.

const CLOUD_QUIET = 20000;    // ms of quiet after a change before uploading
let cloudDirty = false;
let cloudBusy = false;
let cloudTimer = null;
let cloudStuck = '';          // set when the server refused; blocks further tries

function netCloudStuck() { return cloudStuck; }
function netClearStuck() { cloudStuck = ''; }

// Two separate questions, and conflating them loses changes. Opting in is a
// fact about the player and is known offline; being able to upload is a fact
// about right now.
function cloudOptedIn() { return !!storedRecoveryCode(); }

function cloudSyncOn() {
  return cloudOptedIn() && NET.ready && cryptoReady() && !cloudStuck;
}

// Called from saveGame(), which fires on very nearly every action, so this has
// to stay free: set a flag, restart a timer, do no work.
//
// Gated on opt-in, NOT on being online — a pull made on a train still has to
// be waiting to go up when the signal comes back. A flush that can't reach the
// server leaves the flag set, and the player's next action re-arms the timer.
function netMarkDirty() {
  if (!cloudOptedIn() || cloudStuck) return;
  cloudDirty = true;
  clearTimeout(cloudTimer);
  cloudTimer = setTimeout(netFlushCloud, CLOUD_QUIET);
}

// A receipt, not a status light. It appears when an upload lands and clears
// itself. Anything permanent in the header would be one more thing to read
// every time you look at your coins.
let blipTimer = null;

function cloudBlip(kind) {
  const el = document.querySelector('#save-blip');
  if (!el) return;
  clearTimeout(blipTimer);
  if (kind === 'off') { el.hidden = true; return; }
  el.classList.toggle('working', kind === 'saving');
  el.classList.toggle('bad', kind === 'bad');
  el.querySelector('.msr').textContent =
    kind === 'saving' ? 'cloud_upload' : kind === 'bad' ? 'cloud_off' : 'cloud_done';
  el.hidden = false;
  if (kind === 'saving') return;          // stays put until the upload resolves
  if (!FX_REDUCED) el.animate(
    [{ transform: 'scale(0.55)', opacity: 0 }, { transform: 'scale(1)', opacity: 1 }],
    { duration: 260, easing: 'cubic-bezier(.2,1.4,.4,1)' });
  // A timer, never animation.onfinish. A tab backgrounded mid-fade would
  // strand this on screen forever — same rule as the toasts and the bubble.
  blipTimer = setTimeout(() => { el.hidden = true; }, kind === 'bad' ? 4200 : 2200);
}

async function netFlushCloud() {
  clearTimeout(cloudTimer);
  if (!cloudDirty || cloudBusy || !cloudSyncOn()) return;
  cloudBusy = true;
  cloudDirty = false;
  cloudBlip('saving');
  const res = await netUploadSave();
  cloudBusy = false;
  if (res.conflict) {
    cloudBlip('bad');
    // Refusing IS the feature. Which copy survives is the player's call, and
    // the Backup screen is where they get to make it.
    cloudStuck = res.updatedAt || 'unknown';
    toast('Your online save changed on another device — open Backup to sort it out.',
          'warn', 6000);
    return;
  }
  // A failed upload isn't worth a message — being offline is not news, and a
  // warning every twenty seconds of play would be. Put the flag back, clear
  // the mark, and it rides along with the next thing the player does.
  if (res.err) { cloudDirty = true; cloudBlip('off'); return; }
  cloudBlip('ok');
  updateCloudLine();
}

// ---------- inbox ----------
// Capsules a friend addressed to you, waiting to be opened.
//
// This is the one thing the game tells the RECEIVING player about, and it
// doesn't break the "notify the giver, never the asker" rule: nothing here is
// a request. The gift already happened — the sticker has already left the
// giver's binder. Showing it is delivery, not a nudge.

let netInbox = [];
let netLastCheck = 0;
const netAnnounced = new Set();   // codes Poko has already mentioned this session

async function netCheckInbox({ announce = false } = {}) {
  if (!NET.ready) { netInbox = []; return 0; }
  netLastCheck = Date.now();      // stamped here so every route counts as a check
  try {
    const { data, error } = await NET.client
      .from('trades').select('code, item_id, from_name, foil')
      .eq('to_id', NET.playerId).is('claimed_by', null);
    if (error) { netInbox = []; return 0; }   // column missing = not migrated
    netInbox = (data || [])
      .filter(r => ITEMS_BY_ID[r.item_id] && !state.redeemed.includes(r.code))
      // `foil` here only decorates the row — what you actually receive is
      // decided by parsing the code at redeem time, never by this flag.
      .map(r => ({ code: r.code, item: ITEMS_BY_ID[r.item_id], from: r.from_name, foil: !!r.foil }));
  } catch (e) { netInbox = []; return 0; }
  // Only ever announce capsules Poko hasn't mentioned yet — coming back to a
  // tab that's been open for days must not re-nag about the same gift.
  if (announce) {
    const fresh = netInbox.filter(c => !netAnnounced.has(c.code));
    if (fresh.length) {
      const who = [...new Set(fresh.map(c => c.from).filter(Boolean))];
      keeperSay(fresh.length === 1
        ? `A${fresh[0].foil ? ' ✨foil' : ''} capsule from ${who[0] || 'a friend'} is waiting for you!`
        : `${fresh.length} capsules are waiting for you!`, 4200, 'gift');
    }
  }
  for (const c of netInbox) netAnnounced.add(c.code);
  updateInboxBadge();
  const host = document.querySelector('#tab-market');
  if (host && !host.hidden) renderMarket();
  return netInbox.length;
}

// The Market tab looks identical whether it's empty or holding three gifts.
// A count on the tab is the whole notification: no polling, no timers — it
// rides on the inbox we already fetch at launch and after every redeem.
function updateInboxBadge() {
  const btn = document.querySelector('.tabs button[data-tab="market"]');
  if (!btn) return;
  let dot = btn.querySelector('.tab-badge');
  if (!netInbox.length) { if (dot) dot.remove(); return; }
  if (!dot) {
    dot = document.createElement('span');
    dot.className = 'tab-badge';
    btn.appendChild(dot);
    if (!FX_REDUCED) dot.animate([{ transform: 'scale(0)' }, { transform: 'scale(1.25)', offset: 0.7 },
      { transform: 'scale(1)' }], { duration: 320, easing: 'ease-out' });
  }
  dot.textContent = netInbox.length;
}

// People leave GaPon parked in a browser tab for days and refresh it to play,
// so netInit covers most arrivals. This covers the rest: coming back to the
// tab, and opening the Market. Rate-limited, because "check when the player
// does something" must never turn into a poll running in a forgotten tab.
const NET_CHECK_GAP = 45000;

function netMaybeCheck() {
  if (!NET.ready || Date.now() - netLastCheck < NET_CHECK_GAP) return;
  netLastCheck = Date.now();
  netCheckInbox({ announce: true });
  netCheckMatches();
}

// The explicit button. Always checks, and always says something back — a
// silent refresh looks identical to a broken one.
async function netRefreshNow() {
  if (!NET.ready) return;
  netLastCheck = Date.now();
  const n = await netCheckInbox();
  netCheckMatches();
  sfx.tick();
  toast(n ? `${n} capsule${n > 1 ? 's' : ''} waiting!` : 'nothing new right now',
        n ? 'good' : '');
}

// Leaving the tab is the best moment to catch a pending upload: the browser
// may freeze this page for hours, and a phone may never come back to it at
// all. This is a best effort, not a guarantee — encryption is async, so a tab
// closed outright can still take an unsaved change with it. The quiet timer is
// what actually does the work; this just shortens the window.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) netFlushCloud();
  else netMaybeCheck();
});

function inboxHTML() {
  if (!NET.ready || !netInbox.length) return '';
  return `
    <div class="inbox">
      <p class="tp-tip"><b>🎁 Waiting for you:</b></p>
      ${netInbox.map(c => `
        <div class="tp-trade inbox-row">
          ${stickerFace(c.item, { cls: 'tp-ic' })}
          <span class="row-name">${c.foil ? '✨ ' : ''}${escHTML(c.item.name)}<small>from ${escHTML(c.from || 'a friend')}</small></span>
          <button class="btn small" data-inbox="${escHTML(c.code)}">Open</button>
        </div>`).join('')}
    </div>`;
}

function wireInbox(host) {
  host.querySelectorAll('[data-inbox]').forEach(b =>
    b.addEventListener('click', () => doRedeem(b.dataset.inbox)));
}

// ---------- ui ----------

// Your friend code gates every social feature in the game — nobody can trade
// with you until they have it. It used to render as a plain <b> inside a dim
// 0.8rem sentence with no way to copy it, and both Chris and Michelle said it
// was easy to miss. Now it's the first thing in the Trading Post, it's big
// enough to read across a room, and tapping it copies.
function netStatusHTML() {
  if (!NET.ready) {
    return `<p class="tp-tip net-off">⚪ offline — trading still works by code,
      just without server checks.</p>`;
  }
  const code = NET.friendCode || '······';
  return `
    <div class="fc-card">
      <div class="fc-head">
        <span class="fc-label">your friend code</span>
        <button class="net-refresh" id="net-refresh" title="check for new capsules">↻</button>
      </div>
      <div class="fc-row">
        <button class="fc-code" id="fc-copy" title="tap to copy">${escHTML(code)}</button>
        <button class="btn small" id="fc-share">Share</button>
      </div>
      <p class="fc-note">give this to a friend so they can send you capsules.</p>
    </div>`;
}

// The invite carries the code AND the link, in one string. Deliberately not
// using the `url` field: some share targets take the url and drop the text,
// which would send a friend the game without the code — the one thing the
// message exists to deliver.
function friendInviteText() {
  const url = location.href.split('#')[0].split('?')[0];
  return `Add me on GaPon! My friend code is ${NET.friendCode} — ${url}`;
}

function wireNetStatus(host) {
  const refresh = host.querySelector('#net-refresh');
  if (refresh) refresh.addEventListener('click', netRefreshNow);

  const codeBtn = host.querySelector('#fc-copy');
  if (codeBtn) codeBtn.addEventListener('click', () => {
    // just the code — this is the one you paste into a friend-code box
    navigator.clipboard?.writeText(NET.friendCode || '')
      .then(() => { sfx.tick(); toast('Friend code copied!', 'good'); })
      .catch(() => toast('Copy blocked — read it out instead', 'warn'));
  });

  const shareBtn = host.querySelector('#fc-share');
  if (shareBtn) shareBtn.addEventListener('click', async () => {
    const text = friendInviteText();
    if (navigator.share) {
      try { await navigator.share({ title: 'GaPon', text }); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }   // they cancelled
    }
    // no share sheet (desktop, mostly) — the clipboard does the same job
    navigator.clipboard?.writeText(text)
      .then(() => toast('Invite copied — paste it to a friend', 'good', 4000))
      .catch(() => toast('Copy blocked — read the code out instead', 'warn'));
  });
}

function netRefreshUI() {
  const host = document.querySelector('#tab-market');
  if (host && !host.hidden) renderMarket();
}

// ---------- friends ----------
// The friend list itself lives in the save, not on the server: it's just a
// list of codes you were given. Nothing server-side needs to know who knows
// whom, which keeps the schema small and means no friendship table to secure.

function friendList() {
  if (!state.friends) state.friends = [];
  return state.friends;
}

// Look a code up and remember them. Returns { ok } or { err }.
async function netAddFriend(rawCode) {
  const code = String(rawCode || '').trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) return { err: 'friend codes are 6 letters and numbers' };
  if (code === NET.friendCode) return { err: "that's your own code!" };
  if (friendList().some(f => f.code === code)) return { err: 'already on your list' };
  if (!NET.ready) return { err: 'you need to be online to add a friend' };
  try {
    const { data } = await NET.client
      .from('players').select('id, display_name').eq('friend_code', code).maybeSingle();
    if (!data) return { err: "no one has that code — check the spelling" };
    friendList().push({ code, id: data.id, name: data.display_name });
    saveGame();
    return { ok: true, name: data.display_name };
  } catch (e) {
    return { err: "couldn't reach the server just now" };
  }
}

function netRemoveFriend(code) {
  state.friends = friendList().filter(f => f.code !== code);
  saveGame();
}

function friendsHTML() {
  const fs = friendList();
  return `
    <div class="friends">
      <div class="friends-row">
        ${fs.length
          ? fs.map(f => `<button class="friend-chip" data-friend="${escHTML(f.code)}"
              title="see what ${escHTML(f.name)} is hunting">${escHTML(f.name)}</button>`).join('')
          : '<span class="tp-tip">no friends added yet — swap codes in your group chat</span>'}
      </div>
      <div class="friend-add">
        <input id="friend-code-in" placeholder="friend code" maxlength="6"
               autocomplete="off" spellcheck="false">
        <button class="btn small ghost" id="friend-add-btn">Add friend</button>
      </div>
    </div>`;
}

function wireFriends(host) {
  const input = host.querySelector('#friend-code-in');
  const add = async () => {
    const res = await netAddFriend(input.value);
    if (res.err) { sfx.buzz(); toast(res.err, 'warn'); return; }
    sfx.chime();
    toast(`${res.name} added!`, 'good');
    renderMarket();
  };
  host.querySelector('#friend-add-btn').addEventListener('click', add);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
  // The × used to live on the chip, a few pixels from the name. Once tapping
  // the name DOES something, that's a mis-tap that unfriends someone — the
  // costly direction to get wrong, and not undoable without their code. So the
  // chip has exactly one action now and removal lives inside the panel.
  host.querySelectorAll('[data-friend]').forEach(b =>
    b.addEventListener('click', () => {
      const f = friendList().find(x => x.code === b.dataset.friend);
      if (f) openFriendPanel(f);
    }));
}

// ---------- one friend, up close ----------
//
// Tapping a friend chip opens this instead of a whole new tab or room. It is
// the friends list Chris and Michelle asked for, just shaped as chip-plus-
// detail rather than a scrolling list.
//
// It shows their FULL wants list, not only the ones you can act on. That's
// deliberate and it doesn't break "notify the giver, never the asker": this is
// PULL, not push. Nobody is asked for anything — you went looking, perhaps
// because you have spare coins and fancy fishing for a second copy of
// something a friend needs.

// Their wants and when they last played, in one trip.
async function netFriendDetail(friend) {
  if (!NET.ready || !friend) return null;
  try {
    const [wantsRes, whoRes] = await Promise.all([
      NET.client.from('wants').select('item_id').eq('player_id', friend.id),
      NET.client.from('players').select('display_name, updated_at').eq('id', friend.id).maybeSingle(),
    ]);
    const items = (wantsRes.data || [])
      .map(r => ITEMS_BY_ID[r.item_id])
      .filter(Boolean)
      .sort((a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity));
    return { items, seen: whoRes.data && whoRes.data.updated_at, name: whoRes.data && whoRes.data.display_name };
  } catch (e) { return null; }
}

function lastSeenText(iso) {
  if (!iso) return '';
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (!(days >= 0)) return '';
  if (days === 0) return 'played today';
  if (days === 1) return 'played yesterday';
  if (days < 7) return `played ${days} days ago`;
  if (days < 14) return 'played last week';
  return `last played ${Math.floor(days / 7)} weeks ago`;
}

function openFriendPanel(friend) {
  const ov = $('#overlay');
  ov.hidden = false;
  ov.innerHTML = `
    <div class="ov-stage">
      <div class="fp-note">
        <i class="fp-pin"></i>
        <div class="fp-head">
          <span class="fp-name">${escHTML(friend.name)}</span>
          <span class="fp-seen" id="fp-seen">…</span>
        </div>
        <button class="fp-code" id="fp-code" title="tap to copy">${escHTML(friend.code)}</button>
        <div class="fp-hunting">
          <span class="fp-label">hunting</span>
          <div class="fp-wants" id="fp-wants"><span class="fp-dim">asking…</span></div>
        </div>
        <div class="fp-acts">
          <button class="btn ghost small" id="fp-remove">Remove friend</button>
          <button class="btn small" id="fp-close">Done</button>
        </div>
      </div>
    </div>`;

  const close = () => { ov.hidden = true; ov.innerHTML = ''; };
  ov.querySelector('#fp-close').addEventListener('click', close);
  ov.querySelector('#fp-code').addEventListener('click', () => {
    navigator.clipboard?.writeText(friend.code)
      .then(() => { sfx.tick(); toast(`${escHTML(friend.name)}'s code copied`, 'good'); })
      .catch(() => toast('Copy blocked — read it out instead', 'warn'));
  });
  ov.querySelector('#fp-remove').addEventListener('click', () => {
    if (!confirm(`Remove ${friend.name} from your friends list?\n\nYou'll need their code again to add them back.`)) return;
    netRemoveFriend(friend.code);
    close();
    renderMarket();
    toast(`${escHTML(friend.name)} removed`, 'warn');
  });

  netFriendDetail(friend).then(detail => {
    const seenEl = ov.querySelector('#fp-seen');
    const wantsEl = ov.querySelector('#fp-wants');
    if (!seenEl || !wantsEl) return;          // panel closed while we waited
    seenEl.textContent = (detail && lastSeenText(detail.seen)) || '';
    const items = (detail && detail.items) || [];
    if (!items.length) {
      wantsEl.innerHTML = `<span class="fp-dim">nothing starred right now</span>`;
      return;
    }
    // A want you hold a SPARE of is actionable. One you hold a single copy of
    // is shown plainly and never highlighted — the spares rule exists so that
    // nobody gets nudged toward giving away the chase they just chased.
    wantsEl.innerHTML = items.map(it => {
      const spare = ownedCount(it.id) > 1;
      return `<button class="fp-want${spare ? ' can' : ''}" ${spare ? `data-give="${it.id}"` : 'disabled'}
                style="--rar:${RARITIES[it.rarity].color}">
        ${stickerFace(it, { cls: 'fp-ic' })}<span>${escHTML(it.name)}</span>
        ${spare ? '<i class="fp-tick">send</i>' : ''}
      </button>`;
    }).join('');
    wantsEl.querySelectorAll('[data-give]').forEach(b =>
      b.addEventListener('click', () => {
        const it = ITEMS_BY_ID[b.dataset.give];
        if (it) openFriendGive(it, friend);
      }));
  });
}

// straight into the give flow, already addressed to them
function openFriendGive(item, friend) {
  const ov = $('#overlay');
  ov.hidden = true;
  ov.innerHTML = '';
  openShareDialog(item, friend);
}

// ---------- wants ----------
// Your wants list is the ONLY collection data that leaves the device. What
// you own never does: matching happens locally, against your own inventory.

function toggleWant(itemId) {
  if (!state.wants) state.wants = [];
  const i = state.wants.indexOf(itemId);
  if (i >= 0) {
    state.wants.splice(i, 1);
  } else {
    if (state.wants.length >= WANTS_MAX) {
      sfx.buzz();
      toast(`Your wants list is full (${WANTS_MAX}) — untick something first.`, 'warn');
      return;
    }
    state.wants.push(itemId);
    sfx.tick();
  }
  saveGame();
  renderBinderPage();
  netSyncWants();
}

async function netSyncWants() {
  if (!NET.ready) return;
  pruneWants();          // never publish a want you've already filled
  try {
    await NET.client.from('wants').delete().eq('player_id', NET.playerId);
    const rows = (state.wants || []).map(id => ({ player_id: NET.playerId, item_id: id }));
    if (rows.length) await NET.client.from('wants').insert(rows);
  } catch (e) {}
}

// What are my friends hunting? Returns [{ friend, items:[item] }] where I
// hold a SPARE — a lone copy is never offered up, so nobody gets asked for
// the chase they just spent a week chasing.
async function netFriendMatches() {
  if (!NET.ready) return [];
  const friends = friendList();
  if (!friends.length) return [];
  try {
    const { data } = await NET.client
      .from('wants').select('player_id, item_id').in('player_id', friends.map(f => f.id));
    if (!data) return [];
    const out = [];
    for (const f of friends) {
      const items = data
        .filter(r => r.player_id === f.id && ownedCount(r.item_id) > 1)
        .map(r => ITEMS_BY_ID[r.item_id])
        .filter(Boolean);
      if (items.length) out.push({ friend: f, items });
    }
    return out;
  } catch (e) { return []; }
}

let netMatches = [];

async function netCheckMatches({ announce = false } = {}) {
  netMatches = await netFriendMatches();
  const total = netMatches.reduce((n, m) => n + m.items.length, 0);
  if (announce && total) {
    keeperSay(`You're holding ${total} spare${total > 1 ? 's' : ''} your friends are after!`, 4200, 'wants');
  }
  const host = document.querySelector('#tab-market');
  if (host && !host.hidden) renderMarket();
  return total;
}

function matchesHTML() {
  if (!NET.ready || !netMatches.length) return '';
  return `
    <div class="matches">
      <p class="tp-tip"><b>Your friends are hunting these — and you have spares:</b></p>
      ${netMatches.map(m => `
        <div class="match-row">
          <span class="match-who">${escHTML(m.friend.name)}</span>
          ${m.items.map(it => `
            <button class="match-item" data-give="${it.id}" data-to="${escHTML(m.friend.code)}"
                    style="--rar:${RARITIES[it.rarity].color}">
              ${stickerFace(it, { cls: 'match-ic' })}<span>${escHTML(it.name)}</span>
            </button>`).join('')}
        </div>`).join('')}
    </div>`;
}

function wireMatches(host) {
  host.querySelectorAll('[data-give]').forEach(b =>
    b.addEventListener('click', () => {
      const it = ITEMS_BY_ID[b.dataset.give];
      // straight into the existing give flow, pre-addressed to the friend
      // whose wants list this chip came from
      if (it) openShareDialog(it, friendList().find(f => f.code === b.dataset.to));
    }));
}
