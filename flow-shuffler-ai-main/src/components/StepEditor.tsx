import { useEffect, useState } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Minus, Plus, Trash2 } from "lucide-react";
import type { Step } from "@/lib/types";
import { uid } from "@/lib/utils-flow";
import { useT } from "@/lib/i18n";

interface Props {
  steps: Step[];
  onChange: (steps: Step[]) => void;
}

export function StepEditor({ steps, onChange }: Props) {
  const t = useT();
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  const handleDrag = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldI = steps.findIndex((s) => s.id === active.id);
    const newI = steps.findIndex((s) => s.id === over.id);
    onChange(arrayMove(steps, oldI, newI));
  };

  const update = (id: string, patch: Partial<Step>) =>
    onChange(steps.map((s) => (s.id === id ? { ...s, ...patch } : s)));

  return (
    <div className="space-y-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDrag}>
        <SortableContext items={steps.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          {steps.map((s, i) => (
            <SortableStep
              key={s.id}
              step={s}
              index={i}
              onChange={(patch) => update(s.id, patch)}
              onDelete={() => onChange(steps.filter((x) => x.id !== s.id))}
            />
          ))}
        </SortableContext>
      </DndContext>
      <button
        onClick={() =>
          onChange([...steps, { id: uid(), title: t("new_step"), durationMinutes: 10, isCompleted: false }])
        }
        className="w-full h-12 rounded-2xl border border-dashed border-border text-sm text-muted-foreground hover:bg-muted/40 inline-flex items-center justify-center gap-2"
      >
        <Plus className="size-4" /> {t("add_step")}
      </button>
    </div>
  );
}

function SortableStep({
  step,
  index,
  onChange,
  onDelete,
}: {
  step: Step;
  index: number;
  onChange: (p: Partial<Step>) => void;
  onDelete: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: step.id,
  });
  const [editing, setEditing] = useState(false);
  const [minText, setMinText] = useState(String(step.durationMinutes));
  useEffect(() => {
    setMinText(String(step.durationMinutes));
  }, [step.durationMinutes]);

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`rounded-2xl bg-card border border-border/60 p-3 flex items-center gap-2 ${
        isDragging ? "shadow-lg" : ""
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="size-8 rounded-lg grid place-items-center text-muted-foreground hover:bg-muted touch-none"
        aria-label="Drag"
      >
        <GripVertical className="size-4" />
      </button>
      <span className="text-[10px] font-semibold text-muted-foreground tabular-nums w-5 text-center">
        {index + 1}
      </span>
      {editing ? (
        <input
          autoFocus
          value={step.title}
          onChange={(e) => onChange({ title: e.target.value })}
          onBlur={() => setEditing(false)}
          onKeyDown={(e) => e.key === "Enter" && setEditing(false)}
          className="flex-1 bg-transparent outline-none text-sm font-medium"
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          className="flex-1 text-left text-sm font-medium break-words"
        >
          {step.title}
        </button>
      )}
      <div className="inline-flex items-center bg-muted rounded-full p-0.5 shrink-0">
        <button
          className="size-7 grid place-items-center rounded-full hover:bg-card"
          onClick={() => onChange({ durationMinutes: Math.max(1, step.durationMinutes - 1) })}
          aria-label="-1"
        >
          <Minus className="size-3" />
        </button>
        <input
          type="number"
          min={0}
          value={minText}
          onChange={(e) => {
            const raw = e.target.value;
            setMinText(raw);
            if (raw === "") return;
            const v = parseInt(raw, 10);
            if (!isNaN(v) && v >= 0) onChange({ durationMinutes: v });
          }}
          onBlur={() => {
            const v = parseInt(minText, 10);
            if (isNaN(v) || v < 1) {
              onChange({ durationMinutes: 1 });
              setMinText("1");
            }
          }}
          className="w-12 bg-transparent text-xs font-semibold text-center tabular-nums outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          aria-label="minutes"
        />
        <button
          className="size-7 grid place-items-center rounded-full hover:bg-card"
          onClick={() => onChange({ durationMinutes: step.durationMinutes + 1 })}
          aria-label="+1"
        >
          <Plus className="size-3" />
        </button>
      </div>
      <button
        onClick={onDelete}
        className="size-8 rounded-lg grid place-items-center text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        aria-label="Delete step"
      >
        <Trash2 className="size-3.5" />
      </button>
    </div>
  );
}
