// GaPon — the medal pusher in the Corinth room. Top-down view of a shelf
// loaded with capsules; each play drives a ram forward, everything jostles,
// and whatever crosses the front lip is yours.
//
// Like the Corinth board, the physics runs as a pure function so the payout
// can be simulated and tuned without rendering anything. Unlike every other
// machine, the shelf is PERSISTENT — its capsule layout is saved, so the
// pile you leave behind is the pile you (or a friend) come back to.

const PUSH_R = 13;             // capsule radius in shelf space

// A fresh shelf: capsules scattered across the back two-thirds, deliberately
// a little clumped so there are gaps to exploit and clusters to topple.
// The pile is packed as a dense block resting against the lip, not scattered
// loosely. A loose shelf simply absorbs the stroke — the ram compacts the
// rear rows and the front never budges, so nothing ever falls. Contact is
// what makes a pusher work: force has to travel through the mass.
function freshShelf(count, rand = Math.random) {
  const caps = [];
  const perRow = Math.max(1, Math.floor(PUSHER.shelfW / (PUSH_R * 2)));
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / perRow), col = i % perRow;
    caps.push({
      x: PUSH_R + col * PUSH_R * 2 + (rand() - 0.5) * 4,
      // stacked back from the lip so the front rank is already close to going
      y: PUSHER.shelfD - PUSH_R * 1.6 - row * PUSH_R * 1.85 + (rand() - 0.5) * 3,
      gold: false,
    });
  }
  settleShelf(caps);
  return caps;
}

// Push capsules apart until they stop overlapping (same separation idea as
// the capsule domes, minus gravity — this is a top-down table).
function settleShelf(caps, iterations = 14) {
  for (let pass = 0; pass < iterations; pass++) {
    for (let i = 0; i < caps.length; i++) {
      for (let j = i + 1; j < caps.length; j++) {
        const a = caps[i], b = caps[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const d = Math.hypot(dx, dy) || 0.01;
        const overlap = PUSH_R * 2 - d;
        if (overlap > 0) {
          const nx = dx / d, ny = dy / d, push = overlap / 2;
          a.x -= nx * push; a.y -= ny * push;
          b.x += nx * push; b.y += ny * push;
        }
      }
    }
    for (const c of caps) {
      c.x = Math.max(PUSH_R, Math.min(PUSHER.shelfW - PUSH_R, c.x));
      if (c.y < PUSH_R) c.y = PUSH_R;
    }
  }
}

// One play. Returns { caps, fell, frames } — the new shelf, the capsules
// that went over the lip, and positions per step for the animation to replay.
function simulatePush(shelf, rand = Math.random) {
  // carry `color` through — dropping it made every capsule fall back to the
  // default red the moment the shelf came back from a push
  const caps = shelf.map(c => ({ x: c.x, y: c.y, gold: c.gold, color: c.color }));
  if (!caps.length) return { caps, fell: [], frames: [] };

  const frames = [];
  const STEPS = 30;
  const perStep = PUSHER.ramStep / STEPS;
  // The ram starts just behind the rearmost capsule so it always makes
  // contact, then drives forward. Capsules ahead only move when something
  // physically shoves them — which is the whole game: a gap swallows the
  // push and nothing falls, a tight column topples the front row off.
  let ramY = Math.min(...caps.map(c => c.y)) - PUSH_R - 1;

  for (let s = 0; s < STEPS; s++) {
    ramY += perStep;
    for (const c of caps) {
      if (c.y < ramY + PUSH_R) c.y = ramY + PUSH_R;
    }
    // several relaxation passes per step so force propagates up the column
    // instead of only reaching each capsule's immediate neighbour
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < caps.length; i++) {
        for (let j = i + 1; j < caps.length; j++) {
          const a = caps[i], b = caps[j];
          const dx = b.x - a.x, dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 0.01;
          const overlap = PUSH_R * 2 - d;
          if (overlap > 0) {
            const nx = dx / d, ny = dy / d, push = overlap / 2;
            const wob = (rand() - 0.5) * 0.35;   // keeps runs from repeating
            a.x -= nx * push + wob; a.y -= ny * push;
            b.x += nx * push + wob; b.y += ny * push;
          }
        }
      }
      for (const c of caps) {
        c.x = Math.max(PUSH_R, Math.min(PUSHER.shelfW - PUSH_R, c.x));
        if (c.y < ramY + PUSH_R) c.y = ramY + PUSH_R;
      }
    }
    frames.push(caps.map(c => [Math.round(c.x * 10) / 10, Math.round(c.y * 10) / 10]));
  }
  // anything whose centre crossed the lip tips into the tray
  const fell = [], kept = [];
  for (const c of caps) (c.y >= PUSHER.shelfD ? fell : kept).push(c);
  return { caps: kept, fell, frames };
}

