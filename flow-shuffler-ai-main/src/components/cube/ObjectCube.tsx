import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";

/**
 * ObjectCube — Shufflow's single evolving object.
 *
 * The cube IS the interface. It evolves through states:
 *   idle      → quiet, almost invisible, invites touch
 *   flow      → represents a Flow; shows Task Pieces as sub-cubes
 *   task      → one Task Piece separated forward
 *   decompose → a large piece splits into smaller step pieces
 *   assemble  → completed pieces return into the cube
 *
 * Pure CSS 3D transforms. No three.js. Rotation is driven via rAF
 * for smoothness without per-frame React re-renders.
 */

export type CubeState = "idle" | "flow" | "task" | "decompose" | "assemble";

export interface Piece {
  id: string;
  done: boolean;
  active?: boolean;
  icon?: ReactNode;
  /** relative size 0.5..1 — communicates complexity/effort */
  scale?: number;
}

interface Props {
  state?: CubeState;
  size?: number;
  pieces?: Piece[];
  /** 0 = whole cube, 1 = fully scattered */
  explode?: number;
  /** rotate to a specific face index (0-5) — for "entering" a flow */
  faceIndex?: number;
  hint?: string;
  onPieceClick?: (id: string) => void;
  onInteract?: () => void;
  className?: string;
}

const FACES = ["front", "back", "right", "left", "top", "bottom"] as const;

