// GaPon — client-side encryption for the cloud save.
//
// The server stores ciphertext it cannot read. That isn't paranoia about
// sticker collections: a save carries `friends`, which holds OTHER people's
// friend codes and display names. Encrypting retires that problem instead of
// managing it with policy.
//
// It costs the player nothing, which is the whole reason it's worth doing.
// The recovery code is already mandatory — you need it to find your save at
// all — so using it as the key adds no extra thing to remember.
//
// Deliberately no plaintext fallback. If the browser can't do this, cloud
// backup says so rather than quietly storing a readable save.

const CRYPT = {
  iterations: 100000,   // the code is high-entropy, so this is ample
  saltBytes: 16,
  ivBytes: 12,
};

function cryptoReady() {
  return typeof crypto !== 'undefined' && !!(crypto.subtle && crypto.getRandomValues);
}

// Ambiguous characters are deliberately absent: these get read off one screen
// and typed into another. No 0/O, no 1/I/L. Kept here so the client can
// validate a typo before spending a round trip.
const RECOVERY_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

// A code is 12 characters from the alphabet above, usually shown in groups of
// four. Accept any spacing or dashes the player types.
function looksLikeRecoveryCode(raw) {
  const c = String(raw || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  return c.length === 12 && [...c].every(ch => RECOVERY_ALPHABET.includes(ch));
}

function cleanRecoveryCode(raw) {
  return String(raw || '').toUpperCase().replace(/[^0-9A-Z]/g, '').slice(0, 12);
}

function prettyRecoveryCode(code) {
  const c = cleanRecoveryCode(code);
  return c.replace(/(.{4})(?=.)/g, '$1-');
}

// ---------- bytes ----------

function b64FromBytes(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function bytesFromB64(b64) {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

// ---------- key ----------

async function deriveKey(code, salt) {
  const material = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(cleanRecoveryCode(code)),
    'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: CRYPT.iterations, hash: 'SHA-256' },
    material,
    { name: 'AES-GCM', length: 256 },
    false, ['encrypt', 'decrypt']);
}

// ---------- the two calls the rest of the game uses ----------

// Returns base64( salt | iv | ciphertext+tag ), or null if this browser can't.
async function encryptSave(plainText, code) {
  if (!cryptoReady()) return null;
  const salt = crypto.getRandomValues(new Uint8Array(CRYPT.saltBytes));
  const iv = crypto.getRandomValues(new Uint8Array(CRYPT.ivBytes));
  const key = await deriveKey(code, salt);
  const body = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, new TextEncoder().encode(plainText)));
  const out = new Uint8Array(salt.length + iv.length + body.length);
  out.set(salt, 0);
  out.set(iv, salt.length);
  out.set(body, salt.length + iv.length);
  return b64FromBytes(out);
}

// Returns the plaintext, or null. A wrong code lands here as a failed auth
// tag — which is exactly how we want to find out, before anything is written.
async function decryptSave(payload, code) {
  if (!cryptoReady()) return null;
  try {
    const all = bytesFromB64(payload);
    if (all.length < CRYPT.saltBytes + CRYPT.ivBytes + 16) return null;
    const salt = all.slice(0, CRYPT.saltBytes);
    const iv = all.slice(CRYPT.saltBytes, CRYPT.saltBytes + CRYPT.ivBytes);
    const body = all.slice(CRYPT.saltBytes + CRYPT.ivBytes);
    const key = await deriveKey(code, salt);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, body);
    return new TextDecoder().decode(plain);
  } catch (e) {
    return null;      // wrong code, or a corrupted payload
  }
}
