import { useEffect, useRef, useState } from "react";
import type { AnswerDepth, InterviewFeedback, InterviewRoleContext, QuestionCategory } from "../../electron/ai/AIProvider";
import { parseInterviewFeedback } from "../lib/parseAnswer";
import { Section, BulletSection } from "../components/AnswerSections";
import { CATEGORY_LABELS } from "../lib/categoryInfo";
import { usePlan } from "../lib/usePlan";
import { isPro } from "../lib/plan";
import { useDictation, useSpeaker } from "../lib/speech";
import { MicButton, InterimLine } from "../components/MicButton";
import { IconVolume } from "../components/icons";

const DEPTHS: AnswerDepth[] = ["short", "medium", "detailed", "interview-ready", "expert-level"];
const COUNTS = [3, 5, 7, 10, 15];
const HIGH_COUNT_WARNING_THRESHOLD = 10;
const EXPERIENCE_LEVELS = ["Entry-level", "Mid-level", "Senior", "Lead/Staff"];
const DEFAULT_CATEGORIES: QuestionCategory[] = ["technical", "coding"];

interface CompletedItem {
  question: string;
  userAnswer: string;
  feedback: InterviewFeedback;
}

type Stage = "setup" | "question" | "summary";

function parseScoreNumber(raw: string): number | null {
  const match = raw.match(/(\d+(?:\.\d+)?)\s*\/\s*10/);
  return match ? Number(match[1]) : null;
}

