import { useEffect, useState } from "react";
import { BatchTracker } from "@/hud/BatchTracker";
import { CommandSearch } from "@/hud/CommandSearch";
import { KpiStrip } from "@/hud/KpiStrip";
import { RightPanel } from "@/hud/RightPanel";
import { Toasts } from "@/hud/Toasts";
import { Legends, Toolbar } from "@/hud/Toolbar";
import { TopBar } from "@/hud/TopBar";
import { TimeScrubber } from "@/hud/TimeScrubber";
import { Tour } from "@/hud/Tour";
import { SceneLoader } from "@/hud/SceneLoader";
import { SmallScreen, useSmallScreen } from "@/hud/SmallScreen";
import { Welcome } from "@/hud/Welcome";
import { ZoneTable } from "@/hud/ZoneTable";
import { ZoomControls } from "@/hud/ZoomControls";
import { cameraNav } from "@/scene/navigation";
import { Scene } from "@/scene/Scene";
import { ZONES } from "@/sim/layout";
import { twin, useTwin, type CvLens, type HeatLayer } from "@/sim/store";

const HEAT_CYCLE: HeatLayer[] = [null, "vpd", "temp", "rh", "co2", "ppfd"];
const LENS_CYCLE: CvLens[] = ["ripeness", "yield", "pests", "growth"];

export function App() {
  const tick = useTwin((s) => s.tick);
  useEffect(() => {
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, [tick]);
  useShortcuts();
  const small = useSmallScreen();
  const [anyway, setAnyway] = useState(false);
  if (small && !anyway) return <SmallScreen onContinue={() => setAnyway(true)} />;
  return (
    <div className="relative h-full w-full bg-black">
      {/* The 3D canvas sits inside a black frame: the time bar below it is the frame's bottom edge. */}
      <div className="absolute inset-x-0 top-0 bottom-14 z-0 overflow-hidden rounded-b-[22px] bg-canvas">
        <Scene />
      </div>
      <div className="pointer-events-none absolute inset-0 z-10">
        <SceneLoader />
        <TopBar />
        <TimeScrubber />
        <KpiStrip />
        <Toolbar />
        <ZoomControls />
        <Legends />
        <RightPanel />
        <BatchTracker />
        <ZoneTable />
        <Toasts />
        <Tour />
        <Welcome />
      </div>
      <CommandSearch />
    </div>
  );
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
      const st = twin();
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        st.setSearchOpen(!st.searchOpen);
        return;
      }
      if (e.key === "Escape") {
        if (st.searchOpen) st.setSearchOpen(false);
        else if (typing) t?.blur();
        else if (st.tour.active) st.setTour({ active: false });
        else if (st.selectedId) st.select(undefined);
        return;
      }
      if (typing || e.metaKey || e.ctrlKey || e.altKey || st.searchOpen) return;
      if (e.key === "/") {
        e.preventDefault();
        st.setSearchOpen(true);
        return;
      }
      if (e.key === "0") return st.flyToZone("SITE");
      if (e.key === "+" || e.key === "=") return cameraNav.zoomStep?.(1);
      if (e.key === "-" || e.key === "_") return cameraNav.zoomStep?.(-1);
      const zone = ZONES.find((z) => z.hotkey === e.key);
      if (zone) return st.flyToZone(zone.id);
      switch (e.key.toLowerCase()) {
        case "l":
          st.setLayer("labels", !st.layers.labels);
          break;
        case "h":
          st.setLayer("heat", HEAT_CYCLE[(HEAT_CYCLE.indexOf(st.layers.heat) + 1) % HEAT_CYCLE.length]);
          break;
        case "v":
          st.setCvLens(LENS_CYCLE[(LENS_CYCLE.indexOf(st.cvLens) + 1) % LENS_CYCLE.length]);
          break;
        case "f":
          st.setLayer("flows", !st.layers.flows);
          break;
        case "t":
          st.setLayer("trace", !st.layers.trace);
          break;
        case "a":
          e.preventDefault();
          st.setRightPanel("luna");
          window.setTimeout(() => document.querySelector<HTMLInputElement>("[data-luna-input]")?.focus(), 220);
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
