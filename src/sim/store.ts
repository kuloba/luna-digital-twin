import { create } from "zustand";
import { amrPose, approve, step, trigger } from "./engine";
import { ZONE_BY_ID } from "./layout";
import { createInitialState } from "./seed";
import type { SimState, Vec3, ZoneId } from "./types";

export type Role = "GROWER" | "MANAGER";
export type HeatLayer = "vpd" | "temp" | "rh" | "co2" | "ppfd" | null;
export type RightPanel = "brief" | "inspector" | "luna";
export type CvLens = "ripeness" | "yield" | "pests" | "growth";

export interface CameraRequest {
  /** Centre of the framed region. */
  target: Vec3;
  /** Width × depth × height of the region to frame. */
  extent: Vec3;
  /** Monotonic id so repeated requests for the same target still fire. */
  n: number;
}

export interface ChatEntity {
  kind: "asset" | "batch" | "zone" | "alert";
  id: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "luna";
  text: string;
  /** Characters revealed so far (typing effect). */
  shown?: number;
  /** Optional action card attached to a Luna reply. */
  alertId?: string;
  at: number;
}

interface UiState {
  sim: SimState;
  running: boolean;
  role: Role;
  selectedId?: string;
  hoveredId?: string;
  batchId: string;
  focus: ZoneId | "SITE";
  camera: CameraRequest;
  layers: { labels: boolean; heat: HeatLayer; flows: boolean; trace: boolean };
  cvLens: CvLens;
  plantId?: string;
  rightPanel: RightPanel;
  searchOpen: boolean;
  chat: ChatMessage[];
  tour: { active: boolean; step: number };
  operator: string;

  tick(): void;
  select(id?: string, opts?: { fly?: boolean }): void;
  hover(id?: string): void;
  selectBatch(id: string, opts?: { trace?: boolean; fly?: boolean }): void;
  flyToZone(zone: ZoneId | "SITE"): void;
  flyToAsset(id: string): void;
  setRole(role: Role): void;
  setLayer<K extends keyof UiState["layers"]>(k: K, v: UiState["layers"][K]): void;
  setRightPanel(p: RightPanel): void;
  setCvLens(l: CvLens): void;
  selectPlant(plantId: string, rowId: string): void;
  setSearchOpen(v: boolean): void;
  approveAlert(alertId: string): void;
  triggerIncident(id: string, headStart?: number): void;
  recallAmr(id: string): void;
  pushChat(m: Omit<ChatMessage, "id" | "at">): string;
  updateChat(id: string, patch: Partial<ChatMessage>): void;
  clearChat(): void;
  setTour(t: Partial<UiState["tour"]>): void;
  setRunning(v: boolean): void;
  reset(): void;
}

let cameraN = 1;
let chatN = 1;

export const SITE_VIEW: CameraRequest = { target: [0, 0, -6], extent: [112, 4, 78], n: 0 };

const OPERATORS: Record<Role, string> = {
  GROWER: "Maya Chen · Head Grower",
  MANAGER: "Dev Okafor · Facility Manager",
};

