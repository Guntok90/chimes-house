import { useEffect, useMemo, useState } from "react";
import {
  BatteryMedium,
  Box,
  Car,
  Fish,
  History,
  Home,
  House,
  Lamp,
  Leaf,
  Lightbulb,
  Plug,
  Sun,
  Tv,
  Waves,
  Maximize2,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { HOURS } from "@/lib/house";
import { groupSwitchesByArea, SPARES_AREA, type AreaSwitch } from "@/lib/ha";
import { useHouse, useLive } from "@/lib/house-store";
import { BatteryView } from "./battery-view";
import { ChargeView } from "./charge-view";
import { DayAllChart, dayChartLegendColors } from "./charts";
import { EnergyView } from "./energy-view";
import { HistoryView } from "./history-view";
import { NoHistoryYet } from "./no-history";
import { Overview } from "./overview";
import { SiteView } from "./site-view";
import { PiSetup } from "./pi-setup";
import { Metric, PageTitle, Room, SectionLabel, Surface, Tile } from "./ui";

type View = "home" | "energy" | "site" | "battery" | "charge" | "history" | "garden" | "house";

const NAV: { id: View; label: string; icon: typeof Home }[] = [
  { id: "home", label: "Home", icon: Home },
  { id: "energy", label: "Energy", icon: Zap },
  { id: "site", label: "Site", icon: Box },
  { id: "battery", label: "Battery", icon: BatteryMedium },
  { id: "charge", label: "Charge", icon: Car },
  { id: "history", label: "History", icon: History },
  { id: "garden", label: "Garden", icon: Leaf },
  { id: "house", label: "House", icon: House },
];

export function ChimesDashboard() {
  const [view, setView] = useState<View>("home");
  const [overview, setOverview] = useState(false);
  const on = useHouse((s) => s.switches);
  const toggle = useHouse((s) => s.toggle);
  const boot = useHouse((s) => s.boot);

  useEffect(() => {
    boot();
  }, [boot]);

  return (
    <div className="flex h-dvh overflow-hidden bg-paper text-ink">
      <aside className="sidebar-wash relative z-30 hidden w-72 shrink-0 flex-col gap-5 overflow-auto p-7 text-sidebar-fg md:flex">
        <div className="flex items-start justify-between gap-3">
          <Brand />
          <OverviewButton onClick={() => setOverview(true)} />
        </div>
        <Clock />
        <p className="text-sm text-sidebar-fg/80">
          <Greeting />
        </p>
        <button
          type="button"
          onPointerDown={(event) => {
            if (event.button === 0) setView("battery");
          }}
          onClick={() => setView("battery")}
          className="text-left"
        >
          <BatteryCard />
        </button>
        <div className="rounded-md border border-sidebar-fg/15 bg-sidebar-fg/10 px-3.5 py-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-widest text-sidebar-fg/55">
            Status
          </p>
          <StatusChips />
        </div>
        <nav className="flex flex-col gap-1.5">
          {NAV.map((item) => (
            <NavButton
              key={item.id}
              active={view === item.id}
              icon={item.icon}
              label={item.label}
              onClick={() => setView(item.id)}
            />
          ))}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 px-5 py-4 md:hidden">
          <Brand compact />
          <div className="flex items-center gap-2">
            <Clock compact />
            <OverviewButton onClick={() => setOverview(true)} compact />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-auto px-5 pb-32 pt-2 md:px-8 md:pb-12 md:pt-7">
          {view === "home" && <HomeView />}
          {view === "energy" && <EnergyView />}
          {view === "site" && <SiteView />}
          {view === "battery" && <BatteryView />}
          {view === "charge" && <ChargeView />}
          {view === "history" && <HistoryView />}
          {view === "garden" && <GardenView on={on} toggle={toggle} />}
          {view === "house" && <HouseView on={on} toggle={toggle} />}
        </main>

        <nav className="fixed inset-x-0 bottom-0 z-30 flex overflow-x-auto border-t border-line bg-paper/95 px-1 py-2 backdrop-blur-sm md:hidden">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              onPointerDown={(event) => {
                if (event.button === 0) setView(item.id);
              }}
              onClick={() => setView(item.id)}
              className={cn(
                "flex min-h-11 min-w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-sm text-xs",
                view === item.id ? "text-teal" : "text-ink-soft",
              )}
            >
              <item.icon className="size-5" strokeWidth={1.7} />
              {item.label}
            </button>
          ))}
        </nav>
      </div>
      {overview ? <Overview onClose={() => setOverview(false)} /> : null}
    </div>
  );
}

