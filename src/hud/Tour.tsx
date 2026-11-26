import { AnimatePresence, motion } from "motion/react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import { useEffect } from "react";
import { cn } from "@/lib/format";
import { twin, useTwin } from "@/sim/store";
import { askLuna } from "./luna-chat";
import { RichText } from "./RichText";
import { LunaMark } from "./ui";

/**
 * Guided demo: thirteen beats that tell the story to someone who has never
 * run a farm — and to someone who runs many. Each step drives the real UI
 * (camera, panels, layers, sim) so the audience sees the product, not slides.
 */

interface Step {
  title: string;
  body: string;
  enter: () => void;
}

const vpdAlert = () => twin().sim.alerts.find((a) => a.incidentId === "vpd-v2" && a.status === "OPEN");

export const STEPS: Step[] = [
  {
    title: "One live model of the whole operation",
    body: "Vertical farm, glasshouse, harvest, QA, cold chain and the fertigation yard in one spatial view. Everything ticks at 1 Hz — **1,284 sensors**, **10 robots**, **3 camera rails**.",
    enter: () => {
      const st = twin();
      st.setRole("GROWER");
      st.select(undefined);
      st.setLayer("heat", null);
      st.setLayer("trace", false);
      st.flyToZone("SITE");
      st.setRightPanel("brief");
    },
  },
  {
    title: "The shift starts with a brief, not a dashboard",
    body: "Luna reads the twin overnight and opens with what needs you and why — yield coming, batches due out, tanks running low. Every ID is a chip that flies the camera there.",
    enter: () => {
      twin().setRightPanel("brief");
    },
  },
  {
    title: "Something drifts",
    body: "Grow Room [[V2]] is drying out: the HVAC lost a cooling stage, so VPD is climbing under full LED load. The heat map shows where — the HVAC end of the room.",
    enter: () => {
      const st = twin();
      if (!vpdAlert()) st.triggerIncident("vpd-v2", 170);
      st.setLayer("heat", "vpd");
      st.select("V2", { fly: true });
    },
  },
  {
    title: "Ask why, in plain language",
    body: "Luna answers from live state: root cause, what's at risk ([[LET-1124]] is heading lettuce, prone to tipburn) and a recommended fix with an owner.",
    enter: () => {
      askLuna("Why is Grow Room V2 running warm?");
    },
  },
  {
    title: "Approve — then watch it verify itself",
    body: "One tap applies the recommendation. Luna keeps watching until VPD is back in band, then logs the verification in the feed. Detect → explain → act → verify, in under a minute.",
    enter: () => {
      const st = twin();
      const a = vpdAlert();
      if (a) st.approveAlert(a.id);
      st.setRightPanel("brief");
    },
  },
  {
    title: "Crop vision, without the photos",
    body: "LUNA camera rails image every tomato plant several times a day. Inference runs on-site, so the twin draws each truss from its **ripeness score** — the crop you see is the crop the cameras measured.",
    enter: () => {
      const st = twin();
      st.setLayer("heat", null);
      st.setCvLens("ripeness");
      st.select("G1");
      st.flyToZone("GH");
    },
  },
  {
    title: "Down to a single plant",
    body: "Each row is built from camera-measured trusses, fruit, flowers, head height and stem diameter. Click any plant — in 3D or in the strip — to see what was measured, when, and the few hundred bytes the edge node synced for it.",
    enter: () => {
      const st = twin();
      st.selectPlant("G2-R04-P09", "G2-R04");
      st.flyToAsset("G2-R04");
    },
  },
  {
    title: "From pixels to a pick plan",
    body: "Because the twin knows the colour of every truss, Luna turns this morning's scans into tomorrow's pick list, a 14-day forecast and the crew hours to match — and holds pickers out of the pest hotspots until a scout clears them.",
    enter: () => {
      const st = twin();
      st.setCvLens("ripeness");
      st.flyToZone("GH");
      askLuna("Where should the picking crews go tomorrow?");
    },
  },
  {
    title: "Why it works on a farm's internet",
    body: "Today's images stay on [[EDGE-01]]. Only plant state syncs — thousands of times less data than shipping photos — so remote sites need no fibre and the twin stays instant.",
    enter: () => {
      // Pull back to the whole glasshouse so the rail-to-edge streams are in frame.
      const st = twin();
      st.select("EDGE-01");
      st.flyToZone("GH");
    },
  },
  {
    title: "See pest pressure before it spreads",
    body: "The **Pests** lens maps what PestScout flagged: a whitefly patch in [[G2]] around rows 3–5 and early botrytis on row 8. Luna suggests a biological release and a scout to confirm.",
    enter: () => {
      const st = twin();
      st.setCvLens("pests");
      st.select("G2");
      st.flyToZone("GH");
    },
  },
  {
    title: "Tanks and fertigation, live",
    body: "[[TANK-B]] has about two days left at today's draw. Levels, EC and pH stream from the yard and the mix tank cycles in real time — Luna turns it into a reorder before it's a problem.",
    enter: () => {
      const st = twin();
      st.setCvLens("ripeness");
      st.select("TANK-B", { fly: true });
    },
  },
  {
    title: "Trace a batch to the truck",
    body: "Follow [[LET-1124]] from seeding through towers, harvest and QA to cold storage and the 14:00 Cascade Fresh truck — one ID, every touchpoint, drawn in 3D.",
    enter: () => {
      const st = twin();
      st.setLayer("heat", null);
      st.select("TRK-2");
      st.selectBatch("LET-1124", { trace: true });
      st.flyToZone("SITE");
    },
  },
  {
    title: "One twin, every role",
    body: "Switch to the facility manager and the same twin re-ranks around throughput, dispatch and the robot fleet. Explore freely — press **⌘K** to search anything, or ask Luna.",
    enter: () => {
      const st = twin();
      st.setRole("MANAGER");
      st.setLayer("trace", false);
      st.setRightPanel("brief");
      st.flyToZone("SITE");
    },
  },
];

