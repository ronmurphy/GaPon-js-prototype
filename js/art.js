// GaPon — sticker art resolver. Collections that ship PNG art set an
// `artDir`; files are named <itemId>.png. Anything without art (or with art
// turned off) falls back to the Material Symbols glyph, so mixed sets work.

const ART = { enabled: true };
const ART_KEY = 'gapon-art';
try { ART.enabled = localStorage.getItem(ART_KEY) !== '0'; } catch (e) {}

function setArtEnabled(on) {
  ART.enabled = on;
  try { localStorage.setItem(ART_KEY, on ? '1' : '0'); } catch (e) {}
}

// ALWAYS build CSS url() values with this.
//
// A url() inside a custom property is resolved against the STYLESHEET that
// consumes the var(), not the element that declared it — so a relative
// 'assets/…' silently becomes 'css/assets/…', the file 404s, and anything
// masked by it vanishes without a console error. That bug has now shipped
// twice (the foil sheen, then Poko's leaf stamp). Absolute URLs have nothing
// left to resolve. document.baseURI keeps it right on GitHub Pages' subpath.
function cssUrl(path) {
  return `url('${new URL(path, document.baseURI).href}')`;
}

// URL of an item's PNG, or null to fall back to its glyph.
function itemArtSrc(item) {
  if (!ART.enabled || !item) return null;
  const col = COLLECTIONS.find(c => c.id === item.collection);
  if (!col || !col.artDir) return null;
  return `assets/stickers/${col.artDir}/${item.id}.png`;
}

// Preloaded <img> cache for canvas (wall) drawing. Redraws the wall once a
// sticker's art finishes loading so it never stays a fallback glyph.
const artImages = {};
function artImage(src) {
  let img = artImages[src];
  if (!img) {
    img = new Image();
    img.src = src;
    artImages[src] = img;
    img.addEventListener('load', () => {
      try { if (typeof wallCtx !== 'undefined' && wallCtx) drawWall(); } catch (e) {}
    });
  }
  return img;
}

// ---------- foil on canvas ----------
// The DOM sheen is a masked overlay; canvas needs the same look baked flat so
// it survives a wall export or a photo-booth save. Same rainbow, same idea.

const FOIL_COLORS = ['#ff8a65', '#ffc107', '#66bb6a', '#42a5f5', '#ab47bc'];

function foilGradient(ctx, w, h, t) {
  const g = ctx.createLinearGradient(0, h, w, 0);
  for (let i = 0; i <= FOIL_COLORS.length; i++) {
    g.addColorStop(i / FOIL_COLORS.length,
      FOIL_COLORS[Math.floor(i + t * FOIL_COLORS.length) % FOIL_COLORS.length]);
  }
  return g;
}

let foilBuf = null;
function foilBuffer(w, h) {
  if (!foilBuf) foilBuf = document.createElement('canvas');
  if (foilBuf.width !== w || foilBuf.height !== h) { foilBuf.width = w; foilBuf.height = h; }
  return foilBuf;
}

// Draw a sticker with its sheen. The offscreen buffer is NOT an optimisation:
// `source-atop` composites against everything already on the canvas, so doing
// this inline on the wall would smear rainbow over every sticker placed before
// it. `t` is fixed rather than animated — a baked PNG wants one flattering
// angle, not whichever frame the animation happened to be on.
function drawFoilImage(ctx, img, x, y, w, h, t = 0.3) {
  const bw = Math.max(1, Math.ceil(w)), bh = Math.max(1, Math.ceil(h));
  const buf = foilBuffer(bw, bh);
  const b = buf.getContext('2d');
  b.clearRect(0, 0, bw, bh);
  b.globalCompositeOperation = 'source-over';
  b.globalAlpha = 1;
  b.drawImage(img, 0, 0, bw, bh);
  b.globalCompositeOperation = 'source-atop';
  b.globalAlpha = 0.5;
  b.fillStyle = foilGradient(b, bw, bh, t);
  b.fillRect(0, 0, bw, bh);
  b.globalCompositeOperation = 'source-over';   // leave the buffer reusable
  b.globalAlpha = 1;
  ctx.drawImage(buf, x, y, w, h);
}

// Markup for a sticker's face — PNG art when owned & available, else glyph.
// Unowned stickers always render as the glyph silhouette to keep the album's
// mystery intact (you don't get to see the art before you pull it).
// A foil sheen rides on the sticker's CONTAINER, not the <img> itself — an
// <img> can't carry a ::after, and wrapping it would disturb six different
// layouts. Every place worth shimmering (the binder pocket, the reveal ring)
// already has a positioned wrapper, so it just needs the `foil` class and the
// art URL to mask against. Glyph-only sets get a rainbow glyph instead.
//
// Returns only the inline style — the caller composes its own class list,
// because emitting a second class="" attribute here would be silently ignored
// by the browser and the sheen would never appear.
//
// (It can't be an inline mask-image either: inline styles apply to the
// element, not to its ::after — hence the custom property. See cssUrl.)
function foilStyle(item) {
  const src = itemArtSrc(item);
  return src ? `--art:${cssUrl(src)}` : '';
}

// Art-backed stickers mask a rainbow to their own silhouette; glyph-only sets
// (no artDir yet) paint the rainbow into the glyph instead.
function foilClass(item) { return itemArtSrc(item) ? 'foil' : 'foil-glyph'; }

function stickerFace(item, { owned = true, cls = '' } = {}) {
  const src = owned ? itemArtSrc(item) : null;
  const col = COLLECTIONS.find(c => c.id === item.collection);
  if (src) {
    // A half-finished art set is normal while art is being drawn, so a
    // missing PNG falls back to the glyph instead of a broken image.
    return `<img class="sticker-img ${cls}" src="${src}" alt="" draggable="false"
      data-cls="${cls}" data-glyph="${item.icon}" data-color="${col.color}"
      onerror="artFallback(this)">`;
  }
  return `<span class="msr ${cls}" style="${owned ? `color:${col.color}` : ''}">${item.icon}</span>`;
}

// Swap a failed <img> for the glyph span it would have been. (Canvas drawing
// already guards on naturalWidth, so the wall needs no equivalent.)
function artFallback(img) {
  const span = document.createElement('span');
  span.className = 'msr ' + (img.dataset.cls || '');
  if (img.dataset.color) span.style.color = img.dataset.color;
  span.textContent = img.dataset.glyph || '';
  img.replaceWith(span);
}
