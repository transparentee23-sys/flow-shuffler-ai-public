import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Dice5, X } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { useAppStore } from "@/lib/store";
import type { Step, Task } from "@/lib/types";
import { colorForFlow, uid } from "@/lib/utils-flow";
import { ThemeApplier } from "@/components/ThemeApplier";
import { useT, getLang } from "@/lib/i18n";
import {
  shuffleReason as shuffleReasonFn,
  summarizeProgress,
  workLifeBalance,
} from "@/lib/ai.functions";
import type { Flow, ShuffleMode } from "@/lib/types";

export const Route = createFileRoute("/flows/$flowId/run")({
  head: () => ({
    meta: [
      { title: "Focus — Shufflow" },
      { name: "description", content: "Quiet focused work." },
    ],
  }),
  component: RunPage,
});

function RunPage() {
  const { flowId } = useParams({ from: "/flows/$flowId/run" });
  const navigate = useNavigate();
  const t = useT();

  const flows = useAppStore((s) => s.flows);
  const settings = useAppStore((s) => s.settings);
  const setStep = useAppStore((s) => s.setStep);
  const setTask = useAppStore((s) => s.setTask);
  const recompute = useAppStore((s) => s.recomputeFlow);
  const logSession = useAppStore((s) => s.logSession);
  const addFlowMinutes = useAppStore((s) => s.addFlowMinutes);

  const flow = flows.find((f) => f.id === flowId);

  const initial = useMemo(() => {
    if (typeof window !== "undefined") {
      const want = sessionStorage.getItem("startTaskId");
      if (want) {
        sessionStorage.removeItem("startTaskId");
        const task = flow?.tasks.find((tk) => tk.id === want && tk.status !== "completed");
        const step = task?.steps.find((s) => !s.isCompleted);
        if (task && step) return { taskId: task.id, stepId: step.id };
      }
    }
    return firstActive(flow);
  }, [flow]);

  const [activeTaskId, setActiveTaskId] = useState<string | null>(initial?.taskId ?? null);
  const [activeStepId, setActiveStepId] = useState<string | null>(initial?.stepId ?? null);
  const [shuffleX, setShuffleX] = useState(0); // slide offset for shuffle gesture
  const [shuffleHint, setShuffleHint] = useState(false);
  const [assembling, setAssembling] = useState(false);

  const task = flow?.tasks.find((tk) => tk.id === activeTaskId) ?? null;
  const step = task?.steps.find((s) => s.id === activeStepId) ?? null;

  const [remaining, setRemaining] = useState(() => (step ? step.durationMinutes * 60 : 0));
  const total = step ? step.durationMinutes * 60 : 0;
  const [paused, setPaused] = useState(false);
  const focusAccRef = useRef(0);
  const lastTickRef = useRef(Date.now());

  const reasonFn = useServerFn(shuffleReasonFn);
  const balanceFn = useServerFn(workLifeBalance);
  const summarize = useServerFn(summarizeProgress);

  // Reset on step change
  useEffect(() => {
    setRemaining(step ? step.durationMinutes * 60 : 0);
    setPaused(false);
  }, [activeStepId, step?.durationMinutes]);

  // Quiet timer
  useEffect(() => {
    if (paused || !step) return;
    lastTickRef.current = Date.now();
    const id = window.setInterval(() => {
      const now = Date.now();
      const dt = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;
      focusAccRef.current += dt;
      setRemaining((r) => Math.max(-99, r - dt));
    }, 500);
    return () => window.clearInterval(id);
  }, [paused, step]);

  const flushFocus = useCallback(() => {
    const m = focusAccRef.current / 60;
    if (m > 0 && flow) {
      addFlowMinutes(flow.id, m);
      logSession(m, false);
    }
    focusAccRef.current = 0;
  }, [addFlowMinutes, logSession, flow]);

  const markDone = useCallback(() => {
    if (!task || !step || !flow) return;
    setAssembling(true);
    setStep(flow.id, task.id, step.id, { isCompleted: true });
    if (task.status === "pending") setTask(flow.id, task.id, { status: "in-progress" });
    flushFocus();
    logSession(0, true);

    const idx = task.steps.findIndex((s) => s.id === step.id);
    const next = task.steps.slice(idx + 1).find((s) => !s.isCompleted);
    window.setTimeout(() => {
      setAssembling(false);
      if (next) {
        setActiveStepId(next.id);
      } else {
        // task complete
        setTask(flow.id, task.id, { status: "completed", lastCompletedAt: Date.now() });
        recompute(flow.id);
        const nextTask = nextActiveAfter(flow, task.id);
        if (nextTask) {
          setActiveTaskId(nextTask.taskId);
          setActiveStepId(nextTask.stepId);
        } else {
          // flow complete — go home
          toast.success(t("cube_reassembled"));
          navigate({ to: "/" });
        }
      }
    }, 700);
  }, [task, step, flow, setStep, setTask, flushFocus, logSession, recompute, navigate, t]);

  const switchTo = useCallback(
    async (toFlowId: string, toTaskId: string, reason?: string) => {
      if (task && task.status === "in-progress") {
        const completed = task.steps.filter((s) => s.isCompleted).map((s) => s.title);
        try {
          const sum = await summarize({
            data: { taskTitle: task.title, completedSteps: completed, lang: getLang() },
          });
          setTask(flow!.id, task.id, { resumeContext: { ...sum, generatedAt: Date.now() } });
        } catch {
          /* ignore */
        }
      }
      flushFocus();
      if (toFlowId !== flow!.id) {
        window.location.assign(`/flows/${toFlowId}/run`);
        return;
      }
      const targetTask = flow!.tasks.find((tk) => tk.id === toTaskId);
      const nextStep = targetTask?.steps.find((s) => !s.isCompleted);
      if (nextStep) {
        setActiveTaskId(toTaskId);
        setActiveStepId(nextStep.id);
        if (reason) toast(`${t("obj_shuffle_suggest")}`, { description: reason, icon: "🎲", duration: 5000 });
      }
    },
    [task, flow, summarize, setTask, flushFocus, t],
  );

  const triggerShuffle = useCallback(async () => {
    if (!task || !flow) return;
    const mode = settings.shuffleMode ?? "this-flow";
    const localReason = () => {
      if (mode === "this-flow") return t("reason_this_flow");
      if (mode === "mixer") return t("reason_mixer");
      if (mode === "world") return t("reason_world");
      return t("reason_quick");
    };
    try {
      if (mode === "ai") {
        const ranked = rankCandidates(flows, flow, task, "world", 0);
        if (!ranked.length) return toast.error(t("no_others"));
        const top = ranked.slice(0, 6);
        const candidates = top.map((r) => ({
          id: `${r.flowId}::${r.taskId}`,
          title: r.task.title,
          priority: r.task.priority,
          difficulty: r.task.difficulty,
          nextStepMinutes: r.step.durationMinutes,
        }));
        const res = await balanceFn({
          data: { current: task.title, currentDifficulty: task.difficulty, candidates, lang: getLang() },
        });
        const chosen = res.picks[Math.floor(Math.random() * res.picks.length)];
        const [fId, tId] = chosen.taskId.split("::");
        await switchTo(fId, tId, chosen.reason ?? localReason());
      } else {
        const c = pickCandidate(flows, flow, task, mode, 0);
        if (!c) return toast.error(t("no_others"));
        let reason = localReason();
        try {
          const targetFlow = flows.find((f) => f.id === c.flowId);
          const targetTask = targetFlow?.tasks.find((tk) => tk.id === c.taskId);
          if (targetTask) {
            const r = await reasonFn({ data: { from: task.title, to: targetTask.title, lang: getLang() } });
            reason = r.reason;
          }
        } catch { /* ignore */ }
        await switchTo(c.flowId, c.taskId, reason);
      }
    } catch {
      toast.error(t("no_others"));
    }
  }, [task, flow, flows, settings.shuffleMode, switchTo, balanceFn, reasonFn, t]);

  // Shuffle slide gesture
  const dragStartX = useRef<number | null>(null);
  const onSlideStart = (e: React.PointerEvent) => {
    dragStartX.current = e.clientX;
  };
  const onSlideMove = (e: React.PointerEvent) => {
    if (dragStartX.current == null) return;
    const dx = e.clientX - dragStartX.current;
    setShuffleX(Math.max(-120, Math.min(120, dx)));
    if (Math.abs(dx) > 30) setShuffleHint(true);
  };
  const onSlideEnd = () => {
    if (Math.abs(shuffleX) > 80) {
      void triggerShuffle();
    }
    setShuffleX(0);
    setShuffleHint(false);
    dragStartX.current = null;
  };

  if (!flow) {
    return (
      <div className="min-h-screen grid place-items-center">
        <p className="text-sm text-muted-foreground">{t("flow_not_found")}</p>
      </div>
    );
  }

  if (!task || !step) {
    return (
      <div className="min-h-screen grid place-items-center px-6 text-center">
        <div>
          <p className="text-sm text-muted-foreground mb-4">{t("all_done")}</p>
          <button
            onClick={() => navigate({ to: "/" })}
            className="h-12 px-6 rounded-full bg-brand text-brand-foreground font-medium"
          >
            {t("back_home")}
          </button>
        </div>
      </div>
    );
  }

  const accent = colorForFlow(flow);
  const stepNumber = task.steps.findIndex((s) => s.id === step.id) + 1;
  const stepTotal = task.steps.length;
  const pct = total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const overtime = remaining < 0;
  const abs = Math.abs(remaining);
  const m = Math.floor(abs / 60);
  const s = Math.floor(abs % 60);

  return (
    <div className="min-h-screen flex flex-col" data-accent={accent}>
      <ThemeApplier override={accent} />

      {/* Minimal header — only exit */}
      <div className="flex justify-end p-5">
        <button
          onClick={() => {
            flushFocus();
            navigate({ to: "/flows/$flowId", params: { flowId: flow.id } });
          }}
          className="size-10 rounded-full grid place-items-center hover:bg-muted transition"
          aria-label={t("exit")}
        >
          <X className="size-5" />
        </button>
      </div>

      {/* Quiet context — one line */}
      <div className="px-6 text-center">
        <p className="text-xs uppercase tracking-[0.15em] text-muted-foreground/50">
          {task.emoji} {task.title}
        </p>
      </div>

      {/* The dominant object — the current Step Piece */}
      <div className="flex-1 flex flex-col items-center justify-center px-6">
        <div
          className="relative"
          style={{
            transform: `translateX(${shuffleX * 0.4}px)`,
            transition: shuffleX === 0 ? "transform 300ms cubic-bezier(.2,.7,.3,1)" : "none",
          }}
        >
          {/* The piece — a single rounded volumetric shape */}
          <div
            onPointerDown={onSlideStart}
            onPointerMove={onSlideMove}
            onPointerUp={onSlideEnd}
            onPointerCancel={onSlideEnd}
            className="relative touch-none cursor-grab active:cursor-grabbing"
            style={{ width: 260, height: 260, perspective: 800 }}
          >
            {/* Progress ring around the piece */}
            <svg className="absolute inset-0 -rotate-90 pointer-events-none" viewBox="0 0 260 260">
              <circle cx="130" cy="130" r="120" stroke="var(--muted)" strokeWidth="3" fill="none" opacity="0.4" />
              <circle
                cx="130"
                cy="130"
                r="120"
                stroke={overtime ? "var(--destructive)" : "var(--brand)"}
                strokeWidth="3"
                strokeLinecap="round"
                fill="none"
                strokeDasharray={2 * Math.PI * 120}
                strokeDashoffset={2 * Math.PI * 120 * (1 - pct)}
                style={{ transition: "stroke-dashoffset 0.5s linear" }}
              />
            </svg>

            {/* The piece itself — a soft 3D-ish block */}
            <div
              className="absolute inset-6 rounded-3xl grid place-items-center text-center"
              style={{
                background:
                  "linear-gradient(145deg, color-mix(in oklab, var(--brand) 82%, white), color-mix(in oklab, var(--brand) 52%, transparent) 60%, color-mix(in oklab, var(--brand) 85%, black))",
                boxShadow: assembling
                  ? "0 0 60px color-mix(in oklab, var(--brand) 60%, transparent), inset 0 0 40px rgba(255,255,255,0.2)"
                  : "0 12px 32px rgba(0,0,0,0.18), inset 0 0 30px rgba(255,255,255,0.12)",
                transform: assembling ? "scale(0.92)" : "scale(1)",
                transition: "transform 600ms cubic-bezier(.4,0,.2,1), box-shadow 600ms",
              }}
            >
              <div className="px-6">
                <p className="text-xs uppercase tracking-wide text-white/60 mb-2">
                  {t("obj_step_now")} · {stepNumber}/{stepTotal}
                </p>
                <p className="text-white text-lg font-medium leading-snug break-words">
                  {step.title}
                </p>
                <p
                  className={`mt-4 text-4xl font-semibold tabular-nums tracking-tight ${
                    overtime ? "text-white/90" : "text-white/95"
                  }`}
                >
                  {overtime ? "+" : ""}
                  {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
                </p>
              </div>
            </div>
          </div>

          {/* Shuffle hint */}
          {shuffleHint && (
            <p className="absolute -bottom-8 left-1/2 -translate-x-1/2 text-xs text-muted-foreground whitespace-nowrap">
              {t("obj_slide_hint")}
            </p>
          )}
        </div>
      </div>

      {/* Minimal actions — press to complete, slide to shuffle */}
      <div className="px-6 pb-10 space-y-4">
        {/* Press to complete */}
        <button
          onClick={markDone}
          className="w-full max-w-xs mx-auto h-14 rounded-2xl bg-brand text-brand-foreground font-semibold inline-flex items-center justify-center gap-2 shadow-glow"
        >
          <Check className="size-5" /> {t("obj_done")}
        </button>

        {/* Quiet shuffle affordance */}
        <button
          onClick={triggerShuffle}
          className="w-full max-w-xs mx-auto h-11 rounded-full bg-foreground/5 text-foreground/60 text-sm font-medium inline-flex items-center justify-center gap-2 hover:bg-foreground/10 transition"
        >
          <Dice5 className="size-4" /> {t("shuffle")}
        </button>
      </div>
    </div>
  );
}

/* ---------- Helpers ---------- */
function firstActive(flow?: Flow): { taskId: string; stepId: string } | null {
  if (!flow) return null;
  for (const tk of flow.tasks) {
    if (tk.status === "completed") continue;
    const s = tk.steps.find((x) => !x.isCompleted);
    if (s) return { taskId: tk.id, stepId: s.id };
  }
  return null;
}
function nextActiveAfter(flow: Flow, completedTaskId: string): { taskId: string; stepId: string } | null {
  const idx = flow.tasks.findIndex((tk) => tk.id === completedTaskId);
  for (let i = idx + 1; i < flow.tasks.length; i++) {
    const tk = flow.tasks[i];
    if (tk.status === "completed") continue;
    const s = tk.steps.find((x) => !x.isCompleted);
    if (s) return { taskId: tk.id, stepId: s.id };
  }
  return null;
}

function pickPool(
  allFlows: Flow[],
  currentFlow: Flow,
  currentTask: Task,
  mode: ShuffleMode,
): { flowId: string; taskId: string }[] {
  if (mode === "this-flow") {
    return currentFlow.tasks
      .filter((tk) => tk.id !== currentTask.id && tk.status !== "completed")
      .map((tk) => ({ flowId: currentFlow.id, taskId: tk.id }));
  }
  return allFlows.flatMap((f) =>
    f.tasks
      .filter((tk) => !(f.id === currentFlow.id && tk.id === currentTask.id) && tk.status !== "completed")
      .map((tk) => ({ flowId: f.id, taskId: tk.id })),
  );
}

function rankCandidates(
  allFlows: Flow[],
  currentFlow: Flow,
  currentTask: Task,
  mode: ShuffleMode,
  _easyDone: number,
) {
  const pool = pickPool(allFlows, currentFlow, currentTask, mode);
  const items = pool
    .map(({ flowId, taskId }) => {
      const f = allFlows.find((x) => x.id === flowId);
      const tk = f?.tasks.find((x) => x.id === taskId);
      const s = tk?.steps.find((x) => !x.isCompleted);
      return tk && s ? { flowId, taskId, task: tk, step: s } : null;
    })
    .filter((x): x is { flowId: string; taskId: string; task: Task; step: Step } => !!x);
  return items
    .map((it) => ({ ...it, score: Math.random() }))
    .sort((a, b) => b.score - a.score);
}

function pickCandidate(
  allFlows: Flow[],
  currentFlow: Flow,
  currentTask: Task,
  mode: ShuffleMode,
  easyDone: number,
): { flowId: string; taskId: string } | null {
  const ranked = rankCandidates(allFlows, currentFlow, currentTask, mode, easyDone);
  if (!ranked.length) return null;
  const top = ranked.slice(0, 3);
  return { flowId: top[0].flowId, taskId: top[0].taskId };
}

void uid;
