import { AnimatePresence, motion } from "motion/react";
import { Check, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/format";
import { twin, useTwin } from "@/sim/store";
import type { Alert } from "@/sim/types";
import { askLuna } from "./luna-chat";
import { EntityChip } from "./RichText";
import { clockNow } from "@/lib/clock";

/**
 * Transient notifications when Luna raises an alert or verifies a fix.
 * They sit over the 3D view, under the KPI strip, and never block it.
 */

interface Toast {
  id: string;
  kind: "alert" | "verified";
  alert: Alert;
  at: number;
}

const LIFETIME = 9000;

export function Toasts() {
  const alerts = useTwin((s) => s.sim.alerts);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seen = useRef(new Map<string, string>());
  const mountedAt = useRef(clockNow());

  useEffect(() => {
    const fresh: Toast[] = [];
    for (const a of alerts) {
      const prev = seen.current.get(a.id);
      if (prev === a.status) continue;
      seen.current.set(a.id, a.status);
      if (!prev && a.status === "OPEN" && a.createdAt > mountedAt.current + 2500) fresh.push({ id: `${a.id}-open`, kind: "alert", alert: a, at: clockNow() });
      if (prev && prev !== "RESOLVED" && a.status === "RESOLVED") fresh.push({ id: `${a.id}-ok`, kind: "verified", alert: a, at: clockNow() });
    }
    if (fresh.length) setToasts((t) => [...fresh, ...t].slice(0, 3));
  }, [alerts]);

  useEffect(() => {
    if (!toasts.length) return;
    const t = setInterval(() => setToasts((ts) => ts.filter((x) => clockNow() - x.at < LIFETIME)), 500);
    return () => clearInterval(t);
  }, [toasts.length]);

  // During the guided demo the card tells the story: show one toast at a
  // time, and only a verification or news about what is on screen.
  const touring = useTwin((s) => s.tour.active);
  const selectedId = useTwin((s) => s.selectedId);
  const shown = touring ? toasts.filter((t) => t.kind === "verified" || t.alert.assetId === selectedId).slice(0, 1) : toasts;
  const dismiss = (id: string) => setToasts((ts) => ts.filter((x) => x.id !== id));

  return (
    <div className="pointer-events-none absolute top-[206px] right-[392px] z-30 2xl:right-[424px] flex w-[340px] flex-col gap-2">
      <AnimatePresence initial={false}>
        {shown.map((t) => (
          <motion.div key={t.id} layout initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 24 }} transition={{ duration: 0.22 }} data-hud className="pointer-events-auto">
            <ToastCard t={t} onClose={() => dismiss(t.id)} />
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastCard({ t, onClose }: { t: Toast; onClose: () => void }) {
  const a = t.alert;
  const verified = t.kind === "verified";
  const color = verified ? "#2f9e5b" : a.severity === "CRITICAL" ? "#dc4a3d" : "#e59b1a";
  return (
    <div className="relative overflow-hidden rounded-[14px] bg-white/97 py-2.5 pr-2.5 pl-3.5 shadow-[0_0_0_1px_rgb(15_27_42/0.08),0_12px_28px_-8px_rgb(15_27_42/0.3)]">
      <span className="absolute inset-y-0 left-0 w-1" style={{ background: color }} />
      <div className="flex items-start gap-2">
        {verified ? (
          <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full bg-ok text-white">
            <Check className="size-2.5" strokeWidth={3} />
          </span>
        ) : (
          <span className="relative mt-1 flex size-2.5 shrink-0">
            <span className="absolute inset-0 animate-ping rounded-full opacity-60" style={{ background: color }} />
            <span className="relative size-2.5 rounded-full" style={{ background: color }} />
          </span>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-[10.5px] font-semibold tracking-[0.06em] uppercase" style={{ color }}>
            {verified ? "Fix verified" : a.severity === "CRITICAL" ? "Critical · Luna" : "Heads-up · Luna"}
          </div>
          <div className="mt-0.5 text-[12.5px] leading-snug font-medium text-ink">{verified ? a.recommendation.title : a.title}</div>
          {verified ? <div className="mt-0.5 line-clamp-2 text-[11.5px] leading-[1.45] text-muted">{a.verification}</div> : null}
          <div className="mt-2 flex items-center gap-1.5">
            <EntityChip id={a.assetId} size="sm" />
            {!verified ? (
              <>
                <button type="button" onClick={() => (twin().select(a.assetId, { fly: true }), onClose())} className="ml-auto h-6 rounded-[7px] px-2 text-[11px] font-medium text-ink-2 ring-1 ring-line-2 ring-inset hover:bg-[#f6f8fa]">
                  View
                </button>
                <button type="button" onClick={() => (askLuna(`Why is ${a.assetId} flagged?`), onClose())} className={cn("h-6 rounded-[7px] bg-ink px-2 text-[11px] font-medium text-white hover:bg-[#1e2b3c]")}>
                  Ask Luna
                </button>
              </>
            ) : null}
          </div>
        </div>
        <button type="button" onClick={onClose} aria-label="Dismiss" className="flex size-6 shrink-0 items-center justify-center rounded-[7px] text-faint hover:bg-[#f1f4f7] hover:text-ink">
          <X className="size-3.5" />
        </button>
      </div>
      <motion.span className="absolute bottom-0 left-0 h-[2px]" style={{ background: color, opacity: 0.4 }} initial={{ width: "100%" }} animate={{ width: "0%" }} transition={{ duration: LIFETIME / 1000, ease: "linear" }} />
    </div>
  );
}
