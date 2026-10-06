import { test } from "node:test";
import assert from "node:assert/strict";
import {
  apiKeySettingKey,
  envKeyName,
  isKeyConfigured,
  PROVIDER_ENV_KEYS,
} from "../electron/ai/providerKeys.ts";

// Gemini and NVIDIA must have fully independent storage — one provider's save/clear/switch
// must never be able to touch the other's key. These names are the join point between the
// Settings UI, the DB rows, and the .env sync.
test("each provider has a distinct settings key and env name", () => {
  const keys = ["gemini", "openai", "anthropic", "nvidia", "local"].map(apiKeySettingKey);
  assert.equal(new Set(keys).size, keys.length, "settings keys must be unique per provider");
  assert.equal(apiKeySettingKey("gemini"), "gemini_api_key_encrypted");
  assert.equal(apiKeySettingKey("nvidia"), "nvidia_api_key_encrypted");

  const envNames = ["gemini", "openai", "anthropic", "nvidia"].map(envKeyName);
  assert.equal(new Set(envNames).size, envNames.length, "env key names must be unique per provider");
  assert.equal(envKeyName("local"), null, "Ollama needs no key");
  assert.equal(PROVIDER_ENV_KEYS.gemini, "GEMINI_API_KEY");
  assert.equal(PROVIDER_ENV_KEYS.nvidia, "NVIDIA_API_KEY");
});

test("isKeyConfigured: DB copy wins, empty strings are not configured, env is the fallback", () => {
  assert.equal(isKeyConfigured("db-key", undefined), true);
  assert.equal(isKeyConfigured(null, "env-key"), true);
  assert.equal(isKeyConfigured(null, undefined), false);
  // An empty-string value (e.g. `GEMINI_API_KEY=` after a clear) must not count as configured.
  assert.equal(isKeyConfigured("", ""), false);
  assert.equal(isKeyConfigured("   ", "   "), false);
  // A DB copy (even a decryptable-but-blank-looking one that is only whitespace) falls through
  // to env — matching the ?? semantics in the providers, minus the empty-string trap.
  assert.equal(isKeyConfigured("  ", "env-key"), true);
});
