const RETRYABLE_STATUS = new Set([429, 503]);
const RETRY_DELAYS_MS = [1000, 2500, 5000];

// Transparently retries transient "server busy" errors (HTTP 429/503) with a short backoff —
// these are common on free-tier AI APIs and usually clear up within a couple seconds.
export async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt >= RETRY_DELAYS_MS.length || !isRetryable(err)) throw err;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS_MS[attempt]));
    }
  }
}

// Runs each attempt in order, returning the first that succeeds — used to fall through a list
// of models (or providers) when one is unavailable, after withRetry() has already given each
// individual attempt a few tries.
export async function withFallback<T>(attempts: Array<() => Promise<T>>): Promise<T> {
  let lastErr: unknown;
  for (const attempt of attempts) {
    try {
      return await attempt();
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr;
}

// Streaming counterpart: tries each attempt in order, but only falls through to the next one on
// a clean failure before anything was yielded. Once an attempt has produced output, a later
// failure is reported rather than retried — restarting mid-stream with a different model would
// stitch together text from two different answers.
export async function* withStreamFallback<T>(attempts: Array<() => AsyncIterable<T>>): AsyncIterable<T> {
  let lastErr: unknown;
  for (const getIterable of attempts) {
    let yieldedAny = false;
    try {
      for await (const item of getIterable()) {
        yieldedAny = true;
        yield item;
      }
      return;
    } catch (err) {
      lastErr = err;
      if (yieldedAny) throw err;
    }
  }
  throw lastErr;
}

function isRetryable(err: unknown): boolean {
  const status = (err as { status?: number } | null)?.status;
  if (status !== undefined) return RETRYABLE_STATUS.has(status);
  const message = err instanceof Error ? err.message : String(err);
  return /\b(429|503)\b/.test(message);
}

export type ErrorKind =
  | "invalid_key"
  | "model_not_found"
  | "rate_limited"
  | "server_error"
  | "timeout"
  | "network"
  | "request"
  | "unknown";

// Classifies an error thrown anywhere in the AI-call path. Providers throw with a numeric
// .status when they have one; Gemini's SDK signals a bad key as a 400 with a distinctive
// message, and network failures surface as fetch TypeErrors whose text varies by cause —
// so both shape and message are checked.
export function classifyError(err: unknown): ErrorKind {
  const status = (err as { status?: number } | null)?.status;
  const message = err instanceof Error ? err.message : String(err);

  if (err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError")) return "timeout";
  if (status === 401 || status === 403) return "invalid_key";
  if (/\bapi key\b.*(invalid|not valid|incorrect)|\binvalid api key\b|(401|403):\s*["']?credential/i.test(message))
    return "invalid_key";
  if (status === 404 || status === 410 || /\b(404|410)\b/.test(message)) return "model_not_found";
  if (status === 429 || /\b(429)\b/.test(message)) return "rate_limited";
  if (
    /\b(fetch failed|ENOTFOUND|ECONNREFUSED|EAI_AGAIN|ECONNRESET|ECONNABORTED|network|getaddrinfo|socket hang up)\b/i.test(
      message
    )
  )
    return "network";
  if ((status !== undefined && status >= 500) || /\b(500|502|503|504)\b/.test(message)) return "server_error";
  if (status !== undefined || /\b(400|422)\b/.test(message)) return "request";
  return "unknown";
}

// Scrubs anything that looks like a live API key out of provider error text. Providers
// normally never echo the Authorization header back, but if one ever does (bad proxy, odd
// error body), the "Technical detail" section must not become the leak.
const KEY_SHAPES: Array<[RegExp, string]> = [
  [/nvapi-[A-Za-z0-9_-]{8,}/g, "nvapi-***"],
  [/sk-[A-Za-z0-9_-]{8,}/g, "sk-***"],
  [/AIza[A-Za-z0-9_-]{8,}/g, "AIza***"],
];

function redactKeys(text: string): string {
  let out = text;
  for (const [pattern, replacement] of KEY_SHAPES) out = out.replace(pattern, replacement);
  return out;
}

// Rewrites an error into a message a normal user can act on — what went wrong on whose side
// and what to do about it — with the raw provider error kept below a separator so details
// aren't lost. Used by handlers.ts after the provider/retry chain is exhausted.
export function friendlyErrorMessage(err: unknown): string {
  const message = redactKeys(err instanceof Error ? err.message : String(err));
  const detail = `\n\nTechnical detail: ${message}`;
  switch (classifyError(err)) {
    case "invalid_key":
      return `The API key was rejected by the AI provider. Check that the key is pasted correctly and still active in Settings → AI provider (a key for one provider won't work on another — e.g. an NVIDIA "nvapi-…" key must be saved with the NVIDIA provider selected).${detail}`;
    case "model_not_found":
      return `The AI provider doesn't recognize the configured model for your key. If you set a model override (e.g. NVIDIA_MODEL in .env), check its exact name against the provider's model catalog, or remove the override to use the built-in defaults.${detail}`;
    case "rate_limited":
      return `The AI provider is rate-limiting this key (too many requests, or the free tier's quota for now). Already retried automatically — wait a bit and try again, or switch provider in Settings if you have another key configured.${detail}`;
    case "server_error":
      return `The AI provider's servers are having a problem right now (their side, not this app). Already retried automatically — try again in a moment, or switch provider in Settings if you have another key configured.${detail}`;
    case "timeout":
      return `The AI provider didn't respond in time and the request was cancelled. Check your internet connection, then try again — long generations can also just be slow on the provider's side.${detail}`;
    case "network":
      return `Couldn't reach the AI provider — check your internet connection (or, for Local (Ollama), that Ollama is running).${detail}`;
    case "request":
      return `The AI provider rejected the request as malformed. If you've overridden the model or edited configuration, undo that change and try again.${detail}`;
    default:
      return message;
  }
}
