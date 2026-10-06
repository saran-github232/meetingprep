import type {
  AIProvider,
  AnswerDepth,
  InterviewRoleContext,
  MeetingNoteSummary,
  QuestionCategory,
  InterviewPrepItem,
  CoachSpeed,
  PracticeImage,
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

// Ordered fastest/cheapest first; if one is unavailable, the next is tried automatically.
const MODELS = ["claude-sonnet-5", "claude-haiku-4-5-20251001", "claude-opus-5"];

export class AnthropicProvider implements AIProvider {
  constructor(private apiKey: string) {
    if (!apiKey) throw new Error("Missing Anthropic API key.");
  }

  private headers() {
    return {
      "Content-Type": "application/json",
      "x-api-key": this.apiKey,
      "anthropic-version": "2023-06-01",
    };
  }

  // Retries the request itself if Anthropic responds with a transient 429/503 — fetch only
  // rejects on network failure, so a bad HTTP status has to be turned into a thrown error here.
  private async requestMessages(
    model: string,
    messages: Array<{ role: string; content: unknown }>,
    stream: boolean,
    maxTokens = 4096
  ): Promise<Response> {
    return withRetry(async () => {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: this.headers(),
        body: JSON.stringify({ model, max_tokens: maxTokens, messages, stream }),
      });
      if (!res.ok) {
        const err = new Error(`Anthropic error: ${res.status} ${await res.text()}`) as Error & { status: number };
        err.status = res.status;
        throw err;
      }
      return res;
    });
  }

  private async requestOk(
    model: string,
    prompt: string,
    stream: boolean,
    maxTokens = 4096
  ): Promise<Response> {
    return this.requestMessages(model, [{ role: "user", content: prompt }], stream, maxTokens);
  }

  async classify(question: string): Promise<QuestionCategory> {
    const res = await withFallback(MODELS.map((model) => () => this.requestOk(model, classifyPrompt(question), false)));
    const json = await res.json();
    const text = (json.content?.[0]?.text ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z_]/g, "");
    return (CATEGORIES.find((c) => c === text) ?? "general") as QuestionCategory;
  }

  async summarizeMeetingNotes(transcript: string): Promise<MeetingNoteSummary> {
    const res = await withFallback(
      MODELS.map((model) => () => this.requestOk(model, meetingNotesSummaryPrompt(transcript), false))
    );
    const json = await res.json();
    return parseMeetingSummary(json.content?.[0]?.text ?? "");
  }

  async generateInterviewPrep(
    jobDescription: string,
    jobTitle: string,
    resumeContext: string | null
  ): Promise<InterviewPrepItem[]> {
    const res = await withFallback(
      MODELS.map((model) => () =>
        this.requestOk(model, interviewPrepPrompt(jobDescription, jobTitle, resumeContext), false)
      )
    );
    const json = await res.json();
    return parseInterviewPrep(json.content?.[0]?.text ?? "");
  }

  streamAnswer(
    question: string,
    category: QuestionCategory,
    depth: AnswerDepth,
    resumeContext: string | null
  ): AsyncIterable<string> {
    return this.streamMessage(structuredAnswerPrompt(question, category, depth, resumeContext));
  }

  streamCodeAnswer(instruction: string, language: string, code: string | null): AsyncIterable<string> {
    return this.streamMessage(codeAnswerPrompt(instruction, language, code));
  }

  async generateInterviewQuestions(
    categories: QuestionCategory[],
    depth: AnswerDepth,
    count: number,
    ctx: InterviewRoleContext
  ): Promise<string[]> {
    const res = await withFallback(
      MODELS.map((model) => () => this.requestOk(model, interviewQuestionsPrompt(categories, depth, count, ctx), false))
    );
    const json = await res.json();
    return parseQuestionList(json.content?.[0]?.text ?? "", count);
  }

  streamInterviewFeedback(
    question: string,
    depth: AnswerDepth,
    userAnswer: string,
    ctx: InterviewRoleContext,
    resumeContext: string | null
  ): AsyncIterable<string> {
    return this.streamMessage(interviewFeedbackPrompt(question, depth, userAnswer, ctx, resumeContext));
  }

  streamResumeTailoring(resumeText: string, jobDescription: string, jobTitle: string): AsyncIterable<string> {
    return this.streamMessage(resumeTailoringPrompt(resumeText, jobDescription, jobTitle));
  }

  private streamMessage(prompt: string, maxTokens?: number): AsyncIterable<string> {
    return this.streamWithMessages(
      MODELS.map((model) => ({ model, messages: [{ role: "user", content: prompt }] })),
      maxTokens
    );
  }

  // Practice turns: Anthropic vision blocks (base64 source) when screenshots are attached.
  streamPracticeTurn(prompt: string, images: PracticeImage[]): AsyncIterable<string> {
    const content: unknown[] = [{ type: "text", text: prompt }];
    for (const image of images) {
      content.push({ type: "image", source: { type: "base64", media_type: image.mimeType, data: image.data } });
    }
    return this.streamWithMessages(
      MODELS.map((model) => ({ model, messages: [{ role: "user", content }] })),
      undefined
    );
  }

  private streamWithMessages(
    attempts: Array<{ model: string; messages: Array<{ role: string; content: unknown }> }>,
    maxTokens?: number
  ): AsyncIterable<string> {
    return withStreamFallback(
      attempts.map(({ model, messages }) => () => this.streamWithMessagesOnce(model, messages, maxTokens))
    );
  }

  private async *streamWithMessagesOnce(
    model: string,
    messages: Array<{ role: string; content: unknown }>,
    maxTokens?: number
  ): AsyncIterable<string> {
    const res = await this.requestMessages(model, messages, true, maxTokens);
    for await (const data of sseEvents(res)) {
      const json = JSON.parse(data);
      if (json.type === "content_block_delta" && json.delta?.type === "text_delta") yield json.delta.text;
    }
  }

  // The coach's speed grades reuse the standard chain here; only max_tokens tightens.
  async completeCoach(prompt: string, _speed: CoachSpeed, maxOutputTokens: number): Promise<string> {
    const res = await withFallback(
      MODELS.map((model) => () => this.requestOk(model, prompt, false, Math.max(512, maxOutputTokens)))
    );
    const json = await res.json();
    return json.content?.[0]?.text ?? "";
  }

  streamCoach(prompt: string, _speed: CoachSpeed, maxOutputTokens: number): AsyncIterable<string> {
    return this.streamMessage(prompt, Math.max(512, maxOutputTokens));
  }
}
