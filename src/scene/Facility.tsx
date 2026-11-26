import { Grid, Text } from "@react-three/drei";
import { useMemo } from "react";
import { BoxGeometry, EdgesGeometry } from "three";
import { C } from "@/lib/theme";
import { CHARGE_PADS, ZONES } from "@/sim/layout";
import { useTwin } from "@/sim/store";
import type { Zone } from "@/sim/types";

const FONT = "/fonts/geist-latin-600-normal.woff";
const MONO = "/fonts/geist-mono-latin-500-normal.woff";

/** Ground, building slab, zone floors and walls, corridor markings. */
export function Facility() {
  return (
    <group>
      <Ground />
      {ZONES.map((z) => (
        <ZoneShell key={z.id} zone={z} />
      ))}
      <Corridor />
      <AmrHub />
      <DockApron />
    </group>
  );
}

function Ground() {
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]} receiveShadow>
        <planeGeometry args={[600, 600]} />
        <meshStandardMaterial color={C.ground} roughness={1} />
      </mesh>
      <Grid
        position={[0, -0.01, 0]}
        args={[600, 600]}
        cellSize={2}
        cellThickness={0.5}
        cellColor="#d3dae1"
        sectionSize={10}
        sectionThickness={0.9}
        sectionColor="#c2cbd5"
        fadeDistance={260}
        fadeStrength={1.4}
        infiniteGrid
      />
      {/* Building slab */}
      <mesh position={[0, 0.0, 1]} receiveShadow>
        <boxGeometry args={[121, 0.04, 66]} />
        <meshStandardMaterial color={C.slab} roughness={1} />
      </mesh>
    </group>
  );
}

const zoneTint: Partial<Record<Zone["id"], string>> = {
  PROP: "#f3f7f2",
  V1: "#f4f5fa",
  V2: "#f4f5fa",
  HARV: "#f7f6f2",
  QA: "#f2f6f8",
  PACK: "#f6f6f6",
  COLD: "#f1f6fa",
};

function ZoneShell({ zone }: { zone: Zone }) {
  const [x0, z0, x1, z1] = zone.bounds;
  const w = x1 - x0;
  const d = z1 - z0;
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const focus = useTwin((s) => s.focus);
  const dim = focus !== "SITE" && focus !== zone.id;
  const isGlass = zone.id === "GH";
  const h = zone.wallHeight;
  const front = 0.5; // cut-away height for walls facing the camera
  const t = 0.14;
  const wallOpacity = isGlass ? 0.12 : dim ? 0.22 : 0.42;
  const wallColor = isGlass ? C.glass : C.wall;
  const edge = isGlass ? C.glassEdge : C.wallEdge;

  const walls = useMemo(
    () => [
      // north (back, full height)
      { p: [cx, 0, z0] as [number, number, number], s: [w, h, t] as [number, number, number] },
      // west (back, full height)
      { p: [x0, 0, cz] as [number, number, number], s: [t, h, d] as [number, number, number] },
      // south (front, cut away)
      { p: [cx, 0, z1] as [number, number, number], s: [w, isGlass ? h : front, t] as [number, number, number] },
      // east (front, cut away)
      { p: [x1, 0, cz] as [number, number, number], s: [t, isGlass ? h : front, d] as [number, number, number] },
    ],
    [cx, cz, d, h, isGlass, t, w, x0, x1, z0, z1],
  );

  return (
    <group>
      <mesh position={[cx, 0.03, cz]} receiveShadow>
        <boxGeometry args={[w, 0.04, d]} />
        <meshStandardMaterial color={zoneTint[zone.id] ?? C.slab} roughness={1} />
      </mesh>
      {walls.map((wl, i) => (
        <mesh key={i} position={[wl.p[0], wl.s[1] / 2, wl.p[2]]} renderOrder={2}>
          <boxGeometry args={wl.s} />
          <meshStandardMaterial color={wallColor} transparent opacity={i < 2 ? wallOpacity : Math.min(0.7, wallOpacity + 0.25)} depthWrite={false} roughness={0.4} />
        </mesh>
      ))}
      {walls.map((wl, i) => (
        <WallEdges key={`e${i}`} position={[wl.p[0], wl.s[1] / 2, wl.p[2]]} size={wl.s} color={edge} />
      ))}
      <Text
        font={FONT}
        position={[x0 + 0.9, 0.07, z0 + 1.2]}
        rotation={[-Math.PI / 2, 0, 0]}
        anchorX="left"
        anchorY="top"
        fontSize={zone.id === "GH" || zone.id === "COLD" ? 1.25 : 1.05}
        letterSpacing={0.06}
        color={C.line}
        fillOpacity={dim ? 0.25 : 0.55}
      >
        {zone.short.toUpperCase()}
      </Text>
      <Text font={MONO} position={[x0 + 0.9, 0.07, z0 + 2.75]} rotation={[-Math.PI / 2, 0, 0]} anchorX="left" anchorY="top" fontSize={0.62} color={C.line} fillOpacity={dim ? 0.2 : 0.42}>
        {`ZONE ${zone.hotkey} · ${zone.stage.replace("_", " ")}`}
      </Text>
    </group>
  );
}

