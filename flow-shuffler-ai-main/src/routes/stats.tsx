import { createFileRoute } from "@tanstack/react-router";
import { AppHeader } from "@/components/AppHeader";
import { useAppStore } from "@/lib/store";
import { Flame, Target, Timer } from "lucide-react";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/stats")({
  head: () => ({
    meta: [
      { title: "Stats — Shufflow" },
      { name: "description", content: "Your focus streaks and lifetime wins." },
    ],
  }),
  component: StatsPage,
});

function StatsPage() {
  const t = useT();
  const stats = useAppStore((s) => s.stats);
  const entries = Object.entries(stats).sort((a, b) => (a[0] < b[0] ? 1 : -1));

  const lifetime = entries.reduce(
    (acc, [, v]) => ({
      tasks: acc.tasks + v.tasksCompleted,
      minutes: acc.minutes + v.focusMinutes,
    }),
    { tasks: 0, minutes: 0 },
  );

  const today = new Date();
  let streak = 0;
  for (let i = 0; i < 1000; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const k = d.toISOString().slice(0, 10);
    const v = stats[k];
    if (v && v.focusMinutes > 0) streak++;
    else if (i === 0) continue;
    else break;
  }

  return (
    <div className="pb-16">
      <AppHeader back title={t("stats")} showNav={false} />
      <div className="px-5 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <Stat icon={<Target className="size-4" />} label={t("lifetime_wins")} value={lifetime.tasks} />
          <Stat icon={<Timer className="size-4" />} label={t("focus_min")} value={lifetime.minutes} />
          <Stat icon={<Flame className="size-4" />} label={t("streak")} value={streak} />
        </div>

        <section className="rounded-3xl bg-card border border-border/60 p-4">
          <h2 className="text-sm font-semibold mb-3">{t("day_by_day")}</h2>
          {entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("no_sessions")}</p>
          ) : (
            <ul className="divide-y divide-border">
              {entries.map(([d, v]) => (
                <li key={d} className="py-3 flex items-center justify-between">
                  <span className="text-sm font-medium">{formatDate(d, t)}</span>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>
                      {v.tasksCompleted} {t("wins")}
                    </span>
                    <span>·</span>
                    <span>
                      {v.focusMinutes}
                      {t("minutes")}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-2xl bg-card border border-border/60 p-3">
      <div className="size-8 rounded-xl bg-brand-soft text-brand grid place-items-center">{icon}</div>
      <div className="mt-2 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function formatDate(s: string, t: (k: string) => string) {
  const today = new Date().toISOString().slice(0, 10);
  if (s === today) return t("today");
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  if (s === yest.toISOString().slice(0, 10)) return t("yesterday");
  return new Date(s + "T00:00:00").toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
