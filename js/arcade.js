// GaPon — arcade corner: five quick minigames, 3 plays a day, small payouts.

let arcadeRaf = null;
let arcadeTimers = [];

// setTimeout/setInterval ids share one pool, so clearTimeout clears both.
function addArcadeTimer(id) { arcadeTimers.push(id); return id; }
function clearArcadeTimers() {
  for (const id of arcadeTimers) clearTimeout(id);
  arcadeTimers = [];
}

function arcadeAward(payout, headline) {
  clearArcadeTimers();
  state.coins += payout;
  saveGame();
  updateHeader();
  const stage = $('#arcade-stage');
  stage.innerHTML = `
    <div class="arcade-result">
      <div class="ar-head">${headline}</div>
      <div class="ar-pay">${coinIcon()} +${payout} coins</div>
      <button class="btn" id="ar-back">Back to arcade</button>
    </div>`;
  $('#ar-back').addEventListener('click', renderArcade);
}

function renderArcade() {
  if (arcadeRaf) { cancelAnimationFrame(arcadeRaf); arcadeRaf = null; }
  clearArcadeTimers();
  const left = arcadePlaysLeft();
  const host = $('#tab-arcade');
  host.innerHTML = `
    <h2>Arcade Corner</h2>
    <p class="arcade-sub">
      Quick games for a few extra coins —
      <b>${left}/${ARCADE.playsPerRotation}</b> plays left this rotation.
      ${left === 0 ? 'New plays when the machines rotate!' : ''}
    </p>
    <div class="arcade-games">
      <div class="game-card">
        <span class="msr g-icon">timer</span>
        <div class="g-name">Capsule Stop</div>
        <div class="g-desc">Stop the slider in the gold zone!</div>
        <div class="g-pay">${coinIcon()} 2–15</div>
        <button class="btn" data-game="timing" ${left ? '' : 'disabled'}>Play</button>
      </div>
      <div class="game-card">
        <span class="msr g-icon">style</span>
        <div class="g-name">Sticker Match</div>
        <div class="g-desc">Match pairs from your album.</div>
        <div class="g-pay">${coinIcon()} 5–15</div>
        <button class="btn" data-game="match" ${left ? '' : 'disabled'}>Play</button>
      </div>
      <div class="game-card">
        <span class="msr g-icon">ads_click</span>
        <div class="g-name">Capsule Chase</div>
        <div class="g-desc">Tap capsules before they drop — 10 seconds!</div>
        <div class="g-pay">${coinIcon()} 2–15</div>
        <button class="btn" data-game="chase" ${left ? '' : 'disabled'}>Play</button>
      </div>
      <div class="game-card">
        <span class="msr g-icon">visibility</span>
        <div class="g-name">Shuffle Shells</div>
        <div class="g-desc">Follow the capsule under the cups.</div>
        <div class="g-pay">${coinIcon()} 3–12</div>
        <button class="btn" data-game="shell" ${left ? '' : 'disabled'}>Play</button>
      </div>
      <div class="game-card">
        <span class="msr g-icon">music_note</span>
        <div class="g-name">Echo Pads</div>
        <div class="g-desc">Repeat the growing beat pattern.</div>
        <div class="g-pay">${coinIcon()} 2–15</div>
        <button class="btn" data-game="echo" ${left ? '' : 'disabled'}>Play</button>
      </div>
      <div class="game-card">
        <span class="msr g-icon">sports_tennis</span>
        <div class="g-name">Capsule Pong</div>
        <div class="g-desc">Beat the robo-paddle — first to ${ARCADE.pong.winScore}!</div>
        <div class="g-pay">${coinIcon()} 3–15</div>
        <button class="btn" data-game="pong" ${left ? '' : 'disabled'}>Play</button>
      </div>
    </div>
    <div id="arcade-stage"></div>`;
  host.querySelectorAll('[data-game]').forEach(btn =>
    btn.addEventListener('click', () => {
      if (!useArcadePlay()) return;
      host.querySelector('.arcade-games').remove();
      host.querySelector('.arcade-sub').remove();
      const start = {
        timing: startTimingGame,
        match: startMatchGame,
        chase: startChaseGame,
        shell: startShellGame,
        echo: startEchoGame,
        pong: startPongGame,
      }[btn.dataset.game];
      start();
    }));
}

