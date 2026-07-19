// GaPon — UI wiring: tabs, machines, pull/reveal flow, album, market.

const $ = sel => document.querySelector(sel);

let machineSims = {};   // tierId -> MachineSim
let pulling = false;

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
  $('#coin-count').textContent = fmtCoins(state.coins);
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
  for (const t of ['machines', 'album', 'market', 'arcade']) {
    $('#tab-' + t).hidden = (t !== name);
  }
  if (name === 'album') renderAlbum();
  if (name === 'market') renderMarket();
  if (name === 'arcade') renderArcade();
}

// ---------- machines ----------

function oddsRow(odds) {
  return RARITY_ORDER.map(r =>
    `<span class="odd"><i class="dot" style="background:${RARITIES[r].color}"></i>${(odds[r] * 100).toFixed(0)}%</span>`
  ).join('');
}

function renderMachines() {
  clearSims();
  machineSims = {};
  const host = $('#machines');
  host.innerHTML = '';
  for (const m of getTodaysMachines()) {
    const col = m.collection;
    const card = document.createElement('div');
    card.className = 'machine';
    card.style.setProperty('--accent', m.tier.accent);
    card.innerHTML = `
      <div class="m-head">
        <span class="m-name">${m.tier.name}</span>
        <span class="m-col" style="color:${col.color}">${col.name}</span>
      </div>
      <div class="m-glass"><canvas width="260" height="150"></canvas></div>
      <div class="m-odds">${oddsRow(m.tier.odds)}</div>
      <div class="m-foot">
        <span class="m-progress">${collectionProgress(col)}/${col.items.length} collected</span>
        <button class="pull-btn">${coinIcon()} Pull · ${m.tier.cost}</button>
      </div>`;
    host.appendChild(card);
    machineSims[m.tierId] = new MachineSim(card.querySelector('canvas'));
    card.querySelector('.pull-btn').addEventListener('click', () => doPull(m, card));
  }
  updateRotateTimer();
}

function updateRotateTimer() {
  const ms = msUntilMidnight();
  const h = Math.floor(ms / 3600000), min = Math.floor((ms % 3600000) / 60000);
  $('#rotate-timer').textContent = `new machines in ${h}h ${min}m`;
}
setInterval(updateRotateTimer, 60000);

function doPull(machine, card) {
  if (pulling) return;
  const btn = card.querySelector('.pull-btn');
  if (state.coins < machine.tier.cost) {
    toast(`Not enough coins for ${machine.tier.name}! Sell some dupes?`, 'warn');
    btn.animate([
      { transform: 'translateX(0)' }, { transform: 'translateX(-5px)' },
      { transform: 'translateX(5px)' }, { transform: 'translateX(0)' },
    ], { duration: 250 });
    return;
  }
  pulling = true;
  state.coins -= machine.tier.cost;
  state.totalPulls++;
  const item = rollItem(machine);
  const isNew = ownedCount(item.id) === 0;
  addItem(item.id);
  saveGame();
  updateHeader();
  updateFooter();
  const capColor = machineSims[machine.tierId].shakeAndDispense();
  setTimeout(() => showReveal(item, isNew, machine, card, capColor), 900);
}

// ---------- reveal overlay ----------

