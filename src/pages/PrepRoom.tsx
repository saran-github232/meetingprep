import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import type { InterviewPrepItem } from "../../electron/ai/AIProvider";
import { MarkdownText } from "../components/AnswerSections";
import { EXPERIENCE_LEVELS, PREP_SETTING_KEYS } from "../lib/interview";
import { useStealth } from "../lib/useStealth";
import { useDictation } from "../lib/speech";
import { prepPackToMarkdown, markdownToPrintableHtml } from "../lib/export";
import { usePlan } from "../lib/usePlan";
import { isPro } from "../lib/plan";
import {
  IconArrowRight,
  IconCheck,
  IconFile,
  IconListCheck,
  IconLock,
  IconRocket,
  IconShield,
  IconSpark,
  IconUpload,
  IconVolume,
  IconWand,
} from "../components/icons";

interface CheckState {
  ai: boolean;
  resume: boolean;
  profile: boolean;
  mocked: boolean;
  loaded: boolean;
}

function StepHeader({
  n,
  icon: Icon,
  title,
  done,
  doneLabel,
}: {
  n: number;
  icon: typeof IconFile;
  title: string;
  done?: boolean;
  doneLabel?: string;
}) {
  return (
    <div className="mb-4 flex items-center gap-3">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
        <Icon size={15} />
      </span>
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">Step {n}</div>
        <h2 className="font-display text-[16px] font-semibold tracking-tight">{title}</h2>
      </div>
      {done && (
        <span className="badge-teal ml-auto">
          <IconCheck size={11} />
          {doneLabel ?? "Done"}
        </span>
      )}
    </div>
  );
}

