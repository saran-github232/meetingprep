// Pure, import-free logic for the Interview Coach feature — setup validation, prompts,
// response parsers, speed-graded context trimming, session memory, and provider ordering.
// Kept import-free (like nvidiaWire.ts) so the test suite can exercise every rule without
// Electron, the database, or network access.

// Interview Coach trades depth for latency (FAST) or the reverse — providers map these to
// their own model chains; no model names live in this file or any feature code.
export type CoachSpeed = "fast" | "balanced" | "quality";
// How long the coach's suggested answers should be spoken.
export type CoachResponseLength = "short" | "medium" | "detailed";
// Interview configuration from the setup wizard. "mixed" lets the model blend types.
export type CoachInterviewType =
  | "technical"
  | "behavioral"
  | "hr"
  | "coding"
  | "system_design"
  | "project"
  | "mixed";

// Language the user prefers for the session. "auto" means questions default to English
// (or follow the job description) and feedback mirrors the question/answer language.
export type CoachLangPref = "auto" | "en" | "te" | "hi";
// Effective language, including the mixed Telugu-English mode that mirrors how the
// language is actually spoken (English loanwords inside Telugu sentences).
export type CoachLang = "en" | "te" | "hi" | "te-en";

// Specialized interview profiles. The Telugu transcription/alignment profile steers
// question generation toward the language-data domain (transcription QA, alignment,
// annotation, code-switching, …) using the supplied JD and resume for specificity.
export type CoachRoleProfile = "general" | "telugu_transcription";

// Session format: rehearsing for a human-led interview (panel, video call) or for an
// AI-interviewer platform (recorded assessments, virtual interview agents, timed rounds).
// Both are practice formats — the difference is the rehearsal experience, not the tooling.
export type CoachInterviewFormat = "human" | "virtual_ai";

export const COACH_FORMATS: { id: CoachInterviewFormat; label: string; note: string }[] = [
  {
    id: "human",
    label: "Human Interview",
    note: "Rehearse for a person-led interview — panels, video calls, on-sites.",
  },
  {
    id: "virtual_ai",
    label: "Virtual AI Interview",
    note: "Rehearse for AI-interviewer platforms — timed responses, question-by-question, repeatable runs.",
  },
];

// Default per-question time budget for virtual-AI rehearsals (HireVue-style platforms
// typically give 1.5–3 minutes per recorded answer).
export const VIRTUAL_AI_TIME_LIMITS = [60, 120, 180, 300];

