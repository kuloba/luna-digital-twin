import { useEffect, useMemo, useState, type ReactNode } from "react";
import { cn, formatAgo, formatNumber } from "@/lib/format";
import { cropColor, liquidColor, statusLabel } from "@/lib/theme";
import { RIPENESS_STAGES, CUCUMBER_STAGES, summarise } from "@/sim/cv";
import { TANKS, ZONE_BY_ID } from "@/sim/layout";
import { deviation, inBand } from "@/sim/metrics";
import { twin, useTwin } from "@/sim/store";
import type { Asset, Metric, SimState, ZoneId } from "@/sim/types";
import { Battery } from "./gauges";
import { Pill, Progress, type Tone } from "./ui";

/**
 * Bottom zone-activity table. Its tab follows the zone you are looking at
 * (towers in a grow room, rows in the glasshouse, robots in harvest…) and
 * rows fly the camera to the asset.
 */

type TabKey = "towers" | "rows" | "climate" | "robots" | "quality" | "dispatch" | "tanks";

const TABS: { key: TabKey; label: string }[] = [
  { key: "rows", label: "Crop rows" },
  { key: "towers", label: "Towers" },
  { key: "climate", label: "Climate" },
  { key: "robots", label: "Robots" },
  { key: "quality", label: "Line & QA" },
  { key: "dispatch", label: "Dispatch" },
  { key: "tanks", label: "Tanks" },
];

const TAB_FOR_FOCUS: Partial<Record<ZoneId | "SITE", TabKey>> = { V1: "towers", V2: "towers", GH: "rows", HARV: "quality", QA: "quality", PACK: "quality", COLD: "dispatch", UTIL: "tanks", PROP: "climate" };

export function ZoneTable() {
  const focus = useTwin((s) => s.focus);
  const role = useTwin((s) => s.role);
  const [tab, setTab] = useState<TabKey>(role === "GROWER" ? "climate" : "robots");
  useEffect(() => {
    const t = TAB_FOR_FOCUS[focus];
    if (t) setTab(t);
  }, [focus]);
  useEffect(() => {
    if (focus === "SITE") setTab(role === "GROWER" ? "climate" : "robots");
  }, [role, focus]);
  const sim = useTwin((s) => s.sim);
  // The guided demo's card takes this slot; the table comes back when it ends.
  const touring = useTwin((s) => s.tour.active || s.welcomeOpen);
  const zoneLabel = focus === "SITE" ? "Whole campus" : ZONE_BY_ID[focus].short;
  return (
    <div data-tour="table" className={cn("pointer-events-auto absolute right-[388px] bottom-4 left-[448px] z-20 hidden h-[196px] min-w-0 flex-col overflow-hidden panel 2xl:right-[420px] 2xl:left-[496px]", !touring && "min-[1200px]:flex")}>
      <div className="flex items-center gap-2 border-b border-line px-2 py-1.5">
        <div className="scroll-thin flex min-w-0 flex-1 gap-0.5 overflow-x-auto">
          {TABS.map((t) => (
            <button key={t.key} type="button" onClick={() => setTab(t.key)} className={cn("h-7 shrink-0 rounded-[8px] px-2.5 text-[11.5px] font-medium transition-colors", tab === t.key ? "bg-[#f1f4f7] text-ink" : "text-muted hover:text-ink")}>
              {t.label}
            </button>
          ))}
        </div>
        <span className="hidden shrink-0 pr-1.5 text-[10.5px] text-faint 2xl:inline">{zoneLabel}</span>
      </div>
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <TableBody tab={tab} sim={sim} focus={focus} />
      </div>
    </div>
  );
}

function TableBody({ tab, sim, focus }: { tab: TabKey; sim: SimState; focus: ZoneId | "SITE" }) {
  switch (tab) {
    case "towers":
      return <TowersTable sim={sim} focus={focus} />;
    case "rows":
      return <RowsTable sim={sim} />;
    case "climate":
      return <ClimateTable sim={sim} />;
    case "robots":
      return <RobotsTable sim={sim} />;
    case "quality":
      return <QualityTable sim={sim} />;
    case "dispatch":
      return <DispatchTable sim={sim} />;
    case "tanks":
      return <TanksTable sim={sim} />;
  }
}

/* ------------------------------------------------------------------ */
/* Table primitives                                                   */
/* ------------------------------------------------------------------ */

