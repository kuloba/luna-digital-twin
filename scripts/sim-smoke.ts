import { createInitialState } from "../src/sim/seed";
import { step, approve } from "../src/sim/engine";
let s = createInitialState();
const t0 = performance.now();
for (let i = 0; i < 400; i++) {
  s = step(s);
  if (i === 60) { const a = s.alerts.find(a => a.status === "OPEN"); if (a) s = approve(s, a.id, "Maya Chen · Head Grower"); }
  if (i % 50 === 0) console.log(i, "alerts", s.alerts.map(a => `${a.incidentId}:${a.status}:${a.severity}`).join(","), "| V2 vpd", s.assets.V2.metrics.vpd!.value.toFixed(2), "| AMR-08", s.amrs["AMR-08"].state, s.assets["AMR-08"].metrics.battery!.value.toFixed(0), "| LET-1124", s.batches["LET-1124"].stage, s.batches["LET-1124"].stageProgress.toFixed(2), "| kg", s.kpis.yieldTodayKg.toFixed(0), "| mix", s.assets["MIX-01"].metrics.level!.value.toFixed(0));
}
console.log("ms/step", ((performance.now() - t0) / 400).toFixed(2), "bytes", JSON.stringify(s).length);
console.log(s.feed.slice(0, 12).map(f => f.text).join("\n"));
