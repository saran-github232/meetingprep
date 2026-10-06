import { useEffect, useState } from "react";
import { useTheme, type Theme } from "../lib/useTheme";
import { useStealth } from "../lib/useStealth";
import type { AIProviderName, Plan } from "../../electron/db/db";
import type { LocalModelsInfo } from "../../electron/ai/LocalProvider";
import type { ProviderTestResult } from "../../electron/ai/validate";
import { FEATURES } from "../lib/plan";
import { IconCheck, IconMonitor, IconMoon, IconShield, IconSun } from "../components/icons";

const PROVIDERS: { id: AIProviderName; label: string; keyUrl: string }[] = [
  { id: "gemini", label: "Gemini", keyUrl: "https://aistudio.google.com/apikey" },
  { id: "openai", label: "OpenAI", keyUrl: "https://platform.openai.com/api-keys" },
  { id: "anthropic", label: "Anthropic", keyUrl: "https://console.anthropic.com/settings/keys" },
  { id: "nvidia", label: "NVIDIA NIM", keyUrl: "https://build.nvidia.com" },
  { id: "local", label: "Local (Ollama)", keyUrl: "https://ollama.com" },
];

const THEME_ICONS = { light: IconSun, system: IconMonitor, dark: IconMoon } as const;

export default function Settings() {
  const { theme, setTheme } = useTheme();
  const [provider, setProvider] = useState<AIProviderName>("gemini");
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [keySaved, setKeySaved] = useState(false);
  const [keyError, setKeyError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<ProviderTestResult | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [localInfo, setLocalInfo] = useState<LocalModelsInfo | null>(null);
  const [localModel, setLocalModel] = useState("");
  const [coachProvider, setCoachProvider] = useState<string>("auto");
  const [coachSpeed, setCoachSpeed] = useState<string>("fast");
  const [coachLength, setCoachLength] = useState<string>("medium");
  const [coachVoice, setCoachVoice] = useState(false);
  const [coachAutoListen, setCoachAutoListen] = useState(true);
  const [coachShowLatency, setCoachShowLatency] = useState(false);
  const [coachTestMode, setCoachTestMode] = useState(false);
  const { stealth, toggleStealth, capability } = useStealth();

  function refreshStatus() {
    window.api.ai.hasKey(provider).then(setHasKey);
  }

  function refreshLocal() {
    window.api.ai.localModels().then(setLocalInfo);
  }

  useEffect(() => {
    window.api.ai.getActiveProvider().then(setProvider);
    window.api.plan.get().then(setPlan);
    window.api.settings.get("local_model").then((v) => setLocalModel(v ?? ""));
    // Interview Coach preferences (shared with the coach page).
    window.api.settings.get("coach_provider").then((v) => setCoachProvider(v ?? "auto"));
    window.api.settings.get("coach_speed").then((v) => setCoachSpeed(v ?? "fast"));
    window.api.settings.get("coach_length").then((v) => setCoachLength(v ?? "medium"));
    window.api.settings.get("coach_voice").then((v) => setCoachVoice(v === "1"));
    window.api.settings.get("coach_autolisten").then((v) => setCoachAutoListen(v !== "0"));
    window.api.settings.get("coach_show_latency").then((v) => setCoachShowLatency(v === "1"));
    window.api.settings.get("coach_test_mode").then((v) => setCoachTestMode(v === "1"));
    refreshLocal();
  }, []);

  // Audio & Microphone Diagnostics
  const [audioDiag, setAudioDiag] = useState<{
    permission: string;
    osPlatform: string;
    hasAudioTranscription: boolean;
    transcriptionProvider: string | null;
    activeAiProvider: string;
    hasActiveKey: boolean;
  } | null>(null);
  const [testingMic, setTestingMic] = useState(false);
  const [micTestFeedback, setMicTestFeedback] = useState<{ title: string; detail: string } | null>(null);
  const [selectedMicName, setSelectedMicName] = useState<string>("");

  const refreshAudioDiag = async () => {
    try {
      if (window.api?.audio?.getDiagnostics) {
        const diag = await window.api.audio.getDiagnostics();
        setAudioDiag(diag);
      }
      if (navigator.mediaDevices?.enumerateDevices) {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const savedId = await window.api.settings.get("audio_device_id");
        const found = devices.find((d) => d.kind === "audioinput" && d.deviceId === savedId);
        setSelectedMicName(found?.label || (devices.find((d) => d.kind === "audioinput")?.label ?? "Default Microphone"));
      }
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    refreshAudioDiag();
  }, []);

  async function runMicTest() {
    setTestingMic(true);
    setMicTestFeedback(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };
      recorder.start();
      await new Promise((r) => setTimeout(r, 2000));
      await new Promise<void>((r) => {
        recorder.onstop = () => r();
        recorder.stop();
      });
      stream.getTracks().forEach((t) => t.stop());

      const blob = new Blob(chunks, { type: chunks[0]?.type || "audio/webm" });
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64 = ((reader.result as string) || "").split(",")[1];
        try {
          const res = await window.api.audio.transcribe(base64, blob.type);
          setMicTestFeedback({
            title: "✓ Microphone & Transcription Verified!",
            detail: `Recorded ${Math.round(blob.size / 1024)} KB audio. Result: "${res.text || "(silence detected)"}" via ${res.provider} in ${res.latencyMs}ms.`,
          });
        } catch (txErr) {
          setMicTestFeedback({
            title: "Microphone captured audio, but transcription provider returned an issue:",
            detail: txErr instanceof Error ? txErr.message : String(txErr),
          });
        } finally {
          setTestingMic(false);
        }
      };
      reader.readAsDataURL(blob);
    } catch (err) {
      setMicTestFeedback({
        title: "❌ Microphone Access Failed",
        detail: err instanceof Error ? err.message : String(err),
      });
      setTestingMic(false);
    }
  }

  useEffect(() => {
    // Reset per-provider state whenever the selected chip changes.
    setHasKey(null);
    setTestResult(null);
    setKeyError(null);
    window.api.ai.hasKey(provider).then(setHasKey);
  }, [provider]);

  async function selectLocalModel(model: string) {
    setLocalModel(model);
    await window.api.settings.set("local_model", model);
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
  }

  async function saveKey() {
    if (!apiKeyInput.trim()) return;
    setKeyError(null);
    try {
      await window.api.ai.setApiKey(provider, apiKeyInput.trim());
      setApiKeyInput("");
      setKeySaved(true);
      setTestResult(null);
      setTimeout(() => setKeySaved(false), 2000);
      refreshStatus();
    } catch (err) {
      // Encryption failures used to surface as a silent no-op — show them instead.
      setKeyError(
        `Couldn't save the key: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  async function clearKey() {
    if (!confirm(`Remove the saved ${PROVIDERS.find((p) => p.id === provider)?.label} API key?`)) return;
    setKeyError(null);
    try {
      await window.api.ai.clearApiKey(provider);
      setTestResult(null);
      refreshStatus();
    } catch (err) {
      setKeyError(`Couldn't remove the key: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await window.api.ai.testProvider(provider));
    } finally {
      setTesting(false);
    }
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
    if (!confirm("Remove all saved API keys (Gemini, OpenAI, Anthropic, NVIDIA) from the keychain and .env? This can't be undone.")) return;
    await Promise.all(PROVIDERS.filter((p) => p.id !== "local").map((p) => window.api.ai.clearApiKey(p.id)));
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
                  Keeps this window out of screen shares, recordings, and screenshots (Zoom, Teams, Meet, OBS)
                  while it stays fully visible on your display. Toggle anytime with{" "}
                  <span className="kbd">Ctrl</span> <span className="kbd">Shift</span>{" "}
                  <span className="kbd">H</span> or the shield button in the sidebar. Persists across
                  restarts.
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
          {capability && (
            <div className="mt-3.5 space-y-2 rounded-xl border border-hairline bg-raised/50 p-3.5">
              <div className="flex items-start gap-2.5 text-[12.5px] leading-relaxed">
                <IconMonitor size={14} className="mt-0.5 shrink-0 text-accent" />
                <span>
                  <span className="font-semibold">On your display:</span>{" "}
                  <span className="text-muted">{capability.localShows}</span>
                </span>
              </div>
              <div className="flex items-start gap-2.5 text-[12.5px] leading-relaxed">
                <IconShield size={14} className="mt-0.5 shrink-0 text-accent" />
                <span>
                  <span className="font-semibold">In the share / recording:</span>{" "}
                  <span className="text-muted">{capability.capturesShow}</span>
                </span>
              </div>
            </div>
          )}
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

          {provider === "local" ? (
            <>
              {localInfo === null && <p className="mt-3 text-[13px] text-faint">Checking for Ollama…</p>}
              {localInfo?.running === false && (
                <p className="error-box mt-3">
                  Can't reach Ollama at 127.0.0.1:11434. Install it from{" "}
                  <a href="https://ollama.com" target="_blank" rel="noreferrer" className="font-medium underline">
                    ollama.com
                  </a>
                  , make sure it's running, then{" "}
                  <button onClick={refreshLocal} className="font-medium underline">
                    recheck
                  </button>
                  .
                </p>
              )}
              {localInfo?.running === true && localInfo.models.length === 0 && (
                <p className="error-box mt-3">
                  Ollama is running but has no models installed. Run{" "}
                  <code className="font-mono">ollama pull llama3.1:8b</code> in a terminal, then{" "}
                  <button onClick={refreshLocal} className="font-medium underline">
                    recheck
                  </button>
                  .
                </p>
              )}
              {localInfo?.running === true && localInfo.models.length > 0 && (
                <>
                  <p className="ok-text mt-3 flex items-center gap-1.5">
                    <IconCheck size={14} />
                    Ollama is running — pick which installed model to use.
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {localInfo.models.map((m) => (
                      <button
                        key={m}
                        onClick={() => selectLocalModel(m)}
                        className={`chip ${(localModel || localInfo.preferred) === m ? "chip-active" : "chip-idle"}`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>
                </>
              )}
              <p className="mt-2.5 text-[11.5px] leading-relaxed text-faint">
                Runs entirely on this machine — no API key, no data leaves your device. Requires{" "}
                <a href="https://ollama.com" target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
                  ollama.com
                </a>{" "}
                installed and running separately.
              </p>
            </>
          ) : (
            <>
              {hasKey === null && <p className="mt-3 text-[13px] text-faint">Checking…</p>}
              {hasKey === true && (
                <p className="ok-text mt-3 flex items-center gap-1.5">
                  <IconCheck size={14} />
                  {PROVIDERS.find((p) => p.id === provider)?.label} configured. Use{" "}
                  <span className="font-semibold">Test&nbsp;connection</span> below to verify the key works.
                </p>
              )}
              {hasKey === false && (
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
                {hasKey && (
                  <button onClick={clearKey} className="btn-secondary shrink-0">
                    Clear
                  </button>
                )}
              </div>
              {keySaved && <p className="ok-text mt-2 text-xs">Saved</p>}
              {keyError && <p className="error-box mt-2">{keyError}</p>}

              <div className="mt-3 flex items-center gap-2.5">
                <button onClick={testConnection} disabled={testing} className="btn-secondary shrink-0">
                  {testing ? "Testing…" : "Test connection"}
                </button>
                <span className="text-[11.5px] text-faint">
                  Makes a small real request to verify the key is accepted.
                </span>
              </div>
              {testResult && (
                <p className={`mt-2 text-[13px] leading-relaxed ${testResult.ok ? "ok-text" : "error-box"}`}>
                  {testResult.ok && <span className="inline-flex items-center gap-1.5"><IconCheck size={14} />{testResult.message}</span>}
                  {!testResult.ok && testResult.message}
                </p>
              )}

              {provider === "nvidia" && (
                <p className="mt-2.5 text-[11.5px] leading-relaxed text-faint">
                  Default chain: <code className="font-mono">nvidia/nemotron-3-super-120b-a12b</code> →{" "}
                  <code className="font-mono">nvidia/nemotron-3.5-lightning-30b-a3b</code>. To pin a
                  different one, set <code className="font-mono">NVIDIA_MODEL</code> in{" "}
                  <code className="font-mono">.env</code> (exact name from{" "}
                  <a href="https://build.nvidia.com/models" target="_blank" rel="noreferrer" className="font-medium text-accent hover:underline">
                    build.nvidia.com/models
                  </a>
                  ) and restart.
                </p>
              )}

              <p className="mt-2.5 text-[11.5px] leading-relaxed text-faint">
                Saved to this project's <code className="font-mono">.env</code> file and stored encrypted on
                this device with your OS keychain (which takes priority at runtime) — never sent anywhere
                except to the selected provider's API. Get a key at{" "}
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
            </>
          )}
        </div>
      </section>

      {/* interview coach */}
      <section>
        <h2 className="section-label mb-2">Interview Coach</h2>
        <div className="card space-y-4 p-5">
          <div>
            <p className="text-[13px] leading-relaxed text-muted">
              Preferences for the dedicated Interview Coach page — its own prep studio with resume/job
              analysis, voice practice, and streamed coaching. Keys come from AI provider above; a
              provider without a key falls back to the next configured one automatically.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="field-label">Preferred AI provider</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: "auto", label: "Auto (active provider)" },
                  { id: "gemini", label: "Gemini" },
                  { id: "nvidia", label: "NVIDIA" },
                ].map((p) => (
                  <button
                    key={p.id}
                    onClick={async () => {
                      setCoachProvider(p.id);
                      await window.api.settings.set("coach_provider", p.id);
                    }}
                    className={`chip ${coachProvider === p.id ? "chip-active" : "chip-idle"}`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <p className="field-label">Speed</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: "fast", label: "Fast", title: "Compact prompts + low-latency models — the default" },
                  { id: "balanced", label: "Balanced", title: "More context per answer" },
                  { id: "quality", label: "Quality", title: "Fullest analysis and answers" },
                ].map((s) => (
                  <button
                    key={s.id}
                    title={s.title}
                    onClick={async () => {
                      setCoachSpeed(s.id);
                      await window.api.settings.set("coach_speed", s.id);
                    }}
                    className={`chip ${coachSpeed === s.id ? "chip-active" : "chip-idle"}`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="field-label">Response length</p>
              <div className="flex flex-wrap gap-2">
                {[
                  { id: "short", label: "Short" },
                  { id: "medium", label: "Medium" },
                  { id: "detailed", label: "Detailed" },
                ].map((l) => (
                  <button
                    key={l.id}
                    onClick={async () => {
                      setCoachLength(l.id);
                      await window.api.settings.set("coach_length", l.id);
                    }}
                    className={`chip ${coachLength === l.id ? "chip-active" : "chip-idle"}`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-2.5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] font-medium">Read questions aloud</span>
                <button
                  role="switch"
                  aria-checked={coachVoice}
                  aria-label="Read questions aloud"
                  onClick={async () => {
                    setCoachVoice(!coachVoice);
                    await window.api.settings.set("coach_voice", coachVoice ? "0" : "1");
                  }}
                  className={`switch ${coachVoice ? "switch-on" : ""}`}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] font-medium">Auto-start transcription</span>
                <button
                  role="switch"
                  aria-checked={coachAutoListen}
                  aria-label="Auto-start transcription"
                  onClick={async () => {
                    setCoachAutoListen(!coachAutoListen);
                    await window.api.settings.set("coach_autolisten", coachAutoListen ? "0" : "1");
                  }}
                  className={`switch ${coachAutoListen ? "switch-on" : ""}`}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] font-medium">Show latency metrics</span>
                <button
                  role="switch"
                  aria-checked={coachShowLatency}
                  aria-label="Show latency metrics"
                  onClick={async () => {
                    setCoachShowLatency(!coachShowLatency);
                    await window.api.settings.set("coach_show_latency", coachShowLatency ? "0" : "1");
                  }}
                  className={`switch ${coachShowLatency ? "switch-on" : ""}`}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[13px] font-medium">Test Mode</span>
                <button
                  role="switch"
                  aria-checked={coachTestMode}
                  aria-label="Interview Coach test mode"
                  onClick={async () => {
                    setCoachTestMode(!coachTestMode);
                    await window.api.settings.set("coach_test_mode", coachTestMode ? "0" : "1");
                  }}
                  className={`switch ${coachTestMode ? "switch-on" : ""}`}
                />
              </div>
              {coachTestMode && (
                <p className="warn-box text-[12px]">
                  Test Mode is on: the coach serves canned local responses (no provider calls, no
                  quota) so sessions can be run end-to-end repeatedly for QA. Turn it off for real
                  coaching.
                </p>
              )}
            </div>
          </div>
          <p className="text-[11.5px] leading-relaxed text-faint">
            Actual response latency depends on your network, provider, and model — Fast mode minimizes
            it (compact prompts, output caps, cached analysis) but can't guarantee a fixed response
            time. Latency metrics show time-to-first-token and total generation time when enabled.
          </p>
        </div>
      </section>

      {/* audio & microphone diagnostics */}
      <section>
        <h2 className="section-label mb-2">Audio &amp; Microphone Diagnostics</h2>
        <div className="card p-5 space-y-4">
          <p className="text-[13px] leading-relaxed text-muted">
            Inspect microphone status, active input device, and audio transcription pipeline for Practice and Interview Coach.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-3 rounded-lg border border-hairline/60 bg-raised/40">
              <span className="text-muted block mb-1">Microphone Access:</span>
              <span className="font-medium text-fg flex items-center gap-1.5">
                {audioDiag?.permission === "granted" ? (
                  <span className="text-emerald-400">✓ Connected &amp; Permitted</span>
                ) : (
                  <span className="text-amber-400">⚠️ {audioDiag?.permission ?? "Detecting..."}</span>
                )}
              </span>
            </div>

            <div className="p-3 rounded-lg border border-hairline/60 bg-raised/40">
              <span className="text-muted block mb-1">Input Device:</span>
              <span className="font-medium text-fg truncate block">
                {selectedMicName || "Default System Microphone"}
              </span>
            </div>

            <div className="p-3 rounded-lg border border-hairline/60 bg-raised/40">
              <span className="text-muted block mb-1">Audio Capture Engine:</span>
              <span className="font-medium text-emerald-400 flex items-center gap-1">
                ✓ MediaRecorder + Web Audio VAD
              </span>
            </div>

            <div className="p-3 rounded-lg border border-hairline/60 bg-raised/40">
              <span className="text-muted block mb-1">Speech-to-Text Service:</span>
              <span className="font-medium text-fg flex items-center gap-1.5">
                {audioDiag?.hasAudioTranscription ? (
                  <span className="text-emerald-400">✓ {audioDiag.transcriptionProvider}</span>
                ) : (
                  <span className="text-danger">❌ Requires OpenAI or Gemini key, or Test Mode</span>
                )}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button onClick={refreshAudioDiag} className="btn-secondary btn-xs">
              Refresh Diagnostics
            </button>
            <button onClick={runMicTest} disabled={testingMic} className="btn-secondary btn-xs">
              {testingMic ? "Recording 2s sample…" : "Test Microphone &amp; Audio Input"}
            </button>
          </div>

          {micTestFeedback && (
            <div className="p-3 rounded-lg bg-surface border border-hairline text-xs space-y-1 animate-rise">
              <p className="font-semibold text-fg">{micTestFeedback.title}</p>
              <p className="text-muted leading-relaxed">{micTestFeedback.detail}</p>
            </div>
          )}
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
