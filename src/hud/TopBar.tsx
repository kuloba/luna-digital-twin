import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, Command, Play, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { create } from "zustand";
import { cn } from "@/lib/format";
import { ZONES } from "@/sim/layout";
import { useTwin } from "@/sim/store";
import { Kbd, LunaMark, Segmented } from "./ui";
import { clockNow } from "@/lib/clock";

export function TopBar() {
  return (
    <>
    <header className="pointer-events-auto absolute inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-white/95 px-4 backdrop-blur">
      <div className="flex items-center gap-2.5 pr-1 pl-1">
        <LunaMark className="h-[22px] w-[27px]" />
        <span className="text-[14px] font-semibold tracking-[0.12em] text-ink">LUNA</span>
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
    <RemoteCampus />
    </>
  );
}

/* Campus > zone hierarchy. Kent is the campus modelled live in this twin; the
   other two are listed with their own zones and open as a site summary. */
interface CampusZone { id: string; short: string; name: string }
interface Campus { id: string; name: string; region: string; sub: string; zones: CampusZone[]; kpis?: [string, string][] }
const CAMPUSES: Campus[] = [
  { id: "KENT", name: "Kent CEA Campus", region: "Kent, WA", sub: "8 zones · 4.2 ha", zones: [] },
  {
    id: "SALINAS", name: "Salinas Glasshouse", region: "Salinas, CA", sub: "4 zones · 9.6 ha",
    zones: [
      { id: "S-G1", short: "Glasshouse A", name: "Tomato on-the-vine · 3.2 ha" },
      { id: "S-G2", short: "Glasshouse B", name: "Cherry tomato · 3.0 ha" },
      { id: "S-PK", short: "Packhouse", name: "Grading, QA and dispatch" },
      { id: "S-FY", short: "Fertigation yard", name: "Stock tanks and mixing" },
    ],
    kpis: [["Yield today", "6,940 kg"], ["Grade-A", "93.1 %"], ["Scout bots", "8 active"], ["Open alerts", "1"]],
  },
  {
    id: "LEAMINGTON", name: "Leamington Vertical Farm", region: "Leamington, ON", sub: "5 zones · 1.1 ha",
    zones: [
      { id: "L-V1", short: "Grow Hall 1", name: "Leafy greens · 48 towers" },
      { id: "L-V2", short: "Grow Hall 2", name: "Herbs and microgreens · 40 towers" },
      { id: "L-SD", short: "Seeding", name: "Germination and transplant" },
      { id: "L-PK", short: "Harvest and pack", name: "Harvest, QA and pack" },
      { id: "L-CC", short: "Cold chain", name: "Cold rooms and loading" },
    ],
    kpis: [["Line throughput", "198 trays/h"], ["Active towers", "84 / 88"], ["Grade-A", "96.0 %"], ["Open alerts", "0"]],
  },
];
const useCampus = create<{ campus: string; zone?: string; set: (campus: string, zone?: string) => void }>((set) => ({ campus: "KENT", set: (campus, zone) => set({ campus, zone }) }));

