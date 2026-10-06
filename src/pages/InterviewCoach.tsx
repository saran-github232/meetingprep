import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { InterviewCoachContext, CoachFeedback, CoachSpeed } from "../../electron/ai/interviewCoach";
import {
  appendTranscriptSegment,
  COACH_INTERVIEW_TYPES,
  parseCoachFeedback,
  parsePartialCoachFeedback,
  setupWarnings,
  validateCoachSetup,
  type CoachInterviewType,
  type CoachResponseLength,
  type CoachSetup,
  type CoachVisualState,
} from "../../electron/ai/interviewCoach";
import type { CoachQaRow, CoachSessionBundle, CoachSessionRow } from "../../electron/db/db";
import { Section, BulletSection } from "../components/AnswerSections";
import CoachOrb from "../components/CoachOrb";
import { MicButton, InterimLine } from "../components/MicButton";
import { IconCheck, IconFile, IconPlus, IconVolume } from "../components/icons";
import { useDictation, useSpeaker } from "../lib/speech";
import { EXPERIENCE_LEVELS, PREP_SETTING_KEYS } from "../lib/interview";

type Stage = "boot" | "setup" | "analyzing" | "studio";

const ANALYSIS_STEPS = [
  "Analyzing resume...",
  "Analyzing job description...",
  "Matching experience...",
  "Preparing interview context...",
];
const ANALYSIS_STEP_MS = 3500;

const SPEEDS: { id: CoachSpeed; label: string; note: string }[] = [
  { id: "fast", label: "Fast", note: "compact prompts, low-latency models" },
  { id: "balanced", label: "Balanced", note: "more context, still quick" },
  { id: "quality", label: "Quality", note: "fullest analysis and answers" },
];

const LENGTHS: { id: CoachResponseLength; label: string }[] = [
  { id: "short", label: "Concise" },
  { id: "medium", label: "Balanced" },
  { id: "detailed", label: "Detailed" },
];

const EMPTY_SETUP: CoachSetup = {
  jobTitle: "",
  company: "",
  jobDescription: "",
  requiredSkills: "",
  preferredSkills: "",
  experienceLevel: EXPERIENCE_LEVELS[1],
  responsibilities: "",
  techStack: "",
  interviewType: "mixed",
  notes: "",
};

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} className={`chip ${active ? "chip-active" : "chip-idle"}`}>
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Setup wizard
// ---------------------------------------------------------------------------

