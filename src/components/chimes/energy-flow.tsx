import type { LucideIcon } from "lucide-react";
import { BatteryMedium, Car, Home, Sun, Zap } from "lucide-react";
import { solarStatusHint } from "@/lib/house";
import { useHouse, useLive } from "@/lib/house-store";
import { cn } from "@/lib/utils";

/**
 * Energy page node positions (SVG viewBox 1000×560).
 * Overview does not persist per-node placement — only the glass tile box
 * (`chimes.overview.flow`). Driveway layout matches the house photo / Site
 * scene: Range Rover on the left bay, Zappi (driveway charger) on the right.
 */
const P = {
  solar: { x: 500, y: 100 },
  grid: { x: 140, y: 258 },
  battery: { x: 355, y: 392 },
  home: { x: 800, y: 202 },
  /** Left driveway bay — Range Rover (was off / front-garden). */
  rangeRover: { x: 700, y: 430 },
  /** Right driveway bay — Zappi / Cupra charger side. */
  zappi: { x: 900, y: 430 },
} as const;

/**
 * Ambient glass nodes, in the same 1000×580 space FitFlow scales into the tile.
 * Centres match the path endpoints so the larger discs still meet the lines.
 * Bottom row sits high enough that names + status lines stay inside the canvas.
 */
const GLASS_CANVAS = { w: 1000, h: 580 } as const;

