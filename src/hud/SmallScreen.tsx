import { ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";
import { LunaMark } from "./ui";

/** Phones get a poster and an honest note instead of a cramped 3D view. */
export function useSmallScreen() {
  const query = "(max-width: 899px)";
  const [small, setSmall] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const m = window.matchMedia(query);
    const on = () => setSmall(m.matches);
    m.addEventListener("change", on);
    return () => m.removeEventListener("change", on);
  }, []);
  return small;
}

export function SmallScreen({ onContinue }: { onContinue: () => void }) {
  return (
    <div className="h-full overflow-y-auto bg-[#eef1f4] px-4 py-6">
      <div className="mx-auto flex max-w-[560px] flex-col gap-4">
        <div className="flex items-center gap-2.5">
          <LunaMark className="h-[22px] w-[27px]" />
          <span className="text-[14px] font-semibold tracking-[0.12em] text-ink">LUNA</span>
          <span className="text-[10px] font-medium tracking-[0.06em] text-faint uppercase">Twin</span>
          <span className="ml-auto rounded-full bg-white px-2 py-[3px] font-mono text-[9.5px] font-medium tracking-[0.06em] text-muted uppercase ring-1 ring-line ring-inset">Concept</span>
        </div>
        <h1 className="font-serif text-[34px] leading-[1.05] tracking-[-0.01em] text-ink">A live twin of one grow operation.</h1>
        <p className="text-[14px] leading-[1.6] text-ink-2">
          Vertical farm, glasshouse tomatoes, harvest, QA and cold chain in one spatial view, ticking every second. The tomatoes are drawn from what the cameras measured, not from photos, so it stays fast on a farm's internet.
        </p>
        <img src="/poster.jpg" alt="The twin on a laptop: 3D facility, live KPIs, batch tracker and Luna's shift brief" className="w-full rounded-[14px] shadow-[0_0_0_1px_rgb(15_27_42/0.08),0_12px_28px_-8px_rgb(15_27_42/0.3)]" />
        <p className="text-[13px] leading-[1.55] text-muted">It is built for a laptop or a tablet in landscape. Open this link there for the live 3D twin and the two-minute guided tour.</p>
        <button type="button" onClick={onContinue} className="flex h-10 items-center justify-center gap-1.5 self-start rounded-[10px] bg-ink px-4 text-[13px] font-medium text-white">
          Open it here anyway <ArrowRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
