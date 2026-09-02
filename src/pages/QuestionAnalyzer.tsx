import { useState } from "react";
import { useNavigate } from "react-router-dom";
import type { QuestionCategory } from "../../electron/ai/AIProvider";
import { CATEGORY_LABELS, CATEGORY_STRUCTURE_NOTE } from "../lib/categoryInfo";

export default function QuestionAnalyzer() {
  const [question, setQuestion] = useState("");
  const [category, setCategory] = useState<QuestionCategory | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function analyze() {
    if (!question.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const detected = await window.api.ai.classify(question);
      setCategory(detected);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page max-w-2xl">
      <h1 className="page-title mb-2">Question Analyzer</h1>
      <p className="text-[13.5px] leading-relaxed text-muted mb-6">
        Classify a question before deciding how to prepare for it.
      </p>

      <textarea
        className="textarea"
        rows={4}
        placeholder="Paste a question…"
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
      />

      <button
        onClick={analyze}
        disabled={loading || !question.trim()}
        className="mt-3 btn-primary"
      >
        {loading ? "Analyzing…" : "Analyze"}
      </button>

      {error && (
        <div className="mt-4 error-box">
          {error}
        </div>
      )}

      {category && (
        <div className="mt-6 card p-5">
          <div className="section-label">
            Category
          </div>
          <div className="text-lg font-semibold mt-1">{CATEGORY_LABELS[category]}</div>
          <p className="text-sm text-muted mt-2">
            {CATEGORY_STRUCTURE_NOTE[category]}
          </p>
          <button
            onClick={() =>
              navigate(category === "coding" ? "/coding-lab" : "/practice", { state: { question } })
            }
            className="mt-4 text-sm font-medium text-accent hover:underline"
          >
            {category === "coding" ? "Open in Coding Lab →" : "Prepare an answer →"}
          </button>
        </div>
      )}
    </div>
  );
}
