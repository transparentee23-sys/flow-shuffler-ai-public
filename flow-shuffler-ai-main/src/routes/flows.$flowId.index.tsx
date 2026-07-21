import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Loader as Loader2, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";
import { ObjectCube, type Piece } from "@/components/cube/ObjectCube";
import { ThemeApplier } from "@/components/ThemeApplier";
import { breakdownTask } from "@/lib/ai.functions";
import { useT, getLang } from "@/lib/i18n";
import { colorForFlow, uid } from "@/lib/utils-flow";
import type { Task } from "@/lib/types";

export const Route = createFileRoute("/flows/$flowId/")({
  head: () => ({ meta: [{ title: "Flow — Shufflow" }] }),
  component: FlowOverview,
});

function FlowOverview() {
  const { flowId } = useParams({ from: "/flows/$flowId/" });
  const t = useT();
  const navigate = useNavigate();
  const flow = useAppStore((s) => s.flows.find((f) => f.id === flowId));
  const upsertFlow = useAppStore((s) => s.upsertFlow);
  const breakdown = useServerFn(breakdownTask);

  const [selectedPiece, setSelectedPiece] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);

  const tasks = flow?.tasks ?? [];
  const pieces: Piece[] = useMemo(() => {
    const list: Piece[] = tasks.slice(0, 7).map((tk) => ({
      id: tk.id,
      done: tk.status === "completed",
      active: tk.status === "in-progress",
      icon: <span className="text-xs">{tk.emoji}</span>,
    }));
    // Add a transparent "create" slot if room
    if (list.length < 8) list.push({ id: "__create__", done: false, icon: <span className="text-base opacity-40">+</span> });
    return list;
  }, [tasks]);

  const doneCount = pieces.filter((p) => p.done).length;
  const explode = 0.4 * (1 - doneCount / Math.max(1, pieces.length));

  if (!flow) {
    return (
      <div className="min-h-screen grid place-items-center">
        <p className="text-sm text-muted-foreground">{t("flow_not_found")}</p>
      </div>
    );
  }

  const accent = colorForFlow(flow);

  const handlePieceClick = (id: string) => {
    if (id === "__create__") {
      setCreating(true);
      return;
    }
    setSelectedPiece(id);
  };

  const createTask = async () => {
    const title = draft.trim();
    if (!title || !flow) return;
    setLoading(true);
    const newId = uid();
    try {
      const res = await breakdown({
        data: { title, lang: getLang() },
      });
      const task: Task = {
        id: newId,
        title,
        emoji: res.emoji || "✨",
        status: "pending",
        priority: "normal",
        steps: res.steps.map((s) => ({
          id: uid(),
          title: s.title,
          durationMinutes: s.durationMinutes,
          isCompleted: false,
        })),
        isRecurring: false,
        recurrence: { kind: "one-time" },
      };
      upsertFlow({ ...flow, tasks: [...flow.tasks, task] });
      setDraft("");
      setCreating(false);
      // Enter the new task's run mode
      if (typeof window !== "undefined") sessionStorage.setItem("startTaskId", newId);
      navigate({ to: "/flows/$flowId/run", params: { flowId: flow.id } });
    } catch {
      toast.error(t("ai_failed"));
      const task: Task = {
        id: newId,
        title,
        emoji: "✨",
        status: "pending",
        priority: "normal",
        steps: [{ id: uid(), title, durationMinutes: 15, isCompleted: false }],
        isRecurring: false,
        recurrence: { kind: "one-time" },
      };
      upsertFlow({ ...flow, tasks: [...flow.tasks, task] });
      setDraft("");
      setCreating(false);
      if (typeof window !== "undefined") sessionStorage.setItem("startTaskId", newId);
      navigate({ to: "/flows/$flowId/run", params: { flowId: flow.id } });
    } finally {
      setLoading(false);
    }
  };

  const selectedTask = tasks.find((tk) => tk.id === selectedPiece);

  return (
    <div className="min-h-screen flex flex-col" data-accent={accent}>
      <ThemeApplier override={accent} />

      {/* Minimal header — just exit */}
      <div className="flex justify-end p-5">
        <button
          onClick={() => navigate({ to: "/" })}
          className="size-10 rounded-full grid place-items-center hover:bg-muted transition"
          aria-label={t("close")}
        >
          <X className="size-5" />
        </button>
      </div>

      {/* The Flow Cube — the organizing structure */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground/60 mb-1">
          {t("obj_hint_flow")}
        </p>
        <h1 className="text-lg font-medium tracking-tight mb-8 text-center max-w-xs break-words">
          {flow.title}
        </h1>

        <ObjectCube
          state="flow"
          size={220}
          pieces={pieces}
          explode={explode}
          hint={t("obj_add_piece")}
          onPieceClick={handlePieceClick}
        />

        <p className="mt-6 text-xs text-muted-foreground/70">
          {doneCount}/{pieces.length} {t("obj_pieces_count")} ·{" "}
          {pieces.length - doneCount} {t("obj_active_pieces")} · {doneCount}{" "}
          {t("obj_completed_pieces")}
        </p>
      </div>

      {/* Selected piece detail — progressive disclosure */}
      {selectedTask && (
        <PieceDetail
          task={selectedTask}
          onClose={() => setSelectedPiece(null)}
          onStart={() => {
            if (typeof window !== "undefined") sessionStorage.setItem("startTaskId", selectedTask.id);
            navigate({ to: "/flows/$flowId/run", params: { flowId: flow.id } });
          }}
        />
      )}

      {/* Create piece — expanding input */}
      {creating && (
        <div className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm flex items-center justify-center p-6">
          <div className="w-full max-w-sm">
            <div className="rounded-3xl bg-card border border-border/60 p-6 shadow-2xl">
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
                {t("obj_add_piece")}
              </p>
              <p className="text-sm text-foreground/80 mb-4">{t("obj_create_prompt")}</p>
              <textarea
                autoFocus
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    createTask();
                  }
                }}
                placeholder={t("obj_create_placeholder")}
                rows={2}
                className="w-full rounded-2xl bg-muted/50 border border-border/60 p-3 text-sm outline-none focus:ring-2 focus:ring-brand/30 resize-none"
              />
              <div className="mt-4 flex gap-2">
                <button
                  onClick={createTask}
                  disabled={loading || !draft.trim()}
                  className="flex-1 h-12 rounded-2xl bg-brand text-brand-foreground font-medium disabled:opacity-50 inline-flex items-center justify-center gap-2"
                >
                  {loading ? <Loader2 className="size-4 animate-spin" /> : null}
                  {loading ? t("obj_decomposing") : t("obj_enter")}
                </button>
                <button
                  onClick={() => setCreating(false)}
                  className="h-12 px-4 rounded-2xl bg-muted text-sm font-medium"
                >
                  {t("cancel")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---------- Piece detail — revealed context ---------- */
function PieceDetail({
  task,
  onClose,
  onStart,
}: {
  task: Task;
  onClose: () => void;
  onStart: () => void;
}) {
  const t = useT();
  const doneSteps = task.steps.filter((s) => s.isCompleted).length;
  return (
    <div
      className="fixed inset-0 z-40 bg-background/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4 sm:p-6"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-card border border-border/60 p-6 shadow-2xl animate-in fade-in slide-in-from-bottom-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 mb-4">
          <div className="size-12 rounded-2xl bg-brand-soft grid place-items-center text-2xl">
            {task.emoji}
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold break-words">{task.title}</p>
            <p className="text-xs text-muted-foreground">
              {doneSteps}/{task.steps.length} {t("obj_pieces_count")} ·{" "}
              {task.steps.reduce((a, s) => a + s.durationMinutes, 0)}m
            </p>
          </div>
          <button onClick={onClose} className="size-8 grid place-items-center rounded-full hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>

        <ul className="space-y-1.5 mb-5">
          {task.steps.map((s, i) => (
            <li
              key={s.id}
              className={`flex items-center gap-2.5 text-sm py-1.5 ${
                s.isCompleted ? "text-muted-foreground line-through" : "text-foreground/80"
              }`}
            >
              <span
                className={`size-2 rounded-full ${s.isCompleted ? "bg-brand" : "bg-muted-foreground/40"}`}
              />
              <span className="flex-1 break-words">{s.title}</span>
              <span className="text-xs tabular-nums text-muted-foreground">{s.durationMinutes}m</span>
            </li>
          ))}
        </ul>

        <button
          onClick={onStart}
          className="w-full h-12 rounded-2xl bg-brand text-brand-foreground font-semibold"
        >
          {t("obj_start_work")}
        </button>
      </div>
    </div>
  );
}
