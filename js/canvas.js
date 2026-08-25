// GaPon — canvas capsule pile inside each machine's glass dome.

// NB: no yellow in the normal palette — gold is reserved for ticket capsules,
// so a glint of gold in the dome always means a FREE PLAY inside.
const CAPSULE_COLORS = ['#ef5350', '#ec407a', '#ab47bc', '#5c6bc0',
  '#29b6f6', '#26a69a', '#9ccc65', '#ff7043'];

const activeSims = [];

const CAP_GOLD = '#ffc107';

class MachineSim {
  // `count` mirrors the machine's real remaining stock — the pile IS the
  // stock display, so it never refills on its own. `goldCount` of them are
  // golden FREE PLAY ticket capsules, visible in the dome.
  // `capacity` is what this machine holds when FULL — capsule size follows it,
  // not `count`. Sizing off what's left made the survivors grow every time the
  // page reloaded: a Pebble Pon with 15 of its 25 gone came back with capsules
  // half again as big as the ones it started with. Size is a property of the
  // machine, not of how empty it is.
  constructor(canvas, count = 11, goldCount = 0, withClaw = false, capacity = 0, shape = 'round') {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.w = canvas.width;
    this.h = canvas.height;
    // Capsule size follows the machine's CAPACITY, because machines no longer
    // all hold ten (see ECON.stockBudget). A fixed radius piled 25 capsules
    // 16px above the top of the glass. Area per capsule scales as 1/n, so the
    // radius scales as 1/sqrt(n) — and this is what a stuffed arcade machine
    // actually looks like: lots of small prizes, or three big ones.
    this.capR = MachineSim.radiusFor(capacity || count);
    this.shape = shape;
    this.shakeFrames = 0;
    this.capsules = [];
    // claw machines hang a grabber in the same glass box; shop.js drives it
    this.claw = withClaw ? { x: this.w / 2, y: 16, open: 1, holding: null } : null;
    for (let i = 0; i < count; i++) this.spawnCapsule(true, i < goldCount);
    activeSims.push(this);
  }

  // Trace a capsule outline of the given shape, radius r, centred on 0,0.
  // Every shape is inscribed in the same circle, so the physics — which is
  // purely distance-based on c.r — never has to know which one it is.
  static shapePath(ctx, shape, r) {
    ctx.beginPath();
    if (shape === 'hex') {
      for (let i = 0; i < 6; i++) {
        const a = Math.PI / 6 + i * Math.PI / 3;      // flat-top
        const x = Math.cos(a) * r, y = Math.sin(a) * r;
        i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
      }
      ctx.closePath();
    } else if (shape === 'square') {
      const k = r * 0.82, rad = r * 0.3;              // rounded square
      if (ctx.roundRect) ctx.roundRect(-k, -k, k * 2, k * 2, rad);
      else ctx.rect(-k, -k, k * 2, k * 2);
    } else {
      ctx.arc(0, 0, r, 0, Math.PI * 2);
    }
  }

  // How many rotations look identical. A hexagon never has to turn more than
  // 30 degrees to sit flat; a circle is never wrong, so it is left alone.
  static shapeFacets(shape) {
    return shape === 'hex' ? 6 : shape === 'square' ? 4 : 0;
  }

  static radiusFor(capacity) {
    return Math.max(8, Math.min(19, 15 * Math.sqrt(10 / Math.max(1, capacity))));
  }

  // How close the claw has to be to grip. Follows capsule size so the feel
  // holds whatever the machine is stocked with — at the old fixed r=15 this is
  // exactly the 22px it has always been. A flat 22 would make the catchable
  // zone SMALLER than a big capsule in a sparse machine: you'd be sitting
  // right over one and miss.
  grabReach() { return (this.capR || 15) + 7; }

  // Nearest catchable capsule to a given x, or null. Used by the claw.
  capsuleNear(x, maxDist) {
    let best = null, bestD = maxDist;
    for (const c of this.capsules) {
      if (c.dispensing || c.heldByClaw) continue;
      const d = Math.abs(c.x - x);
      if (d < bestD) { bestD = d; best = c; }
    }
    return best;
  }

  removeCapsule(c) {
    const i = this.capsules.indexOf(c);
    if (i >= 0) this.capsules.splice(i, 1);
  }

  spawnCapsule(settled, gold = false) {
    const r = this.capR || 15;
    const shape = this.shape || 'round';
    this.capsules.push({
      x: r + Math.random() * (this.w - 2 * r),
      y: settled ? this.h - r - Math.random() * 60 : -r,
      vx: (Math.random() - 0.5) * 2,
      vy: 0,
      r,
      shape,
      gold,
      color: gold ? CAP_GOLD : CAPSULE_COLORS[Math.floor(Math.random() * CAPSULE_COLORS.length)],
      rot: Math.random() * Math.PI * 2,
    });
  }

  // The bottom-most capsule falls out through the floor during the shake.
  // Returns its color so the reveal can show the same capsule landing in
  // the player's hand — one continuous event, and it never hints at rarity.
  // `wantGold` steers which kind leaves, so ticket pulls visibly eject the
  // golden capsule and normal pulls never do.
  shakeAndDispense(wantGold = false) {
    this.shakeFrames = 45;
    this.canvas.classList.remove('shaking');
    void this.canvas.offsetWidth; // restart CSS animation
    this.canvas.classList.add('shaking');
    let pick = null, fallback = null;
    for (const c of this.capsules) {
      if (c.dispensing) continue;
      if (!fallback || c.y > fallback.y) fallback = c;
      if (c.gold === wantGold && (!pick || c.y > pick.y)) pick = c;
    }
    pick = pick || fallback;
    if (!pick) return wantGold ? CAP_GOLD
      : CAPSULE_COLORS[Math.floor(Math.random() * CAPSULE_COLORS.length)];
    pick.dispensing = true;
    return pick.color;
  }