function OverviewButton({ onClick, compact = false }: { onClick: () => void; compact?: boolean }) {
  return (
    <button
      type="button"
      aria-label="Overview"
      onPointerDown={(event) => {
        if (event.button === 0) onClick();
      }}
      onClick={onClick}
      className={cn(
        "grid shrink-0 place-items-center rounded-md border",
        compact
          ? "size-10 border-line bg-paper-deep text-teal"
          : "size-11 border-sidebar-fg/20 bg-sidebar-fg/10 text-sidebar-fg",
      )}
    >
      <Maximize2 className={compact ? "size-4" : "size-5"} strokeWidth={1.7} />
    </button>
  );
}

function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <img
        src="/brand/mark.png"
        alt=""
        className={cn("object-contain", compact ? "size-8" : "size-10")}
      />
      <div>
        <div className="text-lg font-semibold tracking-tight">Chimes</div>
        {!compact && (
          <div className="text-xs uppercase tracking-widest text-sidebar-fg/60">House</div>
        )}
      </div>
    </div>
  );
}

function Clock({ compact = false }: { compact?: boolean }) {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const time = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(now);
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(now);
  if (compact) {
    return <div className="text-base font-medium tabular-nums">{time}</div>;
  }
  return (
    <div>
      <div className="text-4xl font-medium tracking-tight tabular-nums leading-none">{time}</div>
      <div className="mt-2 text-sm text-sidebar-fg/70">{date}</div>
    </div>
  );
}

function Greeting() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(id);
  }, []);
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/London",
      hour: "numeric",
      hour12: false,
    }).format(now),
  );
  if (hour < 12) return "Good morning.";
  if (hour < 18) return "Good afternoon.";
  return "Good evening.";
}

function StatusChips() {
  const live = useLive();
  const status = useHouse((s) => s.status);
  const error = useHouse((s) => s.error);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5">
        <span className="rounded-full bg-sand/25 px-2 py-1 text-xs uppercase tracking-wide text-sidebar-fg">
          {status === "live"
            ? "Live"
            : status === "connecting"
              ? "Connecting"
              : status === "error"
                ? "Error"
                : "Demo"}
        </span>
        <span className="rounded-full bg-sidebar-fg/12 px-2 py-1 text-xs uppercase tracking-wide text-sidebar-fg/80">
          {live.offPeak ? "Off-peak" : "Peak"}
        </span>
        <span className="rounded-full bg-sidebar-fg/12 px-2 py-1 text-xs uppercase tracking-wide text-sidebar-fg/80">
          Zappi {live.zappiMode}
        </span>
      </div>
      {status === "error" && error ? (
        <p className="text-xs leading-snug text-sidebar-fg/80">{error}</p>
      ) : null}
    </div>
  );
}

