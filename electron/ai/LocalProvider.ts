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

// Ollama serves a local HTTP API (default port 11434) — no npm client needed, Node's built-in
// fetch speaks it directly. Everything (prompt, resume, answer) stays on this machine.
const DEFAULT_BASE_URL = "http://127.0.0.1:11434";

// Used when nothing is picked in Settings yet — decent instruction-following at 7-8B, the
// smallest size class that reliably honors the app's "### section" response formats.
export const DEFAULT_LOCAL_MODEL = "llama3.1:8b";

// Preference order for auto-picking a model when several are installed.
const PREFERRED_MODELS = [
  "qwen2.5:7b",
  "llama3.1:8b",
  "qwen2.5:14b",
  "llama3.1:latest",
  "qwen2.5:latest",
  "mistral:latest",
  "gemma2:9b",
  "llama3.2:3b",
];

export interface LocalModelsInfo {
  running: boolean;
  models: string[];
  preferred?: string;
}

export class LocalProvider implements AIProvider {
  constructor(
    private model: string,
    private baseUrl = DEFAULT_BASE_URL
  ) {}

  /** Which installed model to auto-select (saved to settings by the caller). */
  static pickPreferred(models: string[]): string | undefined {
    for (const candidate of PREFERRED_MODELS) {
      if (models.includes(candidate)) return candidate;
    }
    return models[0];
  }

  static async listModels(baseUrl = DEFAULT_BASE_URL): Promise<LocalModelsInfo> {
    try {
      const res = await fetch(`${baseUrl}/api/tags`, { signal: AbortSignal.timeout(1500) });
      if (!res.ok) return { running: false, models: [] };
      const json = (await res.json()) as { models?: Array<{ name?: string }> };
      const models = (json.models ?? []).map((m) => m.name ?? "").filter(Boolean);
      if (models.length === 0) return { running: true, models: [] };
      return { running: true, models, preferred: LocalProvider.pickPreferred(models) };
    } catch {
      return { running: false, models: [] };
    }
  }

  async ping(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/api/version`, { signal: AbortSignal.timeout(1200) });
      return res.ok;
    } catch {
      return false;
    }
  }

  private async request(prompt: string, stream: boolean): Promise<Response> {
    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: this.model,
          messages: [{ role: "user", content: prompt }],
          stream,
          // Resume + job-description prompts run long; the default context window truncates them.
          options: { num_ctx: 8192 },
        }),
      });
    } catch (err) {
      throw new Error(
        `Can't reach Ollama at ${this.baseUrl}. Install it from ollama.com, make sure it's running (system tray icon), then try again.` +
          ` (${err instanceof Error ? err.message : String(err)})`
      );
    }
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      if (res.status === 404) {
        throw new Error(
          `Ollama doesn't have the model "${this.model}". Run \`ollama pull ${this.model}\` in a terminal, or pick an installed model in Settings → AI provider.`
        );
      }
      throw new Error(`Ollama error: ${res.status} ${text}`);
    }
    return res;
  }

  private async complete(prompt: string): Promise<string> {
    const res = await this.request(prompt, false);
    const json = (await res.json()) as { message?: { content?: string }; error?: string };
    if (json.error) throw new Error(`Ollama error: ${json.error}`);
    return json.message?.content ?? "";
  }

  async classify(question: string): Promise<QuestionCategory> {
    const text = (await this.complete(classifyPrompt(question))).trim().toLowerCase().replace(/[^a-z_]/g, "");
    return (CATEGORIES.find((c) => c === text) ?? "general") as QuestionCategory;
  }

  async summarizeMeetingNotes(transcript: string): Promise<MeetingNoteSummary> {
    return parseMeetingSummary(await this.complete(meetingNotesSummaryPrompt(transcript)));
  }

  async generateInterviewPrep(
    jobDescription: string,
    jobTitle: string,
    resumeContext: string | null
  ): Promise<InterviewPrepItem[]> {
    return parseInterviewPrep(await this.complete(interviewPrepPrompt(jobDescription, jobTitle, resumeContext)));
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
    return parseQuestionList(await this.complete(interviewQuestionsPrompt(categories, depth, count, ctx)), count);
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
    return this.streamWithModel(prompt);
  }

  // Ollama streams newline-delimited JSON objects, each carrying a token chunk in
  // message.content — split on line boundaries and forward the text as it arrives.
  private async *streamWithModel(prompt: string): AsyncIterable<string> {
    const res = await this.request(prompt, true);
    if (!res.body) throw new Error("Ollama returned an empty response body.");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let newline: number;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        if (!line) continue;
        let event: { message?: { content?: string }; error?: string };
        try {
          event = JSON.parse(line) as { message?: { content?: string }; error?: string };
        } catch {
          continue; // partial/keepalive line
        }
        if (event.error) throw new Error(`Ollama error: ${event.error}`);
        const text = event.message?.content;
        if (text) yield text;
      }
    }
  }
}
