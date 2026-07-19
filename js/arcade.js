// GaPon — arcade corner: two quick minigames, 3 plays a day, small payouts.

let timingRaf = null;

function arcadeAward(payout, headline) {
  state.coins += payout;
  saveGame();
  updateHeader();
  const stage = $('#arcade-stage');
  stage.innerHTML = `
    <div class="arcade-result">
      <div class="ar-head">${headline}</div>
      <div class="ar-pay">${coinIcon()} +${payout} coins</div>
      <button class="btn" id="ar-back">Back to arcade</button>
    </div>`;
  $('#ar-back').addEventListener('click', renderArcade);
}

function renderArcade() {
  if (timingRaf) { cancelAnimationFrame(timingRaf); timingRaf = null; }
  const left = arcadePlaysLeft();
  const host = $('#tab-arcade');
  host.innerHTML = `
    <h2>Arcade Corner</h2>
    <p class="arcade-sub">
      Quick games for a few extra coins —
      <b>${left}/${ARCADE.playsPerDay}</b> plays left today.
      ${left === 0 ? 'New plays tomorrow!' : ''}
    </p>
    <div class="arcade-games">
      <div class="game-card">
        <span class="msr g-icon">timer</span>
        <div class="g-name">Capsule Stop</div>
        <div class="g-desc">Stop the slider in the gold zone!</div>
        <div class="g-pay">${coinIcon()} 2–15</div>
        <button class="btn" data-game="timing" ${left ? '' : 'disabled'}>Play</button>
      </div>
      <div class="game-card">
        <span class="msr g-icon">style</span>
        <div class="g-name">Sticker Match</div>
        <div class="g-desc">Match pairs from your album.</div>
        <div class="g-pay">${coinIcon()} 5–15</div>
        <button class="btn" data-game="match" ${left ? '' : 'disabled'}>Play</button>
      </div>
    </div>
    <div id="arcade-stage"></div>`;
  host.querySelectorAll('[data-game]').forEach(btn =>
    btn.addEventListener('click', () => {
      if (!useArcadePlay()) return;
      host.querySelector('.arcade-games').remove();
      host.querySelector('.arcade-sub').remove();
      if (btn.dataset.game === 'timing') startTimingGame();
      else startMatchGame();
    }));
}

// ---------- Capsule Stop (timing bar) ----------

function startTimingGame() {
  const stage = $('#arcade-stage');
  stage.innerHTML = `
    <div class="tgame">
      <div class="tbar"><div class="tmarker"></div></div>
      <button class="btn" id="t-stop">STOP!</button>
    </div>`;
  const marker = stage.querySelector('.tmarker');
  const start = performance.now();
  let pos = 0;
  const loop = now => {
    if (!document.body.contains(marker)) { timingRaf = null; return; }
    pos = (Math.sin((now - start) * 0.0045) + 1) / 2;
    marker.style.left = `calc(${(pos * 100).toFixed(2)}% - 2px)`;
    timingRaf = requestAnimationFrame(loop);
  };
  timingRaf = requestAnimationFrame(loop);

  $('#t-stop').addEventListener('click', () => {
    cancelAnimationFrame(timingRaf);
    timingRaf = null;
    const dist = Math.abs(pos - 0.5);
    const p = ARCADE.timing;
    let payout, headline;
    if (dist < 0.06)      { payout = p.gold;   headline = '🏆 GOLD! Dead center!'; }
    else if (dist < 0.15) { payout = p.silver; headline = 'Silver — so close!'; }
    else if (dist < 0.28) { payout = p.bronze; headline = 'Bronze. Not bad!'; }
    else                  { payout = p.miss;   headline = 'Whiff! Pity coins.'; }
    arcadeAward(payout, headline);
  }, { once: true });
}

// ---------- Sticker Match (memory pairs) ----------

function startMatchGame() {
  // prefer stickers the player owns; pad from the catalog for new players
  let pool = Object.keys(state.inv);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  if (pool.length < 4) {
    const extras = Object.keys(ITEMS_BY_ID).filter(id => !pool.includes(id));
    while (pool.length < 4) {
      pool.push(extras.splice(Math.floor(Math.random() * extras.length), 1)[0]);
    }
  }
  const chosen = pool.slice(0, 4).map(id => ITEMS_BY_ID[id]);
  const cards = [...chosen, ...chosen]
    .map((it, i) => ({ key: i, item: it }))
    .sort(() => Math.random() - 0.5);

  const stage = $('#arcade-stage');
  stage.innerHTML = `
    <div class="mgame">
      <div class="mem-grid">
        ${cards.map(c => `
          <div class="mem-card" data-item="${c.item.id}">
            <div class="mem-inner">
              <div class="mem-back"><span class="msr">help</span></div>
              <div class="mem-front">
                <span class="msr" style="color:${COLLECTIONS.find(col => col.id === c.item.collection).color}">${c.item.icon}</span>
              </div>
            </div>
          </div>`).join('')}
      </div>
      <p class="mem-status">Find the pairs! Fewer misses = more coins.</p>
    </div>`;

  let open = [];
  let locked = false;
  let matched = 0;
  let misses = 0;

  stage.querySelectorAll('.mem-card').forEach(card =>
    card.addEventListener('click', () => {
      if (locked || card.classList.contains('flipped')) return;
      card.classList.add('flipped');
      open.push(card);
      if (open.length < 2) return;
      const [a, b] = open;
      if (a.dataset.item === b.dataset.item) {
        a.classList.add('matched');
        b.classList.add('matched');
        open = [];
        matched++;
        if (matched === 4) {
          const c = ARCADE.match;
          const payout = Math.max(c.floor, c.perfect - misses * c.missPenalty);
          const headline = misses === 0 ? '🏆 PERFECT memory!'
            : `All matched — ${misses} miss${misses === 1 ? '' : 'es'}.`;
          setTimeout(() => arcadeAward(payout, headline), 500);
        }
      } else {
        locked = true;
        misses++;
        setTimeout(() => {
          a.classList.remove('flipped');
          b.classList.remove('flipped');
          open = [];
          locked = false;
        }, 700);
      }
    }));
}