function BatteryCard() {
  const live = useLive();
  const discharging = live.batteryW < 0;
  const dash = Math.round((live.soc / 100) * 94);
  return (
    <div className="grid grid-cols-[56px_1fr] items-center gap-3 rounded-md border border-sidebar-fg/15 bg-sidebar-fg/10 px-3.5 py-3">
      <svg viewBox="0 0 36 36" className="size-14">
        <circle
          cx="18"
          cy="18"
          r="15"
          fill="none"
          className="stroke-sidebar-fg/15"
          strokeWidth="3"
        />
        <circle
          cx="18"
          cy="18"
          r="15"
          fill="none"
          className="stroke-sand"
          strokeWidth="3"
          strokeLinecap="round"
          strokeDasharray={`${dash} 100`}
          transform="rotate(-90 18 18)"
        />
      </svg>
      <div>
        <div className="text-xs uppercase tracking-widest text-sidebar-fg/55">Battery</div>
        <div className="text-lg font-medium tabular-nums">{live.soc}%</div>
        <div className="text-sm text-sidebar-fg/65">
          {discharging ? "Discharging" : live.batteryW > 30 ? "Charging" : "Idle"} ·{" "}
          {Math.abs(live.batteryW)} W
        </div>
      </div>
    </div>
  );
}

function NavButton({
  active,
  icon: Icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: typeof Home;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onPointerDown={(event) => {
        if (event.button === 0) onClick();
      }}
      onClick={onClick}
      className={cn(
        "flex min-h-11 items-center gap-2.5 rounded-sm px-3 text-left text-sm transition-colors duration-150",
        active ? "bg-sidebar-fg/14 text-white" : "text-sidebar-fg/75 hover:bg-sidebar-fg/10",
      )}
    >
      <Icon className="size-4 opacity-85" strokeWidth={1.7} />
      {label}
    </button>
  );
}

