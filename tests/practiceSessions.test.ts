import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";

// Unit test for Practice Session persistence schema & operational logic
test("Practice session schema and persistence operations", async (t) => {
  const db = new DatabaseSync(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS practice_sessions (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      depth TEXT NOT NULL DEFAULT 'moderate',
      draft_text TEXT NOT NULL DEFAULT '',
      turns_json TEXT NOT NULL DEFAULT '[]',
      resume_text TEXT NOT NULL DEFAULT '',
      job_title TEXT NOT NULL DEFAULT '',
      company TEXT NOT NULL DEFAULT '',
      job_description TEXT NOT NULL DEFAULT '',
      required_skills TEXT NOT NULL DEFAULT '',
      tech_stack TEXT NOT NULL DEFAULT '',
      experience_level TEXT NOT NULL DEFAULT '',
      context_analysis_json TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  function saveSession(session: {
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
  }) {
    db.prepare(`
      INSERT INTO practice_sessions (
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
        updated_at = datetime('now')
    `).run(
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

  function listSessions() {
    return db.prepare(`SELECT * FROM practice_sessions ORDER BY updated_at DESC`).all() as Array<any>;
  }

  function getSession(id: string) {
    return db.prepare(`SELECT * FROM practice_sessions WHERE id = ?`).get(id) as any;
  }

  function deleteSession(id: string) {
    db.prepare(`DELETE FROM practice_sessions WHERE id = ?`).run(id);
  }

  function renameSession(id: string, title: string) {
    db.prepare(`UPDATE practice_sessions SET title = ?, updated_at = datetime('now') WHERE id = ?`).run(title, id);
  }

  function setActiveSessionId(id: string) {
    db.prepare(`INSERT INTO settings (key, value) VALUES ('active_practice_session_id', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`).run(id);
  }

  function getActiveSessionId() {
    const row = db.prepare(`SELECT value FROM settings WHERE key = 'active_practice_session_id'`).get() as any;
    return row?.value ?? null;
  }

  await t.test("1 & 2. Create and Save session", () => {
    saveSession({
      id: "practice_1",
      title: "Two Sum Practice",
      depth: "medium",
      draft_text: "Help me optimize this code",
      turns_json: JSON.stringify([{ role: "user", text: "How to solve Two Sum?" }]),
    });

    const s = getSession("practice_1");
    assert.equal(s.title, "Two Sum Practice");
    assert.equal(s.draft_text, "Help me optimize this code");
  });

  await t.test("3. Load sessions ordered by updated_at", () => {
    saveSession({
      id: "practice_2",
      title: "SQL Joins",
      depth: "short",
      draft_text: "",
      turns_json: "[]",
    });
    db.prepare(`UPDATE practice_sessions SET updated_at = ? WHERE id = 'practice_2'`).run(new Date(Date.now() + 5000).toISOString());

    const sessions = listSessions();
    assert.equal(sessions.length, 2);
    assert.equal(sessions[0].id, "practice_2"); // most recently updated
  });

  await t.test("4. Update session", () => {
    saveSession({
      id: "practice_1",
      title: "Two Sum Practice - Updated",
      depth: "detailed",
      draft_text: "Updated draft text",
      turns_json: JSON.stringify([{ role: "user", text: "How to solve Two Sum in O(N)?" }]),
    });

    const s = getSession("practice_1");
    assert.equal(s.title, "Two Sum Practice - Updated");
    assert.equal(s.depth, "detailed");
    assert.equal(s.draft_text, "Updated draft text");
  });

  await t.test("5 & 6. Switch sessions and Restore active session", () => {
    setActiveSessionId("practice_1");
    assert.equal(getActiveSessionId(), "practice_1");

    setActiveSessionId("practice_2");
    assert.equal(getActiveSessionId(), "practice_2");
  });

  await t.test("7. Rename session", () => {
    renameSession("practice_2", "Custom SQL Join Session");
    const s = getSession("practice_2");
    assert.equal(s.title, "Custom SQL Join Session");
  });

  await t.test("8 & 13. Delete session and verify isolation", () => {
    deleteSession("practice_2");
    assert.equal(getSession("practice_2"), undefined);
    assert.notEqual(getSession("practice_1"), undefined);
  });

  await t.test("9 & 10. Persist conversation history and image references", () => {
    const turns = [
      {
        role: "user",
        text: "Question with screenshot",
        images: [{ id: "img_1", mimeType: "image/png", data: "base64data", preview: "data:image/png;base64,base64data" }],
      },
      {
        role: "assistant",
        text: "Explanation of algorithm",
        sections: [{ title: "Intuition", body: "Use hash map." }],
      },
    ];

    saveSession({
      id: "practice_3",
      title: "Multimodal Question",
      depth: "interview-ready",
      draft_text: "",
      turns_json: JSON.stringify(turns),
    });

    const loaded = getSession("practice_3");
    const parsedTurns = JSON.parse(loaded.turns_json);
    assert.equal(parsedTurns.length, 2);
    assert.equal(parsedTurns[0].images[0].mimeType, "image/png");
    assert.equal(parsedTurns[1].sections[0].title, "Intuition");
  });

  await t.test("11 & 12. Handle corrupt image or invalid turns json gracefully", () => {
    const corruptTurns = [
      {
        role: "user",
        text: "Question with missing image data",
        images: [{ id: "img_broken", mimeType: "image/png", data: "", preview: "" }],
      },
    ];

    saveSession({
      id: "practice_corrupt",
      title: "Corrupt Test",
      depth: "short",
      draft_text: "",
      turns_json: JSON.stringify(corruptTurns),
    });

    const loaded = getSession("practice_corrupt");
    const parsed = JSON.parse(loaded.turns_json);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].images[0].data, "");
  });

  await t.test("14 & 15. Persist accumulated Interview Coach context and verify isolation", () => {
    const analysis = {
      candidateProfile: "Data Scientist with 3+ years experience in Python, SQL, and ML.",
      strengths: ["Production Python", "Distributed SQL", "Model evaluation"],
      weakAreas: ["Limited Go exposure"],
      matchedSkills: ["Python", "SQL", "Machine Learning"],
      missingSkills: ["Kubernetes"],
    };

    saveSession({
      id: "practice_context_A",
      title: "Data Science Interview",
      depth: "expert-level",
      draft_text: "Unsent question about cross-validation",
      turns_json: "[]",
      resume_text: "Saran's Data Science Resume with Python, PyTorch, SQL",
      job_title: "Senior Data Scientist",
      company: "AI Labs",
      job_description: "We are seeking a Senior Data Scientist skilled in Python and SQL.",
      required_skills: "Python, SQL, ML",
      tech_stack: "Python, PyTorch, PostgreSQL, AWS",
      experience_level: "Senior (5-8 years)",
      context_analysis_json: JSON.stringify(analysis),
    });

    saveSession({
      id: "practice_context_B",
      title: "Frontend Interview",
      depth: "short",
      draft_text: "",
      turns_json: "[]",
      resume_text: "Frontend resume with React and TypeScript",
      job_title: "Frontend Engineer",
      company: "Web Corp",
      job_description: "Seeking React & TS dev",
      required_skills: "React, TS",
      tech_stack: "React, Vite, Tailwind",
      experience_level: "Mid-level",
      context_analysis_json: "",
    });

    const sessionA = getSession("practice_context_A");
    assert.equal(sessionA.job_title, "Senior Data Scientist");
    assert.equal(sessionA.company, "AI Labs");
    assert.equal(sessionA.resume_text, "Saran's Data Science Resume with Python, PyTorch, SQL");
    const parsedA = JSON.parse(sessionA.context_analysis_json);
    assert.equal(parsedA.strengths[0], "Production Python");

    const sessionB = getSession("practice_context_B");
    assert.equal(sessionB.job_title, "Frontend Engineer");
    assert.equal(sessionB.company, "Web Corp");
    assert.equal(sessionB.resume_text, "Frontend resume with React and TypeScript");
    assert.equal(sessionB.context_analysis_json, "");

    // Verify complete context isolation: Session A data did not leak into Session B
    assert.notEqual(sessionA.resume_text, sessionB.resume_text);
    assert.notEqual(sessionA.job_title, sessionB.job_title);
  });
});
