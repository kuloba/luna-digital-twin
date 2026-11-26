import { useFrame } from "@react-three/fiber";
import { useRef } from "react";
import type { Group, Mesh, MeshStandardMaterial } from "three";
import { C } from "@/lib/theme";
import { amrPose } from "@/sim/engine";
import { twin } from "@/sim/store";
import { Pickable } from "./primitives";
import { clockNow } from "@/lib/clock";

const IDS = Array.from({ length: 10 }, (_, i) => `AMR-${String(i + 1).padStart(2, "0")}`);

export function Robots() {
  return (
    <group>
      {IDS.map((id) => (
        <Amr key={id} id={id} />
      ))}
    </group>
  );
}

function Amr({ id }: { id: string }) {
  const root = useRef<Group>(null);
  const cargo = useRef<Group>(null);
  const light = useRef<Mesh>(null);
  const heading = useRef(0);

  useFrame(({ clock }, dt) => {
    const st = twin();
    const r = st.sim.amrs[id];
    const a = st.sim.assets[id];
    if (!r || !a || !root.current) return;
    const p = amrPose(r, st.sim.lastTickAt, clockNow());
    const g = root.current;
    g.position.x += (p.x - g.position.x) * Math.min(1, dt * 10);
    g.position.z += (p.z - g.position.z) * Math.min(1, dt * 10);
    if (p.moving) {
      let d = p.heading - heading.current;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      heading.current += d * Math.min(1, dt * 8);
    }
    g.rotation.y = heading.current;
    const loaded = (a.metrics.payload?.value ?? 0) > 0;
    if (cargo.current) cargo.current.visible = loaded;
    if (light.current) {
      const m = light.current.material as MeshStandardMaterial;
      const color = a.status === "WATCH" || a.status === "ALERT" ? C.amber : r.state === "CHARGING" ? C.blue : p.moving ? C.green : "#9aa8b6";
      m.color.set(color);
      m.emissive.set(color);
      m.emissiveIntensity = a.status === "WATCH" ? 0.6 + Math.sin(clock.elapsedTime * 8) * 0.5 : 0.9;
    }
  });

  return (
    <group ref={root}>
      <Pickable id={id}>
        <mesh position={[0, 0.22, 0]} castShadow>
          <boxGeometry args={[0.95, 0.34, 1.3]} />
          <meshStandardMaterial color={C.white} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.4, 0]}>
          <boxGeometry args={[0.85, 0.04, 1.18]} />
          <meshStandardMaterial color="#3b4656" />
        </mesh>
        {/* status light bar on the nose */}
        <mesh ref={light} position={[0, 0.24, 0.66]}>
          <boxGeometry args={[0.7, 0.08, 0.04]} />
          <meshStandardMaterial color={C.green} emissive={C.green} toneMapped={false} />
        </mesh>
        {/* lidar puck */}
        <mesh position={[0, 0.48, 0.45]}>
          <cylinderGeometry args={[0.09, 0.09, 0.1, 12]} />
          <meshStandardMaterial color="#1f2937" />
        </mesh>
        <group ref={cargo} position={[0, 0.42, 0]}>
          {[0, 1, 2, 3].map((k) => (
            <group key={k} position={[0, k * 0.16, 0]}>
              <mesh castShadow>
                <boxGeometry args={[0.8, 0.12, 1.1]} />
                <meshStandardMaterial color="#e9edf1" />
              </mesh>
              <mesh position={[0, 0.07, 0]}>
                <boxGeometry args={[0.7, 0.04, 1.0]} />
                <meshStandardMaterial color="#86c35a" />
              </mesh>
            </group>
          ))}
        </group>
        <mesh position={[0, 0.4, 0]} visible={false}>
          <boxGeometry args={[1.4, 1, 1.8]} />
        </mesh>
      </Pickable>
    </group>
  );
}
