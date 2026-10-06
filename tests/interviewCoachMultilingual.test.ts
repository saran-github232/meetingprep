import { test } from "node:test";
import assert from "node:assert/strict";
import {
  coachFeedbackPrompt,
  coachMaxTokens,
  coachQuestionPrompt,
  detectQuestionLanguage,
  detectRoleProfile,
  jobPostingParsePrompt,
  languageInstruction,
  languageName,
  parseJobPosting,
  ROLE_PROFILE_LABELS,
  type CoachSetup,
} from "../electron/ai/interviewCoach.ts";

const BASE_SETUP: CoachSetup = {
  jobTitle: "Audio Transcription & Alignment Specialist",
  company: "Alignerr",
  jobDescription: "Clean up word-level transcripts and align timing boundaries to spoken audio.",
  requiredSkills: "Telugu fluency, attention to detail",
  preferredSkills: "Praat, ELAN, Subtitle Edit",
  experienceLevel: "Entry-level",
  responsibilities: "Review transcripts; align word timings",
  techStack: "Web-based labeling editor",
  interviewType: "mixed",
  notes: "",
};

// ---------------------------------------------------------------------------
// Language detection (script-range heuristics)
// ---------------------------------------------------------------------------

test("detectQuestionLanguage: English, Telugu, Hindi, and mixed Telugu-English", () => {
  assert.equal(detectQuestionLanguage("How would you design a rate limiter?"), "en");
  assert.equal(detectQuestionLanguage("మీ అనుభవం గురించి చెప్పండి"), "te");
  assert.equal(detectQuestionLanguage("आपका अनुभव कैसा है?"), "hi");
  // A Telugu sentence with a couple of English terms is the normal code-switched case.
  assert.equal(detectQuestionLanguage("మీ transcription experience గురించి చెప్పండి"), "te-en");
  // One stray Latin abbreviation inside Telugu still counts as Telugu.
  assert.equal(detectQuestionLanguage("మీ అనుభవం గురించి చెప్పండి (a)"), "te");
  assert.equal(detectQuestionLanguage(""), "en");
});

test("languageInstruction keeps English headers but switches content language", () => {
  assert.match(languageInstruction("en"), /English/);
  assert.match(languageInstruction("te"), /Telugu/);
  assert.match(languageInstruction("hi"), /Hindi/);
  assert.match(languageInstruction("te-en"), /mixed Telugu-English/);
  // Telugu rules must demand natural speech, not literal translation.
  assert.match(languageInstruction("te"), /Never produce a stilted word-for-word translation/);
  assert.match(languageInstruction("te-en"), /code-switched/);
});

test("languageName maps every effective language", () => {
  assert.equal(languageName("en"), "English");
  assert.equal(languageName("te"), "Telugu");
  assert.equal(languageName("hi"), "Hindi");
  assert.equal(languageName("te-en"), "natural mixed Telugu-English");
});

// ---------------------------------------------------------------------------
// Telugu transcription/alignment role profile
// ---------------------------------------------------------------------------

const ALIGNERR_DUMP = `Audio Transcription & Alignment Specialist (AI Training)
About the Role
We're looking for Audio Transcription & Alignment Specialists to clean up word-level transcripts
inside a proprietary editor — correcting text and precisely aligning timing boundaries to match
spoken audio, frame by frame, word by word.
Organization: Alignerr
What You'll Do
Review and correct word-level transcripts for accuracy, spelling, grammar, and adherence to strict
style and formatting conventions. Precisely align word and segment timing boundaries. Work inside a
specialized web-based audio labeling tool. Identify and resolve edge cases — overlapping speech,
filler words, false starts, background noise, and unclear audio.
Who You Are
Native or near-native English fluency. Exceptionally detail-oriented. Comfortable following strict
style guides. Nice to Have: Background in closed captioning, court reporting, or professional
transcription. Experience in linguistics, phonetics, or audio data annotation. Familiarity with
Praat, ELAN, or Subtitle Edit.`;

test("detectRoleProfile flips to the Telugu transcription profile on a transcription/alignment JD", () => {
  assert.equal(detectRoleProfile(ALIGNERR_DUMP), "telugu_transcription");
  // Even without the word "Telugu", a transcription/alignment posting matches the profile.
  assert.ok(detectRoleProfile(ALIGNERR_DUMP.replace("Alignment Specialists", "Specialists")) === "telugu_transcription");
});

test("detectRoleProfile keeps a general software JD on the general profile", () => {
  const swe = `Senior Backend Engineer — build distributed APIs with Python, Postgres, Kafka, and
  Kubernetes. 5+ years experience required. You will design schemas and lead migrations.`;
  assert.equal(detectRoleProfile(swe), "general");
  assert.equal(detectRoleProfile(""), "general");
});

