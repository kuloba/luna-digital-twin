import { reply } from "@/sim/luna";
import { twin } from "@/sim/store";
import { textLength } from "./RichText";

/**
 * Ask Luna: posts the user's prompt, shows a short "reading the twin" beat,
 * then types the answer out. Answers are composed from live sim state.
 */
export function askLuna(prompt: string, opts: { open?: boolean } = {}) {
  const st = twin();
  if (opts.open !== false) st.setRightPanel("luna");
  st.pushChat({ role: "user", text: prompt });
  const id = st.pushChat({ role: "luna", text: "", shown: 0 });
  window.setTimeout(() => {
    const s = twin();
    const r = reply(prompt, s.sim, s.role);
    const total = textLength(r.text);
    s.updateChat(id, { text: r.text, alertId: r.alertId, shown: 0 });
    const stepSize = Math.max(2, Math.round(total / 70));
    let shown = 0;
    const iv = window.setInterval(() => {
      shown = Math.min(total, shown + stepSize);
      twin().updateChat(id, { shown });
      if (shown >= total) window.clearInterval(iv);
    }, 22);
  }, 700);
  return id;
}
