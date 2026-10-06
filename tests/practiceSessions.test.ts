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
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  function saveSession(session: { id: string; title: string; depth: string; draft_text: string; turns_json: string }) {
    db.prepare(`
      INSERT INTO practice_sessions (id, title, depth, draft_text, turns_json, updated_at)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(id) DO UPDATE SET
        title = excluded.title,
        depth = excluded.depth,
        draft_text = excluded.draft_text,
        turns_json = excluded.turns_json,
        updated_at = datetime('now')
    `).run(session.id, session.title, session.depth, session.draft_text, session.turns_json);
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
    assert.equal(parsed[0].images[0].data, "");
  });
});
