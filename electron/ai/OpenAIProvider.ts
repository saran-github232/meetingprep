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
const MODELS = ["gpt-4o-mini", "gpt-4.1-mini", "gpt-4o"];

export class OpenAIProvider implements AIProvider {
  constructor(private apiKey: string) {
    if (!apiKey) throw new Error("Missing OpenAI API key.");
  }

  // Retries the request itself if OpenAI responds with a transient 429/503 — fetch only
  // rejects on network failure, so a bad HTTP status has to be turned into a thrown error here.
  private async requestOk(
    model: string,
    prompt: string,
    stream: boolean,
    maxTokens?: number
  ): Promise<Response> {
    return this.requestMessages(model, [{ role: "user", content: prompt }], stream, maxTokens);
  }

  // Messages variant so practice turns can carry vision content parts (text + images).
  private async requestMessages(
    model: string,
    messages: Array<{ role: string; content: unknown }>,
    stream: boolean,
    maxTokens?: number
  ): Promise<Response> {
    return withRetry(async () => {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model,
          messages,
          stream,
          ...(maxTokens !== undefined ? { max_tokens: maxTokens } : {}),
        }),
      });
      if (!res.ok) {
        const err = new Error(`OpenAI error: ${res.status} ${await res.text()}`) as Error & { status: number };
        err.status = res.status;
        throw err;
      }
      return res;
    });
  }

  async classify(question: string): Promise<QuestionCategory> {
    const res = await withFallback(MODELS.map((model) => () => this.requestOk(model, classifyPrompt(question), false)));
    const json = await res.json();
    const text = (json.choices?.[0]?.message?.content ?? "")
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
    return parseMeetingSummary(json.choices?.[0]?.message?.content ?? "");
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
    return parseInterviewPrep(json.choices?.[0]?.message?.content ?? "");
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
      MODELS.map((model) => () => this.requestOk(model, interviewQuestionsPrompt(categories, depth, count, ctx), false))
    );
    const json = await res.json();
    return parseQuestionList(json.choices?.[0]?.message?.content ?? "", count);
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

  private streamChat(prompt: string, maxTokens?: number): AsyncIterable<string> {
    return withStreamFallback(MODELS.map((model) => () => this.streamWithModel(model, prompt, maxTokens)));
  }

  private async *streamWithModel(model: string, prompt: string, maxTokens?: number): AsyncIterable<string> {
    const res = await this.requestOk(model, prompt, true, maxTokens);
    for await (const data of sseEvents(res)) {
      if (data === "[DONE]") continue;
      const text = JSON.parse(data).choices?.[0]?.delta?.content;
      if (text) yield text;
    }
  }

  // The coach's speed grades reuse the standard chain here — gpt-4o-mini already leads
  // with the fast pick; only the output cap changes per speed.
  async completeCoach(prompt: string, _speed: CoachSpeed, maxOutputTokens: number): Promise<string> {
    const res = await withFallback(MODELS.map((model) => () => this.requestOk(model, prompt, false, maxOutputTokens)));
    const json = await res.json();
    return json.choices?.[0]?.message?.content ?? "";
  }

  streamCoach(prompt: string, _speed: CoachSpeed, maxOutputTokens: number): AsyncIterable<string> {
    return this.streamChat(prompt, maxOutputTokens);
  }

  private async *streamWithMessages(
    model: string,
    messages: Array<{ role: string; content: unknown }>
  ): AsyncIterable<string> {
    const res = await this.requestMessages(model, messages, true);
    for await (const data of sseEvents(res)) {
      if (data === "[DONE]") continue;
      const text = JSON.parse(data).choices?.[0]?.delta?.content;
      if (text) yield text;
    }
  }

  // Practice turns: vision content parts (data-URI images) when screenshots are attached.
  streamPracticeTurn(prompt: string, images: PracticeImage[]): AsyncIterable<string> {
    const content: unknown[] = [{ type: "text", text: prompt }];
    for (const image of images) {
      content.push({ type: "image_url", image_url: { url: `data:${image.mimeType};base64,${image.data}` } });
    }
    return withStreamFallback(
      MODELS.map((model) => () => this.streamWithMessages(model, [{ role: "user", content }]))
    );
  }
}
