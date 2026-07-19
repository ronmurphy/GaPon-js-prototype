// GaPon — sticker wall: place owned stickers, drag / rotate / resize with
// mouse or touch (pointer events), export as a shareable PNG.

const WALL = {
  size: 1080,        // internal canvas resolution (also the PNG size)
  base: 130,         // sticker radius at scale 1
  minScale: 0.45,
  maxScale: 2.2,
  handleR: 44,       // drawn handle radius
  hitR: 100,         // generous hit radius so handles are tappable on phones
};

let wallCanvas = null;
let wallCtx = null;
let wallSel = -1;       // index into state.wall
let wallDrag = null;    // { mode: 'move'|'spin', dx, dy }

function wallItems() { return state.wall || (state.wall = []); }

// ---------- geometry ----------

function wallPos(e) {
  const rect = wallCanvas.getBoundingClientRect();
  return {
    x: (e.clientX - rect.left) / rect.width * WALL.size,
    y: (e.clientY - rect.top) / rect.height * WALL.size,
  };
}

// spin handle sits at the sticker's lower-right "corner", delete at upper-left
function wallHandlePos(st, which) {
  const S = WALL.size;
  const d = WALL.base * st.s * 1.3;
  const a = st.rot + (which === 'spin' ? Math.PI / 4 : Math.PI / 4 + Math.PI);
  return { x: st.x * S + Math.cos(a) * d, y: st.y * S + Math.sin(a) * d };
}

function dist(ax, ay, bx, by) { return Math.hypot(bx - ax, by - ay); }

// ---------- drawing ----------

