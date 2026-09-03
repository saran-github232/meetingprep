import { contextBridge, ipcRenderer } from "electron";
import type {
  AnswerDepth,
  InterviewPrepItem,
  InterviewRoleContext,
  MeetingNoteSummary,
  QuestionCategory,
} from "./ai/AIProvider";
import type {
  QAHistoryRow,
  CodingHistoryRow,
  MeetingNoteRow,
  MockInterviewResultRow,
  ResumeTailoringRow,
  AIProviderName,
  Plan,
} from "./db/db";
import type { ShieldCapability } from "./stealth";
import type { LocalModelsInfo } from "./ai/LocalProvider";

function streamChannel(
  startChannel: string,
  args: unknown[],
  onChunk: (chunk: string) => void,
  onDone: () => void,
  onError: (message: string) => void
): () => void {
  const requestId = crypto.randomUUID();
  const chunkChannel = `ai:chunk:${requestId}`;
  const doneChannel = `ai:done:${requestId}`;
  const errorChannel = `ai:error:${requestId}`;

  const chunkListener = (_e: Electron.IpcRendererEvent, chunk: string) => onChunk(chunk);
  const doneListener = () => {
    cleanup();
    onDone();
  };
  const errorListener = (_e: Electron.IpcRendererEvent, message: string) => {
    cleanup();
    onError(message);
  };
  function cleanup() {
    ipcRenderer.removeListener(chunkChannel, chunkListener);
    ipcRenderer.removeListener(doneChannel, doneListener);
    ipcRenderer.removeListener(errorChannel, errorListener);
  }

  ipcRenderer.on(chunkChannel, chunkListener);
  ipcRenderer.on(doneChannel, doneListener);
  ipcRenderer.on(errorChannel, errorListener);
  ipcRenderer.send(startChannel, requestId, ...args);

  return cleanup;
}

