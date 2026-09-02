import { safeStorage } from "electron";

// Wraps Electron's OS-backed encryption (Keychain / DPAPI / libsecret) —
// no separate native dependency or key management needed.
export function encrypt(plaintext: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error("OS-level encryption is not available on this machine.");
  }
  return safeStorage.encryptString(plaintext).toString("base64");
}

export function decrypt(payload: string): string {
  return safeStorage.decryptString(Buffer.from(payload, "base64"));
}
