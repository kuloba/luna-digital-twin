import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import type { Group } from "three";
import { cn } from "@/lib/format";
import { statusColor } from "@/lib/theme";
import { pointAlong } from "@/sim/layout";
import { twin, useTwin } from "@/sim/store";
import type { Asset, SimState } from "@/sim/types";

/**
 * Spatial tags: status chips anchored to live assets. Density follows the
 * camera altitude — at site scale only what matters (alerts, machines doing
 * something notable), inside a zone everything that is active.
 */

const SITE_CURATED = ["HRV-01", "QA-02", "CAM-G1", "CAM-G2", "SEED-01", "TRK-2", "MIX-01", "EDGE-01", "C-02", "TANK-B"];

function pickTags(s: SimState, focus: string, selectedId?: string, hoveredId?: string, trace = false): string[] {
  const out = new Set<string>();
  for (const a of s.alerts) if (a.status !== "RESOLVED") out.add(a.assetId);
  if (selectedId) out.add(selectedId);
  if (hoveredId) out.add(hoveredId);
  // While a batch route is drawn, its stage pins carry the story — keep
  // only alerts and the selection so nothing sits on top of the route.
  if (trace && focus === "SITE") return [...out].filter((id) => s.assets[id]);
  if (focus === "SITE") {
    SITE_CURATED.forEach((id) => out.add(id));
    let n = 0;
    for (const r of Object.values(s.amrs)) {
      if (r.state === "TRANSPORTING" && n < 3 && s.assets[r.id].metrics.payload!.value > 0) {
        out.add(r.id);
        n++;
      }
    }
  } else {
    // Inside a zone: its machines, a few towers mid-irrigation and at most two
    // loaded robots. Routine motion is visible in 3D; tags are for what you'd
    // click next, so the budget stays small enough to read at a glance.
    let towers = 0;
    let robots = 0;
    for (const a of Object.values(s.assets)) {
      if (a.zoneId !== focus) continue;
      if (a.kind === "ROW" || a.kind === "ROOM" || a.kind === "COMPARTMENT") continue;
      if (a.kind === "TOWER") {
        if (a.activity === "Irrigating" && towers < 3) {
          out.add(a.id);
          towers++;
        }
        continue;
      }
      if (a.kind === "AMR") {
        const r = s.amrs[a.id];
        if (r?.state === "TRANSPORTING" && (a.metrics.payload?.value ?? 0) > 0 && robots < 2) {
          out.add(a.id);
          robots++;
        }
        continue;
      }
      out.add(a.id);
    }
  }
  return [...out].filter((id) => s.assets[id]);
}

export function SpatialTags() {
  const on = useTwin((s) => s.layers.labels);
  const focus = useTwin((s) => s.focus);
  const selectedId = useTwin((s) => s.selectedId);
  const hoveredId = useTwin((s) => s.hoveredId);
  const trace = useTwin((s) => s.layers.trace);
  const tick = useTwin((s) => Math.floor(s.sim.tick / 3));
  const ids = useMemo(() => {
    void tick;
    return pickTags(twin().sim, focus, selectedId, hoveredId, trace);
  }, [focus, selectedId, hoveredId, trace, tick]);
  if (!on) return null;
  return (
    <group>
      {ids.map((id) => (
        <Tag key={id} id={id} />
      ))}
    </group>
  );
}

function anchor(a: Asset): [number, number, number] {
  const top = a.position[1] + a.size[1];
  // Rooms float well above their towers so the room chip never sits on a tower chip.
  if (a.kind === "ROOM" || a.kind === "COMPARTMENT") return [a.position[0], top + 2.4, a.position[2]];
  if (a.kind === "COLD_ROOM") return [a.position[0], top + 0.6, a.position[2]];
  if (a.kind === "CAMERA") return [a.position[0], 5.2, a.position[2] - 8];
  if (a.kind === "ROW") return [a.position[0], 4.1, a.position[2] - 9];
  if (a.kind === "TRUCK") return [a.position[0], 4.4, a.position[2] + 1];
  return [a.position[0], top + 0.45, a.position[2]];
}

function Tag({ id }: { id: string }) {
  const group = useRef<Group>(null);
  const status = useTwin((s) => s.sim.assets[id]?.status ?? "IDLE");
  const activity = useTwin((s) => s.sim.assets[id]?.activity ?? "");
  const kind = useTwin((s) => s.sim.assets[id]?.kind);
  const alert = useTwin((s) => s.sim.alerts.find((al) => al.assetId === id && al.status !== "RESOLVED"));
  const selected = useTwin((s) => s.selectedId === id);
  const truckOut = kind === "TRUCK" && activity.startsWith("Sealed");

  useFrame(() => {
    const st = twin();
    const a = st.sim.assets[id];
    if (!a || !group.current) return;
    if (a.kind === "AMR") {
      const r = st.sim.amrs[id];
      let x = r.at[0];
      let z = r.at[1];
      if (r.mission) {
        const extra = Math.min(1.2, (Date.now() - st.sim.lastTickAt) / 1000) * r.speed;
        const p = pointAlong(r.mission.path, Math.min(r.mission.length, r.travelled + extra));
        x = p.x;
        z = p.z;
      }
      group.current.position.set(x, 1.5, z);
    } else {
      const p = anchor(a);
      group.current.position.set(p[0], p[1], p[2]);
    }
  });

  if (truckOut) return null;
  const tone = alert ? (alert.status === "RESOLVING" ? "resolving" : alert.severity === "CRITICAL" ? "critical" : "warning") : "normal";
  const dot = alert ? (alert.status === "RESOLVING" ? "#3f7fd6" : alert.severity === "CRITICAL" ? "#dc4a3d" : "#e59b1a") : statusColor[status];
  return (
    <group ref={group}>
      <Html center zIndexRange={[30, 10]} style={{ pointerEvents: "none" }}>
        <button
          type="button"
          onClick={() => twin().select(id)}
          onMouseEnter={() => twin().hover(id)}
          onMouseLeave={() => twin().hover(undefined)}
          className={cn(
            "spatial-tag pointer-events-auto -translate-y-1/2",
            tone === "critical" && "spatial-tag--critical",
            tone === "warning" && "spatial-tag--warning",
            tone === "resolving" && "spatial-tag--resolving",
            selected && "spatial-tag--selected",
          )}
        >
          <span className={cn("spatial-tag__dot", (alert || status === "ACTIVE") && "spatial-tag__dot--live")} style={{ background: dot }} />
          <span className="spatial-tag__id">{id}</span>
          <span className="spatial-tag__activity">{alert && alert.status === "OPEN" ? shortAlert(alert.title) : activity}</span>
        </button>
      </Html>
    </group>
  );
}

function shortAlert(title: string) {
  const t = title.split(" — ")[0];
  return t.replace(/^Grow Room V2 |^Tower B-04 root-zone |^Cold Room 2 at /, "");
}
