// GaPon — UI wiring: tabs, reveal flow, album, market. The shop scene and
// pull ritual live in shop.js.

const $ = sel => document.querySelector(sel);

let marketShowAll = false;   // Market lists spares by default (see renderMarket)

// ---------- helpers ----------

function fmtCoins(n) { return n.toLocaleString(); }

// `ms` is how long it stays up. It used to be hard-coded at 2600, which meant
// Poko's longer lines were unreadable whenever he fell back to a toast — he
// was asking for 6000 and being ignored.
function toast(msg, cls = '', ms = 2600) {
  const el = document.createElement('div');
  el.className = 'toast ' + cls;
  el.innerHTML = msg;
  $('#toasts').appendChild(el);
  el.animate(
    [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }],
    { duration: 200, easing: 'ease-out' });
  setTimeout(() => {
    el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
    // Removed on a timer, never on the animation's onfinish. Same rule the
    // speech bubble follows: an animation that never finishes (backgrounded
    // tab, reduced motion, a browser quirk) must not be able to strand this
    // on screen forever.
    setTimeout(() => el.remove(), 320);
  }, ms);
}

function coinIcon() { return '<span class="msr coin-ic">toll</span>'; }

function updateHeader() {
  const coinEl = $('#coin-count');
  const first = coinEl.dataset.fxVal === undefined;
  const prev = parseInt(coinEl.dataset.fxVal ?? '0', 10) || 0;
  if (!first && state.coins > prev) {
    fxFloat('+' + fmtCoins(state.coins - prev), coinEl.parentElement);
  }
  fxCountTo(coinEl, state.coins);
  $('#streak-count').textContent = state.streak;
}

function updateFooter() {
  $('#stats').textContent =
    `Day ${state.days.length || 1} · ${state.totalPulls} pulls · save lives in this browser`;
}

function confetti(count = 26) {
  const host = document.body;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('div');
    p.className = 'confetti';
    p.style.background = CAPSULE_COLORS[i % CAPSULE_COLORS.length];
    p.style.left = (10 + Math.random() * 80) + 'vw';
    host.appendChild(p);
    const fall = 60 + Math.random() * 30;
    p.animate([
      { transform: `translateY(-5vh) rotate(0deg)`, opacity: 1 },
      { transform: `translateY(${fall}vh) rotate(${360 + Math.random() * 360}deg)`, opacity: 0 },
    ], { duration: 1400 + Math.random() * 1200, easing: 'ease-in', delay: Math.random() * 300 })
      .onfinish = () => p.remove();
  }
}

// ---------- tabs ----------

function showTab(name) {
  // A focused machine is physically lifted out of the shop row (a ghost holds
  // its slot). Leaving the tab without putting it back strands it in the
  // hidden focus layer — the machine simply vanishes from the shop.
  if (typeof focusState !== 'undefined' && focusState.card) shopUnfocus(true);
  document.querySelectorAll('.tabs button').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === name));
  for (const t of ['machines', 'album', 'market', 'arcade', 'wall']) {
    $('#tab-' + t).hidden = (t !== name);
  }
  fxTabIn($('#tab-' + name));
  if (name === 'album') {
    renderAlbum();
    // Tutorial BEFORE the stamp: both may want to speak on a first visit, and
    // learning what the binder is for matters more than being told you earned
    // a stamp in it. They queue either way now, this just sets the order.
    maybeExplainWants();
    noteStamp('binder');       // a stamp once a day just for stopping by
  }
  if (name === 'market') { renderMarket(); netMaybeCheck(); maybeExplainMarket(); }
  if (name === 'arcade') { renderArcade(); maybeExplainArcade(); }
  if (name === 'wall') renderWall();
  renderRally();      // rooms show the card, documents don't
}

// ---------- reveal overlay ----------

