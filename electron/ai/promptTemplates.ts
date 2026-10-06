import type { AnswerDepth, InterviewRoleContext, QuestionCategory, InterviewPrepItem } from "./AIProvider";

export const CATEGORIES: QuestionCategory[] = [
  "technical",
  "coding",
  "database",
  "data_science",
  "machine_learning",
  "ai",
  "general",
  "behavioral",
  "project",
  "client",
  "communication",
  "career",
  "presentation",
];

export function classifyPrompt(question: string): string {
  return `Classify the following question into exactly one of these categories: ${CATEGORIES.join(
    ", "
  )}.
Respond with only the category name, nothing else.

Question: """${question}"""`;
}

export function structuredAnswerPrompt(
  question: string,
  category: QuestionCategory,
  depth: AnswerDepth,
  resumeContext: string | null
): string {
  const structureNote =
    category === "behavioral"
      ? "Use a STAR-style structure (Situation, Task, Action, Result) inside the answer where appropriate."
      : category === "client"
        ? "Prioritize clarity, confidence, honesty, and business relevance."
        : "Prioritize accuracy and concision.";

  return `You are a professional meeting/interview preparation coach. Answer the question below for a "${category}" question at "${depth}" depth.
${structureNote}
Never fabricate experience, qualifications, projects, or achievements. ${
    resumeContext
      ? `Use the following user background only where directly relevant, and never invent details beyond it:\n"""${resumeContext}"""`
      : "No user background was provided — answer generically without inventing personal experience."
  }

Respond in this exact format with these exact section headers:
### Answer
<direct answer>
### Why
<short explanation>
### Example
<practical example>
### Key Points
- <point>
- <point>
### Follow-up
- <possible follow-up question>
- <possible follow-up question>

Question: """${question}"""`;
}

function roleContextLine({ role, skills, experience, jobDescription }: InterviewRoleContext): string {
  const base = `Candidate is interviewing for the role of "${role}"${
    experience ? ` at ${experience} experience level` : ""
  }${skills ? `, with relevant skills/tech stack: ${skills}` : ""}.`;
  return jobDescription
    ? `${base}\nHere is the actual job description — tailor questions to its specific responsibilities and requirements:\n"""${jobDescription}"""`
    : base;
}

export function interviewQuestionsPrompt(
  categories: QuestionCategory[],
  depth: AnswerDepth,
  count: number,
  ctx: InterviewRoleContext
): string {
  return `Generate exactly ${count} distinct interview questions at "${depth}" depth for a mock interview practice session, mixed as evenly as possible across these categories: ${categories.join(
    ", "
  )}.
${roleContextLine(ctx)}
For "technical" and "coding" category questions specifically: ask concrete, realistic problems tied to the stated role and tech stack (real scenarios, not generic trivia) — for "coding" questions, phrase them as an actual coding problem to solve (e.g. "Write a function that...", "Implement..."), not a conceptual question about code.
Vary the angle of each question — don't ask near-duplicates.

Respond with ONLY the questions, one per line, no numbering, no category labels, no extra commentary.`;
}

export function parseQuestionList(raw: string, count: number): string[] {
  return raw
    .split("\n")
    .map((line) => line.replace(/^[\d.\-*)]+\s*/, "").trim())
    .filter(Boolean)
    .slice(0, count);
}

export function interviewFeedbackPrompt(
  question: string,
  depth: AnswerDepth,
  userAnswer: string,
  ctx: InterviewRoleContext,
  resumeContext: string | null
): string {
  return `You are a professional interview coach evaluating a candidate's answer during a mock interview at "${depth}" depth.
${roleContextLine(ctx)}
If the question is a coding problem, evaluate the candidate's code for correctness, complexity, and edge cases, not just prose quality.
Never fabricate the candidate's experience. ${
    resumeContext
      ? `Candidate background, use only where directly relevant:\n"""${resumeContext}"""`
      : "No candidate background was provided."
  }

Question asked: """${question}"""
Candidate's answer: """${userAnswer}"""

Respond in this exact format with these exact section headers:
### Score
<a score out of 10 and a one-line justification>
### Strengths
- <specific strength in the candidate's actual answer>
### Improvements
- <specific, actionable improvement>
### Model Answer
<a strong example answer for comparison — include working code if the question was a coding problem>`;
}