// ---------- rendering ----------

const PUSH_VIEW = 1.55;        // shelf units -> css pixels

function drawPusher(st, ramY) {
  const ctx = st.ctx, W = PUSHER.shelfW, D = PUSHER.shelfD;
  const jp = THEME.id === 'jp';
  ctx.clearRect(0, 0, W, D + 34);
  // shelf bed
  ctx.fillStyle = jp ? '#1c2b44' : '#241a45';
  ctx.fillRect(0, 0, W, D);
  // depth shading so the lip reads as an edge you can fall off
  const g = ctx.createLinearGradient(0, 0, 0, D);
  g.addColorStop(0, 'rgba(0,0,0,0.35)');
  g.addColorStop(1, 'rgba(255,255,255,0.06)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, D);
  // the ram
  ctx.fillStyle = jp ? '#90a4ae' : '#6d5fa8';
  ctx.fillRect(0, Math.max(0, ramY - 12), W, 12);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.fillRect(0, Math.max(0, ramY - 12), W, 3);
  // the lip
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(0, D - 2, W, 3);
  // the tray below
  ctx.fillStyle = '#0a0716';
  ctx.fillRect(0, D + 1, W, 33);
  // capsules
  for (const c of st.caps) {
    ctx.save();
    // a capsule past the lip is falling away — fade it (this has to be set
    // before drawing, not after, or it does nothing at all)
    if (c.y > PUSHER.shelfD) ctx.globalAlpha = 0.55;
    ctx.translate(c.x, Math.min(c.y, PUSHER.shelfD + 18));
    ctx.beginPath();
    ctx.arc(0, 0, PUSH_R, Math.PI, Math.PI * 2);
    ctx.fillStyle = c.color || '#ef5350';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, PUSH_R, 0, Math.PI);
    ctx.fillStyle = '#f2f0eb';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(0, 0, PUSH_R, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-PUSH_R * 0.35, -PUSH_R * 0.4, PUSH_R * 0.2, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fill();
    ctx.restore();
  }
}

// ---------- play ----------

function pusherPlay(st) {
  if (st.busy) return;
  if (!st.caps.length) {
    sfx.buzz();
    toast('Shelf is empty — it reloads at the next restock.', 'warn');
    return;
  }
  if (state.coins < PUSHER.cost) {
    sfx.buzz();
    toast(`Not enough coins — ${PUSHER.cost} a push.`, 'warn');
    return;
  }
  state.coins -= PUSHER.cost;
  saveGame();
  updateHeader();
  sfx.coin();
  st.busy = true;
  const res = simulatePush(st.caps);
  let i = 0;
  const startRam = Math.min(...st.caps.map(c => c.y)) - PUSH_R - 1;
  const timer = setInterval(() => {
    const frame = res.frames[i];
    if (frame) {
      frame.forEach((p, k) => { if (st.caps[k]) { st.caps[k].x = p[0]; st.caps[k].y = p[1]; } });
      drawPusher(st, startRam + (PUSHER.ramStep * (i / res.frames.length)));
      i++;
      return;
    }
    clearInterval(timer);
    pusherSettle(st, res);
  }, 26);
}

function pusherSettle(st, res) {
  st.caps = res.caps.map(c => ({ ...c, color: c.color }));
  saveShelf(st.slot, st.caps);
  drawPusher(st, 0);
  st.busy = false;
  st.card.querySelector('[data-left]').textContent = `${st.caps.length} on the shelf`;
  if (!res.fell.length) {
    sfx.thunk();
    setPushTally(st, 'nothing fell — the pile is loaded though');
    return;
  }
  sfx.rattle();
  // one sticker per capsule that went over
  const won = [];
  for (let n = 0; n < res.fell.length; n++) {
    // Pebble-tier odds deliberately: at ~15 coins a capsule, Prize-tier
    // odds here would undercut the Prize Pon machine outright. The draw is
    // the spectacle and the pile, not efficiency.
    const item = rollItem({ tier: TIERS.low, collection: st.col });
    addItem(item.id);
    won.push(item);
  }
  state.totalPulls += won.length;
  saveGame();
  updateFooter();
  setPushTally(st, `${won.length} capsule${won.length > 1 ? 's' : ''} over the edge!`);
  st.card.querySelector('.m-prog').textContent =
    `${collectionProgress(st.col)}/${st.col.items.length}`;
  showPusherHaul(won);
}

function setPushTally(st, text) {
  st.card.querySelector('[data-tally]').textContent = text;
}

// A haul can be several capsules at once, so it gets its own summary rather
// than a chain of single-capsule reveals.
function showPusherHaul(items) {
  const ov = $('#overlay');
  ov.hidden = false;
  ov.innerHTML = `
    <div class="ov-stage share-stage">
      <div class="r-name">${items.length} capsule${items.length > 1 ? 's' : ''}!</div>
      <div class="haul">
        ${items.map(it => {
          const rar = RARITIES[it.rarity];
          return `<div class="haul-item" style="--rar:${rar.color}">
            ${stickerFace(it, { cls: 'haul-ic' })}
            <span class="haul-name">${it.name}</span>
          </div>`;
        }).join('')}
      </div>
      <div class="r-btns"><button class="btn" id="haul-close">Nice!</button></div>
    </div>`;
  sfx.chime();
  if (items.some(it => it.rarity === 'chase')) { sfx.fanfare(); confetti(26); }
  ov.querySelector('#haul-close').addEventListener('click', () => {
    ov.hidden = true;
    ov.innerHTML = '';
    noteStamp('pull', items.length);   // one credit per capsule that fell
  });
}

// ---------- room integration ----------

function renderPusher(host, b) {
  const col = b.collection;
  const card = document.createElement('div');
  card.className = 'corinth pushmach';
  card.innerHTML = `
    <div class="cor-topper">${THEME.id === 'jp' ? 'メダル' : 'Pusher'}</div>
    <div class="cor-band">
      <span class="m-col" style="color:${col.color}">${col.name}</span>
      <span class="m-prog">${collectionProgress(col)}/${col.items.length}</span>
    </div>
    <div class="push-shelf">
      <canvas width="${PUSHER.shelfW}" height="${PUSHER.shelfD + 34}"></canvas>
    </div>
    <div class="cor-foot">
      <span class="push-info">
        <span class="cor-tally" data-tally></span>
        <span class="push-left" data-left></span>
      </span>
      <button class="btn small" data-push>${coinIcon()} Push · ${PUSHER.cost}</button>
    </div>`;
  host.appendChild(card);
  const caps = pusherShelf(b.id);
  // colour is cosmetic and not saved — capsule colour never hints at rarity
  for (const c of caps) c.color = CAPSULE_COLORS[Math.floor(Math.random() * CAPSULE_COLORS.length)];
  const st = { card, slot: b.id, col, caps, busy: false,
               ctx: card.querySelector('canvas').getContext('2d') };
  corinthMachines.push(st);
  card.querySelector('[data-left]').textContent = `${caps.length} on the shelf`;
  drawPusher(st, 0);
  card.querySelector('[data-push]').addEventListener('click', () => pusherPlay(st));
}
