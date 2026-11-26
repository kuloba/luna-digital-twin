import { AnimatePresence, motion } from "motion/react";
import { useTwin } from "@/sim/store";
import { LunaMark } from "./ui";

/**
 * A light placeholder for the second or two between the HUD painting and the
 * 3D scene's first frame (longer on a slow link), so the canvas never sits
 * blank. It sits in the free area between the panels.
 */
export function SceneLoader() {
  const ready = useTwin((s) => s.sceneReady);
  return (
    <AnimatePresence>
      {!ready ? (
        <motion.div
          key="loader"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="pointer-events-none absolute top-[208px] right-[380px] bottom-[220px] left-[64px] z-0 flex items-center justify-center 2xl:right-[412px]"
        >
          <div className="flex items-center gap-2.5 rounded-full bg-white/90 py-2 pr-4 pl-3 text-[12px] text-ink-2 shadow-[0_0_0_1px_rgb(15_27_42/0.08),0_6px_18px_-6px_rgb(15_27_42/0.25)]">
            <LunaMark className="h-3.5 w-4 animate-pulse" />
            <span>Building the twin from live plant state…</span>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
