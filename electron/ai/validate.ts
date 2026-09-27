import type { AIProviderName } from "../db/db";
import { classifyError, friendlyErrorMessage } from "./retry";
import { NVIDIA_BASE_URL, NVIDIA_MODELS } from "./nvidiaWire";
import { LocalProvider } from "./LocalProvider";

export interface ProviderTestResult {
  ok: boolean;
  message: string;
}

const TEST_TIMEOUT_MS = 15_000;

// A tiny real request (max a handful of tokens) that answers "does this key authenticate?"
// before the user burns a full answer on a bad key. Errors go through the shared classifier
// so "invalid key", "no network", etc. read the same here as they do mid-answer.
export async function testProviderKey(provider: AIProviderName, apiKey: string | null): Promise<ProviderTestResult> {
  if (provider === "local") {
    const info = await LocalProvider.listModels();
    if (!info.running) {
      return { ok: false, message: "Can't reach Ollama at 127.0.0.1:11434. Make sure Ollama is installed and running, then test again." };
    }
    if (info.models.length === 0) {
      return { ok: false, message: 'Ollama is reachable but has no models installed. Run "ollama pull llama3.1:8b" in a terminal, then test again.' };
    }
    return { ok: true, message: `Ollama is reachable with ${info.models.length} model${info.models.length === 1 ? "" : "s"} installed.` };
  }

  if (!apiKey || !apiKey.trim()) {
    return { ok: false, message: "No API key saved for this provider yet. Paste one above (or in .env) first." };
  }

  const label = { gemini: "Gemini", openai: "OpenAI", anthropic: "Anthropic", nvidia: "NVIDIA" } as const;
  const target = label[provider];

  try {
    if (provider === "nvidia") {
      // NVIDIA's /v1/models is public (no auth check), so the only real test is a minimal
      // chat completion. Walk the model chain so a retired default model doesn't fail a
      // perfectly good key — a 410 (end-of-life) tries the next model, auth errors stop.
      let lastBody = "";
      for (const model of NVIDIA_MODELS) {
        const res = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: "Reply with the single word: ok" }],
            max_tokens: 8,
            stream: false,
          }),
          signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
        });
        const body = await res.text();
        if (res.ok) {
          return { ok: true, message: `Key is valid — NVIDIA accepted it (validated with ${model}).` };
        }
        lastBody = body;
        const status = res.status;
        if (status === 401 || status === 403) {
          const err = new Error(`NVIDIA error: ${status} ${body}`) as Error & { status: number };
          err.status = status;
          return { ok: false, message: friendlyErrorMessage(err) };
        }
        if (status !== 404 && status !== 410) {
          const err = new Error(`NVIDIA error: ${status} ${body}`) as Error & { status: number };
          err.status = status;
          return { ok: false, message: friendlyErrorMessage(err) };
        }
      }
      const err = new Error(`NVIDIA error: 410 ${lastBody}`) as Error & { status: number };
      err.status = 410;
      return { ok: false, message: friendlyErrorMessage(err) };
    }

    // Gemini / OpenAI / Anthropic all key-protect their model-list endpoint, so a cheap GET
    // proves the credential without spending any generation quota.
    const endpoints = {
      gemini: { url: "https://generativelanguage.googleapis.com/v1beta/models", headers: { "x-goog-api-key": apiKey } },
      openai: { url: "https://api.openai.com/v1/models", headers: { Authorization: `Bearer ${apiKey}` } },
      anthropic: {
        url: "https://api.anthropic.com/v1/models",
        headers: { "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      },
    } as const;
    const { url, headers } = endpoints[provider];
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(TEST_TIMEOUT_MS) });
    if (!res.ok) {
      const err = new Error(`${target} error: ${res.status} ${await res.text()}`) as Error & { status: number };
      err.status = res.status;
      return { ok: false, message: friendlyErrorMessage(err) };
    }
    const json = (await res.json()) as { models?: unknown[]; data?: unknown[] };
    const count = json.models?.length ?? json.data?.length;
    return {
      ok: true,
      message:
        count !== undefined
          ? `Key is valid — ${target} reports ${count} available model${count === 1 ? "" : "s"}.`
          : `Key is valid — ${target} accepted it.`,
    };
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      return { ok: false, message: `Timed out reaching ${target} after ${TEST_TIMEOUT_MS / 1000}s — check your internet connection and try again.` };
    }
    if (classifyError(err) === "network") {
      return { ok: false, message: `Couldn't reach ${target} — check your internet connection and try again.` };
    }
    return { ok: false, message: friendlyErrorMessage(err) };
  }
}
