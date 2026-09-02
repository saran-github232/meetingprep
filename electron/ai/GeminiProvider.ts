import { GoogleGenerativeAI } from "@google/generative-ai";
import type {
  AIProvider,
  AnswerDepth,
  InterviewRoleContext,
  MeetingNoteSummary,
  QuestionCategory,
  InterviewPrepItem,
} from "./AIProvider";
import {
  CATEGORIES,
  classifyPrompt,
  codeAnswerPrompt,
  interviewFeedbackPrompt,
  interviewPrepPrompt,
  interviewQuestionsPrompt,
  meetingNotesSummaryPrompt,
  parseInterviewPrep,
  parseMeetingSummary,
  parseQuestionList,
  resumeTailoringPrompt,
  structuredAnswerPrompt,
} from "./promptTemplates";
import { withRetry, withFallback, withStreamFallback } from "./retry";

// Concrete models only — no "-latest" aliases, which route through a separate, more congested
// capacity pool (source of recurring 503s). gemini-3.6-flash sits early because newer API keys
// reject the retired 2.5 line entirely; older keys keep 3.5-flash-lite as the cheap default.
const MODELS = ["gemini-3.5-flash-lite", "gemini-3.6-flash", "gemini-2.5-flash", "gemini-2.0-flash"];

export class GeminiProvider implements AIProvider {
  private client: GoogleGenerativeAI;

  constructor(apiKey: string) {
    if (!apiKey) throw new Error("Missing Gemini API key.");
    this.client = new GoogleGenerativeAI(apiKey);
  }

  private model(name: string, systemInstruction?: string) {
    return this.client.getGenerativeModel({ model: name, systemInstruction });
  }

  async classify(question: string): Promise<QuestionCategory> {
    const result = await withFallback(
      MODELS.map((name) => () => withRetry(() => this.model(name).generateContent(classifyPrompt(question))))
    );
    const text = result.response.text().trim().toLowerCase().replace(/[^a-z_]/g, "");
    return (CATEGORIES.find((c) => c === text) ?? "general") as QuestionCategory;
  }

  async summarizeMeetingNotes(transcript: string): Promise<MeetingNoteSummary> {
    const result = await withFallback(
      MODELS.map((name) => () => withRetry(() => this.model(name).generateContent(meetingNotesSummaryPrompt(transcript))))
    );
    return parseMeetingSummary(result.response.text());
  }

  async generateInterviewPrep(
    jobDescription: string,
    jobTitle: string,
    resumeContext: string | null
  ): Promise<InterviewPrepItem[]> {
    const result = await withFallback(
      MODELS.map((name) => () =>
        withRetry(() => this.model(name).generateContent(interviewPrepPrompt(jobDescription, jobTitle, resumeContext)))
      )
    );
    return parseInterviewPrep(result.response.text());
  }

  streamAnswer(
    question: string,
    category: QuestionCategory,
    depth: AnswerDepth,
    resumeContext: string | null
  ): AsyncIterable<string> {
    const prompt = structuredAnswerPrompt(question, category, depth, resumeContext);
    return withStreamFallback(MODELS.map((name) => () => this.streamWithModel(name, prompt)));
  }

  streamCodeAnswer(instruction: string, language: string, code: string | null): AsyncIterable<string> {
    const prompt = codeAnswerPrompt(instruction, language, code);
    return withStreamFallback(MODELS.map((name) => () => this.streamWithModel(name, prompt)));
  }

  async generateInterviewQuestions(
    categories: QuestionCategory[],
    depth: AnswerDepth,
    count: number,
    ctx: InterviewRoleContext
  ): Promise<string[]> {
    const result = await withFallback(
      MODELS.map(
        (name) => () =>
          withRetry(() => this.model(name).generateContent(interviewQuestionsPrompt(categories, depth, count, ctx)))
      )
    );
    return parseQuestionList(result.response.text(), count);
  }

  streamInterviewFeedback(
    question: string,
    depth: AnswerDepth,
    userAnswer: string,
    ctx: InterviewRoleContext,
    resumeContext: string | null
  ): AsyncIterable<string> {
    const prompt = interviewFeedbackPrompt(question, depth, userAnswer, ctx, resumeContext);
    return withStreamFallback(MODELS.map((name) => () => this.streamWithModel(name, prompt)));
  }

  streamResumeTailoring(resumeText: string, jobDescription: string, jobTitle: string): AsyncIterable<string> {
    const prompt = resumeTailoringPrompt(resumeText, jobDescription, jobTitle);
    return withStreamFallback(MODELS.map((name) => () => this.streamWithModel(name, prompt)));
  }

  private async *streamWithModel(name: string, prompt: string): AsyncIterable<string> {
    const result = await withRetry(() => this.model(name).generateContentStream(prompt));
    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) yield text;
    }
  }
}