export function resumeTailoringPrompt(resumeText: string, jobDescription: string, jobTitle: string): string {
  return `You are a professional resume writer and ATS (Applicant Tracking System) optimization expert.
Tailor the candidate's resume below to the target job${jobTitle ? ` ("${jobTitle}")` : ""}, using ONLY information already present in the original resume — never invent experience, employers, dates, skills, or achievements. You may rephrase, reorder, and re-emphasize existing content to match the job description, but do not fabricate anything new.

Original resume:
"""${resumeText}"""

Target job description:
"""${jobDescription}"""

Respond in this exact format with these exact section headers:
### Tailored Resume
<the rewritten resume, ready to use>
### Matched Keywords
- <a keyword or skill from the job description that the tailored resume now genuinely covers>
### Missing Keywords
- <a skill/keyword the job description asks for that isn't present in the resume — flag it for the candidate to genuinely add only if they actually have it>
### ATS Score
<0-100>/100 — honest estimate of how this resume scores against this job description
### Score Breakdown
- Keyword alignment: <0-30>/<30> — <one-line note>
- Relevant experience: <0-25>/<25> — <one-line note>
- Skills & tools: <0-20>/<20> — <one-line note>
- Measurable impact: <0-15>/<15> — <one-line note>
- Formatting & clarity: <0-10>/<10> — <one-line note>
### Suggestions
- <the single highest-impact change or emphasis that would improve the fit, written as concrete advice>
- <another concrete, high-impact suggestion>
### ATS Notes
<brief notes on keyword alignment and formatting for applicant tracking systems>`;
}

export function codeAnswerPrompt(instruction: string, language: string, code: string | null): string {
  return `You are a coding assistant. Language: ${language}.
${code ? `Existing code:\n\`\`\`${language}\n${code}\n\`\`\`\n` : ""}
Task: ${instruction}

Respond in this exact format:
### Solution
\`\`\`${language}
<code>
\`\`\`
### Explanation
<how it works>
### Complexity
Time: <time complexity>
Space: <space complexity>
### Edge Cases
- <edge case>
### Alternative Approach
<brief alternative>
### Common Mistakes
- <mistake>`;
}

export function meetingNotesSummaryPrompt(transcript: string): string {
  return `You are a meeting assistant. Turn the raw transcript below into clean, useful notes.
Do not invent decisions or commitments that were not stated. If the transcript is too short or
incoherent to summarize, say so plainly in the summary.

Respond in this exact format:
### Title
<short meeting title, max 6 words>
### Summary
<2-5 sentence recap of what was discussed and decided>
### Action Items
- <a concrete action item, with an owner if one was named>
(no action items? write exactly: none)

Transcript:
${transcript}`;
}

