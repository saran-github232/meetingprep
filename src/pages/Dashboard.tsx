import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CATEGORY_LABELS } from "../lib/categoryInfo";
import {
  IconArrowRight,
  IconBolt,
  IconCards,
  IconChart,
  IconClock,
  IconCode,
  IconMic,
  IconPractice,
  IconStar,
} from "../components/icons";

function computeStreak(dates: string[]): number {
  const days = new Set(dates.map((d) => new Date(d).toDateString()));
  let streak = 0;
  const cursor = new Date();
  while (days.has(cursor.toDateString())) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

function greeting(): string {
  const h = new Date().getHours();
  if (h < 5) return "Burning the midnight oil";
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [recentCount, setRecentCount] = useState(0);
  const [codingCount, setCodingCount] = useState(0);
  const [favoriteCount, setFavoriteCount] = useState(0);
  const [streak, setStreak] = useState(0);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    Promise.all([window.api.qa.list(), window.api.coding.list()]).then(([qaRows, codingRows]) => {
      setRecentCount(qaRows.length);
      setCodingCount(codingRows.length);
      setFavoriteCount(qaRows.filter((r) => r.favorited).length + codingRows.filter((r) => r.favorited).length);
      setStreak(computeStreak([...qaRows, ...codingRows].map((r) => r.created_at)));

      const counts: Record<string, number> = {};
      for (const r of qaRows) counts[r.category] = (counts[r.category] ?? 0) + 1;
      setCategoryCounts(counts);
      setLoaded(true);
    });
  }, []);

  const topCategories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  const maxCategoryCount = topCategories[0]?.[1] ?? 1;
  const today = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });

  const stats = [
    { label: "Practice sessions", value: recentCount, icon: IconPractice },
    { label: "Coding sessions", value: codingCount, icon: IconCode },
    { label: "Favorites", value: favoriteCount, icon: IconStar },
    { label: "Day streak", value: streak, icon: IconBolt },
  ];

  const quickActions = [
    { label: "Practice a question", desc: "Structured answers, any depth", to: "/practice", icon: IconPractice },
    { label: "Open Coding Lab", desc: "Solve and review problems", to: "/coding-lab", icon: IconCode },
    { label: "Run a mock interview", desc: "Scored, role-tailored questions", to: "/mock-interview", icon: IconMic },
  ];

  return (
    <div className="page max-w-4xl">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="text-[12.5px] font-medium text-faint">{today}</div>
          <h1 className="page-title mt-1">{greeting()}</h1>
          <p className="page-sub">Ready for the next round of preparation?</p>
        </div>
      </div>

      <div className="mt-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className="card-interactive animate-rise p-5"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-accent/20 bg-accent/10 text-accent">
              <s.icon size={15} />
            </div>
            <div className="stat-value mt-4">{s.value}</div>
            <div className="mt-1 text-[12.5px] font-medium text-muted">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-5">
        <div className="card p-5 lg:col-span-3">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-[15px] font-semibold tracking-tight">Practice by category</h2>
            <IconChart size={15} className="text-faint" />
          </div>

          {topCategories.length > 0 ? (
            <div className="mt-5 space-y-3.5">
              {topCategories.map(([category, count]) => (
                <div key={category} className="flex items-center gap-3">
                  <div className="w-32 shrink-0 truncate text-[12.5px] font-medium text-muted">
                    {CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS] ?? category}
                  </div>
                  <div className="meter">
                    <div className="meter-fill" style={{ width: `${(count / maxCategoryCount) * 100}%` }} />
                  </div>
                  <div className="w-6 shrink-0 text-right font-mono text-xs text-faint">{count}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-5 flex items-center gap-3 rounded-xl border border-dashed border-hairline p-4">
              <IconCards size={18} className="shrink-0 text-faint" />
              <p className="text-[13px] leading-relaxed text-muted">
                {loaded
                  ? "No practice activity yet — your first session will show up here."
                  : "Loading your activity…"}
              </p>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3 lg:col-span-2">
          {quickActions.map((a) => (
            <button
              key={a.to}
              onClick={() => navigate(a.to)}
              className="card-interactive group flex flex-1 items-center gap-3.5 p-4 text-left"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-raised text-muted transition-colors group-hover:bg-accent/10 group-hover:text-accent">
                <a.icon size={16} />
              </div>
              <div className="min-w-0">
                <div className="text-[13.5px] font-semibold tracking-tight">{a.label}</div>
                <div className="truncate text-[12px] text-faint">{a.desc}</div>
              </div>
              <IconArrowRight
                size={14}
                className="ml-auto shrink-0 text-faint opacity-0 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-accent group-hover:opacity-100"
              />
            </button>
          ))}
        </div>
      </div>

      {streak > 0 && (
        <div className="mt-6 flex items-center gap-3 rounded-xl border border-gold/25 bg-gold/10 px-4 py-3">
          <IconBolt size={16} className="shrink-0 text-gold" />
          <p className="text-[13px] font-medium text-gold">
            {streak}-day streak — keep it alive with one session today.
          </p>
          <IconClock size={14} className="ml-auto shrink-0 text-gold/60" />
        </div>
      )}
    </div>
  );
}
