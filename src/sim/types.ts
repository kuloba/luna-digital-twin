/**
 * Domain types for LUNA Twin.
 *
 * Production types (Batch, Anomaly → Alert, RequiredAction → Recommendation,
 * CropBriefing) deliberately follow the shapes in the existing LUNA GraphQL
 * API so that the simulation in `engine.ts` can be swapped for a live
 * subscription without touching any component.
 */

export type Vec3 = [number, number, number];

/* ------------------------------------------------------------------ */
/* Facility                                                           */
/* ------------------------------------------------------------------ */

export type StageKey = "SEEDING" | "CULTIVATION" | "HARVEST" | "QUALITY" | "COLD_CHAIN";

export const STAGES: { key: StageKey; label: string; short: string }[] = [
  { key: "SEEDING", label: "Seeding & Propagation", short: "Seeding" },
  { key: "CULTIVATION", label: "Vertical Cultivation", short: "Cultivation" },
  { key: "HARVEST", label: "Automated Harvest", short: "Harvest" },
  { key: "QUALITY", label: "Quality & Food Safety", short: "Quality" },
  { key: "COLD_CHAIN", label: "Packaging & Cold Chain", short: "Cold Chain" },
];

export type ZoneId = "PROP" | "V1" | "V2" | "GH" | "HARV" | "QA" | "PACK" | "COLD" | "UTIL";

export interface Zone {
  id: ZoneId;
  name: string;
  short: string;
  stage: StageKey;
  /** [x0, z0, x1, z1] in world units (1 unit ≈ 1 m). */
  bounds: [number, number, number, number];
  /** Zone switcher shortcut key. */
  hotkey: string;
  /** Height of the zone's walls. */
  wallHeight: number;
  /** Whether this zone has a climate field worth heat-mapping. */
  climate: boolean;
}

export type AssetKind =
  | "TOWER"
  | "ROOM"
  | "COMPARTMENT"
  | "DOSING"
  | "HVAC"
  | "SEEDER"
  | "GERMINATION"
  | "AMR"
  | "HARVESTER"
  | "CONVEYOR"
  | "QA"
  | "WASHER"
  | "SEALER"
  | "COLD_ROOM"
  | "DOCK"
  | "TRUCK"
  | "CAMERA"
  | "ROW"
  | "TANK"
  | "EDGE";

export type AssetStatus = "OK" | "ACTIVE" | "IDLE" | "WATCH" | "ALERT" | "OFFLINE" | "CHARGING";

export type MetricKey =
  | "temp"
  | "rh"
  | "vpd"
  | "co2"
  | "ppfd"
  | "dli"
  | "ec"
  | "ph"
  | "waterTemp"
  | "do"
  | "moisture"
  | "germination"
  | "battery"
  | "payload"
  | "throughput"
  | "cycleTime"
  | "passRate"
  | "rejectRate"
  | "weightDev"
  | "load"
  | "power"
  | "flow"
  | "doorOpen"
  | "coverage"
  | "level"
  | "pressure"
  | "uv";

export interface Metric {
  key: MetricKey;
  label: string;
  unit: string;
  value: number;
  /** Setpoint the controller drives toward. */
  setpoint: number;
  /** Target band — values outside it are a deviation. */
  low: number;
  high: number;
  /** Additive drift applied by incidents; 0 in normal operation. */
  bias: number;
  /** Per-tick noise amplitude. */
  noise: number;
  /** How quickly value converges on setpoint + bias (0–1 per tick). */
  response: number;
  /** Decimal places to display. */
  precision: number;
  /** Rolling history, oldest first. */
  history: number[];
}

export interface Asset {
  id: string;
  kind: AssetKind;
  name: string;
  zoneId: ZoneId;
  /** Room / compartment id when nested (e.g. "V2", "G1"). */
  roomId?: string;
  position: Vec3;
  /** Footprint for selection rings and heat-map influence. */
  size: Vec3;
  rotationY?: number;
  status: AssetStatus;
  /** Short present-tense verb for spatial tags: "Irrigating", "Transporting". */
  activity: string;
  metrics: Partial<Record<MetricKey, Metric>>;
  /** Batch currently occupying the asset. */
  batchId?: string;
  /** Generic 0–1 progress for the current activity (cycle, load, scan…). */
  progress?: number;
  /** Free-form typed details per kind. */
  detail?: Record<string, string | number | boolean>;
}

/* ------------------------------------------------------------------ */
/* Robots                                                             */
/* ------------------------------------------------------------------ */

export type AmrState = "TRANSPORTING" | "RETURNING" | "IDLE" | "CHARGING" | "LOADING";

export interface AmrMission {
  id: string;
  label: string;
  from: string;
  to: string;
  path: [number, number][];
  length: number;
  payload: string;
  batchId?: string;
  trays: number;
  /** Distance along `path` at which the payload is picked up. */
  pickupAt: number;
}

export interface AmrRuntime {
  id: string;
  state: AmrState;
  mission?: AmrMission;
  /** Distance travelled along the mission path. */
  travelled: number;
  speed: number;
  /** Remaining dwell seconds at a station before the next mission. */
  dwell: number;
  /** Charging pad assigned to this robot. */
  home: [number, number];
  /** True once the robot has been ordered back to charge. */
  recall: boolean;
  /** Floor position when not travelling (end of the last path). */
  at: [number, number];
  /** Battery drain multiplier — raised by the low-battery incident. */
  drain: number;
}

/* ------------------------------------------------------------------ */
/* Production                                                         */
/* ------------------------------------------------------------------ */

