import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import Editor from "@monaco-editor/react";
import type { CodeAnswer } from "../../electron/ai/AIProvider";
import { parseCodeAnswer } from "../lib/parseAnswer";
import { Section, BulletSection } from "../components/AnswerSections";
import { useTheme } from "../lib/useTheme";
import { codeAnswerToMarkdown, markdownToPrintableHtml, slugify } from "../lib/export";
import { usePlan } from "../lib/usePlan";
import { isPro } from "../lib/plan";

const LANGUAGES = ["javascript", "typescript", "python", "java", "c++", "go", "sql", "rust"];

export default function CodingLab() {
  const location = useLocation();
  const plan = usePlan();
  const { isDark } = useTheme();
  const [instruction, setInstruction] = useState(
    () => (location.state as { question?: string } | null)?.question ?? ""
  );
  const [language, setLanguage] = useState("javascript");
  const [existingCode, setExistingCode] = useState("");
  const [streamText, setStreamText] = useState("");
  const [parsed, setParsed] = useState<CodeAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopStream = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => stopStream.current?.();
  }, []);

  function handleSubmit() {
    if (!instruction.trim() || loading) return;
    setLoading(true);
    setError(null);
    setStreamText("");
    setParsed(null);
    stopStream.current?.();

    let full = "";
    stopStream.current = window.api.ai.streamCode(
      instruction,
      language,
      existingCode.trim() || null,
      (chunk) => {
        full += chunk;
        setStreamText(full);
      },
      () => {
        setLoading(false);
        const result = parseCodeAnswer(full, language);
        setParsed(result);
        window.api.coding.insert({
          question: instruction,
          language,
          code: result.code,
          explanation_json: JSON.stringify({ raw: full }),
        });
      },
      (message) => {
        setError(message);
        setLoading(false);
      }
    );
  }

  return (
    <div className="page max-w-3xl">
      <h1 className="page-title">Coding Lab</h1>
      <p className="page-sub">Describe a problem or paste existing code — get a reviewed solution back.</p>

      <textarea
        className="textarea"
        rows={4}
        placeholder="Describe the problem, or paste a coding question…"
        value={instruction}
        onChange={(e) => setInstruction(e.target.value)}
      />

      <div className="mt-3 card overflow-hidden">
        <Editor
          height="160px"
          language={language}
          theme={isDark ? "vs-dark" : "light"}
          value={existingCode}
          onChange={(v) => setExistingCode(v ?? "")}
          options={{ minimap: { enabled: false }, fontSize: 13, padding: { top: 8 } }}
        />
      </div>
      <p className="text-xs text-faint mt-1">
        Existing code to fix/extend (optional)
      </p>

      <div className="flex items-center gap-3 mt-3">
        <select
          className="select w-auto"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
        >
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {l}
            </option>
          ))}
        </select>
        <button
          onClick={handleSubmit}
          disabled={loading || !instruction.trim()}
          className="btn-primary"
        >
          {loading ? "Solving…" : "Solve"}
        </button>
      </div>

      {error && (
        <div className="mt-4 error-box">
          {error}
        </div>
      )}

      {loading && streamText && (
        <pre className="code-block mt-6 animate-rise whitespace-pre-wrap">
          {streamText}
        </pre>
      )}

      {!loading && parsed && (
        <div className="mt-6 space-y-4">
          <div className="flex justify-end gap-2">
            <button
              onClick={() =>
                window.api.export.markdown(codeAnswerToMarkdown(instruction, parsed), `${slugify(instruction)}.md`)
              }
              className="btn-secondary btn-xs"
            >
              Export Markdown
            </button>
            <button
              onClick={() => {
                if (!isPro(plan, "pdf-export")) {
                  alert("PDF export is a Pro feature. Preview it in Settings > Plan.");
                  return;
                }
                window.api.export.pdf(
                  markdownToPrintableHtml(instruction, codeAnswerToMarkdown(instruction, parsed)),
                  `${slugify(instruction)}.pdf`
                );
              }}
              className="btn-secondary btn-xs"
            >
              Export PDF{!isPro(plan, "pdf-export") && " 🔒"}
            </button>
          </div>
          <div className="card overflow-hidden">
            <Editor
              height="240px"
              language={parsed.language}
              theme={isDark ? "vs-dark" : "light"}
              value={parsed.code}
              options={{ readOnly: true, minimap: { enabled: false }, fontSize: 13, padding: { top: 8 } }}
            />
          </div>
          <Section title="Explanation" text={parsed.explanation} />
          <div className="flex gap-8 text-sm">
            <div>
              <span className="text-faint">Time: </span>
              {parsed.timeComplexity || "—"}
            </div>
            <div>
              <span className="text-faint">Space: </span>
              {parsed.spaceComplexity || "—"}
            </div>
          </div>
          <BulletSection title="Edge Cases" items={parsed.edgeCases} />
          <Section title="Alternative Approach" text={parsed.alternativeApproach} />
          <BulletSection title="Common Mistakes" items={parsed.commonMistakes} />
        </div>
      )}
    </div>
  );
}
