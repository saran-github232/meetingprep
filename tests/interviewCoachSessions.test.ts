import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COACH_FORMATS,
  coachTestAnalysis,
  coachTestFeedback,
  coachTestQuestion,
  formatCoachDuration,
  formatCoachElapsed,
  isCoachTestModeEnabled,
  isUsefulAnalysis,
  parseCoachFeedback,
  parseCoachQuestion,
  parseInterviewCoachContext,
  type CoachSetup,
} from "../electron/ai/interviewCoach.ts";

// ---------------------------------------------------------------------------
// Interview formats (Human / Virtual AI)
// ---------------------------------------------------------------------------

test("both interview formats are defined with distinct labels", () => {
  assert.deepEqual(
    COACH_FORMATS.map((f) => f.id),
    ["human", "virtual_ai"]
  );
  assert.notEqual(COACH_FORMATS[0].label, COACH_FORMATS[1].label);
});

test("formatCoachDuration renders human-readable spans and safe fallbacks", () => {
  // Same-minute start/end still reports the minimum unit.
  assert.equal(formatCoachDuration("2026-10-06 10:00:00", "2026-10-06 10:00:30"), "1 min");
  assert.equal(formatCoachDuration("2026-10-06 10:00:00", "2026-10-06 10:18:00"), "18 min");
  assert.equal(formatCoachDuration("2026-10-06 10:00:00", "2026-10-06 11:32:00"), "1 h 32 min");
  // Missing/garbage timestamps degrade to a dash, never throw.
  assert.equal(formatCoachDuration("", null), "—");
  assert.equal(formatCoachDuration("not a date", "also not"), "—");
});

// ---------------------------------------------------------------------------
// Test Mode
// ---------------------------------------------------------------------------

test("isCoachTestModeEnabled only honors the explicit on flag", () => {
  assert.equal(isCoachTestModeEnabled("1"), true);
  assert.equal(isCoachTestModeEnabled("0"), false);
  assert.equal(isCoachTestModeEnabled(undefined), false);
  assert.equal(isCoachTestModeEnabled(""), false);
});

test("test-mode fixtures flow through the same parsers as real AI output", () => {
  // The canned analysis must parse and be accepted as a useful session context.
  const analysis = coachTestAnalysis();
  assert.ok(isUsefulAnalysis(analysis));
  assert.ok(analysis.strengths.length > 0 && analysis.missingSkills.length > 0);

  // The canned feedback must parse into every structured section the studio renders.
  const feedback = parseCoachFeedback(coachTestFeedback());
  assert.ok(feedback.suggestedAnswer.length > 40);
  assert.ok(feedback.keyPoints.length > 0);
  assert.ok(feedback.missingPoints.length > 0);
  assert.ok(feedback.resumeEvidence.length > 0);
  assert.ok(feedback.followUpQuestions.length > 0);

  // Canned questions survive the same cleaning as real model output.
  for (let i = 0; i < 5; i++) {
    assert.equal(parseCoachQuestion(coachTestQuestion(i)), coachTestQuestion(i));
  }
});

test("test-mode questions cycle deterministically for repeated sessions", () => {
  assert.equal(coachTestQuestion(0), coachTestQuestion(5));
  assert.notEqual(coachTestQuestion(0), coachTestQuestion(1));
});

test("formatCoachElapsed ticks in m:ss and h:mm:ss, safely clamped", () => {
  const start = "2026-10-06 10:00:00";
  const at = (ms: number) => new Date("2026-10-06T10:00:00").getTime() + ms;
  assert.equal(formatCoachElapsed(start, at(0)), "0:00");
  assert.equal(formatCoachElapsed(start, at(5_000)), "0:05");
  assert.equal(formatCoachElapsed(start, at(75_000)), "1:15");
  assert.equal(formatCoachElapsed(start, at(3_600_000 + 61_000)), "1:01:01");
  // Garbage stamps degrade to zero, and a clock behind the start never goes negative.
  assert.equal(formatCoachElapsed("nonsense", at(999)), "0:00");
  assert.equal(formatCoachElapsed(start, at(-5000)), "0:00");
});

// ---------------------------------------------------------------------------
// Session isolation: the parsers must never carry state between sessions
// ---------------------------------------------------------------------------

test("parsing is stateless — a fresh parse of a different session yields fresh results", () => {
  const first = parseInterviewCoachContext("### Candidate Profile\nSession one profile.");
  const second = parseInterviewCoachContext("### Candidate Profile\nSession two profile.");
  assert.equal(first.candidateProfile, "Session one profile.");
  assert.equal(second.candidateProfile, "Session two profile.");
  assert.deepEqual(second.strengths, [], "no strengths can leak from a previous parse");
});

// Keep the setup literal used below in sync with the interface.
const _setupShape: CoachSetup = {
  jobTitle: "",
  company: "",
  jobDescription: "",
  requiredSkills: "",
  preferredSkills: "",
  experienceLevel: "",
  responsibilities: "",
  techStack: "",
  interviewType: "mixed",
  notes: "",
};
void _setupShape;
