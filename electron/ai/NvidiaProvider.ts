import type {
  AIProvider,
  AnswerDepth,
  InterviewRoleContext,
  MeetingNoteSummary,
  QuestionCategory,
  InterviewPrepItem,
  CoachSpeed,
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
import { sseEvents } from "./sse";
import { withRetry, withFallback, withStreamFallback } from "./retry";
import {
  NVIDIA_MODELS,
  chatRequest,
  makeThinkFilter,
  nvidiaCoachModels,
  stripThinking,
} from "./nvidiaWire";

const OPEN_TIMEOUT_MS = 120_000; // non-streaming whole-request cap
const STREAM_TIMEOUT_MS = 300_000; // streaming session cap

export class NvidiaProvider implements AIProvider {
  private apiKey: string;
  private models: string[];

  constructor(apiKey: string, modelOverride?: string) {
    if (!apiKey) throw new Error("Missing NVIDIA API key.");
    this.apiKey = apiKey;
    // NVIDIA_MODEL pins one model — used alone, so a typo'd name surfaces as an
    // error instead of being silently masked by the fallback chain.
    this.models = modelOverride ? [modelOverride] : NVIDIA_MODELS;
  }

  // Retries the request itself if NVIDIA responds with a transient 429/503 — fetch only
  // rejects on network failure, so a bad HTTP status has to be turned into a thrown error here.
  // The wire payload (including the nemotron "thinking": false flag, which keeps reasoning
  // tokens from burning time-to-first-token) comes from chatRequest in nvidiaWire.ts.
  private async requestOk(
    model: string,
    prompt: string,
    stream: boolean,
    maxTokens?: number
  ): Promise<Response> {
    return withRetry(async () => {
      const { url, init } = chatRequest(this.apiKey, model, prompt, stream, stream ? STREAM_TIMEOUT_MS : OPEN_TIMEOUT_MS, maxTokens);
      let res: Response;
      try {
        res = await fetch(url, init);
      } catch (err) {
        if (err instanceof Error && err.name === "TimeoutError") {
          throw new Error(`NVIDIA error: request timed out after ${STREAM_TIMEOUT_MS / 1000}s`);
        }
        throw err;
      }
      if (!res.ok) {
        const err = new Error(`NVIDIA error: ${res.status} ${await res.text()}`) as Error & { status: number };
        err.status = res.status;
        throw err;
      }
      return res;
    });
  }

  private extractText(json: unknown): string {
    const content = (json as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content;
    return stripThinking(content ?? "");
  }

  async classify(question: string): Promise<QuestionCategory> {
    const res = await withFallback(this.models.map((model) => () => this.requestOk(model, classifyPrompt(question), false)));
    const json = await res.json();
    const text = this.extractText(json)
      .toLowerCase()
      .replace(/[^a-z_]/g, "");
    return (CATEGORIES.find((c) => c === text) ?? "general") as QuestionCategory;
  }

  async summarizeMeetingNotes(transcript: string): Promise<MeetingNoteSummary> {
    const res = await withFallback(
      this.models.map((model) => () => this.requestOk(model, meetingNotesSummaryPrompt(transcript), false))
    );
    return parseMeetingSummary(this.extractText(await res.json()));
  }

  async generateInterviewPrep(
    jobDescription: string,
    jobTitle: string,
    resumeContext: string | null
  ): Promise<InterviewPrepItem[]> {
    const res = await withFallback(
      this.models.map((model) => () =>
        this.requestOk(model, interviewPrepPrompt(jobDescription, jobTitle, resumeContext), false)
      )
    );
    return parseInterviewPrep(this.extractText(await res.json()));
  }

  streamAnswer(
    question: string,
    category: QuestionCategory,
    depth: AnswerDepth,
    resumeContext: string | null
  ): AsyncIterable<string> {
    return this.streamChat(structuredAnswerPrompt(question, category, depth, resumeContext));
  }

  streamCodeAnswer(instruction: string, language: string, code: string | null): AsyncIterable<string> {
    return this.streamChat(codeAnswerPrompt(instruction, language, code));
  }

  async generateInterviewQuestions(
    categories: QuestionCategory[],
    depth: AnswerDepth,
    count: number,
    ctx: InterviewRoleContext
  ): Promise<string[]> {
    const res = await withFallback(
      this.models.map((model) => () => this.requestOk(model, interviewQuestionsPrompt(categories, depth, count, ctx), false))
    );
    return parseQuestionList(this.extractText(await res.json()), count);
  }

  streamInterviewFeedback(
    question: string,
    depth: AnswerDepth,
    userAnswer: string,
    ctx: InterviewRoleContext,
    resumeContext: string | null
  ): AsyncIterable<string> {
    return this.streamChat(interviewFeedbackPrompt(question, depth, userAnswer, ctx, resumeContext));
  }

  streamResumeTailoring(resumeText: string, jobDescription: string, jobTitle: string): AsyncIterable<string> {
    return this.streamChat(resumeTailoringPrompt(resumeText, jobDescription, jobTitle));
  }

  private coachModels(speed: CoachSpeed): string[] {
    // A pinned NVIDIA_MODEL applies to coach requests too — it replaces the chain.
    return this.models === NVIDIA_MODELS ? nvidiaCoachModels(speed) : this.models;
  }

  async completeCoach(prompt: string, speed: CoachSpeed, maxOutputTokens: number): Promise<string> {
    const res = await withFallback(
      this.coachModels(speed).map((model) => () => this.requestOk(model, prompt, false, maxOutputTokens))
    );
    return stripThinking(this.extractText(await res.json()));
  }

  streamCoach(prompt: string, speed: CoachSpeed, maxOutputTokens: number): AsyncIterable<string> {
    return withStreamFallback(
      this.coachModels(speed).map((model) => () => this.streamWithModel(model, prompt, maxOutputTokens))
    );
  }

  private streamChat(prompt: string, maxTokens?: number): AsyncIterable<string> {
    return withStreamFallback(this.models.map((model) => () => this.streamWithModel(model, prompt, maxTokens)));
  }

  private async *streamWithModel(model: string, prompt: string, maxTokens?: number): AsyncIterable<string> {
    const res = await this.requestOk(model, prompt, true, maxTokens);
    const filter = makeThinkFilter();
    for await (const data of sseEvents(res)) {
      if (data === "[DONE]") continue;
      const delta = JSON.parse(data).choices?.[0]?.delta;
      // reasoning_content (when a model streams its thinking as a separate field) is skipped;
      // inline <think> blocks inside content are filtered as they arrive.
      const text = delta?.content;
      if (typeof text === "string" && text) {
        const clean = filter.push(text);
        if (clean) yield clean;
      }
    }
    const rest = filter.flush();
    if (rest) yield rest;
  }
}
