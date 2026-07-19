// GaPon — canvas capsule pile inside each machine's glass dome.

const CAPSULE_COLORS = ['#ef5350', '#ec407a', '#ab47bc', '#5c6bc0',
  '#29b6f6', '#26a69a', '#9ccc65', '#ffca28', '#ff7043'];

const activeSims = [];

class MachineSim {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.w = canvas.width;
    this.h = canvas.height;
    this.shakeFrames = 0;
    this.capsules = [];
    for (let i = 0; i < 11; i++) this.spawnCapsule(true);
    activeSims.push(this);
  }

  spawnCapsule(settled) {
    const r = 15;
    this.capsules.push({
      x: r + Math.random() * (this.w - 2 * r),
      y: settled ? this.h - r - Math.random() * 60 : -r,
      vx: (Math.random() - 0.5) * 2,
      vy: 0,
      r,
      color: CAPSULE_COLORS[Math.floor(Math.random() * CAPSULE_COLORS.length)],
      rot: Math.random() * Math.PI * 2,
    });
  }

  shakeAndDispense() {
    this.shakeFrames = 45;
    this.canvas.classList.remove('shaking');
    void this.canvas.offsetWidth; // restart CSS animation
    this.canvas.classList.add('shaking');
    // one capsule leaves the machine; restock shortly after
    if (this.capsules.length > 0) {
      this.capsules.splice(Math.floor(Math.random() * this.capsules.length), 1);
    }
    setTimeout(() => this.spawnCapsule(false), 1600);
  }

  step() {
    const g = 0.35, rest = 0.35;
    for (const c of this.capsules) {
      if (this.shakeFrames > 0) {
        c.vx += (Math.random() - 0.5) * 2.2;
        c.vy -= Math.random() * 1.4;
      }
      c.vy += g;
      c.x += c.vx;
      c.y += c.vy;
      c.rot += c.vx * 0.03;
      if (c.x < c.r) { c.x = c.r; c.vx = Math.abs(c.vx) * rest; }
      if (c.x > this.w - c.r) { c.x = this.w - c.r; c.vx = -Math.abs(c.vx) * rest; }
      if (c.y > this.h - c.r) {
        c.y = this.h - c.r;
        c.vy = -Math.abs(c.vy) * rest;
        c.vx *= 0.92;
      }
    }
    // simple pairwise separation
    for (let i = 0; i < this.capsules.length; i++) {
      for (let j = i + 1; j < this.capsules.length; j++) {
        const a = this.capsules[i], b = this.capsules[j];
        const dx = b.x - a.x, dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.01;
        const overlap = a.r + b.r - dist;
        if (overlap > 0) {
          const nx = dx / dist, ny = dy / dist, push = overlap / 2;
          a.x -= nx * push; a.y -= ny * push;
          b.x += nx * push; b.y += ny * push;
          const dvx = (b.vx - a.vx) * 0.12, dvy = (b.vy - a.vy) * 0.12;
          a.vx += dvx; a.vy += dvy;
          b.vx -= dvx; b.vy -= dvy;
        }
      }
    }
    if (this.shakeFrames > 0) this.shakeFrames--;
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    for (const c of this.capsules) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      // bottom half (white)
      ctx.beginPath();
      ctx.arc(0, 0, c.r, 0, Math.PI);
      ctx.closePath();
      ctx.fillStyle = '#f2f0eb';
      ctx.fill();
      // top half (color)
      ctx.beginPath();
      ctx.arc(0, 0, c.r, Math.PI, Math.PI * 2);
      ctx.closePath();
      ctx.fillStyle = c.color;
      ctx.fill();
      // seam + outline
      ctx.beginPath();
      ctx.arc(0, 0, c.r, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      // shine
      ctx.beginPath();
      ctx.arc(-c.r * 0.35, -c.r * 0.4, c.r * 0.22, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fill();
      ctx.restore();
    }
  }
}

function simLoop() {
  for (const sim of activeSims) {
    sim.step();
    sim.draw();
  }
  requestAnimationFrame(simLoop);
}
requestAnimationFrame(simLoop);

function clearSims() {
  activeSims.length = 0;
}
