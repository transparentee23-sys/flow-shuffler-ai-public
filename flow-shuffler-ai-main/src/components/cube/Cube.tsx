import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/**
 * Shufflow's shared 3D cube — the app's persistent visual anchor.
 *
 * Modes:
 *  - "idle"       gentle drift + drag to spin, no gesture target
 *  - "start"      drag to fill a ring, calls onStart when charged
 *  - "assembly"   shows N sub-pieces (2×2×2 up to 8) with per-piece done state
 *
 * Pure CSS 3D — no three.js. Rotation is written directly to a DOM ref via rAF
 * for smoothness (no per-frame React re-render).
 */

export type CubeMode = "idle" | "start" | "assembly";

export interface CubePieceState {
  id: string;
  done: boolean;
  active?: boolean;
  icon?: ReactNode;
}

interface Props {
  mode?: CubeMode;
  size?: number;
  pieces?: CubePieceState[]; // required for "assembly"
  onStart?: () => void; // "start" mode
  hint?: string;
  chargeLabel?: string;
  readyLabel?: string;
  onPieceClick?: (id: string) => void;
  /** For "assembly": how much to explode pieces apart (0 = whole cube, 1 = fully scattered) */
  explode?: number;
  className?: string;
}

const CHARGE_TARGET = 720;

export function Cube({
  mode = "idle",
  size = 168,
  pieces = [],
  onStart,
  hint,
  chargeLabel,
  readyLabel,
  onPieceClick,
  explode = 0,
  className,
}: Props) {
  const [rot, setRot] = useState({ x: -22, y: -34 });
  const [charge, setCharge] = useState(0);
  const [ready, setReady] = useState(false);
  const startedRef = useRef(false);
  const draggingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const chargeRef = useRef(0);

  const trigger = () => {
    if (startedRef.current || mode !== "start") return;
    startedRef.current = true;
    onStart?.();
  };

  const addRotation = (dx: number, dy: number) => {
    setRot((r) => ({ x: r.x - dy * 0.6, y: r.y + dx * 0.6 }));
    if (mode !== "start") return;
    const mag = Math.hypot(dx, dy) * 0.6;
    chargeRef.current = Math.min(CHARGE_TARGET, chargeRef.current + mag);
    const pct = Math.min(1, chargeRef.current / CHARGE_TARGET);
    setCharge(pct);
    if (pct >= 1 && !ready) {
      setReady(true);
      setTimeout(trigger, 350);
    }
  };

  const onDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    draggingRef.current = true;
    lastRef.current = { x: e.clientX, y: e.clientY };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!draggingRef.current || !lastRef.current) return;
    const dx = e.clientX - lastRef.current.x;
    const dy = e.clientY - lastRef.current.y;
    lastRef.current = { x: e.clientX, y: e.clientY };
    addRotation(dx, dy);
  };
  const onUp = () => {
    draggingRef.current = false;
    lastRef.current = null;
  };

  // Gentle idle drift
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      if (!draggingRef.current && !startedRef.current) {
        setRot((r) => ({ x: r.x, y: r.y + dt * 0.008 }));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const onKey = (e: React.KeyboardEvent) => {
    if (mode === "start" && (e.key === "Enter" || e.key === " ")) {
      e.preventDefault();
      trigger();
      return;
    }
    const step = 24;
    if (e.key === "ArrowLeft") addRotation(-step, 0);
    if (e.key === "ArrowRight") addRotation(step, 0);
    if (e.key === "ArrowUp") addRotation(0, -step);
    if (e.key === "ArrowDown") addRotation(0, step);
  };

  const ringSize = size + 120;
  const r = 130;
  const c = 2 * Math.PI * r;

  const cubeInner =
    pieces.length > 0 ? (
      <Assembly
        size={size}
        pieces={pieces}
        explode={explode}
        onPieceClick={onPieceClick}
      />
    ) : (
      <SolidCube size={size} ready={ready} />
    );

  return (
    <div className={`flex flex-col items-center select-none ${className ?? ""}`}>
      <div
        className="relative grid place-items-center"
        style={{ width: ringSize, height: ringSize, perspective: 900 }}
      >
        {mode === "start" && (
          <svg
            width={ringSize}
            height={ringSize}
            className="absolute inset-0 -rotate-90 pointer-events-none"
          >
            <circle cx={ringSize / 2} cy={ringSize / 2} r={r} stroke="var(--muted)" strokeWidth={4} fill="none" />
            <circle
              cx={ringSize / 2}
              cy={ringSize / 2}
              r={r}
              stroke="var(--brand)"
              strokeWidth={4}
              strokeLinecap="round"
              fill="none"
              strokeDasharray={c}
              strokeDashoffset={c * (1 - charge)}
              style={{ transition: "stroke-dashoffset 0.25s ease-out" }}
            />
          </svg>
        )}

        <div
          role={mode === "start" ? "button" : undefined}
          tabIndex={mode === "start" ? 0 : -1}
          aria-label={hint}
          onKeyDown={onKey}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          onDoubleClick={mode === "start" ? trigger : undefined}
          className={`relative touch-none outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-full ${
            mode === "start" ? "cursor-grab active:cursor-grabbing" : "cursor-grab active:cursor-grabbing"
          }`}
          style={{
            width: size,
            height: size,
            transformStyle: "preserve-3d",
            transform: `rotateX(${rot.x}deg) rotateY(${rot.y}deg)`,
            transition: draggingRef.current ? "none" : "transform 0.15s linear",
          }}
        >
          {cubeInner}
        </div>
      </div>

      {mode === "start" && (
        <>
          <p className="mt-6 text-sm text-muted-foreground text-center max-w-[18rem]">
            {ready ? readyLabel : hint}
          </p>
          <p className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground tabular-nums">
            {Math.round(charge * 100)}% · {chargeLabel}
          </p>
        </>
      )}
      {mode !== "start" && hint && (
        <p className="mt-6 text-sm text-muted-foreground text-center max-w-[18rem]">{hint}</p>
      )}
    </div>
  );
}

