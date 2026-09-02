import { IconMic } from "./icons";

/** Toggle button for live mic capture — shows an active/pulsing state while listening. */
export function MicButton({
  listening,
  onClick,
  disabled,
  title,
  compact,
}: {
  listening: boolean;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled && !listening}
      title={title ?? (listening ? "Stop microphone" : "Dictate with your microphone")}
      aria-pressed={listening}
      className={`relative inline-flex shrink-0 items-center justify-center rounded-xl transition-all duration-200 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45 ${
        compact ? "h-9 w-9" : "h-10 w-10"
      } ${
        listening
          ? "bg-danger/15 text-danger shadow-glow"
          : "border border-hairline bg-surface text-muted hover:border-accent/40 hover:text-accent"
      }`}
    >
      {listening ? (
        <span className="flex h-3.5 w-3.5 items-center justify-center rounded-[3px] bg-current" aria-hidden />
      ) : (
        <IconMic size={compact ? 15 : 16} />
      )}
      {listening && (
        <span className="absolute -right-0.5 -top-0.5 flex h-2.5 w-2.5" aria-hidden>
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-danger/60" />
          <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-danger" />
        </span>
      )}
    </button>
  );
}

/** Small inline interim-transcript line shown while the mic is live. */
export function InterimLine({ text }: { text: string }) {
  if (!text) return null;
  return (
    <p className="animate-rise mt-2 flex items-start gap-2 text-[12.5px] italic leading-relaxed text-faint">
      <IconMic size={13} className="mt-0.5 shrink-0 opacity-60" />
      <span>{text}…</span>
    </p>
  );
}
