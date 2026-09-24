import type { LucideIcon } from "lucide-react";
import { BatteryMedium, Car, Home, PlugZap, Sun, Zap } from "lucide-react";
import { solarStatusHint } from "@/lib/house";
import { useHouse, useLive } from "@/lib/house-store";
import { cn } from "@/lib/utils";

const P = {
  solar: { x: 500, y: 100 },
  grid: { x: 140, y: 258 },
  battery: { x: 355, y: 392 },
  home: { x: 780, y: 190 },
  zappi: { x: 680, y: 430 },
  rangeRover: { x: 900, y: 430 },
} as const;

type Tone = "paper" | "glass";

export function EnergyFlow({ tone = "paper", bare = false }: { tone?: Tone; bare?: boolean }) {
  const live = useLive();
  const status = useHouse((s) => s.status);
  const map = useHouse((s) => s.map);
  const solarHint = solarStatusHint(status, live);
  const solar = live.solarNowW;
  const home = live.houseW;
  const batt = Math.abs(live.batteryW);
  const battOut = live.batteryW < -30;
  const battIn = live.batteryW > 30;
  const solarOn = solar > 30;
  const gridIn = live.gridW > 30;
  const gridOut = live.gridW < -30;
  const zappiOn = live.zappiW > 30;
  const roverOn = live.rangeRoverW > 30;
  const roverMapped = Boolean(map.rangeRoverW || map.rangeRoverSoc || map.rangeRoverPlugged);
  const glass = tone === "glass";
  const idle = glass ? "flow-idle stroke-sidebar-fg/35" : "flow-idle stroke-line";
  const badge = battOut ? "On battery" : solarOn && home > 0 ? "Solar" : "Idle";

  const roverValue = map.rangeRoverW
    ? `${live.rangeRoverW} W`
    : map.rangeRoverSoc
      ? `${live.rangeRoverSoc}%`
      : "—";
  const roverHint = !roverMapped
    ? status === "live"
      ? "no sensor"
      : "waiting"
    : roverOn
      ? "charging"
      : live.rangeRoverPlugged
        ? "plugged"
        : map.rangeRoverSoc
          ? "parked"
          : "waiting";

  return (
    <div
      className={cn(
        "relative",
        bare ? "h-full w-full" : "overflow-hidden rounded-lg border border-line bg-paper-raised",
      )}
    >
      {bare ? null : (
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div>
            <div className="text-xs font-medium uppercase tracking-widest text-ink-soft">
              Energy flow
            </div>
            <div className="mt-1 text-sm tabular-nums text-ink">
              {solar} W solar · {home} W home · {live.zappiW} W Zappi
              {map.rangeRoverW ? ` · ${live.rangeRoverW} W Rover` : ""}
            </div>
          </div>
          <div className="rounded-full border border-line bg-white/70 px-2.5 py-1 text-xs font-medium text-ink">
            {badge}
          </div>
        </div>
      )}

      <div className={cn("relative", bare ? "h-full" : "h-[28rem] md:h-[34rem]")}>
        <svg viewBox="0 0 1000 560" className="absolute inset-0 h-full w-full" aria-hidden>
          <defs>
            <marker
              id="flow-arrow-sand"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.2 L 9 5 L 0 8.8 Z" className="fill-sand" />
            </marker>
            <marker
              id="flow-arrow-teal"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.2 L 9 5 L 0 8.8 Z" className="fill-teal-soft" />
            </marker>
            <marker
              id="flow-arrow-terra"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.2 L 9 5 L 0 8.8 Z" className="fill-terra" />
            </marker>
            <marker
              id="flow-arrow-umber"
              viewBox="0 0 10 10"
              refX="9"
              refY="5"
              markerWidth="5"
              markerHeight="5"
              orient="auto-start-reverse"
            >
              <path d="M 0 1.2 L 9 5 L 0 8.8 Z" className="fill-umber" />
            </marker>
          </defs>

          <FlowPath
            d={q(P.solar, P.home, 700, 60)}
            active={solarOn}
            idle={idle}
            stroke="stroke-sand"
            fill="fill-sand"
            marker="url(#flow-arrow-sand)"
          />
          <FlowPath
            d={q(P.grid, P.home, 430, 150)}
            active={gridIn || gridOut}
            reverse={gridOut}
            idle={idle}
            stroke="stroke-teal-soft"
            fill="fill-teal-soft"
            marker={gridOut ? undefined : "url(#flow-arrow-teal)"}
            markerStart={gridOut ? "url(#flow-arrow-teal)" : undefined}
          />
          <FlowPath
            d={q(P.home, P.zappi, 720, 300)}
            active={zappiOn}
            idle={idle}
            stroke="stroke-umber"
            fill="fill-umber"
            marker="url(#flow-arrow-umber)"
          />
          <FlowPath
            d={q(P.home, P.rangeRover, 900, 280)}
            active={roverOn}
            idle={idle}
            stroke="stroke-umber"
            fill="fill-umber"
            marker="url(#flow-arrow-umber)"
          />
          <FlowPath
            d={q(P.solar, P.battery, 340, 220)}
            active={solarOn && battIn}
            idle={idle}
            stroke="stroke-sand"
            fill="fill-sand"
            marker="url(#flow-arrow-sand)"
          />
          <FlowPath
            d={q(P.battery, P.home, 540, 250)}
            active={battOut}
            idle={idle}
            stroke="stroke-terra"
            fill="fill-terra"
            marker="url(#flow-arrow-terra)"
          />
        </svg>

        {battOut ? (
          <span
            className={cn(
              "pointer-events-none absolute left-[54%] top-[44%] -translate-x-1/2 rounded-full px-2 py-0.5 text-xs font-medium tabular-nums shadow-sm",
              glass ? "bg-teal-deep/70 text-sand backdrop-blur-sm" : "bg-paper text-terra",
            )}
          >
            {batt} W
          </span>
        ) : null}

        <Node
          tone={tone}
          at="left-[50%] top-[18%]"
          icon={Sun}
          ring="border-sand"
          value={`${solar} W`}
          label="Solar"
          hint={solarHint}
          on={solarOn}
        />
        <Node
          tone={tone}
          at="left-[14%] top-[46%]"
          icon={Zap}
          ring="border-teal-soft"
          value={`${Math.abs(live.gridW)} W`}
          label="Grid"
          hint={gridOut ? "exporting" : gridIn ? "importing" : "balanced"}
          on={gridIn || gridOut}
        />
        <Node
          tone={tone}
          at="left-[35.5%] top-[70%]"
          icon={BatteryMedium}
          ring="border-terra"
          value={`${live.soc}%`}
          label="Battery"
          hint={battOut ? "discharging" : battIn ? "charging" : "idle"}
          on={battOut || battIn}
        />
        <Node
          tone={tone}
          at="left-[78%] top-[34%]"
          icon={Home}
          ring="border-teal"
          fill
          value={`${home} W`}
          label="Home"
          hint="live load"
          on={home > 30}
        />
        <Node
          tone={tone}
          at="left-[68%] top-[77%]"
          icon={PlugZap}
          ring="border-umber"
          value={`${live.zappiW} W`}
          label="Zappi"
          hint={
            zappiOn ? "charging" : live.zappiPlugged ? "plugged" : "waiting"
          }
          on={zappiOn}
        />
        <Node
          tone={tone}
          at="left-[90%] top-[77%]"
          icon={Car}
          ring="border-umber"
          value={roverValue}
          label="Range Rover"
          hint={roverHint}
          on={roverOn || live.rangeRoverPlugged}
        />
      </div>
    </div>
  );
}

