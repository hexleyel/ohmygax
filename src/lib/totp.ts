import crypto from "crypto";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function generateSecret(length = 20) {
  const bytes = crypto.randomBytes(length);
  return base32Encode(bytes);
}

function base32Encode(buffer: Buffer) {
  let bits = "";
  for (const byte of buffer) bits += byte.toString(2).padStart(8, "0");
  let output = "";
  for (let i = 0; i + 5 <= bits.length; i += 5) {
    output += BASE32_ALPHABET[parseInt(bits.slice(i, i + 5), 2)];
  }
  return output;
}

function base32Decode(input: string) {
  const clean = input.toUpperCase().replace(/=+$/, "");
  let bits = "";
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    bits += idx.toString(2).padStart(5, "0");
  }
  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.slice(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

function hotp(secret: string, counter: number) {
  const key = base32Decode(secret);
  const buf = Buffer.alloc(8);
  buf.writeBigInt64BE(BigInt(counter));

  const hmac = crypto.createHmac("sha1", key).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const code =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(code % 1_000_000).padStart(6, "0");
}

/** Verifies a 6-digit TOTP code, allowing +/-1 time step (30s) of clock drift. */
export function verifyTotp(secret: string, token: string) {
  const step = Math.floor(Date.now() / 1000 / 30);
  for (const drift of [-1, 0, 1]) {
    if (hotp(secret, step + drift) === token) return true;
  }
  return false;
}

export function buildOtpAuthUrl(username: string, secret: string) {
  const issuer = "OHMYGAS";
  return `otpauth://totp/${issuer}:${username}?secret=${secret}&issuer=${issuer}&digits=6&period=30`;
}