/* ---------------- Solid single cube ---------------- */
function SolidCube({ size, ready }: { size: number; ready: boolean }) {
  return (
    <>
      {(["front", "back", "right", "left", "top", "bottom"] as const).map((face) => (
        <Face key={face} face={face} size={size} ready={ready} />
      ))}
    </>
  );
}

function Face({
  face,
  size,
  ready,
}: {
  face: "front" | "back" | "right" | "left" | "top" | "bottom";
  size: number;
  ready: boolean;
}) {
  const half = size / 2;
  const transforms: Record<string, string> = {
    front: `translateZ(${half}px)`,
    back: `rotateY(180deg) translateZ(${half}px)`,
    right: `rotateY(90deg) translateZ(${half}px)`,
    left: `rotateY(-90deg) translateZ(${half}px)`,
    top: `rotateX(90deg) translateZ(${half}px)`,
    bottom: `rotateX(-90deg) translateZ(${half}px)`,
  };
  return (
    <div
      className="absolute inset-0 rounded-3xl border border-white/30"
      style={{
        transform: transforms[face],
        background:
          "linear-gradient(140deg, color-mix(in oklab, var(--brand) 85%, white) 0%, color-mix(in oklab, var(--brand) 55%, transparent) 60%, color-mix(in oklab, var(--brand) 90%, black) 100%)",
        boxShadow: ready
          ? "0 0 30px color-mix(in oklab, var(--brand) 70%, transparent), inset 0 0 40px rgba(255,255,255,0.15)"
          : "inset 0 0 30px rgba(255,255,255,0.12), 0 8px 24px rgba(0,0,0,0.15)",
        backfaceVisibility: "hidden",
      }}
    />
  );
}

