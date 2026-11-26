import { COMPARTMENTS } from "./layout";
import { rand } from "./metrics";
import type { CompartmentCv, PestKind, Plant, PlantCv, RowCv, SimState } from "./types";

/**
 * Computer-vision crop state for the glasshouse.
 *
 * LUNA camera rails photograph every plant several times a day. Inference
 * runs on the edge node in the glasshouse, so what leaves the site is not
 * photographs but a few hundred bytes of plant state per plant: trusses,
 * ripeness, fruit counts, flowers, head height, stem diameter, pest flags.
 *
 * The twin renders that state directly. `live` is the ground truth evolving
 * in the crop; `seen` is the last snapshot the camera took — and is what the
 * 3D crop and every CV number in the UI is built from. As the gantry sweeps
 * a compartment you can watch the twin "catch up" with the crop.
 */

export const ROWS_PER_COMPARTMENT = 10;
export const PLANTS_PER_ROW = 20;
export const ROW_Z0 = 8.2;
export const PLANT_SPACING = 1.12;

/** Visible canopy band on a high-wire crop, metres above the floor. */
export const CANOPY_LOW = 0.55;
export const CANOPY_HIGH = 3.25;

export const rowX = (compartmentX0: number, i: number) => compartmentX0 + 1.8 + i * 1.62;

const PEST_SPOTS: Record<string, { row: number; idx: number; kind: PestKind; radius: number; level: number }[]> = {
  G1: [],
  G2: [
    { row: 3, idx: 13, kind: "Whitefly", radius: 3.2, level: 0.75 },
    { row: 7, idx: 4, kind: "Botrytis", radius: 1.6, level: 0.55 },
  ],
  G3: [{ row: 8, idx: 15, kind: "Powdery mildew", radius: 1.2, level: 0.3 }],
};

/**
 * Light and heat are not uniform across a compartment: rows by the gable and
 * under the screen-roll ripen slower, and G2's whitefly rows are set back.
 * This is what makes the yield lens worth looking at.
 */
function rowLight(comp: string, row: number) {
  const gable = row === 0 || row === ROWS_PER_COMPARTMENT - 1 ? -0.09 : row === 1 || row === ROWS_PER_COMPARTMENT - 2 ? -0.04 : 0;
  const centre = 0.05 * Math.cos(((row - 4.5) / 4.5) * Math.PI * 0.5);
  const pest = comp === "G2" && row >= 2 && row <= 4 ? -0.07 : 0;
  const pipe = comp === "G1" && row === 6 ? -0.05 : 0;
  return 1 + gable + centre + pest + pipe;
}

function makePlant(comp: string, crop: CompartmentCv["crop"], row: number, idx: number, x: number, z: number, maturity: number): Plant {
  const trussCount = crop === "TOMATO" ? 7 + Math.round(rand() * 2) : 5 + Math.round(rand() * 2);
  const trusses = Array.from({ length: trussCount }, (_, t) => {
    const h = (t + 0.4 + rand() * 0.25) / (trussCount + 0.4);
    // Lower trusses are older → riper. Maturity shifts the whole curve.
    const ripe = Math.max(0, Math.min(5.4, (1 - h) * 6.2 * maturity * rowLight(comp, row) - 0.6 + (rand() - 0.5) * 1.1));
    return { h, ripeness: ripe, fruits: crop === "TOMATO" ? 4 + Math.round(rand() * 2) : 1 + Math.round(rand() * 1.4) };
  });
  // Edge plants and a soft gradient across the house make the yield map interesting.
  const vigour = 1 - Math.abs(row - 4.5) * 0.012 - (idx === 0 || idx === PLANTS_PER_ROW - 1 ? 0.06 : 0) + (rand() - 0.5) * 0.05;
  let pest: PestKind | undefined;
  let pestLevel = 0;
  for (const s of PEST_SPOTS[comp] ?? []) {
    const d = Math.hypot(s.row - row, (s.idx - idx) * 0.55);
    if (d < s.radius) {
      const lv = s.level * (1 - d / s.radius);
      if (lv > pestLevel) {
        pestLevel = lv;
        pest = s.kind;
      }
    }
  }
  const live: PlantCv = {
    trusses,
    flowers: crop === "TOMATO" ? Math.round(3 + rand() * 3) : Math.round(2 + rand() * 2),
    height: +(2.95 + vigour * 0.3 + (rand() - 0.5) * 0.08).toFixed(2),
    stem: +(10.2 + vigour * 1.6 + (rand() - 0.5) * 0.6 - pestLevel * 1.2).toFixed(1),
    pest,
    pestLevel,
  };
  return { id: `${comp}-R${String(row + 1).padStart(2, "0")}-P${String(idx + 1).padStart(2, "0")}`, row: `${comp}-R${String(row + 1).padStart(2, "0")}`, idx, x, z, live, seen: structuredClone(live), scannedAt: Date.now() - (2 + rand() * 4) * 3_600_000 };
}

