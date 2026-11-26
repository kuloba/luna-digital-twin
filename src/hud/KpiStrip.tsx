import { forecastTotals, kgShort, useForecast } from "./Forecast";
import { Camera, Sprout, Truck, Bot, Gauge, Award } from "lucide-react";
import type { ReactNode } from "react";
import { cn, formatNumber } from "@/lib/format";
import { summarise } from "@/sim/cv";
import { useTwin } from "@/sim/store";
import { Num, Sparkline } from "./ui";
import { clockNow } from "@/lib/clock";

export function KpiStrip() {
  const role = useTwin((s) => s.role);
  const k = useTwin((s) => s.sim.kpis);
  const cards =
    role === "GROWER"
      ? [
          <Kpi key="y" icon={<Sprout className="size-3.5" />} label="Yield harvested today" value={k.yieldTodayKg} unit="kg" digits={0} delta={((k.yieldTodayKg / (k.yieldPlanKg * paceShare())) - 1) * 100} deltaLabel="vs plan" spark={k.history.yieldTodayKg} />,
          <Kpi key="t" icon={<Gauge className="size-3.5" />} label="Active grow towers" value={k.activeTowers} unit={`/ ${k.totalTowers}`} digits={0} note="+ 30 glasshouse rows" spark={k.history.activeTowers} />,
          <Kpi key="g" icon={<Award className="size-3.5" />} label="Grade-A pack-out" value={k.gradeA} unit="%" digits={1} delta={k.gradeA - k.gradeATarget} deltaLabel="pts vs target" spark={k.history.gradeA} />,
        ]
      : [
          <Kpi key="th" icon={<Gauge className="size-3.5" />} label="Line throughput" value={k.traysPerHour} unit="trays/h" digits={0} delta={((k.traysPerHour - 240) / 240) * 100} deltaLabel="vs plan" spark={k.history.traysPerHour} />,
          <Kpi key="od" icon={<Truck className="size-3.5" />} label="On-time dispatch" value={k.onTimeDispatch} unit="%" digits={1} delta={k.onTimeDispatch - 97} deltaLabel="pts vs SLA" spark={k.history.onTimeDispatch} />,
          <Kpi key="ru" icon={<Bot className="size-3.5" />} label="Robot utilisation" value={k.robotUtilisation} unit="%" digits={0} note="10 AMRs · 2 harvesters" spark={k.history.robotUtilisation} />,
        ];
  return (
    <div className="pointer-events-auto absolute top-[88px] left-4 z-20 flex gap-2.5">
      {cards.map((c, i) => (
        // Narrow screens keep the headline KPI and crop vision; the rest return at 1200 px.
        <div key={c.key} className={i === 0 ? "flex" : "hidden min-[1200px]:flex"}>
          {c}
        </div>
      ))}
      <VisionCard />
    </div>
  );
}

/** Share of the day's plan that should be harvested by now (05:00–17:00 ramp). */
function paceShare() {
  const d = new Date(clockNow());
  const h = d.getHours() + d.getMinutes() / 60;
  return Math.min(1, Math.max(0.18, (h - 5) / 12));
}

function Kpi({ icon, label, value, unit, digits, delta, deltaLabel, note, spark }: { icon: ReactNode; label: string; value: number; unit: string; digits: number; delta?: number; deltaLabel?: string; note?: string; spark: number[] }) {
  const up = (delta ?? 0) >= 0;
  return (
    <div className="flex w-[184px] flex-col gap-2 px-3.5 pt-3 pb-3 panel 2xl:w-[212px]">
      <div className="flex items-center gap-1.5 text-muted">
        <span className="flex size-5 items-center justify-center rounded-md bg-[#f1f4f7] text-ink-2">{icon}</span>
        <span className="text-[11.5px] font-medium">{label}</span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="flex items-baseline gap-1">
          <Num value={value} digits={digits} className="font-mono text-[24px] leading-none font-medium tracking-[-0.03em] text-ink" />
          <span className="text-[11px] text-muted">{unit}</span>
        </div>
        <Sparkline data={spark.slice(-30)} width={62} height={24} color="#4f6d8f" />
      </div>
      {delta !== undefined ? (
        <div className="flex items-center gap-1.5 text-[11px]">
          <span className={cn("font-mono font-medium tabular", up ? "text-ok" : "text-crit")}>
            {up ? "▲" : "▼"} {formatNumber(Math.abs(delta), 1)}
            {deltaLabel?.startsWith("pts") ? "" : "%"}
          </span>
          <span className="text-faint">{deltaLabel}</span>
        </div>
      ) : (
        <div className="text-[11px] text-faint">{note}</div>
      )}
    </div>
  );
}

