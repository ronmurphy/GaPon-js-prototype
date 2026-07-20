// GaPon — tiny effects toolkit: number tweens, sparkle bursts, floating
// text, tab entrances. Web Animations API only, no dependencies.

const FX_REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;

const FX_SPARK_CHARS = ['✦', '✧', '✶'];

// Tween an element's number to a new value with a little parent-chip pop.
function fxCountTo(el, to, ms = 500) {
  const from = parseInt(el.dataset.fxVal ?? '0', 10) || 0;
  el.dataset.fxVal = to;
  if (FX_REDUCED || from === to) {
    el.textContent = to.toLocaleString();
    return;
  }
  const t0 = performance.now();
  const step = now => {
    const p = Math.min(1, (now - t0) / ms);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = Math.round(from + (to - from) * eased).toLocaleString();
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
  el.parentElement.animate(
    [{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }],
    { duration: 300, easing: 'ease-out' });
}

// Small text that drifts away from an anchor element (e.g. "+45").
function fxFloat(text, anchorEl, color = '#ffc107') {
  if (FX_REDUCED || !anchorEl) return;
  const r = anchorEl.getBoundingClientRect();
  const el = document.createElement('div');
  el.className = 'fx-float';
  el.textContent = text;
  el.style.color = color;
  el.style.left = (r.left + r.width / 2) + 'px';
  el.style.top = (r.bottom + 4) + 'px';
  document.body.appendChild(el);
  el.animate([
    { transform: 'translate(-50%, 0)', opacity: 0 },
    { transform: 'translate(-50%, 12px)', opacity: 1, offset: 0.25 },
    { transform: 'translate(-50%, 38px)', opacity: 0 },
  ], { duration: 1100, easing: 'ease-out' }).onfinish = () => el.remove();
}

// Twinkling star burst radiating out from an element's center.
function fxSparkleBurst(anchorEl, { count = 12, color = '#ffc107', spread = 90 } = {}) {
  if (FX_REDUCED || !anchorEl || !anchorEl.isConnected) return;
  const r = anchorEl.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  for (let i = 0; i < count; i++) {
    const s = document.createElement('span');
    s.className = 'fx-spark';
    s.textContent = FX_SPARK_CHARS[Math.floor(Math.random() * FX_SPARK_CHARS.length)];
    s.style.color = color;
    s.style.left = cx + 'px';
    s.style.top = cy + 'px';
    s.style.fontSize = (12 + Math.random() * 14) + 'px';
    document.body.appendChild(s);
    const ang = Math.random() * Math.PI * 2;
    const d = spread * (0.5 + Math.random() * 0.8);
    const dx = Math.cos(ang) * d, dy = Math.sin(ang) * d;
    s.animate([
      { transform: 'translate(-50%,-50%) scale(0) rotate(0deg)', opacity: 1 },
      { transform: `translate(calc(-50% + ${(dx * 0.7).toFixed(1)}px), calc(-50% + ${(dy * 0.7).toFixed(1)}px)) scale(1.15) rotate(120deg)`,
        opacity: 1, offset: 0.4 },
      { transform: `translate(calc(-50% + ${dx.toFixed(1)}px), calc(-50% + ${dy.toFixed(1)}px)) scale(0) rotate(220deg)`,
        opacity: 0 },
    ], { duration: 700 + Math.random() * 500, easing: 'cubic-bezier(.2,.8,.4,1)', delay: Math.random() * 180 })
      .onfinish = () => s.remove();
  }
}

// Gentle entrance for a tab section.
function fxTabIn(el) {
  if (FX_REDUCED) return;
  el.animate([
    { opacity: 0, transform: 'translateY(10px)' },
    { opacity: 1, transform: 'translateY(0)' },
  ], { duration: 220, easing: 'ease-out' });
}
