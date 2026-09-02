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