function VisionCard() {
  const cv = useTwin((s) => s.sim.cv);
  const flyToZone = useTwin((s) => s.flyToZone);
  const setCvLens = useTwin((s) => s.setCvLens);
  const g1 = summarise(Object.values(cv.G1.plants), "TOMATO");
  const g2 = summarise(Object.values(cv.G2.plants), "TOMATO");
  const images = cv.G1.imagesToday + cv.G2.imagesToday + cv.G3.imagesToday;
  const rawGb = (images * 4.2) / 1024;
  const ready = g1.readyKg7d + g2.readyKg7d;
  const total = g1.stages.map((v, i) => v + g2.stages[i]);
  const sum = total.reduce((a, b) => a + b, 0);
  const colors = ["#5e9a3a", "#b9b23a", "#e0a23a", "#ea7a46", "#e5553a", "#cf3326"];
  return (
    <button
      type="button"
      onClick={() => {
        flyToZone("GH");
        setCvLens("ripeness");
      }}
      className="group flex w-[220px] flex-col gap-2 px-3.5 pt-3 pb-3 text-left transition hover:-translate-y-px panel 2xl:w-[248px]"
    >
      <div className="flex items-center gap-1.5">
        <span className="flex size-5 items-center justify-center rounded-md bg-luna-soft text-luna-ink">
          <Camera className="size-3.5" />
        </span>
        <span className="text-[11.5px] font-medium text-muted">Crop vision · tomatoes</span>
        <span className="ml-auto rounded-full bg-luna-soft px-1.5 py-px font-mono text-[9.5px] text-luna-ink">EDGE</span>
      </div>
      <div className="flex items-end justify-between gap-2">
        <div className="flex items-baseline gap-1">
          <Num value={ready / 1000} digits={1} className="font-mono text-[24px] leading-none font-medium tracking-[-0.03em] text-ink" />
          <span className="text-[11px] whitespace-nowrap text-muted">t ready · 7 d</span>
        </div>
        <ForecastSpark />
      </div>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full">
        {total.map((v, i) => (
          <div key={i} style={{ width: `${(v / sum) * 100}%`, background: colors[i] }} />
        ))}
      </div>
      <div className="flex items-center justify-between text-[10.5px] text-faint">
        <span className="font-mono whitespace-nowrap tabular" title="Images stay on the edge node; only plant state syncs">
          {formatNumber(images)} img · {formatNumber(rawGb)} GB<span className="hidden 2xl:inline"> on-site</span>
        </span>
        <span className="text-luna-ink opacity-0 transition group-hover:opacity-100">Open →</span>
      </div>
    </button>
  );
}

/** 14 tiny bars: tomato kg coming ready per day, from the cameras' last pass. Week two is lighter. */
function ForecastSpark() {
  const t = forecastTotals(useForecast(["G1", "G2"]));
  const max = Math.max(...t.days, 1);
  return (
    <div className="flex h-[22px] w-[64px] shrink-0 items-end gap-px" title={`Tomatoes, next 14 days: ${kgShort(t.week1 + t.week2)} (from camera ripeness)`} aria-label="14-day tomato forecast">
      {t.days.map((v, i) => (
        <span key={i} className="min-w-0 flex-1 rounded-t-[1.5px]" style={{ height: `${Math.max(8, (v / max) * 100)}%`, background: i < 7 ? "#e0703f" : "#f1b494" }} />
      ))}
    </div>
  );
}
