interface Props {
  remaining: number;
  total: number;
  /** seconds until next chime */
  chimeRemaining?: number | null;
  chimeLabel?: string;
  overtimeLabel?: string;
}

export function CircularTimer({ remaining, total, chimeRemaining, chimeLabel, overtimeLabel }: Props) {
  const size = 240;
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const overtime = remaining < 0;
  const pct = overtime ? 1 : total > 0 ? Math.max(0, Math.min(1, remaining / total)) : 0;
  const offset = c * (1 - pct);
  const abs = Math.abs(remaining);
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  const cm = chimeRemaining != null ? Math.max(0, Math.floor(chimeRemaining / 60)) : null;
  const cs = chimeRemaining != null ? Math.max(0, chimeRemaining % 60) : null;
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} stroke="var(--muted)" strokeWidth={stroke} fill="none" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={overtime ? "var(--destructive)" : "var(--brand)"}
          strokeWidth={stroke}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={c}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.4s linear" }}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center">
          {overtime && overtimeLabel ? (
            <div className="text-[11px] uppercase tracking-wide text-destructive font-semibold mb-0.5">
              {overtimeLabel}
            </div>
          ) : null}
          <div className={`text-5xl font-semibold tabular-nums tracking-tight ${overtime ? "text-destructive" : ""}`}>
            {overtime ? "+" : ""}
            {String(m).padStart(2, "0")}:{String(s).padStart(2, "0")}
          </div>
          {chimeRemaining != null && cm != null && cs != null ? (
            <div className="text-[11px] uppercase tracking-wide text-muted-foreground mt-1.5">
              {chimeLabel ?? "Next chime in"}{" "}
              <span className="tabular-nums font-medium text-foreground/80">
                {String(cm).padStart(2, "0")}:{String(cs).padStart(2, "0")}
              </span>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
