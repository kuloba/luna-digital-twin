import { Edges } from "@react-three/drei";
import type { ThreeEvent } from "@react-three/fiber";
import type { ReactNode } from "react";
import { C } from "@/lib/theme";
import { twin, useTwin } from "@/sim/store";

/**
 * Wraps any group of meshes so it behaves as one selectable asset:
 * hover sets the cursor + hover state, click selects, and the asset's id
 * is the single source of truth for everything else in the UI.
 */
export function Pickable({ id, children, position, rotationY = 0 }: { id: string; children: ReactNode; position?: [number, number, number]; rotationY?: number }) {
  return (
    <group
      position={position}
      rotation={[0, rotationY, 0]}
      onPointerOver={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        twin().hover(id);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={(e: ThreeEvent<PointerEvent>) => {
        e.stopPropagation();
        if (twin().hoveredId === id) twin().hover(undefined);
        document.body.style.cursor = "";
      }}
      onClick={(e: ThreeEvent<MouseEvent>) => {
        e.stopPropagation();
        if (e.delta > 4) return; // ignore drags
        twin().select(id);
      }}
    >
      {children}
    </group>
  );
}

/** A box with crisp blueprint edges. Origin at the bottom centre. */
export function Block({
  size,
  position = [0, 0, 0],
  color = C.white,
  edge = C.wallEdge,
  opacity = 1,
  edges = true,
  cast = true,
  receive = true,
  emissive,
  emissiveIntensity = 0,
  roughness = 0.85,
  metalness = 0,
  threshold = 15,
}: {
  size: [number, number, number];
  position?: [number, number, number];
  color?: string;
  edge?: string;
  opacity?: number;
  edges?: boolean;
  cast?: boolean;
  receive?: boolean;
  emissive?: string;
  emissiveIntensity?: number;
  roughness?: number;
  metalness?: number;
  threshold?: number;
}) {
  const [w, h, d] = size;
  const transparent = opacity < 1;
  return (
    <mesh position={[position[0], position[1] + h / 2, position[2]]} castShadow={cast && !transparent} receiveShadow={receive}>
      <boxGeometry args={[w, h, d]} />
      <meshStandardMaterial
        color={color}
        transparent={transparent}
        opacity={opacity}
        depthWrite={!transparent}
        roughness={roughness}
        metalness={metalness}
        emissive={emissive ?? "#000000"}
        emissiveIntensity={emissiveIntensity}
      />
      {edges ? <Edges color={edge} threshold={threshold} /> : null}
    </mesh>
  );
}

/** Small status light — colour follows the asset's live status. */
export function StatusLight({ id, position, radius = 0.16 }: { id: string; position: [number, number, number]; radius?: number }) {
  const status = useTwin((s) => s.sim.assets[id]?.status ?? "IDLE");
  const color = status === "ALERT" ? C.red : status === "WATCH" ? C.amber : status === "CHARGING" ? C.blue : status === "IDLE" ? "#a3afbc" : C.green;
  return (
    <mesh position={position}>
      <cylinderGeometry args={[radius, radius, 0.12, 16]} />
      <meshStandardMaterial color={color} emissive={color} emissiveIntensity={status === "IDLE" ? 0.1 : 0.9} toneMapped={false} />
    </mesh>
  );
}
