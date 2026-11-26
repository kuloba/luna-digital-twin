import { createCv } from "./cv";
import { CHARGE_PADS, COLD_ROOMS, COMPARTMENTS, TANKS, TOWER_ROWS, TOWER_SIZE, ZONE_BY_ID, towerZ } from "./layout";
import { metric, rand, resetRand, vpdOf } from "./metrics";
import type { AmrRuntime, Asset, Batch, FeedEvent, Kpis, SimState, StageKey, StageVisit } from "./types";
import { clockNow } from "@/lib/clock";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

const iso = (ms: number) => new Date(ms).toISOString();

/* ------------------------------------------------------------------ */
/* Batches                                                            */
/* ------------------------------------------------------------------ */

interface BatchSpec {
  code: string;
  cropType: Batch["cropType"];
  cropName: string;
  variety: string;
  stage: StageKey;
  stageProgress: number;
  cycleDay: number;
  cycleDays: number;
  plants: number;
  trays: number;
  forecastKg: number;
  gradeA: number;
  health: Batch["health"];
  where: Partial<Record<StageKey, string[]>>;
  order?: Batch["order"];
  headline: string;
  tempo?: number;
}

function buildRoute(spec: BatchSpec, now: number): StageVisit[] {
  const order: StageKey[] = ["SEEDING", "CULTIVATION", "HARVEST", "QUALITY", "COLD_CHAIN"];
  const current = order.indexOf(spec.stage);
  // Rough stage durations (ms) — propagation 10 d, cultivation the remainder, then hours.
  const growDays = Math.max(spec.cycleDays - 10, 12);
  const dur = [10 * DAY, growDays * DAY, 3 * HOUR, 1.5 * HOUR, 8 * HOUR];
  const enteredCurrent = now - dur[current] * spec.stageProgress;
  const visits: StageVisit[] = [];
  // Walk backwards for history, forwards for plan.
  const starts: number[] = [];
  starts[current] = enteredCurrent;
  for (let i = current - 1; i >= 0; i--) starts[i] = starts[i + 1] - dur[i];
  for (let i = current + 1; i < order.length; i++) starts[i] = starts[i - 1] + dur[i - 1];
  order.forEach((stage, i) => {
    visits.push({
      stage,
      assetIds: spec.where[stage] ?? [],
      enteredAt: iso(starts[i]),
      exitedAt: iso(starts[i] + dur[i]),
      status: i < current ? "DONE" : i === current ? "ACTIVE" : "PLANNED",
    });
  });
  return visits;
}

function towers(row: string, from: number, to: number) {
  const ids: string[] = [];
  for (let i = from; i <= to; i++) ids.push(`${row}-${String(i).padStart(2, "0")}`);
  return ids;
}