export default function PrepRoom() {
  const navigate = useNavigate();
  const plan = usePlan();
  const { stealth, capability } = useStealth();
  const { supported: micSupported } = useDictation(() => {});

  const [resume, setResume] = useState("");
  const [resumeDraft, setResumeDraft] = useState("");
  const [resumeSavedFlash, setResumeSavedFlash] = useState(false);
  const [importedName, setImportedName] = useState<string | null>(null);

  const [role, setRole] = useState("");
  const [skills, setSkills] = useState("");
  const [experience, setExperience] = useState(EXPERIENCE_LEVELS[1]);
  const [jd, setJd] = useState("");
  const [profileSavedFlash, setProfileSavedFlash] = useState(false);

  const [pack, setPack] = useState<InterviewPrepItem[] | null>(null);
  const [packLoading, setPackLoading] = useState(false);
  const [packError, setPackError] = useState<string | null>(null);

  const [checks, setChecks] = useState<CheckState>({ ai: false, resume: false, profile: false, mocked: false, loaded: false });

  async function refreshChecks() {
    const [aiReady, savedResume, savedRole, savedJd, mocks] = await Promise.all([
      window.api.ai.status(),
      window.api.resume.get(),
      window.api.settings.get(PREP_SETTING_KEYS.role),
      window.api.settings.get(PREP_SETTING_KEYS.jobDescription),
      window.api.mockInterview.list(),
    ]);
    setChecks({
      ai: aiReady,
      resume: !!savedResume?.trim(),
      profile: !!(savedRole?.trim() && savedJd?.trim()),
      mocked: mocks.length > 0,
      loaded: true,
    });
  }

  useEffect(() => {
    (async () => {
      const [savedResume, savedRole, savedSkills, savedExperience, savedJd, savedPack] = await Promise.all([
        window.api.resume.get(),
        window.api.settings.get(PREP_SETTING_KEYS.role),
        window.api.settings.get(PREP_SETTING_KEYS.skills),
        window.api.settings.get(PREP_SETTING_KEYS.experience),
        window.api.settings.get(PREP_SETTING_KEYS.jobDescription),
        window.api.settings.get(PREP_SETTING_KEYS.pack),
      ]);
      if (savedResume) {
        setResume(savedResume);
        setResumeDraft(savedResume);
      }
      if (savedRole) setRole(savedRole);
      if (savedSkills) setSkills(savedSkills);
      if (savedExperience && EXPERIENCE_LEVELS.includes(savedExperience)) setExperience(savedExperience);
      if (savedJd) setJd(savedJd);
      if (savedPack) {
        try {
          const parsed = JSON.parse(savedPack) as InterviewPrepItem[];
          if (Array.isArray(parsed) && parsed.length > 0) setPack(parsed);
        } catch {
          // corrupted stored pack — ignore, user can regenerate
        }
      }
      await refreshChecks();
    })();
  }, []);

  async function saveResume() {
    if (!resumeDraft.trim()) return;
    await window.api.resume.set(resumeDraft);
    setResume(resumeDraft);
    setResumeSavedFlash(true);
    setTimeout(() => setResumeSavedFlash(false), 2000);
    refreshChecks();
  }

  async function importPdf() {
    try {
      const imported = await window.api.resume.importPdf();
      if (!imported) return;
      await window.api.resume.set(imported.text);
      setResume(imported.text);
      setResumeDraft(imported.text);
      setImportedName(imported.fileName);
      refreshChecks();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    }
  }

  async function saveProfile() {
    await Promise.all([
      window.api.settings.set(PREP_SETTING_KEYS.role, role.trim()),
      window.api.settings.set(PREP_SETTING_KEYS.skills, skills.trim()),
      window.api.settings.set(PREP_SETTING_KEYS.experience, experience),
      window.api.settings.set(PREP_SETTING_KEYS.jobDescription, jd.trim()),
    ]);
    setProfileSavedFlash(true);
    setTimeout(() => setProfileSavedFlash(false), 2000);
    refreshChecks();
  }

  async function generatePack() {
    if (packLoading || (!role.trim() && !jd.trim())) return;
    setPackLoading(true);
    setPackError(null);
    try {
      const items = await window.api.ai.generateInterviewPrep(jd.trim(), role.trim(), resume || null);
      if (items.length === 0) throw new Error("Nothing came back — add a bit more to the role or job description and try again.");
      setPack(items);
      await window.api.settings.set(PREP_SETTING_KEYS.pack, JSON.stringify(items));
    } catch (err) {
      setPackError(err instanceof Error ? err.message : String(err));
    } finally {
      setPackLoading(false);
    }
  }

  const checkItems = [
    {
      key: "resume",
      label: "Resume saved — encrypted on this device",
      pass: checks.resume,
      cta: null as string | null,
    },
    {
      key: "profile",
      label: "Target role & job description set",
      pass: checks.profile,
      cta: null,
    },
    {
      key: "ai",
      label: "AI provider connected (free Gemini key works)",
      pass: checks.ai,
      cta: "/settings",
    },
    {
      key: "mocked",
      label: "At least one scored Mock Interview completed",
      pass: checks.mocked,
      cta: "/mock-interview",
    },
  ];

  return (
    <div className="page max-w-3xl">
      <div className="flex items-start gap-3.5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-strong text-white shadow-glow">
          <IconRocket size={20} />
        </div>
        <div>
          <h1 className="page-title">Prep Room</h1>
          <p className="page-sub">
            Set everything up <em>before</em> you walk in — resume, target role, and the questions you're most
            likely to face. New here? Follow the{" "}
            <a href="#/setup-guide" className="font-medium text-accent hover:underline">
              end-to-end Setup Guide
            </a>
            .
          </p>
        </div>
      </div>

      {/* step 1 — resume */}
      <div className="card mt-7 p-5">
        <StepHeader n={1} icon={IconFile} title="Add your resume" done={checks.resume} />
        <p className="mb-3.5 text-[13px] leading-relaxed text-muted">
          Interviewers ask about <em>your</em> projects and experience — saving your resume lets every answer and
          prep pack draw on it. Text is extracted locally from the PDF and stored encrypted; nothing is uploaded
          anywhere.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={importPdf} className="btn-secondary btn-xs">
            <IconUpload size={13} />
            Import resume PDF
          </button>
          {importedName && (
            <span className="badge-teal">
              <IconFile size={11} />
              {importedName}
            </span>
          )}
          {!importedName && resume && (
            <span className="badge-teal">
              <IconCheck size={11} />
              Saved ({resume.length.toLocaleString()} chars)
            </span>
          )}
        </div>
        <textarea
          className="textarea mt-3"
          rows={6}
          placeholder="…or paste your resume / background here, then Save."
          value={resumeDraft}
          onChange={(e) => setResumeDraft(e.target.value)}
        />
        <div className="mt-2.5 flex items-center gap-2.5">
          <button onClick={saveResume} disabled={!resumeDraft.trim()} className="btn-primary btn-xs">
            Save resume
          </button>
          {resumeSavedFlash && <span className="ok-text text-xs">Saved</span>}
        </div>
      </div>

      {/* step 2 — role & JD */}
      <div className="card mt-5 p-5">
        <StepHeader n={2} icon={IconRocket} title="Set the target role & job description" done={checks.profile} />
        <div className="grid gap-3.5 sm:grid-cols-2">
          <div>
            <label className="field-label">Role</label>
            <input
              className="input"
              placeholder="e.g. Frontend Developer"
              value={role}
              onChange={(e) => setRole(e.target.value)}
            />
          </div>
          <div>
            <label className="field-label">Experience level</label>
            <select className="input" value={experience} onChange={(e) => setExperience(e.target.value)}>
              {EXPERIENCE_LEVELS.map((lvl) => (
                <option key={lvl} value={lvl}>
                  {lvl}
                </option>
              ))}
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="field-label">
              Tech stack / skills <span className="normal-case">(optional)</span>
            </label>
            <input
              className="input"
              placeholder="e.g. React, TypeScript, Node.js, PostgreSQL"
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="field-label">
              Job description <span className="normal-case">(paste the posting — strongly recommended)</span>
            </label>
            <textarea
              className="input"
              rows={4}
              placeholder="Paste the full job posting. The prep pack below is tailored to its specific requirements…"
              value={jd}
              onChange={(e) => setJd(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2.5">
          <button onClick={saveProfile} disabled={!role.trim() && !jd.trim()} className="btn-primary btn-xs">
            Save role & description
          </button>
          {profileSavedFlash && <span className="ok-text text-xs">Saved — Mock Interview will prefill from this</span>}
        </div>
      </div>

      {/* step 3 — prep pack */}
      <div className="card mt-5 p-5">
        <StepHeader n={3} icon={IconWand} title="Generate your prep pack" done={!!pack?.length} doneLabel="Ready" />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="max-w-md text-[13px] leading-relaxed text-muted">
            Predicted questions for this exact role and posting, each with a suggested answer angle grounded in
            your resume. Rehearse them until every angle is yours.
          </p>
          <button
            onClick={generatePack}
            disabled={packLoading || (!role.trim() && !jd.trim())}
            className="btn-secondary btn-xs shrink-0"
          >
            {packLoading ? (
              <>
                <IconSpark size={12} className="animate-spin" /> Preparing…
              </>
            ) : (
              <>
                <IconWand size={12} />
                {pack ? "Regenerate" : "Generate"}
              </>
            )}
          </button>
        </div>

        {packError && <div className="error-box mt-3">{packError}</div>}

        {pack && pack.length > 0 && (
          <>
            <div className="mt-4 space-y-3">
              {pack.map((item, i) => (
                <div key={i} className="rounded-xl border border-hairline bg-raised/50 p-4">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent/10 font-mono text-[12px] font-semibold text-accent">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <MarkdownText text={item.question} className="text-[13.5px] font-medium leading-snug text-fg" />
                      {item.angle && (
                        <MarkdownText text={item.angle} className="mt-1.5 text-[13px] leading-relaxed text-muted" />
                      )}
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <button
                          onClick={() => navigate("/practice", { state: { question: item.question } })}
                          className="btn-ghost btn-xs"
                        >
                          Rehearse an answer
                          <IconArrowRight size={11} />
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <button
                onClick={() => window.api.export.markdown(prepPackToMarkdown(role, pack), "prep-pack.md")}
                className="btn-ghost btn-xs"
              >
                Export pack (Markdown)
              </button>
              <button
                onClick={() => {
                  if (!isPro(plan, "pdf-export")) {
                    alert("PDF export is a Pro feature. Preview it in Settings > Plan.");
                    return;
                  }
                  window.api.export.pdf(markdownToPrintableHtml("Prep pack", prepPackToMarkdown(role, pack)), "prep-pack.pdf");
                }}
                className="btn-ghost btn-xs"
              >
                Export pack (PDF)
                {!isPro(plan, "pdf-export") && <IconLock size={11} />}
              </button>
              <a href="#/mock-interview" className="btn-ghost btn-xs">
                Rehearse in a scored Mock Interview
                <IconArrowRight size={11} />
              </a>
            </div>
          </>
        )}

        {!pack && !packLoading && !packError && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-dashed border-hairline p-4">
            <IconWand size={18} className="shrink-0 text-faint" />
            <p className="text-[13px] leading-relaxed text-muted">
              Generate the pack after steps 1–2 — it's saved here so you can re-read it right before the call.
            </p>
          </div>
        )}
      </div>

      {/* checklist */}
      <div className="card mt-5 p-5">
        <div className="mb-4 flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-accent/10 text-accent">
            <IconListCheck size={15} />
          </span>
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-faint">Final check</div>
            <h2 className="font-display text-[16px] font-semibold tracking-tight">Before you walk in</h2>
          </div>
          {checks.loaded && checks.resume && checks.profile && checks.ai && checks.mocked && (
            <span className="badge-teal ml-auto">
              <IconCheck size={11} />
              All set
            </span>
          )}
        </div>
        <div className="space-y-2">
          {checkItems.map((item) => (
            <div
              key={item.key}
              className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] transition-colors hover:bg-raised/60"
            >
              {item.pass ? (
                <IconCheck size={14} className="shrink-0 text-accent" />
              ) : (
                <span className="ml-1 mr-1 h-2 w-2 shrink-0 rounded-full bg-gold/70" aria-hidden />
              )}
              <span className={item.pass ? "text-fg" : "text-muted"}>{item.label}</span>
              {item.cta && (
                <a href={`#${item.cta}`} className="ml-auto shrink-0 text-[12px] font-medium text-accent hover:underline">
                  Open →
                </a>
              )}
            </div>
          ))}
          <div
            className={`flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px] ${
              micSupported ? "" : "text-faint"
            }`}
          >
            {micSupported ? (
              <IconCheck size={14} className="shrink-0 text-accent" />
            ) : (
              <span className="ml-1 mr-1 h-2 w-2 shrink-0 rounded-full bg-gold/70" aria-hidden />
            )}
            <span>Microphone dictation available {micSupported ? "" : "— voice practice unavailable here; type answers instead"}</span>
            {micSupported && <IconVolume size={13} className="ml-auto shrink-0 text-faint" />}
          </div>
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 text-[13px]">
            <IconShield size={14} className={`shrink-0 ${stealth ? "text-accent" : "text-faint"}`} />
            <span className={stealth ? "text-fg" : "text-muted"}>
              Capture shield {stealth ? "on" : "off (optional)"} —{" "}
              {stealth
                ? capability?.capturesShow ?? "the window stays out of screen shares."
                : "turn it on if you'll screen-share and want your own notes to stay out of the share"}
            </span>
            <span className="ml-auto shrink-0 text-[11px] text-faint">Ctrl+Shift+H</span>
          </div>
        </div>
      </div>

      <p className="mt-6 max-w-2xl text-[12px] leading-relaxed text-faint">
        Prep Room is for <em>before</em> the interview. There's no live mode that listens to an interviewer and
        feeds you answers mid-call — the prep pack pays off because you rehearsed it, not because the app
        whispers. That's the line this app draws on purpose.
      </p>
    </div>
  );
}
