// GaPon — the sticker album as a card binder. One collection per page:
// twelve pockets, commons up top, the chase card living in the last slot
// with a holo sleeve. Pages flip (buttons, edge tabs, or swipe).

let albumPage = 0;
let albumFlipping = false;

function renderAlbum() {
  albumPage = Math.max(0, Math.min(albumPage, COLLECTIONS.length - 1));
  const host = $('#tab-album');
  host.innerHTML = `
    <div class="binder">
      <div class="binder-rings">${'<i></i>'.repeat(5)}</div>
      <div class="binder-page" id="binder-page"></div>
      <div class="binder-tabs">
        ${COLLECTIONS.map((c, i) => `
          <button class="b-tab${i === albumPage ? ' active' : ''}"
                  style="--tabc:${c.color}" data-page="${i}" title="${c.name}"></button>`).join('')}
      </div>
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
  host.querySelectorAll('.b-tab').forEach(tab =>
    tab.addEventListener('click', () => flipTo(+tab.dataset.page)));

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
  const n = ownedCount(it.id);
  const rar = RARITIES[it.rarity];
  return `
    <div class="pocket ${n ? 'owned' : 'locked'}${it.rarity === 'chase' ? ' holo' : ''}"
         style="--rar:${rar.color}" title="${n ? it.name : '???'}">
      <div class="pkt-card">${stickerFace(it, { owned: n > 0 })}</div>
      <div class="pkt-name">${n ? it.name : '???'}</div>
      ${n > 1 ? `<span class="pkt-count">×${n}</span>` : ''}
    </div>`;
}

function renderBinderPage() {
  const col = COLLECTIONS[albumPage];
  const prog = collectionProgress(col);
  const complete = isSetComplete(col);
  const claimed = state.claimedSets.includes(col.id);
  const page = $('#binder-page');
  page.innerHTML = `
    <div class="page-head">
      <span class="page-title" style="color:${col.color}">${col.name}</span>
      <span class="page-prog">${prog}/${col.items.length}</span>
      ${complete && !claimed
        ? `<button class="btn small" id="page-claim">${coinIcon()} Claim ${ECON.setBonus}!</button>`
        : ''}
    </div>
    <div class="pockets">${col.items.map(pocketHTML).join('')}</div>
    ${claimed ? '<div class="page-stamp">COMPLETE ✓</div>' : ''}`;
  const claimBtn = page.querySelector('#page-claim');
  if (claimBtn) claimBtn.addEventListener('click', () => {
    const got = claimSetBonus(col);
    if (got) {
      toast(`${col.name} complete! +${got} coins`, 'good');
      sfx.fanfare();
      confetti(30);
      updateHeader();
      renderBinderPage();
    }
  });
}

function updateBinderNav() {
  $('#pg-prev').disabled = albumPage === 0;
  $('#pg-next').disabled = albumPage === COLLECTIONS.length - 1;
  $('#pg-num').textContent = `page ${albumPage + 1} / ${COLLECTIONS.length}`;
  document.querySelectorAll('.b-tab').forEach((t, i) =>
    t.classList.toggle('active', i === albumPage));
}

// Cheap-but-convincing page turn: fold the page edge-on about the rings,
// swap the content while it's invisible, and unfold showing the new page.
function flipTo(idx) {
  if (albumFlipping || idx === albumPage || idx < 0 || idx >= COLLECTIONS.length) return;
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