function batchSpecs(now: number): BatchSpec[] {
  const today14 = new Date(now);
  today14.setHours(14, 0, 0, 0);
  if (today14.getTime() < now + HOUR) today14.setTime(today14.getTime() + DAY);
  const today16 = new Date(today14.getTime() + 2 * HOUR);
  const soon = new Date(now + 55 * 60_000);
  return [
    {
      code: "LET-1124", cropType: "LETTUCE", cropName: "Butterhead Lettuce", variety: "Rex", stage: "HARVEST", stageProgress: 0.78, cycleDay: 35, cycleDays: 35,
      plants: 4_608, trays: 64, forecastKg: 742, gradeA: 0.952, health: "WATCH",
      where: { SEEDING: ["GERM-03", "SEED-01"], CULTIVATION: towers("C", 1, 4), HARVEST: ["HRV-01", "CUT-01"], QUALITY: ["QA-01", "QA-02"], COLD_CHAIN: ["SEAL-01", "CR-2", "TRK-2"] },
      order: { id: "SO-55812", customer: "Cascade Fresh Markets · Tukwila DC", cases: 1_240, truckId: "TRK-2", dueAt: today14.toISOString() },
      headline: "On pace for the 14:00 Cascade Fresh load. Last two towers clear harvest in ~40 min; watch tipburn on the leaf edge from yesterday's warm afternoon.",
      tempo: 1.6,
    },
    {
      code: "LET-1127", cropType: "LETTUCE", cropName: "Oakleaf Lettuce", variety: "Rouxai", stage: "CULTIVATION", stageProgress: 0.72, cycleDay: 27, cycleDays: 33,
      plants: 4_608, trays: 64, forecastKg: 688, gradeA: 0.941, health: "WATCH",
      where: { SEEDING: ["GERM-01", "SEED-01"], CULTIVATION: towers("C", 5, 8), HARVEST: ["HRV-02", "CUT-01"], QUALITY: ["QA-01", "QA-02"], COLD_CHAIN: ["SEAL-01", "CR-2", "TRK-3"] },
      headline: "Tracking plan. Exposed to the Room V2 climate drift — leaf temperature ran 1.3 °C above setpoint this morning.",
    },
    {
      code: "STR-1102", cropType: "STRAWBERRY", cropName: "Strawberry", variety: "Monterey", stage: "CULTIVATION", stageProgress: 0.46, cycleDay: 64, cycleDays: 120,
      plants: 3_840, trays: 96, forecastKg: 1_310, gradeA: 0.887, health: "HEALTHY",
      where: { SEEDING: ["GERM-02"], CULTIVATION: towers("D", 1, 8), HARVEST: ["HRV-02"], QUALITY: ["QA-02"], COLD_CHAIN: ["CR-1"] },
      headline: "Third flush flowering well — 4.1 open flowers per plant, pollination drones on schedule.",
    },
    {
      code: "BAS-1131", cropType: "BASIL", cropName: "Genovese Basil", variety: "Prospera", stage: "CULTIVATION", stageProgress: 0.55, cycleDay: 19, cycleDays: 28,
      plants: 5_120, trays: 64, forecastKg: 402, gradeA: 0.963, health: "HEALTHY",
      where: { SEEDING: ["GERM-02", "SEED-01"], CULTIVATION: towers("A", 1, 4), HARVEST: ["HRV-01"], QUALITY: ["QA-02"], COLD_CHAIN: ["CR-1"] },
      headline: "Ahead of plan by half a day. Canopy closure 88 %, colour index strong.",
    },
    {
      code: "ARU-1129", cropType: "ARUGULA", cropName: "Wild Arugula", variety: "Astro", stage: "CULTIVATION", stageProgress: 0.84, cycleDay: 23, cycleDays: 26,
      plants: 6_400, trays: 64, forecastKg: 356, gradeA: 0.948, health: "HEALTHY",
      where: { SEEDING: ["GERM-01"], CULTIVATION: towers("A", 5, 8), HARVEST: ["HRV-02"], QUALITY: ["QA-02"], COLD_CHAIN: ["CR-1", "TRK-3"] },
      headline: "Ready for harvest in 3 days. Forecast 356 kg, inside the order window for Thursday.",
    },
    {
      code: "KAL-1135", cropType: "KALE", cropName: "Baby Kale", variety: "Red Russian", stage: "CULTIVATION", stageProgress: 0.38, cycleDay: 15, cycleDays: 30,
      plants: 5_760, trays: 64, forecastKg: 455, gradeA: 0.957, health: "HEALTHY",
      where: { SEEDING: ["GERM-03"], CULTIVATION: towers("B", 1, 8), HARVEST: ["HRV-01"], QUALITY: ["QA-02"], COLD_CHAIN: ["CR-2"] },
      headline: "Healthy. Root-zone EC on tower B-04 is the only number to watch.",
    },
    {
      code: "MIC-1140", cropType: "MICROGREENS", cropName: "Pea Shoots", variety: "Dwarf Grey", stage: "SEEDING", stageProgress: 0.42, cycleDay: 3, cycleDays: 12,
      plants: 38_400, trays: 96, forecastKg: 210, gradeA: 0.97, health: "HEALTHY",
      where: { SEEDING: ["GERM-02", "SEED-01"], CULTIVATION: ["B-05", "B-06"], HARVEST: ["HRV-02"], QUALITY: ["QA-02"], COLD_CHAIN: ["CR-1"] },
      headline: "Germination 97.4 % at 72 h — above the 95 % target.",
    },
    {
      code: "LET-1138", cropType: "LETTUCE", cropName: "Romaine", variety: "Sparx", stage: "SEEDING", stageProgress: 0.7, cycleDay: 7, cycleDays: 38,
      plants: 4_608, trays: 64, forecastKg: 760, gradeA: 0.94, health: "HEALTHY",
      where: { SEEDING: ["GERM-01", "SEED-01"], CULTIVATION: towers("C", 1, 4), HARVEST: ["HRV-01"], QUALITY: ["QA-02"], COLD_CHAIN: ["CR-2"] },
      headline: "Moves to Room V2 towers C-01–C-04 as soon as LET-1124 clears them.",
    },
    {
      code: "TOM-1088", cropType: "TOMATO", cropName: "Tomato", variety: "Merlice", stage: "CULTIVATION", stageProgress: 0.58, cycleDay: 164, cycleDays: 300,
      plants: 6_120, trays: 0, forecastKg: 9_840, gradeA: 0.91, health: "HEALTHY",
      where: { SEEDING: ["GERM-03"], CULTIVATION: ["G1"], HARVEST: ["HRV-02"], QUALITY: ["QA-01"], COLD_CHAIN: ["CR-1"] },
      headline: "Avg fruit weight 132 g vs 128 g target. Balance slightly generative — keep 24 h temp at 19.2 °C.",
    },
    {
      code: "TOM-1092", cropType: "TOMATO", cropName: "Tomato", variety: "Merlice", stage: "CULTIVATION", stageProgress: 0.31, cycleDay: 121, cycleDays: 300,
      plants: 6_120, trays: 0, forecastKg: 10_120, gradeA: 0.9, health: "WATCH",
      where: { SEEDING: ["GERM-03"], CULTIVATION: ["G2"], HARVEST: ["HRV-02"], QUALITY: ["QA-01"], COLD_CHAIN: ["CR-1"] },
      headline: "LUNA cameras counted 6.8 trusses/plant, 0.3 behind plan. Light-limited week — DLI 13.9 vs 15 target.",
    },
    {
      code: "CUC-1118", cropType: "CUCUMBER", cropName: "Mini Cucumber", variety: "Proloog", stage: "CULTIVATION", stageProgress: 0.66, cycleDay: 74, cycleDays: 110,
      plants: 5_400, trays: 0, forecastKg: 7_260, gradeA: 0.93, health: "HEALTHY",
      where: { SEEDING: ["GERM-02"], CULTIVATION: ["G3"], HARVEST: ["HRV-02"], QUALITY: ["QA-01"], COLD_CHAIN: ["CR-2"] },
      headline: "Picking 3× weekly at 2.9 kg/m². Powdery mildew scouting clear for 14 days.",
    },
    {
      code: "LET-1119", cropType: "LETTUCE", cropName: "Butterhead Lettuce", variety: "Rex", stage: "QUALITY", stageProgress: 0.5, cycleDay: 35, cycleDays: 35,
      plants: 4_608, trays: 64, forecastKg: 731, gradeA: 0.944, health: "HEALTHY",
      where: { SEEDING: ["GERM-01"], CULTIVATION: towers("C", 5, 8), HARVEST: ["HRV-01", "CUT-01"], QUALITY: ["QA-01", "QA-02", "QA-03"], COLD_CHAIN: ["SEAL-01", "CR-2", "TRK-2"] },
      order: { id: "SO-55812", customer: "Cascade Fresh Markets · Tukwila DC", cases: 1_240, truckId: "TRK-2", dueAt: today14.toISOString() },
      headline: "Optical grading 50 % complete. Micro swab panel pending — results due 11:40.",
      tempo: 1.4,
    },
    {
      code: "BAS-1115", cropType: "BASIL", cropName: "Genovese Basil", variety: "Prospera", stage: "COLD_CHAIN", stageProgress: 0.55, cycleDay: 28, cycleDays: 28,
      plants: 5_120, trays: 64, forecastKg: 398, gradeA: 0.961, health: "HEALTHY",
      where: { SEEDING: ["GERM-02"], CULTIVATION: towers("A", 1, 4), HARVEST: ["HRV-01"], QUALITY: ["QA-02"], COLD_CHAIN: ["SEAL-01", "CR-1", "TRK-1"] },
      order: { id: "SO-55807", customer: "Puget Provisions Co-op", cases: 610, truckId: "TRK-1", dueAt: soon.toISOString() },
      headline: "Staged in Cold Room 1 at 7.8 °C (basil held warm to avoid chilling injury). Loading on TRK-1.",
    },
    {
      code: "ARU-1121", cropType: "ARUGULA", cropName: "Wild Arugula", variety: "Astro", stage: "COLD_CHAIN", stageProgress: 0.3, cycleDay: 26, cycleDays: 26,
      plants: 6_400, trays: 64, forecastKg: 348, gradeA: 0.95, health: "HEALTHY",
      where: { SEEDING: ["GERM-01"], CULTIVATION: towers("A", 5, 8), HARVEST: ["HRV-02"], QUALITY: ["QA-02"], COLD_CHAIN: ["SEAL-01", "CR-2", "TRK-3"] },
      order: { id: "SO-55819", customer: "Salish Kitchen Group", cases: 520, truckId: "TRK-3", dueAt: today16.toISOString() },
      headline: "Packed and chilled to 1.8 °C. Loads on TRK-3 for the 16:00 run.",
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Assets                                                             */
/* ------------------------------------------------------------------ */

function add(assets: Record<string, Asset>, a: Asset) {
  assets[a.id] = a;
}

function buildAssets(batches: Record<string, Batch>): Record<string, Asset> {
  const assets: Record<string, Asset> = {};
  const towerBatch: Record<string, string> = {};
  for (const b of Object.values(batches)) {
    if (b.stage === "CULTIVATION" || b.stage === "HARVEST") {
      const visit = b.route.find((v) => v.stage === "CULTIVATION");
      visit?.assetIds.forEach((id) => (towerBatch[id] = b.id));
    }
  }

  // Grow rooms (climate envelopes).
  for (const id of ["V1", "V2"] as const) {
    const [x0, z0, x1, z1] = ZONE_BY_ID[id].bounds;
    const temp = metric("temp", { setpoint: 21.2, value: 21.2 });
    const rh = metric("rh", { setpoint: 65, value: 65 });
    const vpd = metric("vpd", { value: vpdOf(temp.value, rh.value) });
    add(assets, {
      id, kind: "ROOM", name: `Grow Room ${id}`, zoneId: id, roomId: id,
      position: [(x0 + x1) / 2, 0, (z0 + z1) / 2], size: [x1 - x0, 5.4, z1 - z0],
      status: "OK", activity: "Photoperiod 16/8 · lights on",
      metrics: { temp, rh, vpd, co2: metric("co2"), ppfd: metric("ppfd", { setpoint: 285 }), dli: metric("dli", { setpoint: 16.4, value: 11.2, low: 0, high: 19 }) },
      detail: { photoperiod: "16 h / 8 h", spectrum: "R 62 · B 18 · G 12 · FR 8", lightsOn: "05:00", lightsOff: "21:00", towers: 16 },
    });
  }

  // Towers.
  for (const { row, room, x } of TOWER_ROWS) {
    for (let i = 0; i < 8; i++) {
      const id = `${row}-${String(i + 1).padStart(2, "0")}`;
      const batchId = towerBatch[id];
      const harvesting = batchId === "LET-1124";
      const irrigating = (i + row.charCodeAt(0)) % 5 === 0;
      add(assets, {
        id, kind: "TOWER", name: `Tower ${id}`, zoneId: room, roomId: room,
        position: [x, 0, towerZ(i)], size: TOWER_SIZE,
        status: batchId ? "ACTIVE" : "IDLE",
        activity: harvesting ? "Harvest queued" : batchId ? (irrigating ? "Irrigating" : "Growing") : "Sanitising",
        batchId,
        progress: batchId ? batches[batchId].cycleDay / batches[batchId].cycleDays : 0,
        metrics: {
          ec: metric("ec", { setpoint: row === "D" ? 1.4 : 1.8, low: row === "D" ? 1.2 : 1.6, high: row === "D" ? 1.65 : 2.05 }),
          ph: metric("ph"),
          ppfd: metric("ppfd", { setpoint: row === "D" ? 340 : 285, low: row === "D" ? 300 : 250, high: row === "D" ? 380 : 320 }),
          waterTemp: metric("waterTemp"),
          do: metric("do"),
          flow: metric("flow", { setpoint: irrigating ? 18 : 0, low: 0, high: 24 }),
        },
        detail: { tiers: 6, trays: 16, recipe: row === "D" ? "Strawberry · Fruiting v3" : row === "A" ? "Basil · Aroma+" : "Leafy · Fast-36 v7", lastIrrigation: `${2 + (i % 4)} min ago` },
      });
    }
  }

  // Climate + fertigation equipment.
  add(assets, { id: "HVAC-V1", kind: "HVAC", name: "HVAC · Room V1", zoneId: "V1", roomId: "V1", position: [-36, 5.4, -27], size: [2.6, 1.4, 3.2], status: "ACTIVE", activity: "Cooling · stage 2",
    metrics: { power: metric("power", { setpoint: 38 }), flow: metric("flow", { label: "Airflow", unit: "m³/s", setpoint: 6.2, low: 5, high: 8 }), temp: metric("temp", { label: "Supply air", setpoint: 16.5, low: 14, high: 19 }) },
    detail: { stages: "2 / 3", dehumidifier: "On · 42 L/h", filter: "MERV-13 · 61 % life" } });
  add(assets, { id: "HVAC-V2", kind: "HVAC", name: "HVAC · Room V2", zoneId: "V2", roomId: "V2", position: [-17, 5.4, -27], size: [2.6, 1.4, 3.2], status: "ACTIVE", activity: "Cooling · stage 2",
    metrics: { power: metric("power", { setpoint: 40 }), flow: metric("flow", { label: "Airflow", unit: "m³/s", setpoint: 6.4, low: 5, high: 8 }), temp: metric("temp", { label: "Supply air", setpoint: 16.2, low: 14, high: 19 }) },
    detail: { stages: "2 / 3", dehumidifier: "On · 38 L/h", filter: "MERV-13 · 74 % life" } });
  add(assets, { id: "DOS-V1", kind: "DOSING", name: "Dosing Station V1", zoneId: "V1", roomId: "V1", position: [-23, 0, -27.5], size: [2.2, 1.8, 1.6], status: "ACTIVE", activity: "Dosing A/B",
    metrics: { ec: metric("ec", { label: "Mix EC" }), ph: metric("ph", { label: "Mix pH" }), flow: metric("flow", { setpoint: 42, low: 30, high: 55 }) },
    detail: { tankA: 72, tankB: 69, acid: 54, pump2: "Calibrated 9 d ago" } });
  add(assets, { id: "DOS-V2", kind: "DOSING", name: "Dosing Station V2", zoneId: "V2", roomId: "V2", position: [-4, 0, -27.5], size: [2.2, 1.8, 1.6], status: "ACTIVE", activity: "Dosing A/B",
    metrics: { ec: metric("ec", { label: "Mix EC" }), ph: metric("ph", { label: "Mix pH" }), flow: metric("flow", { setpoint: 44, low: 30, high: 55 }) },
    detail: { tankA: 58, tankB: 61, acid: 47, pump2: "Calibrated 2 d ago" } });

  // Propagation.
  add(assets, { id: "SEED-01", kind: "SEEDER", name: "Seeding Line 01", zoneId: "PROP", position: [-54.5, 0, -18], size: [2.2, 1.4, 20], status: "ACTIVE", activity: "Seeding · LET-1142",
    metrics: { throughput: metric("throughput", { setpoint: 180, low: 140, high: 220 }), moisture: metric("moisture", { label: "Plug moisture" }) },
    detail: { sownToday: 1_284, seedSingulation: "98.9 %", nextBatch: "LET-1142 · Butterhead" }, progress: 0.46 });
  ["GERM-01", "GERM-02", "GERM-03"].forEach((id, i) => {
    add(assets, { id, kind: "GERMINATION", name: `Germination Chamber ${i + 1}`, zoneId: "PROP", position: [-45.5, 0, -25 + i * 7.4], size: [6, 3, 5.2], status: "ACTIVE",
      activity: i === 1 ? "Germinating · MIC-1140" : i === 0 ? "Germinating · LET-1138" : "Hardening off",
      batchId: i === 1 ? "MIC-1140" : i === 0 ? "LET-1138" : undefined,
      progress: i === 1 ? 0.42 : i === 0 ? 0.7 : 0.15,
      metrics: { temp: metric("temp", { setpoint: 23.5, low: 22, high: 25 }), rh: metric("rh", { setpoint: 92, low: 86, high: 97 }), moisture: metric("moisture"), germination: metric("germination", { setpoint: i === 1 ? 97.4 : 95.8 }) },
      detail: { trays: 96, dark: i === 2 ? "No" : "Yes", hours: i === 1 ? 72 : i === 0 ? 118 : 26 } });
  });

  // Glasshouse compartments + LUNA camera rails.
  const ghBatch: Record<string, string> = { G1: "TOM-1088", G2: "TOM-1092", G3: "CUC-1118" };
  for (const c of COMPARTMENTS) {
    const [x0, z0, x1, z1] = c.bounds;
    const temp = metric("temp", { setpoint: 20.4, low: 18, high: 24, value: 20.4 });
    const rh = metric("rh", { setpoint: 74, low: 65, high: 85, value: 74 });
    add(assets, { id: c.id, kind: "COMPARTMENT", name: c.name, zoneId: "GH", roomId: c.id, position: [(x0 + x1) / 2, 0, (z0 + z1) / 2], size: [x1 - x0, 4.2, z1 - z0],
      status: "ACTIVE", activity: c.id === "G3" ? "Picking · row 6" : "Day · vents 18 %", batchId: ghBatch[c.id],
      metrics: { temp, rh, vpd: metric("vpd", { value: vpdOf(temp.value, rh.value), low: 0.5, high: 1.1, setpoint: 0.65 }), co2: metric("co2", { setpoint: 780, low: 650, high: 950 }), ppfd: metric("ppfd", { label: "PAR at head", setpoint: 410, low: 300, high: 700, noise: 6 }), dli: metric("dli", { setpoint: 15, value: 9.4, low: 0, high: 30 }) },
      detail: { crop: c.id === "G3" ? "Mini Cucumber · Proloog" : "Tomato · Merlice", area: "4,940 m²", vents: "18 %", screen: "Energy 0 %", heating: "Pipe 38 °C", avgFruitWeight: c.id === "G3" ? "118 g" : c.id === "G1" ? "132 g" : "126 g" } });
    add(assets, { id: `CAM-${c.id}`, kind: "CAMERA", name: `LUNA Camera Rail ${c.id}`, zoneId: "GH", roomId: c.id, position: [(x0 + x1) / 2, 4.6, (z0 + z1) / 2], size: [x1 - x0, 0.4, 0.6],
      status: "ACTIVE", activity: "Scanning", progress: 0.2 + 0.25 * COMPARTMENTS.indexOf(c),
      metrics: { coverage: metric("coverage", { setpoint: 100, value: 100 }) },
      detail: { images: 18_400 + Math.round(rand() * 2_000), plantsCounted: 6_120, flowers: c.id === "G3" ? "—" : "4.2 / truss", fruit: c.id === "G3" ? "11.3 / plant" : "6.8 trusses", pestFlags: c.id === "G2" ? 2 : 0 } });
  }

  // Harvest.
  add(assets, { id: "HRV-01", kind: "HARVESTER", name: "Robotic Harvester 01", zoneId: "HARV", position: [7, 0, -14], size: [3.4, 2.6, 3.4], status: "ACTIVE", activity: "Cutting · LET-1124", batchId: "LET-1124", progress: 0.38,
    metrics: { throughput: metric("throughput", { setpoint: 124 }), cycleTime: metric("cycleTime", { setpoint: 27.5 }) },
    detail: { bladeHours: 412, visionModel: "LeafCut v4.2", traysToday: 214 } });
  add(assets, { id: "HRV-02", kind: "HARVESTER", name: "Robotic Harvester 02", zoneId: "HARV", position: [15, 0, -14], size: [3.4, 2.6, 3.4], status: "IDLE", activity: "Blade change · ready 09:55",
    metrics: { throughput: metric("throughput", { setpoint: 0, value: 0, low: 0 }), cycleTime: metric("cycleTime", { setpoint: 0, value: 0, low: 0 }) },
    detail: { bladeHours: 0, visionModel: "LeafCut v4.2", traysToday: 168 } });
  add(assets, { id: "CUT-01", kind: "CONVEYOR", name: "Cutting & Transfer Line", zoneId: "HARV", position: [20.5, 0, -21], size: [37, 0.9, 1.4], status: "ACTIVE", activity: "Running · 0.42 m/s",
    metrics: { throughput: metric("throughput", { setpoint: 126 }), load: metric("load", { setpoint: 64, value: 64 }) }, detail: { speed: "0.42 m/s", length: "37 m" } });

  // QA.
  add(assets, { id: "QA-01", kind: "QA", name: "Checkweigher QA-01", zoneId: "QA", position: [25.5, 0, -16], size: [2.6, 1.6, 2.2], status: "ACTIVE", activity: "Weighing · LET-1119", batchId: "LET-1119", progress: 0.5,
    metrics: { weightDev: metric("weightDev"), passRate: metric("passRate", { label: "In-spec", setpoint: 99.1, low: 97 }), throughput: metric("throughput", { setpoint: 128 }) },
    detail: { target: "150 g / head", tare: "Auto", lastCal: "06:10 today" } });
  add(assets, { id: "QA-02", kind: "QA", name: "Optical Grader QA-02", zoneId: "QA", position: [31, 0, -16], size: [3.6, 2.2, 2.6], status: "ACTIVE", activity: "Optical scan · LET-1119", batchId: "LET-1119", progress: 0.5,
    metrics: { passRate: metric("passRate"), rejectRate: metric("rejectRate"), throughput: metric("throughput", { setpoint: 126 }) },
    detail: { model: "GradeVision 3.1", checks: "Colour · Tipburn · Size · Foreign matter", camerasOnline: "6 / 6" } });
  add(assets, { id: "QA-03", kind: "QA", name: "Micro Lab QA-03", zoneId: "QA", position: [31.5, 0, -26.5], size: [6, 2.6, 4], status: "ACTIVE", activity: "Swab panel · 3 pending",
    metrics: { passRate: metric("passRate", { label: "Swab pass (30 d)", setpoint: 100, low: 99.5, high: 100, noise: 0 }) },
    detail: { pending: 3, nextResult: "11:40", panel: "Listeria · E. coli O157 · Salmonella", lastPositive: "None in 214 d" } });

  // Pack.
  add(assets, { id: "WASH-01", kind: "WASHER", name: "Wash & Spin Line", zoneId: "PACK", position: [43, 0, -16], size: [4.4, 2, 2.6], status: "ACTIVE", activity: "Washing",
    metrics: { waterTemp: metric("waterTemp", { label: "Flume temp", setpoint: 3.5, low: 2, high: 5 }), flow: metric("flow", { setpoint: 120, low: 100, high: 140 }) },
    detail: { sanitiser: "PAA 62 ppm", chiller: "On" } });
  add(assets, { id: "SEAL-01", kind: "SEALER", name: "Clamshell Sealer", zoneId: "PACK", position: [50.5, 0, -16], size: [3.4, 2.2, 2.4], status: "ACTIVE", activity: "Sealing · 5 oz clamshell",
    metrics: { throughput: metric("throughput", { label: "Throughput", unit: "packs/min", setpoint: 64, low: 52, high: 80, noise: 0.6 }), cycleTime: metric("cycleTime", { setpoint: 0.94, low: 0.75, high: 1.15, noise: 0.01, precision: 2 }) },
    detail: { format: "5 oz clamshell", labels: "Lot + QR trace", packedToday: 8_412 } });

  // Cold chain.
  for (const r of COLD_ROOMS) {
    const [x0, z0, x1, z1] = r.bounds;
    add(assets, { id: r.id, kind: "COLD_ROOM", name: r.name, zoneId: "COLD", roomId: r.id, position: [(x0 + x1) / 2, 0, (z0 + z1) / 2], size: [x1 - x0, 4.6, z1 - z0],
      status: "ACTIVE", activity: "Holding 2.0 °C",
      metrics: { temp: metric("temp", { label: "Room temp", setpoint: r.setpoint, low: 0.5, high: 4, noise: 0.03 }), rh: metric("rh", { setpoint: 93, low: 88, high: 98 }), load: metric("load", { label: "Occupancy", setpoint: r.id === "CR-1" ? 71 : 58, value: r.id === "CR-1" ? 71 : 58, high: 95 }), doorOpen: metric("doorOpen", { value: 0 }) },
      detail: { pallets: r.id === "CR-1" ? 22 : 18, capacity: 32, door: "Closed" } });
  }
  [43, 49, 55].forEach((x, i) => {
    const id = `DOCK-${i + 1}`;
    add(assets, { id, kind: "DOCK", name: `Dock Door ${i + 1}`, zoneId: "COLD", position: [x, 0, 32], size: [3.4, 3.4, 0.4], status: i === 2 ? "IDLE" : "ACTIVE", activity: i === 2 ? "Open slot 15:30" : "Loading", metrics: {} });
  });
  const trucks = [
    { id: "TRK-1", dest: "Puget Provisions Co-op · Seattle", depart: "in 55 min", load: 0.82, batch: "BAS-1115" },
    { id: "TRK-2", dest: "Cascade Fresh Markets · Tukwila DC", depart: "14:00", load: 0.34, batch: "LET-1124" },
    { id: "TRK-3", dest: "Salish Kitchen Group · Bellevue", depart: "16:00", load: 0.12, batch: "ARU-1121" },
  ];
  trucks.forEach((t, i) => {
    add(assets, { id: t.id, kind: "TRUCK", name: `Reefer ${t.id}`, zoneId: "COLD", position: [43 + i * 6, 0, 39], size: [2.6, 3.6, 10], status: "ACTIVE", activity: i === 0 ? "Loading · 82 %" : "Loading", batchId: t.batch, progress: t.load,
      metrics: { temp: metric("temp", { label: "Reefer temp", setpoint: 2, low: 0.5, high: 4, noise: 0.03 }), load: metric("load", { label: "Load", setpoint: t.load * 100, value: t.load * 100, high: 100 }) },
      detail: { destination: t.dest, departs: t.depart, pallets: `${Math.round(t.load * 26)} / 26`, carrier: "Evergreen Reefer Lines", sealed: "No" } });
  });

  // Fertigation + utility tanks.
  for (const t of TANKS) {
    const metrics: Asset["metrics"] = { level: metric("level", { setpoint: t.level, value: t.level, low: t.role === "drain" ? 10 : 25, high: t.role === "drain" ? 85 : 98 }) };
    let activity = "Holding";
    let detail: Asset["detail"] = { capacity: "", role: t.role };
    if (t.role === "water") {
      metrics.ph = metric("ph", { label: "Raw pH", setpoint: 6.6, low: 5.8, high: 7.4 });
      metrics.ec = metric("ec", { label: "Raw EC", setpoint: 0.08, low: 0, high: 0.3, noise: 0.002 });
      activity = "Collecting · 0.4 m³/h";
      detail = { capacity: "1,800 m³", source: "Roof catchment 2.1 ha", filter: "Sand + 50 µm" };
    } else if (t.role === "stockA" || t.role === "stockB") {
      metrics.ec = metric("ec", { label: "Stock EC", setpoint: 92, low: 80, high: 105, noise: 0.15, precision: 0 });
      activity = "Feeding DOS-V1 · DOS-V2 · GH";
      detail = { capacity: "12 m³", concentration: "100×", lastFill: t.role === "stockA" ? "3 d ago" : "6 d ago", daysLeft: t.role === "stockA" ? 5.1 : 2.2 };
    } else if (t.role === "acid") {
      activity = "pH correction";
      detail = { capacity: "2 m³", concentration: "38 % HNO₃", daysLeft: 9 };
    } else if (t.role === "mix") {
      metrics.ec = metric("ec", { label: "Mix EC", setpoint: 2.6, low: 2.3, high: 2.9 });
      metrics.ph = metric("ph", { label: "Mix pH", setpoint: 5.7, low: 5.4, high: 6 });
      metrics.waterTemp = metric("waterTemp", { label: "Mix temp", setpoint: 19, low: 16, high: 22 });
      metrics.flow = metric("flow", { label: "Outflow", setpoint: 310, low: 0, high: 420, noise: 4 });
      activity = "Irrigating G1 · valve 4";
      detail = { capacity: "24 m³", recipe: "Tomato · generative wk 22", valves: "G1-4 open" };
    } else if (t.role === "drain") {
      metrics.ec = metric("ec", { label: "Drain EC", setpoint: 3.4, low: 2.6, high: 4.2 });
      metrics.uv = metric("uv");
      activity = "UV disinfecting · 6 m³/h";
      detail = { capacity: "30 m³", drainShare: "31 %", reuse: "Blending 40 % into mix" };
    } else if (t.role === "co2") {
      metrics.pressure = metric("pressure", { setpoint: 17.6, low: 15, high: 20, precision: 1, noise: 0.03 });
      metrics.flow = metric("flow", { label: "Dosing", unit: "kg/h", setpoint: 42, low: 0, high: 80, noise: 0.6 });
      activity = "Dosing G1–G3 · 42 kg/h";
      detail = { capacity: "30 t", supplier: "Next delivery Fri", daysLeft: 4.6 };
    } else if (t.role === "heat") {
      metrics.temp = metric("temp", { label: "Top temp", setpoint: 88, low: 70, high: 95, noise: 0.08 });
      metrics.power = metric("power", { label: "CHP output", unit: "MWth", setpoint: 1.9, low: 0, high: 2.6, noise: 0.01, precision: 2 });
      activity = "Charging from CHP";
      detail = { capacity: "900 m³", storedEnergy: "41 MWh", nightDraw: "Est. 26 MWh" };
    }
    add(assets, { id: t.id, kind: "TANK", name: t.name, zoneId: "UTIL", position: [t.x, 0, t.z], size: [t.r * 2, t.h, t.r * 2], status: t.role === "stockB" ? "WATCH" : "ACTIVE", activity, metrics, detail });
  }

  // Glasshouse rows (CV-derived, see cv.ts) and the LUNA edge node.
  for (const c of COMPARTMENTS) {
    for (let r = 0; r < 10; r++) {
      const id = `${c.id}-R${String(r + 1).padStart(2, "0")}`;
      const x = c.bounds[0] + 1.8 + r * 1.62;
      add(assets, { id, kind: "ROW", name: `Row ${r + 1} · ${c.id}`, zoneId: "GH", roomId: c.id, position: [x, 0, 18.8], size: [1.1, 3.4, 23.4], status: "ACTIVE", activity: c.id === "G3" && r === 5 ? "Picking" : "Growing", batchId: ghBatch[c.id], metrics: {} });
    }
  }
  add(assets, { id: "EDGE-01", kind: "EDGE", name: "LUNA Edge Node", zoneId: "GH", roomId: "G3", position: [-4.2, 0, 29.6], size: [1.4, 2.2, 1.1], status: "ACTIVE", activity: "Inferencing · 3 rails",
    metrics: { power: metric("power", { label: "Power", unit: "W", setpoint: 640, low: 0, high: 900, noise: 6 }), throughput: metric("throughput", { label: "Inference", unit: "img/s", setpoint: 38, low: 20, high: 60, noise: 1.2 }) },
    detail: { gpus: "2 × L4", models: "TrussNet 5.2 · RipeNet 3.0 · PestScout 2.4", uplink: "LTE 12 Mbps", latency: "~140 ms frame → twin" } });

  // AMRs.
  for (let i = 1; i <= 10; i++) {
    const id = `AMR-${String(i).padStart(2, "0")}`;
    const pad = CHARGE_PADS[(i - 1) % CHARGE_PADS.length];
    add(assets, { id, kind: "AMR", name: `AMR ${String(i).padStart(2, "0")}`, zoneId: "HARV", position: [pad[0], 0, pad[1]], size: [1, 0.5, 1.3], status: "IDLE", activity: "Idle",
      metrics: { battery: metric("battery", { value: id === "AMR-08" ? 23 : 48 + Math.round(rand() * 46) }), payload: metric("payload", { value: 0 }) },
      detail: { fleet: "Tray Mover TM-3", firmware: "4.8.1", odometer: `${(1200 + rand() * 900).toFixed(0)} km` } });
  }

  return assets;
}

/** What happened earlier in the shift, so the feed has context at load. */
function initialFeed(now: number): FeedEvent[] {
  const MIN = 60_000;
  const ev = (mins: number, tone: FeedEvent["tone"], text: string, assetId?: string): FeedEvent => ({ id: `ev-seed-${mins}`, at: now - mins * MIN, tone, text, assetId });
  return [
    ev(9, "info", "TRK-1 started loading for Puget Provisions — 21 of 26 pallets staged.", "TRK-1"),
    ev(22, "positive", "LET-1124 entered Automated Harvest on HRV-01.", "HRV-01"),
    ev(31, "warning", "Whitefly flagged on 101 plants in G2 rows 3–5 — scout requested for 11:00.", "CAM-G2"),
    ev(48, "info", "HRV-02 blade change started; LET-1127 moved to HRV-01's queue.", "HRV-02"),
    ev(74, "positive", "Resolved: CR-1 door seal reset — room back to 2.0 °C within 6 min.", "CR-1"),
    ev(96, "positive", "QA-01 checkweigher calibrated against reference weights.", "QA-01"),
    ev(128, "info", "Night shift handover: no open alerts, 14 batches on plan.", undefined),
  ];
}

function buildAmrs(): Record<string, AmrRuntime> {
  const amrs: Record<string, AmrRuntime> = {};
  for (let i = 1; i <= 10; i++) {
    const id = `AMR-${String(i).padStart(2, "0")}`;
    amrs[id] = { id, state: "IDLE", travelled: 0, speed: 2.6 + (i % 3) * 0.25, dwell: id === "AMR-08" ? 1 : i * 1.6, home: CHARGE_PADS[(i - 1) % CHARGE_PADS.length], recall: false, at: CHARGE_PADS[(i - 1) % CHARGE_PADS.length], drain: 1 };
  }
  return amrs;
}

function buildKpis(now: number): Kpis {
  const d = new Date(now);
  const hours = d.getHours() + d.getMinutes() / 60;
  const dayShare = Math.min(1, Math.max(0.18, (hours - 5) / 12));
  const yieldPlanKg = 4_850;
  const yieldTodayKg = Math.round(yieldPlanKg * dayShare * 1.032);
  const mk = (base: number, amp: number) => Array.from({ length: 24 }, (_, i) => base + Math.sin(i / 3) * amp + (rand() - 0.5) * amp);
  return {
    yieldTodayKg,
    yieldPlanKg,
    activeTowers: 29,
    totalTowers: 32,
    gradeA: 94.6,
    gradeATarget: 93,
    traysPerHour: 248,
    onTimeDispatch: 97.8,
    robotUtilisation: 81,
    energyKwh: 14_820,
    history: {
      yieldTodayKg: Array.from({ length: 24 }, (_, i) => Math.round((yieldTodayKg * (i + 1)) / 24)),
      gradeA: mk(94.4, 0.6),
      activeTowers: Array.from({ length: 24 }, () => 29),
      traysPerHour: mk(240, 12),
      onTimeDispatch: mk(97.5, 0.5),
      robotUtilisation: mk(79, 4),
    },
  };
}

export function createInitialState(now = clockNow()): SimState {
  resetRand();
  const batches: Record<string, Batch> = {};
  for (const spec of batchSpecs(now)) {
    batches[spec.code] = {
      id: spec.code,
      code: spec.code,
      cropType: spec.cropType,
      cropName: spec.cropName,
      variety: spec.variety,
      stage: spec.stage,
      health: spec.health,
      stageProgress: spec.stageProgress,
      cycleDay: spec.cycleDay,
      cycleDays: spec.cycleDays,
      plants: spec.plants,
      trays: spec.trays,
      forecastKg: spec.forecastKg,
      gradeA: spec.gradeA,
      route: buildRoute(spec, now),
      order: spec.order,
      headline: spec.headline,
      tempo: spec.tempo ?? 0.15,
    };
  }
  return {
    tick: 0,
    lastTickAt: now,
    startedAt: now,
    assets: buildAssets(batches),
    amrs: buildAmrs(),
    batches,
    alerts: [],
    feed: initialFeed(now),
    kpis: buildKpis(now),
    incidents: {},
    cv: createCv(),
  };
}
