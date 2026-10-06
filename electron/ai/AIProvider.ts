export type QuestionCategory =
  | "technical"
  | "coding"
  | "database"
  | "data_science"
  | "machine_learning"
  | "ai"
  | "general"
  | "behavioral"
  | "project"
  | "client"
  | "communication"
  | "career"
  | "presentation";

export type AnswerDepth =
  | "short"
  | "medium"
  | "detailed"
  | "interview-ready"
  | "client-ready"
  | "beginner-friendly"
  | "expert-level";

export interface StructuredAnswer {
  answer: string;
  why: string;
  example: string;
  keyPoints: string[];
  followUp: string[];
}

export interface InterviewFeedback {
  score: string;
  strengths: string[];
  improvements: string[];
  modelAnswer: string;
}

export interface InterviewRoleContext {
  role: string;
  skills: string;
  experience: string;
  jobDescription: string;
}

export interface ResumeTailoringResult {
  tailoredResume: string;
  missingKeywords: string[];
  atsNotes: string;
  atsScore: number | null;
  atsBreakdown: { label: string; score: number; max: number; note: string }[];
  matchedKeywords: string[];
  suggestions: string[];
}

export interface InterviewPrepItem {
  question: string;
  angle: string;
}

export interface CodeAnswer {
  code: string;
  language: string;
  explanation: string;
  timeComplexity: string;
  spaceComplexity: string;
  edgeCases: string[];
  alternativeApproach: string;
  commonMistakes: string[];
}

export interface MeetingNoteSummary {
  title: string;
  summary: string;
  actionItems: string[];
}

// Interview Coach speed grades — providers map these to their own model chains, so no
// model names leak into feature code. Canonical definition lives in interviewCoach.ts
// (kept import-free for the test suite); re-exported here for callers of the interface.
import type { CoachSpeed } from "./interviewCoach";
export type { CoachSpeed };

/**
 * Abstraction over an LLM backend — implemented by GeminiProvider, OpenAIProvider, and
 * AnthropicProvider so callers don't touch provider-specific code.
 */
export interface AIProvider {
  classify(question: string): Promise<QuestionCategory>;
  summarizeMeetingNotes(transcript: string): Promise<MeetingNoteSummary>;
  generateInterviewPrep(
    jobDescription: string,
    jobTitle: string,
    resumeContext: string | null
  ): Promise<InterviewPrepItem[]>;
  streamAnswer(
    question: string,
    category: QuestionCategory,
    depth: AnswerDepth,
    resumeContext: string | null
  ): AsyncIterable<string>;
  streamCodeAnswer(instruction: string, language: string, code: string | null): AsyncIterable<string>;
  generateInterviewQuestions(
    categories: QuestionCategory[],
    depth: AnswerDepth,
    count: number,
    ctx: InterviewRoleContext
  ): Promise<string[]>;
  streamInterviewFeedback(
    question: string,
    depth: AnswerDepth,
    userAnswer: string,
    ctx: InterviewRoleContext,
    resumeContext: string | null
  ): AsyncIterable<string>;
  streamResumeTailoring(resumeText: string, jobDescription: string, jobTitle: string): AsyncIterable<string>;
  // Interview Coach hooks — speed-graded so the coach can trade depth for latency without
  // the rest of the app changing behavior. maxOutputTokens caps generation (FAST keeps it
  // tight); providers apply it where the API supports it.
  completeCoach(prompt: string, speed: CoachSpeed, maxOutputTokens: number): Promise<string>;
  streamCoach(prompt: string, speed: CoachSpeed, maxOutputTokens: number): AsyncIterable<string>;
}