// ---------- Capsule Stop (timing bar) ----------

function startTimingGame() {
  const stage = $('#arcade-stage');
  stage.innerHTML = `
    <div class="tgame">
      <div class="tbar"><div class="tmarker"></div></div>
      <button class="btn" id="t-stop">STOP!</button>
    </div>`;
  const marker = stage.querySelector('.tmarker');
  const start = performance.now();
  let pos = 0;
  const loop = now => {
    if (!document.body.contains(marker)) { arcadeRaf = null; return; }
    pos = (Math.sin((now - start) * 0.0045) + 1) / 2;
    marker.style.left = `calc(${(pos * 100).toFixed(2)}% - 2px)`;
    arcadeRaf = requestAnimationFrame(loop);
  };
  arcadeRaf = requestAnimationFrame(loop);

  $('#t-stop').addEventListener('click', () => {
    cancelAnimationFrame(arcadeRaf);
    arcadeRaf = null;
    const dist = Math.abs(pos - 0.5);
    const p = ARCADE.timing;
    let payout, headline;
    if (dist < 0.06)      { payout = p.gold;   headline = '🏆 GOLD! Dead center!'; }
    else if (dist < 0.15) { payout = p.silver; headline = 'Silver — so close!'; }
    else if (dist < 0.28) { payout = p.bronze; headline = 'Bronze. Not bad!'; }
    else                  { payout = p.miss;   headline = 'Whiff! Pity coins.'; }
    arcadeAward(payout, headline);
  }, { once: true });
}

// ---------- Sticker Match (memory pairs) ----------

function startMatchGame() {
  // prefer stickers the player owns; pad from the catalog for new players
  let pool = Object.keys(state.inv);
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  if (pool.length < 4) {
    const extras = Object.keys(ITEMS_BY_ID).filter(id => !pool.includes(id));
    while (pool.length < 4) {
      pool.push(extras.splice(Math.floor(Math.random() * extras.length), 1)[0]);
    }
  }
  const chosen = pool.slice(0, 4).map(id => ITEMS_BY_ID[id]);
  const cards = [...chosen, ...chosen]
    .map((it, i) => ({ key: i, item: it }))
    .sort(() => Math.random() - 0.5);

  const stage = $('#arcade-stage');
  stage.innerHTML = `
    <div class="mgame">
      <div class="mem-grid">
        ${cards.map(c => `
          <div class="mem-card" data-item="${c.item.id}">
            <div class="mem-inner">
              <div class="mem-back"><span class="msr">help</span></div>
              <div class="mem-front">
                <span class="msr" style="color:${COLLECTIONS.find(col => col.id === c.item.collection).color}">${c.item.icon}</span>
              </div>
            </div>
          </div>`).join('')}
      </div>
      <p class="mem-status">Find the pairs! Fewer misses = more coins.</p>
    </div>`;

  let open = [];
  let locked = false;
  let matched = 0;
  let misses = 0;

  stage.querySelectorAll('.mem-card').forEach(card =>
    card.addEventListener('click', () => {
      if (locked || card.classList.contains('flipped')) return;
      card.classList.add('flipped');
      open.push(card);
      if (open.length < 2) return;
      const [a, b] = open;
      if (a.dataset.item === b.dataset.item) {
        a.classList.add('matched');
        b.classList.add('matched');
        open = [];
        matched++;
        if (matched === 4) {
          const c = ARCADE.match;
          const payout = Math.max(c.floor, c.perfect - misses * c.missPenalty);
          const headline = misses === 0 ? '🏆 PERFECT memory!'
            : `All matched — ${misses} miss${misses === 1 ? '' : 'es'}.`;
          setTimeout(() => arcadeAward(payout, headline), 500);
        }
      } else {
        locked = true;
        misses++;
        setTimeout(() => {
          a.classList.remove('flipped');
          b.classList.remove('flipped');
          open = [];
          locked = false;
        }, 700);
      }
    }));
}

// ---------- Capsule Chase (whack-a-mole) ----------