const api = {
  qa: {
    list: (search?: string): Promise<QAHistoryRow[]> => ipcRenderer.invoke("qa:list", search),
    insert: (row: { question: string; category: string; depth: string; answer_json: string }) =>
      ipcRenderer.invoke("qa:insert", row),
    favorite: (id: number, favorited: boolean) => ipcRenderer.invoke("qa:favorite", id, favorited),
    delete: (id: number) => ipcRenderer.invoke("qa:delete", id),
    setTags: (id: number, tags: string) => ipcRenderer.invoke("qa:setTags", id, tags),
    listDue: (): Promise<QAHistoryRow[]> => ipcRenderer.invoke("qa:listDue"),
    review: (id: number, remembered: boolean) => ipcRenderer.invoke("qa:review", id, remembered),
  },
  coding: {
    list: (): Promise<CodingHistoryRow[]> => ipcRenderer.invoke("coding:list"),
    insert: (row: { question: string; language: string; code: string; explanation_json: string }) =>
      ipcRenderer.invoke("coding:insert", row),
    favorite: (id: number, favorited: boolean) => ipcRenderer.invoke("coding:favorite", id, favorited),
    delete: (id: number) => ipcRenderer.invoke("coding:delete", id),
    setTags: (id: number, tags: string) => ipcRenderer.invoke("coding:setTags", id, tags),
    listDue: (): Promise<CodingHistoryRow[]> => ipcRenderer.invoke("coding:listDue"),
    review: (id: number, remembered: boolean) => ipcRenderer.invoke("coding:review", id, remembered),
  },
  resume: {
    get: () => ipcRenderer.invoke("resume:get"),
    set: (content: string) => ipcRenderer.invoke("resume:set", content),
    importPdf: (): Promise<{ text: string; fileName: string; pages: number } | null> =>
      ipcRenderer.invoke("resume:importPdf"),
  },
  meetingNotes: {
    list: (): Promise<MeetingNoteRow[]> => ipcRenderer.invoke("meetingNotes:list"),
    insert: (title: string, notes: string, actionItems: string[]) =>
      ipcRenderer.invoke("meetingNotes:insert", title, notes, actionItems),
    delete: (id: number) => ipcRenderer.invoke("meetingNotes:delete", id),
  },
  mockInterview: {
    record: (row: Omit<MockInterviewResultRow, "id" | "created_at">) =>
      ipcRenderer.invoke("mockInterview:record", row),
    list: (): Promise<MockInterviewResultRow[]> => ipcRenderer.invoke("mockInterview:list"),
  },
  resumeTailoring: {
    record: (row: { job_title: string; job_description: string; result: string }) =>
      ipcRenderer.invoke("resumeTailoring:record", row),
    list: (): Promise<ResumeTailoringRow[]> => ipcRenderer.invoke("resumeTailoring:list"),
    delete: (id: number) => ipcRenderer.invoke("resumeTailoring:delete", id),
  },
  settings: {
    get: (key: string) => ipcRenderer.invoke("settings:get", key),
    set: (key: string, value: string) => ipcRenderer.invoke("settings:set", key, value),
  },
  stealth: {
    get: (): Promise<boolean> => ipcRenderer.invoke("stealth:get"),
    set: (enabled: boolean): Promise<void> => ipcRenderer.invoke("stealth:set", enabled),
    capability: (): Promise<ShieldCapability> => ipcRenderer.invoke("stealth:capability"),
  },
  data: {
    wipeAll: () => ipcRenderer.invoke("data:wipeAll"),
    wipeHistory: () => ipcRenderer.invoke("data:wipeHistory"),
    wipeResume: () => ipcRenderer.invoke("data:wipeResume"),
  },
  ai: {
    status: (): Promise<boolean> => ipcRenderer.invoke("ai:status"),
    getActiveProvider: (): Promise<AIProviderName> => ipcRenderer.invoke("ai:getActiveProvider"),
    setActiveProvider: (provider: AIProviderName): Promise<void> =>
      ipcRenderer.invoke("ai:setActiveProvider", provider),
    setApiKey: (provider: AIProviderName, key: string): Promise<void> =>
      ipcRenderer.invoke("ai:setApiKey", provider, key),
    clearApiKey: (provider: AIProviderName): Promise<void> =>
      ipcRenderer.invoke("ai:clearApiKey", provider),
    localModels: (): Promise<LocalModelsInfo> => ipcRenderer.invoke("ai:localModels"),
    classify: (question: string): Promise<QuestionCategory> => ipcRenderer.invoke("ai:classify", question),
    summarizeNotes: (transcript: string): Promise<MeetingNoteSummary> =>
      ipcRenderer.invoke("ai:summarizeNotes", transcript),
    generateInterviewPrep: (
      jobDescription: string,
      jobTitle: string,
      resumeContext: string | null
    ): Promise<InterviewPrepItem[]> =>
      ipcRenderer.invoke("ai:generateInterviewPrep", jobDescription, jobTitle, resumeContext),
    streamAnswer: (
      question: string,
      category: QuestionCategory,
      depth: AnswerDepth,
      resumeContext: string | null,
      onChunk: (chunk: string) => void,
      onDone: () => void,
      onError: (message: string) => void
    ) =>
      streamChannel(
        "ai:streamAnswer",
        [question, category, depth, resumeContext],
        onChunk,
        onDone,
        onError
      ),
    streamCode: (
      instruction: string,
      language: string,
      code: string | null,
      onChunk: (chunk: string) => void,
      onDone: () => void,
      onError: (message: string) => void
    ) => streamChannel("ai:streamCode", [instruction, language, code], onChunk, onDone, onError),
    generateInterviewQuestions: (
      categories: QuestionCategory[],
      depth: AnswerDepth,
      count: number,
      ctx: InterviewRoleContext
    ): Promise<string[]> => ipcRenderer.invoke("ai:generateInterviewQuestions", categories, depth, count, ctx),
    streamInterviewFeedback: (
      question: string,
      depth: AnswerDepth,
      userAnswer: string,
      ctx: InterviewRoleContext,
      resumeContext: string | null,
      onChunk: (chunk: string) => void,
      onDone: () => void,
      onError: (message: string) => void
    ) =>
      streamChannel(
        "ai:streamInterviewFeedback",
        [question, depth, userAnswer, ctx, resumeContext],
        onChunk,
        onDone,
        onError
      ),
    streamResumeTailoring: (
      resumeText: string,
      jobDescription: string,
      jobTitle: string,
      onChunk: (chunk: string) => void,
      onDone: () => void,
      onError: (message: string) => void
    ) =>
      streamChannel(
        "ai:streamResumeTailoring",
        [resumeText, jobDescription, jobTitle],
        onChunk,
        onDone,
        onError
      ),
  },
  export: {
    markdown: (content: string, suggestedName: string): Promise<boolean> =>
      ipcRenderer.invoke("export:markdown", content, suggestedName),
    pdf: (html: string, suggestedName: string): Promise<boolean> =>
      ipcRenderer.invoke("export:pdf", html, suggestedName),
  },
  menu: {
    onNavigate: (onPath: (path: string) => void): (() => void) => {
      const listener = (_e: Electron.IpcRendererEvent, path: string) => onPath(path);
      ipcRenderer.on("menu:navigate", listener);
      return () => ipcRenderer.removeListener("menu:navigate", listener);
    },
    onToggleStealth: (onToggle: () => void): (() => void) => {
      const listener = () => onToggle();
      ipcRenderer.on("menu:toggleStealth", listener);
      return () => ipcRenderer.removeListener("menu:toggleStealth", listener);
    },
  },
  plan: {
    get: (): Promise<Plan> => ipcRenderer.invoke("plan:get"),
    set: (plan: Plan): Promise<void> => ipcRenderer.invoke("plan:set", plan),
  },
};

contextBridge.exposeInMainWorld("api", api);

export type MeetingPrepAPI = typeof api;
