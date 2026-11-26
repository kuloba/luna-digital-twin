import { stepCv, summarise } from "./cv";
import { INCIDENTS, INCIDENT_BY_ID } from "./incidents";
import { CHARGE_PADS, STATIONS, ZONES, corridorPath, pathLength, pointAlong } from "./layout";
import { jitter, rand, vpdOf } from "./metrics";
import type { Alert, AmrMission, AmrRuntime, Asset, Batch, FeedEvent, SimState, StageKey, ZoneId } from "./types";
import { STAGES } from "./types";
import { clockNow } from "@/lib/clock";

/**
 * The simulation. `step` advances the whole facility by one second and is a
 * pure function of the previous state (it clones, then mutates the clone).
 * In production this file is replaced by a GraphQL subscription; nothing
 * outside `src/sim` knows the difference.
 */

const HISTORY = 90;
let idCounter = 0;
const uid = (p: string) => `${p}-${clockNow().toString(36)}-${(idCounter++).toString(36)}`;

export function feed(s: SimState, tone: FeedEvent["tone"], text: string, assetId?: string) {
  s.feed = [{ id: uid("ev"), at: clockNow(), tone, text, assetId }, ...s.feed].slice(0, 40);
}

/* ------------------------------------------------------------------ */
/* Metrics                                                            */
/* ------------------------------------------------------------------ */

const DERIVED = new Set(["vpd", "battery", "payload", "load", "doorOpen", "coverage", "level"]);

function stepMetrics(a: Asset) {
  for (const m of Object.values(a.metrics)) {
    if (!m) continue;
    if (!DERIVED.has(m.key)) {
      const target = m.setpoint + m.bias;
      m.value = m.value + (target - m.value) * m.response + jitter(m.noise);
    }
    if (m.key === "load") m.value = m.value + (m.setpoint - m.value) * 0.05;
  }
  const t = a.metrics.temp;
  const rh = a.metrics.rh;
  const vpd = a.metrics.vpd;
  if (t && rh && vpd) vpd.value = vpdOf(t.value, Math.min(99, Math.max(5, rh.value)));
  for (const m of Object.values(a.metrics)) {
    if (!m) continue;
    m.history.push(m.value);
    if (m.history.length > HISTORY) m.history.shift();
  }
}

/* ------------------------------------------------------------------ */
/* Robots                                                             */
/* ------------------------------------------------------------------ */

interface MissionTemplate {
  from: string;
  to: string;
  label: string;
  payload: string;
  batchId?: string;
  trays: number;
  weight: number;
}

function missionTemplates(s: SimState): MissionTemplate[] {
  const let1124 = s.batches["LET-1124"];
  const harvesting = let1124?.stage === "HARVEST";
  return [
    { from: "V2", to: "HARV", label: "Mature trays · LET-1124", payload: "16 trays · 186 kg", batchId: "LET-1124", trays: 16, weight: harvesting ? 6 : 0.5 },
    { from: "HARV", to: "V2", label: "Clean trays → Room V2", payload: "16 empty trays", trays: 16, weight: harvesting ? 2 : 0.6 },
    { from: "PROP", to: "V2", label: "Transplant · LET-1138", payload: "12 seedling trays", batchId: "LET-1138", trays: 12, weight: 1.2 },
    { from: "PROP", to: "V1", label: "Transplant · MIC-1140", payload: "12 seedling trays", batchId: "MIC-1140", trays: 12, weight: 1 },
    { from: "G1", to: "HARV", label: "Tomato bins · TOM-1088", payload: "8 bins · 248 kg", batchId: "TOM-1088", trays: 8, weight: 1.6 },
    { from: "G3", to: "HARV", label: "Cucumber bins · CUC-1118", payload: "8 bins · 212 kg", batchId: "CUC-1118", trays: 8, weight: 1.4 },
    { from: "PACK", to: "CR-2", label: "Cases → Cold Room 2", payload: "2 pallets · 240 cases", batchId: "LET-1119", trays: 2, weight: 1.8 },
    { from: "PACK", to: "CR-1", label: "Cases → Cold Room 1", payload: "1 pallet · 120 cases", trays: 1, weight: 1 },
    { from: "CR-1", to: "DOCK", label: "Load TRK-1 · BAS-1115", payload: "2 pallets", batchId: "BAS-1115", trays: 2, weight: 1.6 },
    { from: "CR-2", to: "DOCK", label: "Load TRK-3 · ARU-1121", payload: "2 pallets", batchId: "ARU-1121", trays: 2, weight: 1 },
    { from: "HARV", to: "PROP", label: "Empty trays → wash", payload: "24 empty trays", trays: 24, weight: 0.8 },
  ];
}

