import { Html, Line, QuadraticBezierLine } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef, useState } from "react";
import { CanvasTexture, type Group, type Mesh, type MeshBasicMaterial, SRGBColorSpace, Vector3 } from "three";
import { formatDayTime, formatNumber } from "@/lib/format";
import { C, severityColor } from "@/lib/theme";
import { CUCUMBER_STAGES, edgeRates, RIPENESS_STAGES, stageIndex } from "@/sim/cv";
import { COLD_ROOMS, COMPARTMENTS, STATIONS, ZONE_BY_ID, corridorPath, pointAlong } from "@/sim/layout";
import { twin, useTwin, type HeatLayer } from "@/sim/store";
import { STAGES, type Asset, type SimState, type StageVisit } from "@/sim/types";
import { clockNow } from "@/lib/clock";
import { scoutBotPos } from "./Glasshouse";
import { useLabelSlot } from "./Tags";

/* ------------------------------------------------------------------ */
/* Selection + hover marker                                           */
/* ------------------------------------------------------------------ */

export function SelectionMarker() {
  const selectedId = useTwin((s) => s.selectedId);
  const hoveredId = useTwin((s) => s.hoveredId);
  const plantId = useTwin((s) => s.plantId);
  return (
    <group>
      {plantId ? <PlantMarker plantId={plantId} /> : null}
      {hoveredId && hoveredId !== selectedId ? <BoundingBox id={hoveredId} hover /> : null}
      {selectedId ? <BoundingBox id={selectedId} /> : null}
    </group>
  );
}

/** Faces each of the 12 box edges borders, as [axis, sign] pairs (axis 0=x, 1=y, 2=z). */
const EDGE_FACES: [number, number][][] = [
  [[1, -1], [2, -1]], [[1, -1], [0, 1]], [[1, -1], [2, 1]], [[1, -1], [0, -1]],
  [[1, 1], [2, -1]], [[1, 1], [0, 1]], [[1, 1], [2, 1]], [[1, 1], [0, -1]],
  [[0, -1], [2, -1]], [[0, 1], [2, -1]], [[0, 1], [2, 1]], [[0, -1], [2, 1]],
];

/** Bitmask of the box edges the camera can see: an edge is hidden only when both faces it borders face away. */
function visibleEdgeMask(dir: Vector3) {
  const v = [dir.x, dir.y, dir.z];
  let mask = 0;
  EDGE_FACES.forEach((faces, i) => {
    if (faces.some(([axis, sign]) => sign * v[axis] < -1e-4)) mask |= 1 << i;
  });
  return mask;
}

/** The 12 edges of a box centred on x/z, standing on the floor, as line-segment pairs. */
function boxEdges(w: number, h: number, d: number, mask = 0xfff): [number, number, number][] {
  const c = [
    [-w, 0, -d], [w, 0, -d], [w, 0, d], [-w, 0, d],
    [-w, h, -d], [w, h, -d], [w, h, d], [-w, h, d],
  ] as [number, number, number][];
  const e = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
  return e.flatMap(([a, b], i) => (mask & (1 << i) ? [c[a], c[b]] : []));
}

/** Keeps a marker about the same size on screen at any zoom (orthographic camera). */
function useScreenScale(px: number, base = 18) {
  const ref = useRef<Group>(null);
  useFrame(({ camera }) => {
    if (ref.current) ref.current.scale.setScalar(Math.max(1, (px / base) * (18 / Math.max(1, camera.zoom))));
  });
  return ref;
}