export function createCv(): Record<string, CompartmentCv> {
  const out: Record<string, CompartmentCv> = {};
  const maturity: Record<string, number> = { G1: 1.0, G2: 0.82, G3: 0.9 };
  COMPARTMENTS.forEach((c, ci) => {
    const crop = c.id === "G3" ? "CUCUMBER" : "TOMATO";
    const rows: RowCv[] = [];
    const plants: Record<string, Plant> = {};
    for (let r = 0; r < ROWS_PER_COMPARTMENT; r++) {
      const x = rowX(c.bounds[0], r);
      const ids: string[] = [];
      for (let i = 0; i < PLANTS_PER_ROW; i++) {
        const p = makePlant(c.id, crop, r, i, x, ROW_Z0 + i * PLANT_SPACING, maturity[c.id]);
        plants[p.id] = p;
        ids.push(p.id);
      }
      rows.push({ id: `${c.id}-R${String(r + 1).padStart(2, "0")}`, compartment: c.id, index: r, x, z0: ROW_Z0 - 0.6, z1: ROW_Z0 + (PLANTS_PER_ROW - 1) * PLANT_SPACING + 0.6, plantIds: ids });
    }
    out[c.id] = { id: c.id, crop, rows, plants, scan: 0.15 + ci * 0.31, scanDir: ci % 2 === 0 ? 1 : -1, passes: 3 + ci, imagesToday: 16_800 + ci * 1_350 };
  });
  return out;
}

/* ------------------------------------------------------------------ */
/* Simulation step                                                    */
/* ------------------------------------------------------------------ */

const SCAN_SPEED = 0.0065; // fraction of compartment per second