function drawWall() {
  if (!wallCtx) return;
  const ctx = wallCtx, S = WALL.size;

  const grad = ctx.createLinearGradient(0, 0, 0, S);
  grad.addColorStop(0, '#332f4d');
  grad.addColorStop(1, '#211e2e');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, S, S);

  for (const st of wallItems()) {
    const it = ITEMS_BY_ID[st.id];
    if (!it) continue;
    const col = COLLECTIONS.find(c => c.id === it.collection);
    const r = WALL.base * st.s;
    ctx.save();
    ctx.translate(st.x * S, st.y * S);
    ctx.rotate(st.rot);
    // white die-cut backing with a drop shadow, like a real sticker
    ctx.shadowColor = 'rgba(0,0,0,0.35)';
    ctx.shadowBlur = 16;
    ctx.shadowOffsetY = 6;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = '#f5f3ee';
    ctx.fill();
    ctx.shadowColor = 'transparent';
    ctx.strokeStyle = 'rgba(0,0,0,0.1)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = col.color;
    ctx.font = `${Math.round(r * 1.2)}px "Material Symbols Rounded"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(it.icon, 0, r * 0.05);
    ctx.restore();
  }

  ctx.fillStyle = 'rgba(240,237,247,0.45)';
  ctx.font = '600 34px Fredoka, sans-serif';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillText('GaPon', S - 24, S - 16);

  // selection ring + handles (drawn last, skipped during PNG export)
  const st = wallItems()[wallSel];
  if (st) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.setLineDash([12, 9]);
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(st.x * S, st.y * S, WALL.base * st.s * 1.3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const which of ['spin', 'delete']) {
      const h = wallHandlePos(st, which);
      ctx.beginPath();
      ctx.arc(h.x, h.y, WALL.handleR, 0, Math.PI * 2);
      ctx.fillStyle = which === 'spin' ? '#ffc107' : '#ef5350';
      ctx.fill();
      ctx.fillStyle = '#1c1a26';
      ctx.font = `${WALL.handleR + 8}px "Material Symbols Rounded"`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(which === 'spin' ? 'rotate_right' : 'close', h.x, h.y + 3);
    }
    ctx.restore();
  }
}

// ---------- interaction ----------

function wallPointerDown(e) {
  e.preventDefault();
  const p = wallPos(e);
  const items = wallItems();
  const sel = items[wallSel];

  if (sel) {
    const spin = wallHandlePos(sel, 'spin');
    if (dist(p.x, p.y, spin.x, spin.y) < WALL.hitR) {
      wallDrag = { mode: 'spin' };
      wallCanvas.setPointerCapture(e.pointerId);
      return;
    }
    const del = wallHandlePos(sel, 'delete');
    if (dist(p.x, p.y, del.x, del.y) < WALL.hitR) {
      items.splice(wallSel, 1);
      wallSel = -1;
      saveGame();
      drawWall();
      return;
    }
  }

  // hit-test stickers top-down; selecting brings the sticker to the front
  for (let i = items.length - 1; i >= 0; i--) {
    const st = items[i];
    const sx = st.x * WALL.size, sy = st.y * WALL.size;
    if (dist(p.x, p.y, sx, sy) < Math.max(WALL.base * st.s, 70)) {
      items.push(items.splice(i, 1)[0]);
      wallSel = items.length - 1;
      wallDrag = { mode: 'move', dx: sx - p.x, dy: sy - p.y };
      wallCanvas.setPointerCapture(e.pointerId);
      drawWall();
      return;
    }
  }

  wallSel = -1;
  drawWall();
}

function wallPointerMove(e) {
  if (!wallDrag) return;
  const st = wallItems()[wallSel];
  if (!st) return;
  const p = wallPos(e);
  if (wallDrag.mode === 'move') {
    st.x = Math.min(0.97, Math.max(0.03, (p.x + wallDrag.dx) / WALL.size));
    st.y = Math.min(0.97, Math.max(0.03, (p.y + wallDrag.dy) / WALL.size));
  } else {
    const dx = p.x - st.x * WALL.size, dy = p.y - st.y * WALL.size;
    st.rot = Math.atan2(dy, dx) - Math.PI / 4;
    st.s = Math.min(WALL.maxScale,
      Math.max(WALL.minScale, Math.hypot(dx, dy) / 1.3 / WALL.base));
  }
  drawWall();
}

function wallPointerUp() {
  if (!wallDrag) return;
  wallDrag = null;
  saveGame();
}

// ---------- render ----------

function renderWall() {
  const host = $('#tab-wall');
  wallSel = -1;
  wallDrag = null;

  const owned = [];
  for (const col of COLLECTIONS) {
    for (const it of col.items) if (ownedCount(it.id) > 0) owned.push(it);
  }

  host.innerHTML = `
    <h2>Sticker Wall</h2>
    <p class="wall-sub">Tap a sticker below to add it · drag to move ·
      yellow handle spins &amp; sizes · then save a PNG and show off!</p>
    <canvas id="wall-canvas" width="${WALL.size}" height="${WALL.size}"></canvas>
    <div class="wall-actions">
      <button class="btn" id="wall-save"><span class="msr">download</span> Save PNG</button>
      <button class="btn ghost" id="wall-clear" ${wallItems().length ? '' : 'disabled'}>Clear wall</button>
    </div>
    <div class="wall-tray">
      ${owned.length
        ? owned.map(it => {
            const col = COLLECTIONS.find(c => c.id === it.collection);
            return `<div class="cell wall-pick" data-add="${it.id}" title="${it.name}"
                         style="--rar:${RARITIES[it.rarity].color}">
              <span class="msr" style="color:${col.color}">${it.icon}</span>
            </div>`;
          }).join('')
        : '<p class="empty">No stickers yet — go pull some capsules!</p>'}
    </div>`;

  wallCanvas = $('#wall-canvas');
  wallCtx = wallCanvas.getContext('2d');

  wallCanvas.addEventListener('pointerdown', wallPointerDown);
  wallCanvas.addEventListener('pointermove', wallPointerMove);
  wallCanvas.addEventListener('pointerup', wallPointerUp);
  wallCanvas.addEventListener('pointercancel', wallPointerUp);

  host.querySelectorAll('[data-add]').forEach(cell =>
    cell.addEventListener('click', () => {
      wallItems().push({
        id: cell.dataset.add,
        x: 0.5 + (Math.random() - 0.5) * 0.25,
        y: 0.5 + (Math.random() - 0.5) * 0.25,
        rot: (Math.random() - 0.5) * 0.6,
        s: 1,
      });
      wallSel = wallItems().length - 1;
      saveGame();
      drawWall();
    }));

  $('#wall-save').addEventListener('click', () => {
    wallSel = -1;
    drawWall();
    wallCanvas.toBlob(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'gapon-wall.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    });
    toast('Wall saved as PNG!', 'good');
  });

  $('#wall-clear').addEventListener('click', () => {
    if (!confirm('Remove every sticker from the wall?')) return;
    state.wall = [];
    saveGame();
    renderWall();
  });

  drawWall();
  // glyphs need the icon font; redraw once it's certainly ready
  document.fonts.load('24px "Material Symbols Rounded"').then(drawWall);
}