export const useTwin = create<UiState>((set, get) => ({
  sim: createInitialState(),
  running: true,
  role: "GROWER",
  selectedId: undefined,
  hoveredId: undefined,
  batchId: "LET-1124",
  focus: "SITE",
  camera: SITE_VIEW,
  layers: { labels: true, heat: null, flows: true, trace: false },
  cvLens: "ripeness",
  plantId: undefined,
  rightPanel: "brief",
  searchOpen: false,
  chat: [],
  tour: { active: false, step: 0 },
  operator: OPERATORS.GROWER,

  tick() {
    if (!get().running) return;
    set((st) => ({ sim: step(st.sim) }));
  },

  select(id, opts) {
    if (id !== get().selectedId && !id?.startsWith(get().plantId?.slice(0, 6) ?? "~")) set({ plantId: undefined });
    if (!id) {
      set({ selectedId: undefined, rightPanel: get().rightPanel === "inspector" ? "brief" : get().rightPanel });
      return;
    }
    const asset = get().sim.assets[id];
    if (!asset) return;
    set({ selectedId: id, rightPanel: "inspector" });
    if (asset.batchId && get().sim.batches[asset.batchId]) set({ batchId: asset.batchId });
    if (opts?.fly) get().flyToAsset(id);
  },

  hover(id) {
    if (get().hoveredId !== id) set({ hoveredId: id });
  },

  selectBatch(id, opts) {
    if (!get().sim.batches[id]) return;
    set((st) => ({ batchId: id, layers: { ...st.layers, trace: opts?.trace ?? st.layers.trace } }));
    if (opts?.fly) {
      const b = get().sim.batches[id];
      const visit = b.route.find((v) => v.status === "ACTIVE") ?? b.route[b.route.length - 1];
      const assetId = visit.assetIds.find((a) => get().sim.assets[a]);
      if (assetId) get().select(assetId, { fly: true });
    }
  },

  flyToZone(zone) {
    if (zone === "SITE") {
      set({ focus: "SITE", camera: { ...SITE_VIEW, n: cameraN++ } });
      return;
    }
    const [x0, z0, x1, z1] = ZONE_BY_ID[zone].bounds;
    set({ focus: zone, camera: { target: [(x0 + x1) / 2, 0, (z0 + z1) / 2], extent: [x1 - x0, ZONE_BY_ID[zone].wallHeight, z1 - z0], n: cameraN++ } });
  },

  flyToAsset(id) {
    const sim = get().sim;
    const a = sim.assets[id];
    if (!a) return;
    const [w, h, d] = a.size;
    const r = sim.amrs[id];
    if (r) {
      // Robots move: frame where the robot is now, not its charge pad.
      const p = amrPose(r, sim.lastTickAt, Date.now());
      set({ focus: a.zoneId, camera: { target: [p.x, 0.5, p.z], extent: [30, 2, 22], n: cameraN++ } });
      return;
    }
    // Frame the asset with its surroundings, never tighter than ~26 m.
    const span = Math.max(26, Math.max(w, d) * 1.5);
    set({ focus: a.zoneId, camera: { target: [a.position[0], a.position[1] + h / 2, a.position[2]], extent: [span, Math.min(h, 6), span * 0.75], n: cameraN++ } });
  },

  setRole(role) {
    set({ role, operator: OPERATORS[role] });
  },

  setLayer(k, v) {
    set((st) => ({ layers: { ...st.layers, [k]: v } }));
  },

  setRightPanel(p) {
    set({ rightPanel: p });
  },

  setCvLens(l) {
    set({ cvLens: l });
  },

  selectPlant(plantId, rowId) {
    set({ plantId });
    get().select(rowId);
  },

  setSearchOpen(v) {
    set({ searchOpen: v });
  },

  approveAlert(alertId) {
    set((st) => ({ sim: approve(st.sim, alertId, st.operator) }));
  },

  triggerIncident(id, headStart = 0) {
    set((st) => ({ sim: trigger(st.sim, id, headStart) }));
  },

  recallAmr(id) {
    set((st) => {
      const r = st.sim.amrs[id];
      if (!r || r.recall) return {};
      return { sim: { ...st.sim, amrs: { ...st.sim.amrs, [id]: { ...r, recall: true } } } };
    });
  },

  pushChat(m) {
    const id = `c${chatN++}`;
    set((st) => ({ chat: [...st.chat, { ...m, id, at: Date.now() }] }));
    return id;
  },

  updateChat(id, patch) {
    set((st) => ({ chat: st.chat.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  },

  clearChat() {
    set({ chat: [] });
  },

  setTour(t) {
    set((st) => ({ tour: { ...st.tour, ...t } }));
  },

  setRunning(v) {
    set({ running: v });
  },

  reset() {
    set({ sim: createInitialState(), selectedId: undefined, batchId: "LET-1124", chat: [], camera: { ...SITE_VIEW, n: cameraN++ }, focus: "SITE" });
  },
}));

/** Read the latest state without subscribing (for useFrame loops). */
export const twin = () => useTwin.getState();
