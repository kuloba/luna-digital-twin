import type { ThreeEvent } from "@react-three/fiber";
import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { Color, ExtrudeGeometry, type Group, type InstancedMesh, type Mesh, Object3D, Shape } from "three";
import { C } from "@/lib/theme";
import { CANOPY_HIGH, CANOPY_LOW, CUCUMBER_STAGES, RIPENESS_STAGES, rowYield } from "@/sim/cv";
import { COMPARTMENTS } from "@/sim/layout";
import { twin, useTwin, type CvLens } from "@/sim/store";
import type { CompartmentCv, Plant } from "@/sim/types";
import { Pickable } from "./primitives";

/**
 * The glasshouse crop twin. Every plant, truss and fruit drawn here comes
 * from the LUNA camera rails' last scan (`plant.seen`) — not from photos.
 * Lenses re-colour the same geometry: ripeness, 7-day yield, pest pressure,
 * growth (head height vs. target).
 */

const tmp = new Object3D();
const col = new Color();
const ROOF_SPAN = 4.667;
const EAVE = 4.2;
const RIDGE = 5.05;

export function Glasshouse() {
  return (
    <group>
      <Roof />
      {/* compartment partitions */}
      {[-39.5, -20.5].map((x) => (
        <mesh key={x} position={[x, EAVE / 2, 18]}>
          <boxGeometry args={[0.06, EAVE, 28]} />
          <meshStandardMaterial color={C.glass} transparent opacity={0.16} depthWrite={false} />
        </mesh>
      ))}
      {COMPARTMENTS.map((c) => (
        <Compartment key={c.id} id={c.id} bounds={c.bounds} />
      ))}
    </group>
  );
}

function Roof() {
  const geo = useMemo(() => {
    const shape = new Shape();
    shape.moveTo(-ROOF_SPAN / 2, 0);
    shape.lineTo(0, RIDGE - EAVE);
    shape.lineTo(ROOF_SPAN / 2, 0);
    shape.lineTo(-ROOF_SPAN / 2, 0);
    return new ExtrudeGeometry(shape, { depth: 28, bevelEnabled: false });
  }, []);
  const spans = useMemo(() => Array.from({ length: 12 }, (_, i) => -58 + ROOF_SPAN / 2 + i * ROOF_SPAN), []);
  const focus = useTwin((s) => s.focus);
  const close = focus === "GH";
  return (
    <group>
      {spans.map((x) => (
        <group key={x} position={[x, EAVE, 4]}>
          <mesh geometry={geo} renderOrder={3}>
            <meshStandardMaterial color={C.glass} transparent opacity={close ? 0.04 : 0.1} depthWrite={false} roughness={0.1} />
          </mesh>
          <lineSegments renderOrder={3}>
            <edgesGeometry args={[geo, 20]} />
            <lineBasicMaterial color={C.glassEdge} transparent opacity={close ? 0.35 : 0.7} />
          </lineSegments>
        </group>
      ))}
      {/* truss beams */}
      {Array.from({ length: 8 }, (_, i) => (
        <mesh key={i} position={[-30, EAVE - 0.05, 4 + i * 4]}>
          <boxGeometry args={[56, 0.1, 0.08]} />
          <meshStandardMaterial color="#c9d4de" />
        </mesh>
      ))}
    </group>
  );
}

function Compartment({ id, bounds }: { id: string; bounds: [number, number, number, number] }) {
  const comp = useTwin((s) => s.sim.cv[id]);
  const rows = comp.rows;
  const x0 = bounds[0];
  const width = bounds[2] - bounds[0];
  return (
    <group>
      {/* ground cover + concrete paths */}
      <mesh position={[(bounds[0] + bounds[2]) / 2, 0.06, 18.6]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[width - 0.4, 24]} />
        <meshStandardMaterial color="#eef1ec" roughness={1} />
      </mesh>
      {rows.map((r) => (
        <RowFixture key={r.id} id={r.id} x={r.x} z0={r.z0} z1={r.z1} />
      ))}
      <Plants comp={comp} />
      <ScanGantry id={id} x0={x0} width={width} />
      <YieldStrips comp={comp} />
      <PestBeacons comp={comp} />
    </group>
  );
}

/** Gutter, heating pipes and an invisible pick box per row. */
function RowFixture({ id, x, z0, z1 }: { id: string; x: number; z0: number; z1: number }) {
  const len = z1 - z0;
  const zc = (z0 + z1) / 2;
  return (
    <Pickable id={id}>
      <mesh position={[x, 0.5, zc]} castShadow receiveShadow>
        <boxGeometry args={[0.36, 0.12, len]} />
        <meshStandardMaterial color="#f5f7f9" />
      </mesh>
      {[-0.42, 0.42].map((dx) => (
        <mesh key={dx} position={[x + dx, 0.14, zc]} rotation={[Math.PI / 2, 0, 0]}>
          <cylinderGeometry args={[0.035, 0.035, len, 6]} />
          <meshStandardMaterial color="#b9c3cd" metalness={0.5} roughness={0.35} />
        </mesh>
      ))}
      {/* high wire */}
      <mesh position={[x, 3.6, zc]} rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.012, 0.012, len, 4]} />
        <meshBasicMaterial color="#9aa8b6" />
      </mesh>
      <mesh position={[x, 1.8, zc]} visible={false}>
        <boxGeometry args={[1.2, 3.6, len]} />
      </mesh>
    </Pickable>
  );
}

