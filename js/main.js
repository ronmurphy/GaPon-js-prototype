// GaPon — UI wiring: tabs, reveal flow, album, market. The shop scene and
// pull ritual live in shop.js.

const $ = sel => document.querySelector(sel);

// ---------- helpers ----------

function fmtCoins(n) { return n.toLocaleString(); }

function toast(msg, cls = '') {
  const el = document.createElement('div');
  el.className = 'toast ' + cls;
  el.innerHTML = msg;
  $('#toasts').appendChild(el);
  el.animate(
    [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }],
    { duration: 200, easing: 'ease-out' });
  setTimeout(() => {
    el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300 })
      .onfinish = () => el.remove();
  }, 2600);
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
  document.querySelectorAll('.tabs button').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === name));
  for (const t of ['machines', 'album', 'market', 'arcade', 'wall']) {
    $('#tab-' + t).hidden = (t !== name);
  }
  fxTabIn($('#tab-' + name));
  if (name === 'album') renderAlbum();
  if (name === 'market') renderMarket();
  if (name === 'arcade') renderArcade();
  if (name === 'wall') renderWall();
}

// ---------- reveal overlay ----------

function showReveal(item, isNew, machine, card, capColor, opts = {}) {
  const rar = RARITIES[item.rarity];
  capColor ??= CAPSULE_COLORS[Math.floor(Math.random() * CAPSULE_COLORS.length)];
  const ov = $('#overlay');
  ov.hidden = false;
  ov.innerHTML = `
    <div class="ov-stage">
      <div class="capsule" style="--cap:${capColor};--glow:${rar.color}">
        <div class="cap-top"></div><div class="cap-bottom"></div>
      </div>
      <div class="ov-hint">tap the capsule!</div>
      <div class="result" hidden>
        <div class="r-ring" style="--glow:${rar.color}">
          ${stickerFace(item, { cls: 'r-icon' })}
        </div>
        <div class="r-name">${item.name}</div>
        <div class="r-chips">
          <span class="chip" style="background:${rar.color}">${rar.label}</span>
          ${isNew ? '<span class="chip new">NEW!</span>'
                  : `<span class="chip dupe">×${ownedCount(item.id)} owned · sells for ${rar.sell}</span>`}
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
      if (item.rarity === 'chase') {
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
    if (!keepFocus) {
      // step back from the machine and refresh its collection count
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

  host.innerHTML = `
    <h2>Market</h2>
    <div class="market-top">
      <span>Dupes are worth <b>${dupeValue}</b> coins total.</span>
      <button class="btn small" id="sell-dupes" ${dupes.length ? '' : 'disabled'}>
        Sell all dupes
      </button>
    </div>
    <div id="market-list">
      ${owned.length ? '' : '<p class="empty">Nothing to sell yet — go pull something!</p>'}
      ${owned.map(it => {
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
  const firstRun = state.totalPulls === 0 && state.days.length === 0;
  const daily = checkDaily();
  updateHeader();
  updateFooter();
  renderMachines();

  document.querySelectorAll('.tabs button').forEach(b =>
    b.addEventListener('click', () => showTab(b.dataset.tab)));
  $('#reset-save').addEventListener('click', () => {
    if (confirm('Wipe your GaPon save and start over?')) resetGame();
  });

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
      <h3>Backup code</h3>
      <p class="sm-sub">This code holds: <b>${saveSummary(state)}</b></p>
      <textarea id="sm-text" readonly></textarea>
      <div class="r-btns">
        <button class="btn ghost" id="sm-close">Close</button>
        <button class="btn" id="sm-copy">Copy code</button>
      </div>`);
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
      <h3>Restore backup</h3>
      <p class="sm-sub">Paste a backup code — or load a saved wall PNG,
        every exported wall picture secretly carries your full save.</p>
      <textarea id="sm-text" placeholder="paste your save code here"></textarea>
      <div class="r-btns">
        <label class="btn ghost sm-filebtn">From wall PNG
          <input type="file" id="sm-file" accept="image/png" hidden>
        </label>
        <button class="btn ghost" id="sm-close">Cancel</button>
        <button class="btn" id="sm-apply">Restore</button>
      </div>`);
    ov.querySelector('#sm-apply').addEventListener('click', () =>
      applyRestoreCode(ov.querySelector('#sm-text').value.trim()));
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
}

document.addEventListener('DOMContentLoaded', boot);