function pick<T extends { weight: number }>(items: T[]): T {
  const total = items.reduce((a, b) => a + b.weight, 0);
  let r = rand() * total;
  for (const it of items) {
    r -= it.weight;
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

const doorOf = (p: [number, number]): [number, number] => [p[0], p[1] < 0 ? -4 : 4];

function buildMission(r: AmrRuntime, t: MissionTemplate): AmrMission {
  const from = STATIONS[t.from];
  const to = STATIONS[t.to];
  const legA = corridorPath(r.at, doorOf(r.at), from.at, from.door);
  const legB = corridorPath(from.at, from.door, to.at, to.door);
  const path = [...legA, ...legB.slice(1)];
  return { id: uid("ms"), label: t.label, from: t.from, to: t.to, path, length: pathLength(path), payload: t.payload, batchId: t.batchId, trays: t.trays, pickupAt: pathLength(legA) };
}

function chargeMission(r: AmrRuntime): AmrMission {
  const path = corridorPath(r.at, doorOf(r.at), r.home, [r.home[0], -4]);
  return { id: uid("ms"), label: "Return to charge", from: "", to: "HUB", path, length: pathLength(path), payload: "—", trays: 0, pickupAt: Infinity };
}

const zoneAt = (x: number, z: number): ZoneId => {
  for (const zn of ZONES) {
    const [x0, z0, x1, z1] = zn.bounds;
    if (x >= x0 && x <= x1 && z >= z0 && z <= z1) return zn.id;
  }
  // Corridor / hub: attribute to the nearest north-row zone by x.
  const north = ZONES.filter((zn) => zn.bounds[1] < 0);
  let best = north[0];
  let d = Infinity;
  for (const zn of north) {
    const cx = (zn.bounds[0] + zn.bounds[2]) / 2;
    if (Math.abs(cx - x) < d) {
      d = Math.abs(cx - x);
      best = zn;
    }
  }
  return best.id;
};

function stepAmr(s: SimState, r: AmrRuntime) {
  const a = s.assets[r.id];
  const battery = a.metrics.battery!;
  const payload = a.metrics.payload!;

  if (r.state === "CHARGING") {
    battery.value = Math.min(100, battery.value + 0.9);
    a.activity = `Charging · ${battery.value.toFixed(0)} %`;
    a.status = "CHARGING";
    if (battery.value >= 92) {
      r.recall = false;
      r.state = "IDLE";
      r.dwell = 3;
    }
  } else if (r.state === "IDLE" || r.state === "LOADING") {
    r.dwell -= 1;
    payload.value = r.state === "LOADING" ? payload.value : 0;
    a.activity = r.state === "LOADING" ? "Unloading" : "Idle · awaiting mission";
    a.status = "IDLE";
    if (r.dwell <= 0) {
      if (r.recall || (battery.value < 26 && r.drain <= 1)) {
        r.mission = chargeMission(r);
        r.state = "RETURNING";
        r.travelled = 0;
      } else {
        // Do not send two robots on the same leg at the same time if avoidable.
        const busy = new Set(Object.values(s.amrs).map((o) => o.mission?.label));
        const options = missionTemplates(s).filter((t) => t.weight > 0 && !busy.has(t.label));
        const tpl = r.id === "AMR-08" && s.tick < 5 ? missionTemplates(s)[0] : pick(options.length ? options : missionTemplates(s));
        r.mission = buildMission(r, tpl);
        r.state = "TRANSPORTING";
        r.travelled = 0;
      }
    }
  } else if (r.mission) {
    r.travelled += r.speed;
    const loaded = r.travelled >= r.mission.pickupAt;
    battery.value = Math.max(2, battery.value - 0.045 * r.drain * (loaded ? 1.3 : 1));
    payload.value = loaded && r.state === "TRANSPORTING" ? 140 + (r.mission.trays % 5) * 9 : 0;
    a.batchId = loaded ? r.mission.batchId : undefined;
    a.status = r.state === "RETURNING" ? "ACTIVE" : "ACTIVE";
    a.activity = r.state === "RETURNING" ? "Returning to charge" : loaded ? `Transporting · ${r.mission.label.split(" · ").pop()}` : `En route → ${STATIONS[r.mission.from]?.name ?? "pick-up"}`;
    if (r.travelled >= r.mission.length) {
      r.at = r.mission.path[r.mission.path.length - 1];
      r.travelled = r.mission.length;
      if (r.state === "RETURNING") {
        r.state = "CHARGING";
        feed(s, "info", `${r.id} docked at the hub and is charging.`, r.id);
      } else {
        r.state = "LOADING";
        r.dwell = 3 + Math.round(rand() * 4);
        const m = r.mission;
        const recent = s.feed.some((e) => e.assetId?.startsWith("AMR-") && s.lastTickAt - e.at < 20_000);
        if (!recent && m.trays > 0) feed(s, "info", `${r.id} dropped ${m.trays} trays${m.batchId ? ` of ${m.batchId}` : ""} at ${STATIONS[m.to]?.name ?? m.to}.`, r.id);
        s.kpis.traysPerHour = Math.round(s.kpis.traysPerHour * 0.9 + (230 + rand() * 40) * 0.1);
      }
      r.mission = undefined;
      r.travelled = 0;
    }
  }

  // Keep the asset's position in sync for tags, fly-to and the zone table.
  const p = r.mission ? pointAlong(r.mission.path, r.travelled) : { x: r.at[0], z: r.at[1], heading: 0 };
  a.position = [p.x, 0, p.z];
  a.rotationY = p.heading;
  a.zoneId = zoneAt(p.x, p.z);
  a.progress = r.mission ? r.travelled / r.mission.length : undefined;
  if (r.id === "AMR-08" && battery.value < 19 && a.status !== "CHARGING") a.status = "WATCH";
}

/* ------------------------------------------------------------------ */
/* Production                                                         */
/* ------------------------------------------------------------------ */

const STAGE_SECONDS: Record<StageKey, number> = { SEEDING: 4000, CULTIVATION: 5000, HARVEST: 300, QUALITY: 240, COLD_CHAIN: 520 };
const STAGE_ORDER: StageKey[] = STAGES.map((st) => st.key);

function advanceBatch(s: SimState, b: Batch) {
  if (b.stage === "COLD_CHAIN" && b.stageProgress >= 1) return;
  b.stageProgress = Math.min(1, b.stageProgress + b.tempo / STAGE_SECONDS[b.stage]);
  if (b.stageProgress < 1) return;
  const idx = STAGE_ORDER.indexOf(b.stage);
  const now = new Date(clockNow()).toISOString();
  const visit = b.route[idx];
  visit.status = "DONE";
  visit.exitedAt = now;
  if (idx === STAGE_ORDER.length - 1) {
    feed(s, "positive", `${b.code} dispatched on ${b.order?.truckId ?? "truck"} — ${b.order?.cases ?? b.trays} cases, chain-of-custody sealed.`, b.order?.truckId);
    return;
  }
  const next = STAGE_ORDER[idx + 1];
  b.stage = next;
  b.stageProgress = 0;
  b.route[idx + 1].status = "ACTIVE";
  b.route[idx + 1].enteredAt = now;
  const label = STAGES[idx + 1].short;
  feed(s, "positive", `${b.code} entered ${label}.`, b.route[idx + 1].assetIds[0]);
  // Re-assign stations to the batch that just arrived.
  if (next === "QUALITY") {
    for (const id of ["QA-01", "QA-02"]) {
      s.assets[id].batchId = b.id;
      s.assets[id].activity = id === "QA-01" ? `Weighing · ${b.code}` : `Optical scan · ${b.code}`;
    }
  }
  if (next === "COLD_CHAIN") {
    s.assets["SEAL-01"].activity = `Sealing · ${b.code}`;
  }
  // Keep the batch's one-line story in step with where it actually is.
  if (b.order) {
    const due = new Date(b.order.dueAt).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false });
    const who = b.order.customer.split(" · ")[0];
    if (next === "QUALITY") b.headline = `Harvest complete. In QA now — weights and optical grade feed the ${due} ${who} load.`;
    if (next === "COLD_CHAIN") b.headline = `Passed QA. Sealing and pre-cooling for the ${due} ${who} load on ${b.order.truckId}.`;
  }
  if (next === "HARVEST") {
    s.assets["HRV-01"].batchId = b.id;
  }
}