function startChaseGame() {
  const c = ARCADE.chase;
  const stage = $('#arcade-stage');
  stage.innerHTML = `
    <div class="wgame">
      <div class="w-head">
        <span id="w-time">${c.seconds.toFixed(1)}s</span>
        <span id="w-score">0 caught</span>
      </div>
      <div class="w-grid">
        ${Array.from({ length: 9 }, () =>
          '<div class="w-hole"><div class="w-cap"></div></div>').join('')}
      </div>
    </div>`;
  const holes = [...stage.querySelectorAll('.w-hole')];
  let score = 0, over = false;
  const end = performance.now() + c.seconds * 1000;

  const popOne = () => {
    if (over) return;
    const free = holes.filter(h => !h.classList.contains('up'));
    if (free.length) {
      const hole = free[Math.floor(Math.random() * free.length)];
      hole.querySelector('.w-cap').style.background =
        `linear-gradient(180deg, ${CAPSULE_COLORS[Math.floor(Math.random() * CAPSULE_COLORS.length)]} 50%, #f2f0eb 50%)`;
      hole.classList.add('up');
      addArcadeTimer(setTimeout(() => hole.classList.remove('up'), 850 + Math.random() * 300));
    }
    addArcadeTimer(setTimeout(popOne, 520 + Math.random() * 380));
  };
  popOne();

  holes.forEach(h => h.addEventListener('pointerdown', () => {
    if (over || !h.classList.contains('up')) return;
    h.classList.remove('up');
    score++;
    $('#w-score').textContent = `${score} caught`;
  }));

  addArcadeTimer(setInterval(() => {
    const ms = end - performance.now();
    if (ms > 0) {
      $('#w-time').textContent = (ms / 1000).toFixed(1) + 's';
      return;
    }
    over = true;
    clearArcadeTimers();
    $('#w-time').textContent = '0.0s';
    let payout, headline;
    if (score >= c.goldTaps)        { payout = c.gold;   headline = `🏆 GOLD! ${score} capsules caught!`; }
    else if (score >= c.silverTaps) { payout = c.silver; headline = `Silver — ${score} caught!`; }
    else if (score >= c.bronzeTaps) { payout = c.bronze; headline = `Bronze — ${score} caught.`; }
    else                            { payout = c.miss;   headline = 'They got away! Pity coins.'; }
    addArcadeTimer(setTimeout(() => arcadeAward(payout, headline), 500));
  }, 100));
}

// ---------- Shuffle Shells (follow the capsule) ----------

function startShellGame() {
  const c = ARCADE.shell;
  const stage = $('#arcade-stage');
  stage.innerHTML = `
    <div class="sgame">
      <p class="s-status" id="s-status">Watch the capsule…</p>
      <div class="s-row">
        <div class="s-ball"></div>
        <div class="s-cup"></div>
        <div class="s-cup"></div>
        <div class="s-cup"></div>
      </div>
    </div>`;
  const cups = [...stage.querySelectorAll('.s-cup')];
  const ball = stage.querySelector('.s-ball');
  const slots = [0, 1, 2];   // cup index -> slot
  const ballCup = Math.floor(Math.random() * 3);
  const slotX = i => `calc(${i} * (100% - 84px) / 2)`;
  // the ball always sits at its cup's slot, hidden behind the cup unless lifted
  const place = () => {
    cups.forEach((cup, i) => cup.style.left = slotX(slots[i]));
    ball.style.left = `calc(${slots[ballCup]} * (100% - 84px) / 2 + 26px)`;
  };
  place();
  cups[ballCup].classList.add('lifted');

  addArcadeTimer(setTimeout(() => cups[ballCup].classList.remove('lifted'), 1100));

  let t = 1600;
  for (let s = 0; s < c.swaps; s++) {
    addArcadeTimer(setTimeout(() => {
      const a = Math.floor(Math.random() * 3);
      let b = Math.floor(Math.random() * 2);
      if (b >= a) b++;
      [slots[a], slots[b]] = [slots[b], slots[a]];
      place();
    }, t));
    t += 450;
  }

  addArcadeTimer(setTimeout(() => {
    $('#s-status').textContent = 'Where is it? Tap a cup!';
    cups.forEach(cup => cup.classList.add('pickable'));
    let done = false;
    cups.forEach((cup, i) => cup.addEventListener('click', () => {
      if (done || !cup.classList.contains('pickable')) return;
      done = true;
      cups.forEach(x => x.classList.remove('pickable'));
      cup.classList.add('lifted');
      const right = i === ballCup;
      if (!right) addArcadeTimer(setTimeout(() => cups[ballCup].classList.add('lifted'), 400));
      addArcadeTimer(setTimeout(() => arcadeAward(
        right ? c.win : c.wrong,
        right ? '🏆 Nailed it! Eagle eyes!' : 'Nope — it was over there!'
      ), 1100));
    }));
  }, t + 250));
}

