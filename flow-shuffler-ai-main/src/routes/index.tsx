import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAppStore } from "@/lib/store";
import { ObjectCube, type Piece } from "@/components/cube/ObjectCube";
import { useT } from "@/lib/i18n";
import { colorForFlow } from "@/lib/utils-flow";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Shufflow — A small helpful object" },
      { name: "description", content: "An object-based task manipulation interface for focused minds." },
    ],
  }),
  component: Home,
});

function Home() {
  const t = useT();
  const navigate = useNavigate();
  const flows = useAppStore((s) => s.flows);
  const hydrated = useAppStore((s) => s.hydrated);
  const [entered, setEntered] = useState(false);

  // The single flow the cube represents — most recently updated active flow
  const flow = flows.find((f) => f.status !== "completed") ?? flows[0] ?? null;

  // Build cube pieces from tasks
  const pieces: Piece[] = flow
    ? flow.tasks.slice(0, 8).map((tk) => ({
        id: tk.id,
        done: tk.status === "completed",
        active: tk.status === "in-progress",
        icon: <span className="text-xs">{tk.emoji}</span>,
      }))
    : [];

  const doneCount = pieces.filter((p) => p.done).length;
  // When empty, fully scattered (invites creation). When built, gently together.
  const explode = pieces.length === 0 ? 1 : 0.35 * (1 - doneCount / Math.max(1, pieces.length));

  useEffect(() => {
    if (!entered) return;
    const id = window.setTimeout(() => {
      if (flow) navigate({ to: "/flows/$flowId", params: { flowId: flow.id } });
      else navigate({ to: "/flows/new" });
    }, 480);
    return () => window.clearTimeout(id);
  }, [entered, flow, navigate]);

  if (!hydrated) {
    return <div className="min-h-screen" />;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6">
      {/* Subtle identity — almost invisible */}
      <p className="absolute top-8 left-1/2 -translate-x-1/2 text-xs tracking-[0.2em] uppercase text-muted-foreground/50">
        Shufflow
      </p>

      <ObjectCube
        state={flow ? "flow" : "idle"}
        size={200}
        pieces={pieces}
        explode={explode}
        hint={flow ? t("obj_hint_rotate") : t("obj_hint_idle")}
        onInteract={() => {
          // First interaction primes the cube; second deliberate press enters
          setEntered(true);
        }}
      />

      {/* Minimal context line — only after interaction */}
      {flow && (
        <p className="mt-2 text-xs text-muted-foreground/70 text-center max-w-xs">
          {doneCount}/{pieces.length} {t("obj_pieces_count")} · {flow.title}
        </p>
      )}

      {/* Quiet enter affordance */}
      <button
        onClick={() => setEntered(true)}
        className="mt-10 h-12 px-8 rounded-full bg-foreground/5 text-foreground/70 text-sm font-medium hover:bg-foreground/10 transition-colors"
      >
        {flow ? t("obj_enter") : t("obj_create_flow")}
      </button>
    </div>
  );
}
