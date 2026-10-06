import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import type { AnswerDepth } from "../../electron/ai/AIProvider";
import type { PracticeTurn, PracticeSection } from "../../electron/ai/promptTemplates";
import {
  parsePracticeSections,
  practiceTutorPrompt,
  practiceSessionTitle,
  trimPracticeHistory,
} from "../../electron/ai/promptTemplates";
import { useDictation } from "../lib/speech";
import { MicButton, InterimLine } from "../components/MicButton";
import { MarkdownText } from "../components/AnswerSections";
import { IconSpark } from "../components/icons";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface PastedImage {
  id: string;
  mimeType: string;
  /** base64 payload without the "data:<mime>;base64," prefix */
  data: string;
  /** full data-URI used only for <img> preview */
  preview: string;
}

interface Turn {
  id?: string;
  role: "user" | "assistant";
  text: string;
  images: PastedImage[]; // user turns only
  sections: PracticeSection[]; // assistant turns only
  streaming?: boolean;
  interrupted?: boolean;
  error?: string;
}

interface Session {
  id: string;
  title: string;
  turns: Turn[];
  depth: AnswerDepth;
  draftText: string;
  createdAt: string;
  updatedAt: string;
}

function createNewSession(overrideTitle?: string): Session {
  const now = new Date().toISOString();
  return {
    id: `practice_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    title: overrideTitle ? overrideTitle.slice(0, 50) : "New Practice",
    turns: [],
    depth: "medium",
    draftText: "",
    createdAt: now,
    updatedAt: now,
  };
}

const DEPTHS: AnswerDepth[] = [
  "short",
  "medium",
  "detailed",
  "interview-ready",
  "expert-level",
];

// ---------------------------------------------------------------------------
// Image Preview component with fallback placeholder
// ---------------------------------------------------------------------------
function ResilientImage({ src, alt, className }: { src: string; alt: string; className: string }) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div className="flex items-center gap-1.5 px-3 py-2 text-xs text-amber-300 bg-amber-950/40 rounded-lg border border-amber-800/40">
        <span>⚠️</span>
        <span>Image unavailable</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}

// ---------------------------------------------------------------------------
// Code-fence renderer
// ---------------------------------------------------------------------------
function SectionBody({ body }: { body: string }) {
  const parts = body.split(/(```[\w-]*\n[\s\S]*?```)/g);
  return (
    <div className="space-y-2.5">
      {parts.map((part, i) => {
        const fence = part.match(/^```([\w-]*)\n([\s\S]*?)```$/);
        if (fence) {
          const lang = fence[1] || "text";
          const code = fence[2].trimEnd();
          return (
            <div key={i} className="relative">
              <div className="absolute right-2.5 top-2 select-none font-mono text-[10px] text-faint/60">
                {lang}
              </div>
              <pre className="code-block pt-6 text-[12.5px]">
                <code>{code}</code>
              </pre>
            </div>
          );
        }
        return part.trim() ? (
          <MarkdownText
            key={i}
            text={part}
            className="text-[13.5px] leading-relaxed text-fg/90"
          />
        ) : null;
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------
export default function Practice() {
  const location = useLocation();

  // --- Persistent Session State ---------------------------------------------
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [loadedFromDb, setLoadedFromDb] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "error">("saved");

  // --- Per-input & UI state -------------------------------------------------
  const [inputText, setInputText] = useState("");
  const [pastedImages, setPastedImages] = useState<PastedImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingTitleId, setEditingTitleId] = useState<string | null>(null);
  const [editingTitleText, setEditingTitleText] = useState("");

  const stopStream = useRef<(() => void) | null>(null);
  const responseEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // --- Active session helper ------------------------------------------------
  const activeSession = sessions.find((s) => s.id === activeId) || sessions[0] || createNewSession();

  // --- Load sessions from SQLite DB on mount --------------------------------
  useEffect(() => {
    let isMounted = true;
    async function loadSavedSessions() {
      try {
        const rows = await window.api.practice.listSessions();
        if (!isMounted) return;

        const initialQuestion = (location.state as { question?: string } | null)?.question ?? "";

        if (rows.length > 0) {
          const parsedSessions: Session[] = rows.map((r) => {
            let turns: Turn[] = [];
            try {
              turns = JSON.parse(r.turns_json || "[]");
              // Mark any lingering streaming turn as interrupted
              turns = turns.map((t) => {
                if (t.role === "assistant" && t.streaming) {
                  return { ...t, streaming: false, interrupted: true };
                }
                return t;
              });
            } catch (err) {
              console.error("Failed to parse session turns:", err);
            }
            return {
              id: r.id,
              title: r.title,
              depth: (r.depth as AnswerDepth) || "medium",
              draftText: r.draft_text || "",
              turns,
              createdAt: r.created_at,
              updatedAt: r.updated_at,
            };
          });

          setSessions(parsedSessions);

          const lastActiveId = await window.api.practice.getActiveSessionId();
          const targetId = lastActiveId && parsedSessions.some((s) => s.id === lastActiveId)
            ? lastActiveId
            : parsedSessions[0].id;

          setActiveId(targetId);
          const activeSess = parsedSessions.find((s) => s.id === targetId) || parsedSessions[0];
          setInputText(initialQuestion || activeSess.draftText || "");
        } else {
          // Create brand-new initial session
          const newS = createNewSession(initialQuestion || undefined);
          if (initialQuestion) newS.draftText = initialQuestion;
          setSessions([newS]);
          setActiveId(newS.id);
          setInputText(initialQuestion);
          window.api.practice.saveSession({
            id: newS.id,
            title: newS.title,
            depth: newS.depth,
            draft_text: newS.draftText,
            turns_json: JSON.stringify(newS.turns),
          });
          window.api.practice.setActiveSessionId(newS.id);
        }
      } catch (err) {
        console.error("Failed to load practice sessions from DB:", err);
        const fallback = createNewSession();
        setSessions([fallback]);
        setActiveId(fallback.id);
      } finally {
        if (isMounted) setLoadedFromDb(true);
      }
    }

    loadSavedSessions();

    return () => {
      isMounted = false;
    };
  }, []);

  // --- Sync draftText to activeSession state when input changes -------------
  useEffect(() => {
    if (!loadedFromDb || !activeId) return;
    setSessions((prev) =>
      prev.map((s) => (s.id === activeId ? { ...s, draftText: inputText, updatedAt: new Date().toISOString() } : s))
    );
  }, [inputText, activeId, loadedFromDb]);

  // --- Auto-Save persistence with debounce ---------------------------------
  const persistSession = useCallback(async (sess: Session) => {
    if (!sess) return;
    setSaveStatus("saving");
    try {
      // Clean up turns for storage (strip volatile flags)
      const cleanTurns = sess.turns.map((t) => ({
        ...t,
        streaming: false,
      }));
      await window.api.practice.saveSession({
        id: sess.id,
        title: sess.title,
        depth: sess.depth,
        draft_text: sess.draftText || "",
        turns_json: JSON.stringify(cleanTurns),
      });
      setSaveStatus("saved");
    } catch (err) {
      console.error("Session auto-save failed:", err);
      setSaveStatus("error");
    }
  }, []);

  // Queue debounced save when sessions change
  useEffect(() => {
    if (!loadedFromDb || !activeSession) return;

    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      persistSession(activeSession);
    }, 400);

    return () => {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    };
  }, [sessions, activeSession, loadedFromDb, persistSession]);

  // Immediately flush save on window blur or visibility change
  useEffect(() => {
    const handleFlush = () => {
      if (activeSession) persistSession(activeSession);
    };
    window.addEventListener("blur", handleFlush);
    const handleVis = () => {
      if (document.visibilityState === "hidden" && activeSession) persistSession(activeSession);
    };
    document.addEventListener("visibilitychange", handleVis);

    return () => {
      window.removeEventListener("blur", handleFlush);
      document.removeEventListener("visibilitychange", handleVis);
    };
  }, [activeSession, persistSession]);

  // --- Speech Dictation ----------------------------------------------------
  const {
    listening,
    interim,
    supported: dictationSupported,
    start: startDictation,
    stop: stopDictation,
  } = useDictation((text) =>
    setInputText((prev) => (prev.trim() ? prev.trimEnd() + " " + text : text))
  );

  // Scroll to bottom when turns change
  useEffect(() => {
    responseEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [activeSession.turns.length]);

  // Cleanup on unmount
  useEffect(
    () => () => {
      stopStream.current?.();
      stopDictation();
    },
    []
  );

  // --- Session Switching & Management --------------------------------------
  const switchSession = async (targetId: string) => {
    if (targetId === activeId) return;
    // Flush current session save immediately
    if (activeSession) await persistSession(activeSession);

    setActiveId(targetId);
    window.api.practice.setActiveSessionId(targetId);

    const targetSession = sessions.find((s) => s.id === targetId);
    if (targetSession) {
      setInputText(targetSession.draftText || "");
      setPastedImages([]);
    }
    setError(null);
  };

  const addSession = async () => {
    if (activeSession) await persistSession(activeSession);

    const s = createNewSession();
    const updated = [s, ...sessions];
    setSessions(updated);
    setActiveId(s.id);
    setInputText("");
    setPastedImages([]);
    setError(null);

    await window.api.practice.saveSession({
      id: s.id,
      title: s.title,
      depth: s.depth,
      draft_text: "",
      turns_json: "[]",
    });
    window.api.practice.setActiveSessionId(s.id);

    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  const deleteSession = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const targetSession = sessions.find((s) => s.id === id);
    const confirmName = targetSession ? `"${targetSession.title}"` : "this practice session";
    if (!window.confirm(`Delete ${confirmName}? This cannot be undone.`)) return;

    try {
      await window.api.practice.deleteSession(id);
    } catch (err) {
      console.error("Failed to delete session from DB:", err);
    }

    const remaining = sessions.filter((s) => s.id !== id);
    if (remaining.length === 0) {
      const fresh = createNewSession();
      setSessions([fresh]);
      setActiveId(fresh.id);
      setInputText("");
      await window.api.practice.saveSession({
        id: fresh.id,
        title: fresh.title,
        depth: fresh.depth,
        draft_text: "",
        turns_json: "[]",
      });
      window.api.practice.setActiveSessionId(fresh.id);
    } else {
      setSessions(remaining);
      if (activeId === id) {
        const nextId = remaining[0].id;
        setActiveId(nextId);
        setInputText(remaining[0].draftText || "");
        window.api.practice.setActiveSessionId(nextId);
      }
    }
  };

  const startRenameSession = (id: string, currentTitle: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingTitleId(id);
    setEditingTitleText(currentTitle);
  };

  const saveRenameSession = async (id: string) => {
    const trimmed = editingTitleText.trim() || "Untitled Practice";
    setSessions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, title: trimmed, updatedAt: new Date().toISOString() } : s))
    );
    setEditingTitleId(null);
    try {
      await window.api.practice.renameSession(id, trimmed);
    } catch (err) {
      console.error("Failed to rename session:", err);
    }
  };

  function updateSession(id: string, patch: Partial<Session>) {
    setSessions((p) => p.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: new Date().toISOString() } : s)));
  }

  // --- Clipboard image paste ------------------------------------------------
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    const imgItems = Array.from(e.clipboardData.items).filter((it) =>
      it.type.startsWith("image/")
    );
    if (imgItems.length === 0) return;
    e.preventDefault();
    imgItems.forEach((item) => {
      const file = item.getAsFile();
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        const uri = ev.target?.result as string;
        const m = uri.match(/^data:([^;]+);base64,(.+)$/);
        if (!m) return;
        setPastedImages((p) => [
          ...p,
          { id: crypto.randomUUID(), mimeType: m[1], data: m[2], preview: uri },
        ]);
      };
      reader.readAsDataURL(file);
    });
  }, []);

  function removeImage(id: string) {
    setPastedImages((p) => p.filter((img) => img.id !== id));
  }

  // --- Submit Turn ----------------------------------------------------------
  async function handleSubmit(overrideUserTurn?: Turn) {
    const text = overrideUserTurn ? overrideUserTurn.text : inputText.trim();
    const imgs = overrideUserTurn ? overrideUserTurn.images : [...pastedImages];

    if ((!text && imgs.length === 0) || loading) return;

    setLoading(true);
    setError(null);
    stopStream.current?.();

    const userTurn: Turn = overrideUserTurn || {
      role: "user",
      text,
      images: imgs,
      sections: [],
    };

    const assistantPlaceholder: Turn = {
      role: "assistant",
      text: "",
      images: [],
      sections: [],
      streaming: true,
      interrupted: false,
    };

    const prevTurns = overrideUserTurn
      ? activeSession.turns.filter((t) => t !== overrideUserTurn)
      : activeSession.turns;
    const isFirst = prevTurns.length === 0;

    const newTitle = isFirst && (!activeSession.title || activeSession.title === "New Practice")
      ? practiceSessionTitle(text, imgs.length > 0)
      : activeSession.title;

    const updatedTurns = [...prevTurns, userTurn, assistantPlaceholder];

    updateSession(activeSession.id, {
      turns: updatedTurns,
      title: newTitle,
      draftText: "",
    });

    if (!overrideUserTurn) {
      setInputText("");
      setPastedImages([]);
    }

    // Build history for the prompt
    const history: PracticeTurn[] = prevTurns.map((t) => ({
      role: t.role,
      text:
        t.role === "user"
          ? t.text
          : t.sections
              .map((s) => (s.title ? `### ${s.title}\n${s.body}` : s.body))
              .join("\n\n"),
    }));
    history.push({ role: "user", text });

    const prompt = practiceTutorPrompt(trimPracticeHistory(history), activeSession.depth);
    const imagesPayload = userTurn.images.map((img) => ({
      mimeType: img.mimeType,
      data: img.data,
    }));

    let full = "";
    const sid = activeSession.id;

    stopStream.current = window.api.ai.streamPracticeTurn(
      prompt,
      imagesPayload,
      (chunk) => {
        full += chunk;
        const sections = parsePracticeSections(full);
        setSessions((p) =>
          p.map((s) => {
            if (s.id !== sid) return s;
            const turns = [...s.turns];
            const last = turns[turns.length - 1];
            if (last?.role === "assistant")
              turns[turns.length - 1] = { ...last, text: full, sections, streaming: true };
            return { ...s, turns, updatedAt: new Date().toISOString() };
          })
        );
        responseEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
      },
      () => {
        setSessions((p) =>
          p.map((s) => {
            if (s.id !== sid) return s;
            const turns = [...s.turns];
            const last = turns[turns.length - 1];
            if (last?.role === "assistant")
              turns[turns.length - 1] = {
                ...last,
                text: full,
                sections: parsePracticeSections(full),
                streaming: false,
                interrupted: false,
              };
            return { ...s, turns, updatedAt: new Date().toISOString() };
          })
        );
        setLoading(false);
      },
      (msg) => {
        setError(msg);
        setLoading(false);
        // Mark assistant turn as interrupted
        setSessions((p) =>
          p.map((s) => {
            if (s.id !== sid) return s;
            const turns = [...s.turns];
            const last = turns[turns.length - 1];
            if (last?.role === "assistant") {
              turns[turns.length - 1] = { ...last, streaming: false, interrupted: true, error: msg };
            }
            return { ...s, turns, updatedAt: new Date().toISOString() };
          })
        );
      }
    );
  }

  // Retry interrupted turn
  const handleRetryTurn = (assistantIndex: number) => {
    const userTurn = activeSession.turns[assistantIndex - 1];
    if (userTurn && userTurn.role === "user") {
      handleSubmit(userTurn);
    }
  };

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* ── Tab strip ──────────────────────────────────────────────────────── */}
      <div className="flex shrink-0 items-center justify-between gap-1.5 border-b border-hairline px-3 pb-0 pt-3 bg-surface/40">
        <div className="practice-tabs flex items-center gap-1 overflow-x-auto no-scrollbar">
          {sessions.map((s) => (
            <div
              key={s.id}
              onClick={() => switchSession(s.id)}
              className={`practice-tab group flex items-center gap-1.5 cursor-pointer px-3 py-1.5 rounded-t-lg border-t border-x text-xs transition-colors ${
                s.id === activeId
                  ? "bg-raised border-hairline text-fg font-medium shadow-sm"
                  : "bg-surface/50 border-transparent text-muted hover:text-fg hover:bg-surface"
              }`}
              title={s.title}
            >
              {editingTitleId === s.id ? (
                <input
                  type="text"
                  className="input input-xs w-28 bg-surface px-1 text-xs"
                  value={editingTitleText}
                  onChange={(e) => setEditingTitleText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") saveRenameSession(s.id);
                    if (e.key === "Escape") setEditingTitleId(null);
                  }}
                  onBlur={() => saveRenameSession(s.id)}
                  autoFocus
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span
                  onDoubleClick={(e) => startRenameSession(s.id, s.title, e)}
                  className="max-w-[100px] truncate sm:max-w-[140px]"
                >
                  {s.title}
                </span>
              )}

              {/* Action buttons on tab */}
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {editingTitleId !== s.id && (
                  <button
                    onClick={(e) => startRenameSession(s.id, s.title, e)}
                    className="hover:text-accent text-[11px]"
                    title="Rename session"
                  >
                    ✏️
                  </button>
                )}
                {sessions.length > 1 && (
                  <button
                    onClick={(e) => deleteSession(s.id, e)}
                    className="hover:text-danger text-[13px] font-bold"
                    title="Delete session"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          ))}
          <button
            onClick={addSession}
            className="btn-ghost btn-xs shrink-0 flex items-center gap-1 text-[11.5px] px-2 py-1"
            title="New practice session (keeps this one)"
          >
            <span>+</span> <span>New Practice</span>
          </button>
        </div>

        {/* Save Status Indicator */}
        <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] select-none shrink-0">
          {saveStatus === "saving" && (
            <span className="flex items-center gap-1 text-amber-400">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-ping" /> Saving…
            </span>
          )}
          {saveStatus === "saved" && (
            <span className="flex items-center gap-1 text-emerald-400/80">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Saved
            </span>
          )}
          {saveStatus === "error" && (
            <span className="flex items-center gap-1 text-rose-400">
              <span className="h-1.5 w-1.5 rounded-full bg-rose-400" /> Save failed
            </span>
          )}
        </div>
      </div>

      {/* ── Conversation ───────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-3 py-4 lg:px-5">
        {/* Empty state */}
        {activeSession.turns.length === 0 && (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-[14px] bg-accent/10 text-accent">
              <IconSpark size={22} />
            </div>
            <div>
              <p className="font-display text-[17px] font-semibold text-fg">
                Interview Practice Workspace
              </p>
              <p className="mt-1 max-w-sm text-[13px] leading-relaxed text-muted">
                Paste a question, coding problem, error message, or screenshot
                (Ctrl+V). All sessions auto-save automatically.
              </p>
            </div>
            <div className="mt-1 flex flex-wrap justify-center gap-2">
              {["Two Sum (LeetCode)", "Explain async/await in JS", "SQL JOIN vs GROUP BY"].map(
                (ex) => (
                  <button
                    key={ex}
                    onClick={() => {
                      setInputText(ex);
                      setTimeout(() => textareaRef.current?.focus(), 50);
                    }}
                    className="chip chip-idle text-[11.5px]"
                  >
                    {ex}
                  </button>
                )
              )}
            </div>
          </div>
        )}

        {/* Turns */}
        <div className="space-y-4">
          {activeSession.turns.map((turn, i) => (
            <div key={i}>
              {/* User bubble */}
              {turn.role === "user" && (
                <div className="flex justify-end">
                  <div className="max-w-[85%] space-y-2">
                    {turn.images.length > 0 && (
                      <div className="flex flex-wrap justify-end gap-2">
                        {turn.images.map((img) => (
                          <div key={img.id} className="img-chip">
                            <ResilientImage
                              src={img.preview || (img.data ? `data:${img.mimeType};base64,${img.data}` : "")}
                              alt="pasted screenshot"
                              className="h-28 w-auto max-w-[260px] object-contain rounded-lg"
                            />
                          </div>
                        ))}
                      </div>
                    )}
                    {turn.text && (
                      <div className="rounded-2xl bg-accent/10 px-4 py-3 text-[13.5px] text-fg/90 whitespace-pre-wrap">
                        {turn.text}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* AI response */}
              {turn.role === "assistant" && (
                <div className="space-y-3">
                  {turn.streaming && turn.sections.length === 0 && (
                    <div className="flex items-center gap-2 text-[12.5px] text-faint">
                      <IconSpark size={13} className="animate-spin text-accent" />
                      Analyzing question & code…
                    </div>
                  )}
                  {turn.sections.map((sec, si) => (
                    <div key={si} className="practice-section animate-rise">
                      {sec.title && (
                        <div className="practice-section-title">{sec.title}</div>
                      )}
                      <SectionBody body={sec.body} />
                    </div>
                  ))}
                  {turn.streaming && turn.sections.length > 0 && (
                    <div className="flex items-center gap-2 text-[11.5px] text-faint">
                      <IconSpark size={12} className="animate-spin text-accent" />
                      Generating explanation…
                    </div>
                  )}
                  {turn.interrupted && (
                    <div className="mt-2 flex items-center justify-between rounded-lg border border-amber-800/40 bg-amber-950/30 px-3.5 py-2 text-xs text-amber-300">
                      <span>⚠️ AI response generation was interrupted.</span>
                      <button
                        onClick={() => handleRetryTurn(i)}
                        className="btn-ghost btn-xs text-amber-200 hover:text-white"
                      >
                        🔄 Retry Response
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        <div ref={responseEndRef} />
      </div>

      {/* Error */}
      {error && (
        <div className="mx-3 mb-2">
          <div className="error-box flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-xs text-muted hover:text-fg">Dismiss</button>
          </div>
        </div>
      )}

      {/* ── Input ──────────────────────────────────────────────────────────── */}
      <div className="shrink-0 border-t border-hairline bg-surface/50 px-3 py-3 backdrop-blur-md">
        {/* Image previews */}
        {pastedImages.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {pastedImages.map((img) => (
              <div key={img.id} className="img-chip group relative">
                <ResilientImage
                  src={img.preview}
                  alt="pasted"
                  className="h-16 w-auto max-w-[120px] object-contain rounded"
                />
                <button
                  onClick={() => removeImage(img.id)}
                  className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-raised/90 text-[11px] text-muted opacity-0 shadow-sm transition-opacity group-hover:opacity-100 hover:text-danger"
                  title="Remove image"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}

        <textarea
          ref={textareaRef}
          className="textarea"
          rows={activeSession.turns.length === 0 ? 4 : 2}
          placeholder={
            activeSession.turns.length === 0
              ? "Paste your interview question, problem description, code, or screenshot here… (Ctrl+V for images)"
              : "Ask a follow-up or paste more context…"
          }
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onPaste={handlePaste}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) handleSubmit();
          }}
          disabled={loading}
        />
        <InterimLine text={interim} />

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select
            className="select w-auto text-[12px]"
            value={activeSession.depth}
            onChange={(e) =>
              updateSession(activeSession.id, {
                depth: e.target.value as AnswerDepth,
              })
            }
            disabled={loading}
          >
            {DEPTHS.map((d) => (
              <option key={d} value={d}>
                Depth: {d}
              </option>
            ))}
          </select>

          <button
            onClick={() => handleSubmit()}
            disabled={loading || (!inputText.trim() && pastedImages.length === 0)}
            className="btn-primary"
          >
            {loading ? (
              <>
                <IconSpark size={14} className="animate-spin" /> Thinking…
              </>
            ) : activeSession.turns.length === 0 ? (
              "Ask AI"
            ) : (
              "Follow up"
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

          <span className="ml-auto hidden text-[11px] text-faint lg:inline">
            Ctrl+V = paste screenshot · Ctrl+Enter = send
          </span>
        </div>
      </div>
    </div>
  );
}
