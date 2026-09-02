import { useEffect, useRef, useState } from "react";
import type { InterviewPrepItem, ResumeTailoringResult } from "../../electron/ai/AIProvider";
import type { ResumeTailoringRow } from "../../electron/db/db";
import { parseResumeTailoring } from "../lib/parseAnswer";
import { resumeTailoringToMarkdown, markdownToPrintableHtml, slugify } from "../lib/export";
import { Section, BulletSection } from "../components/AnswerSections";
import { usePlan } from "../lib/usePlan";
import { isPro } from "../lib/plan";
import { IconArrowRight, IconChart, IconFile, IconSpark, IconUpload, IconWand } from "../components/icons";
import { MarkdownText } from "../components/AnswerSections";

type ResultTab = "resume" | "ats" | "suggestions" | "prep";
type ResumeView = "tailored" | "original" | "both";

function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function scoreColor(score: number): string {
  if (score >= 80) return "rgb(var(--accent))";
  if (score >= 60) return "rgb(var(--gold))";
  return "rgb(var(--danger))";
}

function scoreVerdict(score: number): string {
  if (score >= 80) return "Strong match — ready to apply.";
  if (score >= 60) return "Good match — a few gaps worth closing.";
  return "Weak match — significant gaps against this description.";
}

function ScoreRing({ score }: { score: number }) {
  const radius = 34;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="relative h-[88px] w-[88px] shrink-0">
      <svg width="88" height="88" viewBox="0 0 88 88">
        <circle cx="44" cy="44" r={radius} fill="none" stroke="rgb(var(--hairline))" strokeWidth="8" />
        <circle
          cx="44"
          cy="44"
          r={radius}
          fill="none"
          stroke={scoreColor(score)}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * circumference} ${circumference}`}
          transform="rotate(-90 44 44)"
          className="transition-[stroke-dasharray] duration-700 ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="font-display text-[22px] font-semibold tracking-tight">{score}</span>
      </div>
    </div>
  );
}

export default function ResumeTailoring() {
  const plan = usePlan();
  const [resumeText, setResumeText] = useState<string | null>(null);
  const [resumeLoading, setResumeLoading] = useState(true);
  const [sessionResume, setSessionResume] = useState<{ text: string; fileName: string } | null>(null);
  const [importing, setImporting] = useState(false);

  const [jobTitle, setJobTitle] = useState("");
  const [jobDescription, setJobDescription] = useState("");
  const [streamText, setStreamText] = useState("");
  const [result, setResult] = useState<ResumeTailoringResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<ResultTab>("resume");
  const [resumeView, setResumeView] = useState<ResumeView>("tailored");

  const [prep, setPrep] = useState<InterviewPrepItem[] | null>(null);
  const [prepLoading, setPrepLoading] = useState(false);
  const [prepError, setPrepError] = useState<string | null>(null);

  const stopStream = useRef<(() => void) | null>(null);
  const [history, setHistory] = useState<ResumeTailoringRow[]>([]);

  function refreshHistory() {
    window.api.resumeTailoring.list().then(setHistory);
  }

  useEffect(() => {
    if (!isPro(plan, "resume-tailoring")) return;
    window.api.resume.get().then((r) => {
      setResumeText(r);
      setResumeLoading(false);
    });
    refreshHistory();
    return () => {
      stopStream.current?.();
    };
  }, [plan]);

  const effectiveResume = sessionResume?.text ?? resumeText ?? "";
  const resumeLabel = sessionResume ? `${sessionResume.fileName} (not saved)` : "Saved resume context";

  async function uploadPdf() {
    setImporting(true);
    setError(null);
    try {
      const imported = await window.api.resume.importPdf();
      if (!imported) return;
      setSessionResume({ text: imported.text, fileName: imported.fileName });
      setPrep(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }

  async function saveSessionResume() {
    if (!sessionResume) return;
    await window.api.resume.set(sessionResume.text);
    setResumeText(sessionResume.text);
    setSessionResume(null);
  }

  function tailor() {
    if (!effectiveResume || !jobDescription.trim() || loading) return;
    setLoading(true);
    setError(null);
    setStreamText("");
    setResult(null);
    stopStream.current?.();

    let full = "";
    stopStream.current = window.api.ai.streamResumeTailoring(
      effectiveResume,
      jobDescription,
      jobTitle,
      (chunk) => {
        full += chunk;
        setStreamText(full);
      },
      () => {
        setLoading(false);
        setResult(parseResumeTailoring(full));
        window.api.resumeTailoring
          .record({ job_title: jobTitle.trim(), job_description: jobDescription, result: full })
          .then(refreshHistory);
      },
      (message) => {
        setError(message);
        setLoading(false);
      }
    );
  }

  async function generatePrep() {
    if (!jobDescription.trim() || prepLoading) return;
    setPrepLoading(true);
    setPrepError(null);
    try {
      setPrep(await window.api.ai.generateInterviewPrep(jobDescription, jobTitle, effectiveResume || null));
    } catch (err) {
      setPrepError(err instanceof Error ? err.message : String(err));
    } finally {
      setPrepLoading(false);
    }
  }

  async function deleteHistoryItem(id: number) {
    if (!confirm("Delete this tailored version?")) return;
    await window.api.resumeTailoring.delete(id);
    refreshHistory();
  }

  if (!isPro(plan, "resume-tailoring")) {
    return (
      <div className="page max-w-2xl">
        <h1 className="page-title mb-2">Resume Tailoring</h1>
        <div className="warn-box">
          <p className="text-sm text-gold">
            Resume Tailoring is a Pro feature — rewrite your saved resume to match a specific job
            description, with an ATS score report, best-fit suggestions, and interview prep from the job
            description. Past versions are saved so you can revisit them per job.
          </p>
          <p className="text-sm text-gold mt-2">
            Preview it in <a href="#/settings" className="underline">Settings &gt; Plan</a>.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="page max-w-4xl">
      <h1 className="page-title">Resume Tailoring</h1>
      <p className="page-sub">
        Match your resume to a job description — with an ATS score, gap report, and interview prep.
      </p>

      {error && <div className="error-box mt-5">{error}</div>}

      {/* resume source */}
      <div className="card mt-6 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-start gap-3.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
              <IconFile size={17} />
            </div>
            <div>
              <div className="text-[14.5px] font-semibold tracking-tight">Your resume</div>
              {resumeLoading ? (
                <div className="mt-1 h-4 w-40 animate-pulse-soft rounded bg-raised" />
              ) : effectiveResume ? (
                <p className="mt-1 text-[13px] leading-relaxed text-muted">
                  {resumeLabel} · {wordCount(effectiveResume)} words. Tailoring only rephrases and
                  re-emphasizes what's already there — it never invents experience.
                </p>
              ) : (
                <p className="mt-1 text-[13px] leading-relaxed text-muted">
                  Upload a PDF resume or paste it in{" "}
                  <a href="#/resume" className="font-medium text-accent hover:underline">
                    Resume Context
                  </a>{" "}
                  to get started.
                </p>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button onClick={uploadPdf} disabled={importing} className="btn-secondary btn-xs">
              <IconUpload size={12} />
              {importing ? "Reading…" : sessionResume ? "Replace PDF" : "Upload PDF"}
            </button>
            {sessionResume && (
              <button onClick={saveSessionResume} className="btn-ghost btn-xs" title="Save this PDF's text as your resume context">
                Save as my resume
              </button>
            )}
          </div>
        </div>
      </div>

      {/* job description */}
      <div className="card mt-5 space-y-3.5 p-5">
        <div>
          <label className="field-label">Job title (optional)</label>
          <input
            className="input"
            placeholder="e.g. Senior Frontend Developer at Acme"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
          />
        </div>
        <div>
          <label className="field-label">Job description</label>
          <textarea
            className="textarea"
            rows={8}
            placeholder="Paste the full job posting — responsibilities, requirements, and keywords all shape the tailoring and ATS score…"
            value={jobDescription}
            onChange={(e) => setJobDescription(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={tailor}
            disabled={loading || !jobDescription.trim() || !effectiveResume}
            className="btn-primary"
          >
            {loading ? (
              <>
                <IconSpark size={14} className="animate-spin" /> Tailoring…
              </>
            ) : (
              "Tailor resume"
            )}
          </button>
          {!effectiveResume && !resumeLoading && (
            <span className="text-[11.5px] text-faint">Add a resume first</span>
          )}
        </div>
      </div>

      {loading && streamText && (
        <pre className="code-block mt-6 animate-rise whitespace-pre-wrap">{streamText}</pre>
      )}

      {/* results */}
      {!loading && result && (
        <div className="card animate-rise mt-6">
          <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-4 py-3">
            {(
              [
                ["resume", "Resume", null],
                ["ats", "ATS report", result.atsScore],
                ["suggestions", "Suggestions", result.suggestions.length || null],
                ["prep", "Interview prep", prep?.length ?? null],
              ] as [ResultTab, string, number | null][]
            ).map(([id, label, count]) => (
              <button
                key={id}
                onClick={() => setTab(id)}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors ${
                  tab === id ? "bg-accent/10 text-accent" : "text-muted hover:bg-raised hover:text-fg"
                }`}
              >
                {label}
                {id === "ats" && result.atsScore != null && (
                  <span className="font-mono text-[11px] text-faint">{result.atsScore}</span>
                )}
                {count != null && id !== "ats" && (
                  <span className="rounded-full bg-raised px-1.5 font-mono text-[10.5px] text-faint">{count}</span>
                )}
              </button>
            ))}
          </div>

          <div className="p-5">
            {tab === "resume" && (
              <div>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <div className="inline-flex rounded-lg border border-hairline bg-raised/60 p-1">
                    {(
                      [
                        ["tailored", "Tailored"],
                        ["original", "Original"],
                        ["both", "Side by side"],
                      ] as [ResumeView, string][]
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        onClick={() => setResumeView(id)}
                        className={`rounded-md px-2.5 py-1 text-[12px] font-medium transition-colors ${
                          resumeView === id ? "bg-surface text-fg shadow-sm" : "text-muted hover:text-fg"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() =>
                        window.api.export.markdown(
                          resumeTailoringToMarkdown(jobTitle, result),
                          `${slugify(jobTitle || "tailored-resume")}.md`
                        )
                      }
                      className="btn-ghost btn-xs"
                    >
                      Export Markdown
                    </button>
                    <button
                      onClick={() =>
                        window.api.export.pdf(
                          markdownToPrintableHtml(jobTitle || "Tailored Resume", resumeTailoringToMarkdown(jobTitle, result)),
                          `${slugify(jobTitle || "tailored-resume")}.pdf`
                        )
                      }
                      className="btn-ghost btn-xs"
                    >
                      Export PDF
                    </button>
                  </div>
                </div>

                {resumeView === "both" ? (
                  <div className="grid gap-4 lg:grid-cols-2">
                    <div>
                      <div className="section-label mb-2">Original</div>
                      <div className="max-h-[560px] overflow-y-auto rounded-xl border border-hairline bg-raised/60 p-4 text-[13px] leading-relaxed text-muted">
                        <MarkdownText text={effectiveResume} />
                      </div>
                    </div>
                    <div>
                      <div className="section-label mb-2">Tailored</div>
                      <div className="max-h-[560px] overflow-y-auto rounded-xl border border-accent/25 bg-accent/[0.04] p-4 text-[13px] leading-relaxed text-fg">
                        <MarkdownText text={result.tailoredResume} />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div
                    className={`max-h-[560px] overflow-y-auto rounded-xl border p-4 text-[13px] leading-relaxed ${
                      resumeView === "tailored"
                        ? "border-accent/25 bg-accent/[0.04] text-fg"
                        : "border-hairline bg-raised/60 text-muted"
                    }`}
                  >
                    <MarkdownText text={resumeView === "tailored" ? result.tailoredResume : effectiveResume} />
                  </div>
                )}
              </div>
            )}

            {tab === "ats" && (
              <div className="space-y-6">
                {result.atsScore == null ? (
                  <p className="text-[13.5px] text-muted">
                    This tailored version was created before ATS scoring was added — tailor again to get the
                    full report.
                  </p>
                ) : (
                  <>
                    <div className="flex items-center gap-5">
                      <ScoreRing score={result.atsScore} />
                      <div>
                        <div className="font-display text-[16px] font-semibold tracking-tight">
                          {scoreVerdict(result.atsScore)}
                        </div>
                        <p className="mt-1 max-w-lg text-[13px] leading-relaxed text-muted">
                          {result.atsNotes || "Estimated against this job description's keywords and requirements."}
                        </p>
                      </div>
                    </div>

                    {result.atsBreakdown.length > 0 && (
                      <div className="space-y-3.5">
                        <div className="section-label">Score breakdown</div>
                        {result.atsBreakdown.map((b) => (
                          <div key={b.label} className="flex items-center gap-3">
                            <div className="w-44 shrink-0 text-[12.5px] font-medium text-muted">{b.label}</div>
                            <div className="meter">
                              <div
                                className="meter-fill"
                                style={{
                                  width: `${Math.min(100, (b.score / Math.max(1, b.max)) * 100)}%`,
                                  background:
                                    b.score / Math.max(1, b.max) >= 0.7
                                      ? undefined
                                      : "rgb(var(--gold) / 0.8)",
                                }}
                              />
                            </div>
                            <div className="w-14 shrink-0 text-right font-mono text-xs text-faint">
                              {b.score}/{b.max}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="grid gap-5 lg:grid-cols-2">
                      <div>
                        <div className="section-label mb-2.5">Matched keywords</div>
                        {result.matchedKeywords.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {result.matchedKeywords.map((k) => (
                              <span key={k} className="badge-teal">
                                {k}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-[13px] text-faint">None reported.</p>
                        )}
                      </div>
                      <div>
                        <div className="section-label mb-2.5">Missing keywords</div>
                        {result.missingKeywords.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {result.missingKeywords.map((k) => (
                              <span key={k} className="badge-gold">
                                {k}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="ok-text">No gaps flagged — everything covered.</p>
                        )}
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}

            {tab === "suggestions" && (
              <div className="space-y-3">
                {result.suggestions.length > 0 ? (
                  result.suggestions.map((s, i) => (
                    <div key={i} className="flex items-start gap-3.5 rounded-xl border border-hairline bg-raised/50 p-4">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent/10 font-mono text-[12px] font-semibold text-accent">
                        {i + 1}
                      </span>
                      <MarkdownText text={s} className="text-[13.5px] leading-relaxed text-fg/90" />
                    </div>
                  ))
                ) : (
                  <p className="text-[13.5px] text-muted">
                    No suggestions reported for this run — tailor again for targeted advice.
                  </p>
                )}
              </div>
            )}

            {tab === "prep" && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <p className="max-w-md text-[13px] leading-relaxed text-muted">
                    The questions you're most likely to face for this exact job — each with a suggested
                    angle from your background. Practice them aloud in{" "}
                    <a href="#/mock-interview" className="font-medium text-accent hover:underline">
                      Mock Interview
                    </a>
                    .
                  </p>
                  <button
                    onClick={generatePrep}
                    disabled={prepLoading || !jobDescription.trim()}
                    className="btn-secondary btn-xs shrink-0"
                  >
                    {prepLoading ? (
                      <>
                        <IconSpark size={12} className="animate-spin" /> Preparing…
                      </>
                    ) : (
                      <>
                        <IconWand size={12} />
                        {prep ? "Regenerate" : "Generate"}
                      </>
                    )}
                  </button>
                </div>

                {prepError && <div className="error-box">{prepError}</div>}

                {prep && prep.length > 0 && (
                  <div className="space-y-3">
                    {prep.map((item, i) => (
                      <div key={i} className="rounded-xl border border-hairline bg-raised/50 p-4">
                        <div className="flex items-start gap-3">
                          <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent/10 font-mono text-[12px] font-semibold text-accent">
                            {i + 1}
                          </span>
                          <div>
                            <MarkdownText text={item.question} className="text-[13.5px] font-medium leading-snug text-fg" />
                            {item.angle && (
                              <MarkdownText text={item.angle} className="mt-1.5 text-[13px] leading-relaxed text-muted" />
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {!prep && !prepLoading && !prepError && (
                  <div className="flex items-center gap-3 rounded-xl border border-dashed border-hairline p-4">
                    <IconChart size={18} className="shrink-0 text-faint" />
                    <p className="text-[13px] leading-relaxed text-muted">
                      Generate a set of predicted questions with suggested answer angles, tailored to this
                      job description and your background.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {!loading && result && (
        <div className="mt-5 flex items-center gap-2 text-[12px] text-faint">
          <IconArrowRight size={12} />
          Re-run the tailoring after editing the job description to compare scores across applications.
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-8">
          <h2 className="section-label mb-2">Previous tailored versions</h2>
          <div className="space-y-3">
            {history.map((row) => {
              const parsed = parseResumeTailoring(row.result);
              return (
                <details key={row.id} className="disclosure">
                  <summary>
                    <span className="flex min-w-0 items-center gap-2.5">
                      <span className="truncate text-[13.5px] font-medium tracking-tight">
                        {row.job_title || "Untitled role"}
                      </span>
                      {parsed.atsScore != null && (
                        <span
                          className={`badge shrink-0 ${
                            parsed.atsScore >= 80
                              ? "border-accent/30 bg-accent/10 text-accent"
                              : parsed.atsScore >= 60
                                ? "border-gold/30 bg-gold/10 text-gold"
                                : "border-danger/30 bg-danger/10 text-danger"
                          }`}
                        >
                          ATS {parsed.atsScore}
                        </span>
                      )}
                    </span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="text-xs text-faint">
                        {new Date(row.created_at).toLocaleDateString()}
                      </span>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          deleteHistoryItem(row.id);
                        }}
                        className="text-xs text-faint transition-colors hover:text-danger"
                      >
                        delete
                      </button>
                    </span>
                  </summary>
                  <div className="space-y-4 p-4">
                    <Section title="Tailored Resume" text={parsed.tailoredResume} />
                    {parsed.matchedKeywords.length > 0 && (
                      <BulletSection title="Matched Keywords" items={parsed.matchedKeywords} />
                    )}
                    <BulletSection title="Missing Keywords" items={parsed.missingKeywords} />
                    {parsed.suggestions.length > 0 && (
                      <BulletSection title="Suggestions" items={parsed.suggestions} />
                    )}
                    <Section title="ATS Notes" text={parsed.atsNotes} />
                  </div>
                </details>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
