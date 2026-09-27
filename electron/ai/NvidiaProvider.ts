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
import { sseEvents } from "./sse";
import { withRetry, withFallback, withStreamFallback } from "./retry";
import { NVIDIA_BASE_URL, NVIDIA_MODELS, makeThinkFilter, stripThinking } from "./nvidiaWire";

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
  private async requestOk(model: string, prompt: string, stream: boolean): Promise<Response> {
    const timeoutMs = stream ? STREAM_TIMEOUT_MS : OPEN_TIMEOUT_MS;
    return withRetry(async () => {
      let res: Response;
      try {
        res = await fetch(`${NVIDIA_BASE_URL}/chat/completions`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
          body: JSON.stringify({ model, messages: [{ role: "user", content: prompt }], stream }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        if (err instanceof Error && err.name === "TimeoutError") {
          throw new Error(`NVIDIA error: request timed out after ${timeoutMs / 1000}s`);
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

  private streamChat(prompt: string): AsyncIterable<string> {
    return withStreamFallback(this.models.map((model) => () => this.streamWithModel(model, prompt)));
  }

  private async *streamWithModel(model: string, prompt: string): AsyncIterable<string> {
    const res = await this.requestOk(model, prompt, true);
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