/** A single plant keeps the pin (ring, mast and head) rather than a box; the pin stays readable when zoomed out. */
function PlantMarker({ plantId }: { plantId: string }) {
  const p = useTwin((s) => s.sim.cv[plantId.slice(0, 2)]?.plants[plantId]);
  const ring = useRef<Mesh>(null);
  const pin = useScreenScale(18);
  useFrame(({ clock }) => {
    if (!ring.current) return;
    const t = (clock.elapsedTime % 1.6) / 1.6;
    ring.current.scale.setScalar(0.4 + t * 0.9);
    (ring.current.material as MeshBasicMaterial).opacity = 0.9 * (1 - t);
  });
  const [anchor, setEl] = useLabelSlot("plant", 4.8);
  const h = p?.seen.height ?? 3;
  if (!p) return null;
  const comp = plantId.slice(0, 2);
  const stages = comp === "G3" ? CUCUMBER_STAGES : RIPENESS_STAGES;
  const ripest = stages[stageIndex(Math.max(...p.seen.trusses.map((t) => t.ripeness)))].label.toLowerCase();
  return (
    <group position={[p.x, 0, p.z]}>
      <group ref={anchor} position={[0, h + 0.85, 0]}>
        <Html center zIndexRange={[31, 10]} style={{ pointerEvents: "none" }}>
          <div ref={setEl} className="spatial-tag spatial-tag--selected -translate-y-1/2">
            <span className="spatial-tag__dot" style={{ background: C.select }} />
            <span className="spatial-tag__id">{plantId}</span>
            <span className="spatial-tag__activity">
              {p.seen.trusses.length} trusses · ripest {ripest}
            </span>
          </div>
        </Html>
      </group>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.62, 0]} renderOrder={5}>
        <ringGeometry args={[0.55, 0.7, 40]} />
        <meshBasicMaterial color={C.select} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh position={[0, h / 2 + 0.3, 0]} renderOrder={5}>
        <cylinderGeometry args={[0.06, 0.06, h + 0.5, 8]} />
        <meshBasicMaterial color={C.select} transparent opacity={0.9} depthTest={false} toneMapped={false} />
      </mesh>
      <group ref={pin} position={[0, h + 0.55, 0]}>
        <mesh renderOrder={7}>
          <sphereGeometry args={[0.16, 16, 12]} />
          <meshBasicMaterial color={C.select} depthTest={false} toneMapped={false} />
        </mesh>
        <mesh renderOrder={6}>
          <sphereGeometry args={[0.22, 16, 12]} />
          <meshBasicMaterial color="#ffffff" depthTest={false} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

/**
 * Selection is a full 3D wireframe box in solid blue, drawn through whatever
 * it encloses so it reads on crops and machinery alike. Hover is a faint,
 * thin box that hides behind geometry, so it never outranks the selection.
 */
