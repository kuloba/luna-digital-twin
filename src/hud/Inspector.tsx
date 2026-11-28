import { BatteryCharging, Crosshair, MessageCircle, MousePointerClick, Route, X } from "lucide-react";
import type { ReactNode } from "react";
import { clockNow } from "@/lib/clock";
import { cn, formatDayTime, formatEta, formatKg, formatNumber } from "@/lib/format";
import { cropColor, healthLabel, liquidColor, statusLabel } from "@/lib/theme";
import { TANKS, ZONE_BY_ID } from "@/sim/layout";
import { assetSummary, recentlyVerified } from "@/sim/luna";
import { inBand } from "@/sim/metrics";
import { twin, useTwin } from "@/sim/store";
import type { Asset, AssetKind, Batch, Metric, MetricKey, SimState } from "@/sim/types";
import { STAGES } from "@/sim/types";
import { Battery, Ring, SlotGrid, TankGauge } from "./gauges";
import { CameraRail, CompartmentVision, EdgeStory, RowVision } from "./inspector-cv";
import { askLuna } from "./luna-chat";
import { AlertCard } from "./AlertCard";
import { EntityChip, RichText } from "./RichText";
import { Eyebrow, Fact, MetricTile, Pill, Progress, Section, type Tone } from "./ui";

const KIND_LABEL: Record<AssetKind, string> = {
  TOWER: "Grow tower",
  ROOM: "Grow room",
  COMPARTMENT: "Glasshouse compartment",
  DOSING: "Fertigation dosing",
  HVAC: "Climate · HVAC",
  SEEDER: "Seeding line",
  GERMINATION: "Germination chamber",
  AMR: "Autonomous mobile robot",
  HARVESTER: "Robotic harvester",
  CONVEYOR: "Conveyor",
  QA: "Quality station",
  WASHER: "Wash line",
  SEALER: "Packaging",
  COLD_ROOM: "Cold room",
  DOCK: "Dock door",
  TRUCK: "Reefer truck",
  CAMERA: "LUNA scout bot",
  ROW: "Crop row · computer vision",
  TANK: "Tank",
  EDGE: "LUNA edge node",
};

const statusTone = (a: Asset): Tone => (a.status === "ALERT" ? "crit" : a.status === "WATCH" ? "warn" : a.status === "CHARGING" ? "info" : a.status === "IDLE" || a.status === "OFFLINE" ? "neutral" : "ok");

export function Inspector() {
  const id = useTwin((s) => s.selectedId);
  if (!id) return <EmptyInspector />;
  return <AssetInspector key={id} id={id} />;
}

function EmptyInspector() {
  return (
    <div className="flex-1 overflow-y-auto px-4 pt-5">
      <div className="flex size-10 items-center justify-center rounded-[12px] bg-panel-2 ring-1 ring-line ring-inset">
        <MousePointerClick className="size-4.5 text-ink-2" />
      </div>
      <h2 className="mt-3 font-serif text-[28px] leading-[1.05] tracking-[-0.01em] text-ink">Select anything in the twin.</h2>
      <p className="mt-2 text-[12.5px] leading-[1.55] text-muted">Towers, rooms, crop rows, robots, tanks and trucks all open here with live readings, the batch they hold and what Luna thinks of them.</p>
      <div className="mt-4 text-[11px] font-medium tracking-[0.06em] text-faint uppercase">Worth a look</div>
      <div className="mt-2 flex flex-col gap-1.5">
        {[
          ["V2", "Vertical grow room with a climate drift"],
          ["G2-R04", "Tomato row, drawn from camera data"],
          ["EDGE-01", "Why the twin needs almost no bandwidth"],
          ["TANK-B", "Stock tank running low"],
          ["AMR-08", "Robot with a battery problem"],
          ["TRK-2", "Reefer loading for the 14:00 order"],
        ].map(([id, text]) => (
          <div key={id} className="flex items-center gap-2 rounded-[10px] bg-panel-2 px-2.5 py-2 text-[12px] text-muted">
            <EntityChip id={id} />
            {text}
          </div>
        ))}
      </div>
    </div>
  );
}

