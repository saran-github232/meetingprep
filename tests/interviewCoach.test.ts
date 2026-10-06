import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appendTranscriptSegment,
  buildSessionMemory,
  coachAnalysisPrompt,
  coachFeedbackPrompt,
  coachMaxTokens,
  coachQuestionPrompt,
  clip,
  compactContextForSpeed,
  isUsefulAnalysis,
  orderNamesForCoach,
  parseCoachFeedback,
  parseCoachQuestion,
  parsePartialCoachFeedback,
  parseInterviewCoachContext,
  validateCoachSetup,
  type CoachSetup,
} from "../electron/ai/interviewCoach.ts";
import { chatRequest, nvidiaCoachModels } from "../electron/ai/nvidiaWire.ts";
import { friendlyErrorMessage } from "../electron/ai/retry.ts";

const VALID_SETUP: CoachSetup = {
  jobTitle: "Backend Engineer",
  company: "Acme",
  jobDescription: "Build APIs with Python and SQL. 3+ years experience required.",
  requiredSkills: "Python, SQL",
  preferredSkills: "Docker",
  experienceLevel: "Mid-level",
  responsibilities: "Design schemas",
  techStack: "Python, Postgres",
  interviewType: "technical",
  notes: "",
};

const RESUME =
  "Jane Doe — Backend engineer. 4 years at Initech building Python services on Postgres. Led the billing migration.";

// ---------------------------------------------------------------------------
// 1. Setup parsing/validation
// ---------------------------------------------------------------------------

test("validateCoachSetup blocks a missing job description and missing identity", () => {
  const problems = validateCoachSetup({ ...VALID_SETUP, jobDescription: "  ", jobTitle: "", company: "" });
  assert.equal(problems.length, 2);
  assert.ok(problems[0].includes("job description"));
});

test("validateCoachSetup accepts a complete setup and tolerates a missing resume", () => {
  assert.deepEqual(validateCoachSetup(VALID_SETUP), []);
});

// ---------------------------------------------------------------------------
// 2/3. Resume + job-description grounding and budgeting
// ---------------------------------------------------------------------------

test("coachAnalysisPrompt embeds the resume and forbids invented experience", () => {
  const prompt = coachAnalysisPrompt(VALID_SETUP, RESUME);
  assert.ok(prompt.includes(RESUME));
  assert.ok(/never invent/i.test(prompt));
  assert.ok(prompt.includes("Backend Engineer"));
  assert.ok(prompt.includes("Python, SQL"));
});

test("coachAnalysisPrompt handles an empty resume without crashing", () => {
  const prompt = coachAnalysisPrompt(VALID_SETUP, null);
  assert.ok(prompt.includes('""'));
  assert.ok(/never invent/i.test(prompt));
});

test("clip truncates long text with an ellipsis and leaves short text alone", () => {
  assert.equal(clip("hello", 10), "hello");
  const long = "a".repeat(50);
  const clipped = clip(long, 10);
  assert.ok(clipped.startsWith("aaaaaaaaaa"));
  assert.ok(clipped.endsWith("…"));
  assert.ok(clipped.length <= 12);
});

test("compactContextForSpeed shrinks as speed increases (fast ⊆ balanced ⊆ quality)", () => {
  const ctx = parseInterviewCoachContext(
    [
      "### Candidate Profile",
      "Jane is a backend engineer with four years of Python and Postgres experience at Initech.",
      "### Strengths",
      "- Python services",
      "- SQL schema design",
      "- Billing migration lead",
      "### Weak Areas",
      "- No Kubernetes evidence",
      "### Missing Skills",
      "- Docker",
      "- Kubernetes",
      "### Likely Topics",
      "- API design",
      "- Database indexing",
    ].join("\n")
  );
  const fast = compactContextForSpeed(ctx, "fast");
  const balanced = compactContextForSpeed(ctx, "balanced");
  const quality = compactContextForSpeed(ctx, "quality");
  assert.ok(fast.length > 0 && fast.length < balanced.length && balanced.length < quality.length);
  assert.ok(fast.includes("Python services"));
  assert.ok(!fast.includes("Kubernetes evidence"), "fast mode drops weak-area detail");
  assert.ok(quality.includes("Kubernetes evidence"));
});

// ---------------------------------------------------------------------------
// 4. Interview context generation (analysis parsing)
// ---------------------------------------------------------------------------

const ANALYSIS_RAW = `### Candidate Profile
Jane is a backend engineer with strong Python and SQL experience.

### Relevant Experience
- 4 years at Initech on billing services

### Strengths
- Python services
- SQL schema design

### Weak Areas
- No Kubernetes evidence

### Matched Skills
- Python
- SQL

### Missing Skills
- Docker

### Likely Topics
- API design

### Likely Technical Questions
- How would you design a billing API?

### Likely Behavioral Questions
- Tell me about a production incident you owned.

### Likely Project Questions
- Walk me through the billing migration.

### Likely Resume Questions
- Why did you leave Initech?`;