export function Tour() {
  const tour = useTwin((s) => s.tour);
  const setTour = useTwin((s) => s.setTour);

  useEffect(() => {
    if (tour.active) STEPS[tour.step]?.enter();
  }, [tour.active, tour.step]);

  useEffect(() => {
    if (!tour.active) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowRight") setTour({ step: Math.min(STEPS.length - 1, twin().tour.step + 1) });
      if (e.key === "ArrowLeft") setTour({ step: Math.max(0, twin().tour.step - 1) });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [tour.active, setTour]);

  const step = STEPS[tour.step];
  const last = tour.step === STEPS.length - 1;
  return (
    <AnimatePresence>
      {tour.active && step ? (
        <motion.div key="tour" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }} transition={{ duration: 0.2 }} className="pointer-events-none absolute right-[388px] bottom-4 left-[448px] z-40 flex justify-center 2xl:right-[420px] 2xl:left-[496px]">
          <div className="pointer-events-auto w-full max-w-[432px]">
            <div data-hud className="overflow-hidden rounded-[18px] bg-[#0f1b2a] text-white shadow-[0_24px_48px_-12px_rgb(15_27_42/0.55)]">
              <div className="flex items-center gap-2 px-4 pt-3.5">
                <LunaMark className="h-3.5 w-4" />
                <span className="font-mono text-[10.5px] tracking-[0.08em] text-white/55 uppercase">
                  Guided demo · {tour.step + 1} / {STEPS.length}
                </span>
                <button type="button" onClick={() => setTour({ active: false })} aria-label="Exit demo" className="ml-auto flex size-6 items-center justify-center rounded-[7px] text-white/50 hover:bg-white/10 hover:text-white">
                  <X className="size-3.5" />
                </button>
              </div>
              <AnimatePresence mode="wait">
                <motion.div key={tour.step} initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -8 }} transition={{ duration: 0.16 }} className="px-4 pt-2 pb-3">
                  <h3 className="font-serif text-[23px] leading-[1.1] tracking-[-0.005em]">{step.title}</h3>
                  <p className="mt-2 text-[12.5px] leading-[1.6] text-white/75 [&_button]:bg-white/10 [&_button]:text-white [&_button]:ring-white/15 [&_strong]:text-white">
                    <RichText text={step.body} chipSize="sm" />
                  </p>
                </motion.div>
              </AnimatePresence>
              <div className="flex items-center gap-3 border-t border-white/10 px-4 py-2.5">
                <div className="flex gap-1">
                  {STEPS.map((_, i) => (
                    <button key={i} type="button" aria-label={`Step ${i + 1}`} onClick={() => setTour({ step: i })} className={cn("h-1.5 rounded-full transition-all", i === tour.step ? "w-4 bg-luna" : i < tour.step ? "w-1.5 bg-white/50" : "w-1.5 bg-white/20")} />
                  ))}
                </div>
                <div className="ml-auto flex gap-1.5">
                  <button type="button" disabled={tour.step === 0} onClick={() => setTour({ step: tour.step - 1 })} className="flex h-8 items-center gap-1 rounded-[9px] px-2.5 text-[12px] font-medium text-white/70 hover:bg-white/10 disabled:opacity-30">
                    <ArrowLeft className="size-3.5" /> Back
                  </button>
                  <button type="button" onClick={() => (last ? setTour({ active: false }) : setTour({ step: tour.step + 1 }))} className="flex h-8 items-center gap-1 rounded-[9px] bg-luna px-3 text-[12px] font-semibold text-[#3d2600] hover:bg-[#ffc571]">
                    {last ? "Explore" : "Next"} <ArrowRight className="size-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