function AssetInspector({ id }: { id: string }) {
  const sim = useTwin((s) => s.sim);
  const a = sim.assets[id];
  if (!a) return <EmptyInspector />;
  const now = clockNow();
  const alert = sim.alerts.find((x) => x.assetId === id && x.status !== "RESOLVED") ?? sim.alerts.find((x) => x.assetId === id && recentlyVerified(x, now));
  const zone = ZONE_BY_ID[a.zoneId];
  return (
    <div className="scroll-thin flex-1 overflow-y-auto">
      <div className="sticky top-0 z-10 border-b border-line bg-white/95 px-4 pt-3.5 pb-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <Eyebrow className="truncate">
            {KIND_LABEL[a.kind]} · {zone.short}
          </Eyebrow>
          <div className="ml-auto flex shrink-0 items-center gap-0.5">
            <HeaderButton title="Frame in view" onClick={() => twin().flyToAsset(id)}>
              <Crosshair className="size-3.5" />
            </HeaderButton>
            <HeaderButton title="Ask Luna about this" onClick={() => askLuna(`Tell me about ${id}`)}>
              <MessageCircle className="size-3.5" />
            </HeaderButton>
            <HeaderButton title="Close" onClick={() => twin().select(undefined)}>
              <X className="size-3.5" />
            </HeaderButton>
          </div>
        </div>
        <h2 className="mt-1 truncate text-[18px] leading-tight font-semibold tracking-[-0.015em] text-ink">{a.name}</h2>
        <div className="mt-1.5 flex min-w-0 items-center gap-2">
          <span className="font-mono text-[11px] text-muted">{a.id}</span>
          <Pill tone={statusTone(a)} dot>
            {statusLabel[a.status]}
          </Pill>
          <span className="truncate text-[11.5px] text-muted">{a.activity}</span>
        </div>
      </div>
      <div className="flex flex-col gap-5 px-4 pt-3.5 pb-6">
        <p className="text-[12.5px] leading-[1.6] text-ink-2">
          <RichText text={assetSummary(a, sim)} chipSize="sm" />
        </p>
        {alert ? <AlertCard alert={alert} /> : null}
        <Body a={a} sim={sim} />
        <DetailFacts a={a} />
      </div>
    </div>
  );
}

