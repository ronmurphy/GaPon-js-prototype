// GaPon — the Swap Shop counter in the Market. Trade three spare copies for
// one sticker of the same rarity from a collection you choose. It's the sink
// duplicates needed: before this, a pile of doubles was only ever coins, and
// finishing a set late on was pure luck.

function swapShopHTML() {
  const rows = RARITY_ORDER.map(r => {
    const n = dupeCount(r);
    if (!n) return '';
    const rar = RARITIES[r];
    const canAfford = n >= ECON.swapCost;
    const targets = swapTargets(r).length;
    const why = !canAfford ? `need ${ECON.swapCost}`
      : !targets ? 'set complete!' : `${Math.floor(n / ECON.swapCost)} swap${n >= ECON.swapCost * 2 ? 's' : ''}`;
    return `<div class="swap-row">
      <span class="chip" style="background:${rar.color}">${rar.label}</span>
      <span class="swap-n">${n} spare${n > 1 ? 's' : ''}</span>
      <span class="swap-why">${why}</span>
      <button class="btn small" data-swap="${r}"
        ${canAfford && targets ? '' : 'disabled'}>Swap ${ECON.swapCost}</button>
    </div>`;
  }).join('');
  if (!rows) return '';
  return `
    <h2 class="market-head">Swap Shop</h2>
    <div class="swap-shop">
      <p class="tp-tip">Trade ${ECON.swapCost} spare copies for one sticker you're
        missing of the same rarity — you pick the collection, the machine picks
        the sticker. Your last copy of anything is never spent.</p>
      ${rows}
    </div>`;
}

function wireSwapShop(host) {
  host.querySelectorAll('[data-swap]').forEach(btn =>
    btn.addEventListener('click', () => openSwapPicker(btn.dataset.swap)));
}

function openSwapPicker(rarity) {
  const rar = RARITIES[rarity];
  const targets = swapTargets(rarity);
  const ov = $('#overlay');
  ov.hidden = false;
  ov.innerHTML = `
    <div class="ov-stage share-stage">
      <div class="keeper-title"><span>Swap ${ECON.swapCost}
        <span class="chip" style="background:${rar.color}">${rar.label}</span> spares</span></div>
      <p class="r-note">which collection should it come from?</p>
      <div class="swap-picks">
        ${targets.map(t => `
          <button class="swap-pick" data-col="${t.col.id}" style="--c:${t.col.color}">
            <span class="sp-name">${t.col.name}</span>
            <span class="sp-miss">${t.missing.length} missing</span>
          </button>`).join('')}
      </div>
      <div class="r-btns"><button class="btn ghost" id="swap-cancel">Never mind</button></div>
    </div>`;
  ov.querySelector('#swap-cancel').addEventListener('click', () => {
    ov.hidden = true;
    ov.innerHTML = '';
  });
  ov.querySelectorAll('[data-col]').forEach(b =>
    b.addEventListener('click', () => {
      const res = swapDupes(rarity, b.dataset.col);
      if (!res) {
        sfx.buzz();
        toast('Not enough spares for that swap.', 'warn');
        return;
      }
      sfx.coin();
      updateFooter();
      // straight into the usual capsule reveal, so a swap still feels like
      // opening something rather than filling in a form
      showGiftReveal(res.got, true, null, { chip: '🔄 swapped!' });
    }));
}
