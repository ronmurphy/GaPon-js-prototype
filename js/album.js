// GaPon — the sticker album as a card binder. One collection per page:
// twelve pockets, commons up top, the chase card living in the last slot
// with a holo sleeve. Pages flip with the buttons, a swipe, or the set picker
// on the page title (the coloured edge tabs it replaced ran out of width).

let albumPage = 0;          // index into albumOrder, NOT into COLLECTIONS
let albumOrder = [];        // the page order the tabs were last built with
let albumFlipping = false;

// Three groups, each keeping its original internal order:
//
//   1. IN PROGRESS — started but not finished. What you're actually working
//      on, so it's what the binder opens to.
//   2. COMPLETE — your trophies. Worth keeping, but there is nothing left to
//      do on those pages, so they must not sit in front of the live ones. Put
//      finished sets first and the ordering gets WORSE the better you do at
//      the game: eventually you'd scroll past eight trophies to reach the one
//      set you're still chasing.
//   3. UNTOUCHED — the map. Still visible (seeing what exists is what makes
//      you want it) but at the back, where it isn't disheartening.
//
// Deliberately GROUPS rather than a continuous sort by progress: sorting would
// make a 5/12 and a 6/12 swap places every time you pulled and the tabs would
// never sit still. Here a set moves exactly twice in its life — the day you
// start it and the day you finish it — and both are moments worth the binder
// rearranging itself for.
//
// The payoff is that page 0 is something you've worked on. David opened the
// binder to a wall of ??? every session because `albumPage` resets to 0 on
// every load and Cosmo Club happened to be first in the file.
function binderOrder() {
  const going = [], done = [], untouched = [];
  for (const c of liveCollections()) {
    const n = collectionProgress(c);
    (n === 0 ? untouched : n === c.items.length ? done : going).push(c);
  }
  return going.concat(done, untouched);
}

// Only recomputed on a full render, never mid-page. Giving away your last copy
// of something can drop a set back into the untouched group — recomputing on
// every little re-render would reshuffle the tabs under the player's thumb.
function renderAlbum() {
  albumOrder = binderOrder();
  albumPage = Math.max(0, Math.min(albumPage, albumOrder.length - 1));
  const host = $('#tab-album');
  host.innerHTML = `
    <div class="binder">
      <div class="binder-rings">${'<i></i>'.repeat(5)}</div>
      <div class="binder-page" id="binder-page"></div>
    </div>
    <div class="binder-nav">
      <button class="btn ghost small" id="pg-prev">‹ prev</button>
      <span class="pg-num" id="pg-num"></span>
      <button class="btn ghost small" id="pg-next">next ›</button>
    </div>`;

  renderBinderPage();
  updateBinderNav();

  $('#pg-prev').addEventListener('click', () => flipTo(albumPage - 1));
  $('#pg-next').addEventListener('click', () => flipTo(albumPage + 1));
  // Anywhere else closes the picker, and so does Escape.
  host.addEventListener('click', () => toggleSetPicker(false));
  host.addEventListener('keydown', e => { if (e.key === 'Escape') toggleSetPicker(false); });

  // swipe to flip (horizontal only, so vertical page scroll still works)
  const page = $('#binder-page');
  let sx = null, sy = null;
  page.addEventListener('pointerdown', e => { sx = e.clientX; sy = e.clientY; });
  page.addEventListener('pointerup', e => {
    if (sx === null) return;
    const dx = e.clientX - sx, dy = e.clientY - sy;
    sx = sy = null;
    if (Math.abs(dx) > 44 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      flipTo(albumPage + (dx < 0 ? 1 : -1));
    }
  });
}

function pocketHTML(it) {
  const plain = ownedCount(it.id), foils = foilCount(it.id);
  const n = plain + foils;
  const rar = RARITIES[it.rarity];
  const wanted = !n && (state.wants || []).includes(it.id);
  // The pocket shows the best copy you own — no upgrading, no choosing.
  return `
    <div class="pocket ${n ? 'owned' : 'locked'}${it.rarity === 'chase' ? ' holo' : ''}${wanted ? ' wanted' : ''}"
         style="--rar:${rar.color}" data-item="${it.id}"
         title="${n ? it.name + (foils ? ` — ✨${foils} foil` : '') + ' — tap to give away'
                    : (wanted ? 'on your wants list' : 'tap to add to your wants list')}">
      ${n ? '' : `<span class="pkt-want${wanted ? ' on' : ''}">${wanted ? '★' : '☆'}</span>`}
      <div class="pkt-card${foils ? ' ' + foilClass(it) : ''}" style="${foils ? foilStyle(it) : ''}">${stickerFace(it, { owned: n > 0 })}</div>
      <div class="pkt-name">${n || artPeek(it) ? it.name : '???'}</div>
      ${n > 1 ? `<span class="pkt-count">×${n}</span>` : ''}
      ${foils ? `<span class="pkt-foil">✨${foils > 1 ? foils : ''}</span>` : ''}
    </div>`;
}

