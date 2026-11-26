import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import { BoxGeometry, Color, CylinderGeometry, type Group, type InstancedMesh, Object3D, type Mesh } from "three";
import { C, cropColor, liquidColor as LIQUID } from "@/lib/theme";
import { COLD_ROOMS, TANKS, TOWER_ROWS, TOWER_SIZE, TOWER_TIERS, TOWER_TIER_HEIGHT, towerZ } from "@/sim/layout";
import { twin, useTwin } from "@/sim/store";
import { Block, Pickable, StatusLight } from "./primitives";

const tmp = new Object3D();
const tmpColor = new Color();

/* ------------------------------------------------------------------ */
/* Vertical farm                                                      */
/* ------------------------------------------------------------------ */

/**
 * All 32 towers share a handful of instanced meshes (frames, shelves, LED
 * bars, plants, fruit, risers, status lights): ~10 draw calls instead of
 * ~640. Each tower keeps an invisible hit box so it stays clickable.
 */
const TOWERS = TOWER_ROWS.flatMap(({ row, x }) => Array.from({ length: 8 }, (_, i) => ({ id: `${row}-${String(i + 1).padStart(2, "0")}`, x, z: towerZ(i) })));
const PLANTS_X = 2;
const PLANTS_Z = 6;
const PER_TOWER = TOWER_TIERS * PLANTS_X * PLANTS_Z;
const FRUIT_PER_TOWER = TOWER_TIERS * 6;
const LED_ON = new Color(C.led);
const LED_OFF = new Color("#d9ccd5");
const PIPE_IDLE = new Color(C.water).lerp(new Color("#ffffff"), 0.62);
const PIPE_ON = new Color(C.water);
const PIPE_HI = new Color("#bfe3ff");

interface TowerLook {
  crop?: string;
  growth: number;
  irrigating: boolean;
  status: string;
  lit: boolean;
}

