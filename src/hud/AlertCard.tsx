import { Check, ChevronDown } from "lucide-react";
import { useState } from "react";
import { cn, formatAgo } from "@/lib/format";
import { deviation, inBand } from "@/sim/metrics";
import { useTwin } from "@/sim/store";
import type { Alert, Metric } from "@/sim/types";
import { Indeterminate } from "./gauges";
import { askLuna } from "./luna-chat";
import { EntityChip } from "./RichText";
import { LunaMark, Num, Pill, Sparkline, type Tone } from "./ui";

/* ------------------------------------------------------------------ */
/* Alert card (brief, chat attachments, inspector)                    */
/* ------------------------------------------------------------------ */

export function AlertCard({ alert, compact }: { alert: Alert; compact?: boolean }) {
  const approveAlert = useTwin((s) => s.approveAlert);
  const metric = useTwin((s) => (alert.metricKey ? s.sim.assets[alert.assetId]?.metrics[alert.metricKey] : undefined));
  const [steps, setSteps] = useState(false);
  const r = alert.recommendation;
  const tone: Tone = alert.status === "RESOLVED" ? "ok" : alert.status === "RESOLVING" ? "info" : alert.severity === "CRITICAL" ? "crit" : "warn";
  const label = alert.status === "RESOLVED" ? "Verified" : alert.status === "RESOLVING" ? "Recovering" : alert.severity === "CRITICAL" ? "Critical" : "Warning";
  return (
    <div className={cn("rounded-[14px] bg-white p-3 ring-1 ring-inset", tone === "crit" ? "ring-[#f6c4bf]" : tone === "warn" ? "ring-[#f3d9a8]" : tone === "info" ? "ring-[#c7d9f3]" : "ring-[#bfe3cc]")}>
      <div className="flex items-center gap-2">
        <Pill tone={tone} dot>
          {label}
        </Pill>
        <EntityChip id={alert.assetId} size="sm" />
        <span className="ml-auto text-[10.5px] text-faint">{formatAgo(alert.createdAt)}</span>
      </div>
      <div className="mt-2 text-[13px] leading-snug font-semibold text-ink">{alert.title}</div>
      {!compact ? <p className="mt-1 text-[12px] leading-[1.5] text-muted">{alert.detail}</p> : null}
      {metric ? <LiveMetric metric={metric} /> : null}
      {alert.batchIds.length ? (
        <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px] text-faint">
          At risk
          {alert.batchIds.map((b) => (
            <EntityChip key={b} id={b} size="sm" />
          ))}
        </div>
      ) : null}
      {alert.status === "OPEN" ? (
        <div className="mt-3 rounded-[12px] bg-luna-soft/70 p-3 ring-1 ring-[#f8dcb0] ring-inset">
          <div className="flex items-center gap-1.5">
            <LunaMark className="h-3 w-3.5" />
            <span className="text-[10.5px] font-semibold tracking-[0.06em] text-luna-ink uppercase">Luna recommends</span>
            <span className="ml-auto font-mono text-[10px] text-luna-ink/80">{Math.round(r.confidence * 100)}% confidence</span>
          </div>
          <div className="mt-1.5 text-[13px] font-semibold text-ink">{r.title}</div>
          <p className="mt-1 text-[12px] leading-[1.5] text-ink-2">{r.rationale}</p>
          <button type="button" onClick={() => setSteps((v) => !v)} className="mt-1.5 flex items-center gap-1 text-[11px] font-medium text-luna-ink">
            {r.steps.length} steps <ChevronDown className={cn("size-3 transition-transform", steps && "rotate-180")} />
          </button>
          {steps ? (
            <ol className="mt-1.5 flex flex-col gap-1 text-[11.5px] leading-[1.45] text-ink-2">
              {r.steps.map((st, i) => (
                <li key={i} className="flex gap-2">
                  <span className="mt-px flex size-4 shrink-0 items-center justify-center rounded-full bg-white font-mono text-[9.5px] text-luna-ink ring-1 ring-[#f8dcb0]">{i + 1}</span>
                  {st}
                </li>
              ))}
            </ol>
          ) : null}
          <div className="mt-2 text-[11.5px] leading-[1.45] text-muted">
            <span className="font-medium text-ink-2">Expected · </span>
            {r.expected}
          </div>
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              data-tour="approve"
              onClick={() => approveAlert(alert.id)}
              className="flex h-8 shrink-0 items-center gap-1.5 rounded-[9px] bg-ink px-3 text-[12px] font-medium whitespace-nowrap text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.15),0_1px_2px_rgb(0_0_0/0.2)] transition hover:bg-[#1e2b3c]"
            >
              <Check className="size-3.5" /> Approve
            </button>
            {!compact ? (
              <button type="button" onClick={() => askLuna(`Why is ${alert.assetId} flagged?`)} className="flex h-8 shrink-0 items-center rounded-[9px] px-2.5 text-[12px] font-medium whitespace-nowrap text-ink-2 ring-1 ring-line-2 transition ring-inset hover:bg-white">
                Ask why
              </button>
            ) : null}
            <span className="ml-auto truncate text-[10.5px] text-faint">Owner · {r.owner}</span>
          </div>
        </div>
      ) : alert.status === "RESOLVING" ? (
        <div className="mt-3 rounded-[12px] bg-info-soft p-3">
          <div className="text-[12px] font-medium text-[#2459a6]">Applied · verifying recovery</div>
          <div className="mt-0.5 text-[11.5px] leading-[1.45] text-[#2459a6]/80">
            Approved by {alert.approvedBy?.split(" · ")[0] ?? "operator"}. {r.expected}
          </div>
          <Indeterminate className="mt-2" />
        </div>
      ) : (
        <div className="mt-3 flex items-start gap-2 rounded-[12px] bg-ok-soft p-3 text-[12px] leading-[1.45] text-[#1f7a43]">
          <Check className="mt-px size-3.5 shrink-0" />
          <span>{alert.verification ?? "Recovered and verified."}</span>
        </div>
      )}
    </div>
  );
}

function LiveMetric({ metric }: { metric: Metric }) {
  const ok = inBand(metric);
  const color = ok ? "#2f9e5b" : deviation(metric) > 0.35 ? "#dc4a3d" : "#d98a0b";
  return (
    <div className="mt-2.5 flex items-center gap-3 rounded-[10px] bg-panel-2 px-2.5 py-2">
      <div className="flex flex-col">
        <span className="text-[10.5px] text-muted">{metric.label} · live</span>
        <span className="flex items-baseline gap-1">
          <Num value={metric.value} digits={metric.precision} className="font-mono text-[17px] font-medium" />
          <span className="text-[10.5px] text-muted">{metric.unit}</span>
        </span>
      </div>
      <Sparkline data={metric.history.slice(-48)} band={[metric.low, metric.high]} color={color} width={150} height={30} fill={false} className="ml-auto" />
    </div>
  );
}
