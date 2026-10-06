import { DatabaseSync } from "node:sqlite";
import { app } from "electron";
import { join } from "node:path";
import schema from "./schema.sql?raw";
import { encrypt, decrypt } from "../security/crypto";
import { apiKeySettingKey, type AIProviderName } from "../ai/providerKeys";
import type { InterviewCoachContext, CoachFeedback } from "../ai/interviewCoach";

export type { AIProviderName } from "../ai/providerKeys";

const dbPath = join(app.getPath("userData"), "meetingprep.db");
export const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL");
db.exec(schema);
migrate();

// Adds columns introduced after a user's DB file was first created — CREATE TABLE IF NOT EXISTS
// above only applies to brand-new DBs, so existing ones need an explicit ALTER TABLE.
function migrate() {
  for (const table of ["qa_history", "coding_history"] as const) {
    const cols = new Set(
      (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((c) => c.name)
    );
    if (!cols.has("tags")) db.exec(`ALTER TABLE ${table} ADD COLUMN tags TEXT NOT NULL DEFAULT ''`);
    if (!cols.has("review_count"))
      db.exec(`ALTER TABLE ${table} ADD COLUMN review_count INTEGER NOT NULL DEFAULT 0`);
    if (!cols.has("next_review_at")) db.exec(`ALTER TABLE ${table} ADD COLUMN next_review_at TEXT`);
  }
  // Interview Coach v2: session language preference + detected role profile.
  const coachCols = new Set(
    (db.prepare(`PRAGMA table_info(interview_coach_sessions)`).all() as Array<{ name: string }>).map((c) => c.name)
  );
  if (!coachCols.has("preferred_language"))
    db.exec(`ALTER TABLE interview_coach_sessions ADD COLUMN preferred_language TEXT NOT NULL DEFAULT 'auto'`);
  if (!coachCols.has("role_profile"))
    db.exec(`ALTER TABLE interview_coach_sessions ADD COLUMN role_profile TEXT NOT NULL DEFAULT 'general'`);
  // Interview Coach v3: session format (human / virtual_ai) + explicit completion time.
  if (!coachCols.has("interview_format"))
    db.exec(`ALTER TABLE interview_coach_sessions ADD COLUMN interview_format TEXT NOT NULL DEFAULT 'human'`);
  if (!coachCols.has("completed_at")) db.exec(`ALTER TABLE interview_coach_sessions ADD COLUMN completed_at TEXT`);

  // Practice sessions context columns (Resume + Job Description + Analysis)
  const practiceCols = new Set(
    (db.prepare(`PRAGMA table_info(practice_sessions)`).all() as Array<{ name: string }>).map((c) => c.name)
  );
  if (!practiceCols.has("resume_text")) db.exec(`ALTER TABLE practice_sessions ADD COLUMN resume_text TEXT NOT NULL DEFAULT ''`);
  if (!practiceCols.has("job_title")) db.exec(`ALTER TABLE practice_sessions ADD COLUMN job_title TEXT NOT NULL DEFAULT ''`);
  if (!practiceCols.has("company")) db.exec(`ALTER TABLE practice_sessions ADD COLUMN company TEXT NOT NULL DEFAULT ''`);
  if (!practiceCols.has("job_description")) db.exec(`ALTER TABLE practice_sessions ADD COLUMN job_description TEXT NOT NULL DEFAULT ''`);
  if (!practiceCols.has("required_skills")) db.exec(`ALTER TABLE practice_sessions ADD COLUMN required_skills TEXT NOT NULL DEFAULT ''`);
  if (!practiceCols.has("tech_stack")) db.exec(`ALTER TABLE practice_sessions ADD COLUMN tech_stack TEXT NOT NULL DEFAULT ''`);
  if (!practiceCols.has("experience_level")) db.exec(`ALTER TABLE practice_sessions ADD COLUMN experience_level TEXT NOT NULL DEFAULT ''`);
  if (!practiceCols.has("context_analysis_json")) db.exec(`ALTER TABLE practice_sessions ADD COLUMN context_analysis_json TEXT NOT NULL DEFAULT ''`);
}

export interface QAHistoryRow {
  id: number;
  question: string;
  category: string;
  depth: string;
  answer_json: string;
  favorited: number;
  tags: string;
  review_count: number;
  next_review_at: string | null;
  created_at: string;
}

// Spaced-repetition schedule: days until the next review, indexed by review_count (capped at the last entry).
const REVIEW_INTERVALS_DAYS = [1, 3, 7, 14, 30, 60];

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString();
}

