import { useMemo } from "react";
import { clockNow } from "@/lib/clock";
import { cn, formatKg, formatNumber } from "@/lib/format";
import { compartmentForecast, FORECAST_DAYS, type HarvestForecast } from "@/sim/cv";
import { twin, useTwin } from "@/sim/store";

/**
 * 14-day harvest forecast, built only from the ripeness the cameras saw on
 * their last pass. It turns crop vision into the two numbers a grower plans
 * around: kilos coming ready each day, and the picker-hours to bring them in.
 */

export const PICK_RATE_KG_H = 140;

export const FORECAST_COLORS: Record<string, string> = { G1: "#cf3f2b", G2: "#ee8a5e", G3: "#5c9a40" };

export interface ForecastSeries {
  id: string;
  crop: "TOMATO" | "CUCUMBER";
  fc: HarvestForecast;
}

/** Recomputed every 10 s of sim time: the cameras refresh rows continuously, the plan doesn't need to. */
export function useForecast(ids: string[]): ForecastSeries[] {
  const tick = useTwin((s) => Math.floor(s.sim.tick / 10));
  const key = ids.join(",");
  return useMemo(() => {
    void tick;
    const cv = twin().sim.cv;
    return key.split(",").map((id) => ({ id, crop: cv[id].crop, fc: compartmentForecast(cv[id]) }));
  }, [tick, key]);
}

export function dayLabel(i: number, style: "short" | "long" = "short") {
  const d = new Date(clockNow() + (i + 1) * 86_400_000);
  return style === "short" ? d.toLocaleDateString("en-US", { weekday: "narrow" }) : d.toLocaleDateString("en-US", { weekday: "short", day: "numeric", month: "short" });
}

const isWeekend = (i: number) => {
  const wd = new Date(clockNow() + (i + 1) * 86_400_000).getDay();
  return wd === 0 || wd === 6;
};

export function forecastTotals(series: ForecastSeries[]) {
  const days = Array.from({ length: FORECAST_DAYS }, (_, i) => series.reduce((n, s) => n + s.fc.days[i], 0));
  const now = series.reduce((n, s) => n + s.fc.readyNowKg, 0);
  const week1 = days.slice(0, 7).reduce((a, b) => a + b, 0);
  const week2 = days.slice(7).reduce((a, b) => a + b, 0);
  let peak = 0;
  days.forEach((v, i) => {
    if (v > days[peak]) peak = i;
  });
  return { days, now, week1, week2, peak, peakKg: days[peak] };
}