test("parseInterviewCoachContext parses every section into fields", () => {
  const ctx = parseInterviewCoachContext(ANALYSIS_RAW);
  assert.ok(ctx.candidateProfile.startsWith("Jane is a backend engineer"));
  assert.equal(ctx.strengths.length, 2);
  assert.deepEqual(ctx.missingSkills, ["Docker"]);
  assert.equal(ctx.likelyTechnical[0], "How would you design a billing API?");
  assert.equal(ctx.likelyResumeQuestions[0], "Why did you leave Initech?");
  assert.ok(isUsefulAnalysis(ctx));
});

test("isUsefulAnalysis rejects an unusable (empty) analysis", () => {
  assert.equal(isUsefulAnalysis(parseInterviewCoachContext("The provider said: sure thing!")), false);
});

// ---------------------------------------------------------------------------
// 5/8. Provider selection (preference reorders, never restricts)
// ---------------------------------------------------------------------------

test("orderNamesForCoach moves the preferred provider to the front and keeps the fallback chain", () => {
  const chain = ["openai", "nvidia", "gemini", "local"];
  assert.deepEqual(orderNamesForCoach(chain, "gemini"), ["gemini", "openai", "nvidia", "local"]);
  assert.deepEqual(orderNamesForCoach(chain, "nvidia"), ["nvidia", "openai", "gemini", "local"]);
  // "auto" keeps the app-wide chain untouched.
  assert.deepEqual(orderNamesForCoach(chain, "auto"), chain);
  // A preferred provider with no configured key is ignored — the chain still works.
  assert.deepEqual(orderNamesForCoach(chain, "anthropic"), chain);
});

// ---------------------------------------------------------------------------
// 9. Invalid key handling (error classifier never leaks the key)
// ---------------------------------------------------------------------------

test("invalid-key errors are classified and never echo the key material", () => {
  const secret = "sk-super-secret-value-12345";
  const err = new Error(`Provider error: 401 {"error":"invalid key ${secret}"}`) as Error & { status: number };
  err.status = 401;
  const message = friendlyErrorMessage(err);
  assert.ok(message.includes("rejected by the AI provider"));
  assert.ok(!message.includes(secret), "the API key must never appear in a user-facing error");
});

// ---------------------------------------------------------------------------
// 10. Model fallback chains (speed → provider model chains)
// ---------------------------------------------------------------------------

// NVIDIA retires models regularly (llama-3.3-70b went 410 Gone); the coach chains must
// never reference a retired model and must reuse the provider's own verified chain.
const RETIRED_NVIDIA_MODELS = ["meta/llama-3.3-70b-instruct"];

test("nvidiaCoachModels: fast leads with the lightweight model and reuses the verified chain", () => {
  const fast = nvidiaCoachModels("fast");
  const balanced = nvidiaCoachModels("balanced");
  const quality = nvidiaCoachModels("quality");
  assert.ok(fast.length >= 2, "fast still has a fallback");
  assert.notEqual(fast[0], balanced[0], "fast must lead with a different (lighter) model");
  assert.deepEqual(balanced, quality);
  for (const chain of [fast, balanced, quality]) {
    for (const model of chain) {
      assert.ok(!RETIRED_NVIDIA_MODELS.includes(model), `${model} is retired`);
    }
  }
});

test("chatRequest supports an output-token cap for coach requests", () => {
  const { init } = chatRequest("test-key", "m", "prompt", true, 1000, 480);
  const body = JSON.parse(String(init.body));
  assert.equal(body.max_tokens, 480);
  assert.equal(body.stream, true);
});

// ---------------------------------------------------------------------------
// 11. Feedback parsing (complete + progressively streamed)
// ---------------------------------------------------------------------------

const FEEDBACK_RAW = `### Suggested Answer
I led the billing migration at Initech, moving 40 services to a new schema.

### Why This Works
It names scope, action, and result.

### Key Points
- Own the migration story
- Quantify the outcome

### Missing Points
- Mention the rollback plan

### Resume Evidence
- 4 years at Initech building Python services

### Job Match
Directly matches the required Python and SQL depth.

### Follow-up Questions
- How did you handle dual writes?`;

test("parseCoachFeedback extracts all sections; 'none' placeholders become empty lists", () => {
  const fb = parseCoachFeedback(FEEDBACK_RAW);
  assert.ok(fb.suggestedAnswer.startsWith("I led the billing migration"));
  assert.equal(fb.keyPoints.length, 2);
  assert.deepEqual(fb.missingPoints, ["Mention the rollback plan"]);
  assert.equal(fb.resumeEvidence.length, 1);
  assert.equal(fb.followUpQuestions.length, 1);
  const noneVersion = parseCoachFeedback(
    FEEDBACK_RAW.replace("- Mention the rollback plan", "none").replace(
      "- 4 years at Initech building Python services",
      "none"
    )
  );
  assert.deepEqual(noneVersion.missingPoints, []);
  assert.deepEqual(noneVersion.resumeEvidence, []);
});