function showReveal(item, isNew, machine, card, capColor, opts = {}) {
  const rar = RARITIES[item.rarity];
  capColor ??= CAPSULE_COLORS[Math.floor(Math.random() * CAPSULE_COLORS.length)];
  // a foil takes over the ring's glow, and needs the art URL to mask its sheen
  const ringStyle = `--glow:${opts.foil ? '#ffd54f' : rar.color}`
    + (opts.foil && foilStyle(item) ? ';' + foilStyle(item) : '');
  const ov = $('#overlay');
  ov.hidden = false;
  ov.innerHTML = `
    <div class="ov-stage">
      <div class="capsule cap-${machine ? capShapeFor(machine.tierId) : 'round'}" style="--cap:${capColor};--glow:${rar.color}">
        <div class="cap-top"></div><div class="cap-bottom"></div>
      </div>
      <div class="ov-hint">tap the capsule!</div>
      <div class="result" hidden>
        <div class="r-ring${opts.foil ? ' ' + foilClass(item) : ''}" style="${ringStyle}">
          ${stickerFace(item, { cls: 'r-icon' })}
        </div>
        <div class="r-name">${opts.foil ? '✨ ' : ''}${item.name}</div>
        <div class="r-chips">
          <span class="chip" style="background:${rar.color}">${rar.label}</span>
          ${opts.foil ? '<span class="chip foil-chip">FOIL!</span>' : ''}
          ${isNew ? '<span class="chip new">NEW!</span>'
                  : `<span class="chip dupe">×${ownedCount(item.id) + foilCount(item.id)} owned · sells for ${rar.sell}</span>`}
          ${opts.pity ? '<span class="chip lucky">✨ LUCKY LAST!</span>' : ''}
        </div>
        <div class="r-btns">
          <button class="btn ghost" id="r-close">Sweet!</button>
          <button class="btn" id="r-again">${coinIcon()} Pull again · ${machine.tier.cost}</button>
        </div>
      </div>
    </div>`;

  const cap = ov.querySelector('.capsule');
  const hint = ov.querySelector('.ov-hint');
  const result = ov.querySelector('.result');

  // arrive: from the shop's chute it pops up into your hand; otherwise it
  // drops in from the top with a bounce
  const arriveMs = opts.fromChute ? 350 : 900;
  if (opts.fromChute) {
    cap.animate([
      { transform: 'scale(0.3) translateY(30vh)', opacity: 0.3 },
      { transform: 'scale(1.1) translateY(-2vh)', offset: 0.75, easing: 'ease-out' },
      { transform: 'scale(1) translateY(0)' },
    ], { duration: arriveMs, easing: 'ease-out' });
  } else {
    cap.animate([
      { transform: 'translateY(-70vh)' },
      { transform: 'translateY(0)', offset: 0.55, easing: 'ease-in' },
      { transform: 'translateY(-9vh)', offset: 0.75, easing: 'ease-out' },
      { transform: 'translateY(0)', easing: 'ease-in' },
    ], { duration: arriveMs });
  }
  setTimeout(() => {
    cap.classList.add('wobble', item.rarity === 'chase' ? 'glow-big' : 'glow');
    hint.classList.add('show');
  }, arriveMs);

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
      result.animate([
        { opacity: 0, transform: 'scale(0.6)' },
        { opacity: 1, transform: 'scale(1)' },
      ], { duration: 350, easing: 'cubic-bezier(.2,1.6,.4,1)' });
      const ring = ov.querySelector('.r-ring');
      // A foil earns the big treatment whatever its rarity — a foil common is
      // rarer than a plain chase, and the moment should say so.
      if (opts.foil) {
        keeperReact('foil');
        sfx.fanfare();
        confetti(40);
        fxSparkleBurst(ring, { count: 26, color: '#ffd54f', spread: 140 });
        setTimeout(() => fxSparkleBurst(ring, { count: 16, color: '#ffffff', spread: 120 }), 450);
      } else if (item.rarity === 'chase') {
        keeperReact('chase');
        sfx.fanfare();
        confetti(40);
        fxSparkleBurst(ring, { count: 26, color: rar.color, spread: 140 });
        setTimeout(() => fxSparkleBurst(ring, { count: 14, color: '#ffffff', spread: 110 }), 450);
      } else if (item.rarity === 'rare') {
        if (isNew) sfx.chime();
        confetti(18);
        fxSparkleBurst(ring, { count: 13, color: rar.color, spread: 110 });
      } else if (item.rarity === 'uncommon') {
        if (isNew) sfx.chime();
        fxSparkleBurst(ring, { count: 7, color: rar.color, spread: 80 });
      } else if (isNew) {
        sfx.chime();
      }
      ov.querySelector('#r-close').addEventListener('click', () => closeReveal());
      ov.querySelector('#r-again').addEventListener('click', () => {
        closeReveal(true);
        setTimeout(shopAutoPull, 120);
      });
    }, 450);
  };
  cap.addEventListener('click', open);
  setTimeout(() => { if (!opened) open(); }, 6000); // auto-open if they wait

  function closeReveal(keepFocus = false) {
    ov.hidden = true;
    ov.innerHTML = '';
    noteStamp('pull');          // stamped once the capsule is done being fun
    if (!keepFocus) {
      // step back from the machine and refresh its collection count
      shopSyncProgress();
      shopUnfocus();
    }
  }
}

