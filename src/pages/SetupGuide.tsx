import {
  IconArrowRight,
  IconCheck,
  IconCode,
  IconFile,
  IconGuide,
  IconLock,
  IconMic,
  IconMonitor,
  IconShield,
  IconSpark,
} from "../components/icons";

const STACK = [
  {
    icon: IconMonitor,
    title: "Electron + React + TypeScript",
    body: "The desktop app itself — a local window, no accounts, no telemetry. Everything runs on your machine.",
  },
  {
    icon: IconSpark,
    title: "Gemini / OpenAI / Anthropic",
    body: "The answer engine. You bring one API key (a free Gemini key works); the app falls back across models and providers automatically.",
  },
  {
    icon: IconFile,
    title: "Local SQLite + OS keychain",
    body: "Your resume, history, notes, and keys are stored on this machine. Resume, notes, and keys are encrypted with your OS keychain.",
  },
  {
    icon: IconMic,
    title: "Web Speech API",
    body: "Dictation and live transcription in the browser engine — used to dictate questions, practice spoken answers, and transcribe meetings.",
  },
  {
    icon: IconCode,
    title: "Monaco editor + pdf-parse",
    body: "A bundled code editor for the Coding Lab, and local PDF text extraction for resume import (never uploaded).",
  },
  {
    icon: IconLock,
    title: "Firebase (optional)",
    body: "Only for the shared Resources library. Everything else works fully offline except the AI calls themselves.",
  },
];

const STEPS = [
  {
    title: "Install & run",
    body: "Node.js 22.5+, then from the project folder:",
    code: ["npm install", "npm run dev"],
  },
  {
    title: "Connect an AI provider",
    body: "Get a key (a free Gemini key is enough) and paste it into Settings → AI Provider — or into .env in the project root. Pick the matching provider in Settings.",
    link: { href: "/settings", label: "Open Settings → AI Provider" },
  },
  {
    title: "Add your resume",
    body: "Prep Room → Step 1. Import your resume PDF (text extracted locally) or paste it. This is what makes every answer sound like you instead of a textbook.",
    link: { href: "/prep-room", label: "Open Prep Room" },
  },
  {
    title: "Set the target role & job description",
    body: "Prep Room → Step 2. Paste the actual posting. These details persist, prefill Mock Interview, and anchor the prep pack to the job you're actually chasing.",
    link: { href: "/prep-room", label: "Open Prep Room → Step 2" },
  },
  {
    title: "Generate your prep pack",
    body: "Prep Room → Step 3. Predicted questions with suggested angles grounded in your resume. Export it, and rehearse each one until the angle is yours.",
    link: { href: "/prep-room", label: "Generate the pack" },
  },
  {
    title: "Practice out loud",
    body: "Mock Interview generates role-tailored questions, reads them aloud, and scores your answers. Send tricky ones to Practice or the Coding Lab for structured deep-dives.",
    link: { href: "/mock-interview", label: "Run a Mock Interview" },
  },
  {
    title: "Review & repeat",
    body: "Star answers you want to keep, then Review resurfaces them on a spaced schedule. Insights shows your weakest categories from mock scores so the next session targets them.",
    link: { href: "/insights", label: "Check Insights" },
  },
];

const DAY_CHECKLIST = [
  "Skim your prep pack one last time — angles, not scripts.",
  "Run one scored Mock Interview in the morning to warm up.",
  "Quiet room, mic check, browser tabs and heavy apps closed.",
  "If you'll screen-share and keep your own notes up, turn on the Capture Shield first (Ctrl+Shift+H) so this window stays out of the share.",
  "Remember: the goal of prep is that you don't need the app during the call.",
];

export default function SetupGuide() {
  return (
    <div className="page max-w-3xl">
      <div className="flex items-start gap-3.5">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-accent to-accent-strong text-white shadow-glow">
          <IconGuide size={20} />
        </div>
        <div>
          <h1 className="page-title">Setup Guide</h1>
          <p className="page-sub">
            End-to-end: what this app uses, how to set it up before an interview, and the day-of checklist.
          </p>
        </div>
      </div>

      {/* stack */}
      <h2 className="section-label mt-9 mb-3">What it's built on</h2>
      <div className="grid gap-3.5 sm:grid-cols-2">
        {STACK.map((s) => (
          <div key={s.title} className="card p-4">
            <div className="flex items-center gap-2.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent">
                <s.icon size={14} />
              </span>
              <div className="text-[13.5px] font-semibold tracking-tight">{s.title}</div>
            </div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-muted">{s.body}</p>
          </div>
        ))}
      </div>

      {/* steps */}
      <h2 className="section-label mt-9 mb-3">End-to-end setup</h2>
      <div className="space-y-3">
        {STEPS.map((step, i) => (
          <div key={step.title} className="card p-5">
            <div className="flex items-start gap-3.5">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent font-mono text-[12px] font-semibold text-accent-fg shadow-glow">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[14px] font-semibold tracking-tight">{step.title}</div>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">{step.body}</p>
                {"code" in step && step.code && (
                  <pre className="code-block mt-2.5 whitespace-pre-wrap !text-[12px]">{step.code.join("\n")}</pre>
                )}
                {"link" in step && step.link && (
                  <a href={`#${step.link.href}`} className="mt-2 inline-flex items-center gap-1 text-[12.5px] font-medium text-accent hover:underline">
                    {step.link.label}
                    <IconArrowRight size={11} />
                  </a>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* day-of */}
      <h2 className="section-label mt-9 mb-3">Interview-day checklist</h2>
      <div className="card p-5">
        <div className="space-y-2.5">
          {DAY_CHECKLIST.map((item) => (
            <div key={item} className="flex items-start gap-2.5 text-[13px] leading-relaxed">
              <IconCheck size={14} className="mt-0.5 shrink-0 text-accent" />
              <span className="text-fg/90">{item}</span>
            </div>
          ))}
        </div>
      </div>

      {/* boundary */}
      <div className="card mt-5 border-gold/25 bg-gold/[0.06] p-5">
        <div className="flex items-start gap-3">
          <IconShield size={16} className="mt-0.5 shrink-0 text-gold" />
          <div>
            <div className="text-[13.5px] font-semibold tracking-tight text-gold">One deliberate limit</div>
            <p className="mt-1 text-[12.5px] leading-relaxed text-gold/90">
              Everything here happens <em>before</em> the interview. The app has no live mode — it won't listen
              to an interviewer and generate answers for you mid-call, hidden from screen shares or otherwise.
              The Prep Room exists so you walk in already warmed up; that's the boundary this project keeps on
              purpose.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
