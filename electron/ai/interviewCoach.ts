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
export function coachMaxTokens(speed: CoachSpeed, length: CoachResponseLength): number {
  const base = { fast: 480, balanced: 850, quality: 1400 }[speed];
  const bump = { short: -120, medium: 0, detailed: 320 }[length];
  return Math.max(256, base + bump);
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
}): string {
  const focus =
    input.setup.interviewType === "mixed"
      ? "Blend technical, behavioral, and role-specific angles."
      : `Stay within the "${input.setup.interviewType}" interview type.`;
  return `You are conducting a disclosed PRACTICE interview — the candidate is rehearsing alone with a coaching app and has asked for the next question.
${focus}
${compactContextForSpeed(input.ctx, input.speed)}
${input.setup.notes.trim() ? `Extra notes from the candidate: ${clip(input.setup.notes, 300)}\n` : ""}
Ask exactly ONE realistic interview question a real interviewer for this job would ask, tailored to the candidate's background. Do not repeat or trivially rephrase any of these already-asked questions:
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
}): string {
  const role = [input.setup.jobTitle, input.setup.company].filter(Boolean).join(" at ");
  const memory = buildSessionMemory(input.sessionMemory);
  return `You are the candidate's interview coach. This is a DISCLOSED practice session — the candidate is rehearsing alone in a coaching app and has just answered a practice question. Evaluate their answer and coach an improved version.
Ground every suggestion ONLY in the candidate's real background below — never invent experience, employers, projects, or achievements. ${input.hasResume ? "" : "No resume was provided: keep suggestions generic and leave Resume Evidence as 'none'."}

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
