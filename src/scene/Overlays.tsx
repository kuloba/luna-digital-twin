import { Line } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import { CanvasTexture, type Group, type Mesh, type MeshBasicMaterial, SRGBColorSpace } from "three";
import { C, severityColor } from "@/lib/theme";
import { COLD_ROOMS, COMPARTMENTS, STATIONS, ZONE_BY_ID, corridorPath, pointAlong } from "@/sim/layout";
import { twin, useTwin, type HeatLayer } from "@/sim/store";
import type { Asset, SimState } from "@/sim/types";

/* ------------------------------------------------------------------ */
/* Selection + hover marker                                           */
/* ------------------------------------------------------------------ */

export function SelectionMarker() {
  const selectedId = useTwin((s) => s.selectedId);
  const hoveredId = useTwin((s) => s.hoveredId);
  return (
    <group>
      {hoveredId && hoveredId !== selectedId ? <Bracket id={hoveredId} color={C.slateBlue} opacity={0.6} /> : null}
      {selectedId ? <Bracket id={selectedId} color={C.luna} opacity={1} animated /> : null}
    </group>
  );
}

function Bracket({ id, color, opacity, animated }: { id: string; color: string; opacity: number; animated?: boolean }) {
  const ref = useRef<Group>(null);
  const kind = useTwin((s) => s.sim.assets[id]?.kind);
  const size = useTwin((s) => s.sim.assets[id]?.size);
  useFrame(({ clock }) => {
    const a = twin().sim.assets[id];
    if (!ref.current || !a) return;
    const moving = a.kind === "AMR";
    const p = moving ? amrPos(id) : a.position;
    ref.current.position.set(p[0], 0.08, p[2]);
    if (animated) {
      const s = 1 + Math.sin(clock.elapsedTime * 3) * 0.03;
      ref.current.scale.set(s, 1, s);
    }
  });
  if (!size || !kind) return null;
  const pad = kind === "ROOM" || kind === "COMPARTMENT" || kind === "COLD_ROOM" ? 0.3 : 0.6;
  const w = size[0] / 2 + pad;
  const d = size[2] / 2 + pad;
  const c = Math.min(1.4, Math.min(w, d) * 0.5);
  const corners: [number, number, number][][] = [
    [[-w, 0, -d + c], [-w, 0, -d], [-w + c, 0, -d]],
    [[w - c, 0, -d], [w, 0, -d], [w, 0, -d + c]],
    [[w, 0, d - c], [w, 0, d], [w - c, 0, d]],
    [[-w + c, 0, d], [-w, 0, d], [-w, 0, d - c]],
  ];
  return (
    <group ref={ref}>
      {corners.map((pts, i) => (
        <Line key={i} points={pts} color={color} lineWidth={3} transparent opacity={opacity} />
      ))}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
        <planeGeometry args={[w * 2, d * 2]} />
        <meshBasicMaterial color={color} transparent opacity={0.07 * opacity} depthWrite={false} />
      </mesh>
    </group>
  );
}

function amrPos(id: string): [number, number, number] {
  const st = twin();
  const r = st.sim.amrs[id];
  if (!r) return st.sim.assets[id].position;
  if (!r.mission) return [r.at[0], 0, r.at[1]];
  const extra = Math.min(1.2, (Date.now() - st.sim.lastTickAt) / 1000) * r.speed;
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
  const assets = useTwin((s) => s.sim.assets);
  const lineRef = useRef<{ material: { dashOffset: number } } | null>(null);
  const { done, todo, nodes } = useMemo(() => {
    if (!route) return { done: [], todo: [], nodes: [] };
    const nodes: { p: [number, number, number]; status: string; label: string }[] = [];
    for (const v of route) {
      const ids = v.assetIds.filter((id) => assets[id]);
      if (!ids.length) continue;
      // Average the assets of this stage into one node.
      const x = ids.reduce((acc, id) => acc + assets[id].position[0], 0) / ids.length;
      const z = ids.reduce((acc, id) => acc + assets[id].position[2], 0) / ids.length;
      nodes.push({ p: [x, 0.25, z], status: v.status, label: v.stage });
    }
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
      {done.length > 1 ? <Line points={done} color={C.luna} lineWidth={4} /> : null}
      {todo.length > 1 ? <Line ref={lineRef as never} points={todo} color={C.slateBlue} lineWidth={3} dashed dashSize={1.2} gapSize={0.8} /> : null}
      {nodes.map((n, i) => (
        <mesh key={i} position={n.p}>
          <sphereGeometry args={[0.55, 20, 14]} />
          <meshBasicMaterial color={n.status === "PLANNED" ? C.slateBlue : n.status === "ACTIVE" ? C.luna : C.green} toneMapped={false} />
        </mesh>
      ))}
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