const TRUSS_MAX = 9;

function lensLeafColor(lens: CvLens, p: Plant, base: string) {
  if (lens === "pests" && p.seen.pest && p.seen.pestLevel > 0.08) {
    return col.set(p.seen.pest === "Botrytis" ? "#8a7d5a" : p.seen.pest === "Powdery mildew" ? "#b8c4a8" : "#a9a44a").lerp(col.clone().set(base), 1 - Math.min(1, p.seen.pestLevel * 1.4));
  }
  if (lens === "growth") {
    // Head height vs. 3.15 m target: blue = behind, green = on, amber = stretched.
    const d = p.seen.height - 3.15;
    if (d < -0.08) return col.set("#5b8fd6");
    if (d > 0.1) return col.set("#d9a43c");
    return col.set("#3f9a56");
  }
  if (lens === "yield" || lens === "pests") return col.set(base).lerp(col.clone().set("#dfe5dc"), 0.55);
  return col.set(base);
}

function Plants({ comp }: { comp: CompartmentCv }) {
  const stems = useRef<InstancedMesh>(null);
  const leaves = useRef<InstancedMesh>(null);
  const fruits = useRef<InstancedMesh>(null);
  const flowers = useRef<InstancedMesh>(null);
  const plants = useMemo(() => comp.rows.flatMap((r) => r.plantIds), [comp.rows]);
  const isTomato = comp.crop === "TOMATO";
  const leafBase = isTomato ? "#4c8f45" : "#4a8c3f";
  const LEAVES_PER = 4;

  // Static geometry: stems, leaves, truss placement.
  useLayoutEffect(() => {
    const s = stems.current;
    const l = leaves.current;
    if (!s || !l) return;
    plants.forEach((pid, i) => {
      const p = comp.plants[pid];
      const h = p.seen.height;
      tmp.rotation.set(0, 0, 0);
      tmp.position.set(p.x, 0.56 + (h - 0.56) / 2, p.z);
      tmp.scale.set(1, h - 0.56, 1);
      tmp.updateMatrix();
      s.setMatrixAt(i, tmp.matrix);
      for (let k = 0; k < LEAVES_PER; k++) {
        const f = (k + 0.6) / LEAVES_PER;
        const side = k % 2 ? 1 : -1;
        tmp.position.set(p.x + side * 0.16, 0.56 + f * (h - 0.62), p.z + (k % 3) * 0.12 - 0.12);
        tmp.rotation.set(0.2 * side, i * 0.9 + k, 0.3);
        const sc = 0.34 + (1 - f) * 0.08;
        tmp.scale.set(sc * 1.4, sc * 0.75, sc);
        tmp.updateMatrix();
        l.setMatrixAt(i * LEAVES_PER + k, tmp.matrix);
      }
    });
    s.instanceMatrix.needsUpdate = true;
    l.instanceMatrix.needsUpdate = true;
  }, [comp.plants, plants]);

  // Colours + truss transforms follow the latest scan.
  useEffect(() => {
    const apply = () => {
      const st = twin();
      const c = st.sim.cv[comp.id];
      const lens = st.cvLens;
      const now = Date.now();
      const f = fruits.current;
      const l = leaves.current;
      const fl = flowers.current;
      if (!f || !l || !fl) return;
      const stages = isTomato ? RIPENESS_STAGES : CUCUMBER_STAGES;
      plants.forEach((pid, i) => {
        const p = c.plants[pid];
        const fresh = Math.max(0, 1 - (now - p.scannedAt) / 6000);
        const leaf = lensLeafColor(lens, p, leafBase);
        for (let k = 0; k < LEAVES_PER; k++) {
          l.setColorAt(i * LEAVES_PER + k, col.copy(leaf).offsetHSL(0, 0, (k % 2) * 0.03 + fresh * 0.12));
        }
        for (let t = 0; t < TRUSS_MAX; t++) {
          const idx = i * TRUSS_MAX + t;
          const tr = p.seen.trusses[t];
          if (!tr) {
            tmp.scale.setScalar(0.0001);
            tmp.position.set(p.x, 0, p.z);
            tmp.updateMatrix();
            f.setMatrixAt(idx, tmp.matrix);
            continue;
          }
          const side = t % 2 ? 1 : -1;
          const y = CANOPY_LOW + tr.h * (CANOPY_HIGH - CANOPY_LOW) * ((p.seen.height - 0.2) / 3.1);
          tmp.rotation.set(0, 0, 0);
          tmp.position.set(p.x + side * 0.3, y, p.z + ((t * 37) % 5) * 0.07 - 0.14);
          const size = isTomato ? 0.12 + Math.sqrt(tr.fruits) * 0.045 : 0.07;
          tmp.scale.set(size, isTomato ? size * 0.92 : 0.12 + tr.ripeness * 0.05, size);
          tmp.updateMatrix();
          f.setMatrixAt(idx, tmp.matrix);
          let c2: Color;
          if (lens === "ripeness" || lens === "growth") c2 = col.set(stages[Math.max(0, Math.min(5, Math.floor(tr.ripeness)))].color);
          else if (lens === "yield") c2 = tr.ripeness >= 3.4 ? col.set("#cf3326") : col.set("#c9cfc6");
          else c2 = col.set("#cfd5cc");
          if (fresh > 0) c2.lerp(col.clone().set("#ffffff"), fresh * 0.55);
          f.setColorAt(idx, c2);
        }
        // Flowers at the head.
        tmp.position.set(p.x, p.seen.height - 0.05, p.z + 0.1);
        tmp.rotation.set(0, 0, 0);
        const fs = isTomato ? 0.05 + p.seen.flowers * 0.012 : 0.0001;
        tmp.scale.setScalar(lens === "ripeness" ? fs : 0.0001);
        tmp.updateMatrix();
        fl.setMatrixAt(i, tmp.matrix);
      });
      f.instanceMatrix.needsUpdate = true;
      if (f.instanceColor) f.instanceColor.needsUpdate = true;
      if (l.instanceColor) l.instanceColor.needsUpdate = true;
      fl.instanceMatrix.needsUpdate = true;
    };
    apply();
    return useTwin.subscribe((st, prev) => {
      if (st.sim.cv[comp.id] !== prev.sim.cv[comp.id] || st.cvLens !== prev.cvLens) apply();
    });
  }, [comp.id, isTomato, leafBase, plants]);

  const onClick = (e: ThreeEvent<MouseEvent>, per: number) => {
    e.stopPropagation();
    if (e.delta > 4 || e.instanceId === undefined) return;
    const pid = plants[Math.floor(e.instanceId / per)];
    const p = comp.plants[pid];
    if (p) twin().selectPlant(pid, p.row);
  };
  const onOver = (e: ThreeEvent<PointerEvent>, per: number) => {
    e.stopPropagation();
    if (e.instanceId === undefined) return;
    const p = comp.plants[plants[Math.floor(e.instanceId / per)]];
    if (p) twin().hover(p.row);
    document.body.style.cursor = "pointer";
  };
  const onOut = () => {
    twin().hover(undefined);
    document.body.style.cursor = "";
  };

  return (
    <group>
      <instancedMesh ref={stems} args={[undefined, undefined, plants.length]}>
        <cylinderGeometry args={[0.025, 0.03, 1, 5]} />
        <meshStandardMaterial color="#6f9a4f" />
      </instancedMesh>
      <instancedMesh ref={leaves} args={[undefined, undefined, plants.length * LEAVES_PER]} castShadow onClick={(e) => onClick(e, LEAVES_PER)} onPointerOver={(e) => onOver(e, LEAVES_PER)} onPointerOut={onOut}>
        <icosahedronGeometry args={[1, 0]} />
        <meshStandardMaterial roughness={0.95} flatShading />
      </instancedMesh>
      <instancedMesh ref={fruits} args={[undefined, undefined, plants.length * TRUSS_MAX]} castShadow onClick={(e) => onClick(e, TRUSS_MAX)} onPointerOver={(e) => onOver(e, TRUSS_MAX)} onPointerOut={onOut}>
        <sphereGeometry args={[1, 10, 8]} />
        <meshStandardMaterial roughness={0.35} />
      </instancedMesh>
      <instancedMesh ref={flowers} args={[undefined, undefined, plants.length]}>
        <octahedronGeometry args={[1, 0]} />
        <meshStandardMaterial color="#f4d03f" emissive="#f4d03f" emissiveIntensity={0.3} />
      </instancedMesh>
    </group>
  );
}

