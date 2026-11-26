import { CameraControls } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Suspense, useEffect, useRef, useState } from "react";
import { MathUtils, type OrthographicCamera, Vector3 } from "three";
import { hudInsets } from "@/lib/hud";
import { useTwin } from "@/sim/store";
import { ColdChain, EdgeNode, GrowTowers, HarvestToPack, Propagation, RoomPlant, TankFarm } from "./Equipment";
import { Facility } from "./Facility";
import { Glasshouse } from "./Glasshouse";
import { AlertBeacons, EdgeFlow, FlowPaths, Heatmap, SelectionMarker, TraceRoute } from "./Overlays";
import { Robots } from "./Robots";
import { attachNavigation, cameraNav, FLIGHT_SMOOTH, ZOOM_STEP } from "./navigation";
import { Static } from "./Static";
import { SpatialTags } from "./Tags";

export const AZIMUTH = MathUtils.degToRad(30);
export const POLAR = MathUtils.degToRad(52);
const DIR = new Vector3(Math.sin(POLAR) * Math.sin(AZIMUTH), Math.cos(POLAR), Math.sin(POLAR) * Math.cos(AZIMUTH));
const DIST = 220;

/**
 * Device-pixel budget: full retina on laptop screens, scaled back on big
 * external displays so a 5K monitor doesn't render 4× the pixels of a laptop.
 */
const PIXEL_BUDGET = 6.5e6;
const budgetDpr = () => Math.max(1, Math.min(window.devicePixelRatio || 1, 2, Math.sqrt(PIXEL_BUDGET / (window.innerWidth * window.innerHeight))));

function useDprBudget() {
  const [dpr, setDpr] = useState(budgetDpr);
  useEffect(() => {
    const on = () => setDpr(budgetDpr());
    window.addEventListener("resize", on);
    return () => window.removeEventListener("resize", on);
  }, []);
  return dpr;
}

export function Scene() {
  const select = useTwin((s) => s.select);
  const dpr = useDprBudget();
  return (
    <Canvas
      orthographic
      shadows="soft"
      dpr={dpr}
      camera={{ position: [DIR.x * DIST, DIR.y * DIST, DIR.z * DIST], zoom: 8, near: 1, far: 2000 }}
      gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
      onPointerMissed={(e) => {
        if (e.type === "click") select(undefined);
      }}
    >
      <Lights />
      <Rig />
      <Suspense fallback={null}>
        <Static>
          <Facility />
        </Static>
        <GrowTowers />
        <Static>
          <RoomPlant />
          <Propagation />
          <Glasshouse />
          <HarvestToPack />
          <ColdChain />
          <TankFarm />
          <EdgeNode />
        </Static>
        <Robots />
        <Heatmap />
        <FlowPaths />
        <TraceRoute />
        <EdgeFlow />
        <AlertBeacons />
        <SelectionMarker />
        <SpatialTags />
        <Probe />
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
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const first = useRef(true);

  // Trackpad / wheel / Safari-gesture navigation and the HUD's zoom buttons.
  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const nav = attachNavigation(c, camera as OrthographicCamera, gl.domElement);
    cameraNav.current = nav;
    cameraNav.zoomStep = (dir) => {
      // Zoom about the middle of the free area between the HUD panels.
      const r = gl.domElement.getBoundingClientRect();
      const hud = hudInsets(r.width);
      nav.takeOver();
      nav.zoomBy(dir > 0 ? ZOOM_STEP : 1 / ZOOM_STEP, r.left + (hud.left + r.width - hud.right) / 2, r.top + (hud.top + r.height - hud.bottom) / 2, true);
    };
    return () => {
      nav.dispose();
      cameraNav.current = undefined;
      cameraNav.zoomStep = undefined;
    };
  }, [camera, gl]);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    c.mouseButtons.left = 2; // ACTION.TRUCK (pan)
    c.mouseButtons.right = 1; // ACTION.ROTATE
    c.mouseButtons.wheel = 0; // ACTION.NONE: wheel and pinch are handled in navigation.ts
    c.touches.one = 0; // touch pan / pinch are handled in navigation.ts
    c.touches.two = 0;
    c.touches.three = 0;
    c.dollyToCursor = true;
    c.minZoom = 2.5;
    c.maxZoom = 140;
    c.minPolarAngle = MathUtils.degToRad(22);
    c.maxPolarAngle = MathUtils.degToRad(72);
    c.smoothTime = FLIGHT_SMOOTH;
    c.draggingSmoothTime = 0.06;
  }, []);

  useEffect(() => {
    const c = ref.current;
    if (!c) return;
    const [tx, ty, tz] = request.target;
    const [w, h, d] = request.extent;
    // Projected footprint of the region in the isometric view.
    const projW = Math.abs(w * Math.cos(AZIMUTH)) + Math.abs(d * Math.sin(AZIMUTH));
    const projH = (Math.abs(w * Math.sin(AZIMUTH)) + Math.abs(d * Math.cos(AZIMUTH))) * Math.cos(POLAR) + h * Math.sin(POLAR);
    const hud = hudInsets(size.width);
    const availW = Math.max(320, size.width - hud.right - hud.left - 32);
    const availH = Math.max(240, size.height - hud.top - hud.bottom - 16);
    // Leave a little air around zones and assets; the whole site fills the frame.
    const pad = w > 90 ? 1 : 0.86;
    const zoom = Math.min(availW / projW, availH / projH) * pad;
    const animate = !first.current;
    first.current = false;
    c.smoothTime = FLIGHT_SMOOTH;
    void c.setLookAt(tx + DIR.x * DIST, ty + DIR.y * DIST, tz + DIR.z * DIST, tx, ty, tz, animate);
    void c.zoomTo(zoom, animate);
    // Shift the framed region into the free area between the HUD panels.
    const offX = (hud.right - hud.left) / 2 / zoom;
    const offY = (hud.bottom - hud.top) / 2 / zoom;
    void c.setFocalOffset(offX, -offY, 0, animate);
  }, [request, size.width, size.height]);

  return <CameraControls ref={ref} makeDefault />;
}

/** Exposes the renderer for scripted performance checks (draw calls, triangles). */
function Probe() {
  const gl = useThree((s) => s.gl);
  // Tell the HUD once a full scene has been drawn, so the loader can go.
  const frames = useRef(0);
  useFrame(() => {
    if (frames.current++ === 2) useTwin.setState({ sceneReady: true });
  });
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    Object.assign(window as object, { __twinGl: gl, __twinScene: scene, __twinCamera: camera });
  }, [gl, scene, camera]);
  return null;
}
