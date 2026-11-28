import { AnimatePresence, motion } from "motion/react";
import { Bell, Boxes, Check, ChevronDown, ClipboardList, Command, FileBarChart, LineChart, Map as MapIcon, Menu, MessageCircle, Play, Plug, RotateCcw, Search, Settings, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { create } from "zustand";
import { cn } from "@/lib/format";
import { ZONES } from "@/sim/layout";
import { useTwin } from "@/sim/store";
import { Kbd, LunaMark, Segmented } from "./ui";
import { clockNow } from "@/lib/clock";

/* Hamburger + left nav drawer. The twin is the live view; the other
   destinations route into the panels that already exist, and the planning
   modules are listed as part of the roadmap. */
function NavMenu() {
  const [open, setOpen] = useState(false);
  const st = useTwin;
  const openAlerts = useTwin((s) => s.sim.alerts.filter((a) => a.status === "OPEN").length);
  const tourActive = useTwin((s) => s.tour.active);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopImmediatePropagation();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);
  const go = (fn: () => void) => () => (fn(), setOpen(false));
  const s = () => st.getState();
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open navigation"
        aria-expanded={open}
        className="flex size-9 shrink-0 items-center justify-center rounded-[10px] text-ink transition-colors hover:bg-[#f1f4f7]"
      >
        <Menu className="size-[19px]" strokeWidth={1.9} />
      </button>
      {createPortal(
      <AnimatePresence>
        {open ? (
          <>
            <motion.div
              key="scrim"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              onClick={() => setOpen(false)}
              className="fixed inset-0 z-40 bg-[#0f1a28]/20 backdrop-blur-[2px]"
            />
            <motion.nav
              key="drawer"
              initial={{ x: -24, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              exit={{ x: -24, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.2, 0.8, 0.2, 1] }}
              aria-label="Main"
              className="fixed top-2 bottom-2 left-2 z-50 flex w-[288px] flex-col overflow-hidden rounded-[16px] border border-line bg-white shadow-[0_24px_64px_-12px_rgb(15_26_40/0.28)]"
            >
              <div className="flex h-14 items-center gap-2.5 border-b border-line px-4">
                <LunaMark className="h-[22px] w-[27px]" />
                <span className="text-[14px] font-semibold tracking-[0.12em] text-ink">LUNA</span>
                <span className="ml-1 rounded-full bg-panel-2 px-1.5 py-0.5 text-[9.5px] font-medium tracking-[0.06em] text-muted uppercase ring-1 ring-line-2 ring-inset">Concept</span>
                <button type="button" onClick={() => setOpen(false)} aria-label="Close navigation" className="ml-auto flex size-8 items-center justify-center rounded-[9px] text-muted hover:bg-[#f1f4f7] hover:text-ink">
                  <X className="size-4" />
                </button>
              </div>
              <div className="scroll-thin flex-1 overflow-y-auto p-2">
                <NavGroup label="Operate">
                  <NavItem icon={<MapIcon />} label="Digital twin" sub="Kent CEA Campus · live" active onClick={go(() => s().flyToZone("SITE"))} />
                  <NavItem icon={<Boxes />} label="Batches" sub="Seeding to cold chain" onClick={go(() => s().selectBatch(s().batchId, { trace: true, fly: true }))} />
                  <NavItem icon={<Bell />} label="Alerts" sub="Morning brief and actions" badge={openAlerts} onClick={go(() => s().setRightPanel("brief"))} />
                  <NavItem icon={<MessageCircle />} label="Ask Luna" sub="Questions about the grow" kbd="A" onClick={go(() => s().setRightPanel("luna"))} />
                  <NavItem icon={<Search />} label="Search" sub="Batches, rows, sensors, AMRs" kbd="/" onClick={go(() => s().setSearchOpen(true))} />
                </NavGroup>
                <NavGroup label="Plan and report">
                  <NavItem icon={<LineChart />} label="Yield forecast" sub="14-day harvest outlook" soon />
                  <NavItem icon={<FileBarChart />} label="Reports" sub="Daily, weekly and buyer QA" soon />
                  <NavItem icon={<ClipboardList />} label="Tasks and labor" sub="Crew plans from CV scouting" soon />
                </NavGroup>
                <NavGroup label="Workspace">
                  <NavItem icon={<Plug />} label="Integrations" sub="Climate, fertigation, ERP" soon />
                  <NavItem icon={<Settings />} label="Settings" sub="Sites, users and thresholds" soon />
                </NavGroup>
              </div>
              <div className="flex flex-col gap-1 border-t border-line p-2">
                <NavItem icon={<Play className="fill-current" />} label={tourActive ? "Exit guided demo" : "Guided demo"} onClick={go(() => s().setTour({ active: !tourActive, step: 0 }))} />
                <NavItem icon={<RotateCcw />} label="Reset demo" sub="Restart the simulation" onClick={go(() => s().reset())} />
              </div>
            </motion.nav>
          </>
        ) : null}
      </AnimatePresence>,
      document.body,
      )}
    </>
  );
}

function NavGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="pb-2 not-first:border-t not-first:border-line not-first:pt-2">
      <div className="px-2.5 pt-1 pb-1.5 text-[10px] font-medium tracking-[0.06em] text-faint uppercase">{label}</div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

function NavItem({ icon, label, sub, active, badge, kbd, soon, onClick }: { icon: React.ReactNode; label: string; sub?: string; active?: boolean; badge?: number; kbd?: string; soon?: boolean; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={soon}
      className={cn(
        "flex w-full items-center gap-3 rounded-[10px] px-2.5 py-2 text-left transition-colors",
        soon ? "cursor-default" : "hover:bg-[#f3f6f8]",
        active && "bg-[#f3f6f8]",
      )}
    >
      <span className={cn("flex size-7 shrink-0 items-center justify-center rounded-[8px] [&>svg]:size-[15px]", active ? "bg-ink text-white" : "bg-panel-2 text-muted ring-1 ring-line-2 ring-inset", soon && "opacity-60")}>{icon}</span>
      <span className={cn("flex min-w-0 flex-1 flex-col", soon && "opacity-60")}>
        <span className="text-[12.5px] font-medium text-ink">{label}</span>
        {sub ? <span className="truncate text-[11px] text-muted">{sub}</span> : null}
      </span>
      {badge ? <span className="flex size-5 items-center justify-center rounded-full bg-warn-soft font-mono text-[10px] text-[#9a5b05] ring-1 ring-[#f3d9a8]">{badge}</span> : null}
      {kbd ? <Kbd>{kbd}</Kbd> : null}
      {soon ? <span className="text-[10px] font-medium text-faint">Soon</span> : null}
    </button>
  );
}

export function TopBar() {
  return (
    <>
    <header className="pointer-events-auto absolute inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-white/95 px-4 backdrop-blur">
      <NavMenu />
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
            <CampusGroup name="Kent CEA Campus" region="Kent, WA · live twin" defaultOpen={!remote} current={!remote}>
              <ZoneItem indent active={!remote && focus === "SITE"} label="Whole campus" hint="0" onClick={() => goKent("SITE")} sub="9 zones · 4.2 ha" />
              {ZONES.map((z) => {
                const n = zoneAlerts(z.id).length;
                return <ZoneItem key={z.id} indent active={!remote && focus === z.id} label={z.short} sub={z.name} hint={z.hotkey} alerts={n} onClick={() => goKent(z.id)} />;
              })}
            </CampusGroup>
            {CAMPUSES.filter((c) => c.id !== "KENT").map((c) => (
              <CampusGroup key={c.id} name={c.name} region={`${c.region} · site summary`} defaultOpen={campus === c.id} current={campus === c.id}>
                <ZoneItem indent active={campus === c.id && !zone} label="Whole campus" sub={c.sub} hint="" onClick={() => (setCampus(c.id), setOpen(false))} />
                {c.zones.map((z) => (
                  <ZoneItem key={z.id} indent active={campus === c.id && zone === z.id} label={z.short} sub={z.name} hint="" onClick={() => (setCampus(c.id, z.id), setOpen(false))} />
                ))}
              </CampusGroup>
            ))}
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

/** One campus as a collapsible group; its zones nest inside. */
function CampusGroup({ name, region, defaultOpen, current, children }: { name: string; region: string; defaultOpen: boolean; current: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-line last:border-b-0">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} className="flex w-full items-center gap-2 rounded-[10px] px-2.5 py-2 text-left hover:bg-[#f3f6f8]">
        <ChevronDown className={cn("size-3.5 shrink-0 text-muted transition-transform", !open && "-rotate-90")} />
        <div className="min-w-0 flex-1">
          <div className="text-[12.5px] font-semibold text-ink">{name}</div>
          <div className="truncate text-[10.5px] text-faint">{region}</div>
        </div>
        {current ? <span className="size-1.5 rounded-full bg-[#2563eb]" /> : null}
      </button>
      {open ? <div className="pb-1">{children}</div> : null}
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
