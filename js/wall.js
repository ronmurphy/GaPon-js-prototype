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
    ctx.fillStyle = st.color || col.color;
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

// ---------- save-in-the-picture (LSB steganography) ----------
// The exported PNG hides the full save code in the low bit of each R/G/B
// channel (alpha untouched — it stays 255, so canvas round-trips exactly).
// A 1080² wall holds ~437 KB; a save code is ~3 KB. PNG is lossless, so the
// data survives as long as nobody recompresses/resizes the image.

const STEG_MAGIC = 'GAPN1';

function stegChannel(bitIndex) {
  // pack bits into R,G,B and skip every alpha byte
  return Math.floor(bitIndex / 3) * 4 + (bitIndex % 3);
}

function stegEmbed(imgData, text) {
  const enc = new TextEncoder();
  const bytes = enc.encode(text);
  const head = enc.encode(STEG_MAGIC);
  const payload = new Uint8Array(head.length + 4 + bytes.length);
  payload.set(head, 0);
  for (let i = 0; i < 4; i++) {
    payload[head.length + i] = (bytes.length >>> (8 * (3 - i))) & 255;
  }
  payload.set(bytes, head.length + 4);
  const d = imgData.data;
  if (stegChannel(payload.length * 8) >= d.length) return false; // never at 1080²
  for (let i = 0; i < payload.length * 8; i++) {
    const bit = (payload[i >> 3] >> (7 - (i & 7))) & 1;
    const ch = stegChannel(i);
    d[ch] = (d[ch] & 0xFE) | bit;
  }
  return true;
}

function stegExtract(imgData) {
  const d = imgData.data;
  const readByte = idx => {
    let v = 0;
    for (let k = 0; k < 8; k++) {
      const ch = stegChannel(idx * 8 + k);
      if (ch >= d.length) return -1;
      v = (v << 1) | (d[ch] & 1);
    }
    return v;
  };
  const dec = new TextDecoder();
  const head = new Uint8Array(STEG_MAGIC.length);
  for (let i = 0; i < head.length; i++) {
    const b = readByte(i);
    if (b < 0) return null;
    head[i] = b;
  }
  if (dec.decode(head) !== STEG_MAGIC) return null;
  let len = 0;
  for (let i = 0; i < 4; i++) len = (len * 256) + readByte(head.length + i);
  if (len <= 0 || stegChannel((head.length + 4 + len) * 8) >= d.length) return null;
  const out = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    const b = readByte(head.length + 4 + i);
    if (b < 0) return null;
    out[i] = b;
  }
  return dec.decode(out);
}

// ---------- interaction ----------

// swatch row under the canvas: visible only while a sticker is selected
function syncWallPalette() {
  const pal = $('#wall-palette');
  if (!pal) return;
  const st = wallItems()[wallSel];
  pal.hidden = !st;
  if (!st) return;
  const it = ITEMS_BY_ID[st.id];
  const col = COLLECTIONS.find(c => c.id === it.collection);
  pal.querySelector('.wp-auto').style.background = col.color;
  pal.querySelectorAll('.wp-swatch').forEach(sw =>
    sw.classList.toggle('active', (sw.dataset.color || '') === (st.color || '')));
}

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
      syncWallPalette();
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
      syncWallPalette();
      return;
    }
  }

  wallSel = -1;
  drawWall();
  syncWallPalette();
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
    <div class="wall-palette" id="wall-palette" hidden>
      <span class="wp-label">Color:</span>
      <button class="wp-swatch wp-auto" data-color="" title="Collection color"></button>
      ${CAPSULE_COLORS.map(c =>
        `<button class="wp-swatch" data-color="${c}" style="background:${c}"></button>`).join('')}
    </div>
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
      syncWallPalette();
    }));

  host.querySelectorAll('.wp-swatch').forEach(sw =>
    sw.addEventListener('click', () => {
      const st = wallItems()[wallSel];
      if (!st) return;
      if (sw.dataset.color) st.color = sw.dataset.color;
      else delete st.color;   // "auto" = back to collection color
      saveGame();
      drawWall();
      syncWallPalette();
    }));

  $('#wall-save').addEventListener('click', () => {
    wallSel = -1;
    drawWall();
    syncWallPalette();
    // bake the full save into a copy's pixels — the picture IS a backup
    const tmp = document.createElement('canvas');
    tmp.width = tmp.height = WALL.size;
    const tctx = tmp.getContext('2d');
    tctx.drawImage(wallCanvas, 0, 0);
    const img = tctx.getImageData(0, 0, WALL.size, WALL.size);
    stegEmbed(img, btoa(unescape(encodeURIComponent(JSON.stringify(state)))));
    tctx.putImageData(img, 0, 0);
    tmp.toBlob(blob => {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'gapon-wall.png';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 3000);
    });
    toast('Wall saved — the PNG doubles as a full save backup!', 'good');
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
