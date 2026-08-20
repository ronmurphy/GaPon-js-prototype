// GaPon — the Corinth room. A peg board where you aim three balls, and the
// three pockets they land in are summed to decide what you win.
//
// The simulation is deliberately split from the animation: `simulateDrop()`
// runs the whole physics synchronously and hands back the landing slot plus
// the path it took, and the animation just replays that path. That means the
// outcome can never disagree with what the player watched, and it makes the
// scoring testable without needing to render a single frame.

const CORINTH_W = 300;         // simulation space (scaled to fit on screen)
const CORINTH_H = 380;
const PEG_ROWS = 8;
const PEG_R = 4;
const BALL_R = 7;
const SLOT_TOP = CORINTH_H - 54;

// Staggered peg grid, the classic bagatelle layout.
//
// Crucially the grid runs all the way to the walls — pegs sit ON x=0 and
// x=W on alternate rows. An earlier version left a clear gutter down each
// side, which let an edge-dropped ball fall straight into the 5-pocket 89%
// of the time; the high-value edges have to be *fought* for, or the inverted
// board has no tension at all.
function corinthPegs() {
  const pegs = [];
  const top = 70, gapY = (SLOT_TOP - top) / PEG_ROWS;
  const cols = 8, g = CORINTH_W / cols;
  for (let row = 0; row < PEG_ROWS; row++) {
    const odd = row % 2;
    const y = top + row * gapY;
    if (odd) {
      for (let i = 0; i < cols; i++) pegs.push({ x: (i + 0.5) * g, y });
    } else {
      for (let i = 0; i <= cols; i++) pegs.push({ x: i * g, y });
    }
  }
  return pegs;
}

const CORINTH_PEGS = corinthPegs();

function slotOf(x) {
  const n = CORINTH.slots.length;
  return Math.max(0, Math.min(n - 1, Math.floor(x / (CORINTH_W / n))));
}

// Run one ball to rest. Returns { slot, value, path }.
function simulateDrop(startX, rand = Math.random) {
  let x = Math.max(BALL_R, Math.min(CORINTH_W - BALL_R, startX));
  let y = 24, vx = (rand() - 0.5) * 0.6, vy = 0;
  const path = [];
  for (let step = 0; step < 1200; step++) {
    vy += 0.32;                                   // gravity
    vx *= 0.995;                                  // drag
    x += vx;
    y += vy;
    // side walls
    if (x < BALL_R) { x = BALL_R; vx = Math.abs(vx) * 0.5; }
    if (x > CORINTH_W - BALL_R) { x = CORINTH_W - BALL_R; vx = -Math.abs(vx) * 0.5; }
    // pegs: bounce off, with a nudge so a dead-centre hit still picks a side
    if (y < SLOT_TOP) {
      for (const p of CORINTH_PEGS) {
        const dx = x - p.x, dy = y - p.y;
        const d = Math.hypot(dx, dy);
        if (d < PEG_R + BALL_R && d > 0) {
          const nx = dx / d, ny = dy / d;
          const overlap = PEG_R + BALL_R - d;
          x += nx * overlap;
          y += ny * overlap;
          const dot = vx * nx + vy * ny;
          vx = (vx - 2 * dot * nx) * 0.62 + (rand() - 0.5) * 0.9;
          vy = (vy - 2 * dot * ny) * 0.62;
          break;
        }
      }
    } else {
      // between the pocket dividers: nudge into a pocket centre and settle
      const n = CORINTH.slots.length, w = CORINTH_W / n;
      const centre = (slotOf(x) + 0.5) * w;
      x += (centre - x) * 0.25;
      vx *= 0.7;
    }
    path.push([Math.round(x * 10) / 10, Math.round(y * 10) / 10]);
    if (y >= CORINTH_H - BALL_R) break;
  }
  const slot = slotOf(x);
  return { slot, value: CORINTH.slots[slot], path };
}

function corinthRarity(total) {
  return CORINTH.tiers.find(t => total >= t.min).rarity;
}

// ---------- the room ----------

let corinthMachines = [];

