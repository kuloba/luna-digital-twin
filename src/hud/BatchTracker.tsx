import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, Route } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn, formatDayTime, formatEta, formatKg, formatNumber } from "@/lib/format";
import { summarise } from "@/sim/cv";
import { cropColor, healthColor, healthLabel } from "@/lib/theme";
import { twin, useTwin } from "@/sim/store";
import { STAGES, type Batch, type StageVisit } from "@/sim/types";
import { Ring } from "./gauges";
import { EntityChip } from "./RichText";
import { Pill } from "./ui";

/**
 * Bottom-left batch tracker: where one batch is in the five-stage flow,
 * when it moves next and which order it is promised to. "Trace" draws the
 * batch's whole route through the facility in 3D.
 */
export function BatchTracker() {
  const batchId = useTwin((s) => s.batchId);
  const b = useTwin((s) => s.sim.batches[s.batchId]);
  const trace = useTwin((s) => s.layers.trace);
  const setLayer = useTwin((s) => s.setLayer);
  if (!b) return null;
  const active = b.route.find((v) => v.status === "ACTIVE");
  const next = b.route.find((v) => v.status === "PLANNED");
  const color = cropColor[b.cropType];
  return (
    <div data-tour="batch" className="pointer-events-auto absolute bottom-4 left-4 z-20 flex h-[196px] w-[420px] flex-col 2xl:w-[468px] px-4 pt-3 pb-3 panel">
      <div className="flex items-center gap-2.5">
        <BatchPicker current={batchId} />
        <div className="min-w-0 flex-1 leading-tight">
          <div className="truncate text-[12.5px] font-semibold text-ink">
            {b.cropName} <span className="font-normal text-muted">· {b.variety}</span>
          </div>
          <div className="truncate text-[11px] text-muted">
            {formatNumber(b.cropType === "TOMATO" || b.cropType === "CUCUMBER" ? b.plants : b.trays)} {b.cropType === "TOMATO" || b.cropType === "CUCUMBER" ? "plants" : "trays"} · forecast {formatKg(b.forecastKg)} · Grade A {formatNumber(b.gradeA * 100, 1)}%
          </div>
        </div>
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-medium" style={{ color: healthColor[b.health] }}>
          <span className="size-1.5 rounded-full" style={{ background: healthColor[b.health] }} />
          {healthLabel[b.health]}
        </span>
        <button
          type="button"
          onClick={() => setLayer("trace", !trace)}
          title="Draw this batch's route through the facility"
          className={cn("flex h-7 shrink-0 items-center gap-1.5 rounded-[9px] px-2.5 text-[11.5px] font-medium ring-1 transition ring-inset", trace ? "bg-luna-soft text-luna-ink ring-[#f8dcb0]" : "text-ink-2 ring-line-2 hover:bg-[#f6f8fa]")}
        >
          <Route className="size-3.5" /> Trace
        </button>
      </div>

      <Stepper b={b} accent={color.accent ?? color.leaf} />

      <div className="mt-auto flex items-center gap-2 border-t border-line pt-2.5 text-[11px] text-muted">
        <span className="shrink-0">Now at</span>
        <span className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden">
          {active?.assetIds.slice(0, 3).map((id) => (
            <EntityChip key={id} id={id} size="sm" />
          ))}
          {active && active.assetIds.length > 3 ? <span className="text-faint">+{active.assetIds.length - 3}</span> : null}
        </span>
        {continuous(b) ? (
          <PickingNote b={b} />
        ) : b.order ? (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-panel-2 py-0.5 pr-1 pl-2 ring-1 ring-line ring-inset">
            <span className="max-w-[140px] truncate text-ink-2">{b.order.customer.split(" · ")[0]}</span>
            <EntityChip id={b.order.truckId} size="sm" />
          </span>
        ) : next ? (
          <span className="shrink-0">
            {STAGES.find((s) => s.key === next.stage)!.short} {formatEta(next.enteredAt)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Time left in a stage, from its planned length and live progress. */
function left(v: StageVisit, progress: number) {
  const ms = Math.max(0, (1 - progress) * (new Date(v.exitedAt).getTime() - new Date(v.enteredAt).getTime()));
  const mins = Math.round(ms / 60_000);
  return mins < 60 ? `${Math.max(1, mins)}m` : `${Math.round(mins / 60)}h`;
}

const continuous = (b: Batch) => (b.cropType === "TOMATO" || b.cropType === "CUCUMBER") && b.stage === "CULTIVATION";

/** High-wire crops are picked continuously — show what the cameras say is coming. */
function PickingNote({ b }: { b: Batch }) {
  const compId = b.route.find((v) => v.stage === "CULTIVATION")?.assetIds[0] ?? "";
  const comp = useTwin((s) => s.sim.cv[compId]);
  if (!comp) return null;
  const sum = summarise(Object.values(comp.plants), comp.crop);
  return (
    <span className="shrink-0 text-ink-2">
      Picking 3×/week · <span className="font-mono font-medium">{formatKg(sum.readyKg7d)}</span> ready in 7 d
    </span>
  );
}

function Stepper({ b, accent }: { b: Batch; accent: string }) {
  return (
    <div className="relative mt-3.5 grid grid-cols-5">
      {b.route.map((v, i) => (
        <Step key={v.stage} v={v} i={i} last={i === b.route.length - 1} progress={b.stageProgress} accent={accent} label={continuous(b) && v.status === "ACTIVE" ? `picking · wk ${Math.ceil(b.cycleDay / 7)}` : undefined} />
      ))}
    </div>
  );
}

function Step({ v, i, last, progress, accent, label }: { v: StageVisit; i: number; last: boolean; progress: number; accent: string; label?: string }) {
  const st = STAGES.find((s) => s.key === v.stage)!;
  const done = v.status === "DONE";
  const active = v.status === "ACTIVE";
  const onClick = () => {
    const id = v.assetIds.find((a) => twin().sim.assets[a]);
    if (id) twin().select(id, { fly: true });
  };
  return (
    <button type="button" onClick={onClick} className="group relative flex flex-col items-center text-center">
      {!last ? (
        <div className="absolute top-[13px] left-1/2 h-[2px] w-full overflow-hidden rounded-full bg-[#e3e8ee]">
          <div className="h-full rounded-full bg-ok transition-[width] duration-700" style={{ width: done ? "100%" : active ? `${progress * 100}%` : "0%" }} />
        </div>
      ) : null}
      <div className="relative z-10">
        {done ? (
          <span className="flex size-7 items-center justify-center rounded-full bg-ok text-white ring-4 ring-white">
            <Check className="size-3.5" strokeWidth={2.6} />
          </span>
        ) : active ? (
          <span className="relative flex size-7 items-center justify-center rounded-full bg-white ring-4 ring-white">
            <span className="absolute inset-0 animate-ping rounded-full opacity-25" style={{ background: accent }} />
            <Ring value={progress} size={28} stroke={3} color="#f0a43a" track="#f6e7cf">
              <span className="size-2 rounded-full bg-luna" />
            </Ring>
          </span>
        ) : (
          <span className="flex size-7 items-center justify-center rounded-full border border-[#d5dde5] bg-white font-mono text-[10.5px] text-faint ring-4 ring-white">{i + 1}</span>
        )}
      </div>
      <span className={cn("mt-1.5 text-[11.5px] font-medium transition-colors group-hover:text-luna-ink", done || active ? "text-ink" : "text-faint")}>{st.short}</span>
      <span className={cn("font-mono text-[9.5px] whitespace-nowrap tabular", active ? "text-luna-ink" : "text-faint")}>{label ?? (active ? `${formatNumber(progress * 100)}% · ${left(v, progress)} left` : done ? formatDayTime(v.exitedAt) : formatDayTime(v.enteredAt))}</span>
    </button>
  );
}

function BatchPicker({ current }: { current: string }) {
  const batches = useTwin((s) => s.sim.batches);
  const selectBatch = useTwin((s) => s.selectBatch);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const b = batches[current];
  const list = Object.values(batches).sort((x, y) => STAGES.findIndex((s) => s.key === y.stage) - STAGES.findIndex((s) => s.key === x.stage));
  return (
    <div ref={ref} className="relative shrink-0">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex h-8 items-center gap-2 rounded-[9px] bg-panel-2 pr-1.5 pl-2.5 ring-1 ring-line transition ring-inset hover:ring-line-2">
        <span className="size-2 rounded-full" style={{ background: cropColor[b.cropType].accent ?? cropColor[b.cropType].leaf }} />
        <span className="font-mono text-[12px] font-medium text-ink">{b.id}</span>
        <ChevronDown className={cn("size-3.5 text-muted transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className="scroll-thin absolute bottom-10 left-0 z-40 max-h-[380px] w-[340px] origin-bottom-left overflow-y-auto p-1.5 panel"
          >
            {list.map((x) => {
              const st = STAGES.find((s) => s.key === x.stage)!;
              return (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => {
                    selectBatch(x.id, { fly: true });
                    setOpen(false);
                  }}
                  className={cn("flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left hover:bg-[#f3f6f8]", x.id === current && "bg-[#f3f6f8]")}
                >
                  <span className="size-2 shrink-0 rounded-full" style={{ background: cropColor[x.cropType].accent ?? cropColor[x.cropType].leaf }} />
                  <span className="w-[68px] shrink-0 font-mono text-[11.5px] font-medium text-ink">{x.id}</span>
                  <span className="min-w-0 flex-1 truncate text-[11.5px] text-muted">
                    {x.cropName} · {x.variety}
                  </span>
                  <Pill tone={x.health === "HEALTHY" ? "neutral" : x.health === "WATCH" ? "warn" : "crit"}>{st.short}</Pill>
                </button>
              );
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