export function GrowTowers() {
  const [w, , d] = TOWER_SIZE;
  // One string per tick: the component re-renders only when a tower's look changes.
  const key = useTwin((s) =>
    TOWERS.map(({ id }) => {
      const a = s.sim.assets[id];
      const b = a?.batchId ? s.sim.batches[a.batchId] : undefined;
      const g = b ? Math.round(Math.min(1, Math.max(0.15, b.cycleDay / b.cycleDays)) * 20) / 20 : 0;
      const irr = a?.activity === "Irrigating" || a?.activity === "Flushing";
      return `${b?.cropType ?? ""}:${g}:${irr ? 1 : 0}:${a?.status ?? "IDLE"}:${a?.batchId ? 1 : 0}`;
    }).join("|"),
  );
  const looks = useMemo<TowerLook[]>(
    () =>
      key.split("|").map((p) => {
        const [crop, g, irr, status, lit] = p.split(":");
        return { crop: crop || undefined, growth: Number(g), irrigating: irr === "1", status, lit: lit === "1" };
      }),
    [key],
  );
  const posts = useRef<InstancedMesh>(null);
  const shelves = useRef<InstancedMesh>(null);
  const leds = useRef<InstancedMesh>(null);
  const plants = useRef<InstancedMesh>(null);
  const fruit = useRef<InstancedMesh>(null);
  const pipes = useRef<InstancedMesh>(null);
  const lights = useRef<InstancedMesh>(null);

  // Frames and shelves never change.
  useLayoutEffect(() => {
    const p = posts.current;
    const sh = shelves.current;
    const pi = pipes.current;
    if (!p || !sh || !pi) return;
    let n = 0;
    let k = 0;
    TOWERS.forEach((t, ti) => {
      for (const [px, pz] of [
        [-w / 2, -d / 2],
        [w / 2, -d / 2],
        [-w / 2, d / 2],
        [w / 2, d / 2],
      ]) {
        tmp.position.set(t.x + px, TOWER_SIZE[1] / 2, t.z + pz);
        tmp.rotation.set(0, 0, 0);
        tmp.scale.set(1, 1, 1);
        tmp.updateMatrix();
        p.setMatrixAt(n++, tmp.matrix);
      }
      for (let tier = 0; tier < TOWER_TIERS; tier++) {
        tmp.position.set(t.x, tier * TOWER_TIER_HEIGHT + 0.1, t.z);
        tmp.updateMatrix();
        sh.setMatrixAt(k++, tmp.matrix);
      }
      tmp.position.set(t.x + w / 2 + 0.12, TOWER_SIZE[1] / 2, t.z - d / 2 + 0.15);
      tmp.updateMatrix();
      pi.setMatrixAt(ti, tmp.matrix);
    });
    p.instanceMatrix.needsUpdate = true;
    sh.instanceMatrix.needsUpdate = true;
    pi.instanceMatrix.needsUpdate = true;
  }, [w, d]);

  useLayoutEffect(() => {
    const m = plants.current;
    const f = fruit.current;
    const l = leds.current;
    const st = lights.current;
    const pi = pipes.current;
    if (!m || !f || !l || !st || !pi) return;
    let n = 0;
    let k = 0;
    let e = 0;
    looks.forEach((look, ti) => {
      const t = TOWERS[ti];
      const crop = look.crop as keyof typeof cropColor | undefined;
      const leaf = crop ? cropColor[crop].leaf : "#8fb98a";
      let local = 0;
      for (let tier = 0; tier < TOWER_TIERS; tier++) {
        for (let ix = 0; ix < PLANTS_X; ix++) {
          for (let iz = 0; iz < PLANTS_Z; iz++) {
            const s = crop ? (0.22 + look.growth * 0.2) * (0.9 + ((local * 7) % 5) * 0.04) : 0.0001;
            tmp.position.set(t.x + (ix - 0.5) * 0.52, 0.18 + tier * TOWER_TIER_HEIGHT + s * 0.35, t.z + (iz - 2.5) * 0.31);
            tmp.scale.set(s, s * (crop === "BASIL" || crop === "KALE" ? 1.15 : 0.7), s);
            tmp.rotation.set(0, local * 0.7, 0);
            tmp.updateMatrix();
            m.setMatrixAt(n, tmp.matrix);
            tmpColor.set(leaf).offsetHSL(0, 0, ((local * 13) % 7) * 0.012 - 0.03);
            m.setColorAt(n, tmpColor);
            n++;
            local++;
          }
        }
        for (let i = 0; i < 6; i++) {
          const show = crop === "STRAWBERRY";
          tmp.position.set(t.x + (i % 2 ? 0.34 : -0.34), 0.05 + tier * TOWER_TIER_HEIGHT, t.z - 0.8 + i * 0.32);
          tmp.rotation.set(0, 0, 0);
          tmp.scale.setScalar(show ? 0.075 : 0.0001);
          tmp.updateMatrix();
          f.setMatrixAt(k++, tmp.matrix);
        }
        tmp.position.set(t.x, tier * TOWER_TIER_HEIGHT + TOWER_TIER_HEIGHT - 0.06, t.z);
        tmp.scale.set(1, 1, 1);
        tmp.updateMatrix();
        l.setMatrixAt(e, tmp.matrix);
        l.setColorAt(e, look.lit ? LED_ON : LED_OFF);
        e++;
      }
      tmp.position.set(t.x, TOWER_SIZE[1] + 0.08, t.z);
      tmp.updateMatrix();
      st.setMatrixAt(ti, tmp.matrix);
      tmpColor.set(towerLight(look.status));
      st.setColorAt(ti, tmpColor);
      pi.setColorAt(ti, look.irrigating ? PIPE_ON : PIPE_IDLE);
    });
    for (const mesh of [m, f, l, st, pi]) {
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
  }, [looks]);

  // Risers pulse while a tower irrigates.
  useFrame(({ clock }) => {
    const pi = pipes.current;
    if (!pi) return;
    let any = false;
    const pulse = 0.5 + Math.sin(clock.elapsedTime * 6) * 0.5;
    looks.forEach((look, ti) => {
      if (!look.irrigating) return;
      any = true;
      tmpColor.copy(PIPE_ON).lerp(PIPE_HI, pulse);
      pi.setColorAt(ti, tmpColor);
    });
    if (any && pi.instanceColor) pi.instanceColor.needsUpdate = true;
  });

  return (
    <group>
      <instancedMesh ref={posts} args={[undefined, undefined, TOWERS.length * 4]} castShadow>
        <boxGeometry args={[0.07, TOWER_SIZE[1], 0.07]} />
        <meshStandardMaterial color={C.steel} roughness={0.6} />
      </instancedMesh>
      <instancedMesh ref={shelves} args={[undefined, undefined, TOWERS.length * TOWER_TIERS]} castShadow receiveShadow>
        <boxGeometry args={[w - 0.08, 0.06, d - 0.08]} />
        <meshStandardMaterial color="#e9edf1" roughness={0.7} />
      </instancedMesh>
      <instancedMesh ref={leds} args={[undefined, undefined, TOWERS.length * TOWER_TIERS]}>
        <boxGeometry args={[w - 0.25, 0.035, d - 0.2]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={plants} args={[undefined, undefined, TOWERS.length * PER_TOWER]} castShadow>
        <icosahedronGeometry args={[1, 1]} />
        <meshStandardMaterial roughness={0.9} flatShading />
      </instancedMesh>
      <instancedMesh ref={fruit} args={[undefined, undefined, TOWERS.length * FRUIT_PER_TOWER]}>
        <sphereGeometry args={[1, 8, 6]} />
        <meshStandardMaterial color={C.red} roughness={0.5} />
      </instancedMesh>
      <instancedMesh ref={pipes} args={[undefined, undefined, TOWERS.length]}>
        <cylinderGeometry args={[0.06, 0.06, TOWER_SIZE[1], 8]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={lights} args={[undefined, undefined, TOWERS.length]}>
        <cylinderGeometry args={[0.14, 0.14, 0.12, 16]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      {TOWERS.map((t) => (
        <Pickable key={t.id} id={t.id} position={[t.x, 0, t.z]}>
          {/* invisible hit box so the whole tower is easy to click */}
          <mesh position={[0, TOWER_SIZE[1] / 2, 0]} visible={false}>
            <boxGeometry args={[w + 0.2, TOWER_SIZE[1], d + 0.2]} />
          </mesh>
        </Pickable>
      ))}
    </group>
  );
}

function towerLight(status: string) {
  return status === "ALERT" ? C.red : status === "WATCH" ? C.amber : status === "CHARGING" ? C.blue : status === "IDLE" ? "#a3afbc" : C.green;
}

export function RoomPlant() {
  return (
    <group>
      {(["HVAC-V1", "HVAC-V2"] as const).map((id, i) => (
        <Pickable key={id} id={id} position={[i === 0 ? -36.2 : -17.2, 5.4, -27]}>
          <Block size={[2.6, 1.3, 3.4]} color="#f3f5f7" edge={C.wallEdge} />
          <Fan position={[0, 1.32, -0.75]} />
          <Fan position={[0, 1.32, 0.85]} />
          <StatusLight id={id} position={[1.1, 1.42, 1.5]} />
          {/* duct down to the room */}
          <Block size={[0.8, 5.4, 0.8]} position={[0.6, -5.4, -1.2]} color="#eef1f4" edge={C.wallEdge} />
        </Pickable>
      ))}
      {(["DOS-V1", "DOS-V2"] as const).map((id, i) => (
        <Pickable key={id} id={id} position={[i === 0 ? -23.2 : -4.2, 0, -27.6]}>
          <Block size={[2.4, 1.6, 1.4]} color={C.white} edge={C.wallEdge} />
          {[-0.75, -0.25, 0.25, 0.75].map((x, k) => (
            <mesh key={k} position={[x, 2.05, 0]} castShadow>
              <cylinderGeometry args={[0.18, 0.18, 0.9, 16]} />
              <meshStandardMaterial color={k === 0 ? "#7aa7d8" : k === 1 ? "#8fbf7a" : k === 2 ? "#c4a24f" : "#d0d6dc"} roughness={0.4} transparent opacity={0.9} />
            </mesh>
          ))}
          <mesh position={[0, 1.0, 0.71]}>
            <planeGeometry args={[0.9, 0.45]} />
            <meshStandardMaterial color="#14202e" emissive="#2a6cb3" emissiveIntensity={0.5} />
          </mesh>
          <StatusLight id={id} position={[1.05, 1.68, 0.5]} />
        </Pickable>
      ))}
    </group>
  );
}

function Fan({ position }: { position: [number, number, number] }) {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 6;
  });
  return (
    <group position={position}>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.62, 24]} />
        <meshStandardMaterial color="#2d3a4a" />
      </mesh>
      <group ref={ref} userData={{ dynamic: true }} position={[0, 0.03, 0]}>
        {[0, 1, 2].map((k) => (
          <mesh key={k} rotation={[0, (k * Math.PI * 2) / 3, 0]} position={[0, 0, 0]}>
            <boxGeometry args={[1.1, 0.02, 0.16]} />
            <meshStandardMaterial color="#9aa8b6" />
          </mesh>
        ))}
      </group>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Propagation                                                        */
/* ------------------------------------------------------------------ */

export function Propagation() {
  const trays = useRef<InstancedMesh>(null);
  const N = 14;
  useFrame(({ clock }) => {
    const m = trays.current;
    if (!m) return;
    for (let i = 0; i < N; i++) {
      const z = -27 + (((clock.elapsedTime * 0.9 + i * (19 / N)) % 19) + 19) % 19;
      tmp.position.set(0, 0.95, z);
      tmp.scale.set(1, 1, 1);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  });
  return (
    <group>
      <Pickable id="SEED-01" position={[-54.5, 0, 0]}>
        {/* conveyor */}
        <Block size={[1.4, 0.8, 20]} position={[0, 0, -18]} color={C.white} edge={C.wallEdge} />
        <mesh position={[0, 0.82, -18]}>
          <boxGeometry args={[1.2, 0.04, 20]} />
          <meshStandardMaterial color={C.belt} roughness={0.8} />
        </mesh>
        <instancedMesh ref={trays} args={[undefined, undefined, N]} castShadow>
          <boxGeometry args={[1, 0.12, 0.6]} />
          <meshStandardMaterial color="#6d5a45" roughness={1} />
        </instancedMesh>
        {/* seeder head + hopper */}
        <Block size={[2.4, 1.2, 2.2]} position={[0, 0.8, -24]} color={C.white} edge={C.wallEdge} />
        <mesh position={[0, 2.6, -24]} rotation={[Math.PI, 0, 0]} castShadow>
          <coneGeometry args={[0.8, 1.1, 4]} />
          <meshStandardMaterial color="#dfe5ea" />
        </mesh>
        {/* substrate filler */}
        <Block size={[2.2, 1.6, 2]} position={[0, 0.8, -12.5]} color="#f3f5f7" edge={C.wallEdge} />
        <StatusLight id="SEED-01" position={[0.9, 2.1, -24]} />
      </Pickable>
      {[0, 1, 2].map((i) => {
        const id = `GERM-0${i + 1}`;
        return (
          <Pickable key={id} id={id} position={[-45.5, 0, -25 + i * 7.4]}>
            <Block size={[6, 3, 5.2]} color="#f8fafc" edge={C.wallEdge} />
            {/* glazed front shows racks inside */}
            <mesh position={[3.02, 1.5, 0]} rotation={[0, Math.PI / 2, 0]}>
              <planeGeometry args={[4.6, 2.4]} />
              <meshStandardMaterial color="#cfe6c4" emissive="#9fd18a" emissiveIntensity={i === 2 ? 0.05 : 0.25} transparent opacity={0.65} />
            </mesh>
            {[0.6, 1.3, 2.0].map((y) => (
              <mesh key={y} position={[3.05, y, 0]} rotation={[0, Math.PI / 2, 0]}>
                <planeGeometry args={[4.3, 0.08]} />
                <meshBasicMaterial color="#5c7a52" />
              </mesh>
            ))}
            <StatusLight id={id} position={[2.4, 3.08, -2]} />
          </Pickable>
        );
      })}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Harvest, line, QA, pack                                            */
/* ------------------------------------------------------------------ */

function RobotArm({ active }: { active: boolean }) {
  const base = useRef<Group>(null);
  const upper = useRef<Group>(null);
  const fore = useRef<Group>(null);
  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    const k = active ? 1 : 0.08;
    if (base.current) base.current.rotation.y = Math.sin(t * 0.9) * 1.1 * k;
    if (upper.current) upper.current.rotation.z = -0.5 + Math.sin(t * 1.8) * 0.35 * k;
    if (fore.current) fore.current.rotation.z = 1.2 + Math.cos(t * 1.8) * 0.4 * k;
  });
  return (
    <group>
      <mesh position={[0, 0.25, 0]} castShadow>
        <cylinderGeometry args={[0.55, 0.65, 0.5, 24]} />
        <meshStandardMaterial color={C.white} />
      </mesh>
      <group ref={base} userData={{ dynamic: true }} position={[0, 0.5, 0]}>
        <mesh position={[0, 0.25, 0]} castShadow>
          <cylinderGeometry args={[0.38, 0.38, 0.5, 20]} />
          <meshStandardMaterial color={C.luna} roughness={0.5} />
        </mesh>
        <group ref={upper} position={[0, 0.5, 0]}>
          <mesh position={[0.75, 0, 0]} castShadow>
            <boxGeometry args={[1.5, 0.26, 0.3]} />
            <meshStandardMaterial color={C.white} />
          </mesh>
          <group ref={fore} position={[1.5, 0, 0]}>
            <mesh position={[0.6, 0, 0]} castShadow>
              <boxGeometry args={[1.2, 0.2, 0.24]} />
              <meshStandardMaterial color={C.white} />
            </mesh>
            <mesh position={[1.25, 0, 0]} castShadow>
              <boxGeometry args={[0.18, 0.36, 0.36]} />
              <meshStandardMaterial color={C.steel} />
            </mesh>
          </group>
        </group>
      </group>
    </group>
  );
}

function HarvesterCell({ id, position }: { id: string; position: [number, number, number] }) {
  const active = useTwin((s) => s.sim.assets[id]?.status === "ACTIVE");
  return (
    <Pickable id={id} position={position}>
      {/* safety fence */}
      {[
        [0, -1.9, 3.8, 0.05],
        [0, 1.9, 3.8, 0.05],
        [-1.9, 0, 0.05, 3.8],
      ].map(([x, z, w, d], i) => (
        <mesh key={i} position={[x, 0.7, z]}>
          <boxGeometry args={[w, 1.4, d]} />
          <meshStandardMaterial color="#f6c25b" transparent opacity={0.35} depthWrite={false} />
        </mesh>
      ))}
      <Block size={[2.6, 0.7, 1.6]} position={[0.3, 0, -0.9]} color={C.white} edge={C.wallEdge} />
      <group position={[-0.6, 0, 0.6]}>
        <RobotArm active={active} />
      </group>
      <StatusLight id={id} position={[1.5, 0.78, -1.5]} />
      <mesh position={[0, 1.3, 0]} visible={false}>
        <boxGeometry args={[3.8, 2.6, 3.8]} />
      </mesh>
    </Pickable>
  );
}

/** The cutting / grading / packing line that runs through Harvest → QA → Pack. */
function ProcessLine() {
  const items = useRef<InstancedMesh>(null);
  const N = 70;
  const x0 = 3;
  const x1 = 56.5;
  useFrame(({ clock }) => {
    const m = items.current;
    if (!m) return;
    const len = x1 - x0;
    for (let i = 0; i < N; i++) {
      const x = x0 + ((clock.elapsedTime * 1.2 + (i * len) / N) % len);
      const packed = x > 49;
      tmp.position.set(x, 0.98, -21 + Math.sin(i * 12.9) * 0.18);
      tmp.scale.set(packed ? 0.42 : 0.32, packed ? 0.2 : 0.24, packed ? 0.32 : 0.32);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
      m.setColorAt(i, tmpColor.set(packed ? "#e9f0f4" : x > 21 && x < 36 && i % 11 === 0 ? "#c9b94e" : "#8ccc63"));
    }
    m.instanceMatrix.needsUpdate = true;
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  return (
    <Pickable id="CUT-01">
      <mesh position={[(x0 + x1) / 2, 0.42, -21]} castShadow receiveShadow>
        <boxGeometry args={[x1 - x0, 0.84, 1.3]} />
        <meshStandardMaterial color={C.white} />
      </mesh>
      <mesh position={[(x0 + x1) / 2, 0.86, -21]}>
        <boxGeometry args={[x1 - x0, 0.03, 1.1]} />
        <meshStandardMaterial color={C.belt} roughness={0.9} />
      </mesh>
      <instancedMesh ref={items} args={[undefined, undefined, N]} castShadow>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial roughness={0.7} />
      </instancedMesh>
    </Pickable>
  );
}

function ScanTunnel() {
  const beam = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (beam.current) beam.current.position.x = Math.sin(clock.elapsedTime * 2.4) * 1.3;
  });
  return (
    <Pickable id="QA-02" position={[31, 0, -21]}>
      <Block size={[3.4, 0.3, 1.9]} position={[0, 1.95, 0]} color="#f3f5f7" edge={C.wallEdge} />
      <Block size={[3.4, 2.0, 0.22]} position={[0, 0, -0.95]} color="#f3f5f7" edge={C.wallEdge} />
      <Block size={[3.4, 2.0, 0.22]} position={[0, 0, 0.95]} color="#f3f5f7" edge={C.wallEdge} opacity={0.5} />
      <mesh ref={beam} userData={{ dynamic: true }} position={[0, 1.35, 0]}>
        <boxGeometry args={[0.05, 1.1, 1.6]} />
        <meshBasicMaterial color="#5fb4ff" transparent opacity={0.55} toneMapped={false} />
      </mesh>
      <StatusLight id="QA-02" position={[1.4, 2.32, 0.6]} />
      <mesh position={[0, 1.1, 0]} visible={false}>
        <boxGeometry args={[3.6, 2.4, 2.2]} />
      </mesh>
    </Pickable>
  );
}

function Sealer() {
  const head = useRef<Mesh>(null);
  useFrame(({ clock }) => {
    if (head.current) head.current.position.y = 1.65 + Math.abs(Math.sin(clock.elapsedTime * 3.3)) * 0.35;
  });
  return (
    <Pickable id="SEAL-01" position={[50.5, 0, -21]}>
      <Block size={[3.2, 0.3, 2.2]} position={[0, 2.2, 0]} color={C.white} edge={C.wallEdge} />
      {[-1.45, 1.45].map((x) => (
        <Block key={x} size={[0.25, 2.2, 2.2]} position={[x, 0, 0]} color={C.white} edge={C.wallEdge} />
      ))}
      <mesh ref={head} userData={{ dynamic: true }} position={[0, 1.7, 0]} castShadow>
        <boxGeometry args={[1.6, 0.3, 1.2]} />
        <meshStandardMaterial color={C.steel} />
      </mesh>
      <StatusLight id="SEAL-01" position={[1.3, 2.58, 0.8]} />
    </Pickable>
  );
}

export function HarvestToPack() {
  const lineBatch = useTwin((s) => s.sim.assets["HRV-01"]?.status);
  void lineBatch;
  return (
    <group>
      <HarvesterCell id="HRV-01" position={[7, 0, -14]} />
      <HarvesterCell id="HRV-02" position={[15, 0, -14]} />
      {/* tray de-stacker feeding the harvesters */}
      <Block size={[4, 1.2, 2.2]} position={[5.5, 0, -7.6]} color="#f3f5f7" edge={C.wallEdge} />
      <ProcessLine />
      <Pickable id="QA-01" position={[25.5, 0, -21]}>
        <Block size={[2.4, 1.25, 1.8]} color={C.white} edge={C.wallEdge} />
        <mesh position={[0, 1.7, -0.6]}>
          <boxGeometry args={[0.9, 0.55, 0.06]} />
          <meshStandardMaterial color="#14202e" emissive="#3c9a62" emissiveIntensity={0.6} />
        </mesh>
        <StatusLight id="QA-01" position={[1, 1.32, 0.7]} />
      </Pickable>
      <ScanTunnel />
      <Pickable id="QA-03" position={[31.5, 0, -26.5]}>
        <Block size={[6, 2.6, 4]} color="#fbfcfd" edge={C.wallEdge} opacity={0.55} />
        <Block size={[2.2, 0.9, 0.8]} position={[-1.4, 0, -1.3]} color="#e8edf2" edge={C.wallEdge} />
        <Block size={[1.2, 1.6, 0.8]} position={[1.8, 0, -1.3]} color="#e8edf2" edge={C.wallEdge} />
        <StatusLight id="QA-03" position={[2.6, 2.68, 1.6]} />
      </Pickable>
      <Pickable id="WASH-01" position={[43, 0, -21]}>
        <Block size={[4.2, 1.3, 2.4]} color={C.white} edge={C.wallEdge} />
        <mesh position={[0, 1.32, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[3.8, 2]} />
          <meshStandardMaterial color="#7cc3ec" emissive="#4aa3d9" emissiveIntensity={0.25} transparent opacity={0.8} />
        </mesh>
        <StatusLight id="WASH-01" position={[1.8, 1.42, 1]} />
      </Pickable>
      <Sealer />
      {/* outfeed pallets */}
      {[0, 1, 2].map((i) => (
        <group key={i} position={[53.5 + (i % 2) * 2, 0, -11 - Math.floor(i / 2) * 2.2]}>
          <Block size={[1.6, 0.15, 1.6]} color="#c9a26b" edge="#a3825a" />
          <Block size={[1.5, 1.1 + i * 0.2, 1.5]} position={[0, 0.15, 0]} color="#f1f4f7" edge={C.wallEdge} />
        </group>
      ))}
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Cold chain                                                         */
/* ------------------------------------------------------------------ */

export function ColdChain() {
  return (
    <group>
      {COLD_ROOMS.map((r) => (
        <ColdRoom key={r.id} id={r.id} bounds={r.bounds} />
      ))}
      {[43, 49, 55].map((x, i) => (
        <Pickable key={i} id={`DOCK-${i + 1}`} position={[x, 0, 32]}>
          <Block size={[3.4, 3.4, 0.25]} color="#dfe5eb" edge={C.wallEdge} />
          <mesh position={[0, 0.06, 1.2]} rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[3.2, 2.2]} />
            <meshBasicMaterial color="#f2c04e" transparent opacity={0.4} />
          </mesh>
        </Pickable>
      ))}
      {["TRK-1", "TRK-2", "TRK-3"].map((id, i) => (
        <Truck key={id} id={id} x={43 + i * 6} />
      ))}
      {/* staging pallets in dispatch */}
      {Array.from({ length: 8 }, (_, i) => (
        <group key={i} position={[41 + (i % 4) * 2.2, 0, 22 + Math.floor(i / 4) * 2.4]}>
          <Block size={[1.6, 0.15, 1.6]} color="#c9a26b" edge="#a3825a" />
          <Block size={[1.5, 1.3, 1.5]} position={[0, 0.15, 0]} color="#eef6fb" edge={C.wallEdge} />
        </group>
      ))}
    </group>
  );
}

function ColdRoom({ id, bounds }: { id: string; bounds: [number, number, number, number] }) {
  const [x0, z0, x1, z1] = bounds;
  const w = x1 - x0;
  const d = z1 - z0;
  const doorOpen = useTwin((s) => (s.sim.assets[id]?.metrics.doorOpen?.value ?? 0) > 0.5);
  const door = useRef<Group>(null);
  useFrame((_, dt) => {
    if (door.current) door.current.rotation.y += ((doorOpen ? -1.4 : 0) - door.current.rotation.y) * Math.min(1, dt * 3);
  });
  const shellEdges = useMemo(() => new BoxGeometry(w, 4.6, d), [w, d]);
  const pallets = useMemo(() => {
    const out: [number, number, number][] = [];
    const n = id === "CR-1" ? 22 : 18;
    for (let i = 0; i < n; i++) out.push([x0 + 2 + (i % 6) * 2.2, 0, z0 + 2.4 + Math.floor(i / 6) * 3.6]);
    return out;
  }, [id, x0, z0]);
  return (
    <Pickable id={id}>
      <mesh position={[(x0 + x1) / 2, 2.3, (z0 + z1) / 2]}>
        <boxGeometry args={[w, 4.6, d]} />
        <meshStandardMaterial color="#e6f2fa" transparent opacity={0.28} depthWrite={false} />
      </mesh>
      <lineSegments position={[(x0 + x1) / 2, 2.3, (z0 + z1) / 2]}>
        <edgesGeometry args={[shellEdges]} />
        <lineBasicMaterial color="#7fa6bf" />
      </lineSegments>
      {pallets.map((p, i) => (
        <group key={i} position={p}>
          <Block size={[1.6, 0.14, 1.6]} color="#c9a26b" edge="#a3825a" edges={false} />
          <Block size={[1.5, 1.2 + ((i * 7) % 4) * 0.2, 1.5]} position={[0, 0.14, 0]} color="#f4f8fb" edge="#9db4c4" />
        </group>
      ))}
      {/* door on the corridor side */}
      <group ref={door} userData={{ dynamic: true }} position={[(x0 + x1) / 2 - 1.5, 0, z0]}>
        <Block size={[3, 3.2, 0.14]} position={[1.5, 0, 0]} color={doorOpen ? "#f7d58a" : "#dbe7ef"} edge="#7fa6bf" />
      </group>
      <StatusLight id={id} position={[x1 - 0.8, 4.7, z0 + 0.8]} radius={0.22} />
    </Pickable>
  );
}

function Truck({ id, x }: { id: string; x: number }) {
  const ref = useRef<Group>(null);
  const departed = useTwin((s) => s.sim.assets[id]?.activity.startsWith("Sealed"));
  useFrame((_, dt) => {
    if (!ref.current) return;
    const target = departed ? 70 : 40;
    ref.current.position.z += (target - ref.current.position.z) * Math.min(1, dt * 0.25);
  });
  return (
    <group ref={ref} userData={{ dynamic: true }} position={[x, 0, 40]}>
      <Pickable id={id}>
        {/* reefer box */}
        <Block size={[2.5, 2.9, 8.2]} position={[0, 0.9, -0.2]} color="#fbfcfd" edge={C.wallEdge} />
        <mesh position={[1.27, 2.3, -0.2]} rotation={[0, Math.PI / 2, 0]}>
          <planeGeometry args={[8.0, 0.35]} />
          <meshBasicMaterial color={C.slateBlue} />
        </mesh>
        {/* reefer unit */}
        <Block size={[2, 1.1, 0.5]} position={[0, 2.3, 4.15]} color="#dfe5eb" edge={C.wallEdge} />
        {/* cab */}
        <Block size={[2.4, 2.4, 2.3]} position={[0, 0.5, 5.6]} color="#4f6d8f" edge="#334155" />
        <mesh position={[0, 2.3, 6.77]}>
          <planeGeometry args={[2.1, 0.9]} />
          <meshStandardMaterial color="#1f2a37" roughness={0.2} />
        </mesh>
        {[-1.1, 1.1].map((wx) =>
          [-2.8, -1.6, 5.2].map((wz) => (
            <mesh key={`${wx}${wz}`} position={[wx, 0.45, wz]} rotation={[0, 0, Math.PI / 2]} castShadow>
              <cylinderGeometry args={[0.45, 0.45, 0.35, 16]} />
              <meshStandardMaterial color="#1f2937" />
            </mesh>
          )),
        )}
        <StatusLight id={id} position={[0, 3.85, -4]} />
      </Pickable>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/* Utilities yard: tanks                                              */
/* ------------------------------------------------------------------ */



export function TankFarm() {
  return (
    <group>
      {TANKS.map((t) => (
        <Tank key={t.id} {...t} />
      ))}
      {/* pipe rack from the yard into the building */}
      <Block size={[34, 0.25, 0.35]} position={[-38, 2.6, -34.2]} color={C.steelLight} edge={C.steel} />
      <Block size={[34, 0.25, 0.35]} position={[-38, 2.1, -34.2]} color="#a9c7e0" edge={C.steel} />
      {[-54, -46, -38, -30, -22].map((x) => (
        <Block key={x} size={[0.2, 2.7, 0.2]} position={[x, 0, -34.2]} color={C.steel} edge={C.steel} edges={false} />
      ))}
    </group>
  );
}

function Tank({ id, x, z, r, h, role }: (typeof TANKS)[number]) {
  const liquid = useRef<Mesh>(null);
  const level = useRef(0.5);
  const shellEdges = useMemo(() => new CylinderGeometry(r, r, h, 24, 1, true), [r, h]);
  useFrame((_, dt) => {
    const a = twin().sim.assets[id];
    const target = (a?.metrics.level?.value ?? 50) / 100;
    level.current += (target - level.current) * Math.min(1, dt * 2);
    if (liquid.current) {
      const lh = Math.max(0.02, h * level.current * 0.96);
      liquid.current.scale.y = lh;
      liquid.current.position.y = lh / 2 + 0.03;
    }
  });
  const open = role === "water";
  return (
    <Pickable id={id} position={[x, 0, z]}>
      {/* shell */}
      <mesh position={[0, h / 2, 0]}>
        <cylinderGeometry args={[r, r, h, 40, 1, open]} />
        <meshStandardMaterial color={role === "heat" ? "#f4f1ee" : "#f6f9fb"} transparent opacity={0.32} depthWrite={false} side={2} />
      </mesh>
      <lineSegments position={[0, h / 2, 0]}>
        <edgesGeometry args={[shellEdges, 30]} />
        <lineBasicMaterial color={C.wallEdge} />
      </lineSegments>
      {/* liquid */}
      <mesh ref={liquid} userData={{ dynamic: true }} position={[0, 0.5, 0]}>
        <cylinderGeometry args={[r * 0.95, r * 0.95, 1, 40]} />
        <meshStandardMaterial color={LIQUID[role]} transparent opacity={role === "co2" ? 0.55 : 0.82} roughness={0.2} emissive={LIQUID[role]} emissiveIntensity={0.12} />
      </mesh>
      {/* level ticks */}
      {[0.25, 0.5, 0.75].map((f) => (
        <mesh key={f} position={[0, h * f, r + 0.01]}>
          <boxGeometry args={[0.35, 0.03, 0.02]} />
          <meshBasicMaterial color={C.line} />
        </mesh>
      ))}
      {!open ? (
        <mesh position={[0, h + 0.02, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[r, 40]} />
          <meshStandardMaterial color="#eef2f5" transparent opacity={0.5} depthWrite={false} />
        </mesh>
      ) : null}
      <StatusLight id={id} position={[0, h + 0.12, 0]} />
    </Pickable>
  );
}


/* ------------------------------------------------------------------ */
/* LUNA edge node                                                     */
/* ------------------------------------------------------------------ */

export function EdgeNode() {
  const leds = useRef<InstancedMesh>(null);
  useFrame(({ clock }) => {
    const m = leds.current;
    if (!m) return;
    for (let i = 0; i < 12; i++) {
      const on = Math.sin(clock.elapsedTime * (6 + i) + i * 3) > 0.1;
      m.setColorAt(i, tmpColor.set(on ? (i % 4 === 0 ? C.luna : "#4ade80") : "#1f2937"));
    }
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  });
  useLayoutEffect(() => {
    const m = leds.current;
    if (!m) return;
    for (let i = 0; i < 12; i++) {
      tmp.position.set(-0.4 + (i % 4) * 0.16, 0.5 + Math.floor(i / 4) * 0.45, 0.56);
      tmp.scale.setScalar(1);
      tmp.updateMatrix();
      m.setMatrixAt(i, tmp.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  }, []);
  return (
    <Pickable id="EDGE-01" position={[-4.2, 0, 29.6]}>
      <Block size={[1.3, 2.1, 1.05]} color="#273444" edge="#0f172a" />
      <instancedMesh ref={leds} args={[undefined, undefined, 12]}>
        <boxGeometry args={[0.08, 0.05, 0.02]} />
        <meshBasicMaterial toneMapped={false} />
      </instancedMesh>
      <mesh position={[0, 2.2, 0]}>
        <boxGeometry args={[1.3, 0.08, 1.05]} />
        <meshBasicMaterial color={C.luna} toneMapped={false} />
      </mesh>
    </Pickable>
  );
}