test("ROLE_PROFILE_LABELS covers both profiles", () => {
  assert.equal(ROLE_PROFILE_LABELS.general, "General");
  assert.match(ROLE_PROFILE_LABELS.telugu_transcription, /Telugu/);
});

test("Telugu profile questions draw from the language-data topic bank and stay in the requested language", () => {
  const prompt = coachQuestionPrompt({
    setup: { ...BASE_SETUP, roleProfile: "telugu_transcription" },
    ctx: null,
    speed: "fast",
    askedQuestions: [],
    language: "en",
  });
  // The topic bank's key domains must all be represented in the steering line.
  for (const topic of [
    "verbatim transcription",
    "punctuation",
    "timestamps",
    "unclear",
    "code-switching",
    "quality assurance",
    "confidentiality",
  ]) {
    assert.ok(prompt.includes(topic), `topic bank missing: ${topic}`);
  }
  const tePrompt = coachQuestionPrompt({
    setup: { ...BASE_SETUP, roleProfile: "telugu_transcription" },
    ctx: null,
    speed: "fast",
    askedQuestions: [],
    language: "te",
  });
  assert.ok(tePrompt.includes("Telugu"));
});

test("general-profile question prompts carry no transcription topic bank", () => {
  const prompt = coachQuestionPrompt({
    setup: BASE_SETUP,
    ctx: null,
    speed: "fast",
    askedQuestions: [],
    language: "en",
  });
  assert.ok(!prompt.includes("quality assurance, accuracy, and consistency"));
});

// ---------------------------------------------------------------------------
// Raw job-posting parsing
// ---------------------------------------------------------------------------

const PARSED_RAW = `### Job Title
Audio Transcription & Alignment Specialist (AI Training)

### Company
Alignerr

### Job Description
Clean up word-level transcripts inside a proprietary editor, aligning timing to spoken audio.

### Responsibilities
- Review and correct word-level transcripts
- Align word and segment timing boundaries
- Resolve edge cases like overlapping speech

### Required Skills
- Native or near-native English fluency
- Exceptional attention to detail

### Preferred Skills
- Closed captioning background
- Praat, ELAN, or Subtitle Edit

### Experience Level
Entry-level

### Interview Type
behavioral`;

test("parseJobPosting maps every section into wizard fields", () => {
  const p = parseJobPosting(PARSED_RAW);
  assert.match(p.jobTitle, /Audio Transcription & Alignment Specialist/);
  assert.equal(p.company, "Alignerr");
  assert.equal(p.responsibilities.split("\n").length, 3);
  assert.equal(p.requiredSkills.split("\n").length, 2);
  assert.equal(p.experienceLevel, "Entry-level");
  assert.equal(p.interviewType, "behavioral");
});

test("parseJobPosting rejects unknown interview types and survives empty input", () => {
  const p = parseJobPosting(PARSED_RAW.replace("behavioral", "dancing"));
  assert.equal(p.interviewType, "");
  const empty = parseJobPosting("");
  assert.equal(empty.jobTitle, "");
  assert.equal(empty.interviewType, "");
  assert.equal(empty.responsibilities, "");
});

test("jobPostingParsePrompt embeds the raw posting and forbids invention", () => {
  const prompt = jobPostingParsePrompt(ALIGNERR_DUMP);
  assert.ok(prompt.includes("Alignerr"));
  assert.ok(prompt.includes("never invent"));
  // Budget: a very long posting is clipped to keep the parse fast.
  const long = "x".repeat(20000);
  const clippedPrompt = jobPostingParsePrompt(long);
  assert.ok(clippedPrompt.length < 12000);
});

// ---------------------------------------------------------------------------
// Language-aware output budgets
// ---------------------------------------------------------------------------

test("coachMaxTokens scales up for Telugu/Hindi/mixed output", () => {
  const en = coachMaxTokens("fast", "medium");
  assert.equal(coachMaxTokens("fast", "medium", "en"), en);
  assert.ok(coachMaxTokens("fast", "medium", "te") > en);
  assert.ok(coachMaxTokens("fast", "medium", "hi") > en);
  assert.ok(coachMaxTokens("fast", "medium", "te-en") > coachMaxTokens("fast", "medium", "te"));
  assert.ok(coachMaxTokens("quality", "detailed", "te-en") >= 2000);
});

test("feedback prompt carries the language rule next to the parsing contract", () => {
  const prompt = coachFeedbackPrompt({
    question: "మీ అనుభవం గురించి చెప్పండి",
    answer: "నేను మూడు సంవత్సరాలు పనిచేశాను",
    speed: "fast",
    length: "medium",
    ctx: null,
    sessionMemory: [],
    setup: BASE_SETUP,
    hasResume: true,
    language: "te",
  });
  assert.match(prompt, /Write all section content in Telugu/);
  // Headers must stay English — the parser keys off them.
  assert.ok(prompt.includes("### Suggested Answer"));
  assert.ok(prompt.includes("### Resume Evidence"));
});
