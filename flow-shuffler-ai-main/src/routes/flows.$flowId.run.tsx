import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  Dice5,
  History,
  Home,
  Minus,
  Pause,
  Play,
  Plus,
  Settings as SettingsIcon,
  SkipForward,
  Sparkles,
  Undo2,
  X,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { RadialBar, RadialBarChart, ResponsiveContainer, PolarAngleAxis } from "recharts";
import { useAppStore } from "@/lib/store";
import type { Flow, ShuffleMode, Step, Task } from "@/lib/types";
import { colorForFlow, computeFlowProgress, totalDuration, uid } from "@/lib/utils-flow";
import { CircularTimer } from "@/components/CircularTimer";
import { Cube, type CubePieceState } from "@/components/cube/Cube";
import { ThemeApplier } from "@/components/ThemeApplier";
import { useT, getLang } from "@/lib/i18n";
import {
  sessionSummary,
  shuffleReason as shuffleReasonFn,
  summarizeProgress,
  workLifeBalance,
} from "@/lib/ai.functions";

export const Route = createFileRoute("/flows/$flowId/run")({
  head: () => ({
    meta: [
      { title: "Focus session — Shufflow" },
      { name: "description", content: "A guided focus session with chime and shuffle." },
    ],
  }),
  component: RunPage,
});

type Phase = "interval" | "running" | "summary";

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

  const flow = flows.find((f) => f.id === flowId);
  const accent = flow ? colorForFlow(flow) : null;

  const [phase, setPhase] = useState<Phase>(settings.skipIntervalSetup ? "running" : "interval");
  const [chimeMin, setChimeMin] = useState(settings.defaultChimeMinutes);
  const [sessionMetrics, setSessionMetrics] = useState<{
    focusMin: number;
    stepsDone: string[];
    shuffles: number;
    chimes: number;
    tasksDone: number;
    flowDone: boolean;
  }>({ focusMin: 0, stepsDone: [], shuffles: 0, chimes: 0, tasksDone: 0, flowDone: false });

  if (!flow) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">{t("flow_not_found")}</p>
        <button
          onClick={() => navigate({ to: "/" })}
          className="mt-4 h-11 px-5 rounded-2xl bg-brand text-brand-foreground"
        >
          {t("back_home")}
        </button>
      </div>
    );
  }

  return (
    <div data-accent={accent ?? undefined}>
      <ThemeApplier override={accent} />
      {phase === "interval" && (
        <IntervalSetup
          flow={flow}
          defaultMin={settings.defaultChimeMinutes}
          chimeMin={chimeMin}
          setChimeMin={setChimeMin}
          onStart={(saveDefault) => {
            if (saveDefault) {
              useAppStore
                .getState()
                .updateSettings({ skipIntervalSetup: true, defaultChimeMinutes: chimeMin });
            }
            setPhase("running");
          }}
          onCancel={() => navigate({ to: "/" })}
        />
      )}
      {phase === "summary" && (
        <SummaryView
          flow={flow}
          metrics={sessionMetrics}
          onHome={() => navigate({ to: "/" })}
          onContinue={() => setPhase("running")}
        />
      )}
      {phase === "running" && (
        <RunEngine
          flow={flow}
          chimeMin={chimeMin}
          setStep={setStep}
          setTask={setTask}
          recompute={recompute}
          logSession={logSession}
          onComplete={(m) => {
            setSessionMetrics(m);
            setPhase("summary");
          }}
          onExit={(m) => {
            setSessionMetrics(m);
            setPhase("summary");
          }}
        />
      )}
    </div>
  );
}

