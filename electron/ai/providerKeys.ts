// Pure, import-free helpers for the API-key storage lifecycle — kept separate (like
// nvidiaWire.ts) so the test suite can pin down the save/load rules without pulling in
// Electron or the database. Both main.ts and handlers.ts source their env-key names from
// here, so a provider's key can't drift between the two maps.

export type AIProviderName = "gemini" | "openai" | "anthropic" | "nvidia" | "local";

// The .env / process.env variable that backs each provider. `local` needs no key.
export const PROVIDER_ENV_KEYS: Record<AIProviderName, string> = {
  gemini: "GEMINI_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  nvidia: "NVIDIA_API_KEY",
  local: "",
};

// Settings-table row for a provider's encrypted key. One row PER PROVIDER — switching
// providers or saving a new key never touches another provider's row.
export function apiKeySettingKey(provider: AIProviderName): string {
  return `${provider}_api_key_encrypted`;
}

export function envKeyName(provider: AIProviderName): string | null {
  return PROVIDER_ENV_KEYS[provider] || null;
}

// "Is this provider usable right now?" — the encrypted DB copy wins; the .env / OS
// environment copy is the fallback. Empty strings count as not-configured either way.
export function isKeyConfigured(
  dbKey: string | null | undefined,
  envValue: string | undefined | null
): boolean {
  return !!(dbKey?.trim() || envValue?.trim());
}