/** LUNA camera rail: a gantry sweeping the compartment with a camera pod. */
function ScanGantry({ id, x0, width }: { id: string; x0: number; width: number }) {
  const gantry = useRef<Group>(null);
  const pod = useRef<Group>(null);
  const cone = useRef<Mesh>(null);
  const pos = useRef(0);
  useFrame(({ clock }, dt) => {
    const c = twin().sim.cv[id];
    if (!c) return;
    const target = c.scan + c.scanDir * 0.0065 * Math.min(1, (Date.now() - twin().sim.lastTickAt) / 1000);
    pos.current += (target - pos.current) * Math.min(1, dt * 4);
    if (gantry.current) gantry.current.position.x = x0 + 0.4 + pos.current * (width - 0.8);
    if (pod.current) pod.current.position.z = 18.6 + Math.sin(clock.elapsedTime * 0.9 + x0) * 10.5;
    if (cone.current) (cone.current.material as unknown as { opacity: number }).opacity = 0.12 + Math.sin(clock.elapsedTime * 5) * 0.04;
  });
  return (
    <Pickable id={`CAM-${id}`}>
      <group ref={gantry} position={[x0, 0, 0]}>
        {/* rails at either end */}
        <mesh position={[0, 4.05, 18.6]}>
          <boxGeometry args={[0.22, 0.18, 25]} />
          <meshStandardMaterial color={C.steel} />
        </mesh>
        {/* scan sheet: where the cameras are imaging right now */}
        <mesh position={[0, 2, 18.6]} rotation={[0, Math.PI / 2, 0]} raycast={() => null}>
          <planeGeometry args={[25, 4]} />
          <meshBasicMaterial color={C.luna} transparent opacity={0.12} depthWrite={false} side={2} toneMapped={false} />
        </mesh>
        <mesh position={[0, 0.07, 18.6]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => null}>
          <planeGeometry args={[0.45, 25]} />
          <meshBasicMaterial color={C.luna} transparent opacity={0.45} depthWrite={false} toneMapped={false} />
        </mesh>
        <group ref={pod} position={[0, 3.85, 18.6]}>
          <mesh castShadow>
            <boxGeometry args={[0.55, 0.32, 0.55]} />
            <meshStandardMaterial color={C.luna} />
          </mesh>
          <mesh position={[0, -0.22, 0]}>
            <cylinderGeometry args={[0.1, 0.12, 0.14, 12]} />
            <meshStandardMaterial color="#1f2937" />
          </mesh>
          <mesh ref={cone} position={[0, -1.6, 0]}>
            <coneGeometry args={[1.25, 2.7, 4, 1, true]} />
            <meshBasicMaterial color={C.luna} transparent opacity={0.14} depthWrite={false} side={2} toneMapped={false} />
          </mesh>
        </group>
      </group>
    </Pickable>
  );
}