function Table({ cols, head, children }: { cols: string; head: ReactNode[]; children: ReactNode }) {
  return (
    <div className="min-w-0 text-[11.5px]">
      <div className="sticky top-0 z-10 grid items-center gap-2 bg-white/95 px-3 py-1.5 text-[10px] font-medium tracking-[0.04em] text-faint uppercase backdrop-blur" style={{ gridTemplateColumns: cols }}>
        {head.map((h, i) => (
          <span key={i} className={cn("truncate", i > 0 && "text-right first:text-left")}>
            {h}
          </span>
        ))}
      </div>
      {children}
    </div>
  );
}

function Row({ id, cols, children }: { id: string; cols: string; children: ReactNode }) {
  const selected = useTwin((s) => s.selectedId === id);
  const hovered = useTwin((s) => s.hoveredId === id);
  return (
    <button
      type="button"
      onClick={() => twin().select(id, { fly: true })}
      onMouseEnter={() => twin().hover(id)}
      onMouseLeave={() => twin().hover(undefined)}
      className={cn("grid w-full items-center gap-2 border-t border-line px-3 py-[5px] text-left transition-colors", selected ? "bg-luna-soft/60" : hovered ? "bg-[#f6f8fa]" : "hover:bg-[#f6f8fa]")}
      style={{ gridTemplateColumns: cols }}
    >
      {children}
    </button>
  );
}

const Id = ({ id, sub }: { id: string; sub?: string }) => (
  <span className="flex min-w-0 items-center gap-1.5">
    <span className="shrink-0 font-mono text-[11px] font-medium whitespace-nowrap text-ink">{id}</span>
    {sub ? <span className="truncate text-[10.5px] text-faint">{sub}</span> : null}
  </span>
);

const R = ({ children, className }: { children: ReactNode; className?: string }) => <span className={cn("truncate text-right font-mono text-[11px] text-ink-2 tabular", className)}>{children}</span>;

function Val({ m, digits }: { m?: Metric; digits?: number }) {
  if (!m) return <R className="text-faint">—</R>;
  const tone = inBand(m) ? "" : deviation(m) > 0.35 ? "text-crit font-medium" : "text-[#b26b00] font-medium";
  const d = digits ?? m.precision;
  const v = Math.abs(m.value) < 0.5 * 10 ** -d ? 0 : m.value;
  return <R className={tone}>{formatNumber(v, d)}</R>;
}

