import { DatabaseSync } from "node:sqlite";
import { app } from "electron";
import { join } from "node:path";
import schema from "./schema.sql?raw";
import { encrypt, decrypt } from "../security/crypto";

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

export type AIProviderName = "gemini" | "openai" | "anthropic" | "local";

export function getApiKey(provider: AIProviderName): string | null {
  const stored = getSetting(`${provider}_api_key_encrypted`);
  if (!stored) return null;
  try {
    return decrypt(stored);
  } catch {
    return null;
  }
}

export function setApiKey(provider: AIProviderName, key: string): void {
  setSetting(`${provider}_api_key_encrypted`, encrypt(key));
}

export function clearApiKey(provider: AIProviderName): void {
  db.prepare(`DELETE FROM settings WHERE key = ?`).run(`${provider}_api_key_encrypted`);
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