export function insertQAHistory(row: Omit<QAHistoryRow, "id" | "created_at" | "favorited" | "tags" | "review_count" | "next_review_at">) {
  return db
    .prepare(`INSERT INTO qa_history (question, category, depth, answer_json) VALUES (?, ?, ?, ?)`)
    .run(row.question, row.category, row.depth, row.answer_json);
}

export function listQAHistory(search?: string): QAHistoryRow[] {
  if (search) {
    return db
      .prepare(`SELECT * FROM qa_history WHERE question LIKE ? ORDER BY created_at DESC`)
      .all(`%${search}%`) as unknown as QAHistoryRow[];
  }
  return db.prepare(`SELECT * FROM qa_history ORDER BY created_at DESC`).all() as unknown as QAHistoryRow[];
}

export function setFavorite(id: number, favorited: boolean) {
  db.prepare(`UPDATE qa_history SET favorited = ? WHERE id = ?`).run(favorited ? 1 : 0, id);
  // Entering the favorites rotation puts the item up for review right away.
  if (favorited) {
    db.prepare(
      `UPDATE qa_history SET next_review_at = COALESCE(next_review_at, ?) WHERE id = ?`
    ).run(new Date().toISOString(), id);
  }
}

export function deleteQAHistory(id: number) {
  db.prepare(`DELETE FROM qa_history WHERE id = ?`).run(id);
}

export function setQaTags(id: number, tags: string) {
  db.prepare(`UPDATE qa_history SET tags = ? WHERE id = ?`).run(tags, id);
}

export function listDueQAHistory(): QAHistoryRow[] {
  return db
    .prepare(
      `SELECT * FROM qa_history WHERE favorited = 1 AND (next_review_at IS NULL OR next_review_at <= ?) ORDER BY next_review_at ASC`
    )
    .all(new Date().toISOString()) as unknown as QAHistoryRow[];
}

export function recordQaReview(id: number, remembered: boolean) {
  if (!remembered) {
    db.prepare(`UPDATE qa_history SET review_count = 0, next_review_at = ? WHERE id = ?`).run(
      daysFromNow(REVIEW_INTERVALS_DAYS[0]),
      id
    );
    return;
  }
  const row = db.prepare(`SELECT review_count FROM qa_history WHERE id = ?`).get(id) as
    | { review_count: number }
    | undefined;
  const nextCount = (row?.review_count ?? 0) + 1;
  const interval = REVIEW_INTERVALS_DAYS[Math.min(nextCount, REVIEW_INTERVALS_DAYS.length - 1)];
  db.prepare(`UPDATE qa_history SET review_count = ?, next_review_at = ? WHERE id = ?`).run(
    nextCount,
    daysFromNow(interval),
    id
  );
}

export function getSetting(key: string): string | undefined {
  const row = db.prepare(`SELECT value FROM settings WHERE key = ?`).get(key) as
    | { value: string }
    | undefined;
  return row?.value;
}

export function setSetting(key: string, value: string) {
  db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, value);
}

export function getApiKey(provider: AIProviderName): string | null {
  const stored = getSetting(apiKeySettingKey(provider));
  if (!stored) return null;
  try {
    return decrypt(stored);
  } catch {
    // Row came from another OS user/machine, or decryption broke — treat as absent so the
    // .env / OS-environment copy gets its chance instead of failing the whole provider.
    return null;
  }
}

