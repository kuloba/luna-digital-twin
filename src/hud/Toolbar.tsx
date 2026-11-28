import { AnimatePresence, motion } from "motion/react";
import { Keyboard, Layers, Maximize2, RotateCcw, Route, ScanEye, Tag, Thermometer, Waypoints } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn, formatNumber } from "@/lib/format";
import { HEAT_INFO } from "@/scene/Overlays";
import { CUCUMBER_STAGES, RIPENESS_STAGES } from "@/sim/cv";
import { useTwin, type CvLens, type HeatLayer } from "@/sim/store";
import { Kbd } from "./ui";

/**
 * Left toolbar: map layers (labels, climate heat map, material flows, batch
 * trace) and the crop-vision lens for the glasshouse, plus their legends.
 */

const HEAT_RAMP = "linear-gradient(90deg,#3b82c4,#4fb3a9,#5fbf6a,#b7cf4a,#e8b23a,#e2683a,#d43d33)";

const LENSES: { key: CvLens; label: string; hint: string }[] = [
  { key: "ripeness", label: "Ripeness", hint: "Every truss coloured by what the camera saw" },
  { key: "yield", label: "Yield", hint: "kg/m² ready to pick in the next 7 days" },
  { key: "pests", label: "Pests", hint: "Hotspots flagged by PestScout" },
  { key: "growth", label: "Growth", hint: "Head height vs. the 3.15 m target" },
];