export function ObjectCube({
  state = "idle",
  size = 180,
  pieces = [],
  explode = 0,
  faceIndex,
  hint,
  onPieceClick,
  onInteract,
  className,
}: Props) {
  const [rot, setRot] = useState({ x: -20, y: -32 });
  const [interacted, setInteracted] = useState(false);
  const draggingRef = useRef(false);
  const lastRef = useRef<{ x: number; y: number } | null>(null);
  const interactedRef = useRef(false);

  const addRotation = (dx: number, dy: number) => {
    setRot((r) => ({ x: r.x - dy * 0.5, y: r.y + dx * 0.5 }));
    if (!interactedRef.current) {
      interactedRef.current = true;
      setInteracted(true);
      onInteract?.();
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

  // Gentle idle drift — only when not interacted with and idle
  useEffect(() => {
    if (interacted && state === "idle") return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = now - last;
      last = now;
      if (!draggingRef.current) {
        setRot((r) => ({ x: r.x, y: r.y + dt * 0.006 }));
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interacted, state]);

  const onKey = (e: React.KeyboardEvent) => {
    const step = 22;
    if (e.key === "ArrowLeft") addRotation(-step, 0);
    if (e.key === "ArrowRight") addRotation(step, 0);
    if (e.key === "ArrowUp") addRotation(0, -step);
    if (e.key === "ArrowDown") addRotation(0, step);
  };

  const showPieces = pieces.length > 0 && state !== "idle";
  const inner = showPieces ? (
    <Assembly
      size={size}
      pieces={pieces}
      explode={explode}
      onPieceClick={onPieceClick}
    />
  ) : (
    <SolidCube size={size} state={state} />
  );

  return (
    <div className={`flex flex-col items-center select-none ${className ?? ""}`}>
      <div
        className="relative grid place-items-center"
        style={{ width: size + 80, height: size + 80, perspective: 1000 }}
      >
        {/* soft ground shadow */}
        <div
          className="absolute bottom-2 left-1/2 -translate-x-1/2 rounded-full bg-black/10 blur-md"
          style={{
            width: size * 0.7,
            height: size * 0.12,
            transform: "translateZ(-40px)",
          }}
        />
        <div
          role="button"
          tabIndex={0}
          aria-label={hint}
          onKeyDown={onKey}
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          className="relative touch-none outline-none focus-visible:ring-2 focus-visible:ring-brand rounded-full cursor-grab active:cursor-grabbing"
          style={{
            width: size,
            height: size,
            transformStyle: "preserve-3d",
            transform: `rotateX(${rot.x}deg) rotateY(${rot.y}deg)`,
            transition: draggingRef.current ? "none" : "transform 0.4s cubic-bezier(.2,.7,.3,1)",
          }}
        >
          {inner}
        </div>
      </div>
      {hint && (
        <p
          className={`mt-5 text-sm text-center max-w-[16rem] transition-opacity duration-700 ${
            interacted && state === "idle" ? "opacity-0" : "opacity-60"
          }`}
        >
          {hint}
        </p>
      )}
    </div>
  );
}

/* ---------------- Solid single cube ---------------- */
function SolidCube({ size, state }: { size: number; state: CubeState }) {
  const opacity = state === "idle" ? 0.55 : 0.92;
  return (
    <>
      {FACES.map((face) => (
        <Face key={face} face={face} size={size} opacity={opacity} />
      ))}
    </>
  );
}

function Face({
  face,
  size,
  opacity,
}: {
  face: (typeof FACES)[number];
  size: number;
  opacity: number;
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
      className="absolute inset-0 rounded-2xl border border-white/20"
      style={{
        transform: transforms[face],
        background:
          "linear-gradient(135deg, color-mix(in oklab, var(--brand) 80%, white) 0%, color-mix(in oklab, var(--brand) 50%, transparent) 55%, color-mix(in oklab, var(--brand) 85%, black) 100%)",
        opacity,
        boxShadow: "inset 0 0 24px rgba(255,255,255,0.1), 0 6px 18px rgba(0,0,0,0.12)",
        backfaceVisibility: "hidden",
        transition: "opacity 600ms ease",
      }}
    />
  );
}

/* ---------------- Assembly of sub-pieces ---------------- */
function Assembly({
  size,
  pieces,
  explode,
  onPieceClick,
}: {
  size: number;
  pieces: Piece[];
  explode: number;
  onPieceClick?: (id: string) => void;
}) {
  const shown = pieces.slice(0, 8);
  const slots: (Piece | null)[] = [...shown];
  while (slots.length < 8) slots.push(null);

  const cell = size / 2;
  const gap = cell * 0.04 + explode * cell * 0.85;
  const offsets: [number, number, number][] = [
    [-1, -1, -1], [1, -1, -1], [-1, 1, -1], [1, 1, -1],
    [-1, -1, 1], [1, -1, 1], [-1, 1, 1], [1, 1, 1],
  ];

  return (
    <>
      {slots.map((p, i) => {
        const [ox, oy, oz] = offsets[i];
        const cx = (ox * cell) / 2 + (ox * gap) / 2;
        const cy = (oy * cell) / 2 + (oy * gap) / 2;
        const cz = (oz * cell) / 2 + (oz * gap) / 2;
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
  piece: Piece | null;
  onClick?: () => void;
}) {
  const half = cell / 2;
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
  const scale = piece?.scale ?? 1;

  const bg = empty
    ? "linear-gradient(135deg, color-mix(in oklab, var(--muted) 80%, white), color-mix(in oklab, var(--muted) 60%, transparent))"
    : done
      ? "linear-gradient(135deg, color-mix(in oklab, var(--brand) 55%, white), color-mix(in oklab, var(--brand) 35%, transparent))"
      : active
        ? "linear-gradient(135deg, color-mix(in oklab, var(--brand) 100%, white), color-mix(in oklab, var(--brand) 70%, black))"
        : "linear-gradient(135deg, color-mix(in oklab, var(--brand) 78%, white), color-mix(in oklab, var(--brand) 48%, transparent) 60%, color-mix(in oklab, var(--brand) 82%, black))";

  const wrapStyle: CSSProperties = {
    position: "absolute",
    left: "50%",
    top: "50%",
    width: cell * scale,
    height: cell * scale,
    marginLeft: -(half * scale),
    marginTop: -(half * scale),
    transformStyle: "preserve-3d",
    transform: `translate3d(${x}px, ${y}px, ${z}px)`,
    transition: "transform 600ms cubic-bezier(.4,0,.2,1), opacity 400ms",
    opacity: empty ? 0.28 : 1,
    cursor: onClick ? "pointer" : "default",
  };

  return (
    <div style={wrapStyle} onPointerDown={(e) => e.stopPropagation()} onClick={onClick}>
      {FACES.map((face) => (
        <div
          key={face}
          className="absolute inset-0 rounded-[8px] border border-white/20 grid place-items-center"
          style={{
            transform: transforms[face],
            background: bg,
            boxShadow: active
              ? "0 0 18px color-mix(in oklab, var(--brand) 55%, transparent), inset 0 0 14px rgba(255,255,255,0.16)"
              : "inset 0 0 10px rgba(255,255,255,0.1), 0 3px 8px rgba(0,0,0,0.12)",
            backfaceVisibility: "hidden",
            color: "white",
          }}
        >
          {face === "front" && piece?.icon ? (
            <div className="text-base opacity-90 pointer-events-none">{piece.icon}</div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