function FlowPath({
  d,
  active,
  reverse = false,
  idle,
  stroke,
  fill,
  marker,
  markerStart,
}: {
  d: string;
  active: boolean;
  reverse?: boolean;
  idle: string;
  stroke: string;
  fill: string;
  marker?: string;
  markerStart?: string;
}) {
  return (
    <g>
      <path
        d={d}
        className={cn(
          "flow-line",
          active
            ? cn("flow-active", reverse && "flow-active-rev", stroke)
            : idle,
        )}
        markerEnd={active && marker ? marker : undefined}
        markerStart={active && markerStart ? markerStart : undefined}
      />
      {active ? (
        <>
          <circle r="4" className={cn("flow-particle", fill)}>
            <animateMotion
              dur="1.05s"
              repeatCount="indefinite"
              path={d}
              keyPoints={reverse ? "1;0" : "0;1"}
              keyTimes="0;1"
              calcMode="linear"
            />
          </circle>
          <circle r="2.6" className={cn("flow-particle flow-particle-soft", fill)}>
            <animateMotion
              dur="1.05s"
              begin="0.38s"
              repeatCount="indefinite"
              path={d}
              keyPoints={reverse ? "1;0" : "0;1"}
              keyTimes="0;1"
              calcMode="linear"
            />
          </circle>
        </>
      ) : null}
    </g>
  );
}

function q(a: { x: number; y: number }, b: { x: number; y: number }, cx: number, cy: number) {
  return `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`;
}

function Node({
  at,
  icon: Icon,
  ring,
  fill = false,
  value,
  label,
  hint,
  on,
  tone,
}: {
  at: string;
  icon: LucideIcon;
  ring: string;
  fill?: boolean;
  value: string;
  label: string;
  hint: string;
  on: boolean;
  tone: Tone;
}) {
  const glass = tone === "glass";
  return (
    <div className={cn("absolute -translate-x-1/2 -translate-y-1/2", at)}>
      <div className="relative">
        <div
          className={cn(
            "grid size-[4.75rem] place-items-center rounded-full border-[3px] md:size-24",
            ring,
            fill
              ? "bg-teal text-paper"
              : glass
                ? "bg-teal-deep/55 text-sidebar-fg backdrop-blur-md"
                : "bg-paper-raised text-ink",
            on && !fill ? "shadow-[0_0_0_6px_rgb(174_89_60_/_0.18)]" : "",
          )}
        >
          <div>
            <Icon className="mx-auto size-4 opacity-80" strokeWidth={1.7} />
            <div className="mt-0.5 text-sm font-medium tabular-nums leading-none md:text-lg">
              {value}
            </div>
          </div>
        </div>
        <div
          className={cn(
            "absolute left-1/2 top-full mt-2 w-28 -translate-x-1/2 text-center",
            glass ? "text-sidebar-fg" : "text-ink",
          )}
        >
          <div className="text-xs font-medium tracking-wide">{label}</div>
          <div className={cn("text-xs", glass ? "text-sidebar-fg/65" : "text-ink-soft")}>
            {hint}
          </div>
        </div>
      </div>
    </div>
  );
}
