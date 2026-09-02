import { useEffect, useState } from "react";
import type { MockInterviewResultRow } from "../../electron/db/db";
import { CATEGORY_LABELS } from "../lib/categoryInfo";
import { usePlan } from "../lib/usePlan";
import { isPro } from "../lib/plan";

export default function Insights() {
  const plan = usePlan();
  const [results, setResults] = useState<MockInterviewResultRow[]>([]);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, { total: number; favorited: number }>>({});

  useEffect(() => {
    if (!isPro(plan, "insights")) return;
    window.api.mockInterview.list().then(setResults);
    window.api.qa.list().then((rows) => {
      const counts: Record<string, { total: number; favorited: number }> = {};
      for (const r of rows) {
        const c = (counts[r.category] ??= { total: 0, favorited: 0 });
        c.total++;
        if (r.favorited) c.favorited++;
      }
      setCategoryCounts(counts);
    });
  }, [plan]);

  if (!isPro(plan, "insights")) {
    return (
      <div className="page max-w-2xl">
        <h1 className="page-title">Insights</h1>
      <p className="page-sub">Where your preparation is paying off — and where it isn't.</p>
        <div className="warn-box">
          <p className="text-sm text-gold">
            Insights is a Pro feature — your weakest categories from Mock Interview scores, plus a full
            breakdown of your Practice activity.
          </p>
          <p className="text-sm text-gold mt-2">
            Preview it in <a href="#/settings" className="underline">Settings &gt; Plan</a>.
          </p>
        </div>
      </div>
    );
  }

  const categoryScores: Record<string, { sum: number; count: number }> = {};
  for (const r of results) {
    if (r.score_num == null) continue;
    for (const cat of r.categories.split(",").filter(Boolean)) {
      const c = (categoryScores[cat] ??= { sum: 0, count: 0 });
      c.sum += r.score_num;
      c.count++;
    }
  }
  const averagesByCategory = Object.entries(categoryScores)
    .map(([category, { sum, count }]) => ({ category, average: sum / count, count }))
    .sort((a, b) => a.average - b.average);

  const scored = results.filter((r) => r.score_num != null);
  const overallAvg = scored.reduce((s, r) => s + (r.score_num ?? 0), 0) / (scored.length || 1);

  return (
    <div className="page max-w-3xl">
      <h1 className="page-title">Insights</h1>
      <p className="page-sub">Where your preparation is paying off — and where it isn't.</p>

      <section className="mb-8">
        <h2 className="section-label mb-2">
          Mock Interview performance
        </h2>
        {results.length === 0 ? (
          <p className="text-[13.5px] leading-relaxed text-muted">
            No Mock Interview sessions yet — complete one to see your weak areas here.
          </p>
        ) : (
          <>
            <p className="text-[13.5px] leading-relaxed text-muted mb-3">
              {results.length} question{results.length === 1 ? "" : "s"} answered · average score{" "}
              {overallAvg.toFixed(1)}/10
            </p>
            <div className="card divide-y divide-hairline overflow-hidden">
              {averagesByCategory.map(({ category, average, count }, i) => (
                <div key={category} className="flex items-center justify-between gap-3 p-3">
                  <div className="text-sm">
                    {CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] ?? category}
                    {i === 0 && (
                      <span className="badge-gold ml-2">
                        weakest
                      </span>
                    )}
                  </div>
                  <div className="text-[13.5px] leading-relaxed text-muted">
                    {average.toFixed(1)}/10 · {count} question{count === 1 ? "" : "s"}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section>
        <h2 className="section-label mb-2">
          Practice activity by category
        </h2>
        {Object.keys(categoryCounts).length === 0 ? (
          <p className="text-[13.5px] leading-relaxed text-muted">No Practice activity yet.</p>
        ) : (
          <div className="card divide-y divide-hairline overflow-hidden">
            {Object.entries(categoryCounts)
              .sort((a, b) => b[1].total - a[1].total)
              .map(([category, { total, favorited }]) => (
                <div key={category} className="flex items-center justify-between gap-3 p-3">
                  <div className="text-sm">
                    {CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] ?? category}
                  </div>
                  <div className="text-[13.5px] leading-relaxed text-muted">
                    {total} answer{total === 1 ? "" : "s"} · {favorited} starred
                  </div>
                </div>
              ))}
          </div>
        )}
      </section>
    </div>
  );
}
