import { test } from "node:test";
import assert from "node:assert/strict";
import { classifyError, friendlyErrorMessage } from "../electron/ai/retry.ts";

function errWithStatus(status: number, message = "Provider error"): Error & { status: number } {
  const e = new Error(message) as Error & { status: number };
  e.status = status;
  return e;
}

test("401/403 with a status property classify as invalid key", () => {
  assert.equal(classifyError(errWithStatus(401)), "invalid_key");
  assert.equal(classifyError(errWithStatus(403)), "invalid_key");
});

test("Gemini-style 'API key not valid' message classifies as invalid key even without status", () => {
  const e = new Error("[GoogleGenerativeAI Error]: Error fetching from ...: [400 ] API key not valid. Please pass a valid API key.");
  assert.equal(classifyError(e), "invalid_key");
  assert.match(friendlyErrorMessage(e), /API key was rejected/i);
});

test("404 classifies as model not found", () => {
  assert.equal(classifyError(errWithStatus(404, 'NVIDIA error: 404 {"detail":"Model not found"}')), "model_not_found");
  assert.match(friendlyErrorMessage(errWithStatus(404)), /model/i);
});

test("410 (retired/end-of-life model) classifies as model not found", () => {
  const e = errWithStatus(
    410,
    'NVIDIA error: 410 {"detail":"The model \'meta/llama-3.3-70b-instruct\' has reached its end of life and is no longer available."}'
  );
  assert.equal(classifyError(e), "model_not_found");
  assert.match(friendlyErrorMessage(e), /model/i);
});

test("429 classifies as rate limited and mentions the automatic retry", () => {
  assert.equal(classifyError(errWithStatus(429)), "rate_limited");
  const msg = friendlyErrorMessage(errWithStatus(429));
  assert.match(msg, /rate-limit/i);
  assert.match(msg, /retried automatically/i);
});

test("5xx classifies as server error", () => {
  assert.equal(classifyError(errWithStatus(502)), "server_error");
  assert.equal(classifyError(errWithStatus(500)), "server_error");
});

test("AbortSignal timeout classifies as timeout", () => {
  const e = new Error("The operation was aborted due to timeout");
  e.name = "TimeoutError";
  assert.equal(classifyError(e), "timeout");
  assert.match(friendlyErrorMessage(e), /timed out|didn't respond in time/i);
});

test("fetch network failures classify as network", () => {
  assert.equal(classifyError(new TypeError("fetch failed")), "network");
  const e = new Error("getaddrinfo ENOTFOUND integrate.api.nvidia.com");
  assert.equal(classifyError(e), "network");
  assert.match(friendlyErrorMessage(e), /internet connection/i);
});

test("malformed request (400 with status) classifies as request error", () => {
  assert.equal(classifyError(errWithStatus(400, "OpenAI error: 400 invalid_request")), "request");
});

test("unknown errors pass their original message through unchanged", () => {
  const e = new Error("Something completely different");
  assert.equal(classifyError(e), "unknown");
  assert.equal(friendlyErrorMessage(e), "Something completely different");
});

test("friendly messages keep the raw technical detail after a separator", () => {
  const msg = friendlyErrorMessage(errWithStatus(401, "NVIDIA error: 401 Unauthorized"));
  assert.match(msg, /Technical detail: NVIDIA error: 401/);
});

test("invalid-key guidance calls out cross-provider key confusion explicitly", () => {
  const msg = friendlyErrorMessage(errWithStatus(401, "NVIDIA error: 401"));
  assert.match(msg, /nvapi-/);
});
