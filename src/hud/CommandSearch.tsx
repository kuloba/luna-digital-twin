import { AnimatePresence, motion } from "motion/react";
import { Box, CornerDownLeft, Layers, MapPin, MessageCircle, Play, Search, Sprout } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/format";
import { cropColor, statusColor } from "@/lib/theme";
import { ZONES } from "@/sim/layout";
import { twin, useTwin } from "@/sim/store";
import { STAGES } from "@/sim/types";
import { askLuna } from "./luna-chat";
import { Kbd } from "./ui";

/**
 * ⌘K: one box for everything — batch IDs, towers, rows, sensors, robots,
 * zones, layers — and a fallback that hands the query to Luna.
 */

interface Item {
  key: string;
  group: "Batches" | "Assets" | "Zones" | "Actions";
  title: string;
  sub: string;
  icon: ReactNode;
  run: () => void;
  score: number;
}

export function CommandSearch() {
  const open = useTwin((s) => s.searchOpen);
  const setOpen = useTwin((s) => s.setSearchOpen);
  return (
    <AnimatePresence>
      {open ? (
        <motion.div key="search" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.12 }} className="pointer-events-auto fixed inset-0 z-50 bg-[#0f1b2a]/12 backdrop-blur-[2px]" onMouseDown={() => setOpen(false)}>
          <motion.div initial={{ opacity: 0, y: -8, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.98 }} transition={{ duration: 0.16 }} className="mx-auto mt-[84px] w-[min(640px,92vw)] overflow-hidden panel" onMouseDown={(e) => e.stopPropagation()}>
            <Palette onClose={() => setOpen(false)} />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}

const GROUPS = ["Batches", "Assets", "Zones", "Actions"] as const;

function Palette({ onClose }: { onClose: () => void }) {
  const [q, setQ] = useState("");
  const [cursor, setCursor] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => input.current?.focus(), []);
  const items = useMemo(() => search(q, onClose), [q, onClose]);
  useEffect(() => setCursor(0), [q]);
  const ordered = GROUPS.flatMap((g) => items.filter((i) => i.group === g));
  let flat = 0;
  return (
    <div
      onKeyDown={(e) => {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setCursor((c) => Math.min(ordered.length - 1, c + 1));
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          setCursor((c) => Math.max(0, c - 1));
        } else if (e.key === "Enter") {
          e.preventDefault();
          ordered[cursor]?.run();
        } else if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
    >
      <div className="flex items-center gap-3 border-b border-line px-4">
        <Search className="size-4 text-faint" />
        <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search batch IDs, towers, rows, sensors, AMRs… or ask Luna" className="h-13 flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-faint" />
        <Kbd>Esc</Kbd>
      </div>
      <div className="scroll-thin max-h-[420px] overflow-y-auto p-1.5">
        {items.length === 0 ? <div className="px-3 py-6 text-center text-[12.5px] text-muted">Nothing matches “{q}”.</div> : null}
        {GROUPS.map((g) => {
          const list = items.filter((i) => i.group === g);
          if (!list.length) return null;
          return (
            <div key={g} className="pb-1">
              <div className="px-2.5 pt-2 pb-1 text-[10px] font-medium tracking-[0.08em] text-faint uppercase">{g}</div>
              {list.map((it) => {
                const idx = flat++;
                return (
                  <button
                    key={it.key}
                    type="button"
                    onMouseEnter={() => setCursor(idx)}
                    onClick={it.run}
                    className={cn("flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2 text-left", idx === cursor ? "bg-[#f1f4f7]" : "")}
                  >
                    <span className="flex size-7 shrink-0 items-center justify-center rounded-[8px] bg-panel-2 text-ink-2 ring-1 ring-line ring-inset">{it.icon}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium text-ink">{it.title}</span>
                      <span className="block truncate text-[11px] text-muted">{it.sub}</span>
                    </span>
                    {idx === cursor ? <CornerDownLeft className="size-3.5 text-faint" /> : null}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-3 border-t border-line bg-panel-2 px-4 py-2 text-[10.5px] text-faint">
        <span className="flex items-center gap-1">
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> move
        </span>
        <span className="flex items-center gap-1">
          <Kbd>↵</Kbd> open
        </span>
        <span className="ml-auto">Results fly the camera to the asset</span>
      </div>
    </div>
  );
}

const KIND_WORDS: Record<string, string> = {
  TOWER: "grow tower vertical",
  ROW: "row glasshouse crop vision camera tomato",
  AMR: "robot amr fleet",
  TANK: "tank fertigation level",
  CAMERA: "camera rail vision",
  EDGE: "edge node inference bandwidth",
  QA: "quality qa grader",
  COLD_ROOM: "cold room storage",
  TRUCK: "truck reefer dispatch",
  HVAC: "hvac climate cooling",
  DOSING: "dosing nutrient ec ph",
  ROOM: "room climate vpd",
  COMPARTMENT: "compartment glasshouse tomato climate",
};

function score(q: string, id: string, text: string) {
  const ql = q.toLowerCase();
  const il = id.toLowerCase();
  if (il === ql) return 100;
  if (il.startsWith(ql)) return 80;
  if (il.includes(ql)) return 60;
  const tl = text.toLowerCase();
  if (tl.includes(ql)) return 40;
  const words = ql.split(/\s+/).filter(Boolean);
  if (words.length > 1 && words.every((w) => tl.includes(w) || il.includes(w))) return 30;
  return 0;
}

function search(q: string, close: () => void): Item[] {
  const st = twin();
  const s = st.sim;
  const out: Item[] = [];
  const query = q.trim();
  const go = (fn: () => void) => () => {
    fn();
    close();
  };
  if (!query) {
    for (const id of ["LET-1124", "TOM-1092"]) {
      const b = s.batches[id];
      out.push({ key: id, group: "Batches", title: `${b.id} · ${b.cropName} ${b.variety}`, sub: STAGES.find((x) => x.key === b.stage)!.label, icon: <Sprout className="size-3.5" style={{ color: cropColor[b.cropType].leaf }} />, run: go(() => st.selectBatch(id, { trace: true, fly: true })), score: 1 });
    }
    for (const id of ["V2", "G2-R04", "EDGE-01", "TANK-B", "AMR-08"]) {
      const a = s.assets[id];
      out.push({ key: id, group: "Assets", title: `${a.id} · ${a.name}`, sub: a.activity, icon: <Box className="size-3.5" style={{ color: statusColor[a.status] }} />, run: go(() => st.select(id, { fly: true })), score: 1 });
    }
    out.push({ key: "tour", group: "Actions", title: "Start the guided demo", sub: "Thirteen steps through the twin", icon: <Play className="size-3.5" />, run: go(() => st.setTour({ active: true, step: 0 })), score: 1 });
    out.push({ key: "heat", group: "Actions", title: "Show VPD heat map", sub: "Layer", icon: <Layers className="size-3.5" />, run: go(() => st.setLayer("heat", "vpd")), score: 1 });
    return out;
  }
  for (const b of Object.values(s.batches)) {
    const sc = score(query, b.id, `${b.cropName} ${b.variety} ${b.stage} ${b.order?.customer ?? ""} ${b.order?.id ?? ""}`);
    if (sc) out.push({ key: b.id, group: "Batches", title: `${b.id} · ${b.cropName} ${b.variety}`, sub: `${STAGES.find((x) => x.key === b.stage)!.label}${b.order ? ` · ${b.order.customer}` : ""}`, icon: <Sprout className="size-3.5" style={{ color: cropColor[b.cropType].leaf }} />, run: go(() => st.selectBatch(b.id, { trace: true, fly: true })), score: sc + 5 });
  }
  for (const a of Object.values(s.assets)) {
    const sc = score(query, a.id, `${a.name} ${a.activity} ${KIND_WORDS[a.kind] ?? a.kind.toLowerCase()} ${a.batchId ?? ""}`);
    if (sc) out.push({ key: a.id, group: "Assets", title: `${a.id} · ${a.name}`, sub: a.activity, icon: <Box className="size-3.5" style={{ color: statusColor[a.status] }} />, run: go(() => st.select(a.id, { fly: true })), score: sc });
  }
  const plant = query.toUpperCase().match(/^(G[1-3]-R\d{2})-P\d{2}$/);
  if (plant) {
    const comp = s.cv[plant[1].slice(0, 2)];
    if (comp?.plants[query.toUpperCase()]) out.push({ key: query, group: "Assets", title: `${query.toUpperCase()} · plant`, sub: "Computer-vision plant record", icon: <Sprout className="size-3.5" />, run: go(() => (st.selectPlant(query.toUpperCase(), plant[1]), st.flyToAsset(plant[1]))), score: 99 });
  }
  for (const z of ZONES) {
    const sc = score(query, z.short, `${z.name} ${z.id}`);
    if (sc) out.push({ key: z.id, group: "Zones", title: z.short, sub: z.name, icon: <MapPin className="size-3.5" />, run: go(() => st.flyToZone(z.id)), score: sc });
  }
  const sorted = out.sort((x, y) => y.score - x.score);
  const capped: Item[] = [];
  const counts: Record<string, number> = {};
  for (const it of sorted) {
    counts[it.group] = (counts[it.group] ?? 0) + 1;
    if (counts[it.group] <= (it.group === "Assets" ? 7 : 4)) capped.push(it);
  }
  capped.push({ key: "ask", group: "Actions", title: `Ask Luna: “${query}”`, sub: "Answers from the live twin", icon: <MessageCircle className="size-3.5" />, run: go(() => askLuna(query)), score: 0 });
  return capped;
}
