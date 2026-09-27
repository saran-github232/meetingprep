// Pure, import-free wire-level helpers for the NVIDIA NIM provider — kept separate so the
// test suite (node --test with type stripping) can import them without hitting the
// provider's relative imports or the bundler-only resolution style.

// NVIDIA Build (build.nvidia.com) serves an OpenAI-compatible API ("NIM") — same
// chat/completions shape as OpenAI, different host and auth scope. Docs:
// https://docs.api.nvidia.com/nim/reference/llm-apis
export const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";

// Ordered default-first; if one is unavailable, the next is tried automatically.
// Verified live against integrate.api.nvidia.com on 2026-09-27 (the older catalog —
// meta/llama-3.3-70b-instruct, qwen3-next, gpt-oss-120b — is already end-of-life, 410 Gone).
// nvidia/nemotron-3-super-120b-a12b leads: NVIDIA's first-party MoE (120B total, 12B active
// per token) — fast streaming, 128k context, strong instruction following for the app's
// exact-format prompts. Nemotron models get "thinking": false (see chatRequest) so no
// reasoning trace pollutes the structured sections.
export const NVIDIA_MODELS = [
  "nvidia/nemotron-3-super-120b-a12b",
  "nvidia/nemotron-3.5-lightning-30b-a3b",
  "z-ai/glm-5.3-flash",
];

/**
 * Builds the request for one NIM chat completion. Kept pure so tests can assert the
 * exact wire format against NVIDIA's documented API without network access.
 */
export function chatRequest(
  apiKey: string,
  model: string,
  prompt: string,
  stream: boolean,
  timeoutMs: number
): { url: string; init: RequestInit } {
  const body: Record<string, unknown> = {
    model,
    messages: [{ role: "user", content: prompt }],
    stream,
  };
  // Nemotron models are reasoning hybrids — without this documented NIM extension they
  // emit a <think> trace before the answer (slower, and the app's strict "### section"
  // format would start with it). The streamed think-filter remains as a safety net.
  if (/^nvidia\/.*nemotron/i.test(model)) {
    body.chat_template_kwargs = { thinking: false };
  }
  return {
    url: `${NVIDIA_BASE_URL}/chat/completions`,
    init: {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeoutMs),
    },
  };
}

/**
 * Incremental filter that drops <think>…</think> reasoning blocks from streamed text.
 * Some NIM models (e.g. nemotron) emit their reasoning inline in the content stream; the
 * app's structured "### section" output must contain only the final answer. Holds back a
 * partial tag at the chunk boundary so a split "<thi…nk>" can't leak through.
 */
export function makeThinkFilter(): {
  push: (chunk: string) => string;
  flush: () => string;
} {
  const OPEN = "<think>";
  const CLOSE = "</think>";
  let buffer = "";
  let inside = false;

  // Length of any tag prefix stuck at the end of `text` (up to a full match).
  function trailingTagLength(text: string, tag: string): number {
    for (let len = Math.min(tag.length - 1, text.length); len > 0; len--) {
      if (text.endsWith(tag.slice(0, len))) return len;
    }
    return 0;
  }

  return {
    push(chunk: string): string {
      buffer += chunk;
      let out = "";
      for (;;) {
        if (!inside) {
          const start = buffer.indexOf(OPEN);
          if (start === -1) {
            const keep = trailingTagLength(buffer, OPEN);
            out += buffer.slice(0, buffer.length - keep);
            buffer = buffer.slice(buffer.length - keep);
            break;
          }
          out += buffer.slice(0, start);
          buffer = buffer.slice(start + OPEN.length);
          inside = true;
        } else {
          const end = buffer.indexOf(CLOSE);
          if (end === -1) {
            const keep = trailingTagLength(buffer, CLOSE);
            buffer = buffer.slice(buffer.length - keep);
            break;
          }
          buffer = buffer.slice(end + CLOSE.length);
          inside = false;
        }
      }
      return out;
    },
    flush(): string {
      const rest = inside ? "" : buffer; // mid-think at end of stream: drop the remainder
      buffer = "";
      return rest;
    },
  };
}

/** Removes one or more <think>…</think> blocks from a complete response. */
export function stripThinking(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}
