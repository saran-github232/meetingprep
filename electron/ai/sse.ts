// Parses a text/event-stream Response into its "data:" payloads. Uses the platform fetch/Response
// APIs built into Node 20+ (Electron's runtime) — no SSE client dependency needed.
export async function* sseEvents(response: Response): AsyncIterable<string> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf("\n\n")) !== -1) {
      const rawEvent = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      for (const line of rawEvent.split("\n")) {
        if (line.startsWith("data:")) yield line.slice(5).trim();
      }
    }
  }
}
