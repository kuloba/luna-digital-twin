import { step, trigger } from "@/sim/engine";
import { createInitialState } from "@/sim/seed";

let s = createInitialState();
s = trigger(s, "vpd-v2", 170);
for (let i = 0; i < 3; i++) s = step(s);
const v = s.assets.V2.metrics.vpd!;
console.log("vpd", v.value.toFixed(2), "hist", v.history.slice(-6).map((x) => x.toFixed(2)).join(","), s.alerts.map((a) => `${a.incidentId}:${a.severity}:${a.status}`));
