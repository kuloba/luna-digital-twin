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
    // Reveal by wall-clock time, not by timer ticks, so a busy main thread
    // (WebGL + 1 Hz sim) never slows the answer down — it lands in ~1–2 s.
    const duration = Math.min(2000, Math.max(800, total * 6));
    const start = performance.now();
    const iv = window.setInterval(() => {
      const shown = Math.min(total, Math.ceil((total * (performance.now() - start)) / duration));
      twin().updateChat(id, { shown });
      if (shown >= total) window.clearInterval(iv);
    }, 30);
  }, 700);
  return id;
}
