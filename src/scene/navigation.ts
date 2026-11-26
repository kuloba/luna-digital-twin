import type CameraControls from "camera-controls";
import { MathUtils, type OrthographicCamera, Vector3 } from "three";

/**
 * Map-style navigation for the twin, tuned for MacBook trackpads:
 *
 * - two-finger swipe pans across the ground plane, tracking the fingers;
 * - pinch zooms toward the cursor (Chrome/Firefox send ctrl+wheel, Safari
 *   sends gesture events), with the page itself never zooming;
 * - a real mouse wheel zooms in steps toward the cursor;
 * - drag keeps camera-controls' own pan / rotate.
 *
 * Mouse wheel vs trackpad follows Mapbox GL's approach: line-mode deltas
 * and Firefox/Safari's 4.000244 multiples are wheels, tiny or sideways
 * deltas are trackpads, a lone large integer step is a wheel, and anything
 * still ambiguous is treated as a trackpad (the audience is on MacBooks).
 */

/** Smoothing for user zoom: settles in roughly 200 ms. */
export const USER_SMOOTH = 0.08;
/** Smoothing for scripted camera flights (tour, fly-to). */
export const FLIGHT_SMOOTH = 0.45;
/** One button press or key press. */
export const ZOOM_STEP = 1.6;

/** Pinch: Chrome's ctrl+wheel deltas sum to ~100 over a full pinch → ~3×. */
const PINCH_RATE = 0.011;
/** Mouse wheel: one 100 px notch ≈ 1.25×. */
const WHEEL_RATE = 0.0022;
/** Safari gesture scale is ~2–3 over a full pinch; a touch of gain makes it ~3×. */
const GESTURE_GAIN = 1.1;
/** Gap that starts a new wheel gesture (ms). */
const SESSION_GAP = 200;

type Kind = "mouse" | "trackpad";

interface SafariGestureEvent extends UIEvent {
  scale: number;
  clientX: number;
  clientY: number;
}

export interface Navigator {
  /** Zoom by a factor about a client-space point (defaults to the given centre). */
  zoomBy(factor: number, clientX: number, clientY: number, animate: boolean): void;
  pan(dxPx: number, dyPx: number): void;
  /** Stop any flight where it is, so user input continues from what is on screen. */
  takeOver(): void;
  dispose(): void;
}

const v1 = new Vector3();
const v2 = new Vector3();
const v3 = new Vector3();

