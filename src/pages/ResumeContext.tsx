import { useEffect, useState } from "react";

export default function ResumeContext() {
  const [content, setContent] = useState("");
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    window.api.resume.get().then((stored) => {
      if (stored) setContent(stored);
      setLoading(false);
    });
  }, []);

  async function save() {
    await window.api.resume.set(content);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="page max-w-3xl">
      <h1 className="page-title mb-2">Resume Context</h1>
      <p className="text-[13.5px] leading-relaxed text-muted mb-6">
        Your background, used only where directly relevant when answering Practice questions. Never
        used to invent experience you didn't provide. Encrypted at rest.
      </p>

      {!loading && (
        <textarea
          className="textarea"
          rows={16}
          placeholder="Paste your resume, skills, and relevant background here…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
        />
      )}

      <div className="flex items-center gap-3 mt-3">
        <button
          onClick={save}
          disabled={loading}
          className="btn-primary"
        >
          Save
        </button>
        {saved && <span className="text-xs text-accent">Saved</span>}
      </div>
    </div>
  );
}
