import type { AssetStatus, BatchHealth, CropType, Severity } from "@/sim/types";

/**
 * One palette for the 3D scene and the HUD. Blueprint neutrals carry the
 * facility; colour is reserved for state.
 */
export const C = {
  bg: "#eef1f4",
  ground: "#e6eaee",
  slab: "#f8f9fb",
  slabEdge: "#c3ccd5",
  wall: "#ffffff",
  wallEdge: "#9aa8b6",
  line: "#64748b",
  ink: "#1e293b",
  steel: "#56657a",
  steelLight: "#94a3b8",
  white: "#fbfcfd",
  panel: "#f1f4f7",
  belt: "#3b4656",
  glass: "#d9ecf5",
  glassEdge: "#8fb3c7",
  led: "#ffd9f3",
  water: "#5aa9e6",
  green: "#2f9e5b",
  greenSoft: "#7cc28b",
  amber: "#e59b1a",
  red: "#dc4a3d",
  blue: "#3f7fd6",
  luna: "#fcb858",
  slateBlue: "#4f6d8f",
};

export const statusColor: Record<AssetStatus, string> = {
  OK: C.green,
  ACTIVE: C.green,
  IDLE: "#8d9aa9",
  WATCH: C.amber,
  ALERT: C.red,
  OFFLINE: "#475569",
  CHARGING: C.blue,
};

export const statusLabel: Record<AssetStatus, string> = {
  OK: "Nominal",
  ACTIVE: "Running",
  IDLE: "Idle",
  WATCH: "Watch",
  ALERT: "Alert",
  OFFLINE: "Offline",
  CHARGING: "Charging",
};

export const severityColor: Record<Severity, string> = { INFO: C.blue, WARNING: C.amber, CRITICAL: C.red };

export const healthColor: Record<BatchHealth, string> = { HEALTHY: C.green, WATCH: C.amber, AT_RISK: C.red };
export const healthLabel: Record<BatchHealth, string> = { HEALTHY: "Healthy", WATCH: "Watch", AT_RISK: "At risk" };

export const cropColor: Record<CropType, { leaf: string; accent?: string }> = {
  LETTUCE: { leaf: "#86c35a" },
  BASIL: { leaf: "#3f9147" },
  ARUGULA: { leaf: "#5f9f3c" },
  KALE: { leaf: "#5c7f55", accent: "#7d5f8f" },
  MICROGREENS: { leaf: "#a5d46a" },
  STRAWBERRY: { leaf: "#4e9450", accent: "#e0483f" },
  TOMATO: { leaf: "#4c8f45", accent: "#e4572e" },
  CUCUMBER: { leaf: "#4a8c3f", accent: "#9cc65a" },
};

/** Tank contents, shared by the 3D tank farm and the HUD gauges. */
export const liquidColor: Record<string, string> = {
  water: "#6fb6e9",
  stockA: "#7aa7d8",
  stockB: "#8fbf7a",
  acid: "#d9b24a",
  mix: "#5fb8a6",
  drain: "#8da7b8",
  co2: "#c7d4e0",
  heat: "#e8875a",
};
