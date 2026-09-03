import { BrowserWindow, ipcMain, type WebContents } from "electron";
import type { AIProvider, AnswerDepth, InterviewRoleContext, QuestionCategory } from "../ai/AIProvider";
import * as db from "../db/db";
import type { AIProviderName } from "../db/db";
import { setEnvKey } from "../env";
import { saveMarkdown, savePdf } from "../export";
import { importResumePdf } from "../pdf";
import { shieldCapability } from "../stealth";
import { friendlyErrorMessage } from "../ai/retry";

const ENV_KEY_NAME: Record<AIProviderName, string> = {
  gemini: "GEMINI_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
};

export function registerIpcHandlers(getProviders: () => AIProvider[]) {
  ipcMain.handle("qa:list", (_e, search?: string) => db.listQAHistory(search));
  ipcMain.handle("qa:insert", (_e, row) => db.insertQAHistory(row));
  ipcMain.handle("qa:favorite", (_e, id: number, favorited: boolean) => db.setFavorite(id, favorited));
  ipcMain.handle("qa:delete", (_e, id: number) => db.deleteQAHistory(id));
  ipcMain.handle("qa:setTags", (_e, id: number, tags: string) => db.setQaTags(id, tags));
  ipcMain.handle("qa:listDue", () => db.listDueQAHistory());
  ipcMain.handle("qa:review", (_e, id: number, remembered: boolean) => db.recordQaReview(id, remembered));

  ipcMain.handle("coding:list", () => db.listCodingHistory());
  ipcMain.handle("coding:insert", (_e, row) => db.insertCodingHistory(row));
  ipcMain.handle("coding:favorite", (_e, id: number, favorited: boolean) =>
    db.setCodingFavorite(id, favorited)
  );
  ipcMain.handle("coding:delete", (_e, id: number) => db.deleteCodingHistory(id));
  ipcMain.handle("coding:setTags", (_e, id: number, tags: string) => db.setCodingTags(id, tags));
  ipcMain.handle("coding:listDue", () => db.listDueCodingHistory());
  ipcMain.handle("coding:review", (_e, id: number, remembered: boolean) =>
    db.recordCodingReview(id, remembered)
  );

  ipcMain.handle("resume:get", () => db.getResumeContext());
  ipcMain.handle("resume:set", (_e, content: string) => db.setResumeContext(content));
  ipcMain.handle("resume:importPdf", (e) => importResumePdf(e.sender));

  ipcMain.handle("meetingNotes:list", () => db.listMeetingNotes());
  ipcMain.handle("meetingNotes:insert", (_e, title: string, notes: string, actionItems: string[]) =>
    db.insertMeetingNote(title, notes, actionItems)
  );
  ipcMain.handle("meetingNotes:delete", (_e, id: number) => db.deleteMeetingNote(id));

  ipcMain.handle("mockInterview:record", (_e, row: Omit<db.MockInterviewResultRow, "id" | "created_at">) =>
    db.insertMockInterviewResult(row)
  );
  ipcMain.handle("mockInterview:list", () => db.listMockInterviewResults());

  ipcMain.handle("resumeTailoring:record", (_e, row: { job_title: string; job_description: string; result: string }) =>
    db.insertResumeTailoring(row)
  );
  ipcMain.handle("resumeTailoring:list", () => db.listResumeTailoring());
  ipcMain.handle("resumeTailoring:delete", (_e, id: number) => db.deleteResumeTailoringRow(id));

  ipcMain.handle("settings:get", (_e, key: string) => db.getSetting(key));
  ipcMain.handle("settings:set", (_e, key: string, value: string) => db.setSetting(key, value));

  ipcMain.handle("stealth:get", () => db.getSetting("stealth") === "1");
  ipcMain.handle("stealth:capability", () => shieldCapability());
  ipcMain.handle("stealth:set", (_e, enabled: boolean) => {
    db.setSetting("stealth", enabled ? "1" : "0");
    for (const win of BrowserWindow.getAllWindows()) win.setContentProtection(enabled);
  });

  ipcMain.handle("data:wipeAll", () => db.wipeAllData());
  ipcMain.handle("data:wipeHistory", () => db.wipeHistory());
  ipcMain.handle("data:wipeResume", () => db.wipeResume());

  ipcMain.handle("plan:get", () => db.getPlan());
  ipcMain.handle("plan:set", (_e, plan: db.Plan) => db.setPlan(plan));

  ipcMain.handle("ai:status", () => getProviders().length > 0);
  ipcMain.handle("ai:getActiveProvider", () => db.getActiveProvider());
  ipcMain.handle("ai:setActiveProvider", (_e, provider: AIProviderName) => db.setActiveProvider(provider));
  ipcMain.handle("ai:setApiKey", (_e, provider: AIProviderName, key: string) => {
    db.setApiKey(provider, key);
    setEnvKey(ENV_KEY_NAME[provider], key);
  });
  ipcMain.handle("ai:clearApiKey", (_e, provider: AIProviderName) => {
    db.clearApiKey(provider);
    setEnvKey(ENV_KEY_NAME[provider], "");
  });

  ipcMain.handle("ai:classify", async (_e, question: string) => {
    const providers = getProviders();
    if (providers.length === 0) throw new Error("AI provider not configured. Add an API key in Settings.");
    let lastErr: unknown;
    for (const provider of providers) {
      try {
        return await provider.classify(question);
      } catch (err) {
        lastErr = err;
      }
    }
    throw new Error(friendlyErrorMessage(lastErr));
  });

  ipcMain.handle("ai:summarizeNotes", async (_e, transcript: string) => {
    const providers = getProviders();
    if (providers.length === 0) throw new Error("AI provider not configured. Add an API key in Settings.");
    let lastErr: unknown;
    for (const provider of providers) {
      try {
        return await provider.summarizeMeetingNotes(transcript);
      } catch (err) {
        lastErr = err;
      }
    }
    throw new Error(friendlyErrorMessage(lastErr));
  });

  ipcMain.handle(
    "ai:generateInterviewPrep",
    async (_e, jobDescription: string, jobTitle: string, resumeContext: string | null) => {
      const providers = getProviders();
      if (providers.length === 0) throw new Error("AI provider not configured. Add an API key in Settings.");
      let lastErr: unknown;
      for (const provider of providers) {
        try {
          return await provider.generateInterviewPrep(jobDescription, jobTitle, resumeContext);
        } catch (err) {
          lastErr = err;
        }
      }
      throw new Error(friendlyErrorMessage(lastErr));
    }
  );

  ipcMain.handle(
    "ai:generateInterviewQuestions",
    async (_e, categories: QuestionCategory[], depth: AnswerDepth, count: number, ctx: InterviewRoleContext) => {
      const providers = getProviders();
      if (providers.length === 0) throw new Error("AI provider not configured. Add an API key in Settings.");
      let lastErr: unknown;
      for (const provider of providers) {
        try {
          return await provider.generateInterviewQuestions(categories, depth, count, ctx);
        } catch (err) {
          lastErr = err;
        }
      }
      throw new Error(friendlyErrorMessage(lastErr));
    }
  );

  ipcMain.handle("export:markdown", (_e, content: string, suggestedName: string) =>
    saveMarkdown(content, suggestedName)
  );
  ipcMain.handle("export:pdf", (_e, html: string, suggestedName: string) => savePdf(html, suggestedName));

  ipcMain.on(
    "ai:streamAnswer",
    async (
      event,
      requestId: string,
      question: string,
      category: QuestionCategory,
      depth: AnswerDepth,
      resumeContext: string | null
    ) => {
      const providers = getProviders();
      if (providers.length === 0) {
        event.sender.send(`ai:error:${requestId}`, "AI provider not configured. Add an API key in Settings.");
        return;
      }
      await runStream(
        event.sender,
        requestId,
        providers.map((p) => () => p.streamAnswer(question, category, depth, resumeContext))
      );
    }
  );

  ipcMain.on(
    "ai:streamCode",
    async (event, requestId: string, instruction: string, language: string, code: string | null) => {
      const providers = getProviders();
      if (providers.length === 0) {
        event.sender.send(`ai:error:${requestId}`, "AI provider not configured. Add an API key in Settings.");
        return;
      }
      await runStream(
        event.sender,
        requestId,
        providers.map((p) => () => p.streamCodeAnswer(instruction, language, code))
      );
    }
  );

  ipcMain.on(
    "ai:streamInterviewFeedback",
    async (
      event,
      requestId: string,
      question: string,
      depth: AnswerDepth,
      userAnswer: string,
      ctx: InterviewRoleContext,
      resumeContext: string | null
    ) => {
      const providers = getProviders();
      if (providers.length === 0) {
        event.sender.send(`ai:error:${requestId}`, "AI provider not configured. Add an API key in Settings.");
        return;
      }
      await runStream(
        event.sender,
        requestId,
        providers.map((p) => () => p.streamInterviewFeedback(question, depth, userAnswer, ctx, resumeContext))
      );
    }
  );

  ipcMain.on(
    "ai:streamResumeTailoring",
    async (event, requestId: string, resumeText: string, jobDescription: string, jobTitle: string) => {
      const providers = getProviders();
      if (providers.length === 0) {
        event.sender.send(`ai:error:${requestId}`, "AI provider not configured. Add an API key in Settings.");
        return;
      }
      await runStream(
        event.sender,
        requestId,
        providers.map((p) => () => p.streamResumeTailoring(resumeText, jobDescription, jobTitle))
      );
    }
  );
}

// Tries each provider (active first, then any other configured one) in order. Once a provider
// has streamed at least one chunk, we stop — switching mid-answer would stitch together output
// from two different models, so a failure past that point is reported instead of retried.
async function runStream(
  sender: WebContents,
  requestId: string,
  attempts: Array<() => AsyncIterable<string>>
) {
  let lastErr: unknown;
  for (const getIterable of attempts) {
    let sentAny = false;
    try {
      for await (const chunk of getIterable()) {
        sentAny = true;
        sender.send(`ai:chunk:${requestId}`, chunk);
      }
      sender.send(`ai:done:${requestId}`);
      return;
    } catch (err) {
      lastErr = err;
      if (sentAny) break;
    }
  }
  sender.send(`ai:error:${requestId}`, friendlyErrorMessage(lastErr));
}