function showReveal(item, isNew, machine, card, capColor) {
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
          <span class="msr r-icon" style="color:${COLLECTIONS.find(c => c.id === item.collection).color}">${item.icon}</span>
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

  // drop in with a bounce, then wobble + glow
  cap.animate([
    { transform: 'translateY(-70vh)' },
    { transform: 'translateY(0)', offset: 0.55, easing: 'ease-in' },
    { transform: 'translateY(-9vh)', offset: 0.75, easing: 'ease-out' },
    { transform: 'translateY(0)', easing: 'ease-in' },
  ], { duration: 900 });
  setTimeout(() => {
    cap.classList.add('wobble', item.rarity === 'chase' ? 'glow-big' : 'glow');
    hint.classList.add('show');
  }, 900);

  let opened = false;
  const open = () => {
    if (opened) return;
    opened = true;
    hint.remove();
    cap.classList.remove('wobble');
    cap.classList.add('open');
    setTimeout(() => {
      cap.remove();
      result.hidden = false;
      result.animate([
        { opacity: 0, transform: 'scale(0.6)' },
        { opacity: 1, transform: 'scale(1)' },
      ], { duration: 350, easing: 'cubic-bezier(.2,1.6,.4,1)' });
      if (item.rarity === 'chase') confetti(40);
      else if (item.rarity === 'rare') confetti(18);
      ov.querySelector('#r-close').addEventListener('click', closeReveal);
      ov.querySelector('#r-again').addEventListener('click', () => {
        closeReveal();
        setTimeout(() => doPull(machine, card), 150);
      });
    }, 450);
  };
  cap.addEventListener('click', open);
  setTimeout(() => { if (!opened) open(); }, 6000); // auto-open if they wait

  function closeReveal() {
    ov.hidden = true;
    ov.innerHTML = '';
    pulling = false;
    // refresh the progress line on machine cards
    document.querySelectorAll('.machine').forEach((mc, i) => {
      const m = getTodaysMachines()[i];
      mc.querySelector('.m-progress').textContent =
        `${collectionProgress(m.collection)}/${m.collection.items.length} collected`;
    });
  }
}

// ---------- album ----------

function renderAlbum() {
  const host = $('#tab-album');
  host.innerHTML = '<h2>Sticker Album</h2>';
  for (const col of COLLECTIONS) {
    const prog = collectionProgress(col);
    const complete = isSetComplete(col);
    const claimed = state.claimedSets.includes(col.id);
    const card = document.createElement('div');
    card.className = 'album-col';
    card.innerHTML = `
      <div class="a-head">
        <span class="a-name" style="color:${col.color}">${col.name}</span>
        <span class="a-prog">${prog}/${col.items.length}</span>
        ${complete && !claimed
          ? `<button class="btn small claim">${coinIcon()} Claim ${ECON.setBonus}!</button>`
          : (claimed ? '<span class="chip done">Set complete ✓</span>' : '')}
      </div>
      <div class="a-grid">
        ${col.items.map(it => {
          const n = ownedCount(it.id);
          const rar = RARITIES[it.rarity];
          return `<div class="cell ${n ? '' : 'locked'}" title="${n ? it.name : '???'}"
                       style="--rar:${rar.color}">
            <span class="msr" style="${n ? `color:${col.color}` : ''}">${it.icon}</span>
            ${n > 1 ? `<span class="count">×${n}</span>` : ''}
          </div>`;
        }).join('')}
      </div>`;
    host.appendChild(card);
    const claimBtn = card.querySelector('.claim');
    if (claimBtn) claimBtn.addEventListener('click', () => {
      const got = claimSetBonus(col);
      if (got) {
        toast(`${col.name} complete! +${got} coins`, 'good');
        confetti(30);
        updateHeader();
        renderAlbum();
      }
    });
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
          <span class="msr row-ic" style="color:${col.color}">${it.icon}</span>
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
    if (got) toast(`Sold dupes for +${got} coins`, 'good');
    updateHeader();
    renderMarket();
  });
  host.querySelectorAll('[data-sell]').forEach(btn =>
    btn.addEventListener('click', () => {
      const got = sellItem(btn.dataset.sell, 1);
      if (got) toast(`Sold for +${got} coins`, 'good');
      updateHeader();
      renderMarket();
    }));
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

  if (firstRun) {
    toast(`Welcome to GaPon! Here's ${fmtCoins(state.coins)} coins — go pull!`, 'good');
  } else if (daily) {
    toast(`Daily bonus +${daily.bonus} coins! (day ${daily.streak} streak)`, 'good');
  }
}

document.addEventListener('DOMContentLoaded', boot);
