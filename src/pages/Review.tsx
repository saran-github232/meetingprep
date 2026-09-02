import { useEffect, useState } from "react";
import type { QAHistoryRow, CodingHistoryRow } from "../../electron/db/db";
import { parseStructuredAnswer, parseCodeAnswer } from "../lib/parseAnswer";
import { Section, BulletSection } from "../components/AnswerSections";

function rawOf(json: string): string {
  try {
    return (JSON.parse(json) as { raw?: string }).raw ?? json;
  } catch {
    return json;
  }
}

type Card = { kind: "qa"; row: QAHistoryRow } | { kind: "coding"; row: CodingHistoryRow };

export default function Review() {
  const [queue, setQueue] = useState<Card[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(true);

  function refresh() {
    setLoading(true);
    Promise.all([window.api.qa.listDue(), window.api.coding.listDue()]).then(([qa, coding]) => {
      setQueue([
        ...qa.map((row): Card => ({ kind: "qa", row })),
        ...coding.map((row): Card => ({ kind: "coding", row })),
      ]);
      setRevealed(false);
      setLoading(false);
    });
  }

  useEffect(refresh, []);

  async function answer(remembered: boolean) {
    const current = queue[0];
    if (!current) return;
    if (current.kind === "qa") await window.api.qa.review(current.row.id, remembered);
    else await window.api.coding.review(current.row.id, remembered);
    setQueue((q) => q.slice(1));
    setRevealed(false);
  }

  const card = queue[0];

  return (
    <div className="page max-w-3xl">
      <h1 className="page-title mb-2">Review</h1>
      <p className="text-[13.5px] leading-relaxed text-muted mb-6">
        Starred answers resurface here on a spaced schedule — recall it, then say whether you got it.
      </p>

      {loading && <p className="text-sm text-faint">Loading…</p>}

      {!loading && !card && (
        <p className="text-[13.5px] leading-relaxed text-muted">
          Nothing due for review. Star answers in History or Coding Lab to add them to rotation.
        </p>
      )}

      {card && (
        <div className="card p-5">
          <div className="flex items-center justify-between gap-3 mb-3">
            <span className="text-sm font-medium">{card.row.question}</span>
            <span className="text-xs text-faint shrink-0">
              {queue.length} due · {"category" in card.row ? card.row.category : card.row.language}
            </span>
          </div>

          {!revealed && (
            <button
              onClick={() => setRevealed(true)}
              className="btn-primary"
            >
              Show answer
            </button>
          )}

          {revealed && (
            <>
              <div className="space-y-3 mb-4">
                {card.kind === "qa"
                  ? (() => {
                      const parsed = parseStructuredAnswer(rawOf(card.row.answer_json));
                      return (
                        <>
                          <Section title="Answer" text={parsed.answer} />
                          <Section title="Why" text={parsed.why} />
                          <BulletSection title="Key Points" items={parsed.keyPoints} />
                        </>
                      );
                    })()
                  : (() => {
                      const parsed = parseCodeAnswer(rawOf(card.row.explanation_json), card.row.language);
                      return (
                        <>
                          <pre className="code-block whitespace-pre-wrap">
                            {card.row.code || parsed.code}
                          </pre>
                          <Section title="Explanation" text={parsed.explanation} />
                        </>
                      );
                    })()}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => answer(true)}
                  className="btn-primary"
                >
                  Got it
                </button>
                <button
                  onClick={() => answer(false)}
                  className="btn-danger"
                >
                  Review again
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