function SetupStage({
  setup,
  setSetup,
  savedResume,
  responseStyle,
  setResponseStyle,
  onContinue,
  busy,
  error,
  pastSessions,
  onDeleteSession,
  onResumeSession,
}: {
  setup: CoachSetup;
  setSetup: (patch: Partial<CoachSetup>) => void;
  savedResume: string | null;
  responseStyle: CoachResponseLength;
  setResponseStyle: (style: CoachResponseLength) => void;
  onContinue: (resume: string | null) => void;
  busy: boolean;
  error: string | null;
  pastSessions: CoachSessionRow[];
  onDeleteSession: (id: number) => void;
  onResumeSession: (id: number) => void;
}) {
  const [step, setStep] = useState(0);
  const [resumeMode, setResumeMode] = useState<"saved" | "paste" | "none">(savedResume ? "saved" : "none");
  const [pastedResume, setPastedResume] = useState("");
  const [importing, setImporting] = useState(false);

  const problems = validateCoachSetup(setup);
  const chosenResume = resumeMode === "saved" ? savedResume : resumeMode === "paste" ? pastedResume : null;
  const warnings = setupWarnings(setup, chosenResume);

  async function importPdf() {
    setImporting(true);
    try {
      const imported = await window.api.resume.importPdf();
      if (imported?.text) {
        setPastedResume(imported.text);
        setResumeMode("paste");
      }
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div className="flex items-center gap-2 text-[12px] font-medium text-faint">
        {["Resume", "Job", "Session"].map((label, i) => (
          <span key={label} className="flex items-center gap-2">
            <span
              className={`flex h-5.5 w-5.5 items-center justify-center rounded-full text-[11px] ${
                i === step
                  ? "bg-accent text-accent-fg"
                  : i < step
                    ? "bg-accent/15 text-accent"
                    : "bg-fg/[0.07] text-faint"
              }`}
              style={{ height: 22, width: 22 }}
            >
              {i < step ? <IconCheck size={11} /> : i + 1}
            </span>
            <span className={i === step ? "text-fg" : ""}>{label}</span>
            {i < 2 && <span className="mx-1 text-faint/50">·</span>}
          </span>
        ))}
      </div>

      {error && <div className="error-box">{error}</div>}

      {step === 0 && (
        <div className="card space-y-4 p-5">
          <div>
            <h2 className="text-[15px] font-semibold">Your resume</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-muted">
              The coach grounds every suggested answer in your real background — it never invents
              experience. Import a PDF, paste the text, or reuse what you saved in Resume Context.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Chip active={resumeMode === "saved"} onClick={() => setResumeMode("saved")}>
              Use saved Resume Context
            </Chip>
            <Chip active={resumeMode === "paste"} onClick={() => setResumeMode("paste")}>
              Paste or import PDF
            </Chip>
            <Chip active={resumeMode === "none"} onClick={() => setResumeMode("none")}>
              Skip for now
            </Chip>
          </div>
          {resumeMode === "saved" && (
            <p className="ok-text flex items-center gap-1.5 text-[13px]">
              <IconFile size={14} />
              {savedResume
                ? `Using your saved Resume Context (${savedResume.length.toLocaleString()} characters). It stays encrypted on this device.`
                : "No saved Resume Context found — paste one instead or skip."}
            </p>
          )}
          {resumeMode === "paste" && (
            <div className="space-y-2">
              <button onClick={importPdf} disabled={importing} className="btn-secondary btn-xs">
                {importing ? "Extracting…" : "Import resume PDF"}
              </button>
              <textarea
                className="textarea"
                rows={8}
                placeholder="Paste your resume text here…"
                value={pastedResume}
                onChange={(e) => setPastedResume(e.target.value)}
              />
              <p className="text-[11.5px] text-faint">
                Extracted locally — the file itself is never uploaded anywhere.
              </p>
            </div>
          )}
          {resumeMode === "none" && (
            <p className="warn-box text-[13px]">
              Without a resume, suggested answers will be generic and Resume Evidence stays empty.
            </p>
          )}
          <div className="flex justify-end">
            <button onClick={() => setStep(1)} className="btn-primary">
              Next: Job
            </button>
          </div>
        </div>
      )}

      {step === 1 && (
        <div className="card space-y-4 p-5">
          <div>
            <h2 className="text-[15px] font-semibold">Job information</h2>
            <p className="mt-1 text-[13px] text-muted">Paste the actual posting — the more specific, the better the prep.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label" htmlFor="coach-title">Job title</label>
              <input
                id="coach-title"
                className="input"
                placeholder="e.g. Backend Engineer"
                value={setup.jobTitle}
                onChange={(e) => setSetup({ jobTitle: e.target.value })}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="coach-company">Company</label>
              <input
                id="coach-company"
                className="input"
                placeholder="e.g. Acme Corp"
                value={setup.company}
                onChange={(e) => setSetup({ company: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="field-label" htmlFor="coach-jd">Job description</label>
            <textarea
              id="coach-jd"
              className="textarea"
              rows={8}
              placeholder="Paste the full job posting here…"
              value={setup.jobDescription}
              onChange={(e) => setSetup({ jobDescription: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label" htmlFor="coach-req">Required skills</label>
              <input
                id="coach-req"
                className="input"
                placeholder="e.g. Python, SQL, AWS"
                value={setup.requiredSkills}
                onChange={(e) => setSetup({ requiredSkills: e.target.value })}
              />
            </div>
            <div>
              <label className="field-label" htmlFor="coach-pref">Preferred skills</label>
              <input
                id="coach-pref"
                className="input"
                placeholder="e.g. Docker, Kafka"
                value={setup.preferredSkills}
                onChange={(e) => setSetup({ preferredSkills: e.target.value })}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label" htmlFor="coach-exp">Experience level</label>
              <select
                id="coach-exp"
                className="input"
                value={setup.experienceLevel}
                onChange={(e) => setSetup({ experienceLevel: e.target.value })}
              >
                {EXPERIENCE_LEVELS.map((lvl) => (
                  <option key={lvl} value={lvl}>{lvl}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="field-label" htmlFor="coach-stack">Tech stack</label>
              <input
                id="coach-stack"
                className="input"
                placeholder="e.g. React, Node, Postgres"
                value={setup.techStack}
                onChange={(e) => setSetup({ techStack: e.target.value })}
              />
            </div>
          </div>
          <div>
            <label className="field-label" htmlFor="coach-resp">Key responsibilities <span className="normal-case text-faint">(optional)</span></label>
            <textarea
              id="coach-resp"
              className="textarea"
              rows={3}
              placeholder="One per line — what the person will actually do…"
              value={setup.responsibilities}
              onChange={(e) => setSetup({ responsibilities: e.target.value })}
            />
          </div>
          <div className="flex justify-between">
            <button onClick={() => setStep(0)} className="btn-ghost">Back</button>
            <button onClick={() => setStep(2)} className="btn-primary">Next: Session</button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="card space-y-4 p-5">
          <div>
            <h2 className="text-[15px] font-semibold">Interview configuration</h2>
            <p className="mt-1 text-[13px] text-muted">What kind of interview are you rehearsing for?</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {COACH_INTERVIEW_TYPES.map((t) => (
              <Chip
                key={t.id}
                active={setup.interviewType === t.id}
                onClick={() => setSetup({ interviewType: t.id })}
              >
                {t.label}
              </Chip>
            ))}
          </div>
          <div>
            <label className="field-label">Response style</label>
            <div className="flex flex-wrap gap-2">
              {LENGTHS.map((l) => (
                <Chip key={l.id} active={responseStyle === l.id} onClick={() => setResponseStyle(l.id)}>
                  {l.label}
                </Chip>
              ))}
            </div>
            <p className="mt-1 text-[11.5px] text-faint">
              How long the coach's suggested answers should be. Changeable anytime in Settings.
            </p>
          </div>
          <div>
            <label className="field-label" htmlFor="coach-notes">Anything else the coach should know <span className="normal-case text-faint">(optional)</span></label>
            <textarea
              id="coach-notes"
              className="textarea"
              rows={3}
              placeholder="e.g. Panel interview, focus on system design; I'm nervous about behavioral questions…"
              value={setup.notes}
              onChange={(e) => setSetup({ notes: e.target.value })}
            />
          </div>

          {problems.length > 0 && (
            <div className="error-box">
              <ul className="list-inside list-disc space-y-1">
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {warnings.map((w) => (
            <p key={w} className="warn-box text-[13px]">{w}</p>
          ))}

          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="btn-ghost">Back</button>
            <button
              onClick={() => onContinue(chosenResume)}
              disabled={busy || problems.length > 0}
              className="btn-primary"
            >
              {busy ? "Preparing…" : "Continue — analyze my readiness"}
            </button>
          </div>
        </div>
      )}

      {pastSessions.length > 0 && (
        <div className="card p-5">
          <h2 className="text-[13px] font-semibold text-muted">Previous sessions</h2>
          <div className="mt-2 divide-y divide-hairline">
            {pastSessions.slice(0, 5).map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 py-2">
                <span className="truncate text-[13px]">
                  {[s.job_title || "Untitled role", s.company].filter(Boolean).join(" · ")}
                  <span className="ml-2 text-[11px] text-faint">{s.updated_at.slice(0, 10)}</span>
                </span>
                <span className="flex shrink-0 gap-1.5">
                  <button onClick={() => onResumeSession(s.id)} className="btn-ghost btn-xs">Resume</button>
                  <button onClick={() => onDeleteSession(s.id)} className="btn-ghost btn-xs text-danger">Delete</button>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Analyzing (Phase 3 progress states)
// ---------------------------------------------------------------------------

function AnalyzingStage({ stepIndex }: { stepIndex: number }) {
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-6 py-10">
      <CoachOrb state="analyzing" className="aspect-square w-72" />
      <ul className="w-full space-y-2" aria-live="polite">
        {ANALYSIS_STEPS.map((label, i) => (
          <li key={label} className="flex items-center gap-2.5 text-[13.5px]">
            {i < stepIndex ? (
              <IconCheck size={15} className="shrink-0 text-accent" />
            ) : i === stepIndex ? (
              <span className="h-2 w-2 shrink-0 animate-pulse-soft rounded-full bg-accent" />
            ) : (
              <span className="h-2 w-2 shrink-0 rounded-full bg-faint/30" />
            )}
            <span className={i <= stepIndex ? "text-fg" : "text-faint"}>{label}</span>
          </li>
        ))}
      </ul>
      <p className="text-center text-[12px] leading-relaxed text-faint">
        The analysis runs once and is cached with the session — questions and feedback reuse it
        without re-reading your resume every time.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Studio (Phases 4/5/6/10/11)
// ---------------------------------------------------------------------------

interface CurrentQuestion {
  id: number;
  question: string;
  source: "ai" | "user";
}

const EMPTY_FEEDBACK: CoachFeedback = {
  suggestedAnswer: "",
  whyItWorks: "",
  keyPoints: [],
  missingPoints: [],
  resumeEvidence: [],
  jobMatch: "",
  followUpQuestions: [],
};

function FeedbackView({ feedback, streaming }: { feedback: CoachFeedback; streaming: boolean }) {
  return (
    <div className="card space-y-4 p-5" aria-live="polite">
      {streaming && !feedback.suggestedAnswer && (
        <p className="flex items-center gap-2 text-[13px] text-muted">
          <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-accent" />
          Generating…
        </p>
      )}
      {feedback.suggestedAnswer && <Section title="Suggested Answer" text={feedback.suggestedAnswer} />}
      {feedback.whyItWorks && <Section title="Why this works" text={feedback.whyItWorks} />}
      {feedback.keyPoints.length > 0 && <BulletSection title="Key Points" items={feedback.keyPoints} />}
      {feedback.missingPoints.length > 0 && (
        <BulletSection title="Missing Points" items={feedback.missingPoints} />
      )}
      {feedback.resumeEvidence.length > 0 && (
        <BulletSection title="Resume Evidence" items={feedback.resumeEvidence} />
      )}
      {feedback.jobMatch && <Section title="Job Match" text={feedback.jobMatch} />}
      {feedback.followUpQuestions.length > 0 && (
        <BulletSection title="Follow-up" items={feedback.followUpQuestions} />
      )}
    </div>
  );
}

function StudioStage({
  bundle,
  speed,
  showLatency,
  voiceEnabled,
  autoListen,
  metrics,
  setMetrics,
  onNewSession,
  onReanalyze,
}: {
  bundle: CoachSessionBundle;
  speed: CoachSpeed;
  showLatency: boolean;
  voiceEnabled: boolean;
  autoListen: boolean;
  metrics: { ttftMs: number; totalMs: number } | null;
  setMetrics: (m: { ttftMs: number; totalMs: number }) => void;
  onNewSession: () => void;
  onReanalyze: () => void;
}) {
  const { session, context } = bundle;
  const answeredIds = useMemo(
    () => new Set(bundle.qa.filter((qa) => qa.answer !== null).map((qa) => qa.questionId)),
    [bundle.qa]
  );
  // Resume where the user left off: the newest question still missing an answer.
  const [current, setCurrent] = useState<CurrentQuestion | null>(() => {
    const pending = [...bundle.qa].reverse().find((qa) => qa.answer === null);
    return pending
      ? { id: pending.questionId, question: pending.question, source: pending.source === "user" ? "user" : "ai" }
      : null;
  });
  const [answer, setAnswer] = useState("");
  const [transcriptLog, setTranscriptLog] = useState<string[]>([]);
  const [streamText, setStreamText] = useState("");
  const [feedback, setFeedback] = useState<CoachFeedback | null>(null);
  const [streaming, setStreaming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ownQuestion, setOwnQuestion] = useState("");
  const stopStream = useRef<(() => void) | null>(null);

  const {
    supported: dictationSupported,
    listening,
    interim,
    error: dictationError,
    start: startDictation,
    stop: stopDictation,
  } = useDictation((text) => {
    setAnswer((prev) => appendTranscriptSegment(prev, text));
    setTranscriptLog((prev) => [...prev.slice(-40), text]);
  });
  const { supported: speakerSupported, speaking, speak, stopSpeaking } = useSpeaker();

  const visualState: CoachVisualState = streaming
    ? "generating"
    : listening
      ? "listening"
      : current
        ? "ready"
        : "idle";

  useEffect(
    () => () => {
      stopStream.current?.();
      stopDictation();
      stopSpeaking();
    },
    [stopDictation, stopSpeaking]
  );

  // Auto transcription: start the mic when a question appears (disclosed practice — same
  // behavior as Mock Interview's interview mode, reusing the shared dictation hook).
  useEffect(() => {
    if (current && !feedback && autoListen && dictationSupported) {
      startDictation();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  // Voice: read the question aloud when it arrives, if enabled in Settings.
  useEffect(() => {
    if (current && voiceEnabled && speakerSupported) {
      speak(current.question);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  async function askNext(source: "ai" | "user", userQuestion?: string) {
    if (busy || streaming) return;
    stopDictation();
    stopSpeaking();
    setBusy(true);
    setError(null);
    try {
      const next = await window.api.coach.nextQuestion(session.id, source, userQuestion);
      setCurrent({ id: next.id, question: next.question, source });
      setAnswer("");
      setTranscriptLog([]);
      setStreamText("");
      setFeedback(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  function submitAnswer() {
    if (!answer.trim() || !current || streaming) return;
    stopDictation();
    stopSpeaking();
    setStreaming(true);
    setError(null);
    setStreamText("");
    setFeedback(null);
    stopStream.current?.();

    let full = "";
    stopStream.current = window.api.coach.streamFeedback(
      session.id,
      current.id,
      current.question,
      answer,
      (chunk) => {
        full += chunk;
        setStreamText(full);
      },
      () => {
        setStreaming(false);
        setFeedback(full.trim() ? parseCoachFeedback(full) : EMPTY_FEEDBACK);
      },
      (message) => {
        setError(message);
        setStreaming(false);
      },
      (m) => setMetrics(m)
    );
  }

  const answeredCount = answeredIds.size;

  return (
    <div className="space-y-5">
      {/* header */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <h1 className="page-title">
            {[session.job_title || "Interview Coach", session.company].filter(Boolean).join(" · ")}
          </h1>
          <p className="page-sub">
            {COACH_INTERVIEW_TYPES.find((t) => t.id === session.interview_type)?.label ?? "Mixed"} interview
            {session.experience_level ? ` · ${session.experience_level}` : ""} · {answeredCount} answered
          </p>
        </div>
        <span className="badge-teal capitalize">{speed} mode</span>
        {showLatency && metrics && (
          <span className="badge border-hairline bg-surface/60 text-faint">
            TTFT {metrics.ttftMs} ms · total {metrics.totalMs} ms
          </span>
        )}
        <button onClick={onReanalyze} disabled={busy || streaming} className="btn-ghost btn-xs">Re-analyze</button>
        <button onClick={onNewSession} disabled={busy || streaming} className="btn-secondary btn-xs">
          New session
        </button>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        {/* main column */}
        <div className="min-w-0 space-y-4">
          {current ? (
            <>
              <div className="card flex items-start justify-between gap-4 p-5">
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">
                    Practice question{current.source === "user" ? " (yours)" : ""}
                  </p>
                  <p className="mt-1.5 text-[14.5px] font-medium leading-relaxed">{current.question}</p>
                </div>
                {speakerSupported && (
                  <button
                    onClick={() => (speaking ? stopSpeaking() : speak(current.question))}
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
                    <label className="field-label" htmlFor="coach-answer">Your answer</label>
                    <textarea
                      id="coach-answer"
                      className="textarea"
                      rows={7}
                      placeholder="Type or dictate your answer — answer as you would in the real interview…"
                      value={answer}
                      onChange={(e) => setAnswer(e.target.value)}
                      disabled={streaming}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submitAnswer();
                      }}
                    />
                    <InterimLine text={interim} />
                    {listening && (
                      <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px] font-medium text-accent">
                        <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-accent" />
                        Listening — finalized phrases are added to your answer automatically.
                      </p>
                    )}
                    {dictationError && <p className="mt-1.5 text-[11.5px] text-danger">{dictationError}</p>}
                    {!dictationSupported && (
                      <p className="mt-1.5 text-[11.5px] text-faint">
                        Voice input isn't available in this environment — type instead.
                      </p>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <button onClick={submitAnswer} disabled={streaming || !answer.trim()} className="btn-primary">
                      {streaming ? "Evaluating…" : "Submit for coaching"}
                    </button>
                    {dictationSupported && (
                      <MicButton
                        listening={listening}
                        onClick={() => (listening ? stopDictation() : startDictation())}
                        disabled={streaming}
                      />
                    )}
                    <span className="text-[11.5px] text-faint">
                      <span className="kbd">Ctrl</span> + <span className="kbd">Enter</span> to submit
                    </span>
                  </div>
                  {streaming && streamText && (
                    <FeedbackView feedback={parsePartialCoachFeedback(streamText)} streaming />
                  )}
                </>
              )}

              {feedback && (
                <>
                  <FeedbackView feedback={feedback} streaming={false} />
                  <div className="flex flex-wrap items-center gap-2.5">
                    <button onClick={() => askNext("ai")} disabled={busy} className="btn-primary">
                      Next question
                    </button>
                    {feedback.followUpQuestions[0] && (
                      <button
                        onClick={() => askNext("user", feedback.followUpQuestions[0])}
                        disabled={busy}
                        className="btn-secondary"
                      >
                        Rehearse the follow-up
                      </button>
                    )}
                  </div>
                </>
              )}
            </>
          ) : (
            <div className="card p-6 text-center">
              <p className="text-[14px] font-medium">Ready to practice</p>
              <p className="mx-auto mt-1 max-w-md text-[13px] leading-relaxed text-muted">
                The coach asks one question at a time, tuned to this job and your background. You can
                also paste in a question you want to rehearse.
              </p>
              <div className="mt-4">
                <button onClick={() => askNext("ai")} disabled={busy} className="btn-primary">
                  {busy ? "Thinking…" : "Get the first question"}
                </button>
              </div>
            </div>
          )}

          {/* ask your own question */}
          <div className="card flex items-center gap-2 p-3.5">
            <input
              className="input"
              placeholder="Or type a question you want to practice…"
              value={ownQuestion}
              onChange={(e) => setOwnQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && ownQuestion.trim()) {
                  askNext("user", ownQuestion.trim());
                  setOwnQuestion("");
                }
              }}
              disabled={busy || streaming}
              aria-label="Type your own practice question"
            />
            <button
              onClick={() => {
                if (ownQuestion.trim()) {
                  askNext("user", ownQuestion.trim());
                  setOwnQuestion("");
                }
              }}
              disabled={busy || streaming || !ownQuestion.trim()}
              className="btn-secondary shrink-0"
            >
              <IconPlus size={14} />
              Add
            </button>
          </div>

          {/* answered history */}
          {answeredCount > 0 && (
            <div className="card p-5">
              <h2 className="text-[13px] font-semibold text-muted">Session history</h2>
              <div className="mt-2 space-y-2">
                {bundle.qa
                  .filter((qa) => qa.answer !== null)
                  .map((qa: CoachQaRow) => (
                    <details key={qa.questionId} className="rounded-xl border border-hairline bg-surface/40 p-3.5">
                      <summary className="cursor-pointer text-[13px] font-medium">{qa.question}</summary>
                      <div className="mt-2.5 space-y-3">
                        <Section title="Your Answer" text={qa.answer ?? ""} />
                        {qa.feedback && (
                          <>
                            <BulletSection title="Key Points" items={qa.feedback.keyPoints} />
                            <BulletSection title="Missing Points" items={qa.feedback.missingPoints} />
                          </>
                        )}
                      </div>
                    </details>
                  ))}
              </div>
            </div>
          )}
        </div>

        {/* side column */}
        <div className="space-y-4">
          <CoachOrb state={visualState} className="aspect-square w-full" />

          {context?.analysis && <AnalysisCard analysis={context.analysis} />}

          {transcriptLog.length > 0 && (
            <div className="card p-4">
              <p className="section-label mb-1.5">Live transcript</p>
              <p className="max-h-40 overflow-y-auto text-[12.5px] leading-relaxed text-muted">
                {transcriptLog.join(" ")}
              </p>
            </div>
          )}

          <p className="px-1 text-[11px] leading-relaxed text-faint">
            Disclosed practice only — the coach rehearses with you, alone. It never listens to a real
            interviewer or feeds answers during a live evaluation.
          </p>
        </div>
      </div>
    </div>
  );
}

function AnalysisCard({ analysis }: { analysis: InterviewCoachContext }) {
  return (
    <div className="card space-y-3.5 p-4">
      {analysis.candidateProfile && (
        <div>
          <p className="section-label mb-1.5">Profile</p>
          <p className="text-[12.5px] leading-relaxed text-muted">{analysis.candidateProfile}</p>
        </div>
      )}
      {analysis.strengths.length > 0 && (
        <div>
          <p className="section-label mb-1.5">Strengths</p>
          <div className="flex flex-wrap gap-1.5">
            {analysis.strengths.slice(0, 6).map((s) => (
              <span key={s} className="badge-teal max-w-full truncate">{s}</span>
            ))}
          </div>
        </div>
      )}
      {analysis.missingSkills.length > 0 && (
        <div>
          <p className="section-label mb-1.5">Missing skills</p>
          <div className="flex flex-wrap gap-1.5">
            {analysis.missingSkills.slice(0, 6).map((s) => (
              <span key={s} className="badge-gold max-w-full truncate">{s}</span>
            ))}
          </div>
        </div>
      )}
      {analysis.weakAreas.length > 0 && (
        <div>
          <p className="section-label mb-1.5">Prepare for</p>
          <ul className="space-y-1 text-[12.5px] leading-relaxed text-muted">
            {analysis.weakAreas.slice(0, 4).map((w) => (
              <li key={w} className="flex gap-1.5">
                <span className="text-faint">·</span>
                <span>{w}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page orchestration
// ---------------------------------------------------------------------------

export default function InterviewCoach() {
  const [stage, setStage] = useState<Stage>("boot");
  const [setup, setSetupState] = useState<CoachSetup>(EMPTY_SETUP);
  const [savedResume, setSavedResume] = useState<string | null>(null);
  const [responseStyle, setResponseStyle] = useState<CoachResponseLength>("medium");
  const [pastSessions, setPastSessions] = useState<CoachSessionRow[]>([]);
  const [bundle, setBundle] = useState<CoachSessionBundle | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysisStep, setAnalysisStep] = useState(0);
  const [speed, setSpeed] = useState<CoachSpeed>("fast");
  const [showLatency, setShowLatency] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [autoListen, setAutoListen] = useState(true);
  const [metrics, setMetrics] = useState<{ ttftMs: number; totalMs: number } | null>(null);
  const analyzingRef = useRef<number | null>(null);

  function setSetup(patch: Partial<CoachSetup>) {
    setSetupState((prev) => ({ ...prev, ...patch }));
  }

  // Boot: load coach preferences, the saved resume (for reuse), and the latest session.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [speedPref, lengthPref, latencyPref, voicePref, listenPref, resume, latest] =
          await Promise.all([
            window.api.settings.get("coach_speed"),
            window.api.settings.get("coach_length"),
            window.api.settings.get("coach_show_latency"),
            window.api.settings.get("coach_voice"),
            window.api.settings.get("coach_autolisten"),
            window.api.resume.get(),
            window.api.coach.latestSession(),
          ]);
        if (cancelled) return;
        if (speedPref === "fast" || speedPref === "balanced" || speedPref === "quality") setSpeed(speedPref);
        if (lengthPref === "short" || lengthPref === "medium" || lengthPref === "detailed") {
          setResponseStyle(lengthPref);
        }
        setShowLatency(latencyPref === "1");
        setVoiceEnabled(voicePref === "1");
        setAutoListen(listenPref !== "0"); // default on
        setSavedResume(resume);

        // Prefill job fields from the Prep Room setup so a prepared user doesn't retype.
        const [prepRole, prepSkills, prepJd] = await Promise.all([
          window.api.settings.get(PREP_SETTING_KEYS.role),
          window.api.settings.get(PREP_SETTING_KEYS.skills),
          window.api.settings.get(PREP_SETTING_KEYS.jobDescription),
        ]);
        if (cancelled) return;
        setSetupState((prev) => ({
          ...prev,
          jobTitle: prev.jobTitle || prepRole || "",
          techStack: prev.techStack || prepSkills || "",
          jobDescription: prev.jobDescription || prepJd || "",
        }));

        const sessions = await window.api.coach.listSessions();
        if (cancelled) return;
        setPastSessions(sessions);
        if (latest && latest.session.status === "ready" && latest.context?.analysis) {
          setBundle(latest);
          setStage("studio");
        } else {
          if (latest) {
            // A session exists but was never analyzed — prefill its fields for editing.
            setSetupState((prev) => ({
              ...prev,
              jobTitle: latest.session.job_title || prev.jobTitle,
              company: latest.session.company || prev.company,
              experienceLevel: latest.session.experience_level || prev.experienceLevel,
              interviewType: latest.session.interview_type as CoachInterviewType,
              jobDescription: latest.context?.jobDescription || prev.jobDescription,
              requiredSkills: latest.context?.requiredSkills || prev.requiredSkills,
              preferredSkills: latest.context?.preferredSkills || prev.preferredSkills,
              responsibilities: latest.context?.responsibilities || prev.responsibilities,
              techStack: latest.context?.techStack || prev.techStack,
              notes: latest.context?.notes || prev.notes,
            }));
          }
          setStage("setup");
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setStage("setup");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Progress-label cycling while the one-shot analysis call runs.
  useEffect(() => {
    if (stage !== "analyzing") return;
    const timer = window.setInterval(() => {
      setAnalysisStep((prev) => Math.min(prev + 1, ANALYSIS_STEPS.length));
    }, ANALYSIS_STEP_MS);
    return () => window.clearInterval(timer);
  }, [stage]);

  useEffect(
    () => () => {
      if (analyzingRef.current) window.clearTimeout(analyzingRef.current);
    },
    []
  );

  async function persistLengthSetting(style: CoachResponseLength) {
    setResponseStyle(style);
    await window.api.settings.set("coach_length", style);
  }

  async function continueToAnalysis(resume: string | null) {
    setBusy(true);
    setError(null);
    setAnalysisStep(0);
    try {
      const sessionId = await window.api.coach.createSession({ setup, resume });
      setStage("analyzing");
      const analysis = await window.api.coach.analyze(sessionId);
      const fresh = await window.api.coach.latestSession(sessionId);
      analyzingRef.current = window.setTimeout(() => {
        if (fresh) {
          setBundle(fresh);
          setStage("studio");
        }
      }, 600); // let "Interview Coach ready." register before the studio swaps in
      void analysis;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage("setup");
    } finally {
      setBusy(false);
    }
  }

  async function reanalyze() {
    if (!bundle) return;
    setBusy(true);
    setError(null);
    setAnalysisStep(0);
    try {
      setStage("analyzing");
      await window.api.coach.analyze(bundle.session.id);
      const fresh = await window.api.coach.latestSession(bundle.session.id);
      if (fresh) setBundle(fresh);
      setStage("studio");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage("studio");
    } finally {
      setBusy(false);
    }
  }

  async function newSession() {
    setBundle(null);
    setSetupState(EMPTY_SETUP);
    setStage("setup");
    window.api.coach.listSessions().then(setPastSessions);
  }

  async function deleteSession(id: number) {
    if (!confirm("Delete this Interview Coach session (questions, answers, feedback)?")) return;
    await window.api.coach.deleteSession(id);
    setPastSessions((prev) => prev.filter((s) => s.id !== id));
    if (bundle?.session.id === id) {
      setBundle(null);
      setStage("setup");
    }
  }

  async function resumeSession(id: number) {
    setError(null);
    try {
      const loaded = await window.api.coach.latestSession(id);
      if (!loaded) return;
      if (loaded.session.status === "ready" && loaded.context?.analysis) {
        setBundle(loaded);
        setStage("studio");
      } else {
        setStage("setup");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="page">
      {stage === "boot" && (
        <div className="flex items-center gap-2 text-[13px] text-faint">
          <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-accent" />
          Loading Interview Coach…
        </div>
      )}

      {stage === "setup" && (
        <>
          <div className="mx-auto max-w-2xl">
            <h1 className="page-title">Interview Coach</h1>
            <p className="page-sub mb-6">
              A dedicated prep studio: analyze a job against your resume, rehearse questions by voice
              or keyboard, and get grounded coaching — with nothing sent anywhere except your chosen
              AI provider.
            </p>
          </div>
          <SetupStage
            setup={setup}
            setSetup={setSetup}
            savedResume={savedResume}
            responseStyle={responseStyle}
            setResponseStyle={persistLengthSetting}
            onContinue={continueToAnalysis}
            busy={busy}
            error={error}
            pastSessions={pastSessions}
            onDeleteSession={deleteSession}
            onResumeSession={resumeSession}
          />
        </>
      )}

      {stage === "analyzing" && <AnalyzingStage stepIndex={analysisStep} />}

      {stage === "studio" && bundle && (
        <StudioStage
          bundle={bundle}
          speed={speed}
          showLatency={showLatency}
          voiceEnabled={voiceEnabled}
          autoListen={autoListen}
          metrics={metrics}
          setMetrics={setMetrics}
          onNewSession={newSession}
          onReanalyze={reanalyze}
        />
      )}
    </div>
  );
}
