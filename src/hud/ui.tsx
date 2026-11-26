import { animate, motion, useMotionValue, useTransform } from "motion/react";
import { useEffect, useId, type ReactNode } from "react";
import { cn, formatNumber } from "@/lib/format";
import { deviation, inBand } from "@/sim/metrics";
import type { Metric } from "@/sim/types";

export type Tone = "neutral" | "ok" | "warn" | "crit" | "info" | "luna";

const toneClass: Record<Tone, string> = {
  neutral: "bg-panel-2 text-ink-2 ring-line-2",
  ok: "bg-ok-soft text-[#1f7a43] ring-[#bfe3cc]",
  warn: "bg-warn-soft text-[#9a5b05] ring-[#f3d9a8]",
  crit: "bg-crit-soft text-[#b42318] ring-[#f6c4bf]",
  info: "bg-info-soft text-[#2459a6] ring-[#c7d9f3]",
  luna: "bg-luna-soft text-luna-ink ring-[#f8dcb0]",
};

export function Pill({ tone = "neutral", children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={cn("inline-flex h-5 items-center gap-1.5 rounded-full px-2 text-[11px] leading-none font-medium whitespace-nowrap ring-1 ring-inset", toneClass[tone], className)}>
      {dot ? <span className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("text-[10.5px] font-medium tracking-[0.08em] text-faint uppercase", className)}>{children}</div>;
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[5px] bg-panel-2 px-1 font-mono text-[10px] text-muted ring-1 ring-line-2 ring-inset">{children}</kbd>;
}

export function Section({ title, action, children, className }: { title: ReactNode; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("flex flex-col gap-2.5", className)}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-[12px] font-semibold tracking-[-0.005em] text-ink">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Smoothly animates numeric changes so live values tick instead of jump. */
export function Num({ value, digits = 0, className, suffix }: { value: number; digits?: number; className?: string; suffix?: string }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => `${formatNumber(v, digits)}${suffix ?? ""}`);
  useEffect(() => {
    const c = animate(mv, value, { duration: 0.8, ease: "easeOut" });
    return () => c.stop();
  }, [mv, value]);
  return <motion.span className={cn("tabular", className)}>{text}</motion.span>;
}

export function Sparkline({ data, color = "#4f6d8f", height = 28, width = 96, band, fill = true, className }: { data: number[]; color?: string; height?: number; width?: number; band?: [number, number]; fill?: boolean; className?: string }) {
  const id = useId();
  if (data.length < 2) return <svg width={width} height={height} />;
  let lo = Math.min(...data);
  let hi = Math.max(...data);
  if (band) {
    lo = Math.min(lo, band[0]);
    hi = Math.max(hi, band[1]);
  }
  const pad = (hi - lo) * 0.12 || 1;
  lo -= pad;
  hi += pad;
  const x = (i: number) => (i / (data.length - 1)) * width;
  const y = (v: number) => height - ((v - lo) / (hi - lo)) * height;
  const d = data.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className={cn("overflow-visible", className)}>
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.22" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {band ? <rect x={0} width={width} y={y(band[1])} height={Math.max(0, y(band[0]) - y(band[1]))} fill="#2f9e5b" opacity={0.07} /> : null}
      {fill ? <path d={`${d}L${width},${height}L0,${height}Z`} fill={`url(#${id})`} /> : null}
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(data.length - 1)} cy={y(data[data.length - 1])} r={2.2} fill={color} />
    </svg>
  );
}

/** Horizontal meter showing a value against its target band. */
export function BandMeter({ metric, className }: { metric: Metric; className?: string }) {
  const span = metric.high - metric.low || 1;
  const lo = metric.low - span * 0.5;
  const hi = metric.high + span * 0.5;
  const pos = (v: number) => `${Math.max(0, Math.min(100, ((v - lo) / (hi - lo)) * 100))}%`;
  const ok = inBand(metric);
  const dev = deviation(metric);
  const color = ok ? "#2f9e5b" : dev > 0.35 ? "#dc4a3d" : "#d98a0b";
  return (
    <div className={cn("relative h-1.5 w-full rounded-full bg-[#eef1f4]", className)}>
      <div className="absolute inset-y-0 rounded-full bg-[#d7eedf]" style={{ left: pos(metric.low), right: `calc(100% - ${pos(metric.high)})` }} />
      <div className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-white transition-[left] duration-700" style={{ left: pos(metric.value), background: color }} />
    </div>
  );
}

export function metricTone(m: Metric): Tone {
  if (inBand(m)) return "ok";
  return deviation(m) > 0.35 ? "crit" : "warn";
}