function statusPill(a: Asset, sim: SimState) {
  const alert = sim.alerts.find((x) => x.assetId === a.id && x.status !== "RESOLVED");
  if (alert) {
    const tone: Tone = alert.status === "RESOLVING" ? "info" : alert.severity === "CRITICAL" ? "crit" : "warn";
    return (
      <span className="flex justify-end">
        <Pill tone={tone} dot>
          {alert.status === "RESOLVING" ? "Recovering" : alert.severity === "CRITICAL" ? "Critical" : "Warning"}
        </Pill>
      </span>
    );
  }
  const tone: Tone = a.status === "WATCH" ? "warn" : a.status === "ALERT" ? "crit" : a.status === "CHARGING" ? "info" : a.status === "IDLE" ? "neutral" : "ok";
  return (
    <span className="flex justify-end">
      <Pill tone={tone} dot>
        {statusLabel[a.status]}
      </Pill>
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Tabs                                                               */
/* ------------------------------------------------------------------ */

function TowersTable({ sim, focus }: { sim: SimState; focus: ZoneId | "SITE" }) {
  const towers = Object.values(sim.assets).filter((a) => a.kind === "TOWER" && (focus === "V1" || focus === "V2" ? a.roomId === focus : true));
  const cols = "minmax(70px,1fr) 78px minmax(70px,1.1fr) 52px 44px 40px 92px";
  return (
    <Table cols={cols} head={["Tower", "Batch", "Day", "EC", "pH", "Flow", "Status"]}>
      {towers.map((t) => {
        const b = t.batchId ? sim.batches[t.batchId] : undefined;
        return (
          <Row key={t.id} id={t.id} cols={cols}>
            <Id id={t.id} sub={t.activity} />
            <span className="flex items-center justify-end gap-1.5 font-mono text-[11px] text-ink-2">
              {b ? <span className="size-1.5 rounded-full" style={{ background: cropColor[b.cropType].accent ?? cropColor[b.cropType].leaf }} /> : null}
              {b?.id ?? "—"}
            </span>
            <span className="flex items-center gap-1.5">
              <Progress value={b ? b.cycleDay / b.cycleDays : 0} className="flex-1" height={4} />
              <span className="w-9 text-right font-mono text-[10.5px] text-muted">{b ? `${b.cycleDay}/${b.cycleDays}` : ""}</span>
            </span>
            <Val m={t.metrics.ec} digits={2} />
            <Val m={t.metrics.ph} digits={1} />
            <R>{formatNumber(Math.max(0, t.metrics.flow?.value ?? 0))}</R>
            {statusPill(t, sim)}
          </Row>
        );
      })}
    </Table>
  );
}

function RowsTable({ sim }: { sim: SimState }) {
  const rows = useMemo(() => {
    const out: { id: string; comp: string; crop: "TOMATO" | "CUCUMBER"; sum: ReturnType<typeof summarise> }[] = [];
    for (const comp of Object.values(sim.cv)) for (const r of comp.rows) out.push({ id: r.id, comp: comp.id, crop: comp.crop, sum: summarise(r.plantIds.map((p) => comp.plants[p]), comp.crop) });
    return out;
  }, [sim.cv]);
  const cols = "minmax(64px,0.8fr) minmax(90px,1.4fr) 62px 62px 74px 70px";
  return (
    <Table cols={cols} head={["Row", "Ripeness", "Fruit", "Ready 7d", "Pests", "Scanned"]}>
      {rows.map(({ id, crop, sum }) => {
        const total = sum.stages.reduce((a, b) => a + b, 0) || 1;
        const stages = crop === "TOMATO" ? RIPENESS_STAGES : CUCUMBER_STAGES;
        return (
          <Row key={id} id={id} cols={cols}>
            <Id id={id} sub={crop === "TOMATO" ? "tom" : "cuc"} />
            <span className="flex h-1.5 overflow-hidden rounded-full">
              {sum.stages.map((v, i) => (
                <span key={i} style={{ width: `${(v / total) * 100}%`, background: stages[i].color }} />
              ))}
            </span>
            <R>{formatNumber(sum.fruits)}</R>
            <R>{formatNumber(sum.readyKg7d)} kg</R>
            <span className="truncate text-right text-[11px]">{sum.pests.length ? <span className="font-medium text-[#b26b00]">{sum.pests[0].kind}</span> : <span className="text-faint">—</span>}</span>
            <R className="text-muted">{formatAgo(sum.lastScan)}</R>
          </Row>
        );
      })}
    </Table>
  );
}

const CLIMATE = ["V1", "V2", "G1", "G2", "G3", "GERM-01", "GERM-02", "GERM-03", "CR-1", "CR-2"];

function ClimateTable({ sim }: { sim: SimState }) {
  const cols = "minmax(80px,1.2fr) 52px 48px 52px 56px 56px 92px";
  return (
    <Table cols={cols} head={["Space", "°C", "RH %", "VPD", "CO₂", "Light", "Status"]}>
      {CLIMATE.map((id) => {
        const a = sim.assets[id];
        if (!a) return null;
        return (
          <Row key={id} id={id} cols={cols}>
            <Id id={id} sub={a.kind === "GERMINATION" ? "germ" : a.kind === "COLD_ROOM" ? "cold" : a.kind === "ROOM" ? "vertical" : "glass"} />
            <Val m={a.metrics.temp} digits={1} />
            <Val m={a.metrics.rh} digits={0} />
            <Val m={a.metrics.vpd} digits={2} />
            <Val m={a.metrics.co2} digits={0} />
            <Val m={a.metrics.ppfd} digits={0} />
            {statusPill(a, sim)}
          </Row>
        );
      })}
    </Table>
  );
}

function RobotsTable({ sim }: { sim: SimState }) {
  const cols = "56px 86px minmax(110px,1.6fr) 84px 92px";
  return (
    <Table cols={cols} head={["AMR", "State", "Mission", "Battery", "Status"]}>
      {Object.values(sim.amrs).map((r) => {
        const a = sim.assets[r.id];
        const st = r.state.charAt(0) + r.state.slice(1).toLowerCase();
        return (
          <Row key={r.id} id={r.id} cols={cols}>
            <Id id={r.id.replace("AMR-", "AMR ")} />
            <span className="truncate text-right text-[11px] text-ink-2">{st}</span>
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="min-w-0 flex-1 truncate text-right text-[11px] text-muted">{r.mission?.label ?? "—"}</span>
              {r.mission ? <Progress value={r.travelled / r.mission.length} tone="luna" className="w-10 shrink-0" height={4} /> : null}
            </span>
            <span className="flex justify-end">
              <Battery value={a.metrics.battery!.value} charging={r.state === "CHARGING"} />
            </span>
            {statusPill(a, sim)}
          </Row>
        );
      })}
    </Table>
  );
}

const LINE = ["HRV-01", "HRV-02", "CUT-01", "QA-01", "QA-02", "QA-03", "WASH-01", "SEAL-01"];

function QualityTable({ sim }: { sim: SimState }) {
  const cols = "minmax(110px,1.4fr) 70px 58px 58px 64px 92px";
  return (
    <Table cols={cols} head={["Station", "Batch", "Pass %", "Reject", "Rate/h", "Status"]}>
      {LINE.map((id) => {
        const a = sim.assets[id];
        if (!a) return null;
        return (
          <Row key={id} id={id} cols={cols}>
            <Id id={id} sub={a.activity} />
            <R>{a.batchId ?? "—"}</R>
            <Val m={a.metrics.passRate} digits={1} />
            <Val m={a.metrics.rejectRate} digits={1} />
            <Val m={a.metrics.throughput} digits={0} />
            {statusPill(a, sim)}
          </Row>
        );
      })}
    </Table>
  );
}

function DispatchTable({ sim }: { sim: SimState }) {
  const cols = "56px minmax(110px,1.6fr) 64px 84px 52px 92px";
  const ids = ["TRK-1", "TRK-2", "TRK-3", "CR-1", "CR-2"];
  return (
    <Table cols={cols} head={["Unit", "Destination", "Departs", "Load", "°C", "Status"]}>
      {ids.map((id) => {
        const a = sim.assets[id];
        if (!a) return null;
        const load = a.metrics.load?.value ?? 0;
        return (
          <Row key={id} id={id} cols={cols}>
            <Id id={id} />
            <span className="truncate text-right text-[11px] text-muted">{a.kind === "TRUCK" ? String(a.detail?.destination ?? "").split(" · ")[0] : `${a.detail?.pallets} pallets held`}</span>
            <R>{a.kind === "TRUCK" ? String(a.detail?.departs ?? "") : "—"}</R>
            <span className="flex items-center gap-1.5">
              <Progress value={load / 100} tone={a.kind === "TRUCK" ? "info" : "neutral"} className="flex-1" height={4} />
              <span className="w-7 text-right font-mono text-[10.5px] text-muted">{formatNumber(load)}%</span>
            </span>
            <Val m={a.metrics.temp} digits={1} />
            {statusPill(a, sim)}
          </Row>
        );
      })}
    </Table>
  );
}

function TanksTable({ sim }: { sim: SimState }) {
  const cols = "minmax(80px,1.1fr) minmax(90px,1.2fr) 54px minmax(90px,1.3fr) 92px";
  return (
    <Table cols={cols} head={["Tank", "Level", "Left", "Activity", "Status"]}>
      {TANKS.map((t) => {
        const a = sim.assets[t.id];
        const lvl = a.metrics.level!;
        const days = a.detail?.daysLeft as number | undefined;
        return (
          <Row key={t.id} id={t.id} cols={cols}>
            <Id id={t.id} />
            <span className="flex items-center gap-1.5">
              <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-[#eaeef2]">
                <span className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700" style={{ width: `${lvl.value}%`, background: liquidColor[t.role] }} />
              </span>
              <span className="w-8 text-right font-mono text-[10.5px] text-ink-2">{formatNumber(lvl.value)}%</span>
            </span>
            <R className={days !== undefined && days < 3 ? "font-medium text-[#b26b00]" : ""}>{days !== undefined ? `${formatNumber(days, 1)} d` : "—"}</R>
            <span className="truncate text-right text-[11px] text-muted">{a.activity}</span>
            {statusPill(a, sim)}
          </Row>
        );
      })}
    </Table>
  );
}