function stepProduction(s: SimState) {
  for (const b of Object.values(s.batches)) advanceBatch(s, b);

  // Harvesters follow the batch they are cutting.
  const hrv1 = s.assets["HRV-01"];
  const cutting = Object.values(s.batches).find((b) => b.stage === "HARVEST");
  if (cutting) {
    hrv1.status = "ACTIVE";
    hrv1.batchId = cutting.id;
    hrv1.progress = cutting.stageProgress;
    hrv1.activity = `Cutting · ${cutting.code}`;
    hrv1.metrics.throughput!.setpoint = 124;
    // Towers that fed the batch empty out as the harvest progresses.
    const towerIds = cutting.route.find((v) => v.stage === "CULTIVATION")?.assetIds ?? [];
    towerIds.forEach((id, i) => {
      const t = s.assets[id];
      if (!t) return;
      const cleared = cutting.stageProgress > (i + 1) / (towerIds.length + 1);
      t.activity = cleared ? "Cleared · sanitising" : "Harvesting";
      t.status = cleared ? "IDLE" : "ACTIVE";
      if (cleared) t.batchId = undefined;
    });
  } else if (hrv1.status === "ACTIVE") {
    hrv1.status = "IDLE";
    hrv1.activity = "Idle · next: ARU-1129 Thu";
    hrv1.metrics.throughput!.setpoint = 0;
    hrv1.batchId = undefined;
  }
  const hrv2 = s.assets["HRV-02"];
  if (s.tick === 75) {
    hrv2.status = "ACTIVE";
    hrv2.activity = cutting ? `Cutting · ${cutting.code}` : "Trimming · TOM-1088 trusses";
    hrv2.metrics.throughput!.setpoint = 118;
    hrv2.metrics.throughput!.low = 95;
    hrv2.metrics.cycleTime!.setpoint = 28.5;
    hrv2.metrics.cycleTime!.low = 20;
    feed(s, "positive", "HRV-02 blade change complete — back on the line.", "HRV-02");
  }
  if (hrv2.status === "ACTIVE") hrv2.progress = ((hrv2.progress ?? 0) + 0.004) % 1;

  // Tower irrigation cycles.
  for (const a of Object.values(s.assets)) {
    if (a.kind !== "TOWER" || !a.batchId || a.activity === "Harvesting" || a.activity === "Flushing") continue;
    const phase = (s.tick + a.id.charCodeAt(0) * 7 + Number(a.id.slice(2)) * 11) % 48;
    const irrigating = phase < 9;
    a.activity = irrigating ? "Irrigating" : "Growing";
    a.metrics.flow!.setpoint = irrigating ? 18 : 0;
  }

  // Camera rails sweep the glasshouse.
  for (const id of ["CAM-G1", "CAM-G2", "CAM-G3"]) {
    const c = s.assets[id];
    c.progress = ((c.progress ?? 0) + 0.0045) % 1;
    const d = c.detail ?? {};
    c.detail = { ...d, images: Number(d.images ?? 0) + 3 };
  }

  // Seeder + packing counters.
  const seed = s.assets["SEED-01"];
  seed.progress = ((seed.progress ?? 0) + 0.003) % 1;
  seed.detail = { ...seed.detail, sownToday: Number(seed.detail?.sownToday ?? 0) + (s.tick % 3 === 0 ? 1 : 0) };
  const seal = s.assets["SEAL-01"];
  seal.detail = { ...seal.detail, packedToday: Number(seal.detail?.packedToday ?? 0) + 1 };

  // Trucks load as their batch moves through cold chain.
  for (const id of ["TRK-1", "TRK-2", "TRK-3"]) {
    const t = s.assets[id];
    const b = t.batchId ? s.batches[t.batchId] : undefined;
    const load = t.metrics.load!;
    if (t.status === "OFFLINE") continue;
    if (id === "TRK-1") load.setpoint = Math.min(100, load.setpoint + 0.12);
    else if (b && b.stage === "COLD_CHAIN") load.setpoint = Math.max(load.setpoint, 30 + b.stageProgress * 70);
    t.progress = load.value / 100;
    t.detail = { ...t.detail, pallets: `${Math.round((load.value / 100) * 26)} / 26` };
    if (load.value >= 99.4 && t.status !== "IDLE") {
      t.status = "IDLE";
      t.activity = "Sealed · departing";
      t.detail = { ...t.detail, sealed: "Yes" };
      feed(s, "positive", `${id} sealed at ${t.metrics.temp!.value.toFixed(1)} °C and departed for ${String(t.detail?.destination).split(" · ")[0]}.`, id);
    } else if (t.status !== "IDLE") {
      t.activity = `Loading · ${load.value.toFixed(0)} %`;
    }
  }
}

