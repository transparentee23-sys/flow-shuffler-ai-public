import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Edit3, Loader2, Plus, Sparkles, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { breakdownTask, nameFlow } from "@/lib/ai.functions";
import { useAppStore } from "@/lib/store";
import type { AccentColor, Difficulty, Flow, Priority, Recurrence, Task } from "@/lib/types";
import { ACCENT_PALETTE, colorForFlow, uid } from "@/lib/utils-flow";
import { AppHeader } from "@/components/AppHeader";
import { StepEditor } from "@/components/StepEditor";
import { ThemeApplier } from "@/components/ThemeApplier";
import { Cube, type CubePieceState } from "@/components/cube/Cube";
import { useT, getLang } from "@/lib/i18n";
import { toast } from "sonner";

export const Route = createFileRoute("/flows/new")({
  head: () => ({
    meta: [
      { title: "New flow — Shufflow" },
      { name: "description", content: "Turn a goal into a tiny series of focused wins." },
    ],
  }),
  component: () => <CreateOrEdit mode="new" />,
});

export function CreateOrEdit({ mode }: { mode: "new" | "edit" }) {
  const t = useT();
  const navigate = useNavigate();
  const params = useParams({ strict: false }) as { flowId?: string };
  const upsert = useAppStore((s) => s.upsertFlow);
  const existing = useAppStore((s) => s.flows.find((f) => f.id === params.flowId));
  const defaultDifficulty = useAppStore((s) => s.settings.defaultDifficulty);
  const defaultDetailLevel = useAppStore((s) => s.settings.defaultDetailLevel ?? 3);
  const breakdown = useServerFn(breakdownTask);
  const autoName = useServerFn(nameFlow);

  const [flow, setFlow] = useState<Flow>(() => existing ?? blankFlow());
  const [titleVisible, setTitleVisible] = useState<boolean>(mode === "edit" || !!existing?.title);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draftTitle, setDraftTitle] = useState("");
  const [loading, setLoading] = useState(false);
  const [composerDifficulty, setComposerDifficulty] = useState<Difficulty>(defaultDifficulty);
  const [composerDetail, setComposerDetail] = useState<number>(defaultDetailLevel);
  const [composerPriority, setComposerPriority] = useState<Priority>("normal");
  const taskRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  // Auto-save when editing
  useEffect(() => {
    if (mode !== "edit" || !existing) return;
    const tm = setTimeout(() => upsert(flow), 400);
    return () => clearTimeout(tm);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flow, mode]);

  const addTask = async () => {
    const title = draftTitle.trim();
    if (!title) return;
    setLoading(true);
    const newId = uid();
    try {
      const res = await breakdown({
        data: { title, difficulty: composerDifficulty, detailLevel: composerDetail, lang: getLang() },
      });
      const task: Task = {
        id: newId,
        title,
        emoji: res.emoji || "✨",
        status: "pending",
        priority: composerPriority,
        difficulty: composerDifficulty,
        steps: res.steps.map((s) => ({
          id: uid(),
          title: s.title,
          durationMinutes: s.durationMinutes,
          isCompleted: false,
        })),
        isRecurring: false,
        recurrence: { kind: "one-time" },
      };
      setFlow((f) => ({
        ...f,
        emoji: f.emoji && f.emoji !== "✨" ? f.emoji : res.emoji || "✨",
        tasks: [...f.tasks, task],
      }));
      setDraftTitle("");
      setComposerOpen(false);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "AI failed";
      if (msg === "RATE_LIMIT") toast.error(t("too_many_requests"));
      else if (msg === "PAYMENT_REQUIRED") toast.error(t("ai_credits_out"));
      else toast.error(t("ai_failed"));
      const task: Task = {
        id: newId,
        title,
        emoji: "✨",
        status: "pending",
        priority: composerPriority,
        difficulty: composerDifficulty,
        steps: [{ id: uid(), title, durationMinutes: 15, isCompleted: false }],
        isRecurring: false,
        recurrence: { kind: "one-time" },
      };
      setFlow((f) => ({ ...f, tasks: [...f.tasks, task] }));
      setDraftTitle("");
      setComposerOpen(false);
    } finally {
      setLoading(false);
      requestAnimationFrame(() => {
        const node = taskRefs.current.get(newId);
        node?.scrollIntoView({ block: "center", behavior: "smooth" });
      });
    }
  };

  const save = async () => {
    if (flow.tasks.length === 0) {
      toast.error(t("add_title_first"));
      return;
    }
    let final = flow;
    if (!final.title.trim()) {
      try {
        const named = await autoName({
          data: { taskTitles: final.tasks.map((tk) => tk.title), lang: getLang() },
        });
        final = { ...final, title: named.title || "Flow", emoji: named.emoji || final.emoji };
      } catch {
        final = { ...final, title: final.tasks[0].title.slice(0, 40) };
      }
    }
    upsert(final);
    toast.success(mode === "new" ? t("flow_created") : t("saved"));
    navigate({ to: "/" });
  };

  const totalMin = useMemo(
    () => flow.tasks.reduce((a, tk) => a + tk.steps.reduce((b, s) => b + s.durationMinutes, 0), 0),
    [flow.tasks],
  );

  const accent = colorForFlow(flow);

  // Cube pieces: one per step across all active tasks (up to 8)
  const cubePieces: CubePieceState[] = useMemo(() => {
    const steps = flow.tasks
      .filter((tk) => tk.status !== "completed")
      .flatMap((tk) => tk.steps.map((s) => ({ id: s.id, done: s.isCompleted })));
    return steps.slice(0, 8);
  }, [flow.tasks]);
  // 1 → fully scattered when empty, 0.25 → gently apart when built
  const explode = cubePieces.length === 0 ? 1 : 0.3;

  return (
    <div className="pb-32" data-accent={accent}>
      <ThemeApplier override={accent} />
      <AppHeader back title={mode === "new" ? t("new_flow") : t("edit_flow")} showNav={false} />

      <div className="flex flex-col items-center pt-2 pb-4">
        <Cube size={120} pieces={cubePieces} explode={explode} />
        <p className="mt-3 text-xs text-muted-foreground text-center max-w-xs px-6">
          {t("create_cube_hint")}
        </p>
      </div>

      <div className="px-5 space-y-4">

        {titleVisible ? (
          <div>
            <label className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("flow_title_label")}
            </label>
            <input
              value={flow.title}
              onChange={(e) => setFlow((f) => ({ ...f, title: e.target.value }))}
              placeholder={t("flow_title_placeholder")}
              className="mt-1 w-full h-12 rounded-2xl bg-card border border-border px-4 outline-none focus:ring-2 focus:ring-brand/40"
            />
          </div>
        ) : (
          <button
            onClick={() => setTitleVisible(true)}
            className="w-full text-left text-xs text-muted-foreground inline-flex items-center gap-1.5 px-1"
          >
            <Edit3 className="size-3.5" /> {t("flow_title_auto_hint")}
          </button>
        )}


        <ColorPicker
          value={accent}
          onChange={(c) => setFlow((f) => ({ ...f, color: c }))}
        />

        {flow.tasks.length === 0 ? (
          <div className="text-center py-12 rounded-3xl border border-dashed border-border/70 bg-card/40">
            <div className="size-14 mx-auto rounded-2xl bg-brand-soft grid place-items-center">
              <Sparkles className="size-6 text-brand" />
            </div>
            <p className="mt-3 text-sm text-muted-foreground">{t("break_down_hint")}</p>
            <button
              onClick={() => setComposerOpen(true)}
              className="mt-4 h-11 px-5 rounded-2xl bg-brand text-brand-foreground font-medium inline-flex items-center gap-2"
            >
              <Plus className="size-4" /> {t("add_task")}
            </button>
          </div>
        ) : (
          <>
            <div className="space-y-4">
              {flow.tasks
                .filter((tk) => tk.status !== "completed")
                .map((tk) => (
                  <div
                    key={tk.id}
                    ref={(el) => {
                      if (el) taskRefs.current.set(tk.id, el);
                      else taskRefs.current.delete(tk.id);
                    }}
                  >
                    <TaskBlock
                      task={tk}
                      onChange={(patch) =>
                        setFlow((f) => ({
                          ...f,
                          tasks: f.tasks.map((x) => (x.id === tk.id ? { ...x, ...patch } : x)),
                        }))
                      }
                      onDelete={() =>
                        setFlow((f) => ({ ...f, tasks: f.tasks.filter((x) => x.id !== tk.id) }))
                      }
                    />
                  </div>
                ))}
            </div>
            <CompletedSection
              tasks={flow.tasks.filter((tk) => tk.status === "completed")}
              onReopen={(id) =>
                setFlow((f) => ({
                  ...f,
                  tasks: f.tasks.map((x) =>
                    x.id === id
                      ? {
                          ...x,
                          status: "pending",
                          lastCompletedAt: undefined,
                          steps: x.steps.map((s) => ({ ...s, isCompleted: false })),
                        }
                      : x,
                  ),
                }))
              }
              onDelete={(id) =>
                setFlow((f) => ({ ...f, tasks: f.tasks.filter((x) => x.id !== id) }))
              }
            />
          </>
        )}

        {flow.tasks.length > 0 && (
          <div className="rounded-3xl bg-card border border-border/60 p-4">
            <label className="text-xs uppercase tracking-wide text-muted-foreground">
              {t("routine_q")}
            </label>
            <div className="mt-2 flex items-center justify-between">
              <span className="text-sm">{t("repeat_daily")}</span>
              <Switch
                on={flow.isRecurring}
                onChange={(v) => {
                  setFlow((f) => ({
                    ...f,
                    isRecurring: v,
                    tasks: f.tasks.map((tk) => {
                      if (v && tk.recurrence.kind === "one-time") {
                        return { ...tk, isRecurring: true, recurrence: { kind: "daily" } };
                      }
                      if (!v && tk.recurrence.kind === "daily") {
                        return { ...tk, isRecurring: false, recurrence: { kind: "one-time" } };
                      }
                      return tk;
                    }),
                  }));
                }}
              />
            </div>
            <div className="mt-3 text-xs text-muted-foreground">
              {t("total_time")}:{" "}
              <span className="font-medium text-foreground">{totalMin}m</span>
            </div>
          </div>
        )}
      </div>

      {/* Floating add task composer */}
      {composerOpen && (
        <div
          className="fixed inset-0 z-30 bg-background/40 backdrop-blur-sm flex items-end"
          onClick={() => !loading && setComposerOpen(false)}
        >
          <div
            className="w-full max-w-xl mx-auto bg-card rounded-t-3xl p-5 pb-8 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="font-semibold inline-flex items-center gap-1.5">
                <Sparkles className="size-4 text-brand" /> {t("small_win_label")}
              </p>
              <button
                onClick={() => setComposerOpen(false)}
                className="size-8 grid place-items-center rounded-full hover:bg-muted"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="mb-3">
              <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {t("difficulty")}
              </label>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
                  <button
                    key={d}
                    onClick={() => setComposerDifficulty(d)}
                    className={`h-10 rounded-xl text-sm font-medium transition ${
                      composerDifficulty === d
                        ? "bg-brand text-brand-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/70"
                    }`}
                  >
                    {t(`difficulty_${d}`)}
                  </button>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">{t("difficulty_hint")}</p>
            </div>
            <div className="mb-3">
              <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {t("breakdown_detail")}
              </label>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                {([
                  { v: 1, k: "detail_chunky" },
                  { v: 3, k: "detail_balanced" },
                  { v: 5, k: "detail_micro" },
                ] as const).map((opt) => (
                  <button
                    key={opt.v}
                    onClick={() => setComposerDetail(opt.v)}
                    className={`h-10 rounded-xl text-sm font-medium transition ${
                      composerDetail === opt.v
                        ? "bg-brand text-brand-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/70"
                    }`}
                  >
                    {t(opt.k)}
                  </button>
                ))}
              </div>
            </div>
            <div className="mb-3">
              <label className="text-[11px] uppercase tracking-wide text-muted-foreground">
                {t("priority_label")}
              </label>
              <div className="mt-1.5 grid grid-cols-3 gap-2">
                {([
                  { v: "quick" as Priority, sub: "priority_low_sub" },
                  { v: "normal" as Priority, sub: "priority_med_sub" },
                  { v: "focused" as Priority, sub: "priority_high_sub" },
                ]).map((opt) => (
                  <button
                    key={opt.v}
                    onClick={() => setComposerPriority(opt.v)}
                    className={`h-12 rounded-xl text-[11px] font-medium leading-tight transition flex flex-col items-center justify-center px-1 ${
                      composerPriority === opt.v
                        ? "bg-brand text-brand-foreground"
                        : "bg-muted text-muted-foreground hover:bg-muted/70"
                    }`}
                  >
                    <span>{t(opt.v)}</span>
                    <span className="text-[10px] opacity-70">{t(opt.sub)}</span>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <input
                autoFocus
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && !loading && addTask()}
                placeholder={t("small_win_placeholder")}
                className="flex-1 h-12 rounded-2xl bg-muted px-4 outline-none focus:ring-2 focus:ring-brand/40"
              />
              <button
                onClick={addTask}
                disabled={loading || !draftTitle.trim()}
                className="h-12 px-5 rounded-2xl bg-brand text-brand-foreground font-medium disabled:opacity-50"
              >
                {loading ? <Loader2 className="size-4 animate-spin" /> : t("break_down")}
              </button>
            </div>
            <p className="mt-2 text-xs text-muted-foreground">{t("break_down_hint")}</p>
          </div>
        </div>
      )}

      {/* Bottom action bar with save + add-task FAB */}
      <div className="fixed bottom-0 inset-x-0 max-w-xl mx-auto p-5 pt-3 bg-gradient-to-t from-background via-background/95 to-transparent">
        <div className="flex gap-2 items-center">
          <button
            onClick={save}
            disabled={flow.tasks.length === 0}
            className="flex-1 h-14 rounded-2xl bg-brand text-brand-foreground font-semibold disabled:opacity-50"
          >
            {mode === "new" ? t("create_flow") : t("save_changes")}
          </button>
          <button
            onClick={() => setComposerOpen(true)}
            className="size-14 rounded-2xl bg-foreground text-background grid place-items-center shadow-glow"
            aria-label={t("add_task")}
          >
            <Plus className="size-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function blankFlow(): Flow {
  return {
    id: uid(),
    title: "",
    emoji: "✨",
    tags: [],
    tasks: [],
    totalDurationMinutes: 0,
    progress: 0,
    isRecurring: false,
    status: "active",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
}

function ColorPicker({
  value,
  onChange,
}: {
  value: AccentColor;
  onChange: (c: AccentColor) => void;
}) {
  const t = useT();
  return (
    <div className="rounded-3xl bg-card border border-border/60 p-4">
      <label className="text-xs uppercase tracking-wide text-muted-foreground">
        {t("flow_color")}
      </label>
      <div className="mt-3 flex gap-2">
        {ACCENT_PALETTE.map((c) => (
          <button
            key={c}
            onClick={() => onChange(c)}
            data-accent={c}
            className={`size-8 rounded-full bg-brand transition ${
              value === c ? "ring-2 ring-foreground/70 ring-offset-2 ring-offset-card" : ""
            }`}
            aria-label={c}
          />
        ))}
      </div>
    </div>
  );
}

function TaskBlock({
  task,
  onChange,
  onDelete,
}: {
  task: Task;
  onChange: (p: Partial<Task>) => void;
  onDelete: () => void;
}) {
  const t = useT();
  const priorities: Priority[] = ["quick", "normal", "focused"];
  const recOptions: { label: string; value: Recurrence }[] = [
    { label: t("one_time"), value: { kind: "one-time" } },
    { label: t("daily"), value: { kind: "daily" } },
    { label: t("every_2d"), value: { kind: "interval", days: 2 } },
    { label: t("weekly"), value: { kind: "weekly", weekdays: [1] } },
  ];
  return (
    <div className="rounded-3xl bg-card border border-border/60 p-4">
      <div className="flex items-center gap-3">
        <div className="size-11 rounded-2xl bg-brand-soft grid place-items-center text-2xl">
          {task.emoji}
        </div>
        <div className="flex-1 min-w-0">
          <input
            value={task.title}
            onChange={(e) => onChange({ title: e.target.value })}
            className="w-full bg-transparent font-semibold outline-none"
          />
        </div>
        <button onClick={onDelete} className="text-xs text-muted-foreground hover:text-destructive">
          {t("remove")}
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {priorities.map((p) => (
          <button
            key={p}
            onClick={() => onChange({ priority: p })}
            className={`text-xs px-3 h-8 rounded-full font-medium ${
              task.priority === p
                ? "bg-brand text-brand-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {t(p)}
          </button>
        ))}
        <span className="w-px bg-border mx-1" />
        {recOptions.map((r) => (
          <button
            key={r.label}
            onClick={() =>
              onChange({
                isRecurring: r.value.kind !== "one-time",
                recurrence: r.value,
              })
            }
            className={`text-xs px-3 h-8 rounded-full font-medium ${
              task.recurrence.kind === r.value.kind
                ? "bg-foreground text-background"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-1.5 flex-wrap">
        <span className="text-[11px] uppercase tracking-wide text-muted-foreground mr-1">
          {t("difficulty")}
        </span>
        {(["easy", "medium", "hard"] as Difficulty[]).map((d) => (
          <button
            key={d}
            onClick={() => onChange({ difficulty: d })}
            className={`text-xs px-3 h-7 rounded-full font-medium ${
              (task.difficulty ?? "medium") === d
                ? "bg-brand-soft text-brand"
                : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {t(`difficulty_${d}`)}
          </button>
        ))}
      </div>

      <div className="mt-4">
        <StepEditor steps={task.steps} onChange={(steps) => onChange({ steps })} />
      </div>
    </div>
  );
}

function Switch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!on)}
      className={`w-11 h-6 rounded-full p-0.5 transition ${on ? "bg-brand" : "bg-muted"}`}
      aria-pressed={on}
    >
      <span
        className={`block size-5 rounded-full bg-card shadow transition-transform ${
          on ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
}

function CompletedSection({
  tasks,
  onReopen,
  onDelete,
}: {
  tasks: Task[];
  onReopen: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (tasks.length === 0) return null;
  return (
    <div className="mt-4 rounded-3xl bg-card border border-border/60 overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between px-4 h-12 text-sm font-medium"
      >
        <span className="inline-flex items-center gap-2">
          <span className="text-muted-foreground">{t("completed_section")}</span>
          <span className="size-5 rounded-full bg-muted text-[10px] grid place-items-center tabular-nums">
            {tasks.length}
          </span>
        </span>
        <span className="text-xs text-muted-foreground">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <ul className="divide-y divide-border/60">
          {tasks.map((tk) => (
            <li key={tk.id} className="px-4 py-3 flex items-center gap-3">
              <span className="text-xl">{tk.emoji}</span>
              <span className="flex-1 text-sm line-through text-muted-foreground break-words">
                {tk.title}
              </span>
              <button
                onClick={() => onReopen(tk.id)}
                className="h-8 px-3 rounded-full bg-muted text-xs font-medium"
              >
                {t("reopen")}
              </button>
              <button
                onClick={() => onDelete(tk.id)}
                className="text-xs text-muted-foreground hover:text-destructive"
                aria-label={t("remove")}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