// A golden capsule with no sticker inside — a FREE PLAY ticket. Pays twice
// the machine's cost: this pull refunded, the next one on the house.
function showTicketReveal(machine) {
  const value = machine.tier.cost * 2;
  const ov = $('#overlay');
  ov.hidden = false;
  ov.innerHTML = `
    <div class="ov-stage">
      <div class="capsule gold cap-${machine ? capShapeFor(machine.tierId) : 'round'}" style="--cap:#ffc107;--glow:#ffc107">
        <div class="cap-top"></div><div class="cap-bottom"></div>
      </div>
      <div class="ov-hint">tap the capsule!</div>
      <div class="result" hidden>
        <div class="r-ring" style="--glow:#ffc107"><span class="r-ticket">🎟️</span></div>
        <div class="r-name">FREE PLAY!</div>
        <div class="r-chips">
          <span class="chip lucky">✨ golden capsule</span>
          <span class="chip new">+${value} coins</span>
        </div>
        <p class="r-note">pull refunded — the next one's on the house!</p>
        <div class="r-btns">
          <button class="btn ghost" id="r-close">Sweet!</button>
          <button class="btn" id="r-again">${coinIcon()} Pull again · ${machine.tier.cost}</button>
        </div>
      </div>
    </div>`;

  const cap = ov.querySelector('.capsule');
  const hint = ov.querySelector('.ov-hint');
  const result = ov.querySelector('.result');
  cap.animate([
    { transform: 'scale(0.3) translateY(30vh)', opacity: 0.3 },
    { transform: 'scale(1.1) translateY(-2vh)', offset: 0.75, easing: 'ease-out' },
    { transform: 'scale(1) translateY(0)' },
  ], { duration: 350, easing: 'ease-out' });
  setTimeout(() => {
    cap.classList.add('wobble', 'glow-big');
    hint.classList.add('show');
  }, 350);

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
      result.animate([
        { opacity: 0, transform: 'scale(0.6)' },
        { opacity: 1, transform: 'scale(1)' },
      ], { duration: 350, easing: 'cubic-bezier(.2,1.6,.4,1)' });
      state.coins += value;
      saveGame();
      updateHeader();
      keeperReact('ticket');
      sfx.fanfare();
      confetti(24);
      fxSparkleBurst(ov.querySelector('.r-ring'), { count: 18, color: '#ffc107', spread: 120 });
      ov.querySelector('#r-close').addEventListener('click', () => closeReveal());
      ov.querySelector('#r-again').addEventListener('click', () => {
        closeReveal(true);
        setTimeout(shopAutoPull, 120);
      });
    }, 450);
  };
  cap.addEventListener('click', open);
  setTimeout(() => { if (!opened) open(); }, 6000);

  function closeReveal(keepFocus = false) {
    ov.hidden = true;
    ov.innerHTML = '';
    noteStamp('pull');          // a ticket capsule still used up a pull
    if (!keepFocus) {
      shopSyncProgress();
      shopUnfocus();
    }
  }
}

// ---------- market ----------

function renderMarket() {
  const host = $('#tab-market');
  const owned = Object.keys(state.inv).map(id => ITEMS_BY_ID[id])
    .sort((a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity));
  const dupes = owned.filter(it => ownedCount(it.id) > 1);
  const dupeValue = dupes.reduce((s, it) =>
    s + RARITIES[it.rarity].sell * (ownedCount(it.id) - 1), 0);
  // Listing every owned sticker turned this into a very long scroll on a
  // phone. Spares are what people actually sell, so they're the default —
  // but selling a last copy stays possible, one tap away, because
  // occasionally someone really does want to.
  const showAll = !!marketShowAll;
  const listed = showAll ? owned : dupes;

  // the two "do something with your stickers" counters sit above the long
  // sell list — buried at the bottom, nobody finds them
  host.innerHTML = `
    ${tradePostHTML()}
    ${swapShopHTML()}
    <h2 class="market-head">Market</h2>
    <div class="market-top">
      <span>Dupes are worth <b>${dupeValue}</b> coins total.</span>
      <button class="btn small" id="sell-dupes" ${dupes.length ? '' : 'disabled'}>
        Sell all dupes
      </button>
    </div>
    <div class="market-filter">
      <button class="btn small ${showAll ? 'ghost' : ''}" data-filter="dupes">Spares only</button>
      <button class="btn small ${showAll ? '' : 'ghost'}" data-filter="all">Everything</button>
      <span class="mf-count">${listed.length} listed</span>
    </div>
    <div id="market-list">
      ${listed.length ? '' : (owned.length
        ? '<p class="empty">No spares right now — nothing worth selling.</p>'
        : '<p class="empty">Nothing to sell yet — go pull something!</p>')}
      ${listed.map(it => {
        const n = ownedCount(it.id);
        const rar = RARITIES[it.rarity];
        const col = COLLECTIONS.find(c => c.id === it.collection);
        return `<div class="m-row">
          ${stickerFace(it, { cls: 'row-ic' })}
          <span class="row-name">${it.name}<small>${col.name}</small></span>
          <span class="chip" style="background:${rar.color}">${rar.label}</span>
          <span class="row-n">×${n}</span>
          <button class="btn small ${n === 1 ? 'danger' : ''}" data-sell="${it.id}">
            ${n === 1 ? 'Sell last!' : 'Sell 1'} · +${rar.sell}
          </button>
        </div>`;
      }).join('')}
    </div>`;

  wireTradePost(host);
  if (NET.ready) { wireNetStatus(host); wireInbox(host); wireFriends(host); wireMatches(host); }
  wireSwapShop(host);
  host.querySelectorAll('[data-filter]').forEach(b =>
    b.addEventListener('click', () => {
      marketShowAll = b.dataset.filter === 'all';
      renderMarket();
    }));
  $('#sell-dupes').addEventListener('click', () => {
    const got = sellAllDupes();
    if (got) { toast(`Sold dupes for +${got} coins`, 'good'); sfx.coin(); }
    updateHeader();
    renderMarket();
  });
  host.querySelectorAll('[data-sell]').forEach(btn =>
    btn.addEventListener('click', () => {
      const got = sellItem(btn.dataset.sell, 1);
      if (got) { toast(`Sold for +${got} coins`, 'good'); sfx.coin(); }
      updateHeader();
      renderMarket();
    }));
}

