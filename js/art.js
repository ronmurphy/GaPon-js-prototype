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

// Markup for a sticker's face — PNG art when owned & available, else glyph.
// Unowned stickers always render as the glyph silhouette to keep the album's
// mystery intact (you don't get to see the art before you pull it).
function stickerFace(item, { owned = true, cls = '' } = {}) {
  const src = owned ? itemArtSrc(item) : null;
  if (src) {
    return `<img class="sticker-img ${cls}" src="${src}" alt="" draggable="false">`;
  }
  const col = COLLECTIONS.find(c => c.id === item.collection);
  return `<span class="msr ${cls}" style="${owned ? `color:${col.color}` : ''}">${item.icon}</span>`;
}
