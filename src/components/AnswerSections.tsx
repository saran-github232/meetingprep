import { inlineMarkdownHtml } from "../lib/markdown";

/** AI text rendered with inline markdown (bold/italic/code) — used everywhere answers display. */
export function MarkdownText({ text, className }: { text: string; className?: string }) {
  return (
    <div
      className={`whitespace-pre-wrap [&_code]:rounded [&_code]:bg-raised [&_code]:px-1 [&_code]:font-mono [&_code]:text-[0.92em] ${className ?? ""}`}
      dangerouslySetInnerHTML={{ __html: inlineMarkdownHtml(text) }}
    />
  );
}

export function Section({ title, text }: { title: string; text: string }) {
  if (!text) return null;
  return (
    <div>
      <div className="section-label mb-1.5">{title}</div>
      <MarkdownText text={text} className="text-[13.5px] leading-relaxed text-fg/90" />
    </div>
  );
}

export function BulletSection({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div>
      <div className="section-label mb-1.5">{title}</div>
      <ul className="space-y-1.5 text-[13.5px] leading-relaxed text-fg/90">
        {items.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-accent" aria-hidden />
            <MarkdownText text={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}
