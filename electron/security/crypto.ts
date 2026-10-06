import { safeStorage } from "electron";

// Prefix marking a value encrypted with the OS keychain (DPAPI / Keychain / libsecret).
const ENC_PREFIX = "enc:v1:";
// Prefix marking the fallback used when the OS-level encryption is unavailable: the value
// is base64-encoded, NOT encrypted. This used to throw instead, which made `ai:setApiKey`
// fail and the renderer's save silently no-op — the reported "keys don't persist" symptom.
// Saving in a clearly-marked degraded mode (documented in the README's privacy section)
// beats a key that vanishes on every restart; the value still never reaches the renderer.
const PLAIN_PREFIX = "plain:v1:";

export function encryptionAvailable(): boolean {
  try {
    return safeStorage.isEncryptionAvailable();
  } catch {
    return false;
  }
}

export function encrypt(plaintext: string): string {
  if (encryptionAvailable()) {
    return ENC_PREFIX + safeStorage.encryptString(plaintext).toString("base64");
  }
  return PLAIN_PREFIX + Buffer.from(plaintext, "utf-8").toString("base64");
}

export function decrypt(payload: string): string {
  // Rows written before the prefixes existed have neither — they were always keychain-
  // encrypted. Decrypting can still throw if the row came from another OS user/machine;
  // callers (db.getApiKey) treat that as "no key" and fall back to .env.
  if (payload.startsWith(PLAIN_PREFIX)) {
    return Buffer.from(payload.slice(PLAIN_PREFIX.length), "base64").toString("utf-8");
  }
  const blob = payload.startsWith(ENC_PREFIX) ? payload.slice(ENC_PREFIX.length) : payload;
  return safeStorage.decryptString(Buffer.from(blob, "base64"));
}