export function Toolbar() {
  const layers = useTwin((s) => s.layers);
  const setLayer = useTwin((s) => s.setLayer);
  const flyToZone = useTwin((s) => s.flyToZone);
  const reset = useTwin((s) => s.reset);
  const [open, setOpen] = useState<"heat" | "lens" | "keys" | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  return (
    <div ref={ref} data-tour="toolbar" className="pointer-events-auto absolute top-[216px] left-4 z-20 flex items-start gap-2 [@media(max-height:780px)]:top-[196px]">
      <div className="flex flex-col gap-0.5 p-1 panel">
        <ToolButton title="Labels (L)" active={layers.labels} onClick={() => setLayer("labels", !layers.labels)}>
          <Tag className="size-4" />
        </ToolButton>
        <ToolButton title="Climate heat map (H)" active={!!layers.heat || open === "heat"} onClick={() => setOpen(open === "heat" ? null : "heat")}>
          <Thermometer className="size-4" />
        </ToolButton>
        <ToolButton title="Crop vision lens (V)" active={open === "lens"} onClick={() => setOpen(open === "lens" ? null : "lens")}>
          <ScanEye className="size-4" />
        </ToolButton>
        <ToolButton title="Material flows (F)" active={layers.flows} onClick={() => setLayer("flows", !layers.flows)}>
          <Waypoints className="size-4" />
        </ToolButton>
        <ToolButton title="Trace selected batch (T)" active={layers.trace} onClick={() => setLayer("trace", !layers.trace)}>
          <Route className="size-4" />
        </ToolButton>
        <div className="mx-2 my-1 h-px bg-line" />
        <ToolButton title="Whole campus (0)" onClick={() => flyToZone("SITE")}>
          <Maximize2 className="size-4" />
        </ToolButton>
        <ToolButton title="Keyboard shortcuts (?)" active={open === "keys"} onClick={() => setOpen(open === "keys" ? null : "keys")}>
          <Keyboard className="size-4" />
        </ToolButton>
        <ToolButton title="Restart the simulation" onClick={reset}>
          <RotateCcw className="size-4" />
        </ToolButton>
      </div>
      <AnimatePresence>
        {open ? (
          <motion.div key={open} initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -6 }} transition={{ duration: 0.14 }} className="w-[244px] p-2 panel">
            {open === "heat" ? <HeatMenu /> : open === "lens" ? <LensMenu /> : <KeysMenu />}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ToolButton({ title, active, onClick, children }: { title: string; active?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={active}
      onClick={onClick}
      className={cn("flex size-9 items-center justify-center rounded-[10px] [@media(max-height:780px)]:size-8 text-ink-2 transition-colors hover:bg-[#f1f4f7]", active && "bg-luna-soft text-luna-ink ring-1 ring-[#f8dcb0] ring-inset hover:bg-luna-soft")}
    >
      {children}
    </button>
  );
}

function HeatMenu() {
  const heat = useTwin((s) => s.layers.heat);
  const setLayer = useTwin((s) => s.setLayer);
  const opts: Exclude<HeatLayer, null>[] = ["vpd", "temp", "rh", "co2", "ppfd"];
  return (
    <div>
      <div className="px-1.5 pt-0.5 pb-1.5 text-[11px] font-semibold text-ink">Climate heat map</div>
      <div className="grid grid-cols-3 gap-1">
        {opts.map((k) => (
          <button key={k} type="button" onClick={() => setLayer("heat", heat === k ? null : k)} className={cn("h-7 rounded-[8px] text-[11.5px] font-medium ring-1 ring-inset", heat === k ? "bg-ink text-white ring-ink" : "bg-panel-2 text-ink-2 ring-line hover:ring-line-2")}>
            {HEAT_INFO[k].label}
          </button>
        ))}
        <button type="button" onClick={() => setLayer("heat", null)} className={cn("h-7 rounded-[8px] text-[11.5px] font-medium ring-1 ring-inset", !heat ? "bg-ink text-white ring-ink" : "bg-panel-2 text-ink-2 ring-line hover:ring-line-2")}>
          Off
        </button>
      </div>
      <p className="mt-2 px-1.5 text-[10.5px] leading-[1.45] text-muted">Interpolated from 1,284 sensors across rooms, compartments and cold storage.</p>
    </div>
  );
}

function LensMenu() {
  const lens = useTwin((s) => s.cvLens);
  const setLens = useTwin((s) => s.setCvLens);
  const flyToZone = useTwin((s) => s.flyToZone);
  const focus = useTwin((s) => s.focus);
  return (
    <div>
      <div className="flex items-center px-1.5 pt-0.5 pb-1.5">
        <span className="text-[11px] font-semibold text-ink">Crop vision lens</span>
        {focus !== "GH" ? (
          <button type="button" onClick={() => flyToZone("GH")} className="ml-auto text-[11px] font-medium text-luna-ink hover:underline">
            Go to glasshouse →
          </button>
        ) : null}
      </div>
      <div className="flex flex-col gap-0.5">
        {LENSES.map((l) => (
          <button key={l.key} type="button" onClick={() => setLens(l.key)} className={cn("flex flex-col rounded-[9px] px-2 py-1.5 text-left", lens === l.key ? "bg-luna-soft ring-1 ring-[#f8dcb0] ring-inset" : "hover:bg-[#f3f6f8]")}>
            <span className="text-[12px] font-medium text-ink">{l.label}</span>
            <span className="text-[10.5px] leading-tight text-muted">{l.hint}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function KeysMenu() {
  const rows: [string, string][] = [
    ["1 – 9", "Fly to a zone"],
    ["0", "Whole campus"],
    ["+  −", "Zoom in / out"],
    ["⌘ K  /", "Search anything"],
    ["L", "Toggle labels"],
    ["H", "Cycle heat map"],
    ["V", "Cycle crop lens"],
    ["F", "Material flows"],
    ["T", "Trace batch"],
    ["A", "Ask Luna"],
    ["Esc", "Close / deselect"],
  ];
  return (
    <div>
      <div className="px-1.5 pt-0.5 pb-1.5 text-[11px] font-semibold text-ink">Keyboard</div>
      {rows.map(([k, v]) => (
        <div key={k} className="flex items-center justify-between px-1.5 py-1 text-[11.5px] text-muted">
          {v}
          <span className="flex gap-0.5">
            {k.split("  ").map((p) => (
              <Kbd key={p}>{p}</Kbd>
            ))}
          </span>
        </div>
      ))}
      <div className="mt-1 border-t border-line px-1.5 pt-1.5 text-[10.5px] leading-[1.45] text-faint">Drag to pan · right-drag to orbit · scroll to zoom</div>
    </div>
  );
}

/** Legends for whatever map layer is on — bottom-left, above the batch tracker. */
export function Legends() {
  const heat = useTwin((s) => s.layers.heat);
  const lens = useTwin((s) => s.cvLens);
  const focus = useTwin((s) => s.focus);
  const selectedKind = useTwin((s) => (s.selectedId ? s.sim.assets[s.selectedId]?.kind : undefined));
  const showLens = focus === "GH" || selectedKind === "ROW" || selectedKind === "COMPARTMENT";
  if (!heat && !showLens) return null;
  return (
    <div className="pointer-events-auto absolute bottom-[224px] left-4 z-20 flex flex-col gap-2 [@media(max-height:940px)]:left-[72px]">
      {showLens ? <LensLegend lens={lens} /> : null}
      {heat ? (
        <div className="w-[260px] px-3 py-2.5 panel">
          <div className="flex items-center gap-1.5 text-[11px] font-semibold text-ink">
            <Layers className="size-3.5 text-muted" /> {HEAT_INFO[heat].label} <span className="font-normal text-faint">· {HEAT_INFO[heat].unit}</span>
          </div>
          <div className="mt-2 h-2 rounded-full" style={{ background: HEAT_RAMP }} />
          <div className="mt-1 flex justify-between font-mono text-[9.5px] text-faint">
            <span>{formatNumber(HEAT_INFO[heat].range[0], heat === "vpd" ? 1 : 0)}</span>
            <span>{formatNumber((HEAT_INFO[heat].range[0] + HEAT_INFO[heat].range[1]) / 2, heat === "vpd" ? 1 : 0)}</span>
            <span>{formatNumber(HEAT_INFO[heat].range[1], heat === "vpd" ? 1 : 0)}</span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function LensLegend({ lens }: { lens: CvLens }) {
  const setLens = useTwin((s) => s.setCvLens);
  return (
    <div data-tour="lens" className="w-[300px] px-3 py-2.5 panel">
      <div className="flex items-center gap-1.5">
        <ScanEye className="size-3.5 text-luna-ink" />
        <span className="text-[11px] font-semibold text-ink">Crop vision</span>
        <div className="ml-auto inline-flex rounded-[8px] bg-[#eef1f4] p-0.5">
          {LENSES.map((l) => (
            <button key={l.key} type="button" onClick={() => setLens(l.key)} className={cn("h-5 rounded-[6px] px-1.5 text-[10.5px] font-medium", lens === l.key ? "bg-white text-ink shadow-[0_0_0_1px_rgb(15_27_42/0.08)]" : "text-muted hover:text-ink")}>
              {l.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-2">
        {lens === "ripeness" ? (
          <>
            <div className="flex gap-0.5">
              {RIPENESS_STAGES.map((s) => (
                <div key={s.label} className="flex flex-1 flex-col gap-1">
                  <span className="h-2 rounded-[3px]" style={{ background: s.color }} />
                  <span className="truncate text-[9.5px] text-muted">{s.label}</span>
                </div>
              ))}
            </div>
            <div className="mt-1.5 flex gap-0.5">
              {CUCUMBER_STAGES.slice(0, 5).map((s) => (
                <span key={s.label} className="h-1 flex-1 rounded-full" style={{ background: s.color }} />
              ))}
            </div>
            <div className="mt-0.5 text-[9.5px] text-faint">G3 cucumbers: set → pick size</div>
          </>
        ) : lens === "yield" ? (
          <>
            <div className="h-2 rounded-full" style={{ background: "linear-gradient(90deg,#e8eef4,#1f8a4c)" }} />
            <div className="mt-1 flex justify-between font-mono text-[9.5px] text-faint">
              <span>0.5 kg/m²</span>
              <span>ready in 7 d</span>
              <span>1.7 kg/m²</span>
            </div>
          </>
        ) : lens === "pests" ? (
          <div className="flex gap-3 text-[10.5px] text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[#e59b1a]" /> Whitefly / mildew
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[#dc4a3d]" /> Botrytis
            </span>
          </div>
        ) : (
          <div className="flex gap-3 text-[10.5px] text-muted">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[#5b8fd6]" /> Behind
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[#3f9a56]" /> On target
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-full bg-[#d9a43c]" /> Stretched
            </span>
          </div>
        )}
      </div>
      <div className="mt-2 border-t border-line pt-1.5 text-[10px] leading-[1.4] text-faint">Rendered from plant state synced by the edge node — no photos are streamed.</div>
    </div>
  );
}