// ---------- save backup / restore ----------

function applyRestoreCode(code) {
  try {
    const data = JSON.parse(decodeURIComponent(escape(atob(code))));
    if (typeof data.coins !== 'number' || typeof data.inv !== 'object') throw new Error();
    if (!confirm(`This backup holds: ${saveSummary(data)}.\n\nReplace your current save with it?`)) return;
    state = Object.assign(defaultState(), data);
    saveGame();
    location.reload();
  } catch {
    toast("That code didn't parse — was the whole thing pasted?", 'warn');
  }
}

// Bring a second collection's stickers into this one. See mergeSave() for why
// it only ever fills empty slots.
function applyMergeCode(code) {
  if (state.hasMigrated) {
    toast('This collection has already merged once — that one only works a single time.', 'warn', 5000);
    return;
  }
  let data;
  try {
    data = JSON.parse(decodeURIComponent(escape(atob(code))));
    if (typeof data.inv !== 'object') throw new Error();
  } catch {
    toast("That code didn't parse — was the whole thing pasted?", 'warn');
    return;
  }
  const got = mergeSave(data);
  if (!got) { toast("That code didn't hold a collection.", 'warn'); return; }
  const bits = [];
  if (got.plain.length) bits.push(`${got.plain.length} sticker${got.plain.length > 1 ? 's' : ''}`);
  if (got.foils.length) bits.push(`✨${got.foils.length} foil${got.foils.length > 1 ? 's' : ''}`);
  if (got.friends) bits.push(`${got.friends} friend${got.friends > 1 ? 's' : ''}`);
  $('#overlay').hidden = true;
  $('#overlay').innerHTML = '';
  if (!bits.length) {
    // the idempotent case — nothing over there this collection was missing
    toast('Nothing new in that one — this collection already had all of it.', 'good', 5000);
  } else {
    sfx.fanfare();
    confetti(24);
    toast(`Merged in ${bits.join(', ')}!`, 'good', 5000);
  }
  updateHeader();
  updateFooter();
  if (!$('#tab-album').hidden) renderAlbum();
  if (!$('#tab-market').hidden) renderMarket();
}

// "saved 3 days ago" — the line that has to be impossible to miss before
// anyone overwrites a collection.
function savedAgoText(iso) {
  if (!iso) return '';
  const mins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (!(mins >= 0)) return '';
  if (mins < 2) return 'saved just now';
  if (mins < 60) return `saved ${mins} minutes ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `saved ${hrs} hour${hrs > 1 ? 's' : ''} ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'saved yesterday';
  if (days < 30) return `saved ${days} days ago`;
  return `saved ${Math.floor(days / 30)} month${days >= 60 ? 's' : ''} ago`;
}

// What the Backup screen says about the online copy. Once a player has opted
// in, the age of that copy is the only thing that tells them whether the
// feature is actually working — silence reads as broken.
function cloudWhenText() {
  if (!storedRecoveryCode()) return '';
  if (netCloudStuck()) return 'online copy: not up to date';
  const when = savedAgoText(storedCloudStamp());
  // No stamp yet means this device opted in before conditional uploads
  // existed. Say what's true — that it looks after itself now — rather than
  // claiming a freshness nobody has measured.
  return when ? `online copy: ${when}` : 'online copy: updates on its own';
}

// Called after a background upload lands, so an open Backup screen doesn't sit
// there showing a stale age.
function updateCloudLine() {
  const el = document.querySelector('#sm-when');
  if (el) el.textContent = cloudWhenText();
}