/** Room left for a tile's sparkline once its value and unit are set (half-width tiles are ~140 px inside). */
function sparkWidth(m: Metric) {
  const text = formatNumber(m.value, m.precision).length * 11.5 + (m.unit ? 4 + m.unit.length * 6 : 0);
  const room = 140 - 8 - text;
  return room >= 64 ? 64 : room >= 32 ? Math.floor(room) : 0;
}

export function MetricTile({ metric, label, compact, className }: { metric: Metric; label?: string; compact?: boolean; className?: string }) {
  const tone = metricTone(metric);
  const color = tone === "ok" ? "#4f6d8f" : tone === "warn" ? "#d98a0b" : "#dc4a3d";
  return (
    <div className={cn("flex flex-col gap-2 rounded-xl bg-panel-2 p-3", tone !== "ok" && (tone === "crit" ? "bg-crit-soft/70" : "bg-warn-soft/70"), className)}>
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-[11.5px] text-muted">{label ?? metric.label}</span>
        {tone !== "ok" ? <span className={cn("size-1.5 rounded-full", tone === "crit" ? "bg-crit" : "bg-warn")} /> : null}
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="flex items-baseline gap-1">
          <Num value={metric.value} digits={metric.precision} className={cn("font-mono text-[19px] leading-none font-medium tracking-[-0.02em]", tone === "crit" ? "text-crit" : tone === "warn" ? "text-[#b26b00]" : "text-ink")} />
          {metric.unit ? <span className="text-[10.5px] text-muted">{metric.unit}</span> : null}
        </div>
        {!compact && sparkWidth(metric) ? <Sparkline data={metric.history.slice(-40)} color={color} width={sparkWidth(metric)} height={22} band={[metric.low, metric.high]} fill={false} className="shrink-0" /> : null}
      </div>
      <BandMeter metric={metric} />
      {compact ? (
        // Narrow tiles: the band is on the meter, so only the target needs words.
        <div className="text-center font-mono text-[9.5px] text-faint tabular">target {formatNumber(metric.setpoint, metric.precision)}</div>
      ) : (
        <div className="flex justify-between font-mono text-[9.5px] text-faint tabular">
          <span>{formatNumber(metric.low, metric.precision)}</span>
          <span>target {formatNumber(metric.setpoint, metric.precision)}</span>
          <span>{formatNumber(metric.high, metric.precision)}</span>
        </div>
      )}
    </div>
  );
}

export function Progress({ value, tone = "ok", className, height = 6 }: { value: number; tone?: Tone; className?: string; height?: number }) {
  const color = tone === "ok" ? "#2f9e5b" : tone === "warn" ? "#e59b1a" : tone === "crit" ? "#dc4a3d" : tone === "luna" ? "#f0a43a" : tone === "info" ? "#3f7fd6" : "#4f6d8f";
  return (
    <div className={cn("w-full overflow-hidden rounded-full bg-[#eaeef2]", className)} style={{ height }}>
      <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%`, background: color }} />
    </div>
  );
}

export function Fact({ label, children, mono }: { label: string; children: ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-line py-1.5 last:border-b-0">
      <span className="text-[12px] text-muted">{label}</span>
      <span className={cn("text-right text-[12px] text-ink", mono && "font-mono text-[11.5px] tabular")}>{children}</span>
    </div>
  );
}

export function Segmented<T extends string>({ value, options, onChange, className, size = "md" }: { value: T; options: { value: T; label: ReactNode }[]; onChange: (v: T) => void; className?: string; size?: "sm" | "md" }) {
  return (
    <div className={cn("inline-flex rounded-[10px] bg-[#eef1f4] p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "relative rounded-[8px] font-medium whitespace-nowrap transition-colors",
            size === "sm" ? "h-6 px-2 text-[11px]" : "h-7 px-2.5 text-[12px]",
            value === o.value ? "bg-white text-ink shadow-[0_0_0_1px_rgb(15_27_42/0.08),0_1px_2px_rgb(15_27_42/0.08)]" : "text-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function IconButton({ children, onClick, active, title, className }: { children: ReactNode; onClick?: () => void; active?: boolean; title?: string; className?: string }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={cn(
        "flex size-9 items-center justify-center rounded-[10px] text-ink-2 transition-colors hover:bg-[#f1f4f7]",
        active && "bg-luna-soft text-luna-ink ring-1 ring-[#f8dcb0] ring-inset hover:bg-luna-soft",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function LunaMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 29 24" className={cn("h-5 w-6", className)} aria-hidden>
      <path fillRule="evenodd" clipRule="evenodd" d="M14.5 0L0 24H29L14.5 0ZM19.5581 18.6188H9.41826L14.5 10.2578L19.5581 18.6188Z" fill="#FCB858" />
    </svg>
  );
}