// ---------- Capsule Pong (vs the robo-paddle) ----------

function startPongGame() {
  const c = ARCADE.pong;
  const stage = $('#arcade-stage');
  stage.innerHTML = `
    <div class="pgame">
      <div class="p-score">You <b id="p-you">0</b> · <b id="p-ai">0</b> Robo</div>
      <canvas id="pong" width="480" height="300"></canvas>
      <p class="p-hint">drag up &amp; down to move your paddle</p>
    </div>`;
  const cv = $('#pong'), ctx = cv.getContext('2d');
  const W = 480, H = 300, PW = 10, PH = 64, R = 10;
  const AI_SPEED = 2.7, MAX_SPEED = 7.5;
  const you = { x: 18, y: H / 2 };
  const ai = { x: W - 18 - PW, y: H / 2 };
  const ball = { x: W / 2, y: H / 2, vx: 0, vy: 0 };
  let target = H / 2;
  let yourScore = 0, aiScore = 0;
  let speed = 4.2, waiting = 0, ended = false;
  let ballColor = CAPSULE_COLORS[0];

  function serve(dir) {
    speed = 4.2;
    ball.x = W / 2;
    ball.y = H / 2;
    const a = (Math.random() - 0.5) * 0.7;
    ball.vx = dir * speed * Math.cos(a);
    ball.vy = speed * Math.sin(a);
    ballColor = CAPSULE_COLORS[Math.floor(Math.random() * CAPSULE_COLORS.length)];
    waiting = 50;
  }
  serve(Math.random() < 0.5 ? 1 : -1);

  const track = e => {
    const r = cv.getBoundingClientRect();
    target = (e.clientY - r.top) / r.height * H;
  };
  cv.addEventListener('pointermove', track);
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); track(e); });

  function bounce(paddle, dir) {
    const rel = Math.max(-1, Math.min(1, (ball.y - paddle.y) / (PH / 2)));
    speed = Math.min(MAX_SPEED, speed * 1.06);
    const ang = rel * 0.85;   // edge hits fire off at up to ~49°
    ball.vx = dir * speed * Math.cos(ang);
    ball.vy = speed * Math.sin(ang);
  }

  function finish() {
    const win = yourScore >= c.winScore;
    arcadeAward(
      win ? (aiScore === 0 ? c.sweep : c.win) : c.lose,
      win ? (aiScore === 0 ? '🏆 FLAWLESS! Robo-paddle destroyed!' : 'You win! GG, robo-paddle.')
          : 'Robo-paddle takes it. Rematch tomorrow?');
  }

  const step = () => {
    if (!document.body.contains(cv)) { arcadeRaf = null; return; }

    you.y += (target - you.y) * 0.3;
    you.y = Math.max(PH / 2, Math.min(H - PH / 2, you.y));

    // the "AI": chase the ball only while it's incoming, else drift home —
    // its top speed is below the ball's, so sharp angles beat it
    const aim = ball.vx > 0 ? ball.y : H / 2;
    ai.y += Math.max(-AI_SPEED, Math.min(AI_SPEED, aim - ai.y));
    ai.y = Math.max(PH / 2, Math.min(H - PH / 2, ai.y));

    if (waiting > 0) waiting--;
    else if (!ended) {
      ball.x += ball.vx;
      ball.y += ball.vy;
      if (ball.y < R) { ball.y = R; ball.vy = Math.abs(ball.vy); }
      if (ball.y > H - R) { ball.y = H - R; ball.vy = -Math.abs(ball.vy); }
      if (ball.vx < 0 && ball.x - R < you.x + PW && ball.x - R > you.x - 14 &&
          Math.abs(ball.y - you.y) < PH / 2 + R) {
        ball.x = you.x + PW + R;
        bounce(you, 1);
      }
      if (ball.vx > 0 && ball.x + R > ai.x && ball.x + R < ai.x + PW + 14 &&
          Math.abs(ball.y - ai.y) < PH / 2 + R) {
        ball.x = ai.x - R;
        bounce(ai, -1);
      }
      if (ball.x < -R * 2 || ball.x > W + R * 2) {
        const youScored = ball.x > W;
        if (youScored) $('#p-you').textContent = ++yourScore;
        else $('#p-ai').textContent = ++aiScore;
        if (yourScore >= c.winScore || aiScore >= c.winScore) {
          ended = true;
          addArcadeTimer(setTimeout(finish, 800));
        } else {
          serve(youScored ? 1 : -1);
        }
      }
    }

    ctx.clearRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,0.15)';
    ctx.setLineDash([8, 10]);
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(W / 2, 0);
    ctx.lineTo(W / 2, H);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#f0edf7';
    for (const p of [you, ai]) {
      ctx.beginPath();
      ctx.roundRect(p.x, p.y - PH / 2, PW, PH, 5);
      ctx.fill();
    }
    if (!ended) {
      ctx.save();
      ctx.translate(ball.x, ball.y);
      ctx.rotate(Math.atan2(ball.vy, ball.vx) + Math.PI / 2);
      ctx.beginPath();
      ctx.arc(0, 0, R, Math.PI, Math.PI * 2);
      ctx.fillStyle = ballColor;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, R, 0, Math.PI);
      ctx.fillStyle = '#f2f0eb';
      ctx.fill();
      ctx.restore();
    }

    arcadeRaf = requestAnimationFrame(step);
  };
  arcadeRaf = requestAnimationFrame(step);
}