// The block that appears inside the Backup modal. Cloud lives INSIDE the two
// modals that already exist rather than adding footer buttons: "where the save
// comes from" stays separate from "what happens to it".
function cloudBackupHTML() {
  if (!NET.ready) {
    return `<p class="sm-note">Online saving needs a connection — you're offline
      right now, so the code below is the way to move this collection.</p>`;
  }
  const known = storedRecoveryCode();
  return `
    <div class="cloud-box">
      <p class="cloud-lead"><b>Save online instead.</b> Then moving to another device
        is twelve characters, not three thousand.</p>
      <div class="cloud-row">
        <button class="btn small" id="sm-cloud">${known ? 'Update online save' : 'Save online'}</button>
        <span class="cloud-msg" id="sm-cloud-msg"></span>
      </div>
      ${cloudWhenText() ? `<span class="cloud-when" id="sm-when">${escHTML(cloudWhenText())}</span>` : ''}
      ${netCloudStuck() ? `<p class="cloud-warn"><b>Two copies have drifted apart.</b>
        This device stopped uploading because your online save was changed
        somewhere else. Close this and press <b>restore</b> to keep that copy, or
        press <b>Update online save</b> to keep this device's collection instead.</p>` : ''}
      <div id="sm-code-wrap" ${known ? '' : 'hidden'}>
        ${recoveryCodeHTML(known)}
      </div>
    </div>`;
}

// The code and its warning, in ONE place. It is shown from the Backup modal and
// from Poko's offer, and the warning is safety-critical — two copies of this
// wording is two chances for one of them to get softened.
function recoveryCodeHTML(code) {
  return `
    <span class="cloud-label">your recovery code</span>
    <button class="cloud-code" id="sm-code" title="tap to copy">${escHTML(prettyRecoveryCode(code))}</button>
    <p class="cloud-warn">Not a friend code. Anyone with this can load your
      collection onto their device — keep it to yourself, and write it down:
      <b>lose it with no working device and the save is gone for good.</b></p>`;
}

// Poko offers to keep a copy online.
//
// Deliberately NOT triggered by "a second device appeared" — we cannot see
// one. Two devices belonging to the same person are two unlinked anonymous
// players until cloud saves link them, which is the very thing being offered.
// So the trigger is VALUE: you have a collection worth losing and no copy of
// it. Brittany has been hand-carrying 3,000-character backup codes between an
// iPhone and a Mac because nothing ever told her there was a better way.
const CLOUD_NUDGE_PULLS = 30;
const CLOUD_NUDGE_DAYS = 3;
// Asked at most this many times, ever, then never again.
//
// It used to be a single permanent no, which was the wrong shape for what is
// being offered: the value of a cloud save GROWS, but the question was only
// asked once, on day three, when the collection is small and "you could lose
// this" barely registers. Brad himself did not want one until he had two full
// sets — and that is exactly when the two-devices problem found him.
//
// So: once early, then again on each of the first few completed sets, which is
// when a collection stops being a pile of stickers and starts being something
// you would be upset to lose. Say no that many times and it really is a no.
const CLOUD_ASK_LIMIT = 4;

function cloudAsksMade() { return state.cloudAsks || 0; }

function cloudOfferAvailable() {
  if (!NET.ready || !cryptoReady()) return false;
  if (storedRecoveryCode()) return false;          // already has one
  if (state.cloudDeclinedFinal) return false;      // ran out of asks
  return cloudAsksMade() < CLOUD_ASK_LIMIT;
}

// Poko asks again once a set is finished. Deliberately NOT during the confetti:
// a completed set is the payoff the whole game builds toward, and a prompt
// landing inside it cheapens the moment. The panel queues, so this simply
// follows the celebration.
function offerCloudSaveAfterSet() {
  if (!cloudOfferAvailable()) return;
  if (cloudAsksMade() === 0) return;   // the early ask hasn't happened yet; let it
  setTimeout(() => maybeOfferCloudSave({ fromSet: true }), 1800);
}

// `fromSet` is the whole gate for the later asks. Without it there was none at
// all after the first — so having said "not now" once, you would be asked again
// on every single launch. Asks 2 and beyond come ONLY from finishing a set,
// which is what makes them a milestone rather than nagging.
function maybeOfferCloudSave({ fromSet = false } = {}) {
  if (!cloudOfferAvailable()) return;
  if (!fromSet) {
    if (cloudAsksMade() > 0) return;         // boot only ever makes the first ask
    if ((state.totalPulls || 0) < CLOUD_NUDGE_PULLS) return;
    if ((state.days || []).length < CLOUD_NUDGE_DAYS) return;
  }

  // Explains BOTH ways of keeping a save before asking about one of them. This
  // is the only moment the game has the player's attention on the subject, and
  // the gear's "backup"/"restore" buttons say nothing about what they do or
  // how they differ. The question lands on the last line, so nobody is asked to
  // decide before they know what the choice is.
  keeperTell([
    // Reworded Aug 30 after David explained why he'd passed: the payoff clause
    // used to be "pick it up on ANOTHER DEVICE", and he has one phone and no
    // laptop, so he correctly heard "not for me" — then supplied the reason it
    // was for him anyway: "useful for when I get a new phone". Everybody
    // replaces a phone; not everybody owns a second device. Lead with the
    // universal case, keep the other as a bonus.
    { text: 'Your collection only lives on this phone. Clear your browser or ' +
            'lose the handset and it goes with it.', mood: 'wants' },
    { text: 'Two ways to keep it safe. Backup, under the gear, gives you a very ' +
            'long code to paste in yourself — works with no connection at all.',
      mood: 'wants' },
    { text: "Or I can hold an encrypted copy online. Then when you get a new " +
            "phone, it's twelve characters to bring your whole collection " +
            'across — and it works between two devices at once, if you have them.',
      mood: 'gift' },
    { text: 'Shall I set the online one up for you?', mood: 'gift' },
  ], {
    ask: {
      yes: 'Yes please', no: 'Not now',
      onYes: doOfferedCloudSave,
      // Only an explicit answer counts. Showing it is not answering it — see
      // the "flags set on delivery" trap in REVIEW.md.
      onNo: () => {
        state.cloudAsks = cloudAsksMade() + 1;
        if (state.cloudAsks >= CLOUD_ASK_LIMIT) state.cloudDeclinedFinal = true;
        saveGame();
      },
    },
  });
}

async function doOfferedCloudSave() {
  state.cloudDeclinedFinal = true;      // said yes; never ask again either way
  saveGame();
  toast('Saving your collection…', '', 2600);
  const res = await netUploadSave();
  if (res.err || res.conflict) {
    toast(res.err || "couldn't save online just now — try Backup later", 'warn', 5000);
    return;
  }
  sfx.chime();
  cloudBlip('ok');
  const ov = $('#overlay');
  ov.hidden = false;
  ov.innerHTML = `
    <div class="ov-stage share-stage">
      <h3 class="sm-title">Saved online ✓</h3>
      <div class="cloud-box">${recoveryCodeHTML(res.code)}</div>
      <p class="cloud-lead">On your other device, tap <b>restore</b> and type
        those twelve characters.</p>
      <button class="btn" id="cn-done">Got it</button>
    </div>`;
  ov.querySelector('#sm-code').addEventListener('click', () => {
    navigator.clipboard?.writeText(cleanRecoveryCode(res.code))
      .then(() => toast('Recovery code copied — keep it somewhere safe', 'good', 4000))
      .catch(() => toast('Copy blocked — write it down instead', 'warn'));
  });
  ov.querySelector('#cn-done').addEventListener('click', () => {
    ov.hidden = true; ov.innerHTML = '';
  });
}

function wireCloudBackup(ov) {
  const btn = ov.querySelector('#sm-cloud');
  if (!btn) return;
  const msg = ov.querySelector('#sm-cloud-msg');
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    msg.textContent = 'saving…';
    let res = await netUploadSave();
    // The refusal path. The server won't pick a winner and neither will the
    // game — it names what's up there and lets the player decide.
    if (res.conflict) {
      msg.textContent = '';
      const when = savedAgoText(res.updatedAt) || 'saved at some point';
      const ok = confirm(`Your online save was changed on another device (${when}).\n\n` +
        `Overwrite it with THIS device's collection?\n` +
        `Anything the other device did since then would be lost.`);
      if (!ok) {
        btn.disabled = false;
        msg.textContent = 'left the online save alone';
        return;
      }
      msg.textContent = 'saving…';
      res = await netUploadSave({ force: true });
    }
    btn.disabled = false;
    if (res.err) { msg.textContent = res.err; msg.classList.add('bad'); return; }
    msg.classList.remove('bad');
    msg.textContent = 'saved online ✓';
    btn.textContent = 'Update online save';
    const wrap = ov.querySelector('#sm-code-wrap');
    const code = ov.querySelector('#sm-code');
    if (wrap && code) { code.textContent = prettyRecoveryCode(res.code); wrap.hidden = false; }
    netClearStuck();
    updateCloudLine();
    cloudBlip('ok');
    sfx.chime();
  });
  const code = ov.querySelector('#sm-code');
  if (code) code.addEventListener('click', () => {
    navigator.clipboard?.writeText(cleanRecoveryCode(code.textContent))
      .then(() => toast('Recovery code copied — keep it somewhere safe', 'good', 4000))
      .catch(() => toast('Copy blocked — write it down instead', 'warn'));
  });
}

