import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseMeetingSummary,
  parseInterviewPrep,
  parseQuestionList,
  structuredAnswerPrompt,
  resumeTailoringPrompt,
} from "../electron/ai/promptTemplates.ts";

test("parseMeetingSummary extracts title, summary, and action items", () => {
  const raw = `### Title
Weekly release sync
### Summary
We discussed the UAT push and agreed to hold it until the fix lands.
### Action Items
- Saran to verify the hotfix in UAT
- Team to update the release calendar`;
  const parsed = parseMeetingSummary(raw);
  assert.equal(parsed.title, "Weekly release sync");
  assert.match(parsed.summary, /UAT push/);
  assert.equal(parsed.actionItems.length, 2);
  assert.equal(parsed.actionItems[0], "Saran to verify the hotfix in UAT");
});

test("parseMeetingSummary maps 'none' to an empty action-item list", () => {
  const raw = `### Title\nStandup\n### Summary\nNothing decided.\n### Action Items\nnone`;
  const parsed = parseMeetingSummary(raw);
  assert.deepEqual(parsed.actionItems, []);
});

test("parseMeetingSummary tolerates a missing section", () => {
  const parsed = parseMeetingSummary("no structure at all");
  assert.equal(parsed.title, "");
  assert.equal(parsed.summary, "");
  assert.deepEqual(parsed.actionItems, []);
});

test("parseInterviewPrep splits questions from answer angles on the em dash", () => {
  const raw = `### Questions
- Explain how you handle a failing Jenkins pipeline — Talk about the last pipeline you debugged and the fix
- What is a Kubernetes liveness probe? — Define it and mention a misconfiguration you fixed`;
  const parsed = parseInterviewPrep(raw);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].question, "Explain how you handle a failing Jenkins pipeline");
  assert.match(parsed[0].angle, /last pipeline/);
});

test("parseInterviewPrep keeps lines without a dash as bare questions", () => {
  const parsed = parseInterviewPrep("### Questions\n- What is VPC peering?");
  assert.equal(parsed[0].question, "What is VPC peering?");
  assert.equal(parsed[0].angle, "");
});

test("parseInterviewPrep falls back to the raw text when no Questions section exists", () => {
  const parsed = parseInterviewPrep("- Q1 — angle one\n- Q2 — angle two");
  assert.equal(parsed.length, 2);
});

test("parseQuestionList strips numbering/bullets and caps at the requested count", () => {
  const raw = ["1. First question", "2) Second question", "- Third question", "Fourth question", "Fifth"].join("\n");
  assert.deepEqual(parseQuestionList(raw, 3), ["First question", "Second question", "Third question"]);
});

test("parseQuestionList drops blank lines", () => {
  assert.deepEqual(parseQuestionList("\n\nOnly one\n\n", 5), ["Only one"]);
});

test("prompts embed resume context when provided and guard against fabrication when not", () => {
  const withResume = structuredAnswerPrompt("Q?", "technical", "short", "DevOps at Infosys");
  assert.match(withResume, /DevOps at Infosys/);
  const withoutResume = structuredAnswerPrompt("Q?", "technical", "short", null);
  assert.match(withoutResume, /without inventing personal experience/);
});

test("resume tailoring prompt forbids inventing experience and demands section headers", () => {
  const prompt = resumeTailoringPrompt("my resume", "the job", "DevOps Engineer");
  assert.match(prompt, /never invent experience/);
  assert.match(prompt, /### Tailored Resume/);
  assert.match(prompt, /### ATS Score/);
});
