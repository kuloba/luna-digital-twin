import type { ReactNode } from "react";
import { cn, formatNumber } from "@/lib/format";

/** Vertical tank with a live liquid level, low-level line and ticks. */
export function TankGauge({ level, color, low, warn, width = 34, height = 64, className }: { level: number; color: string; low?: number; warn?: boolean; width?: number; height?: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, level));
  return (
    <div
      className={cn("relative overflow-hidden rounded-[9px] bg-[#f4f7f9] ring-1 ring-inset", warn ? "ring-[#f0c77d]" : "ring-[#dbe3ea]", className)}
      style={{ width, height }}
    >
      <div className="absolute inset-x-0 bottom-0 transition-[height] duration-700 ease-out" style={{ height: `${pct}%`, background: `linear-gradient(180deg, ${color}dd, ${color})` }}>
        <div className="absolute inset-x-0 top-0 h-px bg-white/70" />
      </div>
      {[25, 50, 75].map((t) => (
        <div key={t} className="absolute right-0 h-px w-1.5 bg-[#94a3b8]/60" style={{ bottom: `${t}%` }} />
      ))}
      {low !== undefined ? <div className="absolute inset-x-0 border-t border-dashed border-[#d98a0b]/80" style={{ bottom: `${low}%` }} /> : null}
    </div>
  );
}

/** Circular progress ring with free-form centre content. */
export function Ring({ value, size = 44, stroke = 4, color = "#2f9e5b", track = "#e8edf1", children }: { value: number; size?: number; stroke?: number; color?: string; track?: string; children?: ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.max(0, Math.min(1, value));
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - v)} style={{ transition: "stroke-dashoffset 0.7s ease-out" }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}

/** Battery glyph with charge level. */
export function Battery({ value, charging, className }: { value: number; charging?: boolean; className?: string }) {
  const color = charging ? "#3f7fd6" : value < 25 ? "#dc4a3d" : value < 40 ? "#e59b1a" : "#2f9e5b";
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      <span className="relative inline-flex h-[11px] w-[22px] items-center rounded-[3px] p-px ring-1 ring-[#b8c3ce] ring-inset">
        <span className="h-full rounded-[2px] transition-[width] duration-700" style={{ width: `${Math.max(4, Math.min(100, value))}%`, background: color }} />
        <span className="absolute -right-[3px] h-[5px] w-[2px] rounded-r-[1px] bg-[#b8c3ce]" />
      </span>
      <span className="font-mono text-[11px] text-ink-2 tabular">{formatNumber(value)}%</span>
    </span>
  );
}

/** Slot grid for pallets / trays (filled vs capacity). */
export function SlotGrid({ filled, capacity, cols = 8, color = "#4f6d8f", highlight = 0, highlightColor = "#f0a43a" }: { filled: number; capacity: number; cols?: number; color?: string; highlight?: number; highlightColor?: string }) {
  return (
    <div className="grid gap-[3px]" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
      {Array.from({ length: capacity }, (_, i) => (
        <div
          key={i}
          className="h-3 rounded-[3px] transition-colors duration-500"
          style={{ background: i < highlight ? highlightColor : i < filled ? color : "#edf1f4", boxShadow: i < filled ? "inset 0 -1px 0 rgb(0 0 0 / 0.12)" : "inset 0 0 0 1px #e1e7ed" }}
        />
      ))}
    </div>
  );
}

/** Minimal indeterminate progress bar for "verifying" states. */
export function Indeterminate({ color = "#3f7fd6", className }: { color?: string; className?: string }) {
  return (
    <div className={cn("relative h-1 w-full overflow-hidden rounded-full bg-black/5", className)}>
      <div className="absolute inset-y-0 w-1/3 animate-[slide_1.4s_ease-in-out_infinite] rounded-full" style={{ background: color }} />
    </div>
  );
}