function cloudRestoreHTML() {
  if (!NET.ready) return '';
  const known = storedRecoveryCode();
  return `
    <div class="cloud-box">
      <p class="cloud-lead"><b>From your online save.</b> Twelve characters, from
        the Backup screen on your other device.</p>
      <div class="cloud-row">
        <input id="sm-rec" class="cloud-in" maxlength="14" placeholder="XXXX-XXXX-XXXX"
               autocomplete="off" spellcheck="false" autocapitalize="characters"
               inputmode="latin" value="${escHTML(prettyRecoveryCode(known))}">
        <button class="btn small" id="sm-cloud-load">Load</button>
      </div>
      <span class="cloud-when">dashes optional — lower case and spaces are fine too</span>
      <span class="cloud-msg" id="sm-cloud-msg"></span>
    </div>`;
}

function wireCloudRestore(ov) {
  const btn = ov.querySelector('#sm-cloud-load');
  if (!btn) return;
  const input = ov.querySelector('#sm-rec');
  const msg = ov.querySelector('#sm-cloud-msg');
  const go = async () => {
    const code = cleanRecoveryCode(input.value);
    if (!looksLikeRecoveryCode(code)) {
      msg.textContent = 'a recovery code is 12 letters and numbers';
      msg.classList.add('bad');
      return;
    }
    btn.disabled = true;
    msg.classList.remove('bad');
    msg.textContent = 'looking…';
    const res = await netAdoptSave(code);
    btn.disabled = false;
    if (res.err) { msg.textContent = res.err; msg.classList.add('bad'); return; }
    msg.textContent = '';
    applyCloudSave(res.save, res.updatedAt, code);
  };
  btn.addEventListener('click', go);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
  // The code has never cared about dashes or case — cleanRecoveryCode() strips
  // both. But a field showing XXXX-XXXX-XXXX looks like it cares, so it tidies
  // as you type and the question stops coming up. Only reflows when the caret
  // is at the end, so editing a typo mid-code doesn't fling it away.
  input.addEventListener('input', () => {
    const atEnd = input.selectionStart === input.value.length;
    const pretty = prettyRecoveryCode(input.value);
    if (pretty === input.value) return;
    input.value = pretty;
    if (atEnd) input.setSelectionRange(pretty.length, pretty.length);
  });
}