/* ---------------- Assembly of sub-cubes ---------------- */
function Assembly({
  size,
  pieces,
  explode,
  onPieceClick,
}: {
  size: number;
  pieces: CubePieceState[];
  explode: number;
  onPieceClick?: (id: string) => void;
}) {
  const shown = pieces.slice(0, 8);
  // pad to 8 slots
  const slots: (CubePieceState | null)[] = [...shown];
  while (slots.length < 8) slots.push(null);

  const cell = size / 2;
  const gap = cell * 0.05 + explode * cell * 0.9; // grow apart on explode
  const offsets: [number, number, number][] = [
    [-1, -1, -1],
    [1, -1, -1],
    [-1, 1, -1],
    [1, 1, -1],
    [-1, -1, 1],
    [1, -1, 1],
    [-1, 1, 1],
    [1, 1, 1],
  ];

  return (
    <>
      {slots.map((p, i) => {
        const [ox, oy, oz] = offsets[i];
        const tx = (ox * (cell + gap - cell)) / 2 + (ox * gap) / 2;
        const ty = (oy * gap) / 2;
        const tz = (oz * gap) / 2;
        // position sub-cube center in the parent's coord system
        const cx = (ox * cell) / 2 + tx;
        const cy = (oy * cell) / 2 + ty;
        const cz = (oz * cell) / 2 + tz;
        return (
          <SubCube
            key={p?.id ?? `slot-${i}`}
            cell={cell}
            x={cx}
            y={cy}
            z={cz}
            piece={p}
            onClick={p && onPieceClick ? () => onPieceClick(p.id) : undefined}
          />
        );
      })}
    </>
  );
}

function SubCube({
  cell,
  x,
  y,
  z,
  piece,
  onClick,
}: {
  cell: number;
  x: number;
  y: number;
  z: number;
  piece: CubePieceState | null;
  onClick?: () => void;
}) {
  const half = cell / 2;
  const faces = ["front", "back", "right", "left", "top", "bottom"] as const;
  const transforms: Record<string, string> = {
    front: `translateZ(${half}px)`,
    back: `rotateY(180deg) translateZ(${half}px)`,
    right: `rotateY(90deg) translateZ(${half}px)`,
    left: `rotateY(-90deg) translateZ(${half}px)`,
    top: `rotateX(90deg) translateZ(${half}px)`,
    bottom: `rotateX(-90deg) translateZ(${half}px)`,
  };
  const done = piece?.done;
  const active = piece?.active;
  const empty = !piece;

  const bg = empty
    ? "linear-gradient(140deg, color-mix(in oklab, var(--muted) 90%, white), color-mix(in oklab, var(--muted) 70%, transparent))"
    : done
      ? "linear-gradient(140deg, color-mix(in oklab, var(--brand) 60%, white), color-mix(in oklab, var(--brand) 40%, transparent))"
      : active
        ? "linear-gradient(140deg, color-mix(in oklab, var(--brand) 100%, white), color-mix(in oklab, var(--brand) 70%, black))"
        : "linear-gradient(140deg, color-mix(in oklab, var(--brand) 80%, white), color-mix(in oklab, var(--brand) 50%, transparent) 60%, color-mix(in oklab, var(--brand) 85%, black))";

  const wrapStyle: CSSProperties = {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: cell,
    height: cell,
    marginLeft: -half,
    marginTop: -half,
    transformStyle: "preserve-3d",
    transform: `translate3d(${x}px, ${y}px, ${z}px)`,
    transition: "transform 500ms cubic-bezier(.4,0,.2,1), opacity 300ms",
    opacity: empty ? 0.35 : 1,
    cursor: onClick ? "pointer" : "default",
  };

  return (
    <div style={wrapStyle} onPointerDown={(e) => e.stopPropagation()} onClick={onClick}>
      {faces.map((face) => (
        <div
          key={face}
          className="absolute inset-0 rounded-[10px] border border-white/25 grid place-items-center"
          style={{
            transform: transforms[face],
            background: bg,
            boxShadow: active
              ? "0 0 20px color-mix(in oklab, var(--brand) 60%, transparent), inset 0 0 18px rgba(255,255,255,0.18)"
              : "inset 0 0 12px rgba(255,255,255,0.12), 0 4px 10px rgba(0,0,0,0.14)",
            backfaceVisibility: "hidden",
            color: "white",
          }}
        >
          {face === "front" && piece?.icon ? (
            <div className="text-lg opacity-90 pointer-events-none">{piece.icon}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