function corinthOpen() {
  document.querySelector('#shop').hidden = true;
  document.querySelector('.shop-tip').hidden = true;
  document.querySelector('#parlour').hidden = false;
  document.querySelector('#parlour-tip').hidden = false;
  renderParlour();
  sfx.thunk();
}

function corinthClose() {
  document.querySelector('#parlour').hidden = true;
  document.querySelector('#parlour-tip').hidden = true;
  document.querySelector('#shop').hidden = false;
  document.querySelector('.shop-tip').hidden = false;
  sfx.thunk();
}

// Three machines, a randomised mix of Corinth boards and medal pushers —
// seeded off the period like the shop floor, so everyone sees the same room
// and it changes at restock. Always at least one of each, so a visit is
// never all of one thing.
function corinthBoards() {
  const rng = mulberry32(hashString('corinth:' + currentPeriod()));
  const pool = COLLECTIONS.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  const kinds = [0, 1, 2].map(() => rng() < 0.5 ? 'push' : 'board');
  if (!kinds.includes('board')) kinds[Math.floor(rng() * 3)] = 'board';
  if (!kinds.includes('push')) kinds[Math.floor(rng() * 3)] = 'push';
  return kinds.map((kind, i) => ({ id: 'c' + i, kind, collection: pool[i] }));
}

function renderParlour() {
  const host = document.querySelector('#corinth-row');
  host.innerHTML = '';
  corinthMachines = [];
  document.querySelector('#parlour-name').textContent =
    THEME.id === 'jp' ? 'コリントゲーム' : 'Lucky Drop';
  for (const b of corinthBoards()) {
    if (b.kind === 'push') { renderPusher(host, b); continue; }
    const col = b.collection;
    const card = document.createElement('div');
    card.className = 'corinth';
    card.innerHTML = `
      <div class="cor-topper">${THEME.id === 'jp' ? 'コリント' : 'Lucky Drop'}</div>
      <div class="cor-band">
        <span class="m-col" style="color:${col.color}">${col.name}</span>
        <span class="m-prog">${collectionProgress(col)}/${col.items.length}</span>
      </div>
      <div class="cor-board">
        <canvas width="${CORINTH_W}" height="${CORINTH_H}"></canvas>
        <div class="cor-aim" hidden></div>
      </div>
      <div class="cor-foot">
        <span class="cor-tally" data-tally>drop 3 balls</span>
        <button class="btn small" data-play>${coinIcon()} Play · ${CORINTH.cost}</button>
      </div>`;
    host.appendChild(card);
    const state = { card, b, col, ctx: card.querySelector('canvas').getContext('2d'),
                    balls: [], playing: false, left: 0, total: 0 };
    corinthMachines.push(state);
    drawCorinth(state);
    card.querySelector('[data-play]').addEventListener('click', () => corinthPlay(state));
    card.querySelector('.cor-board').addEventListener('click', e => corinthAim(state, e));
  }
}

// ---------- drawing ----------

function drawCorinth(st, live) {
  const ctx = st.ctx;
  ctx.clearRect(0, 0, CORINTH_W, CORINTH_H);
  const jp = THEME.id === 'jp';
  // board face
  ctx.fillStyle = jp ? '#10233a' : '#1b1233';
  ctx.fillRect(0, 0, CORINTH_W, CORINTH_H);
  // pockets
  const n = CORINTH.slots.length, w = CORINTH_W / n;
  for (let i = 0; i < n; i++) {
    const v = CORINTH.slots[i];
    const hot = v >= 4;
    ctx.fillStyle = hot ? 'rgba(255,193,7,0.16)' : 'rgba(255,255,255,0.05)';
    ctx.fillRect(i * w + 1, SLOT_TOP, w - 2, CORINTH_H - SLOT_TOP);
    ctx.fillStyle = hot ? '#ffc107' : '#9fb3d9';
    ctx.font = '700 17px Fredoka, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(v, i * w + w / 2, CORINTH_H - 18);
    // divider
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(i * w, SLOT_TOP);
    ctx.lineTo(i * w, CORINTH_H);
    ctx.stroke();
  }
  // pegs
  for (const p of CORINTH_PEGS) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, PEG_R, 0, Math.PI * 2);
    ctx.fillStyle = jp ? '#cfd8dc' : '#8d7fb8';
    ctx.fill();
  }
  // balls currently in flight / at rest
  for (const b of st.balls) {
    ctx.beginPath();
    ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2);
    const g = ctx.createRadialGradient(b.x - 3, b.y - 3, 1, b.x, b.y, BALL_R);
    g.addColorStop(0, '#ffffff');
    g.addColorStop(1, b.done ? '#78909c' : '#b0bec5');
    ctx.fillStyle = g;
    ctx.fill();
  }
}

