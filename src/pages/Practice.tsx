import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import type { AnswerDepth, QuestionCategory, StructuredAnswer } from "../../electron/ai/AIProvider";
import { parseStructuredAnswer } from "../lib/parseAnswer";
import { Section, BulletSection } from "../components/AnswerSections";
import { answerToMarkdown, markdownToPrintableHtml, slugify } from "../lib/export";
import { usePlan } from "../lib/usePlan";
import { isPro } from "../lib/plan";
import { useDictation } from "../lib/speech";
import { MicButton, InterimLine } from "../components/MicButton";
import { IconLock, IconSpark } from "../components/icons";

const DEPTHS: AnswerDepth[] = [
  "short",
  "medium",
  "detailed",
  "interview-ready",
  "client-ready",
  "beginner-friendly",
  "expert-level",
];

export default function Practice() {
  const location = useLocation();
  const plan = usePlan();
  const [question, setQuestion] = useState(() => (location.state as { question?: string } | null)?.question ?? "");
  const [depth, setDepth] = useState<AnswerDepth>("medium");
  const [category, setCategory] = useState<QuestionCategory | null>(null);
  const [answer, setAnswer] = useState("");
  const [parsed, setParsed] = useState<StructuredAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stopStream = useRef<(() => void) | null>(null);
  const {
    supported: dictationSupported,
    listening,
    interim,
    error: dictationError,
    start: startDictation,
    stop: stopDictation,
  } = useDictation((text) => setQuestion((prev) => (prev.trim() ? prev.trimEnd() + " " + text : text)));

  useEffect(() => {
    return () => {
      stopStream.current?.();
      stopDictation();
    };
  }, []);

  async function handleSubmit() {
    if (!question.trim() || loading) return;
    setLoading(true);
    setError(null);
    setAnswer("");
    setParsed(null);
    stopStream.current?.();

    try {
      const detected = await window.api.ai.classify(question);
      setCategory(detected);
      const resumeContext = await window.api.resume.get();

      let full = "";
      stopStream.current = window.api.ai.streamAnswer(
        question,
        detected,
        depth,
        resumeContext,
        (chunk) => {
          full += chunk;
          setAnswer(full);
        },
        () => {
          setLoading(false);
          setParsed(parseStructuredAnswer(full));
          window.api.qa.insert({
            question,
            category: detected,
            depth,
            answer_json: JSON.stringify({ raw: full }),
          });
        },
        (message) => {
          setError(message);
          setLoading(false);
        }
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setLoading(false);
    }
  }

  return (
    <div className="page max-w-3xl">
      <h1 className="page-title">Practice</h1>
      <p className="page-sub">
        Paste a question — you'll get a structured answer, the reasoning behind it, and follow-ups to expect.
      </p>

      <div className="card mt-6 p-5">
        <textarea
          className="textarea"
          rows={4}
          placeholder="Technical, behavioral, client, or project question…"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSubmit();
          }}
        />
        <InterimLine text={interim} />

        <div className="mt-3.5 flex items-center gap-3">
          <select
            className="select w-auto"
            value={depth}
            onChange={(e) => setDepth(e.target.value as AnswerDepth)}
          >
            {DEPTHS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <button onClick={handleSubmit} disabled={loading || !question.trim()} className="btn-primary">
            {loading ? (
              <>
                <IconSpark size={14} className="animate-spin" /> Thinking…
              </>
            ) : (
              "Get answer"
            )}
          </button>
          {dictationSupported && (
            <MicButton
              compact
              listening={listening}
              onClick={() => (listening ? stopDictation() : startDictation())}
              disabled={loading}
            />
          )}
          {!category && (
            <span className="hidden text-[11px] text-faint lg:inline">Ctrl + Enter to submit</span>
          )}
          {category && <span className="badge-teal ml-auto capitalize">{category}</span>}
        </div>
        {dictationError && <p className="mt-2 text-[11.5px] text-danger">{dictationError}</p>}
      </div>

      {error && <div className="error-box mt-5">{error}</div>}

      {loading && answer && (
        <pre className="code-block mt-6 animate-rise whitespace-pre-wrap">{answer}</pre>
      )}

      {!loading && parsed && (
        <div className="card animate-rise mt-6 p-5">
          <div className="-mb-1 flex justify-end gap-2">
            <button
              onClick={() =>
                window.api.export.markdown(
                  answerToMarkdown(question, category ?? "general", depth, parsed),
                  `${slugify(question)}.md`
                )
              }
              className="btn-ghost btn-xs"
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
                  markdownToPrintableHtml(question, answerToMarkdown(question, category ?? "general", depth, parsed)),
                  `${slugify(question)}.pdf`
                );
              }}
              className="btn-ghost btn-xs"
            >
              Export PDF
              {!isPro(plan, "pdf-export") && <IconLock size={11} />}
            </button>
          </div>
          <div className="mt-3 space-y-4">
            <Section title="Answer" text={parsed.answer} />
            <Section title="Why" text={parsed.why} />
            <Section title="Example" text={parsed.example} />
            <BulletSection title="Key Points" items={parsed.keyPoints} />
            <BulletSection title="Follow-up" items={parsed.followUp} />
          </div>
        </div>
      )}
    </div>
  );
}
