CREATE TABLE IF NOT EXISTS qa_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT NOT NULL,
  category TEXT NOT NULL,
  depth TEXT NOT NULL,
  answer_json TEXT NOT NULL,
  favorited INTEGER NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '',
  review_count INTEGER NOT NULL DEFAULT 0,
  next_review_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS coding_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  question TEXT NOT NULL,
  language TEXT NOT NULL,
  code TEXT NOT NULL,
  explanation_json TEXT NOT NULL,
  favorited INTEGER NOT NULL DEFAULT 0,
  tags TEXT NOT NULL DEFAULT '',
  review_count INTEGER NOT NULL DEFAULT 0,
  next_review_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS resume_context (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  content_encrypted TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS meeting_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  notes_encrypted TEXT NOT NULL,
  action_items_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Resources moved to Firebase (Firestore + Storage) for admin/user sharing — see src/lib/firebase.ts.

CREATE TABLE IF NOT EXISTS mock_interview_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL,
  categories TEXT NOT NULL,
  question TEXT NOT NULL,
  user_answer TEXT NOT NULL,
  score_raw TEXT NOT NULL,
  score_num REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS resume_tailoring_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_title TEXT NOT NULL DEFAULT '',
  job_description_encrypted TEXT NOT NULL,
  result_encrypted TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_qa_history_category ON qa_history(category);
CREATE INDEX IF NOT EXISTS idx_qa_history_created ON qa_history(created_at);
CREATE INDEX IF NOT EXISTS idx_coding_history_language ON coding_history(language);

-- Interview Coach (Phase 12): one row per prepared interview. Children reference the
-- session by id; deletes remove children explicitly (foreign_keys pragma stays off).
CREATE TABLE IF NOT EXISTS interview_coach_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_title TEXT NOT NULL DEFAULT '',
  company TEXT NOT NULL DEFAULT '',
  interview_type TEXT NOT NULL DEFAULT 'mixed',
  experience_level TEXT NOT NULL DEFAULT '',
  preferred_language TEXT NOT NULL DEFAULT 'auto',
  role_profile TEXT NOT NULL DEFAULT 'general',
  interview_format TEXT NOT NULL DEFAULT 'human',
  status TEXT NOT NULL DEFAULT 'setup',
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS interview_coach_context (
  session_id INTEGER PRIMARY KEY,
  job_description_encrypted TEXT NOT NULL,
  resume_encrypted TEXT,
  analysis_encrypted TEXT,
  required_skills TEXT NOT NULL DEFAULT '',
  preferred_skills TEXT NOT NULL DEFAULT '',
  responsibilities TEXT NOT NULL DEFAULT '',
  tech_stack TEXT NOT NULL DEFAULT '',
  notes TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS interview_coach_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  question TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'ai',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_coach_questions_session ON interview_coach_questions(session_id);

CREATE TABLE IF NOT EXISTS interview_coach_answers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id INTEGER NOT NULL,
  question_id INTEGER NOT NULL,
  answer_encrypted TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_coach_answers_session ON interview_coach_answers(session_id);

CREATE TABLE IF NOT EXISTS interview_coach_feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  answer_id INTEGER NOT NULL UNIQUE,
  feedback_encrypted TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS practice_sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  depth TEXT NOT NULL DEFAULT 'moderate',
  draft_text TEXT NOT NULL DEFAULT '',
  turns_json TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_practice_sessions_updated ON practice_sessions(updated_at);
