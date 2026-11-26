import { Html } from "@react-three/drei";
import { useFrame, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef } from "react";
import { type Group, Vector3 } from "three";
import { cn } from "@/lib/format";
import { statusColor } from "@/lib/theme";
import { pointAlong } from "@/sim/layout";
import { twin, useTwin } from "@/sim/store";
import type { Asset, SimState } from "@/sim/types";
import { clockNow } from "@/lib/clock";

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
  useDeclutter(on);
  if (!on) return null;
  return (
    <group>
      {ids.map((id) => (
        <Tag key={id} id={id} />
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Screen-space declutter                                             */
/* ------------------------------------------------------------------ */

interface Placed {
  group: Group;
  el: HTMLElement;
  prio: number;
  w: number;
  h: number;
  dy: number;
  shown: boolean;
}

/** Every mounted tag registers here so one pass can lay them all out. */
const registry = new Map<string, Placed>();
const proj = new Vector3();
const GAP = 4;
// Chips only climb, so the leader line can always reach the anchor below.
const STEPS = [0, -1, -2, -3];

/**
 * Tags are laid out like map labels: highest priority first (selection,
 * hover, alerts), each nudged up or down a row if it would sit on a tag
 * already placed, and hidden if there is no room or it would sit under a
 * HUD panel. The previous offset is tried first so labels don't jump.
 */
function useDeclutter(on: boolean) {
  const { camera, size } = useThree();
  const frame = useRef(0);
  const hud = useRef<DOMRect[]>([]);
  useFrame(() => {
    if (!on) return;
    const n = frame.current++;
    if (n % 15 === 0) {
      hud.current = [...document.querySelectorAll<HTMLElement>(".panel, [data-hud]")].map((e) => e.getBoundingClientRect()).filter((r) => r.width > 0 && r.height > 0);
    }
    const items = [...registry.values()];
    if (n % 20 === 0) for (const it of items) {
      it.w = it.el.offsetWidth;
      it.h = it.el.offsetHeight;
    }
    const placed: [number, number, number, number][] = [];
    const hits = (x0: number, y0: number, x1: number, y1: number) => {
      for (const r of placed) if (x0 < r[2] && x1 > r[0] && y0 < r[3] && y1 > r[1]) return true;
      for (const r of hud.current) if (x0 < r.right + 2 && x1 > r.left - 2 && y0 < r.bottom + 2 && y1 > r.top - 2) return true;
      return false;
    };
    items.sort((a, b) => b.prio - a.prio);
    for (const it of items) {
      it.group.updateWorldMatrix(true, false);
      proj.setFromMatrixPosition(it.group.matrixWorld).project(camera);
      const sx = ((proj.x + 1) / 2) * size.width;
      const sy = ((1 - proj.y) / 2) * size.height;
      const w = it.w || 120;
      const h = it.h || 22;
      const behind = proj.z > 1 || sx < -w || sx > size.width + w || sy < -h || sy > size.height + h;
      let best: number | undefined;
      if (!behind) {
        const order = [it.dy, ...STEPS.map((k) => k * (h + GAP)).filter((d) => d !== it.dy)];
        for (const dy of order) {
          // The chip sits centred on x, its bottom edge on the anchor (plus the offset).
          const y1 = sy + dy;
          if (!hits(sx - w / 2 - GAP / 2, y1 - h - GAP / 2, sx + w / 2 + GAP / 2, y1 + GAP / 2)) {
            best = dy;
            break;
          }
        }
        // The selection always shows, even if it has to overlap.
        if (best === undefined && it.prio >= 4) best = it.dy;
      }
      const show = best !== undefined;
      if (show) {
        it.dy = best!;
        placed.push([sx - w / 2 - GAP / 2, sy + it.dy - h - GAP / 2, sx + w / 2 + GAP / 2, sy + it.dy + GAP / 2]);
      }
      if (show !== it.shown) {
        it.shown = show;
        // Fade in, but vanish at once: at low frame rates a fading chip would
        // still sit on top of the one that just took its place.
        it.el.style.transitionDuration = show ? "" : "0ms";
        it.el.style.opacity = show ? "1" : "0";
        it.el.style.pointerEvents = show ? "" : "none";
      }
      it.el.style.setProperty("--tag-dy", `${show ? it.dy : 0}px`);
    }
  });
}

/** A new label starts hidden; the next layout pass decides where (and whether) it shows. */
function hiddenEntry(group: Group, el: HTMLElement, prio: number): Placed {
  el.style.opacity = "0";
  el.style.pointerEvents = "none";
  return { group, el, prio, w: el.offsetWidth, h: el.offsetHeight, dy: 0, shown: false };
}

/**
 * Lets other screen labels (the batch-trace stage pins) take part in the
 * same layout. Put the group ref on an object at the anchor and the callback
 * on the label element; the element must honour `--tag-dy`.
 */
export function useLabelSlot(key: string, prio: number) {
  const group = useRef<Group>(null);
  const setEl = useCallback(
    (b: HTMLElement | null) => {
      if (b && group.current) registry.set(key, hiddenEntry(group.current, b, prio));
      else if (!b) registry.delete(key);
    },
    [key, prio],
  );
  useEffect(() => () => void registry.delete(key), [key]);
  return [group, setEl] as const;
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
  const hovered = useTwin((s) => s.hoveredId === id);
  const truckOut = kind === "TRUCK" && activity.startsWith("Sealed");
  const prio = selected ? 5 : hovered ? 4.5 : alert ? (alert.severity === "CRITICAL" ? 3.5 : 3) : kind === "ROOM" || kind === "COMPARTMENT" ? 2 : kind === "AMR" ? 0.5 : 1;
  const prioRef = useRef(prio);
  prioRef.current = prio;
  // <Html> mounts its content in its own root, so register from the
  // button's ref callback rather than an effect.
  const setEl = useCallback(
    (b: HTMLButtonElement | null) => {
      if (b && group.current) registry.set(id, hiddenEntry(group.current, b, prioRef.current));
      else if (!b) registry.delete(id);
    },
    [id],
  );
  useEffect(() => () => void registry.delete(id), [id]);
  useEffect(() => {
    const r = registry.get(id);
    if (r) r.prio = prio;
  }, [id, prio]);

  useFrame(() => {
    const st = twin();
    const a = st.sim.assets[id];
    if (!a || !group.current) return;
    if (a.kind === "AMR") {
      const r = st.sim.amrs[id];
      let x = r.at[0];
      let z = r.at[1];
      if (r.mission) {
        const extra = Math.min(1.2, (clockNow() - st.sim.lastTickAt) / 1000) * r.speed;
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
          ref={setEl}
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
          <span className="spatial-tag__activity">{alert && alert.status === "OPEN" ? shortAlert(alert.title, id) : activity}</span>
        </button>
      </Html>
    </group>
  );
}

function shortAlert(title: string, id: string) {
  const t = title.split(" — ")[0];
  return t.replace(/^Grow Room V2 |^Tower B-04 root-zone |^Cold Room 2 at /, "").replace(new RegExp(`^${id}\\s+`), "");
}
