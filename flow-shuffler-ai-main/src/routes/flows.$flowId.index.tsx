import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Edit, Play, Sparkles, Trash2 } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";
import { AppHeader } from "@/components/AppHeader";
import { ThemeApplier } from "@/components/ThemeApplier";
import { Cube, type CubePieceState } from "@/components/cube/Cube";
import { useT, getLang } from "@/lib/i18n";
import { colorForFlow, remainingDuration, spentDuration } from "@/lib/utils-flow";
import { flowSummary } from "@/lib/ai.functions";

export const Route = createFileRoute("/flows/$flowId/")({
  head: () => ({ meta: [{ title: "Flow — Shufflow" }] }),
  component: FlowDetail,
});

function FlowDetail() {
  const { flowId } = useParams({ from: "/flows/$flowId/" });
  const t = useT();
  const navigate = useNavigate();
  const flow = useAppStore((s) => s.flows.find((f) => f.id === flowId));
  const deleteFlow = useAppStore((s) => s.deleteFlow);
  const summarize = useServerFn(flowSummary);

  const [overview, setOverview] = useState<{ headline: string; bullets: string[] } | null>(null);
  const [loading, setLoading] = useState(false);

  const done = useMemo(
    () => flow?.tasks.flatMap((tk) => tk.steps.filter((s) => s.isCompleted).map((s) => s.title)) ?? [],
    [flow],
  );
  const todo = useMemo(
    () => flow?.tasks.flatMap((tk) => tk.steps.filter((s) => !s.isCompleted).map((s) => s.title)) ?? [],
    [flow],
  );

  useEffect(() => {
    if (!flow) return;
    let cancelled = false;
    setLoading(true);
    summarize({
      data: { title: flow.title, done, todo, lang: getLang() },
    })
      .then((r) => !cancelled && setOverview(r))
      .catch(() => {})
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowId]);

  if (!flow) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">{t("flow_not_found")}</p>
      </div>
    );
  }

  const accent = colorForFlow(flow);
  const finished = flow.tasks.filter((x) => x.status === "completed").length;
  const unfinished = flow.tasks.length - finished;
  const spent = spentDuration(flow);
  const left = remainingDuration(flow);
  const sessions = flow.sessions ?? [];
  const lastSession = sessions[sessions.length - 1];

  // Cube pieces: reassemble as tasks complete
  const cubePieces: CubePieceState[] = useMemo(() => {
    const list = flow.tasks.slice(0, 8).map((tk) => ({
      id: tk.id,
      done: tk.status === "completed",
    }));
    return list;
  }, [flow.tasks]);
  const donePieces = cubePieces.filter((p) => p.done).length;
  const totalPieces = cubePieces.length || 1;
  const explode = 0.6 * (1 - donePieces / totalPieces);

  return (
    <div className="pb-32" data-accent={accent}>
      <ThemeApplier override={accent} />
      <AppHeader back title={flow.title} showNav={false} />
      <div className="px-5 space-y-5">
        <div className="flex flex-col items-center pt-2 pb-4">
          <Cube size={130} pieces={cubePieces} explode={explode} />
          <div className="mt-3 text-center">
            <h1 className="text-lg font-semibold break-words">{flow.title}</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {donePieces}/{cubePieces.length} {t("cube_progress")}
            </p>
          </div>
        </div>


        <div className="grid grid-cols-2 gap-3">
          <Stat label={t("finished")} value={`${finished}`} />
          <Stat label={t("unfinished")} value={`${unfinished}`} />
          <Stat label={t("time_spent")} value={`${spent}m`} />
          <Stat label={t("time_to_go")} value={`${left}m`} />
          <Stat label={t("actual_time")} value={`${Math.round(flow.actualMinutesSpent ?? 0)}m`} />
          <Stat label={t("times_completed")} value={`${flow.completionCount ?? 0}`} />
          <Stat
            label={t("last_session")}
            value={lastSession ? `${Math.round(lastSession.minutes)}m` : "—"}
          />
          <Stat label={t("sessions_count")} value={`${sessions.length}`} />
        </div>

        {sessions.length > 0 && (
          <section className="rounded-3xl bg-card border border-border/60 p-4">
            <h2 className="text-sm font-semibold mb-2">{t("recent_sessions")}</h2>
            <ul className="divide-y divide-border">
              {sessions.slice(-5).reverse().map((s, i) => (
                <li key={i} className="py-2 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {new Date(s.ts).toLocaleString(undefined, {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  <span className="font-medium tabular-nums">{Math.round(s.minutes)}m</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="rounded-3xl bg-card border border-border/60 p-4">
          <h2 className="text-sm font-semibold inline-flex items-center gap-2">
            <Sparkles className="size-4 text-brand" /> {t("things_to_do")}
          </h2>
          {loading && !overview ? (
            <div className="mt-3 space-y-2">
              <div className="h-3 rounded bg-muted animate-pulse w-3/4" />
              <div className="h-3 rounded bg-muted animate-pulse w-2/3" />
            </div>
          ) : overview ? (
            <div className="mt-3">
              <p className="text-sm">{overview.headline}</p>
              <ul className="mt-2 space-y-1.5">
                {overview.bullets.map((b, i) => (
                  <li key={i} className="text-sm text-muted-foreground flex gap-2">
                    <span className="text-brand">•</span>
                    <span>{b}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">—</p>
          )}
        </section>

        <section className="space-y-2">
          {flow.tasks.map((tk) => {
            const tDone = tk.steps.filter((s) => s.isCompleted).length;
            const isDone = tk.status === "completed";
            return (
              <button
                key={tk.id}
                onClick={() => {
                  if (typeof window !== "undefined") {
                    sessionStorage.setItem("startTaskId", tk.id);
                  }
                  navigate({
                    to: "/flows/$flowId/run",
                    params: { flowId: flow.id },
                  });
                }}
                disabled={isDone}
                className={`w-full text-left rounded-2xl bg-card border border-border/60 p-4 flex items-center gap-3 transition ${
                  isDone ? "opacity-60" : "hover:border-brand/40"
                }`}
              >
                <div className="size-10 rounded-xl bg-brand-soft grid place-items-center text-xl shrink-0">
                  {tk.emoji}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium break-words">{tk.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {tDone}/{tk.steps.length} · {tk.steps.reduce((a, s) => a + s.durationMinutes, 0)}m
                  </p>
                </div>
                {!isDone && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold text-brand">
                    <Play className="size-3.5 fill-current" /> {t("start")}
                  </span>
                )}
              </button>
            );
          })}
        </section>
      </div>

      <div className="fixed bottom-0 inset-x-0 max-w-xl mx-auto p-5 pt-3 bg-gradient-to-t from-background via-background/95 to-transparent">
        <div className="flex gap-2">
          <Link
            to="/flows/$flowId/run"
            params={{ flowId: flow.id }}
            className="flex-1 h-14 rounded-2xl bg-brand text-brand-foreground font-semibold inline-flex items-center justify-center gap-2"
          >
            <Play className="size-5 fill-current" /> {t("play")}
          </Link>
          <Link
            to="/flows/$flowId/edit"
            params={{ flowId: flow.id }}
            className="h-14 px-5 rounded-2xl bg-muted font-medium inline-flex items-center gap-2"
          >
            <Edit className="size-4" /> {t("edit")}
          </Link>
          <button
            onClick={() => {
              deleteFlow(flow.id);
              toast.success(t("flow_deleted"));
              navigate({ to: "/" });
            }}
            className="h-14 px-4 rounded-2xl bg-muted text-destructive inline-flex items-center"
            aria-label={t("delete")}
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-card border border-border/60 p-3">
      <div className="text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
