import { Minus, Plus, Scan } from "lucide-react";
import type { ReactNode } from "react";
import { cameraNav } from "@/scene/navigation";
import { twin } from "@/sim/store";

/**
 * Zoom in / zoom out / fit, docked at the bottom-right of the 3D area, clear
 * of the right panel and the bottom panels at every layout size.
 */
export function ZoomControls() {
  return (
    <div className="pointer-events-auto absolute right-[388px] bottom-[236px] z-20 flex flex-col gap-0.5 p-1 panel 2xl:right-[420px]">
      <ZoomButton label="Zoom in" keys="+ or =" onClick={() => cameraNav.zoomStep?.(1)}>
        <Plus className="size-4" />
      </ZoomButton>
      <ZoomButton label="Zoom out" keys="−" onClick={() => cameraNav.zoomStep?.(-1)}>
        <Minus className="size-4" />
      </ZoomButton>
      <div className="mx-2 my-0.5 h-px bg-line" />
      <ZoomButton label="Fit view" keys="0 for the whole site" onClick={fitView}>
        <Scan className="size-4" />
      </ZoomButton>
    </div>
  );
}

/** Frame the zone in view, or the whole site when nothing narrower is in focus. */
export function fitView() {
  const st = twin();
  st.flyToZone(st.focus);
}

const HINT = "Trackpad: pinch to zoom, two-finger swipe to pan. Mouse: drag to pan, right-drag to rotate.";

function ZoomButton({ label, keys, onClick, children }: { label: string; keys: string; onClick: () => void; children: ReactNode }) {
  const title = `${label} (${keys})\n${HINT}`;
  return (
    <button type="button" title={title} aria-label={`${label} (${keys})`} onClick={onClick} className="flex size-9 items-center justify-center rounded-[10px] text-ink-2 transition-colors hover:bg-[#f1f4f7] active:bg-[#e8edf2] [@media(max-height:780px)]:size-8">
      {children}
    </button>
  );
}
