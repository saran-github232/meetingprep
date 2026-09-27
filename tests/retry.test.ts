import { test } from "node:test";
import assert from "node:assert/strict";
import { withRetry, withFallback, withStreamFallback } from "../electron/ai/retry.ts";

function errWithStatus(status: number): Error & { status: number } {
  const e = new Error(`Provider error: ${status}`) as Error & { status: number };
  e.status = status;
  return e;
}

test("withRetry retries a 429 and then succeeds", async () => {
  let attempts = 0;
  const result = await withRetry(async () => {
    attempts++;
    if (attempts < 3) throw errWithStatus(429);
    return "ok";
  });
  assert.equal(result, "ok");
  assert.equal(attempts, 3);
});

test("withRetry does not retry a non-retryable status (401)", async () => {
  let attempts = 0;
  await assert.rejects(
    withRetry(async () => {
      attempts++;
      throw errWithStatus(401);
    }),
    /401/
  );
  assert.equal(attempts, 1);
});

test("withRetry gives up after all backoff delays are exhausted", async () => {
  let attempts = 0;
  await assert.rejects(
    withRetry(async () => {
      attempts++;
      throw errWithStatus(503);
    }),
    /503/
  );
  assert.equal(attempts, 4); // 1 initial + 3 retries
});

test("withFallback returns the first successful attempt", async () => {
  const result = await withFallback([
    async () => {
      throw errWithStatus(404);
    },
    async () => "second",
    async () => "never",
  ]);
  assert.equal(result, "second");
});

test("withFallback throws the last error when everything fails", async () => {
  await assert.rejects(
    withFallback([
      async () => {
        throw new Error("first failure");
      },
      async () => {
        throw new Error("last failure");
      },
    ]),
    /last failure/
  );
});

test("withStreamFallback falls through to the next attempt when nothing was yielded", async () => {
  async function* failing() {
    throw new Error("clean failure before output");
    yield "never";
  }
  async function* working() {
    yield "a";
    yield "b";
  }
  const chunks: string[] = [];
  for await (const c of withStreamFallback([failing, working])) chunks.push(c);
  assert.deepEqual(chunks, ["a", "b"]);
});

test("withStreamFallback reports (not restarts) a failure after output was yielded", async () => {
  let firstConsumed = false;
  async function* partial() {
    yield "first-half";
    firstConsumed = true;
    throw new Error("mid-stream failure");
  }
  async function* never() {
    yield "must not run";
  }
  const chunks: string[] = [];
  await assert.rejects(
    (async () => {
      for await (const c of withStreamFallback([partial, never])) chunks.push(c);
    })(),
    /mid-stream failure/
  );
  assert.equal(firstConsumed, true);
  assert.deepEqual(chunks, ["first-half"]);
});