export function setApiKey(provider: AIProviderName, key: string): void {
  setSetting(apiKeySettingKey(provider), encrypt(key));
}

export function clearApiKey(provider: AIProviderName): void {
  db.prepare(`DELETE FROM settings WHERE key = ?`).run(apiKeySettingKey(provider));
}

export function getActiveProvider(): AIProviderName {
  return (getSetting("ai_provider") as AIProviderName | undefined) ?? "gemini";
}

export function setActiveProvider(provider: AIProviderName): void {
  setSetting("ai_provider", provider);
}

export function wipeAllData() {
  db.exec(`
    DELETE FROM qa_history;
    DELETE FROM coding_history;
    DELETE FROM resume_context;
    DELETE FROM meeting_notes;
    DELETE FROM mock_interview_results;
    DELETE FROM resume_tailoring_results;
    DELETE FROM interview_coach_feedback;
    DELETE FROM interview_coach_answers;
    DELETE FROM interview_coach_questions;
    DELETE FROM interview_coach_context;
    DELETE FROM interview_coach_sessions;
    DELETE FROM practice_sessions;
  `);
}

export function wipeHistory() {
  db.exec(`DELETE FROM qa_history; DELETE FROM coding_history; DELETE FROM mock_interview_results;`);
}

export function wipeResume() {
  // Tailored results embed resume-derived content, so a resume wipe clears those too.
  db.exec(`DELETE FROM resume_context; DELETE FROM resume_tailoring_results;`);
}

export interface CodingHistoryRow {
  id: number;
  question: string;
  language: string;
  code: string;
  explanation_json: string;
  favorited: number;
  tags: string;
  review_count: number;
  next_review_at: string | null;
  created_at: string;
}

export function insertCodingHistory(row: Omit<CodingHistoryRow, "id" | "created_at" | "favorited" | "tags" | "review_count" | "next_review_at">) {
  return db
    .prepare(
      `INSERT INTO coding_history (question, language, code, explanation_json) VALUES (?, ?, ?, ?)`
    )
    .run(row.question, row.language, row.code, row.explanation_json);
}

export function listCodingHistory(): CodingHistoryRow[] {
  return db
    .prepare(`SELECT * FROM coding_history ORDER BY created_at DESC`)
    .all() as unknown as CodingHistoryRow[];
}

export function setCodingFavorite(id: number, favorited: boolean) {
  db.prepare(`UPDATE coding_history SET favorited = ? WHERE id = ?`).run(favorited ? 1 : 0, id);
  if (favorited) {
    db.prepare(
      `UPDATE coding_history SET next_review_at = COALESCE(next_review_at, ?) WHERE id = ?`
    ).run(new Date().toISOString(), id);
  }
}

export function deleteCodingHistory(id: number) {
  db.prepare(`DELETE FROM coding_history WHERE id = ?`).run(id);
}

export function setCodingTags(id: number, tags: string) {
  db.prepare(`UPDATE coding_history SET tags = ? WHERE id = ?`).run(tags, id);
}

export function listDueCodingHistory(): CodingHistoryRow[] {
  return db
    .prepare(
      `SELECT * FROM coding_history WHERE favorited = 1 AND (next_review_at IS NULL OR next_review_at <= ?) ORDER BY next_review_at ASC`
    )
    .all(new Date().toISOString()) as unknown as CodingHistoryRow[];
}