// ---------- Echo Pads (repeat the pattern) ----------

function startEchoGame() {
  const c = ARCADE.echo;
  const colors = ['#ef5350', '#ffc107', '#66bb6a', '#42a5f5'];
  const stage = $('#arcade-stage');
  stage.innerHTML = `
    <div class="egame">
      <p class="e-status" id="e-status">Watch the pattern…</p>
      <div class="e-grid">
        ${colors.map(col => `<button class="e-pad" style="--pad:${col}"></button>`).join('')}
      </div>
    </div>`;
  const pads = [...stage.querySelectorAll('.e-pad')];
  const status = $('#e-status');
  const seq = [];
  let round = 0;        // completed rounds
  let inputIdx = 0;
  let accepting = false;

  const flash = (i, ms = 320) => {
    pads[i].classList.add('lit');
    addArcadeTimer(setTimeout(() => pads[i].classList.remove('lit'), ms));
  };

  const playSeq = () => {
    accepting = false;
    status.textContent = `Round ${round + 1} of ${c.rounds.length} — watch…`;
    while (seq.length < 3 + round) seq.push(Math.floor(Math.random() * 4));
    seq.forEach((p, k) => addArcadeTimer(setTimeout(() => {
      flash(p);
      if (k === seq.length - 1) addArcadeTimer(setTimeout(() => {
        accepting = true;
        inputIdx = 0;
        status.textContent = 'Your turn!';
      }, 500));
    }, 600 + k * 500)));
  };

  pads.forEach((pad, i) => pad.addEventListener('pointerdown', () => {
    if (!accepting) return;
    flash(i, 200);
    if (i !== seq[inputIdx]) {
      accepting = false;
      const payout = round > 0 ? c.rounds[round - 1] : c.flub;
      const headline = round > 0
        ? `Slipped on round ${round + 1} — still earned round ${round} pay!`
        : 'Off beat! Pity coins.';
      addArcadeTimer(setTimeout(() => arcadeAward(payout, headline), 600));
      return;
    }
    inputIdx++;
    if (inputIdx === seq.length) {
      accepting = false;
      round++;
      if (round === c.rounds.length) {
        addArcadeTimer(setTimeout(() =>
          arcadeAward(c.rounds[round - 1], '🏆 PERFECT echo! All rounds!'), 600));
      } else {
        status.textContent = 'Nice! Next round…';
        addArcadeTimer(setTimeout(playSeq, 900));
      }
    }
  }));

  playSeq();
}