export function stepCv(s: SimState) {
  const now = Date.now();
  for (const comp of Object.values(s.cv)) {
    // Crop grows: fruit ripens a little; ripe fruit in G3's picking row gets harvested.
    for (const p of Object.values(comp.plants)) {
      for (const t of p.live.trusses) t.ripeness = Math.min(5.6, t.ripeness + 0.0009 + rand() * 0.0012);
      if (p.live.pest && rand() < 0.002) p.live.pestLevel = Math.min(1, p.live.pestLevel + 0.02);
    }
    // Gantry sweep.
    const prev = comp.scan;
    comp.scan += SCAN_SPEED * comp.scanDir;
    if (comp.scan >= 1 || comp.scan <= 0) {
      comp.scanDir = comp.scanDir === 1 ? -1 : 1;
      comp.scan = Math.max(0, Math.min(1, comp.scan));
      comp.passes += 1;
    }
    const lo = Math.min(prev, comp.scan);
    const hi = Math.max(prev, comp.scan);
    const c = COMPARTMENTS.find((cc) => cc.id === comp.id)!;
    const width = c.bounds[2] - c.bounds[0];
    for (const row of comp.rows) {
      const f = (row.x - c.bounds[0]) / width;
      if (f < lo - 0.0001 || f > hi + 0.0001) continue;
      for (const id of row.plantIds) {
        const p = comp.plants[id];
        p.seen = structuredClone(p.live);
        p.scannedAt = now;
      }
      comp.imagesToday += row.plantIds.length * 6;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Aggregates                                                         */
/* ------------------------------------------------------------------ */

export const RIPENESS_STAGES = [
  { label: "Green", color: "#5e9a3a" },
  { label: "Breaker", color: "#b9b23a" },
  { label: "Turning", color: "#e0a23a" },
  { label: "Pink", color: "#ea7a46" },
  { label: "Light red", color: "#e5553a" },
  { label: "Red", color: "#cf3326" },
];

export const CUCUMBER_STAGES = [
  { label: "Set", color: "#b8d67a" },
  { label: "Small", color: "#8fc25a" },
  { label: "Growing", color: "#6ead49" },
  { label: "Near size", color: "#4f973c" },
  { label: "Pick size", color: "#2f7d33" },
  { label: "Over size", color: "#a2a63a" },
];

export const stageIndex = (ripeness: number) => Math.max(0, Math.min(5, Math.floor(ripeness)));

export interface CvSummary {
  plants: number;
  fruits: number;
  trusses: number;
  flowers: number;
  stages: number[];
  readyKg7d: number;
  avgHeight: number;
  avgStem: number;
  pestPlants: number;
  pests: { kind: PestKind; plants: number; worstRow: string }[];
  lastScan: number;
  imagesToday: number;
  rawGb: number;
  syncedMb: number;
}

const FRUIT_KG = { TOMATO: 0.132, CUCUMBER: 0.118 };

export function summarise(plants: Plant[], crop: CompartmentCv["crop"], imagesToday = 0): CvSummary {
  const stages = [0, 0, 0, 0, 0, 0];
  let fruits = 0;
  let trusses = 0;
  let flowers = 0;
  let ready = 0;
  let h = 0;
  let stem = 0;
  let pestPlants = 0;
  let lastScan = 0;
  const pestMap = new Map<PestKind, { plants: number; rows: Map<string, number> }>();
  for (const p of plants) {
    const cv = p.seen;
    for (const t of cv.trusses) {
      stages[stageIndex(t.ripeness)] += t.fruits;
      fruits += t.fruits;
      trusses += 1;
      if (t.ripeness >= (crop === "TOMATO" ? 3.4 : 3.6)) ready += t.fruits;
    }
    flowers += cv.flowers;
    h += cv.height;
    stem += cv.stem;
    if (cv.pest && cv.pestLevel > 0.08) {
      pestPlants += 1;
      const e = pestMap.get(cv.pest) ?? { plants: 0, rows: new Map() };
      e.plants += 1;
      e.rows.set(p.row, (e.rows.get(p.row) ?? 0) + 1);
      pestMap.set(cv.pest, e);
    }
    lastScan = Math.max(lastScan, p.scannedAt);
  }
  const n = Math.max(1, plants.length);
  // Each modelled plant stands in for ~9 real plants in a 4,940 m² compartment.
  const scale = 9.2;
  return {
    plants: plants.length * scale,
    fruits: fruits * scale,
    trusses: trusses * scale,
    flowers: flowers * scale,
    stages: stages.map((v) => v * scale),
    readyKg7d: ready * scale * FRUIT_KG[crop],
    avgHeight: h / n,
    avgStem: stem / n,
    pestPlants: pestPlants * scale,
    pests: [...pestMap.entries()].map(([kind, e]) => ({ kind, plants: Math.round(e.plants * scale), worstRow: [...e.rows.entries()].sort((a, b) => b[1] - a[1])[0][0] })),
    lastScan,
    imagesToday,
    rawGb: (imagesToday * 4.2) / 1024,
    syncedMb: (plants.length * scale * 1.15) / 1024 + imagesToday * 0.00009,
  };
}

/** Yield-per-row (kg/m² forecast next 7 days) — for the yield lens. */
export function rowYield(comp: CompartmentCv, row: RowCv) {
  const s = summarise(row.plantIds.map((id) => comp.plants[id]), comp.crop);
  const area = (row.z1 - row.z0) * 1.62;
  // Undo the plant scale (9.2) and express as kg/m² over the next 7 days.
  return (s.readyKg7d / 9.2 / area) * 1.25;
}