export function recordCodingReview(id: number, remembered: boolean) {
  if (!remembered) {
    db.prepare(`UPDATE coding_history SET review_count = 0, next_review_at = ? WHERE id = ?`).run(
      daysFromNow(REVIEW_INTERVALS_DAYS[0]),
      id
    );
    return;
  }
  const row = db.prepare(`SELECT review_count FROM coding_history WHERE id = ?`).get(id) as
    | { review_count: number }
    | undefined;
  const nextCount = (row?.review_count ?? 0) + 1;
  const interval = REVIEW_INTERVALS_DAYS[Math.min(nextCount, REVIEW_INTERVALS_DAYS.length - 1)];
  db.prepare(`UPDATE coding_history SET review_count = ?, next_review_at = ? WHERE id = ?`).run(
    nextCount,
    daysFromNow(interval),
    id
  );
}

export function getResumeContext(): string | null {
  const row = db.prepare(`SELECT content_encrypted FROM resume_context WHERE id = 1`).get() as
    | { content_encrypted: string | null }
    | undefined;
  if (!row?.content_encrypted) return null;
  return decrypt(row.content_encrypted);
}

export function setResumeContext(content: string): void {
  const encrypted = encrypt(content);
  db.prepare(
    `INSERT INTO resume_context (id, content_encrypted, updated_at) VALUES (1, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET content_encrypted = excluded.content_encrypted, updated_at = excluded.updated_at`
  ).run(encrypted);
}

export interface MeetingNoteRow {
  id: number;
  title: string;
  notes: string;
  action_items: string[];
  created_at: string;
}

export function insertMeetingNote(title: string, notes: string, actionItems: string[]) {
  const encrypted = encrypt(notes);
  db.prepare(
    `INSERT INTO meeting_notes (title, notes_encrypted, action_items_json) VALUES (?, ?, ?)`
  ).run(title, encrypted, JSON.stringify(actionItems));
}

export function listMeetingNotes(): MeetingNoteRow[] {
  const rows = db.prepare(`SELECT * FROM meeting_notes ORDER BY created_at DESC`).all() as unknown as Array<{
    id: number;
    title: string;
    notes_encrypted: string;
    action_items_json: string;
    created_at: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    notes: decrypt(r.notes_encrypted),
    action_items: JSON.parse(r.action_items_json),
    created_at: r.created_at,
  }));
}

export function deleteMeetingNote(id: number) {
  db.prepare(`DELETE FROM meeting_notes WHERE id = ?`).run(id);
}

export interface MockInterviewResultRow {
  id: number;
  role: string;
  categories: string;
  question: string;
  user_answer: string;
  score_raw: string;
  score_num: number | null;
  created_at: string;
}

export function insertMockInterviewResult(
  row: Omit<MockInterviewResultRow, "id" | "created_at">
): void {
  db.prepare(
    `INSERT INTO mock_interview_results (role, categories, question, user_answer, score_raw, score_num) VALUES (?, ?, ?, ?, ?, ?)`
  ).run(row.role, row.categories, row.question, row.user_answer, row.score_raw, row.score_num);
}

export function listMockInterviewResults(): MockInterviewResultRow[] {
  return db
    .prepare(`SELECT * FROM mock_interview_results ORDER BY created_at DESC`)
    .all() as unknown as MockInterviewResultRow[];
}

export interface ResumeTailoringRow {
  id: number;
  job_title: string;
  job_description: string;
  result: string;
  created_at: string;
}

export function insertResumeTailoring(row: { job_title: string; job_description: string; result: string }): void {
  db.prepare(
    `INSERT INTO resume_tailoring_results (job_title, job_description_encrypted, result_encrypted) VALUES (?, ?, ?)`
  ).run(row.job_title, encrypt(row.job_description), encrypt(row.result));
}

export function listResumeTailoring(): ResumeTailoringRow[] {
  const rows = db
    .prepare(`SELECT * FROM resume_tailoring_results ORDER BY created_at DESC`)
    .all() as unknown as Array<{
    id: number;
    job_title: string;
    job_description_encrypted: string;
    result_encrypted: string;
    created_at: string;
  }>;
  return rows.map((r) => ({
    id: r.id,
    job_title: r.job_title,
    job_description: decrypt(r.job_description_encrypted),
    result: decrypt(r.result_encrypted),
    created_at: r.created_at,
  }));
}