// The set picker. Replaces the row of coloured tabs, which could not survive
// the collection count growing — they run out of width somewhere around 14 sets
// and the desktop tab bar dies near 17.
//
// A dropdown costs one extra tap, so it has to be worth it: this lists every
// set's PROGRESS, which the tabs never showed and which existed nowhere else in
// the game. It is a collection overview that happens to navigate.
//
// The order is binderOrder()'s — in progress, then complete, then untouched —
// so what you are working on is always at the top. That does the job "only show
// tabs for pages in progress" was reaching for, without a navigation bar that
// rearranges itself as you finish things.
function setPickerHTML(current) {
  return `
    <div class="set-picker" id="set-picker" hidden>
      ${albumOrder.map((c, i) => {
        const done = collectionProgress(c), of = c.items.length;
        const full = done === of;
        return `
          <button class="sp-row${i === current ? ' current' : ''}${full ? ' full' : ''}"
                  data-page="${i}">
            <span class="sp-top">
              <span class="sp-dot" style="--c:${c.color}"></span>
              <span class="sp-name">${c.name}</span>
              ${isInRotation(c.id) ? '' : '<span class="sp-out">rest</span>'}
              <span class="sp-n">${done}/${of}</span>
            </span>
            <span class="sp-bar"><i style="width:${Math.round(done / of * 100)}%;--c:${c.color}"></i></span>
          </button>`;
      }).join('')}
    </div>`;
}

function toggleSetPicker(open) {
  const el = $('#set-picker'), btn = $('#page-pick');
  if (!el || !btn) return;
  const show = open === undefined ? el.hidden : open;
  el.hidden = !show;
  btn.setAttribute('aria-expanded', String(show));
}

function renderBinderPage() {
  if (!albumOrder.length) albumOrder = binderOrder();
  const col = albumOrder[albumPage];
  if (!col) return;
  const prog = collectionProgress(col);
  // shown as a second line, never folded into `prog` — foils don't complete sets
  const foilProg = col.items.filter(it => foilCount(it.id)).length;
  const complete = isSetComplete(col);
  const claimed = state.claimedSets.includes(col.id);
  const page = $('#binder-page');
  if (!page) return;      // wants can be toggled from elsewhere; the binder
                          // isn't always on screen when this is called
  page.innerHTML = `
    <div class="page-head">
      <button class="page-pick" id="page-pick" aria-expanded="false" aria-haspopup="true">
        <span class="page-title" style="color:${col.color}">${col.name}</span>
        <span class="page-prog">${prog}/${col.items.length}</span>
        <span class="page-chev">⌄</span>
      </button>
      ${setPickerHTML(albumPage)}
      ${isInRotation(col.id) ? '' : `<span class="page-outrot"
        title="not in the machines this month — still reachable from the drum, the Swap Shop, the Special Pon, and trades">out of rotation</span>`}
      ${foilProg ? `<span class="page-foil" title="foils are bonus — they never count toward completing a set">✨ ${foilProg}/${col.items.length}</span>` : ''}
      ${complete && !claimed
        ? `<button class="btn small" id="page-claim">${coinIcon()} Claim ${ECON.setBonus}!</button>`
        : ''}
    </div>
    <div class="pockets">${col.items.map(pocketHTML).join('')}</div>
    ${claimed ? '<div class="page-stamp">COMPLETE ✓</div>' : ''}`;
  // tapping a sticker you own offers to give it away (see trade.js)
  page.querySelectorAll('.pocket.owned').forEach(pk =>
    pk.addEventListener('click', () => {
      const it = ITEMS_BY_ID[pk.dataset.item];
      if (it) openShareDialog(it);
    }));
  // tapping a sticker you DON'T own flags it as wanted, so friends holding a
  // spare can be told — see net.js
  page.querySelectorAll('.pocket.locked').forEach(pk =>
    pk.addEventListener('click', () => toggleWant(pk.dataset.item)));
  // Re-bound on every page render, like the pockets above — this markup is
  // rebuilt each time, so a listener attached once at boot would be discarded.
  const pick = page.querySelector('#page-pick');
  if (pick) pick.addEventListener('click', e => { e.stopPropagation(); toggleSetPicker(); });
  page.querySelectorAll('.sp-row').forEach(row =>
    row.addEventListener('click', e => {
      e.stopPropagation();
      toggleSetPicker(false);      // close BEFORE the flip, or it folds with the page
      flipTo(+row.dataset.page);
    }));

  const claimBtn = page.querySelector('#page-claim');
  if (claimBtn) claimBtn.addEventListener('click', () => {
    const got = claimSetBonus(col);
    if (got) {
      toast(`${col.name} complete! +${got} coins`, 'good');
      keeperReact('setDone');
      sfx.fanfare();
      confetti(30);
      updateHeader();
      renderBinderPage();
      // ...and only after the fanfare, ask whether they'd like this kept safe.
      offerCloudSaveAfterSet();
    }
  });
}

function updateBinderNav() {
  $('#pg-prev').disabled = albumPage === 0;
  $('#pg-next').disabled = albumPage === albumOrder.length - 1;
  $('#pg-num').textContent = `page ${albumPage + 1} / ${albumOrder.length}`;
}

// Cheap-but-convincing page turn: fold the page edge-on about the rings,
// swap the content while it's invisible, and unfold showing the new page.
function flipTo(idx) {
  if (albumFlipping || idx === albumPage || idx < 0 || idx >= albumOrder.length) return;
  const page = $('#binder-page');
  const forward = idx > albumPage;
  albumPage = idx;
  if (FX_REDUCED) {
    renderBinderPage();
    updateBinderNav();
    return;
  }
  albumFlipping = true;
  sfx.flip();
  page.style.transition = 'transform 0.16s ease-in';
  page.style.transform = `rotateY(${forward ? -88 : 88}deg)`;
  setTimeout(() => {
    renderBinderPage();
    updateBinderNav();
    page.style.transition = 'none';
    page.style.transform = `rotateY(${forward ? 88 : -88}deg)`;
    void page.offsetWidth;
    page.style.transition = 'transform 0.16s ease-out';
    page.style.transform = 'rotateY(0deg)';
    setTimeout(() => {
      page.style.transition = '';
      albumFlipping = false;
    }, 180);
  }, 170);
}
