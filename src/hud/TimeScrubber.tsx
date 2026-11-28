import { AnimatePresence, motion } from "motion/react";
import { CalendarDays, Pause, Play, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { clockNow } from "@/lib/clock";
import { cn } from "@/lib/format";
import { twin, useTwin } from "@/sim/store";
import { STAGES } from "@/sim/types";

/**
 * Time scrubber: drag back through history or forward into the forecast. The
 * crop in 3D re-colours along each truss's measured ripening curve, the
 * selected batch's stage milestones sit on the track, and anything right of
 * "Now" is drawn as a projection.
 */

const DAY = 86_400_000;
const fmtDay = (t: number) => new Date(t).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
const fmtTime = (t: number) => new Date(t).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
const toInput = (t: number) => new Date(t).toISOString().slice(0, 10);

const PRESETS: { label: string; range: [number, number] }[] = [
  { label: "Last 30 days", range: [-30, 0] },
  { label: "Last 14 days", range: [-14, 0] },
  { label: "Two weeks either side", range: [-14, 14] },
  { label: "Next 14 days", range: [0, 14] },
  { label: "Next 30 days", range: [0, 30] },
];

export function TimeScrubber() {
  const viewDays = useTwin((s) => s.viewDays);
  const [from, to] = useTwin((s) => s.viewRange);
  const batch = useTwin((s) => s.sim.batches[s.batchId]);
  const setViewDays = useTwin((s) => s.setViewDays);
  const [playing, setPlaying] = useState(false);
  const [calOpen, setCalOpen] = useState(false);
  const track = useRef<HTMLDivElement>(null);
  const now = clockNow();
  const span = to - from || 1;
  const pct = (d: number) => ((d - from) / span) * 100;

  // Play: sweep forward at half a day per second, looping through the range.
  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    const step = (t: number) => {
      const st = twin();
      const next = st.viewDays + ((t - last) / 1000) * 0.5;
      last = t;
      st.setViewDays(next >= st.viewRange[1] ? st.viewRange[0] : next);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [playing]);

  const dayAt = (clientX: number) => {
    const r = track.current!.getBoundingClientRect();
    const d = from + Math.max(0, Math.min(1, (clientX - r.left) / r.width)) * span;
    // Snap to "Now" so returning to live is easy.
    return Math.abs(d) < span * 0.012 ? 0 : d;
  };
  const onDown = (e: React.PointerEvent) => {
    setPlaying(false);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    setViewDays(dayAt(e.clientX));
  };
  const onMove = (e: React.PointerEvent) => {
    if (e.buttons & 1) setViewDays(dayAt(e.clientX));
  };

  const milestones = useMemo(() => {
    if (!batch) return [];
    return batch.route
      .map((v) => ({ label: STAGES.find((s) => s.key === v.stage)?.label ?? v.stage, d: (Date.parse(v.enteredAt) - now) / DAY, status: v.status }))
      .filter((m) => m.d >= from && m.d <= to)
      .sort((a, b) => a.d - b.d)
      // Keep labels readable: drop a label that would sit on its neighbour or on "Now".
      .map((m, i, all) => ({ ...m, showLabel: Math.abs(m.d) / (to - from) > 0.05 && (i === 0 || (m.d - all[i - 1].d) / (to - from) > 0.07) }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batch?.id, from, to]);

  const ticks = useMemo(() => {
    const out: number[] = [];
    const stepDays = span > 40 ? 7 : span > 16 ? 2 : 1;
    for (let d = Math.ceil(from); d <= to; d += 1) if (d % stepDays === 0) out.push(d);
    return out;
  }, [from, to, span]);

  const at = now + viewDays * DAY;
  const mode = Math.abs(viewDays) < 0.02 ? "live" : viewDays < 0 ? "history" : "forecast";
  const nowIn = from <= 0 && to >= 0;

  return (
    <div data-tour="scrubber" className="pointer-events-auto absolute inset-x-0 bottom-0 z-30 flex h-14 items-center gap-3 border-t border-line bg-white/95 px-4 backdrop-blur">
      <button type="button" onClick={() => setPlaying((p) => !p)} aria-label={playing ? "Pause" : "Play"} className="flex size-9 shrink-0 items-center justify-center rounded-[10px] ring-1 ring-line transition hover:bg-[#f3f6f8]">
        {playing ? <Pause className="size-4 text-ink" /> : <Play className="size-4 text-ink" />}
      </button>

      <div ref={track} onPointerDown={onDown} onPointerMove={onMove} className="relative h-10 min-w-0 flex-1 cursor-pointer touch-none select-none">
        {/* forecast region */}
        {to > 0 ? (
          <div
            className="absolute top-[22px] h-1.5 rounded-full"
            style={{ left: `${pct(Math.max(0, from))}%`, right: `${100 - pct(to)}%`, background: "repeating-linear-gradient(135deg, rgb(37 99 235 / 0.28) 0 4px, rgb(37 99 235 / 0.08) 4px 8px)" }}
          />
        ) : null}
        {from < 0 ? <div className="absolute top-[22px] h-1.5 rounded-full bg-[#d5dce3]" style={{ left: 0, right: `${100 - pct(Math.min(0, to))}%` }} /> : null}
        {/* day ticks */}
        {ticks.map((d) => (
          <div key={d} className="absolute top-[30px] -translate-x-1/2 font-mono text-[9px] text-faint" style={{ left: `${pct(d)}%` }}>
            {d === 0 ? "" : new Date(now + d * DAY).toLocaleDateString("en-US", { month: "numeric", day: "numeric" })}
          </div>
        ))}
        {/* batch milestones */}
        {milestones.map((m) => (
          <div key={m.label} className="absolute top-0 -translate-x-1/2 text-center" style={{ left: `${pct(m.d)}%` }}>
            <div className={cn("text-[10px] font-medium whitespace-nowrap", !m.showLabel && "invisible", m.status === "PLANNED" ? "text-[#2563eb]" : "text-muted")}>{m.label}</div>
            <div className={cn("mx-auto mt-[7px] size-2 rounded-full ring-2 ring-white", m.status === "PLANNED" ? "bg-[#93b4f5]" : "bg-[#8796a6]")} />
          </div>
        ))}
        {/* now marker */}
        {nowIn ? (
          <div className="absolute top-[14px] h-[22px] w-px bg-ink/40" style={{ left: `${pct(0)}%` }}>
            <span className="absolute -top-[13px] -translate-x-1/2 font-mono text-[9px] font-semibold text-ink">NOW</span>
          </div>
        ) : null}
        {/* playhead */}
        <div className="absolute top-[12px] -translate-x-1/2" style={{ left: `${pct(viewDays)}%` }}>
          <div className={cn("h-[26px] w-[3px] rounded-full", mode === "forecast" ? "bg-[#2563eb]" : mode === "history" ? "bg-[#e0662c]" : "bg-ok")} />
        </div>
      </div>

      <div className={cn("flex h-9 shrink-0 items-center gap-2 rounded-[10px] px-2.5 ring-1", mode === "forecast" ? "bg-[#eff4ff] ring-[#bcd0fb]" : mode === "history" ? "bg-[#fff4ee] ring-[#f6cdb6]" : "bg-[#f3f6f8] ring-line")}>
        <span className={cn("rounded-full px-1.5 py-[1px] font-mono text-[9.5px] font-semibold tracking-[0.06em] uppercase", mode === "forecast" ? "bg-[#2563eb] text-white" : mode === "history" ? "bg-[#e0662c] text-white" : "bg-ok text-white")}>
          {mode === "forecast" ? "Forecast" : mode === "history" ? "History" : "Live"}
        </span>
        <div className="flex flex-col leading-none">
          <span className="text-[12px] font-medium whitespace-nowrap text-ink">{fmtDay(at)}</span>
          <span className="mt-0.5 font-mono text-[10px] text-muted">{mode === "live" ? fmtTime(at) : `${viewDays > 0 ? "+" : ""}${viewDays.toFixed(1)} d`}</span>
        </div>
        {mode !== "live" ? (
          <button type="button" onClick={() => (setPlaying(false), setViewDays(0))} title="Back to live" className="ml-1 flex size-6 items-center justify-center rounded-[7px] text-muted hover:bg-white hover:text-ink">
            <RotateCcw className="size-3.5" />
          </button>
        ) : null}
      </div>

      <div className="relative shrink-0">
        <button type="button" onClick={() => setCalOpen((v) => !v)} aria-label="Date range" className={cn("flex size-9 items-center justify-center rounded-[10px] ring-1 ring-line transition hover:bg-[#f3f6f8]", calOpen && "bg-[#f3f6f8]")}>
          <CalendarDays className="size-4 text-ink" />
        </button>
        <AnimatePresence>{calOpen ? <RangePicker onClose={() => setCalOpen(false)} /> : null}</AnimatePresence>
      </div>
    </div>
  );
}

function RangePicker({ onClose }: { onClose: () => void }) {
  const [from, to] = useTwin((s) => s.viewRange);
  const setViewRange = useTwin((s) => s.setViewRange);
  const now = clockNow();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.parentElement!.contains(e.target as Node)) onClose();
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [onClose]);
  const fromInput = (v: string) => Math.round((Date.parse(v) - now) / DAY);
  return (
    <motion.div ref={ref} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 6 }} transition={{ duration: 0.14 }} className="absolute right-0 bottom-12 w-[280px] p-3 panel">
      <div className="text-[12px] font-semibold text-ink">Date range</div>
      <div className="mt-0.5 text-[11px] text-muted">Past dates replay recorded scans; future dates show the forecast.</div>
      <div className="mt-2.5 flex flex-col gap-0.5">
        {PRESETS.map((p) => {
          const active = p.range[0] === from && p.range[1] === to;
          return (
            <button key={p.label} type="button" onClick={() => (setViewRange(p.range), onClose())} className={cn("rounded-[8px] px-2 py-1.5 text-left text-[12px] text-ink-2 hover:bg-[#f3f6f8]", active && "bg-[#eff4ff] text-[#1d4ed8]")}>
              {p.label}
            </button>
          );
        })}
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2 border-t border-line pt-2.5">
        <label className="flex flex-col gap-1 text-[10.5px] text-muted">
          From
          <input type="date" value={toInput(now + from * DAY)} max={toInput(now + to * DAY)} onChange={(e) => e.target.value && setViewRange([Math.min(fromInput(e.target.value), to - 1), to])} className="h-8 rounded-[8px] bg-[#f3f6f8] px-2 text-[12px] text-ink" />
        </label>
        <label className="flex flex-col gap-1 text-[10.5px] text-muted">
          To
          <input type="date" value={toInput(now + to * DAY)} min={toInput(now + from * DAY)} onChange={(e) => e.target.value && setViewRange([from, Math.max(fromInput(e.target.value), from + 1)])} className="h-8 rounded-[8px] bg-[#f3f6f8] px-2 text-[12px] text-ink" />
        </label>
      </div>
    </motion.div>
  );
}