/* ------------------------------------------------------------------ */
/* Incidents → alerts                                                 */
/* ------------------------------------------------------------------ */

function stepIncidents(s: SimState) {
  for (const def of INCIDENTS) {
    let rt = s.incidents[def.id];
    if (!rt) rt = s.incidents[def.id] = { id: def.id, phase: "DORMANT", t: 0, armAt: def.firstArmAt, occurrences: 0 };
    rt.t += 1;
    if (rt.phase === "DORMANT" && s.tick >= rt.armAt) {
      rt.phase = "DRIFTING";
      rt.t = 0;
      rt.occurrences += 1;
      // Fast-forward the very first occurrence so the demo opens mid-story.
      if (rt.occurrences === 1 && def.headStart) for (let i = 0; i < def.headStart; i++) def.drift(s, i);
    }
    if (rt.phase === "DRIFTING") {
      def.drift(s, rt.t);
      const alert = rt.alertId ? s.alerts.find((a) => a.id === rt!.alertId) : undefined;
      if (!alert && def.shouldAlert(s)) {
        const body = def.alert(s);
        const a: Alert = {
          id: uid("al"),
          incidentId: def.id,
          severity: def.severity(s),
          title: body.title,
          detail: body.detail,
          assetId: def.assetId,
          zoneId: def.zoneId,
          metricKey: def.metricKey,
          batchIds: body.batchIds,
          createdAt: clockNow(),
          status: "OPEN",
          recommendation: body.recommendation,
        };
        rt.alertId = a.id;
        s.alerts = [a, ...s.alerts];
        feed(s, a.severity === "CRITICAL" ? "critical" : "warning", a.title, a.assetId);
      } else if (alert && alert.status === "OPEN") {
        const sev = def.severity(s);
        const body = def.alert(s);
        alert.title = body.title;
        if (sev === "CRITICAL" && alert.severity !== "CRITICAL") {
          alert.severity = sev;
          feed(s, "critical", `Escalated: ${alert.title}`, alert.assetId);
        }
      }
    } else if (rt.phase === "RESOLVING") {
      def.fix(s, rt.t);
      if (def.recovered(s)) {
        def.settle?.(s);
        const alert = s.alerts.find((a) => a.id === rt!.alertId);
        if (alert) {
          alert.status = "RESOLVED";
          alert.resolvedAt = clockNow();
          alert.verification = def.verification(s);
          feed(s, "positive", `Resolved: ${alert.recommendation.title}`, alert.assetId);
        }
        rt.phase = "DORMANT";
        rt.alertId = undefined;
        rt.armAt = s.tick + def.rearm[0] + Math.round(rand() * (def.rearm[1] - def.rearm[0]));
        rt.t = 0;
      }
    }
  }

  // Asset + batch health from open alerts.
  const openByAsset = new Map<string, Alert>();
  const atRisk = new Map<string, Alert["severity"]>();
  for (const a of s.alerts) {
    if (a.status === "RESOLVED") continue;
    openByAsset.set(a.assetId, a);
    for (const b of a.batchIds) if (atRisk.get(b) !== "CRITICAL") atRisk.set(b, a.severity);
  }
  for (const a of Object.values(s.assets)) {
    const al = openByAsset.get(a.id);
    if (al && al.status === "OPEN") a.status = al.severity === "CRITICAL" ? "ALERT" : "WATCH";
  }
  for (const b of Object.values(s.batches)) {
    const sev = atRisk.get(b.id);
    b.health = sev === "CRITICAL" ? "AT_RISK" : sev ? "WATCH" : b.id === "TOM-1092" ? "WATCH" : "HEALTHY";
  }
}

