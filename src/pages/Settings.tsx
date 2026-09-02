import { useEffect, useState } from "react";
import { useTheme, type Theme } from "../lib/useTheme";
import type { AIProviderName, Plan } from "../../electron/db/db";
import { FEATURES } from "../lib/plan";
import { IconCheck, IconMonitor, IconMoon, IconShield, IconSun } from "../components/icons";

const PROVIDERS: { id: AIProviderName; label: string; keyUrl: string }[] = [
  { id: "gemini", label: "Gemini", keyUrl: "https://aistudio.google.com/apikey" },
  { id: "openai", label: "OpenAI", keyUrl: "https://platform.openai.com/api-keys" },
  { id: "anthropic", label: "Anthropic", keyUrl: "https://console.anthropic.com/settings/keys" },
];

const THEME_ICONS = { light: IconSun, system: IconMonitor, dark: IconMoon } as const;

export default function Settings() {
  const { theme, setTheme } = useTheme();
  const [provider, setProvider] = useState<AIProviderName>("gemini");
  const [aiConfigured, setAiConfigured] = useState<boolean | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [keySaved, setKeySaved] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [stealth, setStealth] = useState(false);

  function refreshStatus() {
    window.api.ai.status().then(setAiConfigured);
  }

  useEffect(() => {
    window.api.ai.getActiveProvider().then(setProvider);
    window.api.plan.get().then(setPlan);
    window.api.stealth.get().then(setStealth);
    refreshStatus();
  }, []);

  async function toggleStealth() {
    const next = !stealth;
    setStealth(next);
    await window.api.stealth.set(next);
  }

  async function togglePlan() {
    const next: Plan = plan === "pro" ? "free" : "pro";
    await window.api.plan.set(next);
    setPlan(next);
  }

  async function selectProvider(id: AIProviderName) {
    setProvider(id);
    setApiKeyInput("");
    await window.api.ai.setActiveProvider(id);
    refreshStatus();
  }

  async function saveKey() {
    if (!apiKeyInput.trim()) return;
    await window.api.ai.setApiKey(provider, apiKeyInput.trim());
    setApiKeyInput("");
    setKeySaved(true);
    setTimeout(() => setKeySaved(false), 2000);
    refreshStatus();
  }

  async function clearKey() {
    if (!confirm(`Remove the saved ${PROVIDERS.find((p) => p.id === provider)?.label} API key?`)) return;
    await window.api.ai.clearApiKey(provider);
    refreshStatus();
  }

  async function wipe(what: "history" | "resume" | "all") {
    const label = {
      history: "all practice/coding history and Mock Interview results",
      resume: "your resume context and all Resume Tailoring results",
      all: "everything (history, resume, tailoring results, and meeting notes)",
    }[what];
    if (!confirm(`Delete ${label}? This can't be undone.`)) return;
    if (what === "history") await window.api.data.wipeHistory();
    if (what === "resume") await window.api.data.wipeResume();
    if (what === "all") await window.api.data.wipeAll();
    alert("Done.");
  }

  async function wipeAllKeys() {
    if (!confirm("Remove all saved API keys (Gemini, OpenAI, Anthropic) from the keychain and .env? This can't be undone.")) return;
    await Promise.all(PROVIDERS.map((p) => window.api.ai.clearApiKey(p.id)));
    refreshStatus();
    alert("Done.");
  }

  return (
    <div className="page max-w-2xl space-y-9">
      <div>
        <h1 className="page-title">Settings</h1>
        <p className="page-sub">Provider, privacy, plan, and data controls.</p>
      </div>

      {/* privacy / capture shield */}
      <section>
        <h2 className="section-label mb-2">Privacy</h2>
        <div className="card p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3.5">
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
                  stealth ? "bg-accent/15 text-accent" : "bg-raised text-faint"
                }`}
              >
                <IconShield size={17} />
              </div>
              <div>
                <div className="text-[14.5px] font-semibold tracking-tight">Capture shield</div>
                <p className="mt-1 max-w-md text-[13px] leading-relaxed text-muted">
                  Hides this window from screen sharing and recording (Zoom, Teams, Meet, OBS) while it
                  stays fully visible on your display. Toggle anytime with{" "}
                  <span className="kbd">Ctrl</span> <span className="kbd">Shift</span>{" "}
                  <span className="kbd">H</span> or the shield button in the sidebar.
                </p>
                <p className="mt-1.5 text-[11.5px] leading-relaxed text-faint">
                  On Windows 10 (2004+) and macOS the window is excluded entirely from captures; on older
                  systems it appears as a black rectangle instead.
                </p>
              </div>
            </div>
            <button
              role="switch"
              aria-checked={stealth}
              aria-label="Capture shield"
              onClick={toggleStealth}
              className={`switch mt-1 ${stealth ? "switch-on" : ""}`}
            />
          </div>
          <div className="mt-3.5 flex items-center gap-2 text-[12.5px] font-medium">
            {stealth ? (
              <>
                <IconCheck size={14} className="text-accent" />
                <span className="ok-text">On — this window is excluded from screen captures</span>
              </>
            ) : (
              <span className="text-faint">Off — the window behaves like any normal window</span>
            )}
          </div>
        </div>
      </section>

      {/* theme */}
      <section>
        <h2 className="section-label mb-2">Theme</h2>
        <div className="card inline-flex gap-1.5 p-1.5">
          {(["light", "system", "dark"] as Theme[]).map((t) => {
            const Icon = THEME_ICONS[t];
            return (
              <button
                key={t}
                onClick={() => setTheme(t)}
                className={`flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-[13px] font-medium capitalize transition-all duration-200 ${
                  theme === t ? "bg-accent text-accent-fg shadow-glow" : "text-muted hover:bg-raised hover:text-fg"
                }`}
              >
                <Icon size={13.5} />
                {t}
              </button>
            );
          })}
        </div>
      </section>

      {/* ai provider */}
      <section>
        <h2 className="section-label mb-2">AI provider</h2>
        <div className="card p-5">
          <div className="flex gap-2">
            {PROVIDERS.map((p) => (
              <button
                key={p.id}
                onClick={() => selectProvider(p.id)}
                className={`chip ${provider === p.id ? "chip-active" : "chip-idle"}`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {aiConfigured === null && <p className="mt-3 text-[13px] text-faint">Checking…</p>}
          {aiConfigured === true && (
            <p className="ok-text mt-3 flex items-center gap-1.5">
              <IconCheck size={14} />
              {PROVIDERS.find((p) => p.id === provider)?.label} configured and ready.
            </p>
          )}
          {aiConfigured === false && (
            <p className="error-box mt-3">
              No API key found for {PROVIDERS.find((p) => p.id === provider)?.label}. Paste one below, or
              add it to the <code className="font-mono">.env</code> file and restart.
            </p>
          )}

          <div className="mt-3.5 flex items-center gap-2">
            <input
              type="password"
              className="input"
              placeholder={`Paste your ${PROVIDERS.find((p) => p.id === provider)?.label} API key…`}
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
            />
            <button onClick={saveKey} disabled={!apiKeyInput.trim()} className="btn-primary shrink-0">
              Save
            </button>
            {aiConfigured && (
              <button onClick={clearKey} className="btn-secondary shrink-0">
                Clear
              </button>
            )}
          </div>
          {keySaved && <p className="ok-text mt-2 text-xs">Saved</p>}
          <p className="mt-2.5 text-[11.5px] leading-relaxed text-faint">
            Saved to this project's <code className="font-mono">.env</code> file and stored encrypted on
            this device with your OS keychain (which takes priority at runtime) — never sent anywhere
            except to the selected provider's API. Get a free key at{" "}
            <a
              href={PROVIDERS.find((p) => p.id === provider)?.keyUrl}
              target="_blank"
              rel="noreferrer"
              className="font-medium text-accent hover:underline"
            >
              {PROVIDERS.find((p) => p.id === provider)?.keyUrl.replace("https://", "")}
            </a>
            .
          </p>
        </div>
      </section>

      {/* plan */}
      <section>
        <h2 className="section-label mb-2">Plan</h2>
        <div className="card p-5">
          <p className="text-[13px] leading-relaxed text-muted">
            No payment provider is connected yet — this is a local preview toggle so gated features can be
            tried and refined before real billing is wired up. This is separate from the Admin/User role on
            the{" "}
            <a href="#/resources" className="font-medium text-accent hover:underline">
              Resources
            </a>{" "}
            page — Plan controls which app features are unlocked; Admin controls who can publish shared
            resources.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <span className="text-[13.5px]">
              Current plan: <span className="font-semibold capitalize">{plan ?? "…"}</span>
            </span>
            <button onClick={togglePlan} className="btn-secondary">
              {plan === "pro" ? "Switch to Free (preview)" : "Preview Pro (no payment required yet)"}
            </button>
          </div>
          <div className="mt-4 divide-y divide-hairline overflow-hidden rounded-xl border border-hairline">
            {FEATURES.map((f) => (
              <div key={f.id} className="flex items-start justify-between gap-3 p-3.5 transition-colors hover:bg-raised/60">
                <div>
                  <div className="text-[13.5px] font-medium">{f.label}</div>
                  <div className="mt-0.5 text-xs text-faint">{f.description}</div>
                </div>
                <span className={f.tier === "free" ? "badge-teal" : "badge-gold"}>
                  {f.tier === "free" ? "Free" : "Pro"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* data */}
      <section>
        <h2 className="section-label mb-2">Data</h2>
        <div className="card p-5">
          <p className="text-[13px] leading-relaxed text-muted">
            Resume context and meeting notes are encrypted at rest with your OS keychain. Practice/coding
            history is stored locally, unencrypted. Shared Resources live in Firebase, not here — manage
            those from the Resources page.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button onClick={() => wipe("history")} className="btn-danger">
              Wipe history
            </button>
            <button onClick={() => wipe("resume")} className="btn-danger">
              Wipe resume context
            </button>
            <button onClick={() => wipe("all")} className="btn-danger">
              Wipe everything
            </button>
            <button onClick={wipeAllKeys} className="btn-danger">
              Wipe API keys
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
