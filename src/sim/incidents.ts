import { formatClock } from "@/lib/format";
import type { MetricKey, Recommendation, Severity, SimState, ZoneId } from "./types";
import { clockNow } from "@/lib/clock";

/**
 * Scripted operational incidents. Each one drifts a real metric out of band,
 * raises an `Alert` with a Luna recommendation when it crosses the band, and
 * recovers when the recommendation is approved. Together they give the demo
 * a full detect → explain → act → verify loop.
 */
export interface IncidentDef {
  id: string;
  assetId: string;
  zoneId: ZoneId;
  metricKey?: MetricKey;
  /** Tick at which the incident first arms (0 = at load). */
  firstArmAt: number;
  /** Seconds already elapsed in DRIFTING when first armed (starts it part-way). */
  headStart?: number;
  /** Re-arm range after resolution, in ticks. */
  rearm: [number, number];
  /** Apply drift for one tick while DRIFTING. */
  drift(s: SimState, t: number): void;
  /** Apply corrective change for one tick while RESOLVING. */
  fix(s: SimState, t: number): void;
  shouldAlert(s: SimState): boolean;
  severity(s: SimState): Severity;
  recovered(s: SimState): boolean;
  /** Called once on recovery to clean up any temporary changes. */
  settle?(s: SimState): void;
  alert(s: SimState): { title: string; detail: string; batchIds: string[]; recommendation: Recommendation };
  verification(s: SimState): string;
}

const approach = (v: number, target: number, step: number) => (Math.abs(target - v) <= step ? target : v + Math.sign(target - v) * step);

const m = (s: SimState, asset: string, key: MetricKey) => s.assets[asset].metrics[key]!;