/* ------------------------------------------------------------------ */
/* Tanks                                                              */
/* ------------------------------------------------------------------ */

function stepTanks(s: SimState) {
  const lvl = (id: string) => s.assets[id].metrics.level!;
  // Mix tank draws down while irrigating and refills in batches.
  const mix = lvl("MIX-01");
  const mixAsset = s.assets["MIX-01"];
  const filling = mixAsset.detail?.filling === true;
  if (filling) {
    mix.value = Math.min(92, mix.value + 0.9);
    lvl("RAIN-01").value = Math.max(5, lvl("RAIN-01").value - 0.02);
    lvl("TANK-A").value = Math.max(2, lvl("TANK-A").value - 0.012);
    lvl("TANK-B").value = Math.max(2, lvl("TANK-B").value - 0.012);
    lvl("TANK-ACID").value = Math.max(2, lvl("TANK-ACID").value - 0.006);
    lvl("DRAIN-01").value = Math.max(5, lvl("DRAIN-01").value - 0.25);
    mixAsset.activity = "Refilling · blending 40 % drain";
    if (mix.value >= 92) {
      mixAsset.detail = { ...mixAsset.detail, filling: false };
      feed(s, "positive", `MIX-01 refilled to 92 % — EC ${mixAsset.metrics.ec!.value.toFixed(2)}, pH ${mixAsset.metrics.ph!.value.toFixed(2)}. Irrigation to G1 resumed.`, "MIX-01");
    }
  } else {
    mix.value = Math.max(0, mix.value - 0.11);
    mixAsset.activity = "Irrigating G1 · valve 4";
    if (mix.value < 58) {
      mixAsset.detail = { ...mixAsset.detail, filling: true };
      feed(s, "info", "MIX-01 low — refilling from rainwater with 40 % UV-treated drain water.", "MIX-01");
    }
  }
  lvl("DRAIN-01").value = Math.min(80, lvl("DRAIN-01").value + 0.035);
  lvl("RAIN-01").value = Math.min(95, lvl("RAIN-01").value + 0.004);
  lvl("CO2-01").value = Math.max(5, lvl("CO2-01").value - 0.0025);
  const buf = lvl("BUF-01");
  buf.value = Math.min(96, buf.value + 0.004);
  for (const id of ["TANK-A", "TANK-B"]) {
    const a = s.assets[id];
    const days = (lvl(id).value / 100) * 7.2;
    a.detail = { ...a.detail, daysLeft: +days.toFixed(1) };
  }
}