// ---------- play ----------

function corinthPlay(st) {
  if (st.playing) return;
  if (state.coins < CORINTH.cost) {
    sfx.buzz();
    toast(`Not enough coins — ${CORINTH.cost} to play.`, 'warn');
    return;
  }
  state.coins -= CORINTH.cost;
  saveGame();
  updateHeader();
  sfx.coin();
  st.playing = true;
  st.left = CORINTH.balls;
  st.total = 0;
  st.balls = [];
  st.card.querySelector('[data-play]').disabled = true;
  st.card.querySelector('.cor-aim').hidden = false;
  setCorinthTally(st, `tap the board to aim — ${st.left} balls left`);
  drawCorinth(st);
}

function corinthAim(st, ev) {
  if (!st.playing || st.left <= 0 || st.dropping) return;
  const box = ev.currentTarget.getBoundingClientRect();
  const x = ((ev.clientX - box.left) / box.width) * CORINTH_W;
  corinthDrop(st, x);
}

function corinthDrop(st, x) {
  st.dropping = true;
  st.left--;
  const res = simulateDrop(x);
  const ball = { x, y: 24, done: false };
  st.balls.push(ball);
  sfx.tick();
  let i = 0;
  // replay the simulated path — the outcome is already decided, so what the
  // player sees can never disagree with what they get
  const timer = setInterval(() => {
    for (let k = 0; k < 3 && i < res.path.length; k++, i++) {
      ball.x = res.path[i][0];
      ball.y = res.path[i][1];
    }
    drawCorinth(st);
    if (i >= res.path.length) {
      clearInterval(timer);
      ball.done = true;
      st.total += res.value;
      sfx.blip(300 + res.value * 90);
      st.dropping = false;
      if (st.left > 0) {
        setCorinthTally(st, `${res.value}! total ${st.total} — ${st.left} to go`);
      } else {
        setCorinthTally(st, `total ${st.total}!`);
        setTimeout(() => corinthFinish(st), 700);
      }
    }
  }, 16);
}

function setCorinthTally(st, text) {
  st.card.querySelector('[data-tally]').textContent = text;
}

function corinthFinish(st) {
  // a held fortune adds to the score before it's graded
  const f = heldFortune();
  const bonus = f ? (OMIKUJI_BALL_BONUS[f.id] || 0) : 0;
  if (f) {
    clearFortune();
    updateFortuneChip();
  }
  const scored = st.total + bonus;
  const rarity = corinthRarity(scored);
  const pool = st.col.items.filter(it => it.rarity === rarity);
  const item = pool[Math.floor(Math.random() * pool.length)];
  const isNew = !hasItem(item.id);
  const foil = addItem(item.id);
  state.totalPulls++;
  saveGame();
  updateFooter();
  st.playing = false;
  st.card.querySelector('[data-play]').disabled = false;
  st.card.querySelector('.cor-aim').hidden = true;
  st.card.querySelector('.m-prog').textContent =
    `${collectionProgress(st.col)}/${st.col.items.length}`;
  showGiftReveal(item, isNew, null, {
    chip: bonus ? `🎱 ${st.total} +${bonus} ${f.kanji} = ${scored}` : `🎱 scored ${st.total}`,
    pull: true, foil,
  });
  setTimeout(() => { st.balls = []; drawCorinth(st); }, 400);
}