export function deleteResumeTailoringRow(id: number) {
  db.prepare(`DELETE FROM resume_tailoring_results WHERE id = ?`).run(id);
}

// No payment provider is wired up yet — this just persists which tier the UI should preview/gate against.
export type Plan = "free" | "pro";

export function getPlan(): Plan {
  return (getSetting("plan") as Plan | undefined) ?? "free";
}

export function setPlan(plan: Plan): void {
  setSetting("plan", plan);
}

// ---------------------------------------------------------------------------
// Interview Coach — sessions, cached analysis, questions, answers, feedback.
// Job descriptions, resume text, answers, feedback, and the derived analysis are all
// encrypted at rest (they embed resume content); skill/note text fields are plain.
// ---------------------------------------------------------------------------

export interface CoachSessionRow {
  id: number;
  job_title: string;
  company: string;
  interview_type: string;
  experience_level: string;
  preferred_language: string;
  role_profile: string;
  interview_format: string;
  status: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CoachSessionStats extends CoachSessionRow {
  question_count: number;
  answer_count: number;
}

export interface CoachContextRow {
  sessionId: number;
  jobDescription: string;
  resume: string | null;
  analysis: InterviewCoachContext | null;
  requiredSkills: string;
  preferredSkills: string;
  responsibilities: string;
  techStack: string;
  notes: string;
}

export interface CoachQuestionRow {
  id: number;
  question: string;
  source: string;
  created_at: string;
}

export interface CoachQaRow {
  questionId: number;
  answerId: number | null;
  question: string;
  source: string;
  answer: string | null;
  feedback: CoachFeedback | null;
  created_at: string;
}

export interface CoachSessionBundle {
  session: CoachSessionRow;
  context: CoachContextRow | null;
  qa: CoachQaRow[];
}

export function createCoachSession(input: {
  jobTitle: string;
  company: string;
  interviewType: string;
  experienceLevel: string;
  preferredLanguage: string;
  roleProfile: string;
  interviewFormat: string;
  jobDescription: string;
  resume: string | null;
  requiredSkills: string;
  preferredSkills: string;
  responsibilities: string;
  techStack: string;
  notes: string;
}): number {
  const result = db
    .prepare(
      `INSERT INTO interview_coach_sessions (job_title, company, interview_type, experience_level, preferred_language, role_profile, interview_format, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'setup')`
    )
    .run(
      input.jobTitle,
      input.company,
      input.interviewType,
      input.experienceLevel,
      input.preferredLanguage,
      input.roleProfile,
      input.interviewFormat
    );
  const sessionId = Number(result.lastInsertRowid);
  db.prepare(
    `INSERT INTO interview_coach_context
       (session_id, job_description_encrypted, resume_encrypted, required_skills, preferred_skills, responsibilities, tech_stack, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    sessionId,
    encrypt(input.jobDescription),
    input.resume ? encrypt(input.resume) : null,
    input.requiredSkills,
    input.preferredSkills,
    input.responsibilities,
    input.techStack,
    input.notes
  );
  return sessionId;
}

function mapCoachSessionRow(row: Record<string, unknown>): CoachSessionRow {
  return {
    id: Number(row.id),
    job_title: String(row.job_title ?? ""),
    company: String(row.company ?? ""),
    interview_type: String(row.interview_type ?? "mixed"),
    experience_level: String(row.experience_level ?? ""),
    preferred_language: String(row.preferred_language ?? "auto"),
    role_profile: String(row.role_profile ?? "general"),
    interview_format: String(row.interview_format ?? "human"),
    status: String(row.status ?? "setup"),
    completed_at: row.completed_at ? String(row.completed_at) : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  };
}

export function getCoachSession(id: number): CoachSessionRow | null {
  const row = db.prepare(`SELECT * FROM interview_coach_sessions WHERE id = ?`).get(id) as
    | Record<string, unknown>
    | undefined;
  return row ? mapCoachSessionRow(row) : null;
}

// The most recently touched session — reopening the page resumes where the user left off.
export function getLatestCoachSession(): CoachSessionRow | null {
  const row = db.prepare(`SELECT * FROM interview_coach_sessions ORDER BY updated_at DESC, id DESC LIMIT 1`).get() as
    | Record<string, unknown>
    | undefined;
  return row ? mapCoachSessionRow(row) : null;
}

export function listCoachSessions(): CoachSessionRow[] {
  return (
    db.prepare(`SELECT * FROM interview_coach_sessions ORDER BY updated_at DESC`).all() as unknown as Array<
      Record<string, unknown>
    >
  ).map(mapCoachSessionRow);
}

export function touchCoachSession(id: number): void {
  db.prepare(`UPDATE interview_coach_sessions SET updated_at = datetime('now') WHERE id = ?`).run(id);
}

export function updateCoachSessionStatus(id: number, status: string): void {
  db.prepare(`UPDATE interview_coach_sessions SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(
    status,
    id
  );
}

export function deleteCoachSession(id: number): void {
  // Children are removed explicitly (SQLite foreign keys are off by default here).
  db.prepare(
    `DELETE FROM interview_coach_feedback WHERE answer_id IN
       (SELECT a.id FROM interview_coach_answers a WHERE a.session_id = ?)`
  ).run(id);
  db.prepare(`DELETE FROM interview_coach_answers WHERE session_id = ?`).run(id);
  db.prepare(`DELETE FROM interview_coach_questions WHERE session_id = ?`).run(id);
  db.prepare(`DELETE FROM interview_coach_context WHERE session_id = ?`).run(id);
  db.prepare(`DELETE FROM interview_coach_sessions WHERE id = ?`).run(id);
}

export function saveCoachContext(
  sessionId: number,
  patch: { jobDescription?: string; resume?: string | null; analysis?: InterviewCoachContext | null }
): void {
  const sets: string[] = [];
  const values: Array<string | number | null> = [];
  if (patch.jobDescription !== undefined) {
    sets.push("job_description_encrypted = ?");
    values.push(encrypt(patch.jobDescription));
  }
  if (patch.resume !== undefined) {
    sets.push("resume_encrypted = ?");
    values.push(patch.resume ? encrypt(patch.resume) : null);
  }
  if (patch.analysis !== undefined) {
    sets.push("analysis_encrypted = ?");
    values.push(encrypt(JSON.stringify(patch.analysis)));
  }
  if (sets.length === 0) return;
  values.push(sessionId);
  const stmt = db.prepare(`UPDATE interview_coach_context SET ${sets.join(", ")} WHERE session_id = ?`);
  stmt.run(...(values as unknown as Parameters<typeof stmt.run>));
}

export function getCoachContext(sessionId: number): CoachContextRow | null {
  const row = db.prepare(`SELECT * FROM interview_coach_context WHERE session_id = ?`).get(sessionId) as
    | Record<string, unknown>
    | undefined;
  if (!row) return null;
  const analysisRaw = row.analysis_encrypted ? safeDecrypt(String(row.analysis_encrypted)) : null;
  return {
    sessionId,
    jobDescription: safeDecrypt(String(row.job_description_encrypted ?? "")),
    resume: row.resume_encrypted ? safeDecrypt(String(row.resume_encrypted)) : null,
    analysis: analysisRaw ? (JSON.parse(analysisRaw) as InterviewCoachContext) : null,
    requiredSkills: String(row.required_skills ?? ""),
    preferredSkills: String(row.preferred_skills ?? ""),
    responsibilities: String(row.responsibilities ?? ""),
    techStack: String(row.tech_stack ?? ""),
    notes: String(row.notes ?? ""),
  };
}

// A context row written before the encryption fallback existed (or from another machine)
// shouldn't crash the whole page — degrade to empty content like getApiKey does.
function safeDecrypt(payload: string): string {
  try {
    return decrypt(payload);
  } catch {
    return "";
  }
}

export function addCoachQuestion(sessionId: number, question: string, source: "ai" | "user"): number {
  const result = db
    .prepare(`INSERT INTO interview_coach_questions (session_id, question, source) VALUES (?, ?, ?)`)
    .run(sessionId, question, source);
  touchCoachSession(sessionId);
  return Number(result.lastInsertRowid);
}

export function listCoachQuestions(sessionId: number): CoachQuestionRow[] {
  return db
    .prepare(`SELECT * FROM interview_coach_questions WHERE session_id = ? ORDER BY id ASC`)
    .all(sessionId) as unknown as CoachQuestionRow[];
}

export function addCoachAnswer(sessionId: number, questionId: number, answer: string): number {
  const result = db
    .prepare(`INSERT INTO interview_coach_answers (session_id, question_id, answer_encrypted) VALUES (?, ?, ?)`)
    .run(sessionId, questionId, encrypt(answer));
  touchCoachSession(sessionId);
  return Number(result.lastInsertRowid);
}

export function saveCoachFeedback(sessionId: number, answerId: number, feedback: CoachFeedback): void {
  db.prepare(`INSERT INTO interview_coach_feedback (answer_id, feedback_encrypted) VALUES (?, ?)`).run(
    answerId,
    encrypt(JSON.stringify(feedback))
  );
  touchCoachSession(sessionId);
}

// Full Q/A/feedback trail for a session, in asked order — the renderer's session history
// and the session-memory builder both read from this.
export function getCoachQa(sessionId: number): CoachQaRow[] {
  const rows = db
    .prepare(
      `SELECT q.id AS q_id, q.question, q.source, q.created_at AS q_created,
              a.id AS a_id, a.answer_encrypted,
              f.feedback_encrypted
       FROM interview_coach_questions q
       LEFT JOIN interview_coach_answers a ON a.question_id = q.id
       LEFT JOIN interview_coach_feedback f ON f.answer_id = a.id
       WHERE q.session_id = ?
       ORDER BY q.id ASC`
    )
    .all(sessionId) as unknown as Array<Record<string, unknown>>;
  return rows.map((r) => ({
    questionId: Number(r.q_id),
    answerId: r.a_id !== null && r.a_id !== undefined ? Number(r.a_id) : null,
    question: String(r.question ?? ""),
    source: String(r.source ?? "ai"),
    answer: r.answer_encrypted ? safeDecrypt(String(r.answer_encrypted)) : null,
    feedback: r.feedback_encrypted ? (JSON.parse(safeDecrypt(String(r.feedback_encrypted))) as CoachFeedback) : null,
    created_at: String(r.q_created ?? ""),
  }));
}

export function getCoachSessionBundle(sessionId: number): CoachSessionBundle | null {
  const session = getCoachSession(sessionId);
  if (!session) return null;
  return {
    session,
    context: getCoachContext(sessionId),
    qa: getCoachQa(sessionId),
  };
}

// History rows: every session with its question and answer counts, newest first.
// DISTINCT counts because the two left joins would otherwise cross-multiply.
// Powers the Interview History table (date, format, duration, questions, responses, status).
export function listCoachSessionStats(): CoachSessionStats[] {
  const rows = db
    .prepare(
      `SELECT s.*,
              COUNT(DISTINCT q.id) AS question_count,
              COUNT(DISTINCT a.id) AS answer_count
       FROM interview_coach_sessions s
       LEFT JOIN interview_coach_questions q ON q.session_id = s.id
       LEFT JOIN interview_coach_answers a ON a.session_id = s.id
       GROUP BY s.id
       ORDER BY s.updated_at DESC, s.id DESC`
    )
    .all() as unknown as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    ...mapCoachSessionRow(row),
    question_count: Number(row.question_count ?? 0),
    answer_count: Number(row.answer_count ?? 0),
  }));
}

