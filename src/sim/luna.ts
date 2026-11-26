import { formatKg, formatNumber } from "@/lib/format";
import { compartmentForecast, FRUIT_KG, stageIndex, summarise } from "./cv";
import { inBand } from "./metrics";
import type { Role } from "./store";
import type { Alert, Asset, SimState } from "./types";
import { STAGES } from "./types";
import { clockNow } from "@/lib/clock";

/**
 * Luna's language layer. There is no model behind it in the demo; every
 * sentence is composed from the live simulation state so answers change as
 * the facility changes. `[[ID]]` tokens become clickable chips that fly the
 * camera to that asset, batch or zone.
 */

const open = (s: SimState) => s.alerts.filter((a) => a.status === "OPEN");
const sevRank = (a: Alert) => (a.severity === "CRITICAL" ? 0 : a.severity === "WARNING" ? 1 : 2);

export function greeting(now = new Date(clockNow())) {
  const h = now.getHours();
  return h < 5 ? "Good night" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function shiftBrief(s: SimState, role: Role) {
  const alerts = open(s).sort((a, b) => sevRank(a) - sevRank(b));
  const k = s.kpis;
  const pace = k.yieldTodayKg / k.yieldPlanKg;
  const g1 = summarise(Object.values(s.cv.G1.plants), "TOMATO", s.cv.G1.imagesToday);
  const g2 = summarise(Object.values(s.cv.G2.plants), "TOMATO", s.cv.G2.imagesToday);
  const tomatoReady = g1.readyKg7d + g2.readyKg7d;
  const let1124 = s.batches["LET-1124"];
  const stage = STAGES.find((st) => st.key === let1124.stage)?.short ?? "";

  let headline: string;
  const verifying = s.alerts.filter((a) => a.status === "RESOLVING");
  if (alerts.length === 0 && verifying.length) headline = `Nothing needs you right now — Luna is verifying the fix on [[${verifying[0].assetId}]].`;
  else if (alerts.length === 0) headline = "The facility is steady. Nothing needs you right now.";
  else if (alerts.length === 1) headline = `One thing needs you: ${lower(alerts[0].recommendation.title)}.`;
  else headline = `${alerts.length} things need you — start with ${alerts[0].zoneId === "V2" ? "Grow Room V2's climate" : `[[${alerts[0].assetId}]]`}.`;

  const lines: string[] = [];
  if (role === "GROWER") {
    lines.push(`Cameras have scanned **${formatNumber(g1.plants + g2.plants)} tomato plants** today. **${formatKg(tomatoReady)}** is colouring up for picking in the next 7 days across [[G1]] and [[G2]]; G2 is light-limited and running 0.3 trusses behind plan.`);
    lines.push(`[[LET-1124]] is in ${stage.toLowerCase()} for the 14:00 Cascade Fresh order — on pace. ${s.assets.V2.metrics.vpd!.value > 1.2 ? "Room V2 climate is the main risk to its leaf quality." : "Room V2 climate is in band."}`);
  } else {
    lines.push(`Harvest is at **${Math.round(pace * 100)} %** of today's plan (${formatKg(k.yieldTodayKg)} of ${formatKg(k.yieldPlanKg)}). Line throughput ${formatNumber(k.traysPerHour)} trays/h; fleet utilisation ${formatNumber(k.robotUtilisation)} %.`);
    lines.push(`Three trucks today: [[TRK-1]] ${s.assets["TRK-1"].activity.toLowerCase()}, [[TRK-2]] for 14:00, [[TRK-3]] for 16:00. On-time dispatch ${formatNumber(k.onTimeDispatch, 1)} % this month.`);
  }
  const tankB = s.assets["TANK-B"];
  lines.push(`Stock tank B is at ${formatNumber(tankB.metrics.level!.value)} % — about **${tankB.detail?.daysLeft} days** left. Order today to keep a 2-day buffer.`);
  return { headline, lines, alerts };
}

const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

/** One sentence that explains an asset's state — the first line of every inspector. */
export function assetSummary(a: Asset, s: SimState): string {
  const al = s.alerts.find((x) => x.assetId === a.id && x.status !== "RESOLVED");
  if (al?.status === "RESOLVING") return `Recovering — ${lower(al.recommendation.expected)}`;
  if (al) return al.detail;
  const outOfBand = Object.values(a.metrics).filter((m) => m && !inBand(m) && m.key !== "level");
  switch (a.kind) {
    case "TOWER": {
      const b = a.batchId ? s.batches[a.batchId] : undefined;
      if (!b) return "Empty — being sanitised and re-racked for the next transplant.";
      return `${b.cropName} ${b.variety}, day ${b.cycleDay} of ${b.cycleDays}. Root zone and light are ${outOfBand.length ? "drifting on " + outOfBand.map((m) => m!.label).join(", ") : "on recipe"}.`;
    }
    case "ROW": {
      const comp = s.cv[a.roomId ?? "G1"];
      const row = comp.rows.find((r) => r.id === a.id)!;
      const sum = summarise(row.plantIds.map((id) => comp.plants[id]), comp.crop);
      const pest = sum.pests[0];
      return `${formatNumber(sum.fruits)} fruit on ${formatNumber(sum.plants)} plants; ${formatKg(sum.readyKg7d)} ready to pick in 7 days.${pest ? ` ${pest.kind} flagged on ${pest.plants} plants.` : " No pests detected."}`;
    }
    case "AMR": {
      const r = s.amrs[a.id];
      if (r.state === "CHARGING") return `Charging at the hub — ${formatNumber(a.metrics.battery!.value)} %, back in service at 92 %.`;
      if (r.mission) return `${r.mission.label}. ${formatNumber((r.travelled / r.mission.length) * 100)} % of the route done, battery ${formatNumber(a.metrics.battery!.value)} %.`;
      return "Idle at the hub, waiting for the next mission.";
    }
    case "ROOM":
    case "COMPARTMENT": {
      const vpd = a.metrics.vpd!;
      const h = vpd.history;
      const trend = h[h.length - 1] - h[Math.max(0, h.length - 30)];
      const dir = trend > 0.025 ? "rising" : trend < -0.025 ? "easing" : "steady";
      const band = `${formatNumber(vpd.low, 2)}–${formatNumber(vpd.high, 2)} kPa`;
      const near = vpd.value > vpd.high - (vpd.high - vpd.low) * 0.3;
      const where = !inBand(vpd) ? `outside the ${band} band` : dir === "rising" && near ? `still inside ${band} but heading for the top of the band` : `inside the ${band} band`;
      const extra = a.kind === "COMPARTMENT" ? ` ${String(a.detail?.crop ?? "")}, vents ${String(a.detail?.vents ?? "")}.` : ` ${String(a.detail?.photoperiod ?? "")} photoperiod.`;
      return `VPD ${formatNumber(vpd.value, 2)} kPa and ${dir} — ${where}. Air ${formatNumber(a.metrics.temp!.value, 1)} °C at ${formatNumber(a.metrics.rh!.value)} % RH.${extra}`;
    }
    case "COLD_ROOM":
      return `Holding ${formatNumber(a.metrics.temp!.value, 1)} °C at ${formatNumber(a.metrics.rh!.value)} % RH, ${a.detail?.pallets} of ${a.detail?.capacity} pallet positions in use. Door ${a.metrics.doorOpen && a.metrics.doorOpen.value > 0.5 ? "open" : "closed"}.`;
    case "CAMERA":
      return `Sweeping ${a.roomId} at 0.4 m/s. Every plant is re-imaged roughly every 2.5 h; inference runs on [[EDGE-01]], so only plant state leaves the glasshouse.`;
    case "EDGE":
      return "Runs truss, ripeness and pest models on-site. Photos stay local; the twin receives a few hundred bytes per plant.";
    case "TANK":
      return a.detail?.daysLeft ? `${formatNumber(a.metrics.level!.value)} % full — about ${a.detail.daysLeft} days at the current draw.` : `${formatNumber(a.metrics.level!.value)} % full. ${a.activity}.`;
    case "TRUCK":
      return `${a.activity} for ${String(a.detail?.destination ?? "")}. Reefer holding ${formatNumber(a.metrics.temp!.value, 1)} °C.`;
    default:
      return outOfBand.length ? `${outOfBand.map((m) => m!.label).join(", ")} outside band.` : `${a.activity}. All readings in band.`;
  }
}

/* ------------------------------------------------------------------ */
/* Ask Luna                                                           */
/* ------------------------------------------------------------------ */

export const PRESETS = [
  { title: "What needs me?", prompt: "What needs my attention right now?" },
  { title: "Why is V2 warm?", prompt: "Why is Grow Room V2 running warm?" },
  { title: "Tomato yield", prompt: "What will the tomato compartments yield this week?" },
  { title: "Pick plan", prompt: "Where should the picking crews go tomorrow?" },
  { title: "14-day forecast", prompt: "What's the harvest forecast for the next two weeks?" },
  { title: "Pest pressure", prompt: "Where are the cameras seeing pest pressure?" },
  { title: "Bandwidth", prompt: "How much data are the cameras sending off-site?" },
  { title: "Where's LET-1124?", prompt: "Where is LET-1124 and will it make the 14:00 truck?" },
  { title: "Tank levels", prompt: "How are the fertigation tanks?" },
  { title: "Stand-up summary", prompt: "Give me a one-paragraph summary for stand-up." },
];

/** Longest known asset or batch ID mentioned in the prompt (e.g. "TANK-B", "G2-R04", "LET-1124"). */
function findId(prompt: string, s: SimState): [string, string] | null {
  const upper = ` ${prompt.toUpperCase()} `;
  let best = "";
  for (const id of [...Object.keys(s.batches), ...Object.keys(s.assets)]) {
    if (id.length <= best.length) continue;
    const i = upper.indexOf(id);
    if (i < 0) continue;
    const before = upper[i - 1];
    const after = upper[i + id.length];
    if (/[A-Z0-9-]/.test(before) || /[A-Z0-9-]/.test(after)) continue;
    best = id;
  }
  return best ? [best, best] : null;
}

export function reply(prompt: string, s: SimState, role: Role): { text: string; alertId?: string } {
  const p = prompt.toLowerCase();
  const alerts = open(s).sort((a, b) => sevRank(a) - sevRank(b));
  const idMatch = findId(prompt, s);

  // "Why …" about something with an open alert → explain the alert and attach the fix.
  if (idMatch && (p.startsWith("why") || p.includes("explain"))) {
    const a = s.alerts.find((x) => x.assetId === idMatch[1] && x.status !== "RESOLVED");
    if (a && a.assetId !== "V2") {
      const at = a.batchIds.length ? `\n\nAt risk: ${a.batchIds.map((b) => `[[${b}]]`).join(", ")}.` : "";
      return { text: `**${a.title}**\n\n${a.detail} ${a.recommendation.rationale}${at}\n\n${a.status === "RESOLVING" ? "The fix is already applied and I'm verifying the recovery." : "My recommendation is attached."}`, alertId: a.id };
    }
  }
  if (p.includes("attention") || p.includes("needs me") || p.includes("need me") || p.includes("risk") || p.includes("alert")) {
    if (!alerts.length) return { text: "Nothing is out of band right now. The last fix I verified is in the feed. I'll ping you the moment something drifts." };
    const lines = alerts.slice(0, 4).map((a) => `• **${a.severity === "CRITICAL" ? "Critical" : "Watch"}** · [[${a.assetId}]] — ${a.title.split(" — ")[0]}. Suggested: ${lower(a.recommendation.title)}.`);
    return { text: `${alerts.length} open item${alerts.length > 1 ? "s" : ""}, most urgent first:\n\n${lines.join("\n")}\n\nI've attached the top one — approve it and I'll verify the recovery.`, alertId: alerts[0].id };
  }
  if (p.includes("bandwidth") || p.includes("data") || p.includes("photo") || p.includes("image")) {
    const images = s.cv.G1.imagesToday + s.cv.G2.imagesToday + s.cv.G3.imagesToday;
    const raw = (images * 4.2) / 1024;
    const synced = ((Object.keys(s.cv.G1.plants).length * 3 * 9.2 * 1.15) / 1024 + images * 0.00009);
    return { text: `Today the three camera rails have taken **${formatNumber(images)} images** (~${formatNumber(raw)} GB). None of them left the site. [[EDGE-01]] runs truss, ripeness and pest models locally and syncs **${formatNumber(synced, 1)} MB** of plant state — a **${formatNumber((1 - synced / 1024 / raw) * 100, 3)} %** reduction. That's why this twin stays live over a 12 Mbps LTE uplink, and why it loads instantly: you're looking at the crop's state, not its photos.` };
  }
  if (p.includes("forecast") || p.includes("two weeks") || p.includes("14 day") || p.includes("14-day") || p.includes("next week") || p.includes("fortnight")) {
    return { text: forecastAnswer(s) };
  }
  if (p.includes("crew") || p.includes("picker") || p.includes("pick plan") || p.includes("pick list") || p.includes("harvest plan")) {
    return { text: pickPlan(s) };
  }
  if (p.includes("tomato") || p.includes("yield") || p.includes("ripe") || p.includes("pick")) {
    const out = ["G1", "G2"].map((id) => {
      const c = s.cv[id];
      const sum = summarise(Object.values(c.plants), "TOMATO", c.imagesToday);
      const red = sum.stages[4] + sum.stages[5];
      return `• [[${id}]] — **${formatKg(sum.readyKg7d)}** ready in 7 days · ${formatNumber(red)} fruit at light-red or red · ${formatNumber(sum.trusses / Math.max(1, sum.plants), 1)} trusses/plant`;
    });
    const g3 = summarise(Object.values(s.cv.G3.plants), "CUCUMBER");
    return { text: `From this morning's camera passes:\n\n${out.join("\n")}\n• [[G3]] cucumbers — **${formatKg(g3.readyKg7d)}** at pick size\n\n${forecastLine(s)}\n\nG1 is on plan. G2 is light-limited (DLI 13.9 vs 15) and colouring ~2 days slower — I'd hold the 24 h temperature at 19.2 °C rather than push it. Switch the glasshouse to the **Yield** lens to see it row by row.` };
  }
  if (p.includes("v2") || p.includes("warm") || p.includes("vpd") || p.includes("climate")) {
    const v2 = s.assets.V2;
    const a = alerts.find((x) => x.assetId === "V2");
    if (a) return { text: `[[V2]] is at **${formatNumber(v2.metrics.vpd!.value, 2)} kPa** VPD (${formatNumber(v2.metrics.temp!.value, 1)} °C, ${formatNumber(v2.metrics.rh!.value)} % RH). Root cause: [[HVAC-V2]] cooling stage 2 tripped on high head pressure, so under full LED load the room is gaining heat and drying out.\n\nAt risk: [[LET-1124]] and [[LET-1127]] are heading lettuce — tipburn shows up 2–3 days after a dry afternoon. My recommendation is attached.`, alertId: a.id };
    return { text: `[[V2]] is in band: ${formatNumber(v2.metrics.vpd!.value, 2)} kPa VPD, ${formatNumber(v2.metrics.temp!.value, 1)} °C, ${formatNumber(v2.metrics.co2!.value)} ppm CO₂. [[HVAC-V2]] is on stage 2. Nothing to do.` };
  }
  if (p.includes("pest") || p.includes("whitefly") || p.includes("botrytis") || p.includes("scout")) {
    const rows: string[] = [];
    for (const id of ["G1", "G2", "G3"]) {
      const c = s.cv[id];
      const sum = summarise(Object.values(c.plants), c.crop);
      for (const pe of sum.pests) rows.push(`• **${pe.kind}** in [[${id}]] — ${pe.plants} plants, worst in [[${pe.worstRow}]]`);
    }
    return { text: rows.length ? `The cameras are flagging:\n\n${rows.join("\n")}\n\nThe whitefly patch in G2 has grown over three passes — I'd release *Encarsia* on rows 3–5 today and send a scout to confirm. Switch on the **Pests** lens to see the hotspots.` : "No pest pressure detected on the last full pass." };
  }
  if (p.includes("tank") || p.includes("fertig") || p.includes("nutrient") || p.includes("stock")) {
    const ids = ["TANK-A", "TANK-B", "TANK-ACID", "MIX-01", "DRAIN-01", "RAIN-01", "CO2-01"];
    const lines = ids.map((id) => {
      const a = s.assets[id];
      return `• [[${id}]] ${a.name.split(" · ")[0]} — **${formatNumber(a.metrics.level!.value)} %**${a.detail?.daysLeft ? ` · ${a.detail.daysLeft} d left` : ""}`;
    });
    return { text: `${lines.join("\n")}\n\nOnly [[TANK-B]] needs action: at today's draw it runs out in about ${s.assets["TANK-B"].detail?.daysLeft} days. Mix a new batch this afternoon. Drain water is UV-treated and blending 40 % back into the mix.` };
  }
  if (p.includes("stand") || p.includes("summary") || p.includes("summar")) {
    const b = shiftBrief(s, role);
    return { text: `${b.headline.replace(/\[\[|\]\]/g, "")} Harvest ${formatKg(s.kpis.yieldTodayKg)} so far (${formatNumber((s.kpis.yieldTodayKg / s.kpis.yieldPlanKg) * 100)} % of plan), Grade-A pack-out ${formatNumber(s.kpis.gradeA, 1)} %. ${b.lines[0].replace(/\[\[|\]\]/g, "").replace(/\*\*/g, "")}` };
  }
  if (idMatch) {
    const id = idMatch[1];
    const batch = s.batches[id];
    if (batch) {
      const st = STAGES.find((x) => x.key === batch.stage)!;
      const visit = batch.route.find((v) => v.status === "ACTIVE");
      const where = visit?.assetIds.filter((a) => s.assets[a]).map((a) => `[[${a}]]`).join(", ");
      const order = batch.order ? ` It's allocated to ${batch.order.customer} (${formatNumber(batch.order.cases)} cases) on [[${batch.order.truckId}]].` : "";
      return { text: `[[${id}]] — ${batch.cropName} ${batch.variety} — is in **${st.label}** (${formatNumber(batch.stageProgress * 100)} %) at ${where}.${order} ${batch.headline}\n\nTurn on **Trace** in the batch tracker to see its whole route through the facility.` };
    }
    const a = s.assets[id];
    if (a) return { text: `[[${id}]] · ${a.name}: ${assetSummary(a, s)}` };
  }
  return { text: "I can answer from the live twin — try asking what needs you, tomato yield this week, the 14-day harvest forecast, pest pressure, tank levels, where a batch is, or how much data the cameras send off-site." };
}

/** Picker-hours a crew member covers in high-wire tomatoes (kg per hour). */
const PICK_RATE = 140;

/**
 * Tomorrow's pick list, straight from the last camera pass: rows ranked by
 * fruit already at light-red or red, crew-hours to clear them, and rows held
 * back where the cameras see pest pressure.
 */
function pickPlan(s: SimState) {
  const rows: { id: string; kg: number; pest?: string; peak: number }[] = [];
  for (const id of ["G1", "G2"]) {
    const c = s.cv[id];
    for (const r of c.rows) {
      let fruit = 0;
      let pest: string | undefined;
      let peak = 0;
      for (const pid of r.plantIds) {
        const pl = c.plants[pid];
        for (const t of pl.seen.trusses) if (stageIndex(t.ripeness) >= 4) fruit += t.fruits;
        if (pl.seen.pest && pl.seen.pestLevel > 0.08) pest = pl.seen.pest;
        peak = Math.max(peak, pl.seen.pestLevel);
      }
      rows.push({ id: r.id, kg: fruit * 9.2 * FRUIT_KG.TOMATO, pest, peak });
    }
  }
  // Hotspots are held for scouting; lighter pressure is picked last.
  const held = rows.filter((r) => r.pest && r.peak >= 0.45);
  const top = rows.filter((r) => !held.includes(r)).sort((a, b) => b.kg - a.kg).slice(0, 5);
  const kg = top.reduce((n, r) => n + r.kg, 0);
  const hours = kg / PICK_RATE;
  const crew = Math.max(2, Math.ceil(hours / 3));
  const list = top.map((r, i) => `${i + 1}. [[${r.id}]] — **${formatKg(r.kg)}** at light-red or red${r.pest ? ` · pick last, ${r.pest.toLowerCase()} nearby` : ""}`).join("\n");
  const byPest = new Map<string, string[]>();
  for (const r of [...held].sort((a, b) => a.id.localeCompare(b.id))) byPest.set(r.pest!, [...(byPest.get(r.pest!) ?? []), r.id]);
  const groups = [...byPest.entries()].map(([pest, ids]) => `the ${pest.toLowerCase()} ${ids.length > 1 ? "rows" : "row"} ${ids.map((id) => `[[${id}]]`).join(", ")}`);
  const hold = groups.length ? `\n\nHold ${groups.join(" and ")} until a scout clears them, so pickers don't carry it down the house.` : "";
  const ahead = tomatoAhead(s);
  return `Tomorrow's pick, from this morning's camera passes:\n\n${list}\n\nThat's **${formatKg(kg)}** across ${top.length} rows — about **${formatNumber(hours, 1)} picker-hours** at ${PICK_RATE} kg/h, so a crew of ${crew} clears it in ~${formatNumber(hours / crew, 1)} h.${hold}\n\nThat clears what is already red. After it, the same scans put **${formatKg(ahead.week1)}** of tomatoes turning red over the next 7 days and ${formatKg(ahead.week2)} the week after, peaking ${ahead.peakDay} — about **${formatNumber(ahead.week1 / 7 / PICK_RATE, 1)} picker-hours a day** to keep pace. The 14-day forecast is in the glasshouse table.`;
}

const dayName = (i: number) => {
  const d = new Date(clockNow() + (i + 1) * 86_400_000);
  return `${d.toLocaleDateString("en-US", { weekday: "long" })} ${d.getDate()} ${d.toLocaleDateString("en-US", { month: "short" })}`;
};

/** Tomato kilos coming ready by day for the next two weeks, from the cameras' last pass. */
function tomatoAhead(s: SimState) {
  const days = new Array<number>(14).fill(0);
  for (const id of ["G1", "G2"]) compartmentForecast(s.cv[id]).days.forEach((v, i) => (days[i] += v));
  let peak = 0;
  days.forEach((v, i) => {
    if (v > days[peak]) peak = i;
  });
  return { days, week1: days.slice(0, 7).reduce((a, b) => a + b, 0), week2: days.slice(7).reduce((a, b) => a + b, 0), peakDay: dayName(peak), peakKg: days[peak] };
}

/** The 14-day forecast on its own: per compartment, the peak day, and the labour it implies. */
function forecastAnswer(s: SimState) {
  const lines = ["G1", "G2", "G3"].map((id) => {
    const c = s.cv[id];
    const f = compartmentForecast(c);
    const w1 = f.days.slice(0, 7).reduce((a, b) => a + b, 0);
    const w2 = f.days.slice(7).reduce((a, b) => a + b, 0);
    return `• [[${id}]] ${c.crop === "TOMATO" ? "tomatoes" : "cucumbers"} — ${formatKg(f.readyNowKg)} ready now · **${formatKg(w1)}** this week · ${formatKg(w2)} next`;
  });
  const t = tomatoAhead(s);
  return `Harvest forecast for the next 14 days, built only from what the cameras measured on their last pass — each truss's ripeness projected to the day it reaches pick stage:\n\n${lines.join("\n")}\n\nTomatoes peak ${t.peakDay} at ~${formatKg(t.peakKg)}. Week two is ${formatNumber(((t.week2 - t.week1) / Math.max(1, t.week1)) * 100)} % ${t.week2 >= t.week1 ? "heavier" : "lighter"} than this week, so ${t.week2 >= t.week1 ? "book the extra picking hours and offer the surplus to buyers now" : "there is room to trim picking hours"} — about **${formatNumber(t.week2 / 7 / PICK_RATE, 1)} picker-hours a day** next week at ${PICK_RATE} kg/h. Open the glasshouse's **Harvest forecast** table for the day-by-day chart.`;
}

/** One paragraph of the 14-day forecast for the yield answer. */
function forecastLine(s: SimState) {
  const t = tomatoAhead(s);
  const now = ["G1", "G2"].reduce((n, id) => n + compartmentForecast(s.cv[id]).readyNowKg, 0);
  return `**Next 14 days**, from the same scans: ${formatKg(now)} of tomatoes are red now, then **${formatKg(t.week1)}** colours up this week and ${formatKg(t.week2)} next, peaking ${t.peakDay} at ~${formatKg(t.peakKg)}. That's ~${formatNumber(t.week1 / 7 / PICK_RATE, 1)} picker-hours a day to keep up — enough to commit volumes to buyers now instead of after a walk-through.`;
}
