import { ArrowRight, Camera, Cpu, Radio, Wifi } from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { cn, formatAgo, formatKg, formatNumber } from "@/lib/format";
import { CUCUMBER_STAGES, PLANTS_PER_ROW, RIPENESS_STAGES, rowYield, stageIndex, summarise, type CvSummary } from "@/sim/cv";
import { COMPARTMENTS } from "@/sim/layout";
import { twin, useTwin } from "@/sim/store";
import type { CompartmentCv, Plant, SimState } from "@/sim/types";
import { EntityChip } from "./RichText";
import { Num, Section } from "./ui";

/**
 * Inspector bodies built from computer-vision plant state. Nothing here is a
 * photograph: every mark is drawn from the few hundred bytes per plant that
 * the edge node syncs after inference.
 */

const SCAN_SPEED = 0.0065;
const stagesFor = (crop: CompartmentCv["crop"]) => (crop === "TOMATO" ? RIPENESS_STAGES : CUCUMBER_STAGES);

/* ------------------------------------------------------------------ */
/* Ripeness / size distribution                                       */
/* ------------------------------------------------------------------ */

export function StageBar({ sum, crop, legend = true }: { sum: CvSummary; crop: CompartmentCv["crop"]; legend?: boolean }) {
  const stages = stagesFor(crop);
  const total = sum.stages.reduce((a, b) => a + b, 0) || 1;
  return (
    <div>
      <div className="flex h-2.5 w-full overflow-hidden rounded-full ring-1 ring-black/5">
        {sum.stages.map((v, i) => (
          <div key={i} className="h-full transition-[width] duration-700" style={{ width: `${(v / total) * 100}%`, background: stages[i].color }} />
        ))}
      </div>
      {legend ? (
        <div className="mt-2 grid grid-cols-3 gap-x-3 gap-y-1">
          {stages.map((st, i) => (
            <div key={st.label} className="flex items-center gap-1.5 text-[10.5px] text-muted">
              <span className="size-2 shrink-0 rounded-[3px]" style={{ background: st.color }} />
              <span className="truncate">{st.label}</span>
              <span className="ml-auto font-mono text-faint tabular">{formatNumber((sum.stages[i] / total) * 100)}%</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Stat({ label, value, unit, sub }: { label: string; value: string; unit?: string; sub?: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-[10px] bg-panel-2 px-2.5 py-2">
      <span className="text-[10.5px] text-muted">{label}</span>
      <span className="flex items-baseline gap-1">
        <span className="font-mono text-[15px] font-medium tracking-[-0.02em] text-ink tabular">{value}</span>
        {unit ? <span className="text-[10px] text-muted">{unit}</span> : null}
      </span>
      {sub ? <span className="text-[10px] text-faint">{sub}</span> : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Compartment                                                        */
/* ------------------------------------------------------------------ */

export function CompartmentVision({ compId }: { compId: string }) {
  const comp = useTwin((s) => s.sim.cv[compId]);
  const lens = useTwin((s) => s.cvLens);
  const setLens = useTwin((s) => s.setCvLens);
  const sum = useMemo(() => summarise(Object.values(comp.plants), comp.crop, comp.imagesToday), [comp]);
  const rows = useMemo(() => comp.rows.map((r) => ({ row: r, y: rowYield(comp, r), pests: r.plantIds.filter((id) => (comp.plants[id].seen.pestLevel ?? 0) > 0.08).length })), [comp]);
  const maxY = Math.max(...rows.map((r) => r.y), 0.01);
  const minY = Math.min(...rows.map((r) => r.y));
  const tomato = comp.crop === "TOMATO";
  return (
    <>
      <Section
        title={
          <span className="flex items-center gap-1.5">
            <Camera className="size-3.5 text-luna-ink" /> Crop vision · {tomato ? "tomatoes" : "cucumbers"}
          </span>
        }
        action={<span className="text-[10.5px] text-faint">last pass {formatAgo(sum.lastScan)}</span>}
      >
        <div className="rounded-[12px] bg-panel-2 p-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <div className="text-[10.5px] text-muted">Ready to pick · next 7 days</div>
              <div className="flex items-baseline gap-1">
                <Num value={sum.readyKg7d / 1000} digits={2} className="font-mono text-[26px] leading-none font-medium tracking-[-0.03em] text-ink" />
                <span className="text-[11px] text-muted">t</span>
              </div>
            </div>
            <div className="text-right text-[10.5px] leading-[1.45] text-muted">
              <div>
                <span className="font-mono text-ink-2">{formatNumber(sum.fruits)}</span> fruit counted
              </div>
              <div>
                <span className="font-mono text-ink-2">{formatNumber(sum.plants)}</span> plants imaged
              </div>
            </div>
          </div>
          <div className="mt-3">
            <StageBar sum={sum} crop={comp.crop} />
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          <Stat label={tomato ? "Trusses / plant" : "Fruit / plant"} value={formatNumber(tomato ? sum.trusses / Math.max(1, sum.plants) : sum.fruits / Math.max(1, sum.plants), 1)} />
          <Stat label="Head height" value={formatNumber(sum.avgHeight, 2)} unit="m" />
          <Stat label="Stem Ø" value={formatNumber(sum.avgStem, 1)} unit="mm" />
        </div>
        {sum.pests.length ? (
          <button type="button" onClick={() => setLens("pests")} className="flex items-center gap-2 rounded-[10px] bg-warn-soft px-3 py-2 text-left text-[11.5px] text-[#9a5b05] ring-1 ring-[#f3d9a8] ring-inset">
            <span className="size-1.5 rounded-full bg-warn" />
            <span className="flex-1">
              {sum.pests.map((p) => `${p.kind} · ${formatNumber(p.plants)} plants`).join("  ·  ")}
            </span>
            <span className="font-medium">{lens === "pests" ? "Showing" : "Show"} →</span>
          </button>
        ) : null}
      </Section>

      <Section title="Rows · ready kg/m² next 7 d" action={<span className="text-[10.5px] text-faint">click a row</span>}>
        <div className="flex h-[92px] items-end gap-1.5 rounded-[12px] bg-panel-2 px-2.5 pt-3 pb-2">
          {rows.map(({ row, y, pests }) => (
            <button
              key={row.id}
              type="button"
              title={`${row.id} · ${formatNumber(y, 2)} kg/m²`}
              onClick={() => twin().select(row.id, { fly: true })}
              onMouseEnter={() => twin().hover(row.id)}
              onMouseLeave={() => twin().hover(undefined)}
              className="group flex h-full flex-1 flex-col items-center justify-end gap-1"
            >
              {pests ? <span className="size-1.5 rounded-full bg-warn" /> : null}
              <span className="w-full rounded-t-[4px] bg-[#7fb48c] transition-all group-hover:bg-[#2f9e5b]" style={{ height: `${24 + ((y - minY) / Math.max(0.001, maxY - minY)) * 76}%` }} />
              <span className="font-mono text-[9px] text-faint">{row.index + 1}</span>
            </button>
          ))}
        </div>
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Row                                                                */
/* ------------------------------------------------------------------ */

export function RowVision({ rowId, compId }: { rowId: string; compId: string }) {
  const comp = useTwin((s) => s.sim.cv[compId]);
  const plantId = useTwin((s) => s.plantId);
  const row = comp.rows.find((r) => r.id === rowId)!;
  const plants = row.plantIds.map((id) => comp.plants[id]);
  const sum = useMemo(() => summarise(plants, comp.crop), [comp]); // eslint-disable-line react-hooks/exhaustive-deps
  const selected = plantId && comp.plants[plantId]?.row === rowId ? comp.plants[plantId] : undefined;
  const c = COMPARTMENTS.find((cc) => cc.id === compId)!;
  const f = (row.x - c.bounds[0]) / (c.bounds[2] - c.bounds[0]);
  const dist = comp.scanDir === 1 ? (f >= comp.scan ? f - comp.scan : 1 - comp.scan + (1 - f)) : f <= comp.scan ? comp.scan - f : comp.scan + f;
  const nextPass = Math.round(dist / SCAN_SPEED);
  const tomato = comp.crop === "TOMATO";
  return (
    <>
      <Section
        title={
          <span className="flex items-center gap-1.5">
            <Camera className="size-3.5 text-luna-ink" /> What the camera sees
          </span>
        }
        action={<span className="text-[10.5px] text-faint">next pass in {nextPass < 60 ? `${nextPass} s` : `${Math.round(nextPass / 60)} min`}</span>}
      >
        <RowStrip plants={plants} crop={comp.crop} selectedId={selected?.id} rowId={rowId} />
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Ready · 7 d" value={formatKg(sum.readyKg7d)} />
          <Stat label={tomato ? "Fruit on row" : "Fruit on row"} value={formatNumber(sum.fruits)} />
          <Stat label="Head height" value={formatNumber(sum.avgHeight, 2)} unit="m" sub={sum.avgHeight < 3.07 ? "behind 3.15 m" : "on target"} />
        </div>
      </Section>
      {selected ? <PlantCard plant={selected} crop={comp.crop} /> : <div className="rounded-[12px] border border-dashed border-line-2 px-3 py-2.5 text-[11.5px] text-muted">Click a plant in the strip (or in the 3D crop) to see exactly what the camera measured.</div>}
      <div className="flex items-start gap-2 rounded-[12px] bg-luna-soft/60 px-3 py-2.5 text-[11.5px] leading-[1.5] text-ink-2 ring-1 ring-[#f8dcb0] ring-inset">
        <Cpu className="mt-0.5 size-3.5 shrink-0 text-luna-ink" />
        <span>
          This row is drawn from <span className="font-mono font-medium text-ink">{formatNumber(plants.length * 9.2 * 1.15, 0)} KB</span> of plant state. The {formatNumber(plants.length * 9.2 * 6)} photos behind it never left <EntityChip id="EDGE-01" size="sm" />.
        </span>
      </div>
    </>
  );
}

function RowStrip({ plants, crop, selectedId, rowId }: { plants: Plant[]; crop: CompartmentCv["crop"]; selectedId?: string; rowId: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const stages = stagesFor(crop);
  const W = 352;
  const H = 150;
  const base = H - 16;
  const top = 10;
  const step = W / PLANTS_PER_ROW;
  return (
    <div className="relative rounded-[12px] bg-[linear-gradient(180deg,#f7faf8,#eef3ef)] ring-1 ring-line ring-inset">
      <svg width="100%" viewBox={`0 0 ${W} ${H}`} className="block">
        {/* gutter + canopy guides */}
        <line x1={0} x2={W} y1={base} y2={base} stroke="#cbd5cf" strokeWidth={1} />
        <line x1={0} x2={W} y1={base - (3.15 / 3.4) * (base - top)} y2={base - (3.15 / 3.4) * (base - top)} stroke="#9fb7a6" strokeDasharray="3 3" strokeWidth={0.75} />
        <text x={W - 4} y={base - (3.15 / 3.4) * (base - top) - 3} textAnchor="end" fontSize={8} fill="#7d9585" fontFamily="Geist Mono">
          3.15 m head target
        </text>
        {plants.map((p, i) => {
          const cx = step * i + step / 2;
          const head = base - (p.seen.height / 3.4) * (base - top);
          const sel = p.id === selectedId;
          const hov = hover === i;
          return (
            <g key={p.id} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onClick={() => twin().selectPlant(p.id, rowId)} style={{ cursor: "pointer" }}>
              <rect x={cx - step / 2 + 0.5} y={top - 6} width={step - 1} height={base - top + 14} rx={4} fill={sel ? "rgb(252 184 88 / 0.18)" : hov ? "rgb(15 27 42 / 0.04)" : "transparent"} stroke={sel ? "#f0a43a" : "none"} strokeWidth={1} />
              {p.seen.pest && p.seen.pestLevel > 0.08 ? <circle cx={cx} cy={(head + base) / 2} r={4 + p.seen.pestLevel * 10} fill={p.seen.pest === "Botrytis" ? "#dc4a3d" : "#e59b1a"} opacity={0.14 + p.seen.pestLevel * 0.2} /> : null}
              <line x1={cx} x2={cx} y1={base} y2={head} stroke="#5b8a52" strokeWidth={1.3} strokeLinecap="round" />
              {/* leaves */}
              {[0.35, 0.6, 0.85].map((h) => (
                <path key={h} d={`M${cx},${base - h * (base - head)} q ${i % 2 ? 6 : -6},-3 ${i % 2 ? 7 : -7},-8`} stroke="#79a86c" strokeWidth={1.1} fill="none" opacity={0.7} />
              ))}
              {p.seen.trusses.map((t, k) => {
                const y = base - t.h * (base - head) * 0.92;
                const r = 1.5 + t.fruits * 0.32;
                return <circle key={k} cx={cx + (k % 2 ? 2.6 : -2.6)} cy={y} r={r} fill={stages[stageIndex(t.ripeness)].color} stroke="white" strokeWidth={0.5} />;
              })}
              {Array.from({ length: Math.min(4, p.seen.flowers) }, (_, k) => (
                <circle key={k} cx={cx - 3 + k * 2} cy={head - 2.5} r={1.1} fill="#f2d14a" />
              ))}
              {i % 5 === 0 || sel ? (
                <text x={cx} y={H - 4} textAnchor="middle" fontSize={7.5} fill={sel ? "#9a5b05" : "#94a3b8"} fontFamily="Geist Mono">
                  P{String(i + 1).padStart(2, "0")}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {hover !== null ? (
        <div className="pointer-events-none absolute top-1.5 left-2 rounded-[6px] bg-white/95 px-1.5 py-0.5 font-mono text-[10px] text-ink-2 shadow-[0_0_0_1px_rgb(15_27_42/0.08)]">
          {plants[hover].id} · {formatNumber(plants[hover].seen.height, 2)} m · {plants[hover].seen.trusses.length} {crop === "TOMATO" ? "trusses" : "nodes"}
        </div>
      ) : null}
    </div>
  );
}

function PlantCard({ plant, crop }: { plant: Plant; crop: CompartmentCv["crop"] }) {
  const stages = stagesFor(crop);
  const cv = plant.seen;
  const trusses = [...cv.trusses].sort((a, b) => b.h - a.h);
  const fresh = Date.now() - plant.scannedAt < 180_000;
  return (
    <div className="animate-rise rounded-[12px] bg-white p-3 ring-1 ring-[#f3cf95] ring-inset">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[12px] font-medium text-ink">{plant.id}</span>
        <span className="text-[10.5px] text-faint">scanned {formatAgo(plant.scannedAt)}</span>
        <span className={cn("ml-auto rounded-full px-1.5 py-px font-mono text-[9.5px]", fresh ? "bg-ok-soft text-[#1f7a43]" : "bg-panel-2 text-muted")}>{fresh ? "fresh scan" : "from last pass"}</span>
      </div>
      <div className="mt-2.5 grid grid-cols-4 gap-1.5">
        <Mini label="Head" value={`${formatNumber(cv.height, 2)} m`} />
        <Mini label="Stem Ø" value={`${formatNumber(cv.stem, 1)} mm`} />
        <Mini label="Flowers" value={formatNumber(cv.flowers)} />
        <Mini label={crop === "TOMATO" ? "Trusses" : "Nodes"} value={formatNumber(cv.trusses.length)} />
      </div>
      <div className="mt-3 flex flex-col gap-1">
        {trusses.map((t, i) => {
          const si = stageIndex(t.ripeness);
          return (
            <div key={i} className="grid grid-cols-[26px_1fr_62px_26px] items-center gap-2">
              <span className="font-mono text-[9.5px] text-faint">{crop === "TOMATO" ? "T" : "N"}{cv.trusses.length - i}</span>
              <span className="flex h-1.5 gap-px overflow-hidden rounded-full">
                {stages.map((st, k) => (
                  <span key={k} className="flex-1" style={{ background: k <= si ? st.color : "#edf1f4" }} />
                ))}
              </span>
              <span className="truncate text-[10.5px] text-muted">{stages[si].label}</span>
              <span className="text-right font-mono text-[10px] text-ink-2">×{t.fruits}</span>
            </div>
          );
        })}
      </div>
      {cv.pest && cv.pestLevel > 0.08 ? (
        <div className="mt-2.5 flex items-center gap-2 rounded-[8px] bg-warn-soft px-2 py-1.5 text-[11px] text-[#9a5b05]">
          <span className="size-1.5 rounded-full bg-warn" />
          {cv.pest} · pressure {formatNumber(cv.pestLevel * 100)}% · scout to confirm
        </div>
      ) : null}
      <SyncedRecord plant={plant} />
    </div>
  );
}

/** The payload the edge node syncs for one plant: this is all the twin needs. */
function plantRecord(plant: Plant) {
  const cv = plant.seen;
  const r2 = (v: number) => Math.round(v * 100) / 100;
  return {
    schema: "plant-state/1",
    plant: plant.id,
    scanned_at: new Date(plant.scannedAt).toISOString().slice(0, 19) + "Z",
    source: `CAM-${plant.row.slice(0, 2)}`,
    head_m: r2(cv.height),
    stem_mm: r2(cv.stem),
    flowers: cv.flowers,
    trusses: cv.trusses.map((t) => [r2(t.h), r2(t.ripeness), t.fruits]),
    ...(cv.pest && cv.pestLevel > 0.08 ? { pest: { kind: cv.pest, level: r2(cv.pestLevel) } } : {}),
  };
}

function SyncedRecord({ plant }: { plant: Plant }) {
  const [open, setOpen] = useState(false);
  const record = plantRecord(plant);
  const bytes = new TextEncoder().encode(JSON.stringify(record)).length;
  // Keep each truss triple on one line so the record reads like a table.
  const pretty = JSON.stringify(record, null, 2).replace(/\[\s+([^[\]{}]+?)\s+\]/g, (_, inner: string) => `[${inner.replace(/\s+/g, " ")}]`);
  return (
    <div className="mt-2.5 rounded-[8px] bg-panel-2 px-2.5 py-2">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 text-left">
        <span className="text-[11px] font-medium text-ink-2">Synced record</span>
        <span className="font-mono text-[10.5px] font-medium text-ink">{formatNumber(bytes)} B</span>
        <span className="truncate text-[10.5px] text-faint">vs ~4.2 MB per photo</span>
        <span className="ml-auto shrink-0 text-[10.5px] font-medium text-luna-ink">{open ? "Hide" : "View"}</span>
      </button>
      {open ? <pre className="scroll-thin mt-2 max-h-[200px] overflow-auto rounded-[6px] bg-[#0f1b2a] px-2.5 py-2 font-mono text-[10px] leading-[1.5] text-[#d7e3f0]">{pretty}</pre> : null}
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] bg-panel-2 px-2 py-1.5">
      <div className="text-[9.5px] text-muted">{label}</div>
      <div className="font-mono text-[11.5px] font-medium text-ink">{value}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Camera rail                                                        */
/* ------------------------------------------------------------------ */

export function CameraRail({ compId }: { compId: string }) {
  const comp = useTwin((s) => s.sim.cv[compId]);
  const sum = useMemo(() => summarise(Object.values(comp.plants), comp.crop, comp.imagesToday), [comp]);
  return (
    <Section title="Rail position" action={<span className="text-[10.5px] text-faint">pass {comp.passes} today</span>}>
      <div className="rounded-[12px] bg-panel-2 px-3 pt-3 pb-2.5">
        <div className="relative h-8">
          <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 rounded-full bg-[#d6dee6]" />
          {comp.rows.map((r, i) => (
            <div key={r.id} className="absolute top-1/2 h-3 w-px -translate-y-1/2 bg-[#b5c1cc]" style={{ left: `${((i + 0.5) / comp.rows.length) * 100}%` }} />
          ))}
          <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 transition-[left] duration-1000 ease-linear" style={{ left: `${comp.scan * 100}%` }}>
            <div className="flex h-6 w-9 items-center justify-center rounded-[6px] bg-ink text-white shadow-md">
              <Camera className="size-3.5" />
            </div>
            <div className="absolute -bottom-2 left-1/2 h-0 w-0 -translate-x-1/2 border-x-[5px] border-t-[6px] border-x-transparent border-t-luna" />
          </div>
        </div>
        <div className="mt-2 flex justify-between font-mono text-[9.5px] text-faint">
          <span>row 1</span>
          <span>{comp.scanDir === 1 ? "sweeping east →" : "← sweeping west"}</span>
          <span>row {comp.rows.length}</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Stat label="Images today" value={formatNumber(comp.imagesToday)} />
        <Stat label="Raw size" value={formatNumber(sum.rawGb, 1)} unit="GB" sub="stays on-site" />
        <Stat label="Synced" value={formatNumber(sum.syncedMb, 2)} unit="MB" sub="plant state" />
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Edge node: the bandwidth story                                     */
/* ------------------------------------------------------------------ */

export function EdgeStory() {
  const cv = useTwin((s) => s.sim.cv);
  const { images, rawGb, syncedMb } = useMemo(() => edgeTotals(cv), [cv]);
  const start = new Date();
  start.setHours(5, 0, 0, 0);
  const elapsed = Math.max(3600, (Date.now() - start.getTime()) / 1000);
  const rawMbps = (rawGb * 8 * 1024) / elapsed;
  const syncKbps = (syncedMb * 8 * 1024) / elapsed;
  const ratio = (rawGb * 1024) / Math.max(0.001, syncedMb);
  return (
    <>
      <Section title="What left the site today">
        <div className="rounded-[12px] bg-panel-2 p-3">
          <BarRow label="Photos captured" value={`${formatNumber(rawGb, 1)} GB`} sub={`${formatNumber(images)} images · kept on-site`} pct={100} color="#c7d2dc" />
          <BarRow label="Plant state synced" value={`${formatNumber(syncedMb, 1)} MB`} sub="trusses, ripeness, size, pests" pct={Math.max(0.6, (syncedMb / (rawGb * 1024)) * 100)} color="#f0a43a" />
          <div className="mt-3 flex items-baseline gap-1.5 border-t border-line pt-2.5">
            <span className="font-mono text-[22px] leading-none font-medium tracking-[-0.03em] text-ink">{formatNumber(ratio)}×</span>
            <span className="text-[11.5px] text-muted">less data than shipping photos</span>
          </div>
        </div>
      </Section>
      <Section title="Pipeline">
        <div className="flex items-stretch gap-1 rounded-[12px] bg-panel-2 p-2">
          <Hop icon={<Camera className="size-3.5" />} title="3 rails" sub="6 img / plant" />
          <ArrowRight className="mt-4 size-3 shrink-0 text-faint" />
          <Hop icon={<Cpu className="size-3.5" />} title="Edge" sub="2 × L4 · 38 img/s" accent />
          <ArrowRight className="mt-4 size-3 shrink-0 text-faint" />
          <Hop icon={<Radio className="size-3.5" />} title="State" sub="1.15 KB / plant" />
          <ArrowRight className="mt-4 size-3 shrink-0 text-faint" />
          <Hop icon={<Wifi className="size-3.5" />} title="Twin" sub="~140 ms" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Uplink if photos" value={formatNumber(rawMbps, 0)} unit="Mbps" sub="sustained, all day" />
          <Stat label="Uplink used" value={formatNumber(syncKbps, 1)} unit="kbps" sub="of 12 Mbps LTE" />
        </div>
      </Section>
    </>
  );
}

export function edgeTotals(cv: SimState["cv"]) {
  let images = 0;
  let syncedMb = 0;
  for (const c of Object.values(cv)) {
    images += c.imagesToday;
    syncedMb += (Object.keys(c.plants).length * 9.2 * 1.15) / 1024 + c.imagesToday * 0.00009;
  }
  return { images, rawGb: (images * 4.2) / 1024, syncedMb };
}

function BarRow({ label, value, sub, pct, color }: { label: string; value: string; sub: string; pct: number; color: string }) {
  return (
    <div className="mt-1 first:mt-0">
      <div className="flex items-baseline justify-between">
        <span className="text-[11.5px] font-medium text-ink-2">{label}</span>
        <span className="font-mono text-[12px] font-medium text-ink">{value}</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white ring-1 ring-black/5">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="mt-0.5 text-[10px] text-faint">{sub}</div>
    </div>
  );
}

function Hop({ icon, title, sub, accent }: { icon: ReactNode; title: string; sub: string; accent?: boolean }) {
  return (
    <div className={cn("flex min-w-0 flex-1 flex-col items-center gap-1 rounded-[9px] px-1 py-2 text-center", accent ? "bg-luna-soft ring-1 ring-[#f8dcb0] ring-inset" : "bg-white")}>
      <span className={cn("flex size-6 items-center justify-center rounded-full", accent ? "bg-white text-luna-ink" : "bg-panel-2 text-ink-2")}>{icon}</span>
      <span className="text-[11px] font-medium text-ink">{title}</span>
      <span className="text-[9.5px] leading-tight text-muted">{sub}</span>
    </div>
  );
}
