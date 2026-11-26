import { AnimatePresence, motion } from "motion/react";
import { ArrowUp, MessageCircle, RotateCcw, ScanSearch, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn, formatAgo, formatNumber } from "@/lib/format";
import { liquidColor } from "@/lib/theme";
import { TANKS } from "@/sim/layout";
import { greeting, PRESETS, shiftBrief } from "@/sim/luna";
import { deviation, inBand } from "@/sim/metrics";
import { twin, useTwin } from "@/sim/store";
import type { Alert, FeedEvent, Metric } from "@/sim/types";
import { AlertCard } from "./AlertCard";
import { TankGauge } from "./gauges";
import { Inspector } from "./Inspector";
import { askLuna } from "./luna-chat";
import { EntityChip, RichText, textLength } from "./RichText";
import { Eyebrow, LunaMark, Num, Section, Sparkline } from "./ui";

export function RightPanel() {
  const panel = useTwin((s) => s.rightPanel);
  const setPanel = useTwin((s) => s.setRightPanel);
  const openAlerts = useTwin((s) => s.sim.alerts.filter((a) => a.status === "OPEN").length);
  const selectedId = useTwin((s) => s.selectedId);
  return (
    <aside data-tour="right-panel" className="pointer-events-auto absolute top-[88px] right-4 bottom-4 z-20 flex w-[392px] flex-col overflow-hidden panel">
      <div className="flex items-center gap-1 border-b border-line px-2 py-2">
        <Tab active={panel === "brief"} onClick={() => setPanel("brief")} icon={<Sparkles className="size-3.5" />} label="Brief" badge={openAlerts} />
        <Tab active={panel === "inspector"} onClick={() => setPanel("inspector")} icon={<ScanSearch className="size-3.5" />} label={selectedId ? <span className="font-mono text-[11.5px]">{selectedId}</span> : "Inspector"} />
        <Tab active={panel === "luna"} onClick={() => setPanel("luna")} icon={<MessageCircle className="size-3.5" />} label="Ask Luna" />
      </div>
      <div className="relative min-h-0 flex-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={panel} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.16 }} className="absolute inset-0 flex flex-col">
            {panel === "brief" ? <Brief /> : panel === "inspector" ? <Inspector /> : <AskLuna />}
          </motion.div>
        </AnimatePresence>
      </div>
    </aside>
  );
}