export type CropType = "LETTUCE" | "BASIL" | "ARUGULA" | "KALE" | "MICROGREENS" | "STRAWBERRY" | "TOMATO" | "CUCUMBER";

export type BatchHealth = "HEALTHY" | "WATCH" | "AT_RISK";

export interface StageVisit {
  stage: StageKey;
  assetIds: string[];
  /** ISO time the batch entered the stage (actual or projected). */
  enteredAt: string;
  /** ISO time it left (actual or projected). */
  exitedAt: string;
  status: "DONE" | "ACTIVE" | "PLANNED";
  note?: string;
}

export interface Order {
  id: string;
  customer: string;
  cases: number;
  truckId: string;
  dueAt: string;
}

export interface Batch {
  id: string;
  code: string;
  cropType: CropType;
  cropName: string;
  variety: string;
  stage: StageKey;
  health: BatchHealth;
  /** 0–1 progress through the current stage. */
  stageProgress: number;
  /** Days since sowing and planned cycle length. */
  cycleDay: number;
  cycleDays: number;
  plants: number;
  trays: number;
  forecastKg: number;
  /** Grade-A share so far or forecast, 0–1. */
  gradeA: number;
  route: StageVisit[];
  order?: Order;
  headline: string;
  /** Tempo multiplier for the demo's stage progression. */
  tempo: number;
}

/* ------------------------------------------------------------------ */
/* Alerts                                                             */
/* ------------------------------------------------------------------ */

export type Severity = "INFO" | "WARNING" | "CRITICAL";

export interface Recommendation {
  /** Imperative, e.g. "Raise dehumidification one stage". */
  title: string;
  rationale: string;
  steps: string[];
  owner: string;
  /** What will happen once applied, shown before approval. */
  expected: string;
  confidence: number;
}

export type AlertStatus = "OPEN" | "RESOLVING" | "RESOLVED";

export interface Alert {
  id: string;
  incidentId: string;
  severity: Severity;
  title: string;
  detail: string;
  assetId: string;
  zoneId: ZoneId;
  metricKey?: MetricKey;
  batchIds: string[];
  createdAt: number;
  status: AlertStatus;
  recommendation: Recommendation;
  resolvedAt?: number;
  verification?: string;
  approvedBy?: string;
}

export interface FeedEvent {
  id: string;
  at: number;
  tone: "info" | "positive" | "warning" | "critical";
  text: string;
  assetId?: string;
}

/* ------------------------------------------------------------------ */
/* KPIs                                                               */
/* ------------------------------------------------------------------ */

export interface Kpis {
  yieldTodayKg: number;
  yieldPlanKg: number;
  activeTowers: number;
  totalTowers: number;
  gradeA: number;
  gradeATarget: number;
  traysPerHour: number;
  onTimeDispatch: number;
  robotUtilisation: number;
  energyKwh: number;
  history: { yieldTodayKg: number[]; gradeA: number[]; activeTowers: number[]; traysPerHour: number[]; onTimeDispatch: number[]; robotUtilisation: number[] };
}

/* ------------------------------------------------------------------ */
/* Computer vision (LUNA camera rails)                                */
/* ------------------------------------------------------------------ */

export type PestKind = "Whitefly" | "Botrytis" | "Aphids" | "Powdery mildew";

export interface Truss {
  /** 0 (bottom of the visible canopy) … 1 (head). */
  h: number;
  /** Ripeness 0 green → 5 red (tomato) / fruit size index (cucumber). */
  ripeness: number;
  fruits: number;
}

export interface PlantCv {
  trusses: Truss[];
  /** Open flowers at the head. */
  flowers: number;
  /** Plant (head) height above gutter, m. */
  height: number;
  /** Stem diameter 15 cm below head, mm. */
  stem: number;
  pest?: PestKind;
  /** 0–1 pest pressure. */
  pestLevel: number;
}

export interface Plant {
  id: string;
  row: string;
  idx: number;
  x: number;
  z: number;
  /** Ground truth (what is actually happening in the crop). */
  live: PlantCv;
  /** What the camera last saw — the twin renders this. */
  seen: PlantCv;
  scannedAt: number;
}

export interface RowCv {
  id: string;
  compartment: string;
  index: number;
  x: number;
  z0: number;
  z1: number;
  plantIds: string[];
}

export interface CompartmentCv {
  id: string;
  crop: "TOMATO" | "CUCUMBER";
  rows: RowCv[];
  plants: Record<string, Plant>;
  /** Gantry position 0–1 across the compartment. */
  scan: number;
  scanDir: 1 | -1;
  passes: number;
  imagesToday: number;
}

export interface SimState {
  tick: number;
  /** Wall-clock ms of the last tick (drives interpolation in the scene). */
  lastTickAt: number;
  startedAt: number;
  assets: Record<string, Asset>;
  amrs: Record<string, AmrRuntime>;
  batches: Record<string, Batch>;
  alerts: Alert[];
  feed: FeedEvent[];
  kpis: Kpis;
  incidents: Record<string, IncidentRuntime>;
  cv: Record<string, CompartmentCv>;
}

export type IncidentPhase = "DORMANT" | "DRIFTING" | "RESOLVING" | "COOLDOWN";

export interface IncidentRuntime {
  id: string;
  phase: IncidentPhase;
  /** Seconds in the current phase. */
  t: number;
  /** Tick at which a dormant incident arms itself. */
  armAt: number;
  alertId?: string;
  occurrences: number;
}