export function attachNavigation(c: CameraControls, camera: OrthographicCamera, el: HTMLElement): Navigator {
  let zoomEnd = camera.zoom;
  let lastWheel = 0;
  let kind: Kind | null = null;
  let gesture: { z0: number } | null = null;

  const moving = () => {
    c.getTarget(v1, false);
    c.getTarget(v2, true);
    return v1.distanceToSquared(v2) > 1e-6 || Math.abs(camera.zoom - zoomEnd) > 1e-4 || c.active;
  };

  const takeOver = () => {
    const busy = moving();
    // A user zoom still easing in keeps its end value, so quick presses add up.
    if (busy && c.smoothTime !== FLIGHT_SMOOTH) return;
    if (busy) {
      // Freeze at the current pose instead of jumping to the flight's end.
      c.getTarget(v1, false);
      c.getPosition(v2, false);
      c.getFocalOffset(v3, false);
      void c.setLookAt(v2.x, v2.y, v2.z, v1.x, v1.y, v1.z, false);
      void c.setFocalOffset(v3.x, v3.y, v3.z, false);
      void c.zoomTo(camera.zoom, false);
    }
    zoomEnd = camera.zoom;
    c.smoothTime = USER_SMOOTH;
  };

  const zoomBy = (factor: number, clientX: number, clientY: number, animate: boolean) => {
    const z0 = zoomEnd;
    const z1 = MathUtils.clamp(z0 * factor, c.minZoom, c.maxZoom);
    if (Math.abs(z1 - z0) < 1e-6) return;
    c.smoothTime = USER_SMOOTH;
    const r = el.getBoundingClientRect();
    // Keep the world point under the cursor fixed: the ortho view is
    // width/zoom wide, so the cursor's world offset from centre shrinks by (1/z0 − 1/z1).
    const k = 1 / z0 - 1 / z1;
    const nx = clientX - r.left - r.width / 2;
    const ny = clientY - r.top - r.height / 2;
    void c.truck(nx * k, ny * k, animate);
    void c.zoomTo(z1, animate);
    zoomEnd = z1;
  };

  const pan = (dx: number, dy: number) => {
    c.getTarget(v1, true);
    const groundY = v1.y;
    void c.truck(dx / zoomEnd, dy / zoomEnd, false);
    // truck() moves in the screen plane; slide back along the view ray so the
    // pivot stays on the same ground height (invisible in an ortho view).
    c.getTarget(v1, true);
    c.getPosition(v2, true);
    v3.subVectors(v1, v2).normalize();
    if (Math.abs(v3.y) > 1e-3) {
      const t = (v1.y - groundY) / v3.y;
      v1.addScaledVector(v3, -t);
      v2.addScaledVector(v3, -t);
      void c.setLookAt(v2.x, v2.y, v2.z, v1.x, v1.y, v1.z, false);
    }
  };

  const classify = (e: WheelEvent): Kind => {
    if (e.deltaMode !== 0) return "mouse";
    if (e.deltaX !== 0) return "trackpad";
    const a = Math.abs(e.deltaY);
    if (a === 0 || a < 4) return "trackpad";
    if (a % 4.000244140625 === 0) return "mouse";
    if (Number.isInteger(e.deltaY) && a >= 50) return "mouse";
    return "trackpad";
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const now = performance.now();
    const fresh = now - lastWheel > SESSION_GAP;
    lastWheel = now;
    if (fresh) {
      takeOver();
      kind = null;
    }
    const line = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1;
    if (e.ctrlKey) {
      // Trackpad pinch in Chrome/Firefox (or ctrl+wheel). Safari pinches arrive as gestures.
      if (gesture) return;
      zoomBy(Math.exp(-e.deltaY * line * PINCH_RATE), e.clientX, e.clientY, false);
      return;
    }
    kind ??= classify(e);
    if (kind === "mouse") zoomBy(Math.exp(-e.deltaY * (e.deltaMode === 1 ? 33 : line) * WHEEL_RATE), e.clientX, e.clientY, true);
    else pan(e.deltaX * line, e.deltaY * line);
  };

  const onGestureStart = (e: Event) => {
    e.preventDefault();
    takeOver();
    gesture = { z0: zoomEnd };
  };
  const onGestureChange = (e: Event) => {
    e.preventDefault();
    if (!gesture) return;
    const g = e as SafariGestureEvent;
    const want = gesture.z0 * Math.pow(g.scale, GESTURE_GAIN);
    zoomBy(want / zoomEnd, g.clientX, g.clientY, false);
  };
  const onGestureEnd = (e: Event) => {
    e.preventDefault();
    gesture = null;
  };
  // Grabbing the scene mid-flight continues from what is on screen.
  const onPointerDown = () => takeOver();

  // Touch screens: one finger pans, two fingers pan by their midpoint and
  // pinch-zoom about it (camera-controls' own touch handling is switched off).
  const touches = new Map<number, { x: number; y: number }>();
  let prevMid: { x: number; y: number; d: number } | null = null;
  const touchMid = () => {
    const pts = [...touches.values()];
    if (pts.length === 1) return { x: pts[0].x, y: pts[0].y, d: 0 };
    const [a, b] = pts;
    return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
  };
  const onTouchDown = (e: PointerEvent) => {
    if (e.pointerType !== "touch") return;
    takeOver();
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    el.setPointerCapture?.(e.pointerId);
    prevMid = touches.size <= 2 ? touchMid() : prevMid;
  };
  const onTouchMove = (e: PointerEvent) => {
    if (e.pointerType !== "touch" || !touches.has(e.pointerId)) return;
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size > 2 || !prevMid) return;
    const m = touchMid();
    // Content follows the fingers.
    pan(-(m.x - prevMid.x), -(m.y - prevMid.y));
    if (touches.size === 2 && prevMid.d > 0 && m.d > 0) zoomBy(m.d / prevMid.d, m.x, m.y, false);
    prevMid = m;
  };
  const onTouchUp = (e: PointerEvent) => {
    if (e.pointerType !== "touch") return;
    touches.delete(e.pointerId);
    prevMid = touches.size ? touchMid() : null;
  };

  // The page must never zoom: block browser pinch-zoom over the HUD too.
  const blockPageZoom = (e: WheelEvent) => {
    if (e.ctrlKey) e.preventDefault();
  };
  const blockGesture = (e: Event) => e.preventDefault();

  el.addEventListener("wheel", onWheel, { passive: false });
  el.addEventListener("gesturestart", onGestureStart);
  el.addEventListener("gesturechange", onGestureChange);
  el.addEventListener("gestureend", onGestureEnd);
  el.addEventListener("pointerdown", onPointerDown, { capture: true });
  el.addEventListener("touchstart", onPointerDown, { capture: true, passive: true });
  el.addEventListener("pointerdown", onTouchDown);
  el.addEventListener("pointermove", onTouchMove);
  el.addEventListener("pointerup", onTouchUp);
  el.addEventListener("pointercancel", onTouchUp);
  el.style.touchAction = "none";
  document.addEventListener("wheel", blockPageZoom, { passive: false });
  document.addEventListener("gesturestart", blockGesture);
  document.addEventListener("gesturechange", blockGesture);

  return {
    zoomBy,
    pan,
    takeOver,
    dispose() {
      el.removeEventListener("wheel", onWheel);
      el.removeEventListener("gesturestart", onGestureStart);
      el.removeEventListener("gesturechange", onGestureChange);
      el.removeEventListener("gestureend", onGestureEnd);
      el.removeEventListener("pointerdown", onPointerDown, { capture: true });
      el.removeEventListener("touchstart", onPointerDown, { capture: true });
      el.removeEventListener("pointerdown", onTouchDown);
      el.removeEventListener("pointermove", onTouchMove);
      el.removeEventListener("pointerup", onTouchUp);
      el.removeEventListener("pointercancel", onTouchUp);
      document.removeEventListener("wheel", blockPageZoom);
      document.removeEventListener("gesturestart", blockGesture);
      document.removeEventListener("gesturechange", blockGesture);
    },
  };
}

/** Set by the scene's camera rig; the HUD's zoom buttons and keys call it. */
export const cameraNav: { current?: Navigator; zoomStep?: (dir: 1 | -1) => void } = {};