function WallEdges({ position, size, color }: { position: [number, number, number]; size: [number, number, number]; color: string }) {
  const geo = useMemo(() => new EdgesGeometry(new BoxGeometry(size[0], size[1], size[2])), [size]);
  return (
    <lineSegments position={position} geometry={geo}>
      <lineBasicMaterial color={color} transparent opacity={0.85} />
    </lineSegments>
  );
}

function Corridor() {
  const dashes = useMemo(() => {
    const out: number[] = [];
    for (let x = -57; x < 58; x += 3) out.push(x);
    return out;
  }, []);
  const arrows = useMemo(() => {
    const out: number[] = [];
    for (let x = -52; x < 56; x += 14) out.push(x);
    return out;
  }, []);
  return (
    <group>
      <mesh position={[0, 0.035, 0]} receiveShadow>
        <boxGeometry args={[118, 0.03, 7.6]} />
        <meshStandardMaterial color="#e3e8ed" roughness={1} />
      </mesh>
      {dashes.map((x) => (
        <mesh key={x} position={[x + 0.75, 0.055, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1.5, 0.12]} />
          <meshBasicMaterial color="#b6c1cc" />
        </mesh>
      ))}
      {arrows.map((x) => (
        <group key={`a${x}`}>
          <LaneArrow x={x} z={-1.3} dir={1} />
          <LaneArrow x={x + 7} z={1.3} dir={-1} />
        </group>
      ))}
      <Text font={MONO} position={[-56.5, 0.07, 2.9]} rotation={[-Math.PI / 2, 0, 0]} anchorX="left" fontSize={0.55} color={C.line} fillOpacity={0.4}>
        AMR SPINE · 2-WAY · 1.5 m/s MAX
      </Text>
    </group>
  );
}

function LaneArrow({ x, z, dir }: { x: number; z: number; dir: 1 | -1 }) {
  return (
    <mesh position={[x, 0.056, z]} rotation={[-Math.PI / 2, 0, dir === 1 ? -Math.PI / 2 : Math.PI / 2]}>
      <circleGeometry args={[0.42, 3]} />
      <meshBasicMaterial color="#c3ccd6" />
    </mesh>
  );
}

function AmrHub() {
  return (
    <group>
      <mesh position={[0, 0.04, -15.5]} receiveShadow>
        <boxGeometry args={[3.6, 0.03, 19]} />
        <meshStandardMaterial color="#e8edf3" roughness={1} />
      </mesh>
      {CHARGE_PADS.map(([x, z], i) => (
        <group key={i} position={[x, 0.06, z]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]}>
            <planeGeometry args={[1.6, 2]} />
            <meshBasicMaterial color="#d6e2f2" />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, -0.85]}>
            <planeGeometry args={[1.2, 0.16]} />
            <meshBasicMaterial color={C.blue} transparent opacity={0.6} />
          </mesh>
        </group>
      ))}
      <Text font={MONO} position={[-1.6, 0.07, -25.2]} rotation={[-Math.PI / 2, 0, Math.PI / 2]} anchorX="left" fontSize={0.55} color={C.line} fillOpacity={0.5}>
        AMR HUB · 6 PADS
      </Text>
    </group>
  );
}

function DockApron() {
  return (
    <group>
      <mesh position={[49, 0.01, 40]} receiveShadow>
        <boxGeometry args={[20, 0.02, 15]} />
        <meshStandardMaterial color="#dfe4e9" roughness={1} />
      </mesh>
      {[40, 46, 52, 58].map((x) => (
        <mesh key={x} position={[x, 0.03, 40]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[0.14, 12]} />
          <meshBasicMaterial color="#f8f9fb" />
        </mesh>
      ))}
    </group>
  );
}
