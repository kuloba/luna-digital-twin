import { Fragment, type ReactNode } from "react";
import { cn } from "@/lib/format";
import { cropColor, statusColor } from "@/lib/theme";
import { ZONE_BY_ID } from "@/sim/layout";
import { twin, useTwin } from "@/sim/store";
import type { ZoneId } from "@/sim/types";

/**
 * Luna's text format: `[[ID]]` becomes a chip that flies the camera to that
 * asset, batch or zone; `**bold**`, `*italic*`, newlines and `•` bullets.
 * `shown` reveals the text progressively for the typing effect without ever
 * splitting a chip in half.
 */

type Token = { t: "text"; v: string } | { t: "bold"; v: string } | { t: "em"; v: string } | { t: "chip"; v: string } | { t: "br" };

const INLINE = /(\[\[[^\]]+\]\]|\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g;

export function tokenize(text: string): Token[] {
  const out: Token[] = [];
  text.split("\n").forEach((line, li) => {
    if (li > 0) out.push({ t: "br" });
    for (const part of line.split(INLINE)) {
      if (!part) continue;
      if (part.startsWith("[[")) out.push({ t: "chip", v: part.slice(2, -2) });
      else if (part.startsWith("**")) out.push({ t: "bold", v: part.slice(2, -2) });
      else if (part.startsWith("*") && part.endsWith("*") && part.length > 2) out.push({ t: "em", v: part.slice(1, -1) });
      else out.push({ t: "text", v: part });
    }
  });
  return out;
}

const tokenLength = (k: Token) => (k.t === "br" ? 1 : k.v.length);

export function textLength(text: string) {
  return tokenize(text).reduce((n, k) => n + tokenLength(k), 0);
}

export function RichText({ text, shown, className, chipSize = "md" }: { text: string; shown?: number; className?: string; chipSize?: "sm" | "md" }) {
  const tokens = tokenize(text);
  let budget = shown ?? Number.POSITIVE_INFINITY;
  const nodes: ReactNode[] = [];
  for (let i = 0; i < tokens.length && budget > 0; i++) {
    const k = tokens[i];
    const len = tokenLength(k);
    if (k.t === "br") nodes.push(<br key={i} />);
    else if (k.t === "chip") nodes.push(<EntityChip key={i} id={k.v} size={chipSize} />);
    else {
      const v = len > budget ? k.v.slice(0, budget) : k.v;
      if (k.t === "bold") nodes.push(<strong key={i} className="font-semibold text-ink">{v}</strong>);
      else if (k.t === "em") nodes.push(<em key={i} className="italic">{v}</em>);
      else nodes.push(<Fragment key={i}>{v}</Fragment>);
    }
    budget -= len;
  }
  return <span className={cn("whitespace-pre-wrap", className)}>{nodes}</span>;
}

/** Clickable reference to anything in the twin. */
export function EntityChip({ id, size = "md", className }: { id: string; size?: "sm" | "md"; className?: string }) {
  const status = useTwin((s) => s.sim.assets[id]?.status);
  const crop = useTwin((s) => s.sim.batches[id]?.cropType);
  const alert = useTwin((s) => s.sim.alerts.some((a) => a.assetId === id && a.status === "OPEN"));
  const zone = ZONE_BY_ID[id as ZoneId];
  const dot = alert ? "#dc4a3d" : crop ? cropColor[crop].accent ?? cropColor[crop].leaf : status ? statusColor[status] : zone ? "#4f6d8f" : "#94a3b8";
  const onClick = () => {
    const st = twin();
    if (st.sim.batches[id]) st.selectBatch(id, { trace: true, fly: true });
    else if (st.sim.assets[id]) st.select(id, { fly: true });
    else if (zone) st.flyToZone(zone.id);
  };
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => twin().sim.assets[id] && twin().hover(id)}
      onMouseLeave={() => twin().hover(undefined)}
      className={cn(
        "mx-px inline-flex translate-y-[-1px] items-center gap-1 rounded-[6px] bg-[#f1f4f7] align-middle font-mono font-medium text-ink ring-1 ring-[#e1e7ed] transition ring-inset hover:bg-luna-soft hover:ring-[#f8dcb0]",
        size === "sm" ? "h-[17px] px-1 text-[10px]" : "h-[19px] px-1.5 text-[10.5px]",
        className,
      )}
    >
      <span className="size-1.5 shrink-0 rounded-full" style={{ background: dot }} />
      {id}
    </button>
  );
}