/** Stacked daily bars, one colour per compartment, with a weekday axis. */
export function ForecastChart({ series, height = 78, axis = true, className }: { series: ForecastSeries[]; height?: number; axis?: boolean; className?: string }) {
  const { days } = forecastTotals(series);
  const max = Math.max(...days, 1);
  // Bottom-up stacking: first series sits on the axis.
  const stack = [...series].reverse();
  return (
    <div className={cn("flex min-w-0 flex-col gap-1", className)}>
      <div className={cn("flex items-end gap-[3px]", !height && "min-h-0 flex-1")} style={height ? { height } : undefined}>
        {days.map((total, i) => (
          <div
            key={i}
            title={`${dayLabel(i, "long")} · ${formatKg(total)} · ${formatNumber(total / PICK_RATE_KG_H, 1)} picker-h${series.length > 1 ? `\n${series.map((s) => `${s.id} ${formatKg(s.fc.days[i])}`).join(" · ")}` : ""}`}
            className={cn("group flex h-full min-w-0 flex-1 flex-col justify-end rounded-[3px]", isWeekend(i) && "bg-[#eef1f4]")}
          >
            {stack.map((s, k) => (
              <span
                key={s.id}
                className={cn("block w-full transition-[height] duration-500 group-hover:brightness-110", k === 0 && "rounded-t-[3px]")}
                style={{ height: `${(s.fc.days[i] / max) * 100}%`, background: FORECAST_COLORS[s.id] ?? "#7fb48c" }}
              />
            ))}
          </div>
        ))}
      </div>
      {axis ? (
        <div className="flex gap-[3px] font-mono text-[9px] leading-none text-faint">
          {days.map((_, i) => (
            <span key={i} className={cn("min-w-0 flex-1 text-center", i === 0 && "text-ink-2")}>
              {dayLabel(i)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Compact kilos for tight columns: "640 kg", "1.99 t". */
export const kgShort = (kg: number) => (kg >= 1000 ? `${formatNumber(kg / 1000, kg >= 10_000 ? 1 : 2)} t` : `${formatNumber(kg)} kg`);

/** Glasshouse-wide forecast for the zone table: per-compartment totals beside the stacked chart. */
export function ForecastPanel() {
  const series = useForecast(["G1", "G2", "G3"]);
  const t = forecastTotals(series);
  const cols = "grid grid-cols-[minmax(0,1fr)_52px_52px_52px] items-center gap-1.5";
  return (
    <div className="grid h-full min-w-0 grid-cols-[minmax(0,236px)_minmax(0,1fr)] gap-4 px-3 pt-2 pb-2">
      <div className="flex min-w-0 flex-col text-[11px]">
        <div className={cn(cols, "pb-1 text-[9.5px] font-medium tracking-[0.06em] text-faint uppercase")}>
          <span>Space</span>
          <span className="text-right">Now</span>
          <span className="text-right">Wk 1</span>
          <span className="text-right">Wk 2</span>
        </div>
        {series.map((s) => (
          <button key={s.id} type="button" onClick={() => twin().select(s.id, { fly: true })} className={cn(cols, "border-t border-line py-[5px] text-left hover:bg-[#f6f8fa]")}>
            <span className="flex min-w-0 items-center gap-1.5">
              <span className="size-2 shrink-0 rounded-[2px]" style={{ background: FORECAST_COLORS[s.id] }} />
              <span className="font-mono font-medium text-ink">{s.id}</span>
              <span className="truncate text-[10.5px] text-faint">{s.crop === "TOMATO" ? "tomato" : "cucumber"}</span>
            </span>
            <span className="text-right font-mono whitespace-nowrap text-ink-2 tabular">{kgShort(s.fc.readyNowKg)}</span>
            <span className="text-right font-mono whitespace-nowrap text-ink-2 tabular">{kgShort(s.fc.days.slice(0, 7).reduce((a, b) => a + b, 0))}</span>
            <span className="text-right font-mono whitespace-nowrap text-ink-2 tabular">{kgShort(s.fc.days.slice(7).reduce((a, b) => a + b, 0))}</span>
          </button>
        ))}
        <div className={cn(cols, "border-t border-line py-[5px] font-medium")}>
          <span className="text-ink-2">Glasshouse</span>
          <span className="text-right font-mono whitespace-nowrap text-ink-2 tabular">{kgShort(t.now)}</span>
          <span className="text-right font-mono whitespace-nowrap text-ink-2 tabular">{kgShort(t.week1)}</span>
          <span className="text-right font-mono whitespace-nowrap text-ink-2 tabular">{kgShort(t.week2)}</span>
        </div>
      </div>
      <div className="flex min-w-0 flex-col gap-1.5">
        <div className="flex items-baseline justify-between gap-2 text-[10.5px] whitespace-nowrap text-muted">
          <span className="truncate">
            kg ripening to pick, per day <span className="text-faint">· from the last camera pass</span>
          </span>
          <span className="shrink-0">
            peak <span className="font-mono text-ink-2">{dayLabel(t.peak, "long")}</span> · {kgShort(t.peakKg)} · {formatNumber(t.peakKg / PICK_RATE_KG_H, 1)} picker-h
          </span>
        </div>
        <ForecastChart series={series} className="min-h-0 flex-1" height={0} />
      </div>
    </div>
  );
}

/** Single-compartment card for the inspector. */
export function CompartmentForecast({ compId }: { compId: string }) {
  const series = useForecast([compId]);
  const t = forecastTotals(series);
  const crew = t.week1 / 7 / PICK_RATE_KG_H;
  return (
    <div className="flex flex-col gap-2.5 rounded-[12px] bg-panel-2 p-3">
      <div className="grid grid-cols-3 gap-2 text-[10.5px] text-muted">
        <div>
          <div>Ready now</div>
          <div className="font-mono text-[13px] text-ink">{kgShort(t.now)}</div>
        </div>
        <div>
          <div>Next 14 days</div>
          <div className="font-mono text-[13px] text-ink">{kgShort(t.week1 + t.week2)}</div>
        </div>
        <div>
          <div>Picking</div>
          <div className="font-mono text-[13px] text-ink">
            {formatNumber(crew, 1)}
            <span className="text-[10.5px] text-muted"> picker-h/d</span>
          </div>
        </div>
      </div>
      <ForecastChart series={series} height={64} />
    </div>
  );
}
