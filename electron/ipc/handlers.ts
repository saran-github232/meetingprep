import { BrowserWindow, ipcMain, type WebContents } from "electron";
import type { AIProvider, AnswerDepth, InterviewRoleContext, QuestionCategory, CoachSpeed } from "../ai/AIProvider";
import * as db from "../db/db";
import { envKeyName, isKeyConfigured, type AIProviderName } from "../ai/providerKeys";
import {
  coachAnalysisPrompt,
  coachFeedbackPrompt,
  coachMaxTokens,
  coachQuestionPrompt,
  isUsefulAnalysis,
  parseCoachFeedback,
  parseCoachQuestion,
  parseInterviewCoachContext,
  type CoachProviderPreference,
  type CoachResponseLength,
  type CoachSessionMemoryItem,
  type CoachSetup,
  type InterviewCoachContext,
} from "../ai/interviewCoach";
import { setEnvKey } from "../env";
import { saveMarkdown, savePdf } from "../export";
import { importResumePdf } from "../pdf";
import { shieldCapability } from "../stealth";
import { friendlyErrorMessage } from "../ai/retry";
import { LocalProvider } from "../ai/LocalProvider";
import { testProviderKey, type ProviderTestResult } from "../ai/validate";

export function registerIpcHandlers(getProviders: (prefer?: CoachProviderPreference) => AIProvider[]) {
  // Interview Coach settings (shared keys with the Settings page; generic settings storage).
  function coachPrefs(): { prefer: CoachProviderPreference; speed: CoachSpeed; length: CoachResponseLength } {
    const prefer = (db.getSetting("coach_provider") ?? "auto") as CoachProviderPreference;
    const speed = (db.getSetting("coach_speed") ?? "fast") as CoachSpeed;
    const length = (db.getSetting("coach_length") ?? "medium") as CoachResponseLength;
    return {
      prefer: prefer === "gemini" || prefer === "nvidia" ? prefer : "auto",
      speed: speed === "fast" || speed === "balanced" || speed === "quality" ? speed : "fast",
      length: length === "short" || length === "medium" || length === "detailed" ? length : "medium",
    };
  }

  // The coach's preferred provider goes to the front of the app-wide fallback chain, so a
  // rate-limited key still degrades to the next configured provider instead of failing.
  function providersForCoach(): AIProvider[] {
    return getProviders(coachPrefs().prefer);
  }
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
  // Per-provider "is there a usable key?" — unlike ai:status, which answers "is ANY provider
  // configured" (used for app-level gating), Settings needs to know about the one being edited.
  ipcMain.handle("ai:hasKey", (_e, provider: AIProviderName) => {
    if (provider === "local") return LocalProvider.listModels().then((i) => i.running && i.models.length > 0);
    return isKeyConfigured(db.getApiKey(provider), process.env[envKeyName(provider) ?? ""]);
  });
  // Real credential check against the provider's own API — the "Test connection" button.
  ipcMain.handle("ai:testProvider", async (_e, provider: AIProviderName): Promise<ProviderTestResult> => {
    const key = provider === "local" ? null : db.getApiKey(provider) ?? process.env[envKeyName(provider) ?? ""] ?? null;
    return testProviderKey(provider, key);
  });
  // The DB copy (encrypted with the OS keychain) is authoritative; the .env write is a dev
  // convenience that must never fail the save — packaged installs may sit in a read-only
  // directory, and that used to make the whole save throw while the renderer ignored the
  // rejection. Returns whether the .env sync happened so the UI can say so.
  ipcMain.handle("ai:setApiKey", (_e, provider: AIProviderName, key: string) => {
    db.setApiKey(provider, key);
    let envSynced = false;
    const envName = envKeyName(provider);
    if (envName) {
      try {
        setEnvKey(envName, key);
        envSynced = true;
      } catch {
        // .env unwritable — the encrypted DB copy still saves and takes priority at runtime.
      }
    }
    return { envSynced };
  });
  ipcMain.handle("ai:clearApiKey", (_e, provider: AIProviderName) => {
    db.clearApiKey(provider);
    const envName = envKeyName(provider);
    if (envName) {
      try {
        setEnvKey(envName, "");
      } catch {
        // same as above — the DB deletion is what matters
      }
    }
  });
  ipcMain.handle("ai:localModels", () => LocalProvider.listModels());

  registerCoachHandlers({ coachPrefs, providersForCoach });

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
// Measures TTFT (request start → first chunk) and total time, sent on `ai:metrics:<id>` right
// before done — the Interview Coach latency badge reads them; other features ignore the event.
// onComplete receives the full text of the successful stream (used to persist coach feedback).
async function runStream(
  sender: WebContents,
  requestId: string,
  attempts: Array<() => AsyncIterable<string>>,
  onComplete?: (full: string) => void
) {
  const startedAt = Date.now();
  let ttftMs: number | null = null;
  let full = "";
  let lastErr: unknown;
  for (const getIterable of attempts) {
    let sentAny = false;
    try {
      for await (const chunk of getIterable()) {
        sentAny = true;
        if (ttftMs === null) ttftMs = Date.now() - startedAt;
        full += chunk;
        sender.send(`ai:chunk:${requestId}`, chunk);
      }
      sender.send(`ai:metrics:${requestId}`, { ttftMs: ttftMs ?? Date.now() - startedAt, totalMs: Date.now() - startedAt });
      sender.send(`ai:done:${requestId}`);
      onComplete?.(full);
      return;
    } catch (err) {
      lastErr = err;
      if (sentAny) break;
    }
  }
  sender.send(`ai:error:${requestId}`, friendlyErrorMessage(lastErr));
}

// ---------------------------------------------------------------------------
// Interview Coach
// ---------------------------------------------------------------------------

// Rebuilds the CoachSetup a session was created with from its persisted rows.
function coachSetupFor(sessionId: number): { setup: CoachSetup; context: NonNullable<ReturnType<typeof db.getCoachContext>> } | null {
  const session = db.getCoachSession(sessionId);
  const context = db.getCoachContext(sessionId);
  if (!session || !context) return null;
  return {
    context,
    setup: {
      jobTitle: session.job_title,
      company: session.company,
      jobDescription: context.jobDescription,
      requiredSkills: context.requiredSkills,
      preferredSkills: context.preferredSkills,
      experienceLevel: session.experience_level,
      responsibilities: context.responsibilities,
      techStack: context.techStack,
      interviewType: session.interview_type as CoachSetup["interviewType"],
      notes: context.notes,
    },
  };
}

// Session memory: recent answered questions (answer excerpt + the first coach improvement)
// so follow-up feedback builds on prior weak spots without resending full transcripts.
function coachMemoryFor(sessionId: number): CoachSessionMemoryItem[] {
  return db
    .getCoachQa(sessionId)
    .filter((qa) => qa.answer !== null)
    .slice(-6)
    .map((qa) => ({
      question: qa.question,
      answerExcerpt: (qa.answer ?? "").slice(0, 200),
      feedbackNote: qa.feedback?.missingPoints[0] ?? qa.feedback?.keyPoints[0] ?? "",
    }));
}

function requireProviders(providers: AIProvider[]): void {
  if (providers.length === 0) throw new Error("AI provider not configured. Add an API key in Settings.");
}

// Interview Coach handlers. Registered from registerIpcHandlers so they share the coach
// preference lookup and the preference-ordered provider chain defined there.
function registerCoachHandlers(deps: {
  coachPrefs: () => { prefer: CoachProviderPreference; speed: CoachSpeed; length: CoachResponseLength };
  providersForCoach: () => AIProvider[];
}) {
  const { coachPrefs, providersForCoach } = deps;
  ipcMain.handle(
    "coach:createSession",
    (
      _e,
      input: {
        setup: CoachSetup;
        resume: string | null;
      }
    ) => {
      const s = input.setup;
      return db.createCoachSession({
        jobTitle: s.jobTitle.trim(),
        company: s.company.trim(),
        interviewType: s.interviewType,
        experienceLevel: s.experienceLevel,
        jobDescription: s.jobDescription.trim(),
        resume: input.resume?.trim() ? input.resume : null,
        requiredSkills: s.requiredSkills.trim(),
        preferredSkills: s.preferredSkills.trim(),
        responsibilities: s.responsibilities.trim(),
        techStack: s.techStack.trim(),
        notes: s.notes.trim(),
      });
    }
  );

ipcMain.handle("coach:latestSession", (_e, sessionId?: number) => {
  const session = sessionId ? db.getCoachSession(sessionId) : db.getLatestCoachSession();
  return session ? db.getCoachSessionBundle(session.id) : null;
});

ipcMain.handle("coach:listSessions", () => db.listCoachSessions());

ipcMain.handle("coach:deleteSession", (_e, sessionId: number) => db.deleteCoachSession(sessionId));

// The one-time resume/JD analysis (Phase 3) — cached in the session's context row, so
// reopening a session or asking the next question never re-runs it.
ipcMain.handle("coach:analyze", async (_e, sessionId: number): Promise<InterviewCoachContext> => {
  const parts = coachSetupFor(sessionId);
  if (!parts) throw new Error("This Interview Coach session no longer exists.");
  const prompt = coachAnalysisPrompt(parts.setup, parts.context.resume);
  const providers = providersForCoach();
  requireProviders(providers);
  let lastErr: unknown;
  for (const provider of providers) {
    try {
      const raw = await provider.completeCoach(prompt, "quality", 1600);
      const analysis = parseInterviewCoachContext(raw);
      if (!isUsefulAnalysis(analysis)) throw new Error("The analysis came back empty — try again.");
      db.saveCoachContext(sessionId, { analysis });
      db.updateCoachSessionStatus(sessionId, "ready");
      return analysis;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(friendlyErrorMessage(lastErr));
});

// Next practice question: AI-generated (respecting the interview type and everything already
// asked) or user-pasted. Both are persisted in asked order.
ipcMain.handle(
  "coach:nextQuestion",
  async (
    _e,
    sessionId: number,
    source: "ai" | "user",
    userQuestion?: string
  ): Promise<{ id: number; question: string }> => {
    if (source === "user") {
      const question = (userQuestion ?? "").trim();
      if (!question) throw new Error("Type a question first.");
      const id = db.addCoachQuestion(sessionId, question.slice(0, 500), "user");
      return { id, question: question.slice(0, 500) };
    }
    const parts = coachSetupFor(sessionId);
    if (!parts) throw new Error("This Interview Coach session no longer exists.");
    const prefs = coachPrefs();
    const asked = db.listCoachQuestions(sessionId).map((q) => q.question);
    const prompt = coachQuestionPrompt({
      setup: parts.setup,
      ctx: parts.context.analysis,
      speed: prefs.speed,
      askedQuestions: asked,
    });
    const providers = providersForCoach();
    requireProviders(providers);
    let lastErr: unknown;
    for (const provider of providers) {
      try {
        const raw = await provider.completeCoach(prompt, prefs.speed, 200);
        const question = parseCoachQuestion(raw);
        if (!question) throw new Error("The question came back empty — try again.");
        const id = db.addCoachQuestion(sessionId, question, "ai");
        return { id, question };
      } catch (err) {
        lastErr = err;
      }
    }
    throw new Error(friendlyErrorMessage(lastErr));
  }
);

// Streams coach feedback for an answer and persists answer + feedback once the stream
// completes cleanly (a failed stream persists nothing — the user just retries).
ipcMain.on(
  "coach:streamFeedback",
  async (event, requestId: string, sessionId: number, questionId: number, question: string, answer: string) => {
    const prefs = coachPrefs();
    const parts = coachSetupFor(sessionId);
    if (!parts) {
      event.sender.send(`ai:error:${requestId}`, "This Interview Coach session no longer exists.");
      return;
    }
    const prompt = coachFeedbackPrompt({
      question,
      answer,
      speed: prefs.speed,
      length: prefs.length,
      ctx: parts.context.analysis,
      sessionMemory: coachMemoryFor(sessionId),
      setup: parts.setup,
      hasResume: !!parts.context.resume?.trim(),
    });
    const providers = providersForCoach();
    if (providers.length === 0) {
      event.sender.send(`ai:error:${requestId}`, "AI provider not configured. Add an API key in Settings.");
      return;
    }
    const maxTokens = coachMaxTokens(prefs.speed, prefs.length);
    await runStream(
      event.sender,
      requestId,
      providers.map((p) => () => p.streamCoach(prompt, prefs.speed, maxTokens)),
      (full) => {
        try {
          const feedback = parseCoachFeedback(full);
          if (!feedback.suggestedAnswer && feedback.keyPoints.length === 0) return;
          const answerId = db.addCoachAnswer(sessionId, questionId, answer);
          db.saveCoachFeedback(sessionId, answerId, feedback);
        } catch {
          // Persistence is best-effort: the streamed feedback was already delivered to the
          // user; a DB hiccup shouldn't be reported as a failed coaching request.
        }
      }
    );
  }
);
}
