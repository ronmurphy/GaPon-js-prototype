// GaPon — the purikura booth. Shoot a photo (or load one), use it as the
// backdrop, then decorate it with your stickers. This is what the sticker
// wall was always missing: a subject.
//
// The photo lives in its OWN localStorage key rather than in the save. The
// whole save is re-serialised on every saveGame(), and a photo is orders of
// magnitude bigger than everything else in it — parking it in `state` would
// mean rewriting megabytes on every coin you earn, and would blow the
// storage quota on a long backup code.

const PHOTO_KEY = 'gapon-photo';
const PHOTO_MAX = 1080;        // matches the wall's canvas resolution
const PHOTO_QUALITY = 0.72;

let photoImage = null;         // decoded backdrop, or null
let camStream = null;          // live MediaStream while the booth is open

// Cameras need a secure context; file upload works anywhere.
function cameraAvailable() {
  return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia &&
            (location.protocol === 'https:' || location.hostname === 'localhost'));
}

function hasPhoto() { return !!localStorage.getItem(PHOTO_KEY); }

function loadStoredPhoto(after) {
  let data = null;
  try { data = localStorage.getItem(PHOTO_KEY); } catch (e) {}
  if (!data) { photoImage = null; if (after) after(); return; }
  const img = new Image();
  img.onload = () => { photoImage = img; if (after) after(); };
  img.onerror = () => { photoImage = null; if (after) after(); };
  img.src = data;
}

function storePhoto(dataUrl, after) {
  try {
    localStorage.setItem(PHOTO_KEY, dataUrl);
  } catch (e) {
    toast('That photo was too big to save — try again with less detail.', 'warn');
    return;
  }
  loadStoredPhoto(() => {
    state.wallBg = 'photo';
    saveGame();
    if (after) after();
  });
}

function clearPhoto() {
  try { localStorage.removeItem(PHOTO_KEY); } catch (e) {}
  photoImage = null;
  if (state.wallBg === 'photo') { state.wallBg = WALL_BGS[0].id; saveGame(); }
}

// Square centre-crop, downscaled, as a JPEG data URL.
function squarePhoto(source, sw, sh, mirror) {
  const side = Math.min(sw, sh);
  const cv = document.createElement('canvas');
  cv.width = cv.height = Math.min(PHOTO_MAX, side);
  const ctx = cv.getContext('2d');
  if (mirror) { ctx.translate(cv.width, 0); ctx.scale(-1, 1); }
  ctx.drawImage(source, (sw - side) / 2, (sh - side) / 2, side, side,
                0, 0, cv.width, cv.height);
  return cv.toDataURL('image/jpeg', PHOTO_QUALITY);
}

// ---------- the booth ----------

function closeBooth() {
  if (camStream) {
    camStream.getTracks().forEach(t => t.stop());   // release the camera light
    camStream = null;
  }
  const ov = $('#overlay');
  ov.hidden = true;
  ov.innerHTML = '';
}

function openPhotoBooth(facing = 'user') {
  const ov = $('#overlay');
  ov.hidden = false;
  ov.innerHTML = `
    <div class="ov-stage booth-stage">
      <div class="booth-frame">
        <video id="booth-video" class="${facing === 'user' ? 'selfie' : 'rear'}"
               playsinline autoplay muted></video>
        <i class="booth-guide"></i>
      </div>
      <p class="r-note" id="booth-msg">say cheese!</p>
      <div class="r-btns">
        <button class="btn ghost" id="booth-cancel">Cancel</button>
        <button class="btn ghost" id="booth-flip"><span class="msr">cameraswitch</span></button>
        <button class="btn" id="booth-shoot"><span class="msr">photo_camera</span> Snap</button>
      </div>
    </div>`;
  const video = $('#booth-video');
  const msg = $('#booth-msg');
  $('#booth-cancel').addEventListener('click', closeBooth);
  $('#booth-flip').addEventListener('click', () => {
    if (camStream) camStream.getTracks().forEach(t => t.stop());
    openPhotoBooth(facing === 'user' ? 'environment' : 'user');
  });

  navigator.mediaDevices.getUserMedia({ video: { facingMode: facing }, audio: false })
    .then(stream => {
      camStream = stream;
      video.srcObject = stream;
    })
    .catch(err => {
      msg.textContent = err && err.name === 'NotAllowedError'
        ? 'Camera permission was denied — you can load a photo instead.'
        : 'No camera available — you can load a photo instead.';
      $('#booth-shoot').disabled = true;
      $('#booth-flip').disabled = true;
    });

  $('#booth-shoot').addEventListener('click', () => {
    if (!camStream || !video.videoWidth) return;
    sfx.blip(900);
    // front camera previews are mirrored, so mirror the capture to match
    const data = squarePhoto(video, video.videoWidth, video.videoHeight, facing === 'user');
    closeBooth();
    storePhoto(data, () => {
      renderWall();
      toast('Photo set as your backdrop — now decorate it!', 'good');
    });
  });
}

function pickPhotoFile() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.addEventListener('change', () => {
    const file = input.files && input.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      storePhoto(squarePhoto(img, img.naturalWidth, img.naturalHeight, false), () => {
        renderWall();
        toast('Photo set as your backdrop — now decorate it!', 'good');
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      toast("That file didn't load as an image.", 'warn');
    };
    img.src = url;
  });
  input.click();
}