function RemoteCampus() {
  const { campus, zone, set } = useCampus();
  const flyToZone = useTwin((s) => s.flyToZone);
  const c = CAMPUSES.find((x) => x.id === campus);
  if (!c || c.id === "KENT") return null;
  const z = c.zones.find((x) => x.id === zone);
  return (
    <div className="pointer-events-auto absolute inset-x-0 top-14 bottom-0 z-[29] flex items-center justify-center bg-[#eef1f4]/85 backdrop-blur-sm">
      <div className="w-[440px] p-5 panel">
        <span className="text-[10px] font-medium tracking-[0.06em] text-faint uppercase">{c.region}{z ? ` · ${c.name}` : ""}</span>
        <h2 className="mt-1 text-[20px] font-semibold tracking-[-0.01em] text-ink">{z ? z.short : c.name}</h2>
        <p className="mt-1 text-[12.5px] text-muted">{z ? z.name : c.sub}</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {c.kpis?.map(([k, v]) => (
            <div key={k} className="rounded-[10px] bg-panel-2 px-3 py-2">
              <div className="text-[11px] text-muted">{k}</div>
              <div className="mt-0.5 font-mono text-[15px] text-ink">{v}</div>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[11.5px] leading-[1.5] text-muted">Site summary from this campus's edge node. Its full 3D twin isn't part of this demo, which models Kent live.</p>
        <button type="button" onClick={() => (set("KENT"), flyToZone("SITE"))} className="mt-4 h-8 rounded-[9px] bg-ink px-3 text-[12px] font-medium text-white">Back to Kent CEA Campus</button>
      </div>
    </div>
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
  const { campus, zone, set: setCampus } = useCampus();
  const remote = CAMPUSES.find((c) => c.id === campus && c.id !== "KENT");
  const remoteZone = remote?.zones.find((z) => z.id === zone);
  const label = remote ? (remoteZone?.short ?? remote.name) : focus === "SITE" ? "Kent CEA Campus" : ZONES.find((z) => z.id === focus)?.short;
  const kicker = remote ? (remoteZone ? remote.name : "Site") : focus === "SITE" ? "Site" : "Kent CEA Campus";
  const goKent = (z: Parameters<typeof flyToZone>[0]) => (setCampus("KENT"), flyToZone(z), setOpen(false));
  const zoneAlerts = (id: string) => alerts.filter((a) => a.status === "OPEN" && a.zoneId === id);
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex h-9 items-center gap-2 rounded-[10px] px-2.5 text-left transition-colors hover:bg-[#f1f4f7]">
        <div className="flex flex-col leading-none">
          <span className="max-w-[170px] truncate text-[10px] font-medium tracking-[0.06em] text-faint uppercase">{kicker}</span>
          <span className="mt-1 block max-w-[150px] truncate text-[13px] font-medium whitespace-nowrap text-ink">{label}</span>
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
            className="scroll-thin absolute top-12 left-0 max-h-[calc(100vh-80px)] w-[320px] origin-top-left overflow-y-auto p-1.5 panel"
          >
            <CampusHeader name="Kent CEA Campus" region="Kent, WA · live twin" />
            <ZoneItem active={!remote && focus === "SITE"} label="Whole campus" hint="0" onClick={() => goKent("SITE")} sub="8 zones · 4.2 ha" />
            {ZONES.map((z) => {
              const n = zoneAlerts(z.id).length;
              return <ZoneItem key={z.id} indent active={!remote && focus === z.id} label={z.short} sub={z.name} hint={z.hotkey} alerts={n} onClick={() => goKent(z.id)} />;
            })}
            {CAMPUSES.filter((c) => c.id !== "KENT").map((c) => (
              <div key={c.id}>
                <div className="my-1 h-px bg-line" />
                <CampusHeader name={c.name} region={`${c.region} · site summary`} />
                <ZoneItem active={campus === c.id && !zone} label="Whole campus" sub={c.sub} hint="" onClick={() => (setCampus(c.id), setOpen(false))} />
                {c.zones.map((z) => (
                  <ZoneItem key={z.id} indent active={campus === c.id && zone === z.id} label={z.short} sub={z.name} hint="" onClick={() => (setCampus(c.id, z.id), setOpen(false))} />
                ))}
              </div>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function CampusHeader({ name, region }: { name: string; region: string }) {
  return (
    <div className="px-2.5 pt-2 pb-1">
      <div className="text-[11.5px] font-semibold text-ink">{name}</div>
      <div className="text-[10.5px] text-faint">{region}</div>
    </div>
  );
}

function ZoneItem({ label, sub, hint, active, alerts = 0, indent, onClick }: { label: string; sub: string; hint: string; active: boolean; alerts?: number; indent?: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className={cn("flex w-full items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left hover:bg-[#f3f6f8]", indent && "pl-5", active && "bg-[#f3f6f8]")}>
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="text-[12.5px] font-medium text-ink">{label}</span>
        <span className="truncate text-[11px] text-muted">{sub}</span>
      </div>
      {alerts ? <span className="flex size-5 items-center justify-center rounded-full bg-warn-soft font-mono text-[10px] text-[#9a5b05] ring-1 ring-[#f3d9a8]">{alerts}</span> : null}
      {active ? <Check className="size-3.5 text-luna-ink" /> : hint ? <Kbd>{hint}</Kbd> : null}
    </button>
  );
}

function SearchButton() {
  const setSearchOpen = useTwin((s) => s.setSearchOpen);
  return (
    <button
      type="button"
      onClick={() => setSearchOpen(true)}
      className="ml-1 flex h-9 w-[min(440px,24vw)] min-w-[180px] items-center gap-2 rounded-[10px] 2xl:w-[min(440px,30vw)] bg-[#f3f6f8] px-3 text-left text-[12.5px] text-muted ring-1 ring-transparent transition hover:ring-line-2"
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

function LiveIndicator() {
  const tick = useTwin((s) => s.sim.tick);
  const running = useTwin((s) => s.running);
  const setRunning = useTwin((s) => s.setRunning);
  const [now, setNow] = useState(() => new Date(clockNow()));
  useEffect(() => {
    const t = setInterval(() => setNow(new Date(clockNow())), 1000);
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
          <span className="mt-1 font-mono text-[9.5px] whitespace-nowrap text-faint">1,284 sensors · 1 Hz</span>
        </div>
      </div>
      <div className="flex flex-col items-end leading-none whitespace-nowrap">
        <span className="font-mono text-[13px] font-medium text-ink tabular">{now.toLocaleTimeString("en-US", { hour12: false })}</span>
        <span className="mt-1 text-[10px] text-faint" title="The demo opens at 10:40 and runs in real time, so the day's story reads the same whenever it is viewed.">
          {now.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })} · demo clock
        </span>
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
        { value: "GROWER", label: <RoleLabel short="Grower" long="Head Grower" /> },
        { value: "MANAGER", label: <RoleLabel short="Manager" long="Facility Mgr" /> },
      ]}
    />
  );
}

function RoleLabel({ short, long }: { short: string; long: string }) {
  return (
    <>
      <span className="2xl:hidden">{short}</span>
      <span className="hidden 2xl:inline">{long}</span>
    </>
  );
}

function TourButton() {
  const tour = useTwin((s) => s.tour);
  const setTour = useTwin((s) => s.setTour);
  return (
    <button
      type="button"
      onClick={() => setTour({ active: !tour.active, step: 0 })}
      className="flex h-8 shrink-0 items-center gap-1.5 rounded-[10px] bg-ink px-3 text-[12px] font-medium whitespace-nowrap text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.15),0_1px_2px_rgb(0_0_0/0.2)] transition hover:bg-[#1e2b3c]"
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