/* ---------- Interval setup ---------- */
function IntervalSetup({
  flow,
  chimeMin,
  setChimeMin,
  defaultMin,
  onStart,
  onCancel,
}: {
  flow: Flow;
  chimeMin: number;
  setChimeMin: (n: number) => void;
  defaultMin: number;
  onStart: (saveDefault: boolean) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const [save, setSave] = useState(false);
  const [showChime, setShowChime] = useState(false);

  // Build cube pieces from the first pending task's steps (up to 8)
  const pieces: CubePieceState[] = useMemo(() => {
    const activeTask =
      flow.tasks.find((tk) => tk.status !== "completed") ?? flow.tasks[0];
    const steps = activeTask?.steps ?? [];
    return steps.slice(0, 8).map((s) => ({
      id: s.id,
      done: s.isCompleted,
    }));
  }, [flow]);

  return (
    <div className="min-h-screen flex flex-col">
      <div className="flex justify-end p-5">
        <button
          onClick={onCancel}
          className="size-10 rounded-full grid place-items-center hover:bg-muted"
          aria-label={t("close")}
        >
          <X className="size-5" />
        </button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <h1 className="text-xl font-medium tracking-tight">{t("fidget_title")}</h1>

        <div className="mt-8">
          <Cube
            mode="start"
            pieces={pieces}
            hint={t("fidget_hint")}
            chargeLabel={t("fidget_charge")}
            readyLabel={t("fidget_ready")}
            onStart={() => onStart(save)}
          />
        </div>



        {/* Compact chime chip — collapsed by default */}
        <div className="mt-8 w-full max-w-xs">
          {!showChime ? (
            <button
              onClick={() => setShowChime(true)}
              className="mx-auto inline-flex items-center gap-2 h-9 px-4 rounded-full bg-muted text-xs font-medium text-muted-foreground hover:text-foreground transition"
            >
              <Sparkles className="size-3.5" />
              {t("chime_every")} <span className="tabular-nums text-foreground">{chimeMin}m</span>
            </button>
          ) : (
            <div className="rounded-2xl bg-card border border-border/60 p-3 flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground pl-1">{t("default_chime")}</span>
              <div className="inline-flex items-center bg-muted rounded-full p-0.5">
                <button
                  onClick={() => setChimeMin(Math.max(1, chimeMin - 1))}
                  className="size-8 grid place-items-center rounded-full hover:bg-card"
                  aria-label="-1"
                >
                  <Minus className="size-3.5" />
                </button>
                <input
                  type="number"
                  min={1}
                  value={chimeMin}
                  onChange={(e) => {
                    const raw = e.target.value;
                    if (raw === "") return;
                    const v = parseInt(raw, 10);
                    if (!isNaN(v) && v >= 1) setChimeMin(v);
                  }}
                  className="w-10 bg-transparent text-sm font-semibold tabular-nums text-center outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  aria-label={t("minutes")}
                />
                <button
                  onClick={() => setChimeMin(chimeMin + 1)}
                  className="size-8 grid place-items-center rounded-full hover:bg-card"
                  aria-label="+1"
                >
                  <Plus className="size-3.5" />
                </button>
              </div>
            </div>
          )}
          <label className="mt-4 inline-flex items-center gap-2 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={save}
              onChange={(e) => setSave(e.target.checked)}
              className="size-3.5 accent-current"
            />
            {t("skip_interval")}
            {chimeMin !== defaultMin && save ? <span>·</span> : null}
          </label>
        </div>
      </div>
      <div className="p-5">
        <button
          onClick={() => onStart(save)}
          className="w-full h-12 rounded-2xl bg-muted text-muted-foreground text-sm font-medium inline-flex items-center justify-center gap-2 hover:bg-card transition"
        >
          <Play className="size-4" /> {t("just_start")}
        </button>
      </div>
    </div>
  );
}

interface SessionMetrics {
  focusMin: number;
  stepsDone: string[];
  shuffles: number;
  chimes: number;
  tasksDone: number;
  flowDone: boolean;
}

/* ---------- Run engine ---------- */
function RunEngine({
  flow,
  chimeMin,
  setStep,
  setTask,
  recompute,
  logSession,
  onComplete,
  onExit,
}: {
  flow: Flow;
  chimeMin: number;
  setStep: (fId: string, tId: string, sId: string, p: Partial<Step>) => void;
  setTask: (fId: string, tId: string, p: Partial<Task>) => void;
  recompute: (fId: string) => void;
  logSession: (m: number, completedTask: boolean) => void;
  onComplete: (m: SessionMetrics) => void;
  onExit: (m: SessionMetrics) => void;
}) {
  const t = useT();
  const settings = useAppStore((s) => s.settings);
  const setShuffleMode = useAppStore((s) => s.setShuffleMode);
  const addFlowMinutes = useAppStore((s) => s.addFlowMinutes);
  const bumpFlowCompletion = useAppStore((s) => s.bumpFlowCompletion);

  // start task — honor sessionStorage hint from flow detail
  const initial = useMemo(() => {
    if (typeof window !== "undefined") {
      const want = sessionStorage.getItem("startTaskId");
      if (want) {
        sessionStorage.removeItem("startTaskId");
        const task = flow.tasks.find((tk) => tk.id === want && tk.status !== "completed");
        const step = task?.steps.find((s) => !s.isCompleted);
        if (task && step) return { taskId: task.id, stepId: step.id };
      }
    }
    return firstActive(flow);
  }, [flow]);

  const [activeTaskId, setActiveTaskId] = useState<string | null>(initial?.taskId ?? null);
  const [activeStepId, setActiveStepId] = useState<string | null>(initial?.stepId ?? null);

  const summarize = useServerFn(summarizeProgress);
  const reasonFn = useServerFn(shuffleReasonFn);
  const balanceFn = useServerFn(workLifeBalance);

  const task = flow.tasks.find((tk) => tk.id === activeTaskId) ?? null;
  const step = task?.steps.find((s) => s.id === activeStepId) ?? null;

  const [paused, setPaused] = useState(false);
  const [remaining, setRemaining] = useState(() => (step ? step.durationMinutes * 60 : 0));
  const total = step ? step.durationMinutes * 60 : 0;

  // metrics
  const metricsRef = useRef<SessionMetrics>({ focusMin: 0, stepsDone: [], shuffles: 0, chimes: 0, tasksDone: 0, flowDone: false });
  const easyDoneRef = useRef<number>(0);
  const focusAccRef = useRef<number>(0);
  const lastChimeRef = useRef<number>(0);
  const lastTickRef = useRef<number>(Date.now());
  const [chimeRemaining, setChimeRemaining] = useState<number>(chimeMin * 60);

  // history of step transitions for undo
  const historyRef = useRef<{ taskId: string; stepId: string; remaining: number }[]>([]);

  // Overtime: timer keeps running past zero; prompt user once.
  const [overtimeOpen, setOvertimeOpen] = useState(false);
  const overtimeShownRef = useRef<string | null>(null);

  // Reset timer on step change
  useEffect(() => {
    setRemaining(step ? step.durationMinutes * 60 : 0);
    setPaused(false);
    setOvertimeOpen(false);
  }, [activeStepId, step?.durationMinutes]);

  // Timer
  useEffect(() => {
    if (paused || !step) return;
    lastTickRef.current = Date.now();
    const id = window.setInterval(() => {
      const now = Date.now();
      const dt = (now - lastTickRef.current) / 1000;
      lastTickRef.current = now;
      focusAccRef.current += dt;
      lastChimeRef.current += dt;
      const remainTilChime = chimeMin * 60 - lastChimeRef.current;
      setChimeRemaining(Math.max(0, Math.round(remainTilChime)));
      if (remainTilChime <= 0) {
        lastChimeRef.current = 0;
        metricsRef.current.chimes += 1;
        chime();
        toast(`${t("chime_toast_title")} · ${Math.round(focusAccRef.current / 60)}m`, {
          description: t("chime_toast_sub"),
          duration: 5000,
        });
      }
      setRemaining((r) => {
        const nr = r - dt;
        // Trigger overtime prompt the first time we cross zero on this step
        if (r > 0 && nr <= 0 && step && overtimeShownRef.current !== step.id) {
          overtimeShownRef.current = step.id;
          setOvertimeOpen(true);
          chime();
        }
        return nr;
      });
    }, 250);
    return () => window.clearInterval(id);
  }, [paused, step, chimeMin, t]);

  // Resume briefing
  const [briefing, setBriefing] = useState<{ header: string; bullets: string[] } | null>(null);
  useEffect(() => {
    if (task?.resumeContext && task.status === "in-progress") {
      setBriefing(task.resumeContext);
    }
  }, [task?.id, task?.status, task?.resumeContext]);

  // Pre-fetched shuffle target
  const preparedRef = useRef<{
    flowId: string;
    taskId: string;
    reason?: string;
  } | null>(null);
  const allFlowsState = useAppStore((s) => s.flows);
  const prepareNext = useCallback(
    async (overrideMode?: ShuffleMode) => {
      if (!task) return;
      const mode = overrideMode ?? settings.shuffleMode ?? "this-flow";
      preparedRef.current = null;
      const candidate = pickCandidate(allFlowsState, flow, task, mode, easyDoneRef.current);
      if (!candidate) return;
      let reason: string | undefined;
      try {
        const targetFlow = allFlowsState.find((f) => f.id === candidate.flowId);
        const targetTask = targetFlow?.tasks.find((tk) => tk.id === candidate.taskId);
        if (targetTask) {
          const r = await reasonFn({
            data: { from: task.title, to: targetTask.title, lang: getLang() },
          });
          reason = r.reason;
        }
      } catch {
        /* ignore */
      }
      preparedRef.current = { ...candidate, reason };
    },
    [task, settings.shuffleMode, allFlowsState, flow, reasonFn],
  );

  useEffect(() => {
    void prepareNext();
  }, [prepareNext]);

  // Helper: flush accumulated focus time to flow + metrics
  const flushFocus = useCallback(() => {
    const m = focusAccRef.current / 60;
    if (m > 0) {
      metricsRef.current.focusMin += m;
      addFlowMinutes(flow.id, m);
    }
    focusAccRef.current = 0;
  }, [addFlowMinutes, flow.id]);

  /* Transition helper */
  const switchTo = useCallback(
    async (toFlowId: string, toTaskId: string, reason?: string) => {
      if (task && task.status === "in-progress") {
        const completed = task.steps.filter((s) => s.isCompleted).map((s) => s.title);
        try {
          const sum = await summarize({
            data: { taskTitle: task.title, completedSteps: completed, lang: getLang() },
          });
          setTask(flow.id, task.id, { resumeContext: { ...sum, generatedAt: Date.now() } });
        } catch {
          /* ignore */
        }
      }
      flushFocus();
      logSession(0, false);
      metricsRef.current.shuffles += 1;

      const targetFlow = useAppStore.getState().flows.find((f) => f.id === toFlowId);
      const targetTask = targetFlow?.tasks.find((tk) => tk.id === toTaskId);
      if (reason && targetTask) {
        toast(`${t("shuffled_to")} ${targetTask.title}`, {
          description: reason,
          icon: "🎲",
          duration: 6000,
        });
      } else if (targetTask) {
        toast(`${t("shuffled_to")} ${targetTask.title}`, { icon: "🎲" });
      }

      if (toFlowId !== flow.id) {
        window.location.assign(`/flows/${toFlowId}/run`);
        return;
      }
      const nextStep = targetTask?.steps.find((s) => !s.isCompleted);
      if (nextStep) {
        historyRef.current.push({
          taskId: task!.id,
          stepId: step!.id,
          remaining: Math.round(remaining),
        });
        setActiveTaskId(toTaskId);
        setActiveStepId(nextStep.id);
      }
    },
    [task, flow.id, summarize, setTask, logSession, flushFocus, t, remaining, step],
  );

  // Shuffle action
  const [showModePicker, setShowModePicker] = useState(false);
  const [showModeMenu, setShowModeMenu] = useState(false);

  const triggerShuffle = useCallback(async () => {
    if (!settings.shuffleMode) {
      setShowModePicker(true);
      return;
    }
    const mode = settings.shuffleMode;
    const localReason = () => {
      if (mode === "this-flow") return t("reason_this_flow");
      if (mode === "mixer") return t("reason_mixer");
      if (mode === "world") return t("reason_world");
      return t("reason_quick");
    };
    const cand = preparedRef.current;
    if (cand) {
      preparedRef.current = null;
      await switchTo(cand.flowId, cand.taskId, cand.reason ?? localReason());
      void prepareNext();
      return;
    }
    // live fallback
    if (mode === "ai") {
      const ranked = rankCandidates(allFlowsState, flow, task!, "world", easyDoneRef.current);
      if (!ranked.length) return toast.error(t("no_others"));
      const topRanked = ranked.slice(0, 8);
      const candidates = topRanked.map((r) => ({
        id: `${r.flowId}::${r.taskId}`,
        title: r.task.title,
        priority: r.task.priority,
        difficulty: r.task.difficulty,
        nextStepMinutes: r.step.durationMinutes,
      }));
      try {
        const res = await balanceFn({
          data: {
            current: task!.title,
            currentDifficulty: task!.difficulty,
            candidates,
            lang: getLang(),
          },
        });
        const chosen = res.picks[Math.floor(Math.random() * res.picks.length)];
        const [fId, tId] = chosen.taskId.split("::");
        await switchTo(fId, tId, chosen.reason ?? localReason());
      } catch {
        const fallback = pickCandidate(allFlowsState, flow, task!, "world", easyDoneRef.current);
        if (fallback) await switchTo(fallback.flowId, fallback.taskId, localReason());
      }
    } else {
      const c = pickCandidate(allFlowsState, flow, task!, mode, easyDoneRef.current);
      if (!c) return toast.error(t("no_others"));
      await switchTo(c.flowId, c.taskId, localReason());
    }
    void prepareNext();
  }, [settings.shuffleMode, switchTo, prepareNext, balanceFn, allFlowsState, flow, task, t]);

  const markStepDone = useCallback(() => {
    if (!task || !step) return;
    metricsRef.current.stepsDone.push(step.title);
    setStep(flow.id, task.id, step.id, { isCompleted: true });
    if (task.status === "pending") setTask(flow.id, task.id, { status: "in-progress" });
    const idx = task.steps.findIndex((s) => s.id === step.id);
    const next = task.steps.slice(idx + 1).find((s) => !s.isCompleted);
    if (next) {
      historyRef.current.push({ taskId: task.id, stepId: step.id, remaining: 0 });
      setActiveStepId(next.id);
    } else {
      const nextTaskInfo = nextActiveAfter(flow, task.id);
      setTask(flow.id, task.id, {
        status: "completed",
        lastCompletedAt: Date.now(),
        nextAvailableDate: task.isRecurring ? nextDate(task) : undefined,
      });
      metricsRef.current.tasksDone += 1;
      if (task.difficulty === "easy") easyDoneRef.current += 1;
      flushFocus();
      logSession(0, true);
      recompute(flow.id);
      if (nextTaskInfo) {
        historyRef.current.push({ taskId: task.id, stepId: step.id, remaining: 0 });
        setActiveTaskId(nextTaskInfo.taskId);
        setActiveStepId(nextTaskInfo.stepId);
        toast.success(t("win_unlocked"));
      } else {
        metricsRef.current.flowDone = true;
        bumpFlowCompletion(flow.id);
        toast.success(t("flow_complete"));
        onComplete({ ...metricsRef.current });
      }
    }
  }, [task, step, flow, setStep, setTask, recompute, logSession, flushFocus, bumpFlowCompletion, onComplete, t]);

  /* Inline step editing during a run */
  const editStepTitle = useCallback(
    (stepId: string, title: string) => {
      if (!task) return;
      setStep(flow.id, task.id, stepId, { title });
    },
    [task, flow.id, setStep],
  );
  const editStepDuration = useCallback(
    (stepId: string, minutes: number) => {
      if (!task) return;
      setStep(flow.id, task.id, stepId, { durationMinutes: Math.max(1, minutes) });
    },
    [task, flow.id, setStep],
  );
  const deleteStep = useCallback(
    (stepId: string) => {
      if (!task) return;
      const remaining = task.steps.filter((s) => s.id !== stepId);
      setTask(flow.id, task.id, { steps: remaining });
      if (stepId === activeStepId) {
        const nextActive = remaining.find((s) => !s.isCompleted);
        if (nextActive) setActiveStepId(nextActive.id);
      }
    },
    [task, flow.id, setTask, activeStepId],
  );
  const addStepInline = useCallback(() => {
    if (!task) return;
    setTask(flow.id, task.id, {
      steps: [
        ...task.steps,
        { id: uid(), title: t("new_step"), durationMinutes: 10, isCompleted: false },
      ],
    });
  }, [task, flow.id, setTask, t]);
  const reopenStep = useCallback(
    (stepId: string) => {
      if (!task) return;
      setStep(flow.id, task.id, stepId, { isCompleted: false });
      if (task.status === "completed") {
        setTask(flow.id, task.id, { status: "in-progress", lastCompletedAt: undefined });
        metricsRef.current.tasksDone = Math.max(0, metricsRef.current.tasksDone - 1);
      }
      setActiveStepId(stepId);
      overtimeShownRef.current = null;
    },
    [task, flow.id, setStep, setTask],
  );

  // Skip with undo
  const [skippedSnapshot, setSkippedSnapshot] = useState<{
    taskId: string;
    stepId: string;
    remaining: number;
  } | null>(null);
  const skip = () => {
    if (!task || !step) return;
    const snap = { taskId: task.id, stepId: step.id, remaining: Math.round(remaining) };
    const idx = task.steps.findIndex((s) => s.id === step.id);
    const next = task.steps.slice(idx + 1).find((s) => !s.isCompleted);
    if (next) {
      setActiveStepId(next.id);
      setSkippedSnapshot(snap);
      historyRef.current.push(snap);
      toast(t("skip_undo"), {
        action: {
          label: t("back_to_step"),
          onClick: () => undoSkip(snap),
        },
        duration: 6000,
      });
      setTimeout(() => setSkippedSnapshot(null), 6000);
    }
  };
  const undoSkip = (snap: { taskId: string; stepId: string; remaining: number }) => {
    setActiveTaskId(snap.taskId);
    setActiveStepId(snap.stepId);
    setRemaining(snap.remaining);
  };

  // Time adjust
  const [showTimeInput, setShowTimeInput] = useState(false);
  const [manualMin, setManualMin] = useState("");
  const adjust = (mins: number) => {
    setRemaining((r) => r + mins * 60);
  };
  const setExact = () => {
    const m = parseInt(manualMin, 10);
    if (!isNaN(m) && m >= 0) {
      setRemaining(m * 60);
    }
    setShowTimeInput(false);
    setManualMin("");
  };

  /* Quit confirmation */
  const [quitOpen, setQuitOpen] = useState(false);
  const handleExit = () => {
    if (task && task.status === "in-progress") setQuitOpen(true);
    else doExit();
  };
  const doExit = () => {
    flushFocus();
    onExit({ ...metricsRef.current });
  };

  /* History drawer */
  const [historyOpen, setHistoryOpen] = useState(false);

  if (!task || !step) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">{t("all_done")}</p>
        <button
          onClick={doExit}
          className="mt-4 h-11 px-5 rounded-2xl bg-brand text-brand-foreground"
        >
          {t("back_home")}
        </button>
      </div>
    );
  }

  const upcoming = task.steps.filter((s) => !s.isCompleted && s.id !== step.id);
  const stepNumber = task.steps.findIndex((s) => s.id === step.id) + 1;
  const stepTotal = task.steps.length;

  return (
    <div className="min-h-screen flex flex-col">
      {briefing && (
        <ResumeBriefingOverlay
          briefing={briefing}
          onClose={() => {
            setBriefing(null);
            if (task) setTask(flow.id, task.id, { resumeContext: undefined });
          }}
        />
      )}

      <header className="flex items-center justify-between px-5 pt-6 pb-2">
        <button
          onClick={handleExit}
          className="size-10 rounded-full grid place-items-center hover:bg-muted"
          aria-label={t("exit")}
        >
          <X className="size-5" />
        </button>
        <div className="text-center min-w-0 flex-1 px-2">
          <p className="text-xs uppercase tracking-wide text-muted-foreground truncate">
            {flow.title}
          </p>
          <p className="font-semibold break-words">
            {task.emoji} {task.title}
          </p>
        </div>
        <button
          onClick={() => setHistoryOpen(true)}
          className="size-10 rounded-full grid place-items-center hover:bg-muted"
          aria-label={t("history")}
        >
          <History className="size-5" />
        </button>
      </header>

      <main className="flex-1 flex flex-col items-center px-5 mt-4">
        <CircularTimer
          remaining={Math.round(remaining)}
          total={total}
          chimeRemaining={paused ? null : chimeRemaining}
          chimeLabel={t("next_chime_in")}
          overtimeLabel={t("overtime_label")}
        />

        {/* Time adjust */}
        <div className="mt-6 flex items-center gap-2 flex-wrap justify-center">
          <button onClick={() => adjust(-1)} className="h-10 px-3 rounded-full bg-muted text-sm font-medium">
            −1m
          </button>
          <button onClick={() => adjust(-5)} className="h-10 px-3 rounded-full bg-muted text-sm font-medium">
            −5m
          </button>
          <button
            onClick={() => setPaused((p) => !p)}
            className="size-14 rounded-full bg-brand text-brand-foreground grid place-items-center shadow-glow"
            aria-label={paused ? t("resume") : t("pause")}
          >
            {paused ? <Play className="size-6 fill-current" /> : <Pause className="size-6 fill-current" />}
          </button>
          <button onClick={() => adjust(5)} className="h-10 px-3 rounded-full bg-muted text-sm font-medium">
            +5m
          </button>
          <button onClick={() => adjust(1)} className="h-10 px-3 rounded-full bg-muted text-sm font-medium">
            +1m
          </button>
        </div>
        <div className="mt-2">
          {showTimeInput ? (
            <div className="inline-flex items-center gap-1.5 bg-muted rounded-full p-1 pl-3">
              <input
                autoFocus
                type="number"
                value={manualMin}
                onChange={(e) => setManualMin(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && setExact()}
                placeholder="00"
                className="w-12 bg-transparent text-sm tabular-nums outline-none text-center"
              />
              <span className="text-xs text-muted-foreground">{t("minutes")}</span>
              <button
                onClick={setExact}
                className="h-8 px-3 rounded-full bg-brand text-brand-foreground text-xs font-semibold"
              >
                ✓
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowTimeInput(true)}
              className="text-xs text-muted-foreground underline"
            >
              {t("set_to")}…
            </button>
          )}
        </div>

        <div className="mt-6 w-full">
          <p className="text-xs uppercase tracking-wide text-muted-foreground mb-2">
            {t("now")} · {t("step")} {stepNumber} {t("of")} {stepTotal}
          </p>
          <div className="w-full rounded-2xl bg-card border border-border/60 p-4 flex items-center gap-3 hover:border-brand/40 transition">
            <button
              onClick={markStepDone}
              className="size-8 rounded-full border-2 border-brand grid place-items-center text-brand shrink-0"
              aria-label={t("got_it")}
            >
              <Check className="size-4 opacity-0" />
            </button>
            <InlineTitle
              value={step.title}
              onChange={(v) => editStepTitle(step.id, v)}
              className="flex-1 font-medium break-words bg-transparent outline-none min-w-0"
            />
            <DurationControl
              value={step.durationMinutes}
              onChange={(v) => editStepDuration(step.id, v)}
            />
            <button
              onClick={markStepDone}
              className="text-xs font-semibold text-brand shrink-0"
            >
              {t("got_it")}
            </button>
          </div>

          {upcoming.length > 0 && (
            <>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mt-4 mb-2">
                {t("up_next")}
              </p>
              <ul className="space-y-2">
                {upcoming.map((s) => {
                  const num = task.steps.findIndex((x) => x.id === s.id) + 1;
                  return (
                    <li
                      key={s.id}
                      className="rounded-2xl bg-muted/50 border border-border/40 p-3 flex items-center gap-2 text-sm"
                    >
                      <span className="text-[10px] font-semibold tabular-nums w-5 text-center shrink-0 text-muted-foreground">
                        {num}
                      </span>
                      <InlineTitle
                        value={s.title}
                        onChange={(v) => editStepTitle(s.id, v)}
                        className="flex-1 break-words bg-transparent outline-none min-w-0"
                      />
                      <DurationControl
                        value={s.durationMinutes}
                        onChange={(v) => editStepDuration(s.id, v)}
                      />
                      <button
                        onClick={() => deleteStep(s.id)}
                        className="size-6 grid place-items-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive text-xs shrink-0"
                        aria-label={t("remove")}
                      >
                        ✕
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          <button
            onClick={addStepInline}
            className="mt-2 w-full h-11 rounded-2xl border border-dashed border-border text-sm text-muted-foreground hover:bg-muted/40 inline-flex items-center justify-center gap-2"
          >
            <Plus className="size-4" /> {t("add_step")}
          </button>

          {task.steps.some((s) => s.isCompleted) && (
            <>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mt-4 mb-2">
                {t("completed_in_task")}
              </p>
              <ul className="space-y-2">
                {task.steps
                  .filter((s) => s.isCompleted)
                  .map((s) => {
                    const num = task.steps.findIndex((x) => x.id === s.id) + 1;
                    return (
                      <li
                        key={s.id}
                        className="rounded-2xl bg-muted/30 border border-border/40 p-3 flex items-center gap-2 text-sm"
                      >
                        <span className="text-[10px] font-semibold tabular-nums w-5 text-center shrink-0 text-muted-foreground">
                          {num}
                        </span>
                        <span className="flex-1 break-words line-through text-muted-foreground">
                          {s.title}
                        </span>
                        <button
                          onClick={() => reopenStep(s.id)}
                          className="h-7 px-3 rounded-full bg-muted text-xs font-medium shrink-0"
                        >
                          {t("reopen")}
                        </button>
                      </li>
                    );
                  })}
              </ul>
            </>
          )}
        </div>
      </main>

      <div className="p-5 flex items-center gap-2">
        {skippedSnapshot ? (
          <button
            onClick={() => {
              undoSkip(skippedSnapshot);
              setSkippedSnapshot(null);
            }}
            className="h-14 px-4 rounded-2xl bg-muted font-medium inline-flex items-center gap-2"
          >
            <Undo2 className="size-4" /> {t("back_to_step")}
          </button>
        ) : (
          <button
            onClick={skip}
            className="h-14 px-4 rounded-2xl bg-muted font-medium inline-flex items-center gap-2"
          >
            <SkipForward className="size-4" /> {t("skip")}
          </button>
        )}
        <button
          onClick={triggerShuffle}
          className="flex-1 h-14 rounded-2xl bg-foreground text-background font-semibold inline-flex items-center justify-center gap-2"
        >
          <Dice5 className="size-5" /> {t("shuffle")}
          {settings.shuffleMode && (
            <span className="text-xs font-normal opacity-70">· {t(modeKey(settings.shuffleMode))}</span>
          )}
        </button>
        <button
          onClick={() => setShowModeMenu(true)}
          className="size-14 rounded-2xl bg-muted grid place-items-center"
          aria-label={t("default_shuffle")}
        >
          <SettingsIcon className="size-5" />
        </button>
      </div>

      {showModePicker && (
        <ShuffleModeDialog
          firstTime
          onPick={(m) => {
            setShuffleMode(m);
            setShowModePicker(false);
            // continue shuffle
            setTimeout(() => triggerShuffle(), 50);
          }}
          onClose={() => setShowModePicker(false)}
        />
      )}
      {showModeMenu && (
        <ShuffleModeDialog
          current={settings.shuffleMode}
          onPick={(m) => {
            setShuffleMode(m);
            setShowModeMenu(false);
            preparedRef.current = null;
            void prepareNext(m);
          }}
          onClose={() => setShowModeMenu(false)}
        />
      )}

      {quitOpen && (
        <QuitDialog
          onShuffle={() => {
            setQuitOpen(false);
            void triggerShuffle();
          }}
          onQuit={() => {
            setQuitOpen(false);
            doExit();
          }}
          onCancel={() => setQuitOpen(false)}
        />
      )}

      {overtimeOpen && step && (
        <OvertimeDialog
          stepTitle={step.title}
          onKeep={() => setOvertimeOpen(false)}
          onDone={() => {
            setOvertimeOpen(false);
            markStepDone();
          }}
          onSkip={() => {
            setOvertimeOpen(false);
            skip();
          }}
        />
      )}

      {historyOpen && (
        <HistoryDrawer
          flow={flow}
          activeStepId={step.id}
          onClose={() => setHistoryOpen(false)}
          onJump={(tId, sId) => {
            setActiveTaskId(tId);
            setActiveStepId(sId);
            setHistoryOpen(false);
          }}
        />
      )}
    </div>
  );
}

function modeKey(m: ShuffleMode) {
  return `shuffle_mode_${m === "this-flow" ? "this_flow" : m}`;
}

/* ---------- Shuffle mode dialog ---------- */
function ShuffleModeDialog({
  firstTime,
  current,
  onPick,
  onClose,
}: {
  firstTime?: boolean;
  current?: ShuffleMode | null;
  onPick: (m: ShuffleMode) => void;
  onClose: () => void;
}) {
  const t = useT();
  const modes: { id: ShuffleMode; key: string; sub: string }[] = [
    { id: "this-flow", key: "shuffle_mode_this_flow", sub: "shuffle_mode_this_flow_sub" },
    { id: "mixer", key: "shuffle_mode_mixer", sub: "shuffle_mode_mixer_sub" },
    { id: "world", key: "shuffle_mode_world", sub: "shuffle_mode_world_sub" },
    { id: "ai", key: "shuffle_mode_ai", sub: "shuffle_mode_ai_sub" },
  ];
  return (
    <div className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm flex items-end" onClick={onClose}>
      <div
        className="w-full max-w-xl mx-auto bg-card rounded-t-3xl p-5 pb-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold">{t("shuffle_pick_mode")}</h3>
          <button onClick={onClose} className="size-8 grid place-items-center rounded-full hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>
        {firstTime && <p className="text-xs text-muted-foreground mb-3">{t("shuffle_pick_mode_sub")}</p>}
        <div className="space-y-2 mt-2">
          {modes.map((m) => (
            <button
              key={m.id}
              onClick={() => onPick(m.id)}
              className={`w-full text-left rounded-2xl p-4 transition ${
                current === m.id ? "bg-brand-soft" : "bg-muted/50 hover:bg-muted"
              }`}
            >
              <p className="font-semibold">{t(m.key)}</p>
              <p className="text-xs text-muted-foreground">{t(m.sub)}</p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function OvertimeDialog({
  stepTitle,
  onKeep,
  onDone,
  onSkip,
}: {
  stepTitle: string;
  onKeep: () => void;
  onDone: () => void;
  onSkip: () => void;
}) {
  const t = useT();
  return (
    <div
      className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm grid place-items-center p-6"
      onClick={onKeep}
    >
      <div
        className="w-full max-w-sm bg-card rounded-3xl p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="text-xs uppercase tracking-wide text-destructive font-semibold">
          {t("overtime_label")}
        </p>
        <h3 className="mt-1 text-lg font-semibold break-words">{t("overtime_title")}</h3>
        <p className="mt-1 text-sm text-muted-foreground break-words">"{stepTitle}"</p>
        <p className="mt-2 text-sm text-muted-foreground">{t("overtime_body")}</p>
        <div className="mt-5 space-y-2">
          <button
            onClick={onKeep}
            className="w-full h-12 rounded-2xl bg-brand text-brand-foreground font-semibold"
          >
            {t("overtime_keep")}
          </button>
          <button onClick={onDone} className="w-full h-12 rounded-2xl bg-muted font-medium">
            {t("overtime_done")}
          </button>
          <button onClick={onSkip} className="w-full h-10 text-sm text-muted-foreground">
            {t("overtime_skip")}
          </button>
        </div>
      </div>
    </div>
  );
}

function QuitDialog({
  onShuffle,
  onQuit,
  onCancel,
}: {
  onShuffle: () => void;
  onQuit: () => void;
  onCancel: () => void;
}) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-50 bg-background/70 backdrop-blur-sm grid place-items-center p-6" onClick={onCancel}>
      <div className="w-full max-w-sm bg-card rounded-3xl p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <Dice5 className="size-7 text-brand" />
        <h3 className="mt-3 text-lg font-semibold">{t("quit_q_title")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("quit_q_body")}</p>
        <div className="mt-5 space-y-2">
          <button
            onClick={onShuffle}
            className="w-full h-12 rounded-2xl bg-brand text-brand-foreground font-semibold"
          >
            {t("shuffle_now")}
          </button>
          <button onClick={onQuit} className="w-full h-12 rounded-2xl bg-muted font-medium">
            {t("quit_anyway")}
          </button>
          <button onClick={onCancel} className="w-full h-10 text-sm text-muted-foreground">
            {t("cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Resume Briefing ---------- */
function ResumeBriefingOverlay({
  briefing,
  onClose,
}: {
  briefing: { header: string; bullets: string[] };
  onClose: () => void;
}) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-50 bg-background/95 backdrop-blur-sm flex flex-col items-center justify-center p-8 animate-in fade-in">
      <Sparkles className="size-8 text-brand" />
      <p className="mt-2 text-xs uppercase tracking-wide text-muted-foreground">
        {t("resume_briefing")}
      </p>
      <h2 className="mt-2 text-xl font-semibold text-center">{briefing.header}</h2>
      <ul className="mt-6 space-y-2 max-w-sm">
        {briefing.bullets.map((b, i) => (
          <li key={i} className="text-sm flex gap-2">
            <span className="text-brand">•</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <button
        onClick={onClose}
        className="mt-8 h-12 px-6 rounded-2xl bg-brand text-brand-foreground font-semibold"
      >
        {t("continue")}
      </button>
    </div>
  );
}

/* ---------- History Drawer ---------- */
function HistoryDrawer({
  flow,
  activeStepId,
  onClose,
  onJump,
}: {
  flow: Flow;
  activeStepId: string;
  onClose: () => void;
  onJump: (taskId: string, stepId: string) => void;
}) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-40 bg-background/60 backdrop-blur-sm flex justify-end" onClick={onClose}>
      <div
        className="h-full w-80 max-w-full bg-card p-5 overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">{t("session_label")}</h3>
          <button onClick={onClose} className="size-8 grid place-items-center rounded-full hover:bg-muted">
            <X className="size-4" />
          </button>
        </div>
        <div className="space-y-4">
          {flow.tasks.map((tk) => (
            <div key={tk.id}>
              <p className="text-xs uppercase tracking-wide text-muted-foreground mb-1 break-words">
                {tk.emoji} {tk.title}
              </p>
              <ul className="space-y-1">
                {tk.steps.map((s, i) => (
                  <li key={s.id}>
                    <button
                      onClick={() => onJump(tk.id, s.id)}
                      className={`w-full text-left text-sm rounded-xl px-3 py-2 flex items-center gap-2 ${
                        s.id === activeStepId
                          ? "bg-brand text-brand-foreground"
                          : s.isCompleted
                            ? "bg-muted/40 text-muted-foreground line-through"
                            : "hover:bg-muted/40"
                      }`}
                    >
                      <span className="text-[10px] font-semibold tabular-nums w-4 text-center">
                        {i + 1}
                      </span>
                      <span className="flex-1 break-words">{s.title}</span>
                      <span className="text-xs tabular-nums">{s.durationMinutes}m</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------- Summary ---------- */
function SummaryView({
  flow,
  metrics,
  onHome,
  onContinue,
}: {
  flow: Flow;
  metrics: SessionMetrics;
  onHome: () => void;
  onContinue: () => void;
}) {
  const t = useT();
  const fresh = useAppStore.getState().flows.find((f) => f.id === flow.id) ?? flow;
  const { progress } = computeFlowProgress(fresh);
  const nextActive = firstActive(fresh);
  const data = [{ name: "Progress", value: progress, fill: "var(--brand)" }];
  const summarize = useServerFn(sessionSummary);
  const [line, setLine] = useState<string>("");

  useEffect(() => {
    summarize({
      data: {
        flowTitle: flow.title,
        stepsDone: metrics.stepsDone,
        shuffles: metrics.shuffles,
        focusMinutes: Math.round(metrics.focusMin),
        lang: getLang(),
      },
    })
      .then((r) => setLine(r.line))
      .catch(() => setLine(""));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen flex flex-col items-center p-6 text-center">
      <p className="text-sm text-muted-foreground mt-6">{t("session_summary")}</p>
      <h1 className="text-2xl font-semibold mt-1 break-words">{fresh.title}</h1>

      <div className="my-6 w-56 h-56">
        <ResponsiveContainer>
          <RadialBarChart innerRadius="75%" outerRadius="100%" data={data} startAngle={90} endAngle={-270}>
            <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
            <RadialBar dataKey="value" cornerRadius={20} background={{ fill: "var(--muted)" }} />
            <text
              x="50%"
              y="50%"
              textAnchor="middle"
              dominantBaseline="middle"
              className="fill-foreground"
              style={{ fontSize: 32, fontWeight: 600 }}
            >
              {progress}%
            </text>
          </RadialBarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-2 w-full max-w-xs">
        <Mini label={t("time_focused")} value={`${Math.round(metrics.focusMin)}m`} />
        <Mini label={t("steps_done")} value={`${metrics.stepsDone.length}`} />
        <Mini label={t("tasks_done")} value={`${metrics.tasksDone}`} />
        <Mini label={t("flows_done")} value={`${metrics.flowDone ? 1 : 0}`} />
        <Mini label={t("shuffles")} value={`${metrics.shuffles}`} />
        <Mini label={t("chimes_heard")} value={`${metrics.chimes}`} />
      </div>

      {line && (
        <p className="mt-6 text-sm text-foreground/80 max-w-xs italic">"{line}"</p>
      )}

      <div className="mt-auto pt-6 space-y-2 w-full max-w-xs">
        {nextActive ? (
          <button
            onClick={onContinue}
            className="w-full h-14 rounded-2xl bg-brand text-brand-foreground font-semibold inline-flex items-center justify-center gap-2"
          >
            <Play className="size-5 fill-current" /> {t("keep_rolling")}
          </button>
        ) : null}
        <button
          onClick={onHome}
          className="w-full h-14 rounded-2xl bg-muted font-medium inline-flex items-center justify-center gap-2"
        >
          <Home className="size-5" /> {t("back_home")}
        </button>
      </div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-card border border-border/60 p-3">
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      <div className="text-[11px] text-muted-foreground">{label}</div>
    </div>
  );
}

/* ---------- Helpers ---------- */
function firstActive(flow: Flow): { taskId: string; stepId: string } | null {
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
  // mixer / world / ai => all flows except current task
  return allFlows.flatMap((f) =>
    f.tasks
      .filter(
        (tk) => !(f.id === currentFlow.id && tk.id === currentTask.id) && tk.status !== "completed",
      )
      .map((tk) => ({ flowId: f.id, taskId: tk.id })),
  );
}

interface Ranked {
  flowId: string;
  taskId: string;
  task: Task;
  step: Step;
  score: number;
}

function rankCandidates(
  allFlows: Flow[],
  currentFlow: Flow,
  currentTask: Task,
  mode: ShuffleMode,
  easyDone: number,
): Ranked[] {
  const pool = pickPool(allFlows, currentFlow, currentTask, mode);
  const items = pool
    .map(({ flowId, taskId }) => {
      const f = allFlows.find((x) => x.id === flowId);
      const tk = f?.tasks.find((x) => x.id === taskId);
      const s = tk?.steps.find((x) => !x.isCompleted);
      return tk && s ? { flowId, taskId, task: tk, step: s } : null;
    })
    .filter((x): x is { flowId: string; taskId: string; task: Task; step: Step } => !!x);
  if (!items.length) return [];

  const priorityRaw = (tk: Task) =>
    tk.priority === "quick" ? 0 : tk.priority === "focused" ? 2 : 1;

  const recoverMatrix: Record<string, Record<string, number>> = {
    hard: { easy: 1.0, medium: 0.5, hard: -0.4 },
    medium: { easy: 0.3, medium: 0, hard: -0.2 },
    easy: { easy: -0.3, medium: 0.3, hard: 0 },
  };
  const cur = currentTask.difficulty;
  const recoverRaw = (tk: Task) => {
    const cd = tk.difficulty;
    if (!cur || !cd) return 0;
    let v = recoverMatrix[cur]?.[cd] ?? 0;
    // Anti easy-loop guard
    if (easyDone >= 2) {
      if (cd === "easy") v -= 0.5;
      else if (cd === "medium") v += 0.4;
    }
    return v;
  };
  const durationFitRaw = (m: number) => (m > 25 ? 0 : Math.max(0, 1 - Math.abs(m - 12) / 20));
  const recencyRaw = (last?: number) => {
    if (!last) return 72;
    const h = (Date.now() - last) / 3600000;
    return Math.min(72, Math.max(0, h));
  };

  const raw = items.map((it) => ({
    ...it,
    pRaw: priorityRaw(it.task),
    rRaw: recoverRaw(it.task),
    dRaw: durationFitRaw(it.step.durationMinutes),
    aRaw: recencyRaw(it.task.lastCompletedAt),
  }));

  const rMin = Math.min(...raw.map((r) => r.rRaw));
  const rMax = Math.max(...raw.map((r) => r.rRaw));
  const rRange = rMax - rMin;

  return raw
    .map((r) => {
      const pN = r.pRaw / 2;
      const rN = rRange === 0 ? 0.5 : (r.rRaw - rMin) / rRange;
      const dN = r.dRaw;
      const aN = r.aRaw / 72;
      const score =
        0.30 * pN + 0.30 * rN + 0.25 * dN + 0.15 * aN + Math.random() * 0.05;
      return { flowId: r.flowId, taskId: r.taskId, task: r.task, step: r.step, score };
    })
    .sort((a, b) => b.score - a.score);
}

function pickCandidate(
  allFlows: Flow[],
  currentFlow: Flow,
  currentTask: Task,
  mode: ShuffleMode,
  easyDone = 0,
): { flowId: string; taskId: string } | null {
  const ranked = rankCandidates(allFlows, currentFlow, currentTask, mode, easyDone);
  if (!ranked.length) return null;
  const top = ranked.slice(0, 3);
  // weighted pick by score (shift so all positive)
  const minS = Math.min(...top.map((r) => r.score));
  const weights = top.map((r) => r.score - minS + 0.01);
  const total = weights.reduce((a, b) => a + b, 0);
  let pick = Math.random() * total;
  for (let i = 0; i < top.length; i++) {
    pick -= weights[i];
    if (pick <= 0) return { flowId: top[i].flowId, taskId: top[i].taskId };
  }
  return { flowId: top[0].flowId, taskId: top[0].taskId };
}

function nextDate(task: Task): string | undefined {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(0, 0, 0, 0);
  if (task.recurrence.kind === "interval") d.setDate(d.getDate() + Math.max(0, task.recurrence.days - 1));
  return d.toISOString().slice(0, 10);
}

let audioCtx: AudioContext | null = null;
function chime() {
  try {
    if (typeof window === "undefined") return;
    audioCtx =
      audioCtx ??
      new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    const ctx = audioCtx;
    const now = ctx.currentTime;
    const master = ctx.createGain();
    master.gain.value = 0.08;
    master.connect(ctx.destination);

    // Bell layer — soft two-tone sine (gentle major third)
    const bellGain = ctx.createGain();
    bellGain.gain.setValueAtTime(0, now);
    bellGain.gain.linearRampToValueAtTime(0.9, now + 0.08);
    bellGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
    bellGain.connect(master);
    [528, 660].forEach((freq) => {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = freq;
      o.connect(bellGain);
      o.start(now);
      o.stop(now + 1.7);
    });

    // White-noise layer — low-passed, fades in then out
    const noiseDur = 1.2;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * noiseDur), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * 0.5;
    const noise = ctx.createBufferSource();
    noise.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 800;
    filter.Q.value = 0.7;
    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0, now);
    noiseGain.gain.linearRampToValueAtTime(0.5, now + 0.2);
    noiseGain.gain.linearRampToValueAtTime(0, now + noiseDur);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(master);
    noise.start(now);
    noise.stop(now + noiseDur + 0.05);
  } catch {
    /* ignore */
  }
}

void totalDuration;

function InlineTitle({
  value,
  onChange,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const [local, setLocal] = useState(value);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setLocal(value);
  }, [value, editing]);
  if (editing) {
    return (
      <input
        autoFocus
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          const next = local.trim();
          if (next && next !== value) onChange(next);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          if (e.key === "Escape") {
            setLocal(value);
            setEditing(false);
          }
        }}
        className={className}
      />
    );
  }
  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className={`${className ?? ""} text-left truncate`}
    >
      {value}
    </button>
  );
}

function DurationControl({
  value,
  onChange,
}: {
  value: number;
  onChange: (v: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  return (
    <div className="inline-flex items-center bg-muted rounded-full p-0.5 shrink-0">
      <button
        onClick={() => onChange(Math.max(1, value - 1))}
        className="size-6 grid place-items-center rounded-full hover:bg-card"
        aria-label="-1"
      >
        <Minus className="size-3" />
      </button>
      <input
        type="number"
        min={1}
        value={text}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          if (raw === "") return;
          const v = parseInt(raw, 10);
          if (!isNaN(v) && v >= 1) onChange(v);
        }}
        onBlur={() => {
          const v = parseInt(text, 10);
          if (isNaN(v) || v < 1) {
            onChange(1);
            setText("1");
          }
        }}
        className="w-9 bg-transparent text-[11px] font-semibold text-center tabular-nums outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        aria-label="minutes"
      />
      <button
        onClick={() => onChange(value + 1)}
        className="size-6 grid place-items-center rounded-full hover:bg-card"
        aria-label="+1"
      >
        <Plus className="size-3" />
      </button>
    </div>
  );
}
