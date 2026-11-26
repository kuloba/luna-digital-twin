import { CameraControls } from "@react-three/drei";
import { Canvas, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useRef } from "react";
import { MathUtils, Vector3 } from "three";
import { HUD } from "@/lib/hud";
import { useTwin } from "@/sim/store";
import { ColdChain, EdgeNode, GrowTowers, HarvestToPack, Propagation, RoomPlant, TankFarm } from "./Equipment";
import { Facility } from "./Facility";
import { Glasshouse } from "./Glasshouse";
import { AlertBeacons, FlowPaths, Heatmap, SelectionMarker, TraceRoute } from "./Overlays";
import { Robots } from "./Robots";
import { SpatialTags } from "./Tags";

export const AZIMUTH = MathUtils.degToRad(30);
export const POLAR = MathUtils.degToRad(52);
const DIR = new Vector3(Math.sin(POLAR) * Math.sin(AZIMUTH), Math.cos(POLAR), Math.sin(POLAR) * Math.cos(AZIMUTH));
const DIST = 220;

export function Scene() {
  const select = useTwin((s) => s.select);
  return (
    <Canvas
      orthographic
      shadows="soft"
      dpr={[1, 2]}
      camera={{ position: [DIR.x * DIST, DIR.y * DIST, DIR.z * DIST], zoom: 8, near: 1, far: 2000 }}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      onPointerMissed={(e) => {
        if (e.type === "click") select(undefined);
      }}
    >
      <Lights />
      <Rig />
      <Suspense fallback={null}>
        <Facility />
        <GrowTowers />
        <RoomPlant />
        <Propagation />
        <Glasshouse />
        <HarvestToPack />
        <ColdChain />
        <TankFarm />
        <EdgeNode />
        <Robots />
        <Heatmap />
        <FlowPaths />
        <TraceRoute />
        <AlertBeacons />
        <SelectionMarker />
        <SpatialTags />
      </Suspense>
    </Canvas>
  );
}

function Lights() {
  return (
    <>
      <ambientLight intensity={0.55} />
      <hemisphereLight args={["#ffffff", "#d9e0e6", 0.7]} />
      <directionalLight
        position={[-40, 90, 60]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[4096, 4096]}
        shadow-camera-left={-90}
        shadow-camera-right={90}
        shadow-camera-top={80}
        shadow-camera-bottom={-80}
        shadow-camera-near={1}
        shadow-camera-far={300}
        shadow-bias={-0.0004}
        shadow-normalBias={0.04}
      />
      <directionalLight position={[60, 40, -40]} intensity={0.35} />
    </>
  );
}

function Rig() {
  const ref = useRef<CameraControls>(null);
  const request = useTwin((s) => s.camera);
  const { size } = useThree();
  const first = useRef(true);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.mouseButtons.left = 2; // ACTION.TRUCK (pan)
    c.mouseButtons.right = 1; // ACTION.ROTATE
    c.mouseButtons.wheel = 16; // ACTION.ZOOM
    c.touches.one = 64; // TOUCH_TRUCK
    c.touches.two = 2048; // TOUCH_ZOOM_TRUCK
    c.dollyToCursor = true;
    c.minZoom = 2.5;
    c.maxZoom = 140;
    c.minPolarAngle = MathUtils.degToRad(22);
    c.maxPolarAngle = MathUtils.degToRad(72);
    c.smoothTime = 0.45;
    c.draggingSmoothTime = 0.12;
  }, []);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const [tx, ty, tz] = request.target;
    const [w, h, d] = request.extent;
    // Projected footprint of the region in the isometric view.
    const projW = Math.abs(w * Math.cos(AZIMUTH)) + Math.abs(d * Math.sin(AZIMUTH));
    const projH = (Math.abs(w * Math.sin(AZIMUTH)) + Math.abs(d * Math.cos(AZIMUTH))) * Math.cos(POLAR) + h * Math.sin(POLAR);
    const availW = Math.max(320, size.width - HUD.right - HUD.left - 32);
    const availH = Math.max(240, size.height - HUD.top - HUD.bottom - 16);
    // Leave a little air around zones and assets; the whole site fills the frame.
    const pad = w > 90 ? 1 : 0.86;
    const zoom = Math.min(availW / projW, availH / projH) * pad;
    const animate = !first.current;
    first.current = false;
    void c.setLookAt(tx + DIR.x * DIST, ty + DIR.y * DIST, tz + DIR.z * DIST, tx, ty, tz, animate);
    void c.zoomTo(zoom, animate);
    // Shift the framed region into the free area between the HUD panels.
    const offX = (HUD.right - HUD.left) / 2 / zoom;
    const offY = (HUD.bottom - HUD.top) / 2 / zoom;
    void c.setFocalOffset(offX, -offY, 0, animate);
  }, [request, size.width, size.height]);

  return <CameraControls ref={ref} makeDefault />;
}