export function formatCoachDuration(startedAt: string, endedAt: string | null): string {
  const start = new Date(startedAt.replace(" ", "T")).getTime();
  const end = endedAt ? new Date(endedAt.replace(" ", "T")).getTime() : Date.now();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return "—";
  const minutes = Math.max(1, Math.round((end - start) / 60000));
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

// ---------------------------------------------------------------------------
// Test Mode fixtures — canned, deterministic AI responses so sessions can be run
// end-to-end repeatedly (QA/development) without consuming provider quota. The
// feedback fixture uses the exact section format the parsers expect.
// ---------------------------------------------------------------------------

export function isCoachTestModeEnabled(value: string | undefined): boolean {
  return value === "1";
}

const TEST_QUESTIONS = [
  "Walk me through your experience with the core tools this role requires.",
  "Tell me about a time you had to meet a tight deadline with high accuracy requirements.",
  "Describe a project you're most proud of and your specific contribution.",
  "How do you handle ambiguous instructions or incomplete specifications?",
  "Where do you see the biggest gaps in your background for this role, and how are you closing them?",
];

export function coachTestQuestion(index: number): string {
  return TEST_QUESTIONS[index % TEST_QUESTIONS.length];
}

export function coachTestAnalysis(): InterviewCoachContext {
  return {
    candidateProfile:
      "A detail-oriented candidate applying for this role with directly relevant project experience and a track record of careful, deadline-driven work.",
    relevantExperience: "- Most recent role: owned end-to-end delivery of a quality-critical project\n- Recognized for accuracy under tight deadlines",
    strengths: [
      "Directly relevant project experience",
      "Strong written and verbal communication",
      "Consistent accuracy under deadlines",
    ],
    weakAreas: ["Limited exposure to the platform's specific internal tooling", "No formal certification in the domain"],
    matchedSkills: ["Core tools listed in the job description", "Attention to detail", "Independent work style"],
    missingSkills: ["Domain certification", "Team-lead experience"],
    likelyTopics: ["Role-specific tooling", "Accuracy and quality standards", "Deadline management"],
    likelyTechnical: ["How would you quality-check your own work before submitting it?"],
    likelyBehavioral: ["Tell me about a time you caught an error everyone else missed."],
    likelyProjectQuestions: ["Walk me through the project you're most proud of."],
    likelyResumeQuestions: ["What did you learn from your most recent role transition?"],
  };
}

export function coachTestFeedback(): string {
  return `### Suggested Answer
In my most recent role I owned a quality-critical deliverable end to end: I built a checklist from the style guide, verified my work against it before every submission, and flagged anything ambiguous to the reviewer early instead of guessing. That process kept my error rate low even on tight deadlines.

### Why This Works
It names a concrete process, ties it to the job's accuracy requirements, and shows judgment about when to escalate.

### Key Points
- Name the specific process you follow
- Tie it to the role's accuracy requirements
- Mention when you escalate rather than guess

### Missing Points
- A quantified result (error rate, turnaround time) would strengthen it

### Resume Evidence
- Owned end-to-end delivery of a quality-critical project

### Job Match
Directly matches the posting's emphasis on accuracy, consistency, and reliable turnaround.

### Follow-up Questions
- How would you handle two conflicting style-guide rules in the same task?`;
}
// Which provider Interview Coach prefers — "auto" keeps the app-wide fallback chain.
export type CoachProviderPreference = "auto" | "gemini" | "nvidia";
// Drives the point-cloud visualization (CoachOrb) and the state label under it.
export type CoachVisualState = "idle" | "listening" | "transcribing" | "analyzing" | "generating" | "ready";

export interface CoachSetup {
  jobTitle: string;
  company: string;
  jobDescription: string;
  requiredSkills: string;
  preferredSkills: string;
  experienceLevel: string;
  responsibilities: string;
  techStack: string;
  interviewType: CoachInterviewType;
  notes: string;
  preferredLanguage?: CoachLangPref;
  roleProfile?: CoachRoleProfile;
  interviewFormat?: CoachInterviewFormat;
}

// The one-time resume/JD analysis. Everything in it must be grounded in the supplied
// material — the prompt forbids invention, and the UI only ever shows what was parsed.
export interface InterviewCoachContext {
  candidateProfile: string;
  relevantExperience: string;
  strengths: string[];
  weakAreas: string[];
  matchedSkills: string[];
  missingSkills: string[];
  likelyTopics: string[];
  likelyTechnical: string[];
  likelyBehavioral: string[];
  likelyProjectQuestions: string[];
  likelyResumeQuestions: string[];
}

export interface CoachFeedback {
  suggestedAnswer: string;
  whyItWorks: string;
  keyPoints: string[];
  missingPoints: string[];
  resumeEvidence: string[];
  jobMatch: string;
  followUpQuestions: string[];
}

// One compact recap line per answered question — the session memory the coach keeps so
// follow-up feedback references prior weak spots without resending full transcripts.
export interface CoachSessionMemoryItem {
  question: string;
  answerExcerpt: string;
  feedbackNote: string;
}

export const COACH_INTERVIEW_TYPES: { id: CoachInterviewType; label: string }[] = [
  { id: "mixed", label: "Mixed" },
  { id: "technical", label: "Technical" },
  { id: "behavioral", label: "Behavioral" },
  { id: "hr", label: "HR" },
  { id: "coding", label: "Coding" },
  { id: "system_design", label: "System / design" },
  { id: "project", label: "Project discussion" },
];

// Blocks the Continue button; missing resume is allowed (the coach then works generically)
// but a missing job description would make every analysis meaningless.
export function validateCoachSetup(setup: CoachSetup): string[] {
  const problems: string[] = [];
  if (!setup.jobDescription.trim()) {
    problems.push("Add the job description — the coach tailors everything to it.");
  }
  if (!setup.jobTitle.trim() && !setup.company.trim()) {
    problems.push("Add at least a job title or a company so questions have context.");
  }
  return problems;
}

export function setupWarnings(setup: CoachSetup, resumeText: string | null): string[] {
  const warnings: string[] = [];
  if (!resumeText?.trim()) {
    warnings.push(
      "No resume provided — suggested answers will be generic and Resume Evidence will stay empty."
    );
  }
  return warnings;
}

// ---------------------------------------------------------------------------
// Trimming — prompt-size budgets are the main latency lever in FAST mode.
// ---------------------------------------------------------------------------

export function clip(text: string, maxChars: number): string {
  const t = text.trim();
  return t.length <= maxChars ? t : `${t.slice(0, maxChars).trimEnd()} …`;
}

const RESUME_CHARS: Record<CoachSpeed, number> = { fast: 3500, balanced: 7000, quality: 12000 };
const JD_CHARS: Record<CoachSpeed, number> = { fast: 2500, balanced: 5000, quality: 9000 };
const ANSWER_CHARS: Record<CoachSpeed, number> = { fast: 2500, balanced: 4500, quality: 7000 };

function bullets(text: string | undefined, max: number): string[] {
  if (!text) return [];
  return text
    .split("\n")
    .map((line) => line.replace(/^[-*•]\s*/, "").replace(/^-$/, "").trim())
    .filter((line) => line && !/^none\.?$/i.test(line))
    .slice(0, max);
}

function bulletLine(label: string, items: string[], max: number): string {
  if (items.length === 0) return "";
  return `${label}: ${items.slice(0, max).join("; ")}`;
}

function firstSentence(text: string): string {
  const match = text.match(/^[^.!?]+[.!?]/);
  return (match?.[0] ?? text).trim();
}

// The full analysis is cached in the database; per-question prompts only ever carry the
// section relevant at the current speed — FAST sends a few hundred chars, never the resume.
export function compactContextForSpeed(
  ctx: InterviewCoachContext | null,
  speed: CoachSpeed
): string {
  if (!ctx) return "";
  if (speed === "quality") {
    return [
      ctx.candidateProfile && `Profile: ${ctx.candidateProfile}`,
      ctx.relevantExperience && `Relevant experience:\n${ctx.relevantExperience}`,
      bulletLine("Strengths", ctx.strengths, 8),
      bulletLine("Weak areas to prepare for", ctx.weakAreas, 6),
      bulletLine("Missing skills", ctx.missingSkills, 8),
      bulletLine("Likely topics", ctx.likelyTopics, 8),
    ]
      .filter(Boolean)
      .join("\n");
  }
  if (speed === "balanced") {
    return [
      ctx.candidateProfile && `Profile: ${clip(ctx.candidateProfile, 320)}`,
      bulletLine("Strengths", ctx.strengths, 5),
      bulletLine("Weak areas", ctx.weakAreas, 4),
      bulletLine("Missing skills", ctx.missingSkills, 5),
      bulletLine("Likely topics", ctx.likelyTopics, 5),
    ]
      .filter(Boolean)
      .join("\n");
  }
  return [
    ctx.candidateProfile && `Profile: ${firstSentence(ctx.candidateProfile)}`,
    bulletLine("Strengths", ctx.strengths, 3),
    bulletLine("Missing skills", ctx.missingSkills, 3),
    bulletLine("Likely topics", ctx.likelyTopics, 3),
  ]
    .filter(Boolean)
    .join("\n");
}

// Output-token ceilings per request — generation stops once sufficient content exists
// instead of streaming past it. Kept tight on purpose; the coach's sections are short.
// Telugu/Hindi (and mixed) scripts tokenize heavier than English, so non-English
// responses get a multiplier to avoid being cut off mid-sentence.
const LANG_TOKEN_MULTIPLIER: Record<CoachLang, number> = { en: 1, hi: 1.4, te: 1.4, "te-en": 1.5 };

export function coachMaxTokens(speed: CoachSpeed, length: CoachResponseLength, lang: CoachLang = "en"): number {
  const base = { fast: 480, balanced: 850, quality: 1400 }[speed];
  const bump = { short: -120, medium: 0, detailed: 320 }[length];
  return Math.max(256, Math.round((base + bump) * LANG_TOKEN_MULTIPLIER[lang]));
}

// ---------------------------------------------------------------------------
// Setup analysis (Phase 3) — one call per session, cached in the DB afterwards.
// ---------------------------------------------------------------------------

function jobInfoBlock(setup: CoachSetup): string {
  return [
    `Job title: ${setup.jobTitle || "(not given)"}`,
    `Company: ${setup.company || "(not given)"}`,
    `Experience level: ${setup.experienceLevel || "(not given)"}`,
    `Required skills: ${setup.requiredSkills || "(not given)"}`,
    `Preferred skills: ${setup.preferredSkills || "(not given)"}`,
    `Key responsibilities: ${setup.responsibilities || "(not given)"}`,
    `Tech stack: ${setup.techStack || "(not given)"}`,
    `Interview type: ${setup.interviewType}`,
    `Notes: ${setup.notes || "(none)"}`,
  ].join("\n");
}

export function coachAnalysisPrompt(setup: CoachSetup, resumeText: string | null): string {
  return `You are an expert interview coach preparing a candidate for an upcoming interview.
Analyze the candidate's resume against the job below. Ground EVERY point in the supplied
material — never invent experience, employers, projects, skills, metrics, or achievements the
resume does not mention. If the resume is thin in an area the job needs, list that under
Weak Areas or Missing Skills instead of inventing it.

Candidate resume:
"""${clip(resumeText ?? "", RESUME_CHARS.quality)}"""

Job information:
${jobInfoBlock(setup)}

Job description:
"""${clip(setup.jobDescription, JD_CHARS.quality)}"""

Respond in this exact format with these exact section headers:
### Candidate Profile
<2-3 sentences describing who the candidate is professionally, strictly from the resume>
### Relevant Experience
- <the resume experience most relevant to this job>
### Strengths
- <a strength grounded in the resume and matched to this job's requirements>
### Weak Areas
- <an area the job will probe that the resume doesn't clearly back up>
### Matched Skills
- <a required/preferred skill the resume genuinely demonstrates>
### Missing Skills
- <a required/preferred skill with no clear evidence in the resume>
### Likely Topics
- <a topic this interview will probably cover>
### Likely Technical Questions
- <a probable technical question for THIS candidate and job>
### Likely Behavioral Questions
- <a probable behavioral question>
### Likely Project Questions
- <a probable question about one of the candidate's actual projects>
### Likely Resume Questions
- <a probable question about something specific on this resume (a claim to defend, a gap, a transition)>`;
}

function splitSections(raw: string): Record<string, string> {
  const sections: Record<string, string> = {};
  const parts = raw.split(/^### +(.+?) *$/m);
  for (let i = 1; i < parts.length; i += 2) {
    sections[parts[i].trim().toLowerCase()] = (parts[i + 1] ?? "").trim();
  }
  return sections;
}

export function parseInterviewCoachContext(raw: string): InterviewCoachContext {
  const s = splitSections(raw);
  return {
    candidateProfile: s["candidate profile"] ?? "",
    relevantExperience: s["relevant experience"] ?? "",
    strengths: bullets(s["strengths"], 10),
    weakAreas: bullets(s["weak areas"], 10),
    matchedSkills: bullets(s["matched skills"], 12),
    missingSkills: bullets(s["missing skills"], 12),
    likelyTopics: bullets(s["likely topics"], 12),
    likelyTechnical: bullets(s["likely technical questions"], 10),
    likelyBehavioral: bullets(s["likely behavioral questions"], 10),
    likelyProjectQuestions: bullets(s["likely project questions"], 10),
    likelyResumeQuestions: bullets(s["likely resume questions"], 10),
  };
}

export function isUsefulAnalysis(ctx: InterviewCoachContext): boolean {
  return (
    ctx.candidateProfile.trim().length > 20 ||
    ctx.strengths.length > 0 ||
    ctx.likelyTopics.length > 0
  );
}

// ---------------------------------------------------------------------------
// Practice questions (Phase 5).
// ---------------------------------------------------------------------------

export function coachQuestionPrompt(input: {
  setup: CoachSetup;
  ctx: InterviewCoachContext | null;
  speed: CoachSpeed;
  askedQuestions: string[];
  language: CoachLang;
}): string {
  const focus =
    input.setup.interviewType === "mixed"
      ? "Blend technical, behavioral, and role-specific angles."
      : `Stay within the "${input.setup.interviewType}" interview type.`;
  return `You are conducting a disclosed PRACTICE interview — the candidate is rehearsing alone with a coaching app and has asked for the next question.
${focus}
${roleProfileLine(input.setup.roleProfile ?? "general")}
${compactContextForSpeed(input.ctx, input.speed)}
${input.setup.notes.trim() ? `Extra notes from the candidate: ${clip(input.setup.notes, 300)}\n` : ""}Write the question in ${languageName(input.language)}; make it sound like a question a real interviewer for this job would ask out loud.
Ask exactly ONE realistic interview question tailored to the candidate's background and this job. Do not repeat or trivially rephrase any of these already-asked questions:
${input.askedQuestions.slice(-12).map((q) => `- ${clip(q, 160)}`).join("\n") || "(none yet)"}

Respond with ONLY the question text on a single line — no numbering, no labels, no commentary.`;
}

export function parseCoachQuestion(raw: string): string {
  const line = raw
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l && !l.startsWith("#") && !l.startsWith("*"));
  return (line ?? "")
    .replace(/^\d+[.)]\s*/, "")
    .replace(/^[-*]\s*/, "")
    .replace(/^["']+|["']+$/g, "")
    .trim()
    .slice(0, 500);
}

// ---------------------------------------------------------------------------
// Answer feedback (Phases 5, 10, 11) — streamed into fixed sections.
// ---------------------------------------------------------------------------

const LENGTH_LINE: Record<CoachResponseLength, string> = {
  short: "Keep the Suggested Answer under 120 spoken words.",
  medium: "Keep the Suggested Answer around 200 spoken words.",
  detailed: "Write a thorough Suggested Answer (300-450 spoken words).",
};

const SPEED_LINE: Record<CoachSpeed, string> = {
  fast: "Be direct and compact; no preamble, no restating the question.",
  balanced: "Be clear and well-structured.",
  quality: "Be thorough and specific.",
};

export function buildSessionMemory(items: CoachSessionMemoryItem[], maxPairs = 6): string {
  const recent = items.slice(-maxPairs);
  if (recent.length === 0) return "";
  return `Session so far (oldest first) — build on this, don't repeat it:
${recent
  .map(
    (i) =>
      `Q: ${clip(i.question, 140)}\nA: ${clip(i.answerExcerpt, 200)}${
        i.feedbackNote ? `\nCoach note: ${clip(i.feedbackNote, 140)}` : ""
      }`
  )
  .join("\n")}`;
}

export function coachFeedbackPrompt(input: {
  question: string;
  answer: string;
  speed: CoachSpeed;
  length: CoachResponseLength;
  ctx: InterviewCoachContext | null;
  sessionMemory: CoachSessionMemoryItem[];
  setup: CoachSetup;
  hasResume: boolean;
  language: CoachLang;
}): string {
  const role = [input.setup.jobTitle, input.setup.company].filter(Boolean).join(" at ");
  const memory = buildSessionMemory(input.sessionMemory);
  return `You are the candidate's interview coach. This is a DISCLOSED practice session — the candidate is rehearsing alone in a coaching app and has just answered a practice question. Evaluate their answer and coach an improved version.
Ground every suggestion ONLY in the candidate's real background below — never invent experience, employers, projects, or achievements. ${input.hasResume ? "" : "No resume was provided: keep suggestions generic and leave Resume Evidence as 'none'."}
${languageInstruction(input.language)} The "### " section headers below stay exactly as written (the app parses them); only the content follows the language rule.

Context:
${role ? `Target role: ${role}${input.setup.experienceLevel ? ` (${input.setup.experienceLevel})` : ""}` : "Target role: (not specified)"}
${compactContextForSpeed(input.ctx, input.speed) || "No prior resume analysis available."}
${memory ? `\n${memory}` : ""}

Practice question: """${clip(input.question, 600)}"""
Candidate's answer: """${clip(input.answer, ANSWER_CHARS[input.speed])}"""

${LENGTH_LINE[input.length]} ${SPEED_LINE[input.speed]}
Respond in this exact format with these exact section headers:
### Suggested Answer
<the improved answer, first person, grounded in the candidate's real background>
### Why This Works
<1-2 sentences on why this version lands with an interviewer>
### Key Points
- <a point the candidate must make sure to hit>
### Missing Points
- <a relevant point their answer left out> (if none, write exactly: none)
### Resume Evidence
- <a concrete detail FROM THE RESUME that supports the suggested answer> (if no resume applies, write exactly: none)
### Job Match
<one line connecting this answer to what the job actually requires>
### Follow-up Questions
- <the question an interviewer would ask next>`;
}

export function parseCoachFeedback(raw: string): CoachFeedback {
  const s = splitSections(raw);
  return {
    suggestedAnswer: s["suggested answer"] ?? "",
    whyItWorks: s["why this works"] ?? "",
    keyPoints: bullets(s["key points"], 8),
    missingPoints: bullets(s["missing points"], 8),
    resumeEvidence: bullets(s["resume evidence"], 6),
    jobMatch: s["job match"] ?? "",
    followUpQuestions: bullets(s["follow-up questions"], 6),
  };
}

// Progressive rendering while the feedback streams: parses whatever complete "### Section"
// blocks have arrived so far, so sections appear as they stream rather than after.
export function parsePartialCoachFeedback(raw: string): CoachFeedback {
  const complete = raw.split(/^### +/m);
  // The last block may be mid-stream — keep its header only if we've seen its body start.
  const sections = complete.slice(1).map((block) => {
    const nl = block.indexOf("\n");
    return nl === -1 ? { name: block.trim(), body: "" } : { name: block.slice(0, nl).trim(), body: block.slice(nl + 1) };
  });
  let text = "";
  for (const section of sections) {
    text += `### ${section.name}\n${section.body}`;
  }
  return parseCoachFeedback(text);
}

// ---------------------------------------------------------------------------
// Transcript handling (Phase 6) — finalized dictation segments only.
// ---------------------------------------------------------------------------

// Appends one finalized speech segment to the draft answer. Chromium can re-emit the same
// final result after a recognizer restart — drop exact duplicates instead of doubling text.
export function appendTranscriptSegment(existing: string, segment: string): string {
  const seg = segment.trim();
  if (!seg) return existing;
  const current = existing.trimEnd();
  if (current.endsWith(seg)) return existing;
  return current ? `${current} ${seg}` : seg;
}

// ---------------------------------------------------------------------------
// Provider selection (Phase 2.5 / 13) — preference reorders, never restricts: if the
// preferred provider has no key, the normal app-wide fallback chain still applies.
// ---------------------------------------------------------------------------

export function orderNamesForCoach<T extends string>(
  order: T[],
  prefer: CoachProviderPreference
): T[] {
  if (prefer === "auto") return order;
  const idx = order.indexOf(prefer as T);
  if (idx === -1) return order;
  return [prefer as T, ...order.slice(0, idx), ...order.slice(idx + 1)];
}

export const COACH_STATE_LABEL: Record<CoachVisualState, string> = {
  idle: "Ready when you are",
  listening: "Listening",
  transcribing: "Transcribing",
  analyzing: "Analyzing",
  generating: "Generating",
  ready: "Ready",
};

// ---------------------------------------------------------------------------
// Multilingual support (detection + prompt language rules)
// ---------------------------------------------------------------------------

// Script-range counting, not translation: Telugu (U+0C00–U+0C7F) and Devanagari
// (U+0900–U+097F) blocks identify the language; a couple of Latin words alongside
// Telugu is the normal code-switched pattern, not English.
export function detectQuestionLanguage(text: string): CoachLang {
  const te = (text.match(/[\u0C00-\u0C7F]/g) ?? []).length;
  const hi = (text.match(/[\u0900-\u097F]/g) ?? []).length;
  const latinWords = (text.match(/[A-Za-z]{2,}/g) ?? []).length;
  if (te === 0 && hi === 0) return "en";
  if (te === 0) return "hi";
  return latinWords >= 2 ? "te-en" : "te";
}

export function languageName(lang: CoachLang): string {
  return { en: "English", te: "Telugu", hi: "Hindi", "te-en": "natural mixed Telugu-English" }[lang];
}

// The single prompt rule that governs response language. Section headers stay in
// English on purpose — the app's parsers key off them — but all content follows the
// question's language, and Telugu output must read as actually-spoken language.
export function languageInstruction(lang: CoachLang): string {
  if (lang === "en") return "Write all section content in English.";
  if (lang === "te") {
    return `Write all section content in Telugu (తెలుగు). Use natural, conversational Telugu exactly as it is actually spoken — English technical terms appear naturally where a real speaker would use them. Never produce a stilted word-for-word translation.`;
  }
  if (lang === "hi") {
    return `Write all section content in Hindi (हिन्दी). Use natural, conversational Hindi — English technical terms appear naturally where a real speaker would use them. Never produce a stilted word-for-word translation.`;
  }
  return `Write all section content in natural mixed Telugu-English (Tenglish) — the code-switched style Telugu speakers actually use: Telugu sentence structure with English technical terms and phrases left in English where a real speaker would switch. Never force everything into one script or translate loanwords awkwardly.`;
}

// ---------------------------------------------------------------------------
// Role profiles — the Telugu transcription/alignment specialization
// ---------------------------------------------------------------------------

export const ROLE_PROFILE_LABELS: Record<CoachRoleProfile, string> = {
  general: "General",
  telugu_transcription: "Telugu transcription & alignment",
};

// Keyword scoring against the job description; the profile only changes which questions
// get asked, never the privacy model or the coaching flow.
const TELUGU_PROFILE_KEYWORDS = [
  "telugu",
  "transcription",
  "transcribing",
  "alignment",
  "closed captioning",
  "captions",
  "subtitles",
  "subtitle edit",
  "praat",
  "elan",
  "court reporting",
  "speech-to-text",
  "speech to text",
  "audio labeling",
  "data annotation",
  "annotation",
  "word-level",
  "verbatim",
  "phonetics",
  "linguistics",
  "waveform",
];

export function detectRoleProfile(jobDescription: string): CoachRoleProfile {
  const jd = jobDescription.toLowerCase();
  let score = 0;
  for (const kw of TELUGU_PROFILE_KEYWORDS) {
    if (jd.includes(kw)) score += kw === "telugu" ? 3 : 1;
  }
  return score >= 3 ? "telugu_transcription" : "general";
}

// The topic bank for the Telugu transcription/alignment profile — every topic the
// user listed, phrased as question areas. The prompt still grounds each question in
// the actual JD and resume; this bank only steers the domain.
const TELUGU_TOPIC_BANK = [
  "Telugu language, grammar, and vocabulary",
  "Telugu pronunciation, transliteration, and script details",
  "transcribing Telugu audio accurately",
  "verbatim transcription rules (filler words, false starts, repetitions)",
  "punctuation, capitalization, and speaker labeling conventions",
  "timestamps and audio segmentation at word/segment level",
  "handling unclear, mumbled, or overlapping audio",
  "accents, dialects, and speech nuances",
  "Telugu-English code-switching in transcripts",
  "speech-to-text systems and how alignment data improves them",
  "annotation and data-labeling workflows and tools",
  "transcription quality assurance, accuracy, and consistency",
  "confidentiality when handling recorded audio",
  "AI/speech tools and specialized labeling editors",
];

function roleProfileLine(profile: CoachRoleProfile): string {
  if (profile !== "telugu_transcription") return "";
  return `This is a LANGUAGE-DATA role (Telugu transcription/alignment). Focus each question on ONE of these areas, varying across questions: ${TELUGU_TOPIC_BANK.join("; ")}.`;
}

// ---------------------------------------------------------------------------
// Raw job-posting parsing ("dump the whole posting, the coach divides it")
// ---------------------------------------------------------------------------

export function jobPostingParsePrompt(rawPosting: string): string {
  return `You are parsing a raw job posting into structured fields for an interview-prep app. Extract ONLY what the posting actually says — never invent employers, skills, or requirements. If a field is not present in the text, leave it empty.

Raw job posting:
"""${clip(rawPosting, 9000)}"""

Respond in this exact format with these exact section headers:
### Job Title
<the job title, e.g. "Audio Transcription & Alignment Specialist">
### Company
<the company or organization name>
### Job Description
<the core "about the role" description, condensed to its most important 5-10 sentences>
### Responsibilities
- <one responsibility per line, condensed from the posting>
### Required Skills
- <one required skill/qualification per line>
### Preferred Skills
- <one nice-to-have per line>
### Experience Level
<one of: Entry-level, Mid-level, Senior, Lead/Staff — best match for the posting, or empty>
### Interview Type
<one of: technical, behavioral, hr, coding, system_design, project, mixed — best fit for this role>`;
}

export interface ParsedJobPosting {
  jobTitle: string;
  company: string;
  jobDescription: string;
  responsibilities: string;
  requiredSkills: string;
  preferredSkills: string;
  experienceLevel: string;
  interviewType: CoachInterviewType | "";
}

const VALID_COACH_TYPES: CoachInterviewType[] = [
  "technical",
  "behavioral",
  "hr",
  "coding",
  "system_design",
  "project",
  "mixed",
];

export function parseJobPosting(raw: string): ParsedJobPosting {
  const s = splitSections(raw);
  const type = s["interview type"]?.trim().toLowerCase().replace(/[^a-z_]/g, "");
  return {
    jobTitle: s["job title"] ?? "",
    company: s["company"] ?? "",
    jobDescription: s["job description"] ?? "",
    responsibilities: bullets(s["responsibilities"], 12).join("\n"),
    requiredSkills: bullets(s["required skills"], 12).join("\n"),
    preferredSkills: bullets(s["preferred skills"], 12).join("\n"),
    experienceLevel: s["experience level"] ?? "",
    interviewType: (VALID_COACH_TYPES.find((t) => t === type) ?? "") as ParsedJobPosting["interviewType"],
  };
}