export function parseMeetingSummary(raw: string): { title: string; summary: string; actionItems: string[] } {
  // \\s / \\n are double-escaped on purpose: this regex is built through a template literal,
  // where a single \s would collapse to the letter "s" and silently break every match.
  const section = (name: string) => {
    const match = raw.match(new RegExp(`###?\\s*${name}\\s*\\n([\\s\\S]*?)(?=\\n###|$)`, "i"));
    return (match?.[1] ?? "").trim();
  };
  const actionsRaw = section("Action Items");
  const actionItems = actionsRaw && !/^none\.?$/i.test(actionsRaw)
    ? actionsRaw
        .split("\n")
        .map((line) => line.replace(/^[-*•]\s*/, "").trim())
        .filter(Boolean)
    : [];
  return {
    title: section("Title").replace(/^["']|["']$/g, "").slice(0, 80),
    summary: section("Summary"),
    actionItems,
  };
}


export function interviewPrepPrompt(
  jobDescription: string,
  jobTitle: string,
  resumeContext: string | null
): string {
  const role = jobTitle ? ` for the "${jobTitle}" role` : "";
  const resumeBlock = resumeContext
    ? `Candidate's resume:\n"""\n${resumeContext}\n"""\n\n`
    : "";
  return `You are an interview coach. Based on the job description below${role}${resumeContext ? " and the candidate's resume" : ""}, predict the interview questions this candidate is most likely to face, and for each one give a short suggested angle grounded in their actual background.

${resumeBlock}Job description:
"""${jobDescription}"""

Generate 8-10 questions covering technical depth, role-specific scenarios, and behavioral fit. Respond in this exact format:
### Questions
- <likely interview question> — <suggested answer angle, grounded in the candidate's real experience where possible>`;
}

export function parseInterviewPrep(raw: string): InterviewPrepItem[] {
  const match = raw.match(/###?\s*Questions?\s*\n([\s\S]*?)(?=\n###|$)/i);
  const section = (match?.[1] ?? raw).trim();
  return section
    .split("\n")
    .map((line) => line.replace(/^[-*•]\s*/, "").trim())
    .filter((line) => line.length > 3)
    .map((line) => {
      const dash = line.indexOf(" — ");
      const idx = dash !== -1 ? dash : line.indexOf(" - ");
      if (idx === -1) return { question: line, angle: "" };
      return { question: line.slice(0, idx).trim(), angle: line.slice(idx + 3).trim() };
    });
}

// ---------------------------------------------------------------------------
// Interview Practice workspace — pasted question + screenshots, multi-turn tutoring.
// ---------------------------------------------------------------------------

export interface PracticeTurn {
  role: "user" | "assistant";
  text: string;
}

// Conversation context: recent turns only, so follow-ups stay focused and prompts
// stay bounded no matter how long a session runs.
export function trimPracticeHistory(history: PracticeTurn[], maxTurns = 12): PracticeTurn[] {
  return history.slice(-maxTurns);
}

export function practiceSessionTitle(text: string, hasImages: boolean): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t) return t.slice(0, 60);
  return hasImages ? "Screenshot question" : "Practice question";
}

const PRACTICE_CODING_STRUCTURE = `### Understanding
<restate the problem in your own words — inputs, outputs, constraints>
### Approach
<the algorithm/strategy and why it fits>
### Solution
<working code in the language the question asks for, in a fenced code block with the language tag>
### Walkthrough
<trace the solution through one of the provided examples, step by step>
### Complexity
Time: <time complexity with one-line justification>
Space: <space complexity with one-line justification>
### Edge Cases
- <edge case and how the solution handles it>
### Common Mistakes
- <a mistake candidates typically make on this problem>
### Follow-ups
- <the variation an interviewer would ask next>`;

const PRACTICE_CONCEPT_STRUCTURE = `### Direct Answer
<the answer in 2-4 sentences>
### Explanation
<the simple explanation — the intuition before the jargon>
### Technical Details
<the precise mechanics, terms, and trade-offs>
### Example
<concrete example demonstrating the idea>
### Interview-Ready Answer
<how to say this out loud in an interview, first person>
### Follow-ups
- <the question an interviewer would ask next>`;

const clip = (str: string, maxLen: number): string =>
  str.length > maxLen ? str.slice(0, maxLen) + "..." : str;

export interface PracticeContextInfo {
  resumeText?: string;
  jobTitle?: string;
  company?: string;
  jobDescription?: string;
  requiredSkills?: string;
  techStack?: string;
  experienceLevel?: string;
  analysis?: {
    candidateProfile?: string;
    relevantExperience?: string;
    strengths?: string[];
    weakAreas?: string[];
    matchedSkills?: string[];
    missingSkills?: string[];
    likelyTopics?: string[];
    likelyTechnical?: string[];
    likelyBehavioral?: string[];
    likelyProjectQuestions?: string[];
    likelyResumeQuestions?: string[];
  } | null;
}

export function practiceTutorPrompt(
  history: PracticeTurn[],
  depth: AnswerDepth,
  context?: PracticeContextInfo
): string {
  const transcript = history
    .map((m) => `${m.role === "user" ? "Candidate" : "Tutor"}: ${clip(m.text, 4000)}`)
    .join("\n\n");

  const contextBlocks: string[] = [];
  if (context) {
    if (context.jobTitle || context.company || context.techStack || context.experienceLevel) {
      contextBlocks.push(
        `Target Role Context:
- Target Job Title: ${context.jobTitle || "(not specified)"}
- Company: ${context.company || "(not specified)"}
- Experience Level: ${context.experienceLevel || "(not specified)"}
- Required Skills & Tech Stack: ${[context.requiredSkills, context.techStack].filter(Boolean).join(", ") || "(not specified)"}`
      );
    }
    if (context.analysis) {
      const a = context.analysis;
      contextBlocks.push(
        `Candidate Analysis & Fit (ground all answers in this verified background):
- Candidate Profile: ${a.candidateProfile || ""}
- Demonstrated Strengths: ${a.strengths?.join("; ") || "None"}
- Relevant Experience & Projects: ${a.relevantExperience || ""}
- Matched Skills: ${a.matchedSkills?.join("; ") || "None"}
- Areas to Brush Up / Missing Skills: ${a.missingSkills?.join("; ") || "None"}`
      );
    }
    if (context.resumeText?.trim()) {
      contextBlocks.push(`Candidate Resume Background:\n"""${clip(context.resumeText, 2500)}"""`);
    }
    if (context.jobDescription?.trim()) {
      contextBlocks.push(`Job Description Context:\n"""${clip(context.jobDescription, 2000)}"""`);
    }
  }

  const contextSection = contextBlocks.length > 0
    ? `\n\nAccumulated Practice Session Context:\n${contextBlocks.join("\n\n")}\n`
    : "";

  return `You are an expert interview-prep tutor and coach. The candidate pastes interview or coding questions (text, problem descriptions, error messages, code, or screenshots) and wants to understand them deeply — accuracy, genuine understanding, and practical interview readiness matter most.${contextSection}
Rules:
- If screenshots are attached, inspect and read the question/code/diagrams from them first and treat that as part of the candidate's prompt.
- Context Grounding & Personalization: If Candidate Background, Resume, or Target Role Context is provided above, tailor the answer directly to the candidate's actual projects, background, and target role.
- Never invent experience, companies, degrees, certifications, metrics, or projects that are not present in the provided context. If the question asks "tell me about a project" or "describe your experience with X", use the candidate's real projects and technologies from the context.
- For interview-ready answers: write natural, first-person spoken responses that the candidate can deliver with confidence in an interview.
- If the question is incomplete or ambiguous, do NOT invent requirements or constraints. Solve what is given, then add a "### Missing Information" section listing what is assumed or missing.
- For coding/algorithm questions use this structure:
${PRACTICE_CODING_STRUCTURE}
- For conceptual/behavioral/interview questions use this structure:
${PRACTICE_CONCEPT_STRUCTURE}
- If the question states a preferred language, solve in that language; otherwise pick the most natural one and say why in one line.
- Later turns are follow-ups about the same problem — use the conversation above as context and keep earlier sections available by reference instead of repeating them.
- Keep the "### " section headers exactly as written; depth for this answer: "${depth}".

Conversation so far (most recent last):
${transcript || "(this is the first message)"}`;
}

// Ordered sections parsed from a tutor response, preserving code fences verbatim.
// Pure and shared: the renderer renders these progressively while streaming.
export interface PracticeSection {
  title: string;
  body: string;
}

export function parsePracticeSections(raw: string): PracticeSection[] {
  const parts = raw.split(/^### +(.+?) *$/m);
  const sections: PracticeSection[] = [];
  // Text before the first header is the model's preamble — show it as an untitled note
  // only when it carries real content.
  if (parts[0]?.trim()) sections.push({ title: "", body: parts[0].trim() });
  for (let i = 1; i < parts.length; i += 2) {
    sections.push({ title: parts[i].trim(), body: (parts[i + 1] ?? "").trim() });
  }
  return sections;
}