function HomeView() {
  const live = useLive();
  const status = useHouse((s) => s.status);
  const historyStatus = useHouse((s) => s.historyStatus);
  const historyHours = useHouse((s) => s.historyHours);
  const areaSwitches = useHouse((s) => s.areaSwitches);
  const toggleEntity = useHouse((s) => s.toggleEntity);

  const liveMode = status === "live";
  const graphData = liveMode ? historyHours : HOURS;
  const graphReady = !liveMode || (historyStatus === "ready" && graphData.length > 0);
  const legend = dayChartLegendColors("paper");

  const groups = useMemo(() => groupSwitchesByArea(areaSwitches), [areaSwitches]);

  return (
    <div className="space-y-8">
      <PageTitle>Home</PageTitle>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-3">
        <Metric accent label="Solar today" value={`${live.solarTodayKwh} kWh`} />
        <Metric label="Battery" value={`${live.soc}%`} hint={`${Math.abs(live.batteryW)} W out`} />
        <Metric label="House" value={`${live.houseW} W`} />
      </div>

      <section>
        <SectionLabel>Last 24 hours</SectionLabel>
        {graphReady ? (
          <Surface className="h-72 p-3">
            <div className="flex h-full flex-col">
              <div className="min-h-0 flex-1">
                <DayAllChart data={graphData} theme="paper" />
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-xs text-ink-soft">
                <ChartKey color={legend.solar} label="Solar" />
                <ChartKey color={legend.house} label="House" />
                <ChartKey color={legend.battery} label="Battery" />
                <ChartKey color={legend.grid} label="Grid" />
                <ChartKey color={legend.soc} label="SOC" dashed />
              </div>
            </div>
          </Surface>
        ) : (
          <NoHistoryYet label={historyStatus === "loading" ? "24h graph (loading)" : "24h graph"} />
        )}
      </section>

      {groups.map(({ area, items }) => (
        <Room key={area} title={area}>
          {items.map((sw) => (
            <Tile
              key={sw.entityId}
              id={sw.entityId}
              label={sw.label}
              state={sw.on}
              onToggle={toggleEntity}
              icon={iconForSwitch(sw)}
              available={sw.available}
            />
          ))}
        </Room>
      ))}

      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-widest text-ink-soft">
          People
        </h2>
        <div className="flex max-w-sm items-center gap-3 rounded-md border border-line bg-white/60 px-3 py-3">
          <div className="grid size-9 place-items-center rounded-full bg-teal text-sm font-semibold text-paper">
            SW
          </div>
          <div>
            <div className="font-medium">Stevie</div>
            <div className="text-sm text-ink-soft">{live.stevieHome ? "Home" : "Away"}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChartKey({
  color,
  label,
  dashed = false,
}: {
  color: string;
  label: string;
  dashed?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="h-px w-3.5"
        style={{ borderTop: `${dashed ? "1.5px dashed" : "2px solid"} ${color}` }}
      />
      {label}
    </span>
  );
}

function iconForSwitch(sw: AreaSwitch): LucideIcon {
  const blob = `${sw.label} ${sw.entityId} ${sw.area}`.toLowerCase();
  if (blob.includes("pond") || blob.includes("wave")) return Waves;
  if (blob.includes("pergola") || blob.includes("garden")) return Sun;
  if (blob.includes("fish") || blob.includes("aquarium")) return Fish;
  if (blob.includes("telly") || blob.includes("tv") || blob.includes("television")) return Tv;
  if (blob.includes("lamp")) return Lamp;
  if (blob.includes("kitchen") || blob.includes("light")) return Lightbulb;
  if (sw.area === SPARES_AREA || blob.includes("spare") || blob.includes("plug")) return Plug;
  if (sw.entityId.startsWith("light.")) return Lightbulb;
  return Plug;
}

function GardenView({ on, toggle }: { on: Record<string, boolean>; toggle: (id: string) => void }) {
  const status = useHouse((s) => s.status);
  const map = useHouse((s) => s.map);
  const mapped = (id: string) => status !== "live" || Boolean(map[id as keyof typeof map]);
  return (
    <div className="space-y-8">
      <PageTitle>Garden</PageTitle>
      <Room title="Back garden">
        <Tile
          id="pergola"
          label="Pergola"
          state={on.pergola}
          onToggle={toggle}
          icon={Sun}
          available={mapped("pergola")}
        />
        <Tile
          id="pond-1"
          label="Pond 1"
          state={on["pond-1"]}
          onToggle={toggle}
          icon={Waves}
          available={mapped("pond-1")}
        />
        <Tile
          id="pond-2"
          label="Pond 2"
          state={on["pond-2"]}
          onToggle={toggle}
          icon={Waves}
          available={mapped("pond-2")}
        />
      </Room>
    </div>
  );
}

function HouseView({ on, toggle }: { on: Record<string, boolean>; toggle: (id: string) => void }) {
  const status = useHouse((s) => s.status);
  const map = useHouse((s) => s.map);
  const mapped = (id: string) => status !== "live" || Boolean(map[id as keyof typeof map]);
  return (
    <div className="space-y-8">
      <PageTitle>House</PageTitle>
      <PiSetup />
      <Room title="Lights">
        <Tile
          id="lamp"
          label="Lamp"
          state={on.lamp}
          onToggle={toggle}
          icon={Lamp}
          available={mapped("lamp")}
        />
        <Tile
          id="kitchen"
          label="Kitchen"
          state={on.kitchen}
          onToggle={toggle}
          icon={Lightbulb}
          available={mapped("kitchen")}
        />
        <Tile
          id="pergola"
          label="Pergola"
          state={on.pergola}
          onToggle={toggle}
          icon={Sun}
          available={mapped("pergola")}
        />
      </Room>
      <Room title="Plugs">
        <Tile
          id="telly"
          label="Telly"
          state={on.telly}
          onToggle={toggle}
          icon={Tv}
          available={mapped("telly")}
        />
        <Tile
          id="fish"
          label="Fish"
          state={on.fish}
          onToggle={toggle}
          icon={Fish}
          available={mapped("fish")}
        />
        <Tile
          id="stevie-blanket"
          label="Stevie’s blanket"
          state={on["stevie-blanket"]}
          onToggle={toggle}
          icon={Sun}
          available={mapped("stevie-blanket")}
        />
        <Tile
          id="baby-blanket"
          label="Baby’s blanket"
          state={on["baby-blanket"]}
          onToggle={toggle}
          icon={Sun}
          available={mapped("baby-blanket")}
        />
      </Room>
    </div>
  );
}
