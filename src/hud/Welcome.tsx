import { AnimatePresence, motion } from "motion/react";
import { Play, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useTwin } from "@/sim/store";
import { STEPS } from "./Tour";
import { Kbd, LunaMark } from "./ui";

/**
 * First-visit card: what this is, and the one button that tells the story.
 * `?tour` in the URL skips it and starts the guided demo (`?tour=8` opens
 * step 8), so a shared link can land straight on the story.
 */

const KEY = "luna-twin:welcomed";

function seen() {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

function remember() {
  try {
    window.localStorage.setItem(KEY, "1");
  } catch {
    /* private mode: show it again next time */
  }
}

export function Welcome() {
  const tourActive = useTwin((s) => s.tour.active);
  const setTour = useTwin((s) => s.setTour);
  const [open, setOpen] = useState(() => !seen());

  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("tour");
    if (q === null) return;
    const n = Math.min(STEPS.length, Math.max(1, Number.parseInt(q, 10) || 1));
    setOpen(false);
    // Let the scene mount before the first camera move.
    const t = window.setTimeout(() => setTour({ active: true, step: n - 1 }), 600);
    return () => window.clearTimeout(t);
  }, [setTour]);

  const close = () => {
    remember();
    setOpen(false);
  };

  // Clicking into the twin is an answer too: step aside once they explore.
  const selectedId = useTwin((s) => s.selectedId);
  const focus = useTwin((s) => s.focus);
  useEffect(() => {
    if (selectedId || focus !== "SITE") {
      remember();
      setOpen(false);
    }
  }, [selectedId, focus]);

  return (
    <AnimatePresence>
      {open && !tourActive ? (
        <motion.div
          key="welcome"
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 12 }}
          transition={{ duration: 0.24, delay: 0.4 }}
          className="pointer-events-none absolute right-[388px] bottom-4 left-[448px] z-40 flex justify-center 2xl:right-[420px] 2xl:left-[496px]"
        >
          <div data-hud className="pointer-events-auto w-full max-w-[432px] overflow-hidden rounded-[18px] bg-[#0f1b2a] text-white shadow-[0_24px_48px_-12px_rgb(15_27_42/0.55)]">
            <div className="flex items-center gap-2 px-4 pt-3.5">
              <LunaMark className="h-3.5 w-4" />
              <span className="font-mono text-[10.5px] tracking-[0.08em] text-white/55 uppercase">Concept demo · simulated site</span>
              <button type="button" onClick={close} aria-label="Dismiss" className="ml-auto flex size-6 items-center justify-center rounded-[7px] text-white/50 hover:bg-white/10 hover:text-white">
                <X className="size-3.5" />
              </button>
            </div>
            <div className="px-4 pt-2 pb-3">
              <h3 className="font-serif text-[23px] leading-[1.1] tracking-[-0.005em]">A live twin of one grow operation</h3>
              <p className="mt-2 text-[12.5px] leading-[1.6] text-white/75">
                Vertical farm, glasshouse tomatoes, harvest, QA and cold chain, ticking every second. The tomatoes are drawn from what the cameras measured, not from photos. The tour takes about two minutes.
              </p>
            </div>
            <div className="flex items-center gap-2 border-t border-white/10 px-4 py-2.5">
              <span className="flex items-center gap-1 text-[11px] text-white/50 [&_kbd]:bg-white/10 [&_kbd]:text-white/80 [&_kbd]:ring-white/15">
                <Kbd>⌘K</Kbd> search
              </span>
              <div className="ml-auto flex gap-1.5">
                <button type="button" onClick={close} className="flex h-8 items-center rounded-[9px] px-2.5 text-[12px] font-medium text-white/70 hover:bg-white/10">
                  Explore
                </button>
                <button
                  type="button"
                  onClick={() => {
                    close();
                    setTour({ active: true, step: 0 });
                  }}
                  className="flex h-8 items-center gap-1.5 rounded-[9px] bg-luna px-3 text-[12px] font-semibold text-[#3d2600] hover:bg-[#ffc571]"
                >
                  <Play className="size-3 fill-current" /> Start the tour
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
