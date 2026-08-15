// GaPon — tiny synthesized sound kit. Everything is built from oscillators
// and one shared noise buffer, so the whole soundscape costs zero downloads
// and works offline. Muting persists per-browser (outside the save).

const SFX_KEY = 'gapon-sfx';
const SFX = { muted: false, ctx: null };
try { SFX.muted = localStorage.getItem(SFX_KEY) === '0'; } catch (e) {}

function sfxSetMuted(m) {
  SFX.muted = m;
  try { localStorage.setItem(SFX_KEY, m ? '0' : '1'); } catch (e) {}
}

// Mobile browsers only allow audio after a user gesture, so the context is
// created lazily the first time a sound actually plays (always inside a
// click/pointer handler in practice).
function sfxCtx() {
  if (!SFX.ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    SFX.ctx = new AC();
  }
  if (SFX.ctx.state === 'suspended') SFX.ctx.resume();
  return SFX.ctx;
}

let sfxNoiseBuf = null;
function sfxNoise(ctx) {
  if (!sfxNoiseBuf) {
    sfxNoiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.5), ctx.sampleRate);
    const d = sfxNoiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  return sfxNoiseBuf;
}

// One enveloped oscillator note. `to` sweeps the pitch across the duration.
function sfxTone({ type = 'sine', freq = 440, to = null, t = 0, dur = 0.15, vol = 0.2 } = {}) {
  if (SFX.muted) return;
  const ctx = sfxCtx();
  if (!ctx) return;
  const t0 = ctx.currentTime + t;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (to) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

// A short filtered noise burst — clicks, pops, and metallic edges.
function sfxHiss({ t = 0, dur = 0.06, vol = 0.12, freq = 2000, q = 1.5 } = {}) {
  if (SFX.muted) return;
  const ctx = sfxCtx();
  if (!ctx) return;
  const t0 = ctx.currentTime + t;
  const src = ctx.createBufferSource();
  src.buffer = sfxNoise(ctx);
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = freq;
  bp.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(bp).connect(g).connect(ctx.destination);
  src.start(t0, Math.random() * 0.3);
  src.stop(t0 + dur + 0.05);
}

// The vocabulary — call these, not the primitives.
const sfx = {
  coin() {          // coin dropping into the slot
    sfxTone({ type: 'triangle', freq: 2100, dur: 0.08, vol: 0.22 });
    sfxTone({ type: 'triangle', freq: 2700, t: 0.05, dur: 0.12, vol: 0.18 });
    sfxHiss({ dur: 0.03, vol: 0.07, freq: 6000 });
  },
  tick() {          // one crank ratchet click
    sfxTone({ type: 'square', freq: 190, dur: 0.028, vol: 0.06 });
    sfxHiss({ dur: 0.018, vol: 0.05, freq: 3400 });
  },
  rattle() {        // capsule pile churning during the vend
    for (let i = 0; i < 5; i++) {
      sfxTone({ type: 'sine', freq: 120 + Math.random() * 90, to: 60,
                t: i * 0.09 + Math.random() * 0.03, dur: 0.08, vol: 0.10 });
    }
  },
  thunk() {         // capsule landing in the chute
    sfxTone({ type: 'sine', freq: 150, to: 55, dur: 0.13, vol: 0.28 });
    sfxHiss({ dur: 0.04, vol: 0.08, freq: 900, q: 1 });
  },
  pop() {           // capsule cracking open
    sfxHiss({ dur: 0.06, vol: 0.22, freq: 1100, q: 0.8 });
    sfxTone({ type: 'sine', freq: 300, to: 900, dur: 0.12, vol: 0.16 });
  },
  chime() {         // NEW sticker
    sfxTone({ type: 'triangle', freq: 659, dur: 0.18, vol: 0.15 });
    sfxTone({ type: 'triangle', freq: 880, t: 0.09, dur: 0.28, vol: 0.15 });
  },
  fanfare() {       // chase pull / set complete
    [523, 659, 784, 1047].forEach((f, i) =>
      sfxTone({ type: 'triangle', freq: f, t: i * 0.09, dur: 0.22, vol: 0.16 }));
    sfxTone({ type: 'triangle', freq: 1319, t: 0.42, dur: 0.4, vol: 0.12 });
  },
  buzz() {          // denied (not enough coins)
    sfxTone({ type: 'square', freq: 110, dur: 0.16, vol: 0.08 });
    sfxTone({ type: 'square', freq: 104, dur: 0.16, vol: 0.08 });
  },
  flip() {          // binder page turn (paper swish)
    sfxHiss({ dur: 0.09, vol: 0.16, freq: 1300, q: 0.7 });
    sfxHiss({ t: 0.05, dur: 0.06, vol: 0.10, freq: 2600, q: 0.8 });
  },
  hello() {         // Poko's little greeting chirp (also: panel opening)
    sfxTone({ type: 'triangle', freq: 523, dur: 0.10, vol: 0.13 });
    sfxTone({ type: 'triangle', freq: 784, t: 0.06, dur: 0.14, vol: 0.11 });
  },
  // --- arcade voice ---
  // The shop sounds warm and mechanical (coins, cranks, capsules); the back
  // room should sound like a CRT cabinet, so these lean on square waves and
  // short blips. Same synthesis, different accent.

  // Echo Pads. The four tones are an A-major shape (E3 A3 C#4 E4), the same
  // trick the original Simon uses: any order you play them in still sounds
  // musical, so players remember a melody instead of a colour sequence.
  pad(i) {
    const notes = [329.63, 277.18, 220.00, 164.81];
    sfxTone({ type: 'square', freq: notes[i % 4], dur: 0.30, vol: 0.085 });
  },
  padFail() {       // wrong pad — the buzzer
    sfxTone({ type: 'square', freq: 160, to: 70, dur: 0.42, vol: 0.11 });
  },
  blip(freq = 660) {  // generic short arcade blip
    sfxTone({ type: 'square', freq, dur: 0.05, vol: 0.07 });
  },
  popUp() {         // a capsule pops out of its hole
    sfxTone({ type: 'square', freq: 420, to: 760, dur: 0.09, vol: 0.075 });
  },
  whack() {         // caught one
    sfxTone({ type: 'square', freq: 880, to: 1250, dur: 0.07, vol: 0.09 });
    sfxHiss({ dur: 0.04, vol: 0.07, freq: 2600 });
  },
  cardFlip() {      // memory card turning over
    sfxHiss({ dur: 0.05, vol: 0.10, freq: 1800, q: 0.9 });
    sfxTone({ type: 'triangle', freq: 520, dur: 0.05, vol: 0.06 });
  },
  match() {         // pair found
    sfxTone({ type: 'square', freq: 659, dur: 0.09, vol: 0.08 });
    sfxTone({ type: 'square', freq: 988, t: 0.07, dur: 0.13, vol: 0.08 });
  },
  nomatch() {       // pair missed
    sfxTone({ type: 'square', freq: 330, dur: 0.09, vol: 0.07 });
    sfxTone({ type: 'square', freq: 247, t: 0.07, dur: 0.14, vol: 0.07 });
  },
  slide() {         // a shell sliding across the table
    sfxHiss({ dur: 0.13, vol: 0.07, freq: 1100, q: 0.7 });
  },
  paddle() {        // pong: ball off a paddle
    sfxTone({ type: 'square', freq: 740, dur: 0.045, vol: 0.08 });
  },
  wallHit() {       // pong: ball off the top/bottom wall
    sfxTone({ type: 'square', freq: 400, dur: 0.04, vol: 0.06 });
  },
  score(good) {     // pong: point won or lost
    if (good) {
      [660, 880, 1100].forEach((f, i) =>
        sfxTone({ type: 'square', freq: f, t: i * 0.06, dur: 0.10, vol: 0.08 }));
    } else {
      sfxTone({ type: 'square', freq: 300, to: 150, dur: 0.22, vol: 0.07 });
    }
  },
  // Capsule Stop's sweep: pitch rises the closer the marker is to the gold
  // zone, so the bar can very nearly be played by ear.
  sweepTick(closeness) {
    sfxTone({ type: 'square', freq: 240 + closeness * 520, dur: 0.022, vol: 0.035 });
  },
  rustle() {        // leaves
    sfxHiss({ dur: 0.05, vol: 0.09, freq: 4200, q: 0.6 });
    sfxHiss({ t: 0.03, dur: 0.04, vol: 0.06, freq: 5600, q: 0.7 });
  },
};