// Poko's offer was accepted. Downloading and decrypting changes nothing on
// this device, so it happens without further ceremony — and only now, holding
// the actual save, can the game say what's in it. The plain summary panel does
// that. Poko makes the offer; Poko does not confirm the replace.
async function cloudOfferAccept(stamp) {
  const code = storedRecoveryCode();
  if (!code) return;
  toast('Fetching your online save…', '', 2600);
  const res = await netAdoptSave(code);
  if (res.err) { toast(res.err, 'warn'); return; }
  // Backing out at the summary is still a no to this copy, so it doesn't ask
  // again on every launch. A newer one later is a fresh question.
  if (!applyCloudSave(res.save, res.updatedAt, code)) netDeclineCloud(stamp);
}

// Cloud restore REPLACES — always. Merge stays for pasted codes, where it was
// built to repair a second collection made in an in-app browser. Keeping cloud
// replace-only is what stops two devices' daily bonuses being combined.
function applyCloudSave(plain, updatedAt, code) {
  let data;
  try { data = JSON.parse(plain); } catch (e) {
    toast("that online save didn't read properly", 'warn');
    return false;
  }
  const when = savedAgoText(updatedAt);
  if (!confirm(`Your online save holds:\n${saveSummary(data)}\n${when}.\n\n` +
               `Replace this device's collection with it?`)) return false;
  state = Object.assign(defaultState(), data);
  saveGame();
  rememberRecoveryCode(code);      // cached outside the save, so it survives this
  rememberCloudStamp(updatedAt);   // this device now holds exactly what's up there
  location.reload();
  return true;
}

// Says where this collection actually lives. Brad was still pressing the cloud
// button by hand after every session — a habit formed before auto-sync existed
// — which means the game was not saying loudly enough that it is automatic now.
function updateSettingsNote() {
  const el = $('#set-cloud');
  if (!el) return;
  if (typeof storedRecoveryCode === 'function' && storedRecoveryCode()) {
    const when = typeof cloudWhenText === 'function' ? cloudWhenText() : '';
    el.textContent = 'Saved online automatically — no need to press anything. '
      + (when ? when.replace('online copy:', 'Last copy') + '.' : '');
  } else {
    el.textContent = 'This save lives in this browser only.';
  }
}

function updateArtToggle() {
  $('#toggle-art').textContent = ART.enabled ? 'stickers: art' : 'stickers: glyphs';
}

function updateSoundToggle() {
  $('#toggle-sound .msr').textContent = SFX.muted ? 'volume_off' : 'volume_up';
  $('#toggle-sound').classList.toggle('muted', SFX.muted);
}

function saveSummary(data) {
  const unique = Object.keys(data.inv || {}).length;
  const total = Object.values(data.inv || {}).reduce((a, b) => a + b, 0);
  return `${fmtCoins(data.coins)} coins · ${unique} unique stickers (${total} total) · ${(data.days || []).length} days played`;
}

function showSaveModal(html) {
  const ov = $('#overlay');
  ov.hidden = false;
  ov.innerHTML = `<div class="save-modal">${html}</div>`;
  ov.querySelector('#sm-close').addEventListener('click', () => {
    ov.hidden = true;
    ov.innerHTML = '';
  });
  return ov;
}

// ---------- boot ----------