function BoundingBox({ id, hover }: { id: string; hover?: boolean }) {
  const ref = useRef<Group>(null);
  const kind = useTwin((s) => s.sim.assets[id]?.kind);
  const rawSize = useTwin((s) => s.sim.assets[id]?.size);
  // A camera on a scout bot boxes the bot itself, not the old rail span.
  const size: [number, number, number] | undefined = kind === "CAMERA" && scoutBotPos[id] ? [0.7, 3.6, 1.0] : rawSize;
  useFrame(() => {
    const a = twin().sim.assets[id];
    if (!ref.current || !a) return;
    const bot = a.kind === "CAMERA" ? scoutBotPos[id] : undefined;
    const p = a.kind === "AMR" ? amrPos(id) : bot ? [bot[0], 0, bot[1]] : a.position;
    ref.current.position.set(p[0], bot ? 0.04 : 0.04, p[2]);
  });
  const big = kind === "ROOM" || kind === "COMPARTMENT" || kind === "COLD_ROOM";
  const pad = big ? 0.25 : kind === "ROW" ? 0.2 : 0.4;
  const w = (size?.[0] ?? 0) / 2 + pad;
  const d = (size?.[2] ?? 0) / 2 + pad;
  const h = (size?.[1] ?? 0) + (big ? 0.1 : 0.35);
  // Hide the edges behind the box (usually the bottom-back ones) so it reads as a solid volume.
  const [mask, setMask] = useState(0xfff);
  const camDir = useRef(new Vector3());
  useFrame(({ camera }) => {
    const m = visibleEdgeMask(camera.getWorldDirection(camDir.current));
    if (m !== mask) setMask(m);
  });
  const edges = useMemo(() => boxEdges(w, h, d, mask), [w, h, d, mask]);
  if (!size || !kind) return null;
  return (
    <group ref={ref}>
      <Line
        points={edges}
        segments
        color={hover ? C.slateBlue : C.select}
        lineWidth={hover ? 1 : 2}
        transparent
        opacity={hover ? 0.45 : 1}
        depthTest={!!hover}
        renderOrder={hover ? 0 : 6}
      />
      {hover ? null : (
        <mesh rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[w * 2, d * 2]} />
          <meshBasicMaterial color={C.select} transparent opacity={0.08} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

function amrPos(id: string): [number, number, number] {
  const st = twin();
  const r = st.sim.amrs[id];
  if (!r) return st.sim.assets[id].position;
  if (!r.mission) return [r.at[0], 0, r.at[1]];
  const extra = Math.min(1.2, (clockNow() - st.sim.lastTickAt) / 1000) * r.speed;
  const p = pointAlong(r.mission.path, Math.min(r.mission.length, r.travelled + extra));
  return [p.x, 0, p.z];
}

/* ------------------------------------------------------------------ */
/* Alert beacons                                                      */
/* ------------------------------------------------------------------ */

export function AlertBeacons() {
  const alerts = useTwin((s) => s.sim.alerts);
  const open = alerts.filter((a) => a.status !== "RESOLVED");
  return (
    <group>
      {open.map((a) => (
        <Beacon key={a.id} assetId={a.assetId} color={a.status === "RESOLVING" ? C.blue : severityColor[a.severity]} />
      ))}
    </group>
  );
}

function Beacon({ assetId, color }: { assetId: string; color: string }) {
  const g = useRef<Group>(null);
  const ring = useRef<Mesh>(null);
  const ring2 = useRef<Mesh>(null);
  const beam = useRef<Mesh>(null);
  const asset = useTwin((s) => s.sim.assets[assetId]);
  const r = asset ? Math.max(1.6, Math.min(6, Math.max(asset.size[0], asset.size[2]) * 0.6)) : 2;
  useFrame(({ clock }) => {
    const a = twin().sim.assets[assetId];
    if (!a || !g.current) return;
    const p = a.kind === "AMR" ? amrPos(assetId) : a.position;
    g.current.position.set(p[0], 0.1, p[2]);
    const t = (clock.elapsedTime * 0.6) % 1;
    const t2 = (clock.elapsedTime * 0.6 + 0.5) % 1;
    if (ring.current) {
      ring.current.scale.setScalar(0.6 + t * 1.2);
      (ring.current.material as MeshBasicMaterial).opacity = 0.7 * (1 - t);
    }
    if (ring2.current) {
      ring2.current.scale.setScalar(0.6 + t2 * 1.2);
      (ring2.current.material as MeshBasicMaterial).opacity = 0.7 * (1 - t2);
    }
    if (beam.current) (beam.current.material as MeshBasicMaterial).opacity = 0.16 + Math.sin(clock.elapsedTime * 2.4) * 0.06;
  });
  if (!asset) return null;
  return (
    <group ref={g}>
      <mesh ref={ring} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r * 0.92, r, 48]} />
        <meshBasicMaterial color={color} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={ring2} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[r * 0.92, r, 48]} />
        <meshBasicMaterial color={color} transparent depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={beam} position={[0, 7, 0]}>
        <cylinderGeometry args={[0.12, 0.5, 14, 16, 1, true]} />
        <meshBasicMaterial color={color} transparent opacity={0.2} depthWrite={false} toneMapped={false} side={2} />
      </mesh>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Climate heat map                                                   */
/* ------------------------------------------------------------------ */

interface HeatRegion {
  id: string;
  bounds: [number, number, number, number];
  hotspot?: [number, number];
}

const HEAT_REGIONS: HeatRegion[] = [
  { id: "V1", bounds: ZONE_BY_ID.V1.bounds, hotspot: [-36, -27] },
  { id: "V2", bounds: ZONE_BY_ID.V2.bounds, hotspot: [-17, -27] },
  ...COMPARTMENTS.map((c) => ({ id: c.id, bounds: c.bounds })),
  ...COLD_ROOMS.map((c) => ({ id: c.id, bounds: c.bounds, hotspot: [(c.bounds[0] + c.bounds[2]) / 2, c.bounds[1]] as [number, number] })),
  { id: "GERM-02", bounds: ZONE_BY_ID.PROP.bounds },
];

const RAMP = ["#3b82c4", "#4fb3a9", "#5fbf6a", "#b7cf4a", "#e8b23a", "#e2683a", "#d43d33"];

function ramp(t: number) {
  const x = Math.max(0, Math.min(0.999, t)) * (RAMP.length - 1);
  const i = Math.floor(x);
  const f = x - i;
  const a = RAMP[i];
  const b = RAMP[i + 1];
  const pa = [parseInt(a.slice(1, 3), 16), parseInt(a.slice(3, 5), 16), parseInt(a.slice(5, 7), 16)];
  const pb = [parseInt(b.slice(1, 3), 16), parseInt(b.slice(3, 5), 16), parseInt(b.slice(5, 7), 16)];
  return pa.map((v, k) => Math.round(v + (pb[k] - v) * f));
}

export const HEAT_INFO: Record<Exclude<HeatLayer, null>, { label: string; unit: string; range: [number, number] }> = {
  vpd: { label: "VPD", unit: "kPa", range: [0.4, 1.6] },
  temp: { label: "Air temp", unit: "°C", range: [0, 26] },
  rh: { label: "Humidity", unit: "%", range: [45, 98] },
  co2: { label: "CO₂", unit: "ppm", range: [400, 1300] },
  ppfd: { label: "PPFD", unit: "µmol/m²/s", range: [0, 500] },
};

export function Heatmap() {
  const layer = useTwin((s) => s.layers.heat);
  if (!layer) return null;
  return (
    <group>
      {HEAT_REGIONS.map((r) => (
        <HeatPlane key={r.id} region={r} layer={layer} />
      ))}
    </group>
  );
}

function regionValue(s: SimState, id: string, layer: Exclude<HeatLayer, null>): number | null {
  const a: Asset | undefined = s.assets[id];
  const m = a?.metrics[layer];
  return m ? m.value : null;
}

function HeatPlane({ region, layer }: { region: HeatRegion; layer: Exclude<HeatLayer, null> }) {
  const [x0, z0, x1, z1] = region.bounds;
  const w = x1 - x0;
  const d = z1 - z0;
  const N = 48;
  const canvas = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = N;
    c.height = Math.round((N * d) / w);
    return c;
  }, [d, w]);
  const tex = useMemo(() => {
    const t = new CanvasTexture(canvas);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, [canvas]);
  // Heat planes mount and unmount with the H key; free their GPU textures.
  useEffect(() => () => tex.dispose(), [tex]);
  const mat = useRef<MeshBasicMaterial>(null);

  useEffect(() => {
    const draw = () => {
      const s = twin().sim;
      const v = regionValue(s, region.id, layer);
      if (v === null) {
        if (mat.current) mat.current.visible = false;
        return;
      }
      if (mat.current) mat.current.visible = true;
      const [lo, hi] = HEAT_INFO[layer].range;
      const ctx = canvas.getContext("2d")!;
      const img = ctx.createImageData(canvas.width, canvas.height);
      const tsec = s.tick * 0.05;
      for (let j = 0; j < canvas.height; j++) {
        for (let i = 0; i < canvas.width; i++) {
          const u = i / canvas.width;
          const vv = j / canvas.height;
          // Smooth spatial field: gradients, a slow-moving swirl, and a hotspot near the air handler / door.
          let field = Math.sin(u * 3.1 + tsec) * 0.035 + Math.cos(vv * 2.6 - tsec * 0.7) * 0.03 + (vv - 0.5) * 0.04;
          if (region.hotspot) {
            const hx = (region.hotspot[0] - x0) / w;
            const hz = (region.hotspot[1] - z0) / d;
            const dist = Math.hypot(u - hx, (vv - hz) * (d / w));
            field += Math.exp(-dist * 5) * 0.06;
          }
          const val = v * (1 + field);
          const [r, g, b] = ramp((val - lo) / (hi - lo));
          const k = (j * canvas.width + i) * 4;
          img.data[k] = r;
          img.data[k + 1] = g;
          img.data[k + 2] = b;
          img.data[k + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      tex.needsUpdate = true;
    };
    draw();
    return useTwin.subscribe((st, prev) => {
      if (st.sim.tick !== prev.sim.tick) draw();
    });
  }, [canvas, d, layer, region, tex, w, x0, z0]);

  return (
    <mesh position={[(x0 + x1) / 2, 0.12, (z0 + z1) / 2]} rotation={[-Math.PI / 2, 0, 0]} renderOrder={1}>
      <planeGeometry args={[w - 0.3, d - 0.3]} />
      <meshBasicMaterial ref={mat} map={tex} transparent opacity={0.62} depthWrite={false} />
    </mesh>
  );
}

/* ------------------------------------------------------------------ */
/* Batch trace                                                        */
/* ------------------------------------------------------------------ */

const STAGE_STATION: Record<string, string> = { SEEDING: "PROP", HARVEST: "HARV", QUALITY: "PACK", COLD_CHAIN: "DOCK" };

export function TraceRoute() {
  const on = useTwin((s) => s.layers.trace);
  const batchId = useTwin((s) => s.batchId);
  const route = useTwin((s) => s.sim.batches[s.batchId]?.route);
  const progress = useTwin((s) => Math.round((s.sim.batches[s.batchId]?.stageProgress ?? 0) * 100) / 100);
  const assets = useTwin((s) => s.sim.assets);
  const lineRef = useRef<{ material: { dashOffset: number } } | null>(null);
  const { done, todo, nodes } = useMemo(() => {
    if (!route) return { done: [], todo: [], nodes: [] };
    const nodes: { p: [number, number, number]; status: string; label: string; visit: StageVisit; n: number }[] = [];
    route.forEach((v, n) => {
      const ids = v.assetIds.filter((id) => assets[id]);
      if (!ids.length) return;
      // Average the assets of this stage into one node.
      const x = ids.reduce((acc, id) => acc + assets[id].position[0], 0) / ids.length;
      const z = ids.reduce((acc, id) => acc + assets[id].position[2], 0) / ids.length;
      nodes.push({ p: [x, 0.25, z], status: v.status, label: v.stage, visit: v, n: n + 1 });
    });
    const done: [number, number, number][] = [];
    const todo: [number, number, number][] = [];
    for (let i = 1; i < nodes.length; i++) {
      const a = nodes[i - 1].p;
      const b = nodes[i].p;
      const sa = STATIONS[STAGE_STATION[nodes[i - 1].label] ?? "V2"];
      const sb = STATIONS[STAGE_STATION[nodes[i].label] ?? "V2"];
      const path = corridorPath([a[0], a[2]], [a[0], sa?.door[1] ?? -4], [b[0], b[2]], [b[0], sb?.door[1] ?? -4]).map((q) => [q[0], 0.25, q[1]] as [number, number, number]);
      const target = nodes[i].status === "PLANNED" ? todo : done;
      if (target.length) path.shift();
      target.push(...path);
    }
    return { done, todo, nodes };
  }, [route, assets]);
  useFrame((_, dt) => {
    if (lineRef.current) lineRef.current.material.dashOffset -= dt * 2;
  });
  if (!on || !route) return null;
  void batchId;
  return (
    <group>
      {done.length > 1 ? <Line points={done} color={C.luna} lineWidth={5} /> : null}
      {todo.length > 1 ? <Line ref={lineRef as never} points={todo} color={C.slateBlue} lineWidth={3.5} dashed dashSize={1.2} gapSize={0.8} /> : null}
      {nodes.map((n, i) => (
        <group key={i} position={n.p}>
          <mesh>
            <sphereGeometry args={[0.7, 20, 14]} />
            <meshBasicMaterial color={n.status === "PLANNED" ? C.slateBlue : n.status === "ACTIVE" ? C.luna : C.green} toneMapped={false} />
          </mesh>
          <TraceLabel visit={n.visit} n={n.n} progress={progress} />
        </group>
      ))}
    </group>
  );
}

/** A stage pin on the traced route: which step, and when it happened or will. */
function TraceLabel({ visit, n, progress }: { visit: StageVisit; n: number; progress: number }) {
  const st = STAGES.find((x) => x.key === visit.stage)!;
  const when = visit.status === "DONE" ? formatDayTime(visit.exitedAt) : visit.status === "ACTIVE" ? `now · ${formatNumber(progress * 100)} %` : formatDayTime(visit.enteredAt);
  // Stage pins outrank ordinary tags so the route always reads in order.
  const [anchorRef, setEl] = useLabelSlot(`trace:${visit.stage}`, 4.2);
  return (
    <group ref={anchorRef} position={[0, 3.6, 0]}>
      <Html center zIndexRange={[28, 10]} style={{ pointerEvents: "none" }}>
        <div ref={setEl} className={`trace-pin trace-pin--${visit.status.toLowerCase()}`}>
          <span className="trace-pin__n">{visit.status === "DONE" ? "✓" : n}</span>
          <span className="trace-pin__stage">{st.short}</span>
          <span className="trace-pin__when">{when}</span>
        </div>
      </Html>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* AMR flow paths                                                     */
/* ------------------------------------------------------------------ */

export function FlowPaths() {
  const on = useTwin((s) => s.layers.flows);
  const missions = useTwin((s) => Object.values(s.sim.amrs).map((r) => r.mission?.id ?? "").join(","));
  const paths = useMemo(() => {
    void missions;
    return Object.values(twin().sim.amrs)
      .filter((r) => r.mission && r.state === "TRANSPORTING")
      .map((r) => ({ id: r.id, pts: r.mission!.path.map((p) => [p[0], 0.11, p[1]] as [number, number, number]) }));
  }, [missions]);
  if (!on) return null;
  return (
    <group>
      {paths.map((p) => (
        <Line key={p.id} points={p.pts} color={C.amber} lineWidth={1.6} transparent opacity={0.45} dashed dashSize={0.6} gapSize={0.5} />
      ))}
    </group>
  );
}

/** The bits of drei's Line2 we drive per frame. */
interface Line2Like {
  setPoints(start: Vector3, end: Vector3, mid: Vector3): void;
  material: { dashOffset: number };
}

/* ------------------------------------------------------------------ */
/* Edge data flow                                                     */
/* ------------------------------------------------------------------ */

const EDGE_AT = new Vector3(-4.2, 2.25, 29.6);
const UPLINK_TOP = new Vector3(-4.2, 13.5, 29.6);

/**
 * The bandwidth story, drawn where it happens. While EDGE-01 is selected,
 * a heavy amber stream runs from each camera rail into the edge node (the
 * images, which never leave), and a hairline rises from it to the uplink
 * (the few kilobits of plant state that do).
 */
export function EdgeFlow() {
  const on = useTwin((s) => s.selectedId === "EDGE-01");
  if (!on) return null;
  return (
    <group>
      {COMPARTMENTS.map((c) => (
        <RailStream key={c.id} id={c.id} x0={c.bounds[0]} width={c.bounds[2] - c.bounds[0]} />
      ))}
      <Uplink />
    </group>
  );
}

function RailStream({ id, x0, width }: { id: string; x0: number; width: number }) {
  const ref = useRef<Line2Like>(null);
  const start = useMemo(() => new Vector3(), []);
  const mid = useMemo(() => new Vector3(), []);
  useFrame((_, dt) => {
    const line = ref.current;
    const c = twin().sim.cv[id];
    if (!line || !c) return;
    // Follow the gantry along its rail; the stream leaves from the rail's front end.
    start.set(x0 + 0.4 + c.scan * (width - 0.8), 4.1, 30.6);
    mid.set((start.x + EDGE_AT.x) / 2, 8, (start.z + EDGE_AT.z) / 2 + 2);
    line.setPoints(start, EDGE_AT, mid);
    line.material.dashOffset -= dt * 2.2;
  });
  return <QuadraticBezierLine ref={ref as never} start={[x0, 4.1, 30.6]} end={EDGE_AT} color="#ee9a2c" lineWidth={4} dashed dashSize={0.8} gapSize={0.5} depthTest={false} renderOrder={6} />;
}

function Uplink() {
  const ref = useRef<Line2Like>(null);
  const rates = useTwin((s) => Math.round(edgeRates(s.sim.cv).syncKbps * 10));
  const raw = useTwin((s) => Math.round(edgeRates(s.sim.cv).rawMbps));
  const [anchor, setEl] = useLabelSlot("edge:uplink", 4.6);
  useFrame((_, dt) => {
    if (ref.current) ref.current.material.dashOffset -= dt * 0.6;
  });
  return (
    <group>
      <QuadraticBezierLine ref={ref as never} start={EDGE_AT} end={UPLINK_TOP} mid={[EDGE_AT.x, (EDGE_AT.y + UPLINK_TOP.y) / 2, EDGE_AT.z]} color="#2f6fc4" lineWidth={2} dashed dashSize={0.3} gapSize={0.3} depthTest={false} renderOrder={6} />
      <group ref={anchor} position={UPLINK_TOP}>
        <Html center zIndexRange={[29, 10]} style={{ pointerEvents: "none" }}>
          <div ref={setEl} className="flow-chip">
            <span className="flow-chip__row">
              <span className="flow-chip__dot" style={{ background: "#3f7fd6" }} />
              Uplink · <b>{formatNumber(rates / 10, 1)} kbps</b> of plant state
            </span>
            <span className="flow-chip__row flow-chip__row--muted">
              <span className="flow-chip__dot" style={{ background: C.luna }} />
              Photos stay on site · would need {formatNumber(raw)} Mbps
            </span>
          </div>
        </Html>
      </group>
    </group>
  );
}