test("parsePartialCoachFeedback renders sections as they stream in", () => {
  const partial = `### Suggested Answer
I led the billing migration at Initech.

### Why This Works
It names scope`;
  const fb = parsePartialCoachFeedback(partial);
  assert.ok(fb.suggestedAnswer.startsWith("I led the billing migration"));
  assert.ok(fb.whyItWorks.length > 0);
  assert.equal(fb.keyPoints.length, 0, "sections that haven't streamed yet stay empty");
});

// ---------------------------------------------------------------------------
// 12. Transcript handling
// ---------------------------------------------------------------------------

test("appendTranscriptSegment joins finalized segments and drops duplicates", () => {
  assert.equal(appendTranscriptSegment("", "I built the API"), "I built the API");
  assert.equal(appendTranscriptSegment("I built the API", "with Postgres"), "I built the API with Postgres");
  // Chromium can re-emit the same final result after a recognizer restart.
  assert.equal(appendTranscriptSegment("I built the API", "I built the API"), "I built the API");
  assert.equal(appendTranscriptSegment("I built the API", "   "), "I built the API");
});

// ---------------------------------------------------------------------------
// 13. Session memory (compact, trimmed, no full history resend)
// ---------------------------------------------------------------------------

test("buildSessionMemory keeps only the last N pairs, clipped per line", () => {
  const items = Array.from({ length: 10 }, (_, i) => ({
    question: `Question ${i} ${"x".repeat(200)}`,
    answerExcerpt: `Answer ${i} ${"y".repeat(300)}`,
    feedbackNote: `Note ${i}`,
  }));
  const memory = buildSessionMemory(items, 6);
  assert.ok(!memory.includes("Question 0 "), "older pairs must be trimmed away");
  assert.ok(memory.includes("Question 9"));
  assert.ok(memory.includes("Coach note: Note 9"));
  // Every line is clipped: no unbounded growth from long answers.
  assert.ok(memory.length < 6 * (150 + 210 + 150 + 20), "memory must stay compact");
  assert.equal(buildSessionMemory([], 6), "");
});

// ---------------------------------------------------------------------------
// 14. Output/token budgeting
// ---------------------------------------------------------------------------

test("coachMaxTokens scales with speed and length, staying within sane bounds", () => {
  assert.ok(coachMaxTokens("fast", "short") < coachMaxTokens("fast", "detailed"));
  assert.ok(coachMaxTokens("fast", "medium") < coachMaxTokens("quality", "medium"));
  assert.ok(coachMaxTokens("quality", "detailed") >= 1000);
  assert.ok(coachMaxTokens("fast", "short") >= 256, "never below the model's practical floor");
});

test("coachQuestionPrompt includes prior questions so they aren't repeated", () => {
  const prompt = coachQuestionPrompt({
    setup: VALID_SETUP,
    ctx: null,
    speed: "fast",
    askedQuestions: ["Tell me about your experience with Python and SQL."],
  });
  assert.ok(prompt.includes("Tell me about your experience with Python and SQL."));
  assert.ok(/ONE/.test(prompt));
});

test("parseCoachQuestion strips numbering, labels, and quotes", () => {
  assert.equal(parseCoachQuestion("1. Tell me about a project you led."), "Tell me about a project you led.");
  assert.equal(parseCoachQuestion('- "How would you design the schema?"'), "How would you design the schema?");
  assert.equal(parseCoachQuestion(""), "");
  assert.equal(parseCoachQuestion("### Header only"), "");
});

// ---------------------------------------------------------------------------
// 15. Empty input handling — no parser may throw on a blank/failed response
// ---------------------------------------------------------------------------

test("parsers return safe defaults for empty or garbage input", () => {
  const emptyCtx = parseInterviewCoachContext("");
  assert.equal(emptyCtx.candidateProfile, "");
  assert.deepEqual(emptyCtx.strengths, []);
  assert.equal(isUsefulAnalysis(emptyCtx), false);

  const emptyFb = parseCoachFeedback("");
  assert.equal(emptyFb.suggestedAnswer, "");
  assert.deepEqual(emptyFb.followUpQuestions, []);

  assert.equal(parsePartialCoachFeedback("").suggestedAnswer, "");
  assert.equal(parseCoachQuestion("   "), "");
  assert.equal(compactContextForSpeed(null, "fast"), "");
  assert.equal(buildSessionMemory([], 6), "");
  assert.equal(clip("", 100), "");
});

test("friendlyErrorMessage redacts live key shapes (nvapi-/sk-/AIza) from technical detail", () => {
  const err = new Error('NVIDIA error: 403 {"detail":"Authorization failed for nvapi-abc123DEF456ghi"}');
  const message = friendlyErrorMessage(err);
  assert.ok(!message.includes("nvapi-abc123DEF456ghi"));
  assert.ok(message.includes("nvapi-***"));
});