function boot() {
  loadGame();
  migrateCosmetics();   // must precede applyCosmetics; folds in the old theme key
  // decode the stored backdrop early; it redraws the wall once it's ready
  loadStoredPhoto(() => { if (wallCtx) drawWall(); });
  const firstRun = state.totalPulls === 0 && state.days.length === 0;
  // Warn before they invest an hour, not after — but only in a webview that
  // has no evidence of persisting anything. See js/webview.js.
  showWebViewWarning();
  const daily = checkDaily();
  updateHeader();
  updateFooter();
  renderMachines();

  document.querySelectorAll('.tabs button').forEach(b =>
    b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('#reset-save').addEventListener('click', () => {
    if (confirm('Wipe your GaPon save and start over?')) resetGame();
  });

  applyCosmetics();  // paints the rooms AND applies the theme
  renderRally();
  maybeOfferHoliday();     // a costume is offered; the shop's own decor is not
  maybeSellAfterHoliday();
  initProps();      // illustrated scenery, or CSS if PROPS.dir is null
  // ---- settings ----
  const setPanel = $('#settings');
  const closeSettings = () => { setPanel.hidden = true; };
  $('#open-settings').addEventListener('click', () => {
    setPanel.hidden = false;
    updateSettingsNote();
  });
  $('#set-close').addEventListener('click', closeSettings);
  // Clicking the dimmed backdrop closes; clicking the card must not.
  setPanel.addEventListener('click', e => { if (e.target === setPanel) closeSettings(); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !setPanel.hidden) closeSettings();
  });
  // Backup and restore open their own overlays — get out of their way.
  $('#export-save').addEventListener('click', closeSettings);
  $('#import-save').addEventListener('click', closeSettings);

  $('#open-counter').addEventListener('click', () => {
    closeSettings();
    openStampCard();          // the counter: stamp card, then the prize shelf
  });

  // The arcade keeps its tab (it's a daily stop, so it needs to stay one tap
  // away) — this door is a second route that makes the building feel whole.
  $('#arcade-door').addEventListener('click', () => showTab('arcade'));
  $('#parlour-door').addEventListener('click', corinthOpen);
  $('#parlour-exit').addEventListener('click', corinthClose);

  updateSoundToggle();
  $('#toggle-sound').addEventListener('click', () => {
    sfxSetMuted(!SFX.muted);
    updateSoundToggle();
    if (!SFX.muted) sfx.coin();   // a little "sound is back" confirmation
  });

  updateArtToggle();
  $('#toggle-art').addEventListener('click', () => {
    setArtEnabled(!ART.enabled);
    updateArtToggle();
    const active = document.querySelector('.tabs button.active')?.dataset.tab;
    if (active && active !== 'machines') showTab(active);
  });

  // save codes are base64 JSON — same trust level as localStorage itself
  $('#export-save').addEventListener('click', () => {
    const code = btoa(unescape(encodeURIComponent(JSON.stringify(state))));
    const ov = showSaveModal(`
      <h3>Backup</h3>
      <p class="sm-sub">This holds: <b>${saveSummary(state)}</b></p>
      ${cloudBackupHTML()}
      <p class="cloud-label">or copy the whole thing by hand</p>
      <textarea id="sm-text" readonly></textarea>
      <div class="r-btns">
        <button class="btn ghost" id="sm-close">Close</button>
        <button class="btn" id="sm-copy">Copy code</button>
      </div>`);
    wireCloudBackup(ov);
    const ta = ov.querySelector('#sm-text');
    ta.value = code;
    ov.querySelector('#sm-copy').addEventListener('click', () => {
      ta.select();
      ta.setSelectionRange(0, code.length);
      const done = () => toast('Code copied — keep it somewhere safe!', 'good');
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(code).then(done,
          () => { document.execCommand('copy'); done(); });
      } else { document.execCommand('copy'); done(); }
    });
  });

  $('#import-save').addEventListener('click', () => {
    const ov = showSaveModal(`
      <h3>Restore or merge</h3>
      ${cloudRestoreHTML()}
      <p class="sm-sub">Or paste a backup code — or load a saved wall PNG,
        every exported wall picture secretly carries your full save.</p>
      <textarea id="sm-text" placeholder="paste your save code here"></textarea>
      <p class="sm-note"><b>Restore</b> replaces this collection completely.<br>
        <b>Merge</b> keeps this one and fills its empty slots from the other —
        stickers only, one merge per collection. Coins, streak and your stamp
        card stay exactly as they are.</p>
      <div class="r-btns">
        <label class="btn ghost sm-filebtn">From wall PNG
          <input type="file" id="sm-file" accept="image/png" hidden>
        </label>
        <button class="btn ghost" id="sm-close">Cancel</button>
        <button class="btn ghost" id="sm-merge">Merge</button>
        <button class="btn" id="sm-apply">Restore</button>
      </div>`);
    wireCloudRestore(ov);
    ov.querySelector('#sm-apply').addEventListener('click', () =>
      applyRestoreCode(ov.querySelector('#sm-text').value.trim()));
    ov.querySelector('#sm-merge').addEventListener('click', () =>
      applyMergeCode(ov.querySelector('#sm-text').value.trim()));
    ov.querySelector('#sm-file').addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      const im = new Image();
      im.onload = () => {
        URL.revokeObjectURL(url);
        const cv = document.createElement('canvas');
        cv.width = im.naturalWidth;
        cv.height = im.naturalHeight;
        const cx = cv.getContext('2d');
        cx.drawImage(im, 0, 0);
        const code = stegExtract(cx.getImageData(0, 0, cv.width, cv.height));
        if (code) applyRestoreCode(code);
        else toast('No save data in that image — was it re-compressed or resized?', 'warn');
      };
      im.onerror = () => {
        URL.revokeObjectURL(url);
        toast('Could not read that file.', 'warn');
      };
      im.src = url;
    });
  });

  if (firstRun) {
    toast(`Welcome to GaPon! Here's ${fmtCoins(state.coins)} coins — go pull!`, 'good');
  } else if (daily) {
    toast(`Daily bonus +${daily.bonus} coins! (day ${daily.streak} streak)`, 'good');
  }
  pruneWants();   // drop anything acquired since this list was last touched
  netInit();      // online layer boots in the background; nothing waits on it

  // let the toast land first, then Poko says hello from the counter
  setTimeout(() => keeperGreet(firstRun, daily), firstRun ? 900 : 1400);
}

document.addEventListener('DOMContentLoaded', boot);
