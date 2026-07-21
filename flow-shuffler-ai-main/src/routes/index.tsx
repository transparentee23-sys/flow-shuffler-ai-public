import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, Sparkles } from "lucide-react";
import { useAppStore } from "@/lib/store";
import { AppHeader } from "@/components/AppHeader";
import { FlowCard } from "@/components/FlowCard";
import { Cube } from "@/components/cube/Cube";
import { useT } from "@/lib/i18n";
import { toast } from "sonner";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Shufflow — Your focus dashboard" },
      { name: "description", content: "Your active flows and finished wins." },
    ],
  }),
  component: Home,
});

function Home() {
  const t = useT();
  const flows = useAppStore((s) => s.flows);
  const hydrated = useAppStore((s) => s.hydrated);
  const deleteFlow = useAppStore((s) => s.deleteFlow);
  const [tab, setTab] = useState<"active" | "finished">("active");
  const [g, setG] = useState("");

  useEffect(() => {
    const h = new Date().getHours();
    if (h < 5) setG(t("greeting_late"));
    else if (h < 12) setG(t("greeting_morning"));
    else if (h < 18) setG(t("greeting_afternoon"));
    else setG(t("greeting_evening"));
  }, [t]);

  const { active, finished } = useMemo(() => {
    const a = flows.filter((f) => f.status !== "completed");
    const c = flows.filter((f) => f.status === "completed");
    return { active: a, finished: c };
  }, [flows]);

  const list = tab === "active" ? active : finished;

  return (
    <div className="pb-32">
      <AppHeader />
      <div className="px-5">
        <p className="text-sm text-muted-foreground">{g}</p>
        <h1 className="text-3xl font-semibold tracking-tight mt-1">{t("home_question")}</h1>
      </div>

      <div className="mt-6 flex flex-col items-center">
        <Cube size={140} />
        <p className="mt-4 px-8 text-center text-sm text-muted-foreground max-w-sm">
          {t("home_value_prop")}
        </p>
      </div>

      <div className="px-5 mt-6">
        <div className="inline-flex bg-muted rounded-full p-1">
          {(["active", "finished"] as const).map((k) => (
            <button
              key={k}
              onClick={() => setTab(k)}
              className={`px-4 h-9 rounded-full text-sm font-medium transition ${
                tab === k ? "bg-card text-foreground shadow-soft" : "text-muted-foreground"
              }`}
            >
              {k === "active"
                ? `${t("tab_active")} · ${active.length}`
                : `${t("tab_finished")} · ${finished.length}`}
            </button>
          ))}
        </div>
      </div>

      <div className="px-5 mt-5 space-y-3">
        {!hydrated ? (
          <div className="h-40 rounded-3xl bg-muted animate-pulse" />
        ) : list.length === 0 ? (
          <EmptyState tab={tab} />
        ) : (
          list.map((f) => (
            <FlowCard
              key={f.id}
              flow={f}
              onDelete={() => {
                deleteFlow(f.id);
                toast.success(t("flow_deleted"));
              }}
            />
          ))
        )}
      </div>

      <Link
        to="/flows/new"
        className="fixed bottom-6 right-6 left-6 max-w-xl mx-auto h-14 rounded-2xl bg-brand text-brand-foreground font-semibold shadow-glow grid place-items-center hover:opacity-95 transition"
      >
        <span className="inline-flex items-center gap-2">
          <Plus className="size-5" /> {t("new_flow")}
        </span>
      </Link>
    </div>
  );
}

function EmptyState({ tab }: { tab: "active" | "finished" }) {
  const t = useT();
  return (
    <div className="text-center py-16 rounded-3xl border border-dashed border-border/70 bg-card/40">
      <div className="size-14 mx-auto rounded-2xl bg-brand-soft grid place-items-center">
        <Sparkles className="size-6 text-brand" />
      </div>
      <p className="mt-3 font-medium">
        {tab === "active" ? t("empty_active_title") : t("empty_finished_title")}
      </p>
      <p className="text-sm text-muted-foreground mt-1">
        {tab === "active" ? t("empty_active_sub") : t("empty_finished_sub")}
      </p>
    </div>
  );
}