export const INCIDENTS: IncidentDef[] = [
  {
    id: "vpd-v2",
    assetId: "V2",
    zoneId: "V2",
    metricKey: "vpd",
    firstArmAt: 4,
    headStart: 120,
    rearm: [420, 600],
    drift(s, t) {
      m(s, "V2", "temp").bias = approach(m(s, "V2", "temp").bias, 2.6, 0.01);
      m(s, "V2", "rh").bias = approach(m(s, "V2", "rh").bias, -15, 0.06);
      const hvac = s.assets["HVAC-V2"];
      hvac.metrics.power!.bias = approach(hvac.metrics.power!.bias, -14, 0.5);
      hvac.metrics.temp!.bias = approach(hvac.metrics.temp!.bias, 4.2, 0.12);
      hvac.status = "WATCH";
      hvac.activity = "Stage 2 tripped · high head pressure";
      if (t > 6) {
        s.assets.V2.status = "WATCH";
        s.assets.V2.activity = "VPD drifting high";
      }
    },
    fix(s) {
      m(s, "V2", "temp").bias = approach(m(s, "V2", "temp").bias, 0, 0.12);
      m(s, "V2", "rh").bias = approach(m(s, "V2", "rh").bias, 0, 0.7);
      m(s, "V2", "ppfd").setpoint = 242;
      const hvac = s.assets["HVAC-V2"];
      hvac.metrics.power!.bias = approach(hvac.metrics.power!.bias, 6, 1);
      hvac.metrics.temp!.bias = approach(hvac.metrics.temp!.bias, -0.8, 0.3);
      hvac.status = "ACTIVE";
      hvac.activity = "Cooling · stage 3 recovery";
      s.assets.V2.activity = "Recovering · LEDs 85 %";
    },
    shouldAlert: (s) => m(s, "V2", "vpd").value > 1.2,
    severity: (s) => (m(s, "V2", "vpd").value > 1.36 ? "CRITICAL" : "WARNING"),
    recovered: (s) => m(s, "V2", "vpd").value < 1.08 && Math.abs(m(s, "V2", "temp").bias) < 0.2,
    settle(s) {
      m(s, "V2", "ppfd").setpoint = 285;
      s.assets["HVAC-V2"].metrics.power!.bias = 0;
      s.assets["HVAC-V2"].metrics.temp!.bias = 0;
      s.assets["HVAC-V2"].activity = "Cooling · stage 2";
      s.assets.V2.status = "OK";
      s.assets.V2.activity = "Photoperiod 16/8 · lights on";
    },
    alert(s) {
      const v = m(s, "V2", "vpd");
      return {
        title: `Grow Room V2 VPD ${v.value.toFixed(2)} kPa — above 1.20 band`,
        detail: "HVAC-V2 cooling stage 2 tripped on high head pressure. Under full LED load the room is warming and drying out; leaf-edge tipburn risk for heading lettuce on towers C-01–C-08.",
        batchIds: ["LET-1124", "LET-1127", "STR-1102"],
        recommendation: {
          title: "Reset HVAC-V2 stage 2 and dim Room V2 LEDs to 85 % for 40 min",
          rationale: `Stage 2 compressor tripped at ${formatClock(clockNow() - 4 * 60_000)}. Head pressure is back in range so a remote reset is safe. Dimming cuts ~9 kW of heat load while the coil pulls the room down; the DLI shortfall is recovered by extending the photoperiod 12 min tonight.`,
          steps: [
            "Reset HVAC-V2 cooling stage 2 (remote · interlocks clear)",
            "Dim Room V2 LEDs 100 % → 85 % for 40 min",
            "Raise humidifier setpoint +6 % RH until VPD < 1.0 kPa",
            "Flag towers C-01–C-04 for tipburn check at QA-02",
          ],
          owner: "Maya Chen · Head Grower",
          expected: "VPD back inside 0.8–1.2 kPa within minutes; no change to LET-1124 harvest timing.",
          confidence: 0.91,
        },
      };
    },
    verification: (s) => `VPD ${m(s, "V2", "vpd").value.toFixed(2)} kPa and holding. Air ${m(s, "V2", "temp").value.toFixed(1)} °C / ${m(s, "V2", "rh").value.toFixed(0)} % RH. LEDs restore to 100 % at the 40-min mark; photoperiod +12 min tonight.`,
  },
  {
    id: "amr-08",
    assetId: "AMR-08",
    zoneId: "V2",
    metricKey: "battery",
    firstArmAt: 0,
    rearm: [520, 700],
    drift(s) {
      s.amrs["AMR-08"].drain = 3;
    },
    fix(s) {
      s.amrs["AMR-08"].recall = true;
      s.amrs["AMR-08"].drain = 1;
    },
    shouldAlert: (s) => m(s, "AMR-08", "battery").value < 19,
    severity: (s) => (m(s, "AMR-08", "battery").value < 12 ? "CRITICAL" : "WARNING"),
    recovered: (s) => s.amrs["AMR-08"].state === "CHARGING",
    settle(s) {
      s.amrs["AMR-08"].recall = false;
    },
    alert(s) {
      const b = m(s, "AMR-08", "battery").value;
      const mission = s.amrs["AMR-08"].mission;
      return {
        title: `AMR-08 battery ${b.toFixed(0)} % while ${mission ? "transporting" : "queued"}`,
        detail: `Drain is 4× the fleet average — likely a dragging caster on the rear axle. At this rate AMR-08 reaches the 10 % safety floor in about 6 minutes${mission ? `, mid-route on "${mission.label}"` : ""}.`,
        batchIds: mission?.batchId ? [mission.batchId] : [],
        recommendation: {
          title: "Send AMR-08 to charge after this drop-off; reassign its queue to AMR-03",
          rationale: "AMR-03 is idle at 91 % with the same tray fixture. Finishing the current leg avoids a re-handle of the trays; the charge pad at the hub is free.",
          steps: ["Let AMR-08 finish the current drop", "Route AMR-08 → hub charge pad", "Move 3 queued missions to AMR-03", "Open maintenance ticket: rear caster inspection"],
          owner: "Dev Okafor · Facility Manager",
          expected: "No missed harvest in-feed; fleet utilisation dips 2 pts for ~25 min.",
          confidence: 0.88,
        },
      };
    },
    verification: () => "AMR-08 docked and charging. AMR-03 has taken its queue. Maintenance ticket MT-2291 opened for the rear caster.",
  },
  {
    id: "ec-b04",
    assetId: "B-04",
    zoneId: "V1",
    metricKey: "ec",
    firstArmAt: 70,
    rearm: [500, 800],
    drift(s, t) {
      m(s, "B-04", "ec").bias = approach(m(s, "B-04", "ec").bias, 0.52, 0.007);
      m(s, "DOS-V1", "ec").bias = approach(m(s, "DOS-V1", "ec").bias, 0.18, 0.004);
      if (t > 12) s.assets["DOS-V1"].activity = "Pump 2 over-delivering";
    },
    fix(s) {
      m(s, "B-04", "ec").bias = approach(m(s, "B-04", "ec").bias, 0, 0.03);
      m(s, "DOS-V1", "ec").bias = approach(m(s, "DOS-V1", "ec").bias, 0, 0.02);
      s.assets["DOS-V1"].activity = "Recalibrating pump 2";
      s.assets["B-04"].activity = "Flushing";
    },
    shouldAlert: (s) => m(s, "B-04", "ec").value > 2.05,
    severity: (s) => (m(s, "B-04", "ec").value > 2.42 ? "CRITICAL" : "WARNING"),
    recovered: (s) => m(s, "B-04", "ec").value < 1.92,
    settle(s) {
      s.assets["DOS-V1"].activity = "Dosing A/B";
      s.assets["DOS-V1"].detail = { ...s.assets["DOS-V1"].detail, pump2: "Calibrated just now" };
      s.assets["B-04"].activity = "Growing";
    },
    alert(s) {
      return {
        title: `Tower B-04 root-zone EC ${m(s, "B-04", "ec").value.toFixed(2)} mS/cm — climbing`,
        detail: "Supply EC from DOS-V1 is 0.18 above recipe and climbing; B-04 sits at the end of the manifold, so it concentrates first. Baby kale tolerates it short-term but growth slows above 2.3.",
        batchIds: ["KAL-1135"],
        recommendation: {
          title: "Recalibrate DOS-V1 pump 2 and flush Tower B-04 at 1.4 mS/cm",
          rationale: "Pump 2 (nutrient B) is over-delivering ~9 %; it was last calibrated 9 days ago against a 7-day SOP. A single 6-min flush brings B-04 back without touching the other 7 towers on the manifold.",
          steps: ["Run auto-calibration on DOS-V1 pump 2", "Flush B-04 with 1.4 mS/cm for 6 min", "Re-sample EC/pH in 30 min"],
          owner: "Luis Ortega · Fertigation Tech",
          expected: "B-04 EC back under 2.0 within ~10 min; no yield impact on KAL-1135.",
          confidence: 0.86,
        },
      };
    },
    verification: (s) => `Tower B-04 EC ${m(s, "B-04", "ec").value.toFixed(2)} mS/cm. DOS-V1 pump 2 recalibrated (−8.7 %). Next re-sample scheduled.`,
  },
  {
    id: "qa-tipburn",
    assetId: "QA-02",
    zoneId: "QA",
    metricKey: "rejectRate",
    firstArmAt: 170,
    rearm: [600, 900],
    drift(s) {
      m(s, "QA-02", "rejectRate").bias = approach(m(s, "QA-02", "rejectRate").bias, 3.5, 0.04);
      m(s, "QA-02", "passRate").bias = approach(m(s, "QA-02", "passRate").bias, -3.4, 0.04);
    },
    fix(s) {
      m(s, "QA-02", "rejectRate").bias = approach(m(s, "QA-02", "rejectRate").bias, 0, 0.18);
      m(s, "QA-02", "passRate").bias = approach(m(s, "QA-02", "passRate").bias, 0, 0.18);
      s.assets["QA-02"].activity = "Diverting lot C → manual";
    },
    shouldAlert: (s) => m(s, "QA-02", "rejectRate").value > 3.5,
    severity: (s) => (m(s, "QA-02", "rejectRate").value > 6 ? "CRITICAL" : "WARNING"),
    recovered: (s) => m(s, "QA-02", "rejectRate").value < 2.4,
    settle(s) {
      s.assets["QA-02"].activity = "Optical scan";
    },
    alert(s) {
      const batch = s.assets["QA-02"].batchId ?? "LET-1119";
      return {
        title: `QA-02 reject rate ${m(s, "QA-02", "rejectRate").value.toFixed(1)} % — tipburn on ${batch}`,
        detail: "Optical grader is rejecting heads for marginal tipburn, clustered in trays from tower C-03. Pattern matches the Room V2 warm afternoon two days ago.",
        batchIds: [batch],
        recommendation: {
          title: `Divert ${batch} trays from C-03 to manual trim; keep the line running`,
          rationale: "Only one tower's trays are affected. Manual trim recovers ~70 % of those heads as Grade A, and diverting keeps the 14:00 order on schedule instead of stopping the line.",
          steps: ["Tag trays from C-03 for divert at QA-02", "Route to manual trim station (2 staff)", "Log tipburn finding against Room V2 climate event"],
          owner: "Priya Nair · QA Lead",
          expected: "Reject rate back under 2.5 %; Grade-A pack-out recovers within the hour.",
          confidence: 0.84,
        },
      };
    },
    verification: (s) => `Reject rate ${m(s, "QA-02", "rejectRate").value.toFixed(1)} %. 86 heads diverted to manual trim, 61 recovered as Grade A. Finding linked to the Room V2 climate event.`,
  },
  {
    id: "cr2-door",
    assetId: "CR-2",
    zoneId: "COLD",
    metricKey: "temp",
    firstArmAt: 280,
    rearm: [700, 1000],
    drift(s) {
      m(s, "CR-2", "temp").bias = approach(m(s, "CR-2", "temp").bias, 3.3, 0.035);
      m(s, "CR-2", "doorOpen").value = 1;
      s.assets["CR-2"].detail = { ...s.assets["CR-2"].detail, door: "Open · 6 min" };
      s.assets["CR-2"].activity = "Door 2 open";
    },
    fix(s) {
      m(s, "CR-2", "temp").bias = approach(m(s, "CR-2", "temp").bias, 0, 0.16);
      m(s, "CR-2", "doorOpen").value = 0;
      s.assets["CR-2"].detail = { ...s.assets["CR-2"].detail, door: "Closed" };
      s.assets["CR-2"].activity = "Pulling down";
    },
    shouldAlert: (s) => m(s, "CR-2", "temp").value > 4,
    severity: (s) => (m(s, "CR-2", "temp").value > 5.8 ? "CRITICAL" : "WARNING"),
    recovered: (s) => m(s, "CR-2", "temp").value < 3.2,
    settle(s) {
      s.assets["CR-2"].activity = "Holding 2.0 °C";
    },
    alert(s) {
      return {
        title: `Cold Room 2 at ${m(s, "CR-2", "temp").value.toFixed(1)} °C — door 2 open`,
        detail: "Door 2 has been open since a pallet move; the strip curtain is hooked back. Product core temps are still fine, but 18 pallets for today's dispatch are in this room.",
        batchIds: ["LET-1119", "ARU-1121"],
        recommendation: {
          title: "Close Cold Room 2 door 2 and re-hang the strip curtain",
          rationale: "Air temperature recovers in minutes once the door is shut; product core temperature lags air by ~40 min, so acting now keeps every pallet inside the 4 °C HACCP limit.",
          steps: ["Auto-close door 2 (sensor confirms aisle clear)", "Dispatch Jordan (cold-chain) to re-hang the curtain", "Log a 6-min door event on the HACCP record"],
          owner: "Dev Okafor · Facility Manager",
          expected: "Air temp back under 3 °C quickly; no product excursion.",
          confidence: 0.95,
        },
      };
    },
    verification: (s) => `Cold Room 2 air ${m(s, "CR-2", "temp").value.toFixed(1)} °C and falling. Door closed, curtain re-hung, HACCP record updated.`,
  },
];

export const INCIDENT_BY_ID = Object.fromEntries(INCIDENTS.map((i) => [i.id, i])) as Record<string, IncidentDef>;
