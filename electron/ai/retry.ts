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

// Rewrites a busy-provider error into a message that tells the user what's actually going on
// (Google/OpenAI/Anthropic's servers, not the app) and what to do about it, after retries were
// already exhausted by withRetry().
export function friendlyErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (isRetryable(err)) {
    return `The AI provider is temporarily overloaded (busy servers on their end, not this app). Already retried automatically — please wait a bit and try again, or switch provider in Settings if you have another key configured.\n\n${message}`;
  }
  return message;
}