function Tab({ active, onClick, icon, label, badge }: { active: boolean; onClick: () => void; icon: ReactNode; label: ReactNode; badge?: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex h-8 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-[9px] px-2 text-[12px] font-medium transition-colors", active ? "bg-[#f1f4f7] text-ink" : "text-muted hover:bg-[#f6f8fa] hover:text-ink")}
    >
      {icon}
      <span className="truncate">{label}</span>
      {badge ? <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-crit px-1 font-mono text-[9.5px] font-semibold text-white">{badge}</span> : null}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Brief                                                              */
/* ------------------------------------------------------------------ */

function Brief() {
  const role = useTwin((s) => s.role);
  const operator = useTwin((s) => s.operator);
  const sim = useTwin((s) => s.sim);
  const brief = useMemo(() => shiftBrief(sim, role), [sim, role]);
  const now = Date.now();
  const cards = sim.alerts.filter((a) => a.status !== "RESOLVED" || (a.resolvedAt && now - a.resolvedAt < 40_000)).sort((a, b) => rank(a) - rank(b));
  const first = operator.split(" ")[0];
  return (
    <div className="scroll-thin flex-1 overflow-y-auto px-4 pt-4 pb-6">
      <Eyebrow>
        Shift brief · {new Date().toLocaleDateString("en-US", { weekday: "long" })} {new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })}
      </Eyebrow>
      <h2 className="mt-2 font-serif text-[30px] leading-[1.05] tracking-[-0.01em] text-ink">
        {greeting()}, {first}.
      </h2>
      <p className="mt-2.5 text-[13.5px] leading-[1.5] font-medium text-ink-2">
        <RichText text={brief.headline} />
      </p>
      <ul className="mt-3 flex flex-col gap-2">
        {brief.lines.map((l, i) => (
          <li key={i} className="flex gap-2.5 text-[12.5px] leading-[1.6] text-muted">
            <span className="mt-[9px] size-1 shrink-0 rounded-full bg-[#b6c2ce]" />
            <span>
              <RichText text={l} chipSize="sm" />
            </span>
          </li>
        ))}
      </ul>

      {cards.length ? (
        <Section title={needsTitle(cards)} className="mt-5">
          <div className="flex flex-col gap-2.5">
            <AnimatePresence initial={false}>
              {cards.map((a) => (
                <motion.div key={a.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.22 }}>
                  <AlertCard alert={a} />
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </Section>
      ) : null}

      <Section title="Climate" action={<span className="font-mono text-[10px] text-faint">live · 1 Hz</span>} className="mt-5">
        <ClimateTable />
      </Section>

      <Section title="Tanks & fertigation" action={<button type="button" onClick={() => twin().flyToZone("UTIL")} className="text-[11px] font-medium text-luna-ink hover:underline">View yard →</button>} className="mt-5">
        <TankRow />
      </Section>

      <Section title="Live feed" className="mt-5">
        <Feed />
      </Section>
    </div>
  );
}

const rank = (a: Alert) => (a.status === "OPEN" ? (a.severity === "CRITICAL" ? 0 : 1) : a.status === "RESOLVING" ? 2 : 3);

/* ------------------------------------------------------------------ */
/* Climate table + tanks + feed                                       */
/* ------------------------------------------------------------------ */

const CLIMATE = ["V1", "V2", "G1", "G2", "G3", "CR-1", "CR-2"];

function ClimateTable() {
  return (
    <div className="overflow-hidden rounded-[12px] ring-1 ring-line ring-inset">
      <div className="grid grid-cols-[1fr_58px_50px_56px_58px] items-center gap-1 bg-panel-2 px-2.5 py-1.5 text-[10px] font-medium tracking-[0.04em] text-faint uppercase">
        <span>Space</span>
        <span className="text-right">°C</span>
        <span className="text-right">RH %</span>
        <span className="text-right">VPD</span>
        <span className="text-right">Trend</span>
      </div>
      {CLIMATE.map((id) => (
        <ClimateRow key={id} id={id} />
      ))}
    </div>
  );
}

function ClimateRow({ id }: { id: string }) {
  const a = useTwin((s) => s.sim.assets[id]);
  const selected = useTwin((s) => s.selectedId === id);
  if (!a) return null;
  const t = a.metrics.temp!;
  const rh = a.metrics.rh!;
  const vpd = a.metrics.vpd;
  const lead = vpd ?? t;
  const tone = (m?: Metric) => (!m || inBand(m) ? "text-ink" : deviation(m) > 0.35 ? "text-crit" : "text-[#b26b00]");
  const bad = [t, rh, vpd].some((m) => m && !inBand(m));
  return (
    <button
      type="button"
      onClick={() => twin().select(id, { fly: true })}
      onMouseEnter={() => twin().hover(id)}
      onMouseLeave={() => twin().hover(undefined)}
      className={cn("grid w-full grid-cols-[1fr_58px_50px_56px_58px] items-center gap-1 border-t border-line px-2.5 py-1.5 text-left transition-colors hover:bg-[#f8fafb]", selected && "bg-luna-soft/50")}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        <span className={cn("size-1.5 shrink-0 rounded-full", bad ? "bg-warn" : "bg-ok")} />
        <span className="font-mono text-[11px] font-medium text-ink">{id}</span>
        <span className="truncate text-[10.5px] text-faint">{a.kind === "COLD_ROOM" ? "cold" : a.kind === "ROOM" ? "vertical" : a.id === "G3" ? "cucumber" : "tomato"}</span>
      </span>
      <Num value={t.value} digits={1} className={cn("text-right font-mono text-[11.5px]", tone(t))} />
      <Num value={rh.value} digits={0} className={cn("text-right font-mono text-[11.5px]", tone(rh))} />
      {vpd ? <Num value={vpd.value} digits={2} className={cn("text-right font-mono text-[11.5px]", tone(vpd))} /> : <span className="text-right font-mono text-[11px] text-faint">—</span>}
      <span className="flex justify-end">
        <Sparkline data={lead.history.slice(-30)} band={[lead.low, lead.high]} color={inBand(lead) ? "#4f6d8f" : "#d98a0b"} width={50} height={16} fill={false} />
      </span>
    </button>
  );
}

const TANK_SHORT: Record<string, string> = { "RAIN-01": "Rain", "TANK-A": "Stock A", "TANK-B": "Stock B", "TANK-ACID": "Acid", "MIX-01": "Mix", "DRAIN-01": "Drain", "CO2-01": "CO₂", "BUF-01": "Heat" };

function TankRow() {
  return (
    <div className="flex justify-between gap-1 rounded-[12px] bg-panel-2 px-2 pt-2.5 pb-2">
      {TANKS.map((t) => (
        <TankCell key={t.id} id={t.id} role={t.role} />
      ))}
    </div>
  );
}

function TankCell({ id, role }: { id: string; role: string }) {
  const level = useTwin((s) => s.sim.assets[id]?.metrics.level);
  const days = useTwin((s) => s.sim.assets[id]?.detail?.daysLeft as number | undefined);
  const watch = useTwin((s) => s.sim.assets[id]?.status === "WATCH");
  const selected = useTwin((s) => s.selectedId === id);
  if (!level) return null;
  return (
    <button
      type="button"
      title={`${id} · ${formatNumber(level.value)}%${days ? ` · ${days} d left` : ""}`}
      onClick={() => twin().select(id, { fly: true })}
      onMouseEnter={() => twin().hover(id)}
      onMouseLeave={() => twin().hover(undefined)}
      className={cn("flex flex-col items-center gap-1 rounded-[8px] px-0.5 py-1 transition-colors hover:bg-white", selected && "bg-white ring-1 ring-luna")}
    >
      <TankGauge level={level.value} color={liquidColor[role]} low={role === "drain" ? undefined : level.low} warn={watch} width={30} height={52} />
      <span className="text-[9.5px] leading-none font-medium text-ink-2">{TANK_SHORT[id]}</span>
      <span className={cn("font-mono text-[9.5px] leading-none tabular", watch ? "text-[#b26b00]" : "text-faint")}>{days ? `${days} d` : `${formatNumber(level.value)}%`}</span>
    </button>
  );
}

const toneDot: Record<FeedEvent["tone"], string> = { info: "#3f7fd6", positive: "#2f9e5b", warning: "#e59b1a", critical: "#dc4a3d" };

function Feed() {
  const feed = useTwin((s) => s.sim.feed);
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force((n) => n + 1), 15_000);
    return () => clearInterval(t);
  }, []);
  if (!feed.length) return <div className="text-[12px] text-faint">Quiet so far.</div>;
  return (
    <ol className="relative flex flex-col">
      <span className="absolute top-2 bottom-2 left-[3.5px] w-px bg-line" />
      {feed.slice(0, 14).map((e) => (
        <li key={e.id} className="relative flex animate-rise gap-2.5 py-1.5">
          <span className="relative mt-[5px] size-2 shrink-0 rounded-full ring-2 ring-white" style={{ background: toneDot[e.tone] }} />
          <div className="min-w-0 flex-1 text-[12px] leading-[1.45] text-ink-2">
            {e.assetId ? <EntityChip id={e.assetId} size="sm" className="mr-1" /> : null}
            {e.text}
          </div>
          <span className="shrink-0 pt-0.5 font-mono text-[10px] text-faint">{formatAgo(e.at)}</span>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------------ */
/* Ask Luna                                                           */
/* ------------------------------------------------------------------ */

function AskLuna() {
  const chat = useTwin((s) => s.chat);
  const clearChat = useTwin((s) => s.clearChat);
  const alerts = useTwin((s) => s.sim.alerts);
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const last = chat[chat.length - 1];
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [chat.length, last?.shown]);
  const send = (text: string) => {
    const t = text.trim();
    if (!t) return;
    askLuna(t);
    setDraft("");
  };
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scroller} className="scroll-thin min-h-0 flex-1 overflow-y-auto px-4 pt-4 pb-3">
        {chat.length === 0 ? (
          <div>
            <div className="flex size-10 items-center justify-center rounded-[12px] bg-luna-soft ring-1 ring-[#f8dcb0] ring-inset">
              <LunaMark className="h-[18px] w-[22px]" />
            </div>
            <h2 className="mt-3 font-serif text-[28px] leading-[1.05] tracking-[-0.01em] text-ink">Ask about anything in the facility.</h2>
            <p className="mt-2 text-[12.5px] leading-[1.55] text-muted">Luna answers from the live twin — sensors, robots, batches and what the cameras see — and cites what it looked at. Tap a chip in any answer to fly there.</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {PRESETS.map((p) => (
                <button key={p.title} type="button" onClick={() => send(p.prompt)} className="flex flex-col items-start gap-0.5 rounded-[12px] bg-panel-2 px-3 py-2.5 text-left ring-1 ring-line transition ring-inset hover:bg-white hover:ring-line-2">
                  <span className="text-[12px] font-medium text-ink">{p.title}</span>
                  <span className="line-clamp-2 text-[11px] leading-[1.35] text-muted">{p.prompt}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
            {chat.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="ml-10 self-end rounded-[14px] rounded-br-[5px] bg-ink px-3 py-2 text-[12.5px] leading-[1.5] text-white">
                  {m.text}
                </div>
              ) : (
                <div key={m.id} className="flex gap-2.5">
                  <div className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-[8px] bg-luna-soft ring-1 ring-[#f8dcb0] ring-inset">
                    <LunaMark className="h-[10px] w-[12px]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    {m.text ? (
                      <div className="text-[12.5px] leading-[1.6] text-ink-2">
                        <RichText text={m.text} shown={m.shown} />
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 py-1 text-[12px] text-muted">
                        <span className="flex gap-0.5">
                          <span className="typing-dot size-1.5 rounded-full bg-luna" />
                          <span className="typing-dot size-1.5 rounded-full bg-luna" />
                          <span className="typing-dot size-1.5 rounded-full bg-luna" />
                        </span>
                        Reading the twin…
                      </div>
                    )}
                    {m.alertId && m.text && (m.shown ?? Infinity) >= textLength(m.text) ? <ChatAlert id={m.alertId} alerts={alerts} /> : null}
                  </div>
                </div>
              ),
            )}
          </div>
        )}
      </div>
      <div className="border-t border-line px-3 pt-2.5 pb-3">
        {chat.length ? (
          <div className="scroll-thin -mx-3 mb-2 flex gap-1.5 overflow-x-auto px-3 pb-1">
            {PRESETS.map((p) => (
              <button key={p.title} type="button" onClick={() => send(p.prompt)} className="h-6 shrink-0 rounded-full bg-panel-2 px-2.5 text-[11px] font-medium whitespace-nowrap text-ink-2 ring-1 ring-line transition ring-inset hover:bg-white hover:ring-line-2">
                {p.title}
              </button>
            ))}
          </div>
        ) : null}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            send(draft);
          }}
          className="flex items-center gap-2 rounded-[12px] bg-panel-2 py-1.5 pr-1.5 pl-3 ring-1 ring-line ring-inset focus-within:bg-white focus-within:ring-line-2"
        >
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Ask Luna about a batch, room, row or robot…"
            className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ink outline-none placeholder:text-faint"
            data-luna-input
          />
          {chat.length ? (
            <button type="button" title="Clear conversation" onClick={clearChat} className="flex size-7 items-center justify-center rounded-[8px] text-faint hover:bg-[#eef1f4] hover:text-ink">
              <RotateCcw className="size-3.5" />
            </button>
          ) : null}
          <button type="submit" disabled={!draft.trim()} className="flex size-7 items-center justify-center rounded-[8px] bg-ink text-white transition disabled:bg-[#cfd7df]">
            <ArrowUp className="size-4" />
          </button>
        </form>
      </div>
    </div>
  );
}

function ChatAlert({ id, alerts }: { id: string; alerts: Alert[] }) {
  const a = alerts.find((x) => x.id === id);
  if (!a) return null;
  return (
    <div className="mt-2.5 animate-rise">
      <AlertCard alert={a} compact />
    </div>
  );
}

function needsTitle(cards: { status: string }[]) {
  const open = cards.filter((c) => c.status === "OPEN").length;
  const verifying = cards.filter((c) => c.status === "RESOLVING").length;
  return `Needs you · ${open}${verifying ? ` · ${verifying} verifying` : ""}`;
}