/* ------------------------------------------------------------------ */
/* KPIs                                                               */
/* ------------------------------------------------------------------ */

function stepKpis(s: SimState) {
  const k = s.kpis;
  const harvesters = ["HRV-01", "HRV-02"].filter((id) => s.assets[id].status === "ACTIVE").length;
  k.yieldTodayKg += harvesters * 0.36 + 0.22 + rand() * 0.08;
  const towers = Object.values(s.assets).filter((a) => a.kind === "TOWER");
  k.activeTowers = towers.filter((t) => t.batchId).length;
  k.totalTowers = towers.length;
  const qa = s.assets["QA-02"].metrics.passRate!.value;
  k.gradeA = k.gradeA * 0.97 + qa * 0.03;
  const moving = Object.values(s.amrs).filter((r) => r.state === "TRANSPORTING" || r.state === "LOADING").length;
  k.robotUtilisation = k.robotUtilisation * 0.95 + (moving / 10) * 100 * 0.05;
  const crTemp = s.assets["CR-2"].metrics.temp!.value;
  k.onTimeDispatch = Math.max(90, Math.min(99.5, k.onTimeDispatch * 0.98 + (crTemp > 4 ? 95.5 : 98) * 0.02));
  k.energyKwh += 0.34 * 60 / 60 + jitter(0.05);
  if (s.tick % 5 === 0) {
    const push = (arr: number[], v: number) => {
      arr.push(v);
      if (arr.length > 48) arr.shift();
    };
    push(k.history.yieldTodayKg, k.yieldTodayKg);
    push(k.history.gradeA, k.gradeA);
    push(k.history.activeTowers, k.activeTowers);
    push(k.history.traysPerHour, k.traysPerHour);
    push(k.history.onTimeDispatch, k.onTimeDispatch);
    push(k.history.robotUtilisation, k.robotUtilisation);
  }
}

/* ------------------------------------------------------------------ */
/* Public API                                                         */
/* ------------------------------------------------------------------ */