  step() {
    const g = 0.35, rest = 0.35;
    // ambient stir: a random capsule shifts now and then so the pile never freezes
    if (this.shakeFrames === 0 && this.capsules.length && Math.random() < 0.012) {
      const c = this.capsules[Math.floor(Math.random() * this.capsules.length)];
      if (!c.dispensing) {
        c.vy -= 1 + Math.random() * 1.5;
        c.vx += (Math.random() - 0.5) * 1.6;
      }
    }
    for (const c of this.capsules) {
      if (c.heldByClaw) continue;          // the claw owns its position
      if (this.shakeFrames > 0 && !c.dispensing) {
        c.vx += (Math.random() - 0.5) * 2.2;
        c.vy -= Math.random() * 1.4;
      }
      c.vy += g;
      if (c.dispensing) c.vx += (this.w / 2 - c.x) * 0.01; // drift to center exit
      c.x += c.vx;
      c.y += c.vy;
      c.rot += c.vx * 0.03;
      // A circle at any angle looks right, which is why this was never needed.
      // A hexagon resting at 23 degrees looks like it is floating — and since
      // collision is circular, its corners visibly overlap its neighbours. So
      // as a capsule slows, ease it onto its nearest flat face.
      //
      // Tested on vx ALONE, deliberately. A capsule resting on other capsules
      // never settles in vy: gravity keeps accumulating and the separation
      // pass corrects position but not velocity, so a pile that has not moved
      // in 600 frames still reads as falling at 3.2. vx is the honest signal —
      // it is what drives rot in the first place, and it really does reach 0.
      const facets = MachineSim.shapeFacets(c.shape);
      if (facets && Math.abs(c.vx) < 0.35) {
        const step = Math.PI * 2 / facets;
        const nearest = Math.round(c.rot / step) * step;
        c.rot += (nearest - c.rot) * 0.18;
      }
      if (c.x < c.r) { c.x = c.r; c.vx = Math.abs(c.vx) * rest; }
      if (c.x > this.w - c.r) { c.x = this.w - c.r; c.vx = -Math.abs(c.vx) * rest; }
      if (!c.dispensing && c.y > this.h - c.r) {
        c.y = this.h - c.r;
        c.vy = -Math.abs(c.vy) * rest;
        c.vx *= 0.92;
      }
    }
    // dispensed capsules leave through the floor for good — stock is real
    for (let i = this.capsules.length - 1; i >= 0; i--) {
      const c = this.capsules[i];
      if (c.dispensing && c.y > this.h + c.r) this.capsules.splice(i, 1);
    }
    // simple pairwise separation (skip the escaping capsule so it slips out)
    for (let i = 0; i < this.capsules.length; i++) {
      for (let j = i + 1; j < this.capsules.length; j++) {
        const a = this.capsules[i], b = this.capsules[j];
        if (a.dispensing || b.dispensing || a.heldByClaw || b.heldByClaw) continue;
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

  drawClaw() {
    const ctx = this.ctx, cl = this.claw;
    ctx.save();
    // rail + cable
    ctx.fillStyle = '#546e7a';
    ctx.fillRect(0, 4, this.w, 5);
    ctx.strokeStyle = '#90a4ae';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cl.x, 9);
    ctx.lineTo(cl.x, cl.y);
    ctx.stroke();
    // aiming guide (only while lining up) — same fairness fix as the arcade
    if (cl.aiming) {
      const target = this.capsuleNear(cl.x, this.grabReach());
      ctx.strokeStyle = target ? 'rgba(255,193,7,0.5)' : 'rgba(255,255,255,0.14)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(cl.x, cl.y + 20);
      ctx.lineTo(cl.x, this.h - 4);
      ctx.stroke();
      ctx.setLineDash([]);
      if (target) {
        ctx.strokeStyle = 'rgba(255,193,7,0.85)';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.ellipse(target.x, target.y + target.r + 3, target.r + 4, 5, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
    // body + prongs
    ctx.fillStyle = '#b0bec5';
    ctx.fillRect(cl.x - 10, cl.y - 5, 20, 10);
    const spread = 5 + cl.open * 10;
    ctx.strokeStyle = '#cfd8dc';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(cl.x + s * 3, cl.y + 5);
      ctx.lineTo(cl.x + s * spread, cl.y + 15);
      ctx.lineTo(cl.x + s * (spread - 2), cl.y + 22);
      ctx.stroke();
    }
    ctx.restore();
  }

  draw() {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    if (this.claw) this.drawClaw();
    for (const c of this.capsules) {
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(c.rot);
      // gold ticket capsules glow a little
      if (c.gold) {
        MachineSim.shapePath(ctx, c.shape || 'round', c.r + 2.5);
        ctx.strokeStyle = 'rgba(255, 193, 7, 0.45)';
        ctx.lineWidth = 3;
        ctx.stroke();
      }
      // Both halves are the SAME outline clipped at the seam, so a hexagon or
      // a rounded square splits exactly the way a sphere does — one path to
      // get right instead of a bespoke top and bottom per shape.
      const shape = c.shape || 'round';
      for (const [half, fill] of [[1, c.gold ? '#ffecb3' : '#f2f0eb'], [-1, c.color]]) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(-c.r - 2, half > 0 ? 0 : -c.r - 2, (c.r + 2) * 2, c.r + 2);
        ctx.clip();
        MachineSim.shapePath(ctx, shape, c.r);
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.restore();
      }
      // seam + outline
      MachineSim.shapePath(ctx, shape, c.r);
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