// Marks a session completed (explicit end-of-interview action) and stamps the time.
export function completeCoachSession(sessionId: number): void {
  db.prepare(
    `UPDATE interview_coach_sessions SET status = 'completed', completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
  ).run(sessionId);
}

// Marks a session cancelled — an abandoned/mis-started interview that stays in history
// (with its partial record) instead of being silently deleted.
export function cancelCoachSession(sessionId: number): void {
  db.prepare(
    `UPDATE interview_coach_sessions SET status = 'cancelled', completed_at = datetime('now'), updated_at = datetime('now') WHERE id = ?`
  ).run(sessionId);
}

// ---------------------------------------------------------------------------
// Practice Sessions (Multi-tab interview practice session persistence)
// ---------------------------------------------------------------------------

export interface PracticeSessionRow {
  id: string;
  title: string;
  depth: string;
  draft_text: string;
  turns_json: string;
  resume_text?: string;
  job_title?: string;
  company?: string;
  job_description?: string;
  required_skills?: string;
  tech_stack?: string;
  experience_level?: string;
  context_analysis_json?: string;
  created_at: string;
  updated_at: string;
}

export function listPracticeSessions(): PracticeSessionRow[] {
  return db
    .prepare(`SELECT * FROM practice_sessions ORDER BY updated_at DESC`)
    .all() as unknown as PracticeSessionRow[];
}

export function getPracticeSession(id: string): PracticeSessionRow | null {
  const row = db.prepare(`SELECT * FROM practice_sessions WHERE id = ?`).get(id) as
    | PracticeSessionRow
    | undefined;
  return row ?? null;
}

export function savePracticeSession(session: {
  id: string;
  title: string;
  depth: string;
  draft_text: string;
  turns_json: string;
  resume_text?: string;
  job_title?: string;
  company?: string;
  job_description?: string;
  required_skills?: string;
  tech_stack?: string;
  experience_level?: string;
  context_analysis_json?: string;
}): void {
  db.prepare(
    `INSERT INTO practice_sessions (
       id, title, depth, draft_text, turns_json,
       resume_text, job_title, company, job_description,
       required_skills, tech_stack, experience_level, context_analysis_json,
       updated_at
     )
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(id) DO UPDATE SET
       title = excluded.title,
       depth = excluded.depth,
       draft_text = excluded.draft_text,
       turns_json = excluded.turns_json,
       resume_text = excluded.resume_text,
       job_title = excluded.job_title,
       company = excluded.company,
       job_description = excluded.job_description,
       required_skills = excluded.required_skills,
       tech_stack = excluded.tech_stack,
       experience_level = excluded.experience_level,
       context_analysis_json = excluded.context_analysis_json,
       updated_at = datetime('now')`
  ).run(
    session.id,
    session.title,
    session.depth,
    session.draft_text,
    session.turns_json,
    session.resume_text ?? "",
    session.job_title ?? "",
    session.company ?? "",
    session.job_description ?? "",
    session.required_skills ?? "",
    session.tech_stack ?? "",
    session.experience_level ?? "",
    session.context_analysis_json ?? ""
  );
}

export function deletePracticeSession(id: string): void {
  db.prepare(`DELETE FROM practice_sessions WHERE id = ?`).run(id);
}

export function renamePracticeSession(id: string, title: string): void {
  db.prepare(
    `UPDATE practice_sessions SET title = ?, updated_at = datetime('now') WHERE id = ?`
  ).run(title, id);
}

export function getActivePracticeSessionId(): string | null {
  return getSetting("active_practice_session_id") ?? null;
}

export function setActivePracticeSessionId(id: string): void {
  setSetting("active_practice_session_id", id);
}

