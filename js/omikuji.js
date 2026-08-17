// GaPon — the omikuji stand beside the counter. Shake the box, a numbered
// stick clatters out, and the paper tells you how lucky you are. Free once a
// calendar day; the fortune is carried until your next capsule pull spends it.
//
// It lives as an object in the shop rather than a button on Poko — he runs
// the till, not the shrine.

function initOmikuji() {
  const stand = document.querySelector('#omikuji-stand');
  if (!stand) return;
  stand.addEventListener('click', () => {
    if (!omikujiAvailable()) {
      sfx.rustle();
      const held = heldFortune();
      keeperSay(held
        ? `You're still carrying ${held.kanji} — spend it on a capsule!`
        : "One fortune a day. Come back tomorrow!");
      return;
    }
    openOmikuji();
  });
  refreshOmikujiStand();
}

function refreshOmikujiStand() {
  const stand = document.querySelector('#omikuji-stand');
  if (stand) stand.classList.toggle('ready', omikujiAvailable());
}

// The header charm — an invisible buff is one you forget you're holding.
function updateFortuneChip() {
  const chip = document.querySelector('#fortune-chip');
  if (!chip) return;
  const f = heldFortune();
  chip.hidden = !f;
  if (f) {
    chip.textContent = f.kanji;
    chip.title = `${f.name} — boosts your next capsule pull`;
  }
}

function openOmikuji() {
  const ov = $('#overlay');
  ov.hidden = false;
  ov.innerHTML = `
    <div class="ov-stage share-stage">
      <div class="omi-box" id="omi-box"><i></i><i></i><i></i></div>
      <p class="r-note" id="omi-hint">shake the box!</p>
    </div>`;
  const box = $('#omi-box');
  let shakes = 0;
  const shake = () => {
    if (shakes >= 3) return;
    shakes++;
    sfx.rattle();
    if (!FX_REDUCED) {
      box.animate([
        { transform: 'rotate(0deg)' },
        { transform: 'rotate(-12deg) translateY(-6px)' },
        { transform: 'rotate(11deg)' },
        { transform: 'rotate(0deg)' },
      ], { duration: 320, easing: 'ease-in-out' });
    }
    if (shakes === 3) {
      $('#omi-hint').textContent = 'a stick slides out…';
      setTimeout(revealOmikuji, 620);
    } else {
      $('#omi-hint').textContent = `shake! (${3 - shakes} more)`;
    }
  };
  box.addEventListener('click', shake);
  setTimeout(() => { while (shakes < 3) shake(); }, 6000);   // impatient players
}

function revealOmikuji() {
  const f = drawOmikuji();
  const good = f.mult > 1;
  const ov = $('#overlay');
  ov.innerHTML = `
    <div class="ov-stage share-stage">
      <div class="omi-slip ${good ? 'good' : 'bad'}">
        <span class="omi-kanji">${f.kanji}</span>
        <span class="omi-name">${f.name}</span>
      </div>
      <p class="r-note">${f.line}</p>
      ${good
        ? `<div class="r-chips"><span class="chip lucky">next pull: rare &amp; chase odds ×${f.mult}</span></div>`
        : ''}
      <div class="r-btns">
        <button class="btn" id="omi-done">${good ? 'Lucky me!' : 'Tie it to the rack'}</button>
      </div>
    </div>`;
  if (good) {
    sfx.chime();
    if (f.mult >= 2) { sfx.fanfare(); confetti(22); }
    fxSparkleBurst(ov.querySelector('.omi-slip'), { count: 14, color: '#ffc107', spread: 110 });
  } else {
    sfx.thunk();
  }
  updateFortuneChip();
  refreshOmikujiStand();
  $('#omi-done').addEventListener('click', () => {
    ov.hidden = true;
    ov.innerHTML = '';
    if (good) keeperSay(`${f.kanji}! Go spend that on something good.`);
    else keeperSay('Bad luck left behind — tomorrow is a new draw.');
  });
}