function HeaderButton({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" title={title} aria-label={title} onClick={onClick} className="flex size-7 items-center justify-center rounded-[8px] text-muted transition-colors hover:bg-[#f1f4f7] hover:text-ink">
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Per-kind bodies                                                    */
/* ------------------------------------------------------------------ */

function Body({ a, sim }: { a: Asset; sim: SimState }) {
  switch (a.kind) {
    case "TOWER":
      return <TowerBody a={a} sim={sim} />;
    case "ROOM":
      return <RoomBody a={a} sim={sim} />;
    case "COMPARTMENT":
      return (
        <>
          <CompartmentVision compId={a.id} />
          <Tiles title="Climate" a={a} keys={["temp", "rh", "vpd", "co2", "ppfd", "dli"]} />
          <Linked ids={[`CAM-${a.id}`, "EDGE-01", "MIX-01", "CO2-01"]} />
          {a.batchId ? <BatchCard id={a.batchId} /> : null}
        </>
      );
    case "ROW":
      return (
        <>
          <RowVision rowId={a.id} compId={a.roomId!} />
          <Linked ids={[a.roomId!, `CAM-${a.roomId}`, "EDGE-01"]} />
        </>
      );
    case "CAMERA":
      return (
        <>
          <CameraRail compId={a.roomId!} />
          <Linked ids={[a.roomId!, "EDGE-01"]} />
        </>
      );
    case "EDGE":
      return (
        <>
          <EdgeStory />
          <Tiles title="Node" a={a} keys={["throughput", "power"]} />
        </>
      );
    case "AMR":
      return <AmrBody a={a} sim={sim} />;
    case "TANK":
      return <TankBody a={a} />;
    case "DOSING":
      return <DosingBody a={a} />;
    case "COLD_ROOM":
      return <ColdRoomBody a={a} sim={sim} />;
    case "TRUCK":
      return <TruckBody a={a} sim={sim} />;
    case "QA":
      return <QaBody a={a} sim={sim} />;
    case "HVAC":
      return (
        <>
          <Tiles title="Unit" a={a} keys={["temp", "flow", "power"]} />
          <Tiles title={`Room ${a.roomId}`} a={sim.assets[a.roomId!]} keys={["temp", "rh", "vpd"]} compact />
        </>
      );
    default:
      return (
        <>
          {a.batchId && sim.batches[a.batchId] ? <BatchCard id={a.batchId} /> : null}
          {Object.keys(a.metrics).length ? <Tiles title="Live readings" a={a} keys={Object.keys(a.metrics) as MetricKey[]} /> : null}
          {a.progress !== undefined ? (
            <div className="flex items-center gap-3 rounded-[12px] bg-panel-2 px-3 py-2.5">
              <span className="text-[11.5px] text-muted">Cycle progress</span>
              <Progress value={a.progress} className="flex-1" />
              <span className="font-mono text-[11px] text-ink-2">{formatNumber(a.progress * 100)}%</span>
            </div>
          ) : null}
        </>
      );
  }
}

function Tiles({ title, a, keys, compact }: { title: ReactNode; a: Asset; keys: MetricKey[]; compact?: boolean }) {
  const ms = keys.map((k) => a.metrics[k]).filter(Boolean) as Metric[];
  if (!ms.length) return null;
  return (
    <Section title={title}>
      <div className="grid grid-cols-2 gap-2">
        {ms.map((m, i) => (
          // An odd last tile spans the row instead of leaving a hole beside it.
          <MetricTile key={m.key} metric={m} compact={compact} className={cn(i === ms.length - 1 && ms.length % 2 === 1 && "col-span-2")} />
        ))}
      </div>
    </Section>
  );
}

function Linked({ ids }: { ids: string[] }) {
  return (
    <Section title="Linked">
      <div className="flex flex-wrap gap-1.5">
        {ids.map((id) => (
          <EntityChip key={id} id={id} />
        ))}
      </div>
    </Section>
  );
}

const HIDDEN_FACTS = new Set(["role", "filling", "daysLeft", "tankA", "tankB", "acid", "pallets", "capacity", "destination", "departs"]);
const humanize = (k: string) => k.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());

function DetailFacts({ a }: { a: Asset }) {
  const entries = Object.entries(a.detail ?? {}).filter(([k, v]) => !HIDDEN_FACTS.has(k) && v !== "");
  if (!entries.length) return null;
  return (
    <Section title="Details">
      <div className="rounded-[12px] bg-panel-2 px-3 py-1">
        {entries.map(([k, v]) => (
          <Fact key={k} label={humanize(k)} mono={typeof v === "number"}>
            {typeof v === "number" ? formatNumber(v) : String(v)}
          </Fact>
        ))}
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------------ */
/* Batch card                                                         */
/* ------------------------------------------------------------------ */

export function BatchCard({ id, compact }: { id: string; compact?: boolean }) {
  const b = useTwin((s) => s.sim.batches[id]) as Batch | undefined;
  const tracing = useTwin((s) => s.layers.trace && s.batchId === id);
  if (!b) return null;
  const stage = STAGES.find((st) => st.key === b.stage)!;
  const tone: Tone = b.health === "HEALTHY" ? "ok" : b.health === "WATCH" ? "warn" : "crit";
  const color = cropColor[b.cropType];
  return (
    <Section
      title="Batch"
      action={
        <button type="button" onClick={() => twin().selectBatch(id, { trace: !tracing })} className={cn("flex h-6 items-center gap-1 rounded-full px-2 text-[11px] font-medium ring-1 ring-inset", tracing ? "bg-luna-soft text-luna-ink ring-[#f8dcb0]" : "text-muted ring-line-2 hover:text-ink")}>
          <Route className="size-3" /> {tracing ? "Tracing" : "Trace route"}
        </button>
      }
    >
      <div className="rounded-[12px] bg-panel-2 p-3">
        <div className="flex items-start gap-3">
          <Ring value={b.cycleDay / b.cycleDays} size={46} stroke={4} color={color.leaf}>
            <span className="font-mono text-[10.5px] font-medium text-ink">{b.cycleDay}d</span>
          </Ring>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <EntityChip id={b.id} />
              <Pill tone={tone}>{healthLabel[b.health]}</Pill>
            </div>
            <div className="mt-1 truncate text-[13px] font-semibold text-ink">
              {b.cropName} · {b.variety}
            </div>
            <div className="text-[11.5px] text-muted">
              {stage.label} · day {b.cycleDay} of {b.cycleDays}
            </div>
          </div>
        </div>
        {!compact ? (
          <>
            <p className="mt-2.5 text-[11.5px] leading-[1.5] text-ink-2">{b.headline}</p>
            <div className="mt-2.5 grid grid-cols-3 gap-2 border-t border-line pt-2.5">
              <MiniStat label="Forecast" value={formatKg(b.forecastKg)} />
              <MiniStat label="Grade A" value={`${formatNumber(b.gradeA * 100, 1)}%`} />
              <MiniStat label={b.cropType === "TOMATO" || b.cropType === "CUCUMBER" ? "Plants" : "Trays"} value={formatNumber(b.cropType === "TOMATO" || b.cropType === "CUCUMBER" ? b.plants : b.trays)} />
            </div>
            {b.order ? (
              <div className="mt-2.5 flex items-center gap-2 rounded-[9px] bg-white px-2.5 py-1.5 text-[11.5px] text-ink-2 ring-1 ring-line ring-inset">
                <span className="truncate">
                  {b.order.id} · {b.order.customer}
                </span>
                <span className="ml-auto shrink-0 font-mono text-[10.5px] text-muted">{formatNumber(b.order.cases)} cs</span>
                <EntityChip id={b.order.truckId} size="sm" />
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </Section>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[10px] text-muted">{label}</span>
      <span className="font-mono text-[12.5px] font-medium text-ink">{value}</span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Towers + rooms                                                     */
/* ------------------------------------------------------------------ */

function TowerBody({ a, sim }: { a: Asset; sim: SimState }) {
  const room = sim.assets[a.roomId!];
  const b = a.batchId ? sim.batches[a.batchId] : undefined;
  const flow = a.metrics.flow?.value ?? 0;
  return (
    <>
      <div className="flex gap-3">
        <TowerGlyph growth={b ? b.cycleDay / b.cycleDays : 0} color={b ? cropColor[b.cropType].leaf : "#cbd5e1"} accent={b ? cropColor[b.cropType].accent : undefined} irrigating={flow > 2} />
        <div className="grid flex-1 grid-cols-2 content-start gap-2">
          {(["ec", "ph", "waterTemp", "do"] as MetricKey[]).map((k) => (a.metrics[k] ? <MetricTile key={k} metric={a.metrics[k]!} compact /> : null))}
        </div>
      </div>
      {b ? <BatchCard id={b.id} /> : null}
      <Tiles title="Light & irrigation" a={a} keys={["ppfd", "flow"]} />
      <Tiles
        title={
          <button type="button" onClick={() => twin().select(room.id, { fly: true })} className="hover:underline">
            Room climate · {room.id}
          </button>
        }
        a={room}
        keys={["temp", "rh", "vpd", "co2"]}
        compact
      />
    </>
  );
}

/** Six-tier tower elevation: trays fill in as the crop grows; drips run while irrigating. */
function TowerGlyph({ growth, color, accent, irrigating }: { growth: number; color: string; accent?: string; irrigating: boolean }) {
  const tiers = 6;
  return (
    <div className="relative flex w-[92px] shrink-0 flex-col gap-1 rounded-[12px] bg-[linear-gradient(180deg,#fbf3ff,#f4f7fa)] p-2 ring-1 ring-line ring-inset">
      {Array.from({ length: tiers }, (_, i) => (
        <div key={i} className="relative h-[19px] rounded-[4px] bg-white ring-1 ring-[#e3e8ee]">
          <div className="absolute inset-x-1 top-px h-[2px] rounded-full bg-[#ffd9f3]" />
          <div className="absolute inset-x-1 bottom-[3px] flex items-end justify-between">
            {Array.from({ length: 5 }, (_, k) => (
              <span key={k} className="rounded-t-full transition-all duration-700" style={{ width: 9, height: 3 + growth * 9, background: color, opacity: 0.85 }} />
            ))}
          </div>
          {accent && growth > 0.6 ? <span className="absolute right-2 bottom-1 size-[5px] rounded-full" style={{ background: accent }} /> : null}
        </div>
      ))}
      {irrigating ? <div className="absolute top-2 bottom-2 left-[7px] w-[2px] animate-pulse rounded-full bg-[#5aa9e6]" /> : null}
      <div className="mt-0.5 text-center font-mono text-[9px] text-faint">{irrigating ? "irrigating" : "6 tiers"}</div>
    </div>
  );
}

function RoomBody({ a, sim }: { a: Asset; sim: SimState }) {
  const towers = Object.values(sim.assets).filter((t) => t.kind === "TOWER" && t.roomId === a.id);
  const rows = [...new Set(towers.map((t) => t.id[0]))];
  return (
    <>
      <Tiles title="Climate" a={a} keys={["temp", "rh", "vpd", "co2"]} />
      <Tiles title="Light" a={a} keys={["ppfd", "dli"]} />
      <Section title={`Towers · ${towers.filter((t) => t.batchId).length} of ${towers.length} planted`}>
        <div className="flex flex-col gap-1.5 rounded-[12px] bg-panel-2 p-2.5">
          {rows.map((r) => (
            <div key={r} className="flex items-center gap-1.5">
              <span className="w-3 font-mono text-[10px] text-faint">{r}</span>
              {towers
                .filter((t) => t.id.startsWith(r))
                .map((t) => {
                  const b = t.batchId ? sim.batches[t.batchId] : undefined;
                  const warn = Object.values(t.metrics).some((m) => m && m.key !== "flow" && !inBand(m));
                  return (
                    <button
                      key={t.id}
                      type="button"
                      title={`${t.id} · ${t.activity}`}
                      onClick={() => twin().select(t.id, { fly: true })}
                      onMouseEnter={() => twin().hover(t.id)}
                      onMouseLeave={() => twin().hover(undefined)}
                      className={cn("relative h-7 flex-1 rounded-[6px] ring-1 transition ring-inset hover:-translate-y-px", warn ? "ring-[#e59b1a]" : "ring-black/5")}
                      style={{ background: b ? cropColor[b.cropType].leaf : "#e2e8f0", opacity: b ? 0.35 + (b.cycleDay / b.cycleDays) * 0.65 : 1 }}
                    >
                      {t.activity === "Irrigating" ? <span className="absolute top-1 right-1 size-1.5 rounded-full bg-[#5aa9e6]" /> : null}
                    </button>
                  );
                })}
            </div>
          ))}
          <div className="mt-0.5 flex items-center gap-3 text-[10px] text-faint">
            <span>shade = days to harvest</span>
            <span className="flex items-center gap-1">
              <span className="size-1.5 rounded-full bg-[#5aa9e6]" /> irrigating
            </span>
            <span className="flex items-center gap-1">
              <span className="size-2 rounded-[3px] ring-1 ring-[#e59b1a]" /> off-recipe
            </span>
          </div>
        </div>
      </Section>
      <Linked ids={[`HVAC-${a.id}`, `DOS-${a.id}`]} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Robots                                                             */
/* ------------------------------------------------------------------ */

function AmrBody({ a, sim }: { a: Asset; sim: SimState }) {
  const r = sim.amrs[a.id];
  const battery = a.metrics.battery!;
  const m = r.mission;
  const remaining = m ? Math.max(0, (m.length - r.travelled) / r.speed) : 0;
  const stateTone: Tone = r.state === "CHARGING" ? "info" : r.state === "TRANSPORTING" ? "ok" : r.state === "RETURNING" ? "luna" : "neutral";
  return (
    <>
      <div className="flex items-center gap-3 rounded-[12px] bg-panel-2 p-3">
        <Ring value={battery.value / 100} size={58} stroke={5} color={r.state === "CHARGING" ? "#3f7fd6" : battery.value < 25 ? "#dc4a3d" : battery.value < 40 ? "#e59b1a" : "#2f9e5b"}>
          <span className="font-mono text-[13px] font-medium text-ink">{formatNumber(battery.value)}%</span>
        </Ring>
        <div className="min-w-0 flex-1">
          <Pill tone={stateTone} dot>
            {r.state.charAt(0) + r.state.slice(1).toLowerCase()}
          </Pill>
          <div className="mt-1.5 text-[11.5px] leading-[1.45] text-muted">
            {r.state === "CHARGING" ? "On the hub pad · back in service at 92 %" : `${formatNumber(r.speed, 1)} m/s · drain ${r.drain > 1 ? `${r.drain}× fleet avg` : "normal"}`}
          </div>
        </div>
        {r.state !== "CHARGING" && !r.recall ? (
          <button type="button" onClick={() => twin().recallAmr(a.id)} className="flex h-8 shrink-0 items-center gap-1.5 rounded-[9px] bg-white px-2.5 text-[11.5px] font-medium text-ink-2 ring-1 ring-line-2 ring-inset hover:text-ink">
            <BatteryCharging className="size-3.5" /> Send to charge
          </button>
        ) : r.recall && r.state !== "CHARGING" ? (
          <span className="text-[11px] text-luna-ink">Heading to pad…</span>
        ) : null}
      </div>
      {m ? (
        <Section title="Mission" action={<span className="font-mono text-[10.5px] text-faint">{m.id}</span>}>
          <div className="rounded-[12px] bg-panel-2 p-3">
            <div className="text-[13px] font-semibold text-ink">{m.label}</div>
            <div className="mt-1 text-[11.5px] text-muted">
              {m.payload}
              {m.trays ? ` · ${m.trays} trays` : ""}
            </div>
            <div className="mt-2.5 flex items-center gap-2">
              <Progress value={r.travelled / m.length} tone="luna" className="flex-1" />
              <span className="font-mono text-[10.5px] text-ink-2">{remaining < 60 ? `${Math.round(remaining)} s` : `${Math.round(remaining / 60)} min`}</span>
            </div>
            {m.batchId ? (
              <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-faint">
                Carrying <EntityChip id={m.batchId} size="sm" />
              </div>
            ) : null}
          </div>
        </Section>
      ) : null}
      <Section title="Fleet">
        <div className="grid grid-cols-5 gap-1.5">
          {Object.values(sim.amrs).map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => twin().select(o.id, { fly: true })}
              className={cn("flex flex-col items-center gap-1 rounded-[9px] px-1 py-1.5 ring-1 ring-inset", o.id === a.id ? "bg-luna-soft ring-[#f8dcb0]" : "bg-panel-2 ring-transparent hover:ring-line-2")}
            >
              <span className="font-mono text-[10px] text-ink-2">{o.id.slice(4)}</span>
              <Battery value={sim.assets[o.id].metrics.battery!.value} charging={o.state === "CHARGING"} className="scale-90" />
            </button>
          ))}
        </div>
      </Section>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Tanks + dosing                                                     */
/* ------------------------------------------------------------------ */

const FEEDS: Record<string, string[]> = {
  "RAIN-01": ["MIX-01"],
  "TANK-A": ["DOS-V1", "DOS-V2", "MIX-01"],
  "TANK-B": ["DOS-V1", "DOS-V2", "MIX-01"],
  "TANK-ACID": ["DOS-V1", "DOS-V2", "MIX-01"],
  "MIX-01": ["G1", "G2", "G3"],
  "DRAIN-01": ["MIX-01"],
  "CO2-01": ["G1", "G2", "G3"],
  "BUF-01": ["G1", "G2", "G3"],
};

function TankBody({ a }: { a: Asset }) {
  const spec = TANKS.find((t) => t.id === a.id)!;
  const level = a.metrics.level!;
  const days = a.detail?.daysLeft as number | undefined;
  const others = (Object.keys(a.metrics) as MetricKey[]).filter((k) => k !== "level");
  const color = liquidColor[spec.role];
  return (
    <>
      <div className="flex items-stretch gap-4 rounded-[12px] bg-panel-2 p-3">
        <TankGauge level={level.value} color={color} low={spec.role === "drain" ? undefined : level.low} warn={a.status === "WATCH"} width={64} height={132} />
        <div className="flex min-w-0 flex-1 flex-col justify-between">
          <div>
            <div className="text-[10.5px] text-muted">Level</div>
            <div className="flex items-baseline gap-1">
              <span className="font-mono text-[30px] leading-none font-medium tracking-[-0.03em] text-ink tabular">{formatNumber(level.value, 1)}</span>
              <span className="text-[11px] text-muted">%</span>
            </div>
            <div className="mt-1 text-[11px] text-muted">of {String(a.detail?.capacity ?? "")}</div>
          </div>
          {days ? (
            <div className={cn("rounded-[9px] px-2.5 py-1.5 text-[11.5px] ring-1 ring-inset", days < 3 ? "bg-warn-soft text-[#9a5b05] ring-[#f3d9a8]" : "bg-white text-ink-2 ring-line")}>
              <span className="font-mono font-medium">{formatNumber(days, 1)} days</span> at today's draw
              {days < 3 ? " · reorder today" : ""}
            </div>
          ) : (
            <div className="rounded-[9px] bg-white px-2.5 py-1.5 text-[11.5px] text-ink-2 ring-1 ring-line ring-inset">{a.activity}</div>
          )}
          <SparkRow metric={level} />
        </div>
      </div>
      {others.length ? <Tiles title="Quality" a={a} keys={others} /> : null}
      <Section title="Feeds">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-faint">
          {FEEDS[a.id]?.map((id) => (
            <EntityChip key={id} id={id} />
          ))}
        </div>
      </Section>
    </>
  );
}

function SparkRow({ metric }: { metric: Metric }) {
  const h = metric.history.slice(-60);
  const lo = Math.min(...h);
  const hi = Math.max(...h);
  const trend = h[h.length - 1] - h[0];
  return (
    <div className="flex items-center gap-2 text-[10.5px] text-faint">
      <span>last 60 s</span>
      <span className={cn("font-mono", trend < -0.05 ? "text-[#b26b00]" : trend > 0.05 ? "text-ok" : "text-faint")}>
        {trend >= 0 ? "▲" : "▼"} {formatNumber(Math.abs(trend), 2)} pts
      </span>
      <span className="ml-auto font-mono">
        {formatNumber(lo, 1)}–{formatNumber(hi, 1)}
      </span>
    </div>
  );
}

function DosingBody({ a }: { a: Asset }) {
  const d = a.detail ?? {};
  const tanks = [
    { label: "A", v: Number(d.tankA ?? 0), c: liquidColor.stockA },
    { label: "B", v: Number(d.tankB ?? 0), c: liquidColor.stockB },
    { label: "Acid", v: Number(d.acid ?? 0), c: liquidColor.acid },
  ];
  return (
    <>
      <Section title="Day tanks">
        <div className="flex items-end justify-around rounded-[12px] bg-panel-2 px-3 pt-3 pb-2">
          {tanks.map((t) => (
            <div key={t.label} className="flex flex-col items-center gap-1">
              <TankGauge level={t.v} color={t.c} low={25} width={40} height={70} />
              <span className="text-[10.5px] font-medium text-ink-2">{t.label}</span>
              <span className="font-mono text-[10px] text-faint">{t.v}%</span>
            </div>
          ))}
        </div>
      </Section>
      <Tiles title="Mix" a={a} keys={["ec", "ph", "flow"]} />
      <Linked ids={["TANK-A", "TANK-B", "TANK-ACID", a.roomId!]} />
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Cold chain                                                         */
/* ------------------------------------------------------------------ */

function ColdRoomBody({ a, sim }: { a: Asset; sim: SimState }) {
  const pallets = Number(a.detail?.pallets ?? 0);
  const capacity = Number(a.detail?.capacity ?? 32);
  const held = Object.values(sim.batches).filter((b) => b.stage === "COLD_CHAIN" && b.route.find((v) => v.stage === "COLD_CHAIN")?.assetIds.includes(a.id));
  const door = a.metrics.doorOpen?.value ?? 0;
  return (
    <>
      <Tiles title="Holding" a={a} keys={["temp", "rh"]} />
      <Section title={`Pallets · ${pallets} of ${capacity}`} action={<span className={cn("text-[11px] font-medium", door > 0.5 ? "text-[#b26b00]" : "text-faint")}>Door {door > 0.5 ? "open" : "closed"}</span>}>
        <div className="rounded-[12px] bg-panel-2 p-3">
          <SlotGrid filled={pallets} capacity={capacity} cols={8} color="#7fa6bf" />
        </div>
      </Section>
      {held.length ? (
        <Section title="Batches inside">
          <div className="flex flex-wrap gap-1.5">
            {held.map((b) => (
              <EntityChip key={b.id} id={b.id} />
            ))}
          </div>
        </Section>
      ) : null}
    </>
  );
}

function TruckBody({ a, sim }: { a: Asset; sim: SimState }) {
  const b = a.batchId ? sim.batches[a.batchId] : undefined;
  const load = a.metrics.load!.value;
  const sealed = a.activity.startsWith("Sealed");
  return (
    <>
      <div className="rounded-[12px] bg-panel-2 p-3">
        <div className="text-[10.5px] text-muted">Destination</div>
        <div className="mt-0.5 text-[13px] font-semibold text-ink">{String(a.detail?.destination ?? "")}</div>
        <div className="mt-2 flex items-center gap-2 text-[11.5px] text-ink-2">
          <span className="font-mono font-medium">Departs {String(a.detail?.departs ?? "")}</span>
          <Pill tone={sealed ? "ok" : "luna"} dot>
            {sealed ? "Sealed" : "Loading"}
          </Pill>
        </div>
        <div className="mt-3 text-[10.5px] text-muted">Pallets · {formatNumber((load / 100) * 26)} of 26</div>
        <div className="mt-1.5">
          <SlotGrid filled={Math.round((load / 100) * 26)} capacity={26} cols={13} color="#4f6d8f" />
        </div>
      </div>
      <Tiles title="Reefer" a={a} keys={["temp", "load"]} compact />
      {b ? <BatchCard id={b.id} /> : null}
      {b?.order ? (
        <Section title="Order">
          <div className="rounded-[12px] bg-panel-2 px-3 py-1">
            <Fact label="Order">{b.order.id}</Fact>
            <Fact label="Customer">{b.order.customer}</Fact>
            <Fact label="Cases" mono>
              {formatNumber(b.order.cases)}
            </Fact>
            <Fact label="Due">
              {formatDayTime(b.order.dueAt)} · {formatEta(b.order.dueAt)}
            </Fact>
          </div>
        </Section>
      ) : null}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Quality                                                            */
/* ------------------------------------------------------------------ */

const REJECTS = [
  { label: "Tipburn", v: 0.41, color: "#dc4a3d" },
  { label: "Undersize", v: 0.33, color: "#e59b1a" },
  { label: "Colour", v: 0.18, color: "#4f6d8f" },
  { label: "Foreign matter", v: 0.08, color: "#94a3b8" },
];

function QaBody({ a, sim }: { a: Asset; sim: SimState }) {
  const b = a.batchId ? sim.batches[a.batchId] : undefined;
  const qa1 = sim.assets["QA-01"];
  const qa2 = sim.assets["QA-02"];
  const qa3 = sim.assets["QA-03"];
  const checks = [
    { label: "Checkweigher · 150 g/head", ok: inBand(qa1.metrics.passRate!), live: a.id === "QA-01", id: "QA-01" },
    { label: "Optical grade · colour, tipburn, size", ok: inBand(qa2.metrics.passRate!), live: a.id === "QA-02", id: "QA-02" },
    { label: `Micro swab panel · ${qa3.detail?.pending} pending, next ${qa3.detail?.nextResult}`, ok: null, live: a.id === "QA-03", id: "QA-03" },
    { label: "Lot label + QR trace", ok: true, live: false, id: "SEAL-01" },
  ];
  return (
    <>
      <Tiles title="Live" a={a} keys={["passRate", "rejectRate", "weightDev", "throughput"]} />
      {a.id === "QA-02" ? (
        <Section title="Why trays are rejected · today">
          <div className="rounded-[12px] bg-panel-2 p-3">
            <div className="flex h-2 overflow-hidden rounded-full">
              {REJECTS.map((r) => (
                <div key={r.label} style={{ width: `${r.v * 100}%`, background: r.color }} />
              ))}
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
              {REJECTS.map((r) => (
                <div key={r.label} className="flex items-center gap-1.5 text-[11px] text-muted">
                  <span className="size-2 rounded-[3px]" style={{ background: r.color }} />
                  {r.label}
                  <span className="ml-auto font-mono text-faint">{formatNumber(r.v * 100)}%</span>
                </div>
              ))}
            </div>
          </div>
        </Section>
      ) : null}
      <Section title={b ? `Release checklist · ${b.id}` : "Release checklist"}>
        <div className="flex flex-col gap-1">
          {checks.map((c) => (
            <button key={c.label} type="button" onClick={() => twin().select(c.id, { fly: true })} className={cn("flex items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-[12px] ring-1 ring-inset", c.live ? "bg-luna-soft/60 ring-[#f8dcb0]" : "bg-panel-2 ring-transparent hover:ring-line-2")}>
              <span className={cn("flex size-4.5 shrink-0 items-center justify-center rounded-full text-[10px] text-white", c.ok === null ? "bg-[#cbd5e1]" : c.ok ? "bg-ok" : "bg-warn")}>{c.ok === null ? "…" : c.ok ? "✓" : "!"}</span>
              <span className="flex-1 text-ink-2">{c.label}</span>
              <span className="font-mono text-[10px] text-faint">{c.id}</span>
            </button>
          ))}
        </div>
      </Section>
      {b ? <BatchCard id={b.id} compact /> : null}
    </>
  );
}
