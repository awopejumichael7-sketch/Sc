/* ==========================================================================
   SCHOLAR'S CAMP LMS — FREE TOTP (RFC 6238) TWO-FACTOR AUTH
   Pure Web Crypto, no external service, no cost. Compatible with any
   standard authenticator app (Google Authenticator, Authy, etc.).
   ========================================================================== */
const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateBase32Secret(byteLength = 20){
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  let bits = '', secret = '';
  for(const b of bytes) bits += b.toString(2).padStart(8,'0');
  for(let i=0;i+5<=bits.length;i+=5) secret += BASE32_ALPHABET[parseInt(bits.slice(i,i+5),2)];
  return secret;
}

function base32ToBytes(base32){
  let bits = '';
  for(const ch of base32.toUpperCase().replace(/=+$/,'')){
    const idx = BASE32_ALPHABET.indexOf(ch);
    if(idx === -1) continue;
    bits += idx.toString(2).padStart(5,'0');
  }
  const bytes = [];
  for(let i=0;i+8<=bits.length;i+=8) bytes.push(parseInt(bits.slice(i,i+8),2));
  return new Uint8Array(bytes);
}

export async function totpCode(secretBase32, forTime = Date.now(), step = 30, digits = 6){
  const counter = Math.floor(forTime / 1000 / step);
  const counterBytes = new ArrayBuffer(8);
  const view = new DataView(counterBytes);
  view.setUint32(4, counter); // low 32 bits — fine until the year 2106+
  const keyBytes = base32ToBytes(secretBase32);
  const key = await crypto.subtle.importKey('raw', keyBytes, { name:'HMAC', hash:'SHA-1' }, false, ['sign']);
  const hmac = new Uint8Array(await crypto.subtle.sign('HMAC', key, counterBytes));
  const offset = hmac[hmac.length-1] & 0x0f;
  const binCode = ((hmac[offset] & 0x7f) << 24) | ((hmac[offset+1] & 0xff) << 16) | ((hmac[offset+2] & 0xff) << 8) | (hmac[offset+3] & 0xff);
  return String(binCode % (10 ** digits)).padStart(digits, '0');
}

/** Accepts the current 30s window plus one step of clock drift either way. */
export async function verifyTotp(secretBase32, entered, step = 30){
  const now = Date.now();
  for(const drift of [0, -step*1000, step*1000]){
    if(entered === await totpCode(secretBase32, now + drift, step)) return true;
  }
  return false;
}

export function buildOtpauthUri(secret, accountLabel, issuer = "Scholar's Camp"){
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${accountLabel}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&digits=6&period=30`;
}