export default function MockInterview() {
  const plan = usePlan();
  const [stage, setStage] = useState<Stage>("setup");

  const [role, setRole] = useState("");
  const [skills, setSkills] = useState("");
  const [experience, setExperience] = useState(EXPERIENCE_LEVELS[1]);
  const [jobDescription, setJobDescription] = useState("");
  const [categories, setCategories] = useState<Set<QuestionCategory>>(new Set(DEFAULT_CATEGORIES));
  const [depth, setDepth] = useState<AnswerDepth>("interview-ready");
  const [count, setCount] = useState(5);
  const [resumeContext, setResumeContext] = useState<string | null>(null);

  const [questions, setQuestions] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [streamText, setStreamText] = useState("");
  const [feedback, setFeedback] = useState<InterviewFeedback | null>(null);
  const [completed, setCompleted] = useState<CompletedItem[]>([]);

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
  } = useDictation((text) => setAnswer((prev) => (prev.trim() ? prev.trimEnd() + " " + text : text)));
  const { supported: speakerSupported, speaking, speak, stopSpeaking } = useSpeaker();

  useEffect(() => {
    return () => {
      stopStream.current?.();
      stopDictation();
      stopSpeaking();
    };
  }, []);

  function toggleCategory(c: QuestionCategory) {
    setCategories((prev) => {
      const next = new Set(prev);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });
  }

  function roleContext(): InterviewRoleContext {
    return { role: role.trim(), skills: skills.trim(), experience, jobDescription: jobDescription.trim() };
  }

  async function startInterview() {
    if (!role.trim() || categories.size === 0) return;
    setLoading(true);
    setError(null);
    try {
      const [qs, resume] = await Promise.all([
        window.api.ai.generateInterviewQuestions(Array.from(categories), depth, count, roleContext()),
        window.api.resume.get(),
      ]);
      if (qs.length === 0) throw new Error("No questions came back — try again.");
      setResumeContext(resume);
      setQuestions(qs);
      setCompleted([]);
      setIndex(0);
      setAnswer("");
      setStage("question");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  function submitAnswer() {
    if (!answer.trim() || loading) return;
    setLoading(true);
    setError(null);
    setStreamText("");
    setFeedback(null);
    stopStream.current?.();

    let full = "";
    stopStream.current = window.api.ai.streamInterviewFeedback(
      questions[index],
      depth,
      answer,
      roleContext(),
      resumeContext,
      (chunk) => {
        full += chunk;
        setStreamText(full);
      },
      () => {
        setLoading(false);
        setFeedback(parseInterviewFeedback(full));
      },
      (message) => {
        setError(message);
        setLoading(false);
      }
    );
  }

  function nextQuestion() {
    if (!feedback) return;
    stopDictation();
    stopSpeaking();
    const item: CompletedItem = { question: questions[index], userAnswer: answer, feedback };
    const nextCompleted = [...completed, item];
    setCompleted(nextCompleted);
    window.api.mockInterview.record({
      role: role.trim(),
      categories: Array.from(categories).join(","),
      question: item.question,
      user_answer: item.userAnswer,
      score_raw: feedback.score,
      score_num: parseScoreNumber(feedback.score),
    });
    if (index + 1 < questions.length) {
      setIndex(index + 1);
      setAnswer("");
      setStreamText("");
      setFeedback(null);
    } else {
      setStage("summary");
    }
  }

  function restart() {
    stopDictation();
    stopSpeaking();
    setStage("setup");
    setQuestions([]);
    setCompleted([]);
    setIndex(0);
    setAnswer("");
    setStreamText("");
    setFeedback(null);
    setError(null);
  }

  if (!isPro(plan, "mock-interview")) {
    return (
      <div className="page max-w-2xl">
        <h1 className="page-title mb-2">Mock Interview</h1>
        <div className="warn-box">
          <p className="text-sm text-gold">
            Mock Interview is a Pro feature — role-tailored technical and coding questions, where the AI
            evaluates <em>your</em> typed answers (strengths, improvements, and a model answer for
            comparison), not just generates its own ideal response.
          </p>
          <p className="text-sm text-gold mt-2">
            Preview it in <a href="#/settings" className="underline">Settings &gt; Plan</a>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page max-w-3xl">
      <h1 className="page-title">Mock Interview</h1>
      <p className="page-sub">Role-tailored questions with scored feedback on your answers.</p>

      {error && (
        <div className="mb-4 error-box">
          {error}
        </div>
      )}

      {stage === "setup" && (
        <div className="space-y-4 max-w-md">
          <div>
            <label className="section-label">
              Role you're interviewing for
            </label>
            <input
              className="mt-1 input"
              placeholder="e.g. Frontend Developer, Data Scientist, Backend Engineer…"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            />
          </div>

          <div>
            <label className="section-label">
              Tech stack / skills <span className="normal-case text-faint">(optional)</span>
            </label>
            <input
              className="mt-1 input"
              placeholder="e.g. React, TypeScript, Node.js, PostgreSQL"
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
            />
          </div>

          <div>
            <label className="section-label">
              Experience level
            </label>
            <select
              className="mt-1 input"
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
            >
              {EXPERIENCE_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="section-label">
              Job description <span className="normal-case text-faint">(optional)</span>
            </label>
            <textarea
              className="mt-1 input"
              rows={4}
              placeholder="Paste the job posting to tailor questions to its specific responsibilities and requirements…"
              value={jobDescription}
              onChange={(e) => setJobDescription(e.target.value)}
            />
          </div>

          <div>
            <label className="section-label">
              Question categories
            </label>
            <div className="mt-1 flex flex-wrap gap-2">
              {(Object.keys(CATEGORY_LABELS) as QuestionCategory[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => toggleCategory(c)}
                  className={`chip ${
                    categories.has(c)
                      ? "chip-active"
                      : "chip-idle"
                  }`}
                >
                  {CATEGORY_LABELS[c]}
                </button>
              ))}
            </div>
            <p className="text-xs text-faint mt-1">
              Questions are mixed across whichever you select — technical/coding questions are tailored to
              the role and tech stack above.
            </p>
          </div>

          <div>
            <label className="section-label">Depth</label>
            <select
              className="mt-1 input"
              value={depth}
              onChange={(e) => setDepth(e.target.value as AnswerDepth)}
            >
              {DEPTHS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="section-label">
              Number of questions
            </label>
            <div className="flex gap-2 mt-1">
              {COUNTS.map((c) => (
                <button
                  key={c}
                  onClick={() => setCount(c)}
                  className={`chip ${
                    count === c
                      ? "chip-active"
                      : "chip-idle"
                  }`}
                >
                  {c}
                </button>
              ))}
            </div>
            {count >= HIGH_COUNT_WARNING_THRESHOLD && (
              <p className="text-xs text-gold mt-1">
                {count} questions means {count + 1} separate API calls (1 to generate the questions, plus 1
                per answer you submit) in this session. Free-tier keys often cap requests per minute — if
                you hit a rate/token limit partway through, the app will retry and fall back automatically
                (see Settings &gt; AI Provider), but a lower count avoids it entirely.
              </p>
            )}
          </div>
          <button
            onClick={startInterview}
            disabled={loading || !role.trim() || categories.size === 0}
            className="btn-primary"
          >
            {loading ? "Preparing…" : "Start Interview"}
          </button>
        </div>
      )}

      {stage === "question" && (
        <div className="space-y-4">
          <p className="text-xs text-faint">
            Question {index + 1} of {questions.length}
          </p>
          <div className="card flex items-start justify-between gap-4 p-5">
            <p className="text-sm font-medium">{questions[index]}</p>
            {speakerSupported && (
              <button
                onClick={() => (speaking ? stopSpeaking() : speak(questions[index]))}
                title={speaking ? "Stop reading aloud" : "Read the question aloud"}
                className={`btn-ghost btn-xs shrink-0 ${speaking ? "text-accent" : ""}`}
              >
                <IconVolume size={13} />
                {speaking ? "Stop" : "Listen"}
              </button>
            )}
          </div>

          {!feedback && (
            <>
              <div>
                <textarea
                  className="textarea font-mono"
                  rows={7}
                  placeholder="Type your answer, or dictate it with the mic — write code directly here if it's a coding question…"
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  disabled={loading}
                />
                <InterimLine text={interim} />
              </div>
              <div className="flex items-center gap-2.5">
                <button
                  onClick={submitAnswer}
                  disabled={loading || !answer.trim()}
                  className="btn-primary"
                >
                  {loading ? "Evaluating…" : "Submit Answer"}
                </button>
                {dictationSupported && (
                  <MicButton
                    listening={listening}
                    onClick={() => (listening ? stopDictation() : startDictation())}
                    disabled={loading}
                  />
                )}
                {!dictationSupported && (
                  <span className="text-[11.5px] text-faint">Voice input isn't available in this environment.</span>
                )}
                {dictationError && <span className="text-[11.5px] text-danger">{dictationError}</span>}
              </div>
              {loading && streamText && (
                <pre className="code-block whitespace-pre-wrap">
                  {streamText}
                </pre>
              )}
            </>
          )}

          {feedback && (
            <div className="space-y-4 card p-5">
              <Section title="Score" text={feedback.score} />
              <BulletSection title="Strengths" items={feedback.strengths} />
              <BulletSection title="Improvements" items={feedback.improvements} />
              <Section title="Model Answer" text={feedback.modelAnswer} />
              <button
                onClick={nextQuestion}
                className="btn-primary"
              >
                {index + 1 < questions.length ? "Next Question" : "Finish"}
              </button>
            </div>
          )}
        </div>
      )}

      {stage === "summary" && (
        <div className="space-y-4">
          <p className="text-[13.5px] leading-relaxed text-muted">
            {role} · {experience} · {completed.length} question{completed.length === 1 ? "" : "s"} completed.
          </p>
          {completed.map((item, i) => (
            <details key={i} className="card p-5">
              <summary className="cursor-pointer text-sm font-medium">
                {i + 1}. {item.question}
              </summary>
              <div className="mt-3 space-y-3">
                <Section title="Your Answer" text={item.userAnswer} />
                <Section title="Score" text={item.feedback.score} />
                <BulletSection title="Improvements" items={item.feedback.improvements} />
              </div>
            </details>
          ))}
          <button
            onClick={restart}
            className="btn-primary"
          >
            Start New Interview
          </button>
        </div>
      )}
    </div>
  );
}