export function step(prev: SimState): SimState {
  const s: SimState = structuredClone(prev);
  s.tick += 1;
  s.lastTickAt = clockNow();
  stepIncidents(s);
  for (const a of Object.values(s.assets)) if (a.kind !== "AMR") stepMetrics(a);
  for (const r of Object.values(s.amrs)) {
    stepAmr(s, r);
    stepMetrics(s.assets[r.id]);
  }
  stepProduction(s);
  stepTanks(s);
  const passes: Record<string, number> = {};
  for (const c of Object.values(s.cv)) passes[c.id] = c.passes;
  stepCv(s);
  for (const c of Object.values(s.cv)) {
    if (c.passes === passes[c.id]) continue;
    const sum = summarise(Object.values(c.plants), c.crop);
    const pests = sum.pests.map((p) => p.kind.toLowerCase()).join(" and ");
    feed(s, "info", `Camera pass ${c.passes} done in ${c.id}: ${Math.round(sum.plants).toLocaleString("en-US")} plants re-scored on the edge${pests ? `, ${pests} still flagged` : ", no pests"}.`, `CAM-${c.id}`);
  }
  stepKpis(s);
  return s;
}

/** Approve Luna's recommendation for an alert — the operator's "do it". */
export function approve(prev: SimState, alertId: string, by: string): SimState {
  const s: SimState = structuredClone(prev);
  const alert = s.alerts.find((a) => a.id === alertId);
  if (!alert || alert.status !== "OPEN") return prev;
  alert.status = "RESOLVING";
  alert.approvedBy = by;
  const rt = s.incidents[alert.incidentId];
  if (rt) {
    rt.phase = "RESOLVING";
    rt.t = 0;
  }
  const def = INCIDENT_BY_ID[alert.incidentId];
  def?.fix(s, 0);
  feed(s, "info", `${by.split(" · ")[0]} approved: ${alert.recommendation.title}`, alert.assetId);
  return s;
}

/** Force an incident to start now (used by the guided tour). */
export function trigger(prev: SimState, incidentId: string, headStart = 0): SimState {
  const s: SimState = structuredClone(prev);
  const def = INCIDENT_BY_ID[incidentId];
  const rt = s.incidents[incidentId] ?? { id: incidentId, phase: "DORMANT", t: 0, armAt: 0, occurrences: 0 };
  if (rt.phase === "RESOLVING") return prev;
  if (rt.phase !== "DRIFTING") {
    rt.phase = "DRIFTING";
    rt.t = 0;
    rt.occurrences += 1;
  }
  s.incidents[incidentId] = rt;
  for (let i = rt.t; i < headStart; i++) def.drift(s, i);
  rt.t = Math.max(rt.t, headStart);
  if (headStart > 0) fastForward(s);
  return s;
}

/**
 * Bring biased metrics most of the way to their drifted value and back-fill
 * a rising ramp into their history, as if the drift had been building for
 * the last half hour. Used when the guided demo starts an incident.
 */
function fastForward(s: SimState) {
  for (const a of Object.values(s.assets)) {
    let touched = false;
    for (const m of Object.values(a.metrics)) {
      if (!m || DERIVED.has(m.key) || m.bias === 0) continue;
      const from = m.value;
      m.value = m.setpoint + m.bias * 0.9;
      ramp(m.history, from, m.value);
      touched = true;
    }
    const { temp, rh, vpd } = a.metrics;
    if (touched && temp && rh && vpd) {
      const from = vpd.value;
      vpd.value = vpdOf(temp.value, Math.min(99, Math.max(5, rh.value)));
      ramp(vpd.history, from, vpd.value);
    }
  }
}

function ramp(history: number[], from: number, to: number, n = 36) {
  const start = Math.max(0, history.length - n);
  const len = history.length - start;
  for (let i = 0; i < len; i++) {
    const f = Math.pow((i + 1) / len, 1.6);
    history[start + i] = from + (to - from) * f + jitter(Math.abs(to - from) * 0.02);
  }
}

/** Interpolated AMR pose for smooth rendering between ticks. */
export function amrPose(r: AmrRuntime, lastTickAt: number, now: number) {
  if (!r.mission || r.state === "CHARGING" || r.state === "IDLE" || r.state === "LOADING") return { x: r.at[0], z: r.at[1], heading: Math.PI, moving: false };
  const extra = Math.min(1.2, (now - lastTickAt) / 1000) * r.speed;
  const d = Math.min(r.mission.length, r.travelled + extra);
  const p = pointAlong(r.mission.path, d);
  return { ...p, moving: true };
}

export { CHARGE_PADS };
