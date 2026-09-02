import { useEffect, useRef, useState } from "react";
import type { MeetingNoteRow } from "../../electron/db/db";
import { useDictation } from "../lib/speech";
import { MicButton } from "../components/MicButton";
import { IconSpark } from "../components/icons";

function formatClock(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export default function MeetingNotes() {
  const [notes, setNotes] = useState<MeetingNoteRow[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [actionItems, setActionItems] = useState<string[]>([]);
  const [actionInput, setActionInput] = useState("");

  // Live transcription session
  const [segments, setSegments] = useState<string[]>([]);
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [summarizing, setSummarizing] = useState(false);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const transcriptRef = useRef<HTMLDivElement | null>(null);

  function refresh() {
    window.api.meetingNotes.list().then(setNotes);
  }

  useEffect(refresh, []);

  const {
    supported: dictationSupported,
    listening,
    interim,
    error: dictationError,
    start: startDictation,
    stop: stopDictation,
  } = useDictation((text) => setSegments((prev) => [...prev, text]));

  useEffect(() => stopDictation, [stopDictation]);

  useEffect(() => {
    if (!listening) return;
    const timer = window.setInterval(() => setSessionSeconds((s) => s + 1), 1000);
    return () => window.clearInterval(timer);
  }, [listening]);

  useEffect(() => {
    transcriptRef.current?.scrollTo({ top: transcriptRef.current.scrollHeight });
  }, [segments, interim]);

  function startSession() {
    setSummaryError(null);
    setSessionSeconds(0);
    startDictation();
  }

  function stopSession() {
    stopDictation();
  }

  function clearSession() {
    setSegments([]);
    setSessionSeconds(0);
    setSummaryError(null);
  }

  const transcript = segments.join("\n\n");
  const wordCount = transcript.trim() ? transcript.trim().split(/\s+/).length : 0;

  async function summarize() {
    if (segments.length === 0 || summarizing) return;
    setSummarizing(true);
    setSummaryError(null);
    try {
      const result = await window.api.ai.summarizeNotes(transcript);
      if (result.title) setTitle(result.title);
      if (result.summary) {
        setBody(
          `${result.summary}\n\n---\n\nTranscript:\n${transcript}`
        );
      }
      if (result.actionItems.length > 0) setActionItems(result.actionItems);
    } catch (err) {
      setSummaryError(err instanceof Error ? err.message : String(err));
    } finally {
      setSummarizing(false);
    }
  }

  function addActionItem() {
    if (!actionInput.trim()) return;
    setActionItems([...actionItems, actionInput.trim()]);
    setActionInput("");
  }

  async function save() {
    if (!title.trim() || !body.trim()) return;
    await window.api.meetingNotes.insert(title, body, actionItems);
    setTitle("");
    setBody("");
    setActionItems([]);
    clearSession();
    refresh();
  }

  async function remove(id: number) {
    await window.api.meetingNotes.delete(id);
    refresh();
  }

  return (
    <div className="page max-w-3xl">
      <h1 className="page-title">Meeting Notes</h1>
      <p className="page-sub">Capture decisions and action items while they're fresh.</p>

      {/* live transcription session */}
      <div className="card mt-6 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-[15.5px] font-semibold tracking-tight">Live session</h2>
            <p className="mt-0.5 text-[12.5px] text-muted">
              Transcribe a meeting as it happens, then turn it into notes with AI.
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            {listening && (
              <span className="badge-teal font-mono">
                <span className="h-1.5 w-1.5 animate-pulse-soft rounded-full bg-accent" aria-hidden />
                {formatClock(sessionSeconds)}
              </span>
            )}
            {listening ? (
              <button onClick={stopSession} className="btn-secondary">
                Stop
              </button>
            ) : (
              <div className="flex items-center gap-2.5">
                <MicButton
                  listening={listening}
                  onClick={startSession}
                  disabled={!dictationSupported}
                  title="Start live transcription"
                />
                <span className="text-[12px] text-faint">
                  {segments.length > 0 ? "Session stopped" : "Start listening"}
                </span>
              </div>
            )}
          </div>
        </div>

        {dictationError && <p className="error-box mt-3">{dictationError}</p>}
        {!dictationSupported && (
          <p className="mt-3 text-[12px] leading-relaxed text-faint">
            Live transcription needs the Web Speech API, which isn't available in this environment. You can
            still add notes manually below.
          </p>
        )}

        {(segments.length > 0 || interim) && (
          <>
            <div
              ref={transcriptRef}
              className="mt-4 max-h-64 space-y-3 overflow-y-auto rounded-xl border border-hairline bg-raised/60 p-4"
            >
              {segments.map((segment, i) => (
                <p key={i} className="text-[13px] leading-relaxed text-fg/90">
                  {segment}
                </p>
              ))}
              {interim && (
                <p className="text-[13px] italic leading-relaxed text-faint">{interim}…</p>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-2.5">
              <span className="text-[11.5px] text-faint">
                {segments.length} segment{segments.length === 1 ? "" : "s"} · {wordCount} words
              </span>
              {!listening && segments.length > 0 && (
                <>
                  <button onClick={summarize} disabled={summarizing} className="btn-primary btn-xs">
                    {summarizing ? (
                      <>
                        <IconSpark size={12} className="animate-spin" /> Summarizing…
                      </>
                    ) : (
                      "Summarize with AI"
                    )}
                  </button>
                  <button onClick={clearSession} className="btn-ghost btn-xs">
                    Discard
                  </button>
                </>
              )}
              {summaryError && <span className="text-[11.5px] text-danger">{summaryError}</span>}
            </div>
          </>
        )}

        <p className="mt-3.5 text-[11px] leading-relaxed text-faint">
          Only transcribe conversations you're part of, and let everyone know before you start.
        </p>
      </div>

      {/* manual composer */}
      <div className="card mt-6 space-y-3 p-5">
        <h2 className="font-display text-[15.5px] font-semibold tracking-tight">
          {segments.length > 0 && body ? "Review summarized note" : "New note"}
        </h2>
        <input
          className="input"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          className="textarea"
          rows={5}
          placeholder="Notes…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <div className="flex gap-2">
          <input
            className="input"
            placeholder="Add an action item and press Enter"
            value={actionInput}
            onChange={(e) => setActionInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addActionItem()}
          />
          <button onClick={addActionItem} className="btn-secondary">
            Add
          </button>
        </div>
        {actionItems.length > 0 && (
          <ul className="space-y-1.5 text-[13.5px]">
            {actionItems.map((item, i) => (
              <li key={i} className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-2">
                  <span className="h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden />
                  {item}
                </span>
                <button
                  onClick={() => setActionItems(actionItems.filter((_, idx) => idx !== i))}
                  className="text-xs text-faint transition-colors hover:text-danger"
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
        )}
        <button onClick={save} disabled={!title.trim() || !body.trim()} className="btn-primary">
          Save Note
        </button>
      </div>

      <div className="mt-8 space-y-4">
        {notes.map((note) => (
          <div key={note.id} className="card-interactive p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="font-display text-[15px] font-semibold tracking-tight">{note.title}</div>
                <div className="mt-0.5 text-xs text-faint">{note.created_at}</div>
              </div>
              <button
                onClick={() => remove(note.id)}
                className="text-xs text-faint transition-colors hover:text-danger"
              >
                delete
              </button>
            </div>
            <p className="mt-2.5 whitespace-pre-wrap text-[13.5px] leading-relaxed text-fg/90">{note.notes}</p>
            {note.action_items.length > 0 && (
              <div className="mt-3.5 rounded-xl border border-hairline bg-raised/60 p-3.5">
                <div className="section-label mb-2">Action items</div>
                <ul className="space-y-1.5 text-[13.5px] text-muted">
                  {note.action_items.map((item, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ))}
        {notes.length === 0 && (
          <div className="flex items-center justify-center rounded-xl border border-dashed border-hairline py-10 text-[13px] text-faint">
            No meeting notes yet.
          </div>
        )}
      </div>
    </div>
  );
}