const G = {
  solar: { x: 500, y: 104 },
  grid: { x: 145, y: 268 },
  battery: { x: 355, y: 400 },
  home: { x: 785, y: 180 },
  rangeRover: { x: 688, y: 418 },
  zappi: { x: 888, y: 418 },
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
  const idle = glass ? "flow-idle stroke-sidebar-fg/45" : "flow-idle stroke-teal-soft/55";
  const badge = battOut ? "On battery" : solarOn && home > 0 ? "Solar" : "Idle";

  const roverValue = map.rangeRoverW
    ? `${live.rangeRoverW} W`
    : map.rangeRoverSoc
      ? `${live.rangeRoverSoc}%`
      : "—";
  const roverHint = !roverMapped
    ? status === "live"
      ? "no sensor"
      : "driveway"
    : roverOn
      ? "charging"
      : map.rangeRoverPlugged
        ? live.rangeRoverPlugged
          ? "plugged"
          : "unplugged"
        : map.rangeRoverSoc
          ? "parked"
          : "driveway";

  return (
    <div
      className={cn(
        "relative",
        bare
          ? "h-full w-full"
          : "overflow-hidden rounded-lg border border-teal/25 bg-gradient-to-br from-sand/55 via-paper-raised to-teal/[0.1] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.55)]",
      )}
    >
      {bare ? null : (
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div>
            <div className="text-xs font-medium uppercase tracking-widest text-teal">
              Energy flow
            </div>
            <div className="mt-1 text-sm tabular-nums text-ink">
              {solar} W solar · {home} W home · {live.zappiW} W Zappi
              {map.rangeRoverW ? ` · ${live.rangeRoverW} W Rover` : ""}
            </div>
          </div>
          <div className="rounded-full border border-teal/25 bg-teal/10 px-2.5 py-1 text-xs font-medium text-teal">
            {badge}
          </div>
        </div>
      )}

      <div className={cn("relative", bare ? "h-full" : "h-[28rem] md:h-[34rem]")}>
        <svg
          viewBox={glass ? `0 0 ${GLASS_CANVAS.w} ${GLASS_CANVAS.h}` : "0 0 1000 560"}
          preserveAspectRatio={glass ? "none" : undefined}
          className="absolute inset-0 h-full w-full"
          aria-hidden
        >
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
            d={glass ? q(G.solar, G.home, 690, 58) : q(P.solar, P.home, 700, 60)}
            active={solarOn}
            idle={idle}
            stroke="stroke-sand"
            fill="fill-sand"
            marker="url(#flow-arrow-sand)"
          />
          <FlowPath
            d={glass ? q(G.grid, G.home, 440, 148) : q(P.grid, P.home, 430, 150)}
            active={gridIn || gridOut}
            reverse={gridOut}
            idle={idle}
            stroke="stroke-teal-soft"
            fill="fill-teal-soft"
            marker={gridOut ? undefined : "url(#flow-arrow-teal)"}
            markerStart={gridOut ? "url(#flow-arrow-teal)" : undefined}
          />
          <FlowPath
            d={glass ? q(G.home, G.rangeRover, 760, 308) : q(P.home, P.rangeRover, 780, 320)}
            active={roverOn}
            idle={idle}
            stroke="stroke-umber"
            fill="fill-umber"
            marker="url(#flow-arrow-umber)"
          />
          <FlowPath
            d={glass ? q(G.home, G.zappi, 910, 286) : q(P.home, P.zappi, 920, 300)}
            active={zappiOn}
            idle={idle}
            stroke="stroke-umber"
            fill="fill-umber"
            marker="url(#flow-arrow-umber)"
          />
          <FlowPath
            d={glass ? q(G.solar, G.battery, 340, 218) : q(P.solar, P.battery, 340, 220)}
            active={solarOn && battIn}
            idle={idle}
            stroke="stroke-sand"
            fill="fill-sand"
            marker="url(#flow-arrow-sand)"
          />
          <FlowPath
            d={glass ? q(G.battery, G.home, 555, 248) : q(P.battery, P.home, 540, 250)}
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
              "pointer-events-none absolute -translate-x-1/2 rounded-full font-medium tabular-nums shadow-sm",
              glass
                ? "left-[56.5%] top-[46%] bg-teal-deep/70 px-3 py-1 text-base text-sand backdrop-blur-sm"
                : "left-[54%] top-[44%] bg-paper px-2 py-0.5 text-xs text-terra",
            )}
          >
            {batt} W
          </span>
        ) : null}

        <Node
          tone={tone}
          at="left-[50%] top-[18%]"
          pos={glass ? G.solar : undefined}
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
          pos={glass ? G.grid : undefined}
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
          pos={glass ? G.battery : undefined}
          icon={BatteryMedium}
          ring="border-terra"
          value={`${live.soc}%`}
          label="Battery"
          hint={battOut ? "discharging" : battIn ? "charging" : "idle"}
          on={battOut || battIn}
        />
        <Node
          tone={tone}
          at="left-[78%] top-[32%]"
          pos={glass ? G.home : undefined}
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
          at="left-[70%] top-[77%]"
          pos={glass ? G.rangeRover : undefined}
          icon={Car}
          ring="border-umber"
          value={roverValue}
          label="Range Rover"
          hint={roverHint}
          on={roverOn || live.rangeRoverPlugged}
        />
        <Node
          tone={tone}
          at="left-[90%] top-[77%]"
          pos={glass ? G.zappi : undefined}
          icon={Zap}
          ring="border-umber"
          value={`${live.zappiW} W`}
          label="Zappi"
          hint={zappiOn ? "charging" : live.zappiPlugged ? "plugged in" : "driveway"}
          on={zappiOn}
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
          active ? cn("flow-active", reverse && "flow-active-rev", stroke) : idle,
        )}
        markerEnd={active && marker ? marker : undefined}
        markerStart={active && markerStart ? markerStart : undefined}
      />
      {active ? (
        <>
          <circle r="5" className={cn("flow-particle", fill)}>
            <animateMotion
              dur="0.9s"
              repeatCount="indefinite"
              path={d}
              keyPoints={reverse ? "1;0" : "0;1"}
              keyTimes="0;1"
              calcMode="linear"
            />
          </circle>
          <circle r="3.2" className={cn("flow-particle flow-particle-soft", fill)}>
            <animateMotion
              dur="0.9s"
              begin="0.3s"
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
  pos,
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
  /** Glass overview centre, in the 1000×580 FitFlow canvas. Paper keeps `at`. */
  pos?: { x: number; y: number };
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
    <div
      className={cn("absolute -translate-x-1/2 -translate-y-1/2", pos ? undefined : at)}
      style={
        pos
          ? {
              left: `${(pos.x / GLASS_CANVAS.w) * 100}%`,
              top: `${(pos.y / GLASS_CANVAS.h) * 100}%`,
            }
          : undefined
      }
    >
      <div className="relative">
        <div
          className={cn(
            "grid place-items-center rounded-full",
            // Glass discs ~1.5× the previous size-24 / size-28 badges.
            glass
              ? "size-[9rem] border-4 md:size-[10.5rem]"
              : "size-[4.75rem] border-[3px] md:size-24",
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
            <Icon
              className={cn(
                "mx-auto opacity-80",
                // 2rem is 1.6× the previous glass size-5 glyph.
                glass ? "size-8" : "size-4",
              )}
              strokeWidth={1.7}
            />
            <div
              className={cn(
                "mt-0.5 font-medium tabular-nums leading-none",
                // ~1.35× previous glass text-lg / text-xl power figures.
                glass
                  ? "text-center text-[1.52rem] whitespace-nowrap md:text-[1.6875rem]"
                  : "text-sm md:text-lg",
              )}
            >
              {value}
            </div>
          </div>
        </div>
        <div
          className={cn(
            "absolute left-1/2 top-full -translate-x-1/2 text-center",
            glass ? "mt-1.5 w-max whitespace-nowrap text-sidebar-fg" : "mt-2 w-28 text-ink",
          )}
        >
          <div
            className={cn(
              "tracking-wide",
              // ~1.35× previous glass text-base / text-lg names.
              glass
                ? "text-[1.35rem] font-bold leading-none md:text-[1.575rem]"
                : "text-xs font-medium",
            )}
          >
            {label}
          </div>
          <div
            className={cn(
              glass
                ? "mt-0.5 text-[1.2rem] leading-none text-sidebar-fg/70"
                : "text-xs text-ink-soft",
            )}
          >
            {hint}
          </div>
        </div>
      </div>
    </div>
  );
}
