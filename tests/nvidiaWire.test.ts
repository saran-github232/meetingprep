import { test } from "node:test";
import assert from "node:assert/strict";
import {
  NVIDIA_BASE_URL,
  NVIDIA_MODELS,
  chatRequest,
  makeThinkFilter,
  stripThinking,
} from "../electron/ai/nvidiaWire.ts";

test("chat request targets NVIDIA's documented OpenAI-compatible endpoint with Bearer auth", () => {
  const { url, init } = chatRequest("nvapi-test-key", "meta/llama-3.3-70b-instruct", "hello", false, 1000);
  assert.equal(url, "https://integrate.api.nvidia.com/v1/chat/completions");
  assert.equal(init.method, "POST");
  const headers = init.headers as Record<string, string>;
  assert.equal(headers.Authorization, "Bearer nvapi-test-key");
  assert.equal(headers["Content-Type"], "application/json");
});

test("chat request body matches the NIM chat-completions schema", () => {
  const { init } = chatRequest("nvapi-k", "z-ai/glm-5.3-flash", "What is VPC peering?", true, 1000);
  const body = JSON.parse(init.body as string);
  assert.deepEqual(body, {
    model: "z-ai/glm-5.3-flash",
    messages: [{ role: "user", content: "What is VPC peering?" }],
    stream: true,
  });
});

test("the key is only sent in the Authorization header, never in the URL", () => {
  const { url, init } = chatRequest("nvapi-secret-value", "m", "p", false, 1000);
  assert.ok(!url.includes("nvapi-secret-value"));
  assert.ok((init.headers as Record<string, string>).Authorization.includes("nvapi-secret-value"));
});

test("default model chain starts with nvidia/nemotron-3-super-120b-a12b and has fallbacks", () => {
  assert.equal(NVIDIA_MODELS[0], "nvidia/nemotron-3-super-120b-a12b");
  assert.ok(NVIDIA_MODELS.length >= 2);
  for (const model of NVIDIA_MODELS) assert.match(model, /^[a-z0-9._/-]+$/);
});

test("nemotron models disable thinking via the documented NIM extension", () => {
  const { init } = chatRequest("nvapi-k", "nvidia/nemotron-3-super-120b-a12b", "p", false, 1000);
  const body = JSON.parse(init.body as string);
  assert.deepEqual(body.chat_template_kwargs, { thinking: false });
});

test("non-nemotron models get a clean payload with no chat_template_kwargs", () => {
  const { init } = chatRequest("nvapi-k", "z-ai/glm-5.3-flash", "p", false, 1000);
  const body = JSON.parse(init.body as string);
  assert.ok(!("chat_template_kwargs" in body));
});

test("stripThinking removes think blocks and surrounding whitespace", () => {
  assert.equal(stripThinking("<think>internal doubt</think>### Answer\nUse kubectl."), "### Answer\nUse kubectl.");
  assert.equal(stripThinking("clean text"), "clean text");
  assert.equal(stripThinking("<think>a</think>middle<think>b</think>end"), "middleend");
});

test("think filter passes normal streamed chunks through untouched", () => {
  const f = makeThinkFilter();
  let out = "";
  for (const chunk of ["Hel", "lo, ", "wor", "ld!"]) out += f.push(chunk);
  out += f.flush();
  assert.equal(out, "Hello, world!");
});

test("think filter drops a reasoning block that arrives in one chunk", () => {
  const f = makeThinkFilter();
  let out = f.push("<think>reasoning about the answer</think>");
  out += f.push("### Answer");
  out += f.flush();
  assert.equal(out, "### Answer");
});

test("think filter handles reasoning split across chunk boundaries without leaking tags", () => {
  const f = makeThinkFilter();
  let out = "";
  for (const chunk of ["<thi", "nk>hidden ", "though", "ts</thi", "nk>visib", "le tail"]) out += f.push(chunk);
  out += f.flush();
  assert.equal(out, "visible tail");
});

test("think filter holds back a partial opening tag at a chunk boundary", () => {
  const f = makeThinkFilter();
  // "<thi" must not be emitted yet — it may become "<think>" with the next chunk.
  assert.equal(f.push("answer so far <thi"), "answer so far ");
  assert.equal(f.push("nk>secret"), "");
  assert.equal(f.push(" after</think>"), "");
  assert.equal(f.push(" done"), " done");
  assert.equal(f.flush(), "");
});

test("think filter discards an unterminated think block at end of stream", () => {
  const f = makeThinkFilter();
  let out = f.push("visible <think>never closed");
  out += f.flush();
  assert.equal(out, "visible ");
});