/** Yield lens: a coloured strip under each row (kg/m² ready in the next 7 days). */
function YieldStrips({ comp }: { comp: CompartmentCv }) {
  const lens = useTwin((s) => s.cvLens);
  const values = useMemo(() => comp.rows.map((r) => rowYield(comp, r)), [comp]);
  if (lens !== "yield") return null;
  return (
    <group>
      {comp.rows.map((r, i) => {
        const v = values[i];
        const t = Math.max(0, Math.min(1, (v - 0.5) / 1.2));
        const c = new Color("#e8eef4").lerp(new Color("#1f8a4c"), t);
        return (
          <mesh key={r.id} position={[r.x, 0.09, (r.z0 + r.z1) / 2]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[1.45, r.z1 - r.z0]} />
            <meshBasicMaterial color={c} transparent opacity={0.9} />
          </mesh>
        );
      })}
    </group>
  );
}

/** Pest lens: hotspot rings + markers where the camera flagged pressure. */
function PestBeacons({ comp }: { comp: CompartmentCv }) {
  const lens = useTwin((s) => s.cvLens);
  const spots = useMemo(() => {
    const out: { x: number; z: number; level: number; kind: string }[] = [];
    for (const p of Object.values(comp.plants)) if (p.seen.pest && p.seen.pestLevel > 0.28) out.push({ x: p.x, z: p.z, level: p.seen.pestLevel, kind: p.seen.pest });
    return out;
  }, [comp]);
  const ref = useRef<Group>(null);
  useFrame(({ clock }) => {
    if (!ref.current) return;
    ref.current.children.forEach((ch, i) => {
      const s = 1 + Math.sin(clock.elapsedTime * 2.2 + i) * 0.15;
      ch.scale.set(s, 1, s);
    });
  });
  if (lens !== "pests") return null;
  return (
    <group ref={ref}>
      {spots.map((s, i) => (
        <group key={i} position={[s.x, 0.1, s.z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.5, 0.62 + s.level * 0.5, 24]} />
            <meshBasicMaterial color={s.kind === "Botrytis" ? C.red : C.amber} transparent opacity={0.75} toneMapped={false} />
          </mesh>
          <mesh position={[0, 3.9, 0]}>
            <octahedronGeometry args={[0.14 + s.level * 0.1, 0]} />
            <meshBasicMaterial color={s.kind === "Botrytis" ? C.red : C.amber} toneMapped={false} />
          </mesh>
        </group>
      ))}
    </group>
  );
}
