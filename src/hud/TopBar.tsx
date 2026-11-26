import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, Command, Play, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/format";
import { ZONES } from "@/sim/layout";
import { useTwin } from "@/sim/store";
import { Kbd, LunaMark, Segmented } from "./ui";

export function TopBar() {
  return (
    <header className="pointer-events-auto absolute inset-x-4 top-4 z-30 flex h-14 items-center gap-3 rounded-2xl px-3 panel">
      <div className="flex items-center gap-2.5 pr-1 pl-1">
        <LunaMark className="h-[22px] w-[27px]" />
        <div className="flex flex-col leading-none">
          <span className="text-[14px] font-semibold tracking-[0.12em] text-ink">LUNA</span>
          <span className="mt-1 text-[10px] font-medium tracking-[0.06em] text-faint uppercase">Twin</span>
        </div>
      </div>
      <div className="h-7 w-px bg-line" />
      <ZoneSwitcher />
      <SearchButton />
      <div className="ml-auto flex items-center gap-3">
        <LiveIndicator />
        <div className="h-7 w-px bg-line" />
        <RoleSwitch />
        <TourButton />
        <Profile />
      </div>
    </header>
  );
}

function ZoneSwitcher() {
  const focus = useTwin((s) => s.focus);
  const flyToZone = useTwin((s) => s.flyToZone);
  const alerts = useTwin((s) => s.sim.alerts);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const label = focus === "SITE" ? "Kent CEA Campus" : ZONES.find((z) => z.id === focus)?.short;
  const zoneAlerts = (id: string) => alerts.filter((a) => a.status === "OPEN" && a.zoneId === id);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex h-9 items-center gap-2 rounded-[10px] px-2.5 text-left transition-colors hover:bg-[#f1f4f7]">
        <div className="flex flex-col leading-none">
          <span className="text-[10px] font-medium tracking-[0.06em] text-faint uppercase">{focus === "SITE" ? "Site" : "Zone"}</span>
          <span className="mt-1 text-[13px] font-medium text-ink">{label}</span>
        </div>
        <ChevronDown className={cn("size-4 text-muted transition-transform", open && "rotate-180")} />
      </button>
      <AnimatePresence>
        {open ? (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.98 }}
            transition={{ duration: 0.14 }}
            className="absolute top-12 left-0 w-[300px] origin-top-left p-1.5 panel"
          >
            <ZoneItem active={focus === "SITE"} label="Whole campus" hint="0" onClick={() => (flyToZone("SITE"), setOpen(false))} sub="8 zones · 4.2 ha" />
            <div className="my-1 h-px bg-line" />
            {ZONES.map((z) => {
              const n = zoneAlerts(z.id).length;
              return <ZoneItem key={z.id} active={focus === z.id} label={z.short} sub={z.name} hint={z.hotkey} alerts={n} onClick={() => (flyToZone(z.id), setOpen(false))} />;
            })}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function ZoneItem({ label, sub, hint, active, alerts = 0, onClick }: { label: string; sub: string; hint: string; active: boolean; alerts?: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn("flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left hover:bg-[#f3f6f8]", active && "bg-[#f3f6f8]")}>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-[12.5px] font-medium text-ink">{label}</span>
        <span className="truncate text-[11px] text-muted">{sub}</span>
      </div>
      {alerts ? <span className="flex size-5 items-center justify-center rounded-full bg-warn-soft font-mono text-[10px] text-[#9a5b05] ring-1 ring-[#f3d9a8]">{alerts}</span> : null}
      {active ? <Check className="size-3.5 text-luna-ink" /> : <Kbd>{hint}</Kbd>}
    </button>
  );
}

function SearchButton() {
  const setSearchOpen = useTwin((s) => s.setSearchOpen);
  return (
    <button
      type="button"
      onClick={() => setSearchOpen(true)}
      className="ml-1 flex h-9 w-[min(440px,32vw)] items-center gap-2 rounded-[10px] bg-[#f3f6f8] px-3 text-left text-[12.5px] text-muted ring-1 ring-transparent transition hover:ring-line-2"
    >
      <Search className="size-4 text-faint" />
      <span className="flex-1 truncate">Search batch IDs, towers, rows, sensors, AMRs…</span>
      <span className="flex items-center gap-1">
        <Kbd>
          <Command className="size-2.5" />
        </Kbd>
        <Kbd>K</Kbd>
      </span>
    </button>
  );
}

const TZ = new Intl.DateTimeFormat("en-US", { timeZoneName: "short" }).formatToParts(new Date()).find((p) => p.type === "timeZoneName")?.value ?? "";

function LiveIndicator() {
  const tick = useTwin((s) => s.sim.tick);
  const running = useTwin((s) => s.running);
  const setRunning = useTwin((s) => s.setRunning);
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  void tick;
  return (
    <button type="button" onClick={() => setRunning(!running)} title={running ? "Pause live telemetry" : "Resume live telemetry"} className="flex items-center gap-3 rounded-[10px] px-2 py-1 hover:bg-[#f3f6f8]">
      <div className="flex items-center gap-2">
        <span className="relative flex size-2.5">
          {running ? <span className="absolute inset-0 animate-ping rounded-full bg-ok opacity-50" /> : null}
          <span className={cn("relative size-2.5 rounded-full", running ? "bg-ok" : "bg-faint")} />
        </span>
        <div className="flex flex-col leading-none">
          <span className="text-[11.5px] font-medium text-ink">{running ? "Live" : "Paused"}</span>
          <span className="mt-1 font-mono text-[9.5px] text-faint">1,284 sensors · 1 Hz</span>
        </div>
      </div>
      <div className="flex flex-col items-end leading-none">
        <span className="font-mono text-[13px] font-medium text-ink tabular">{now.toLocaleTimeString("en-US", { hour12: false })}</span>
        <span className="mt-1 text-[10px] text-faint">{now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · {TZ}</span>
      </div>
    </button>
  );
}

function RoleSwitch() {
  const role = useTwin((s) => s.role);
  const setRole = useTwin((s) => s.setRole);
  return (
    <Segmented
      value={role}
      onChange={setRole}
      options={[
        { value: "GROWER", label: "Head Grower" },
        { value: "MANAGER", label: "Facility Mgr" },
      ]}
    />
  );
}

function TourButton() {
  const tour = useTwin((s) => s.tour);
  const setTour = useTwin((s) => s.setTour);
  return (
    <button
      type="button"
      onClick={() => setTour({ active: !tour.active, step: 0 })}
      className="flex h-8 items-center gap-1.5 rounded-[10px] bg-ink px-3 text-[12px] font-medium text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.15),0_1px_2px_rgb(0_0_0/0.2)] transition hover:bg-[#1e2b3c]"
    >
      <Play className="size-3 fill-current" />
      {tour.active ? "Exit demo" : "Guided demo"}
    </button>
  );
}

function Profile() {
  const operator = useTwin((s) => s.operator);
  const [name, role] = operator.split(" · ");
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .join("");
  return (
    <div className="flex items-center gap-2 pl-1">
      <div className="flex size-8 items-center justify-center rounded-full bg-[linear-gradient(135deg,#fde2b5,#f6b85a)] text-[11px] font-semibold text-[#6b3e00] ring-2 ring-white">{initials}</div>
      <div className="hidden flex-col leading-none 2xl:flex">
        <span className="text-[12px] font-medium text-ink">{name}</span>
        <span className="mt-1 text-[10.5px] text-faint">{role}</span>
      </div>
    </div>
  );
}
