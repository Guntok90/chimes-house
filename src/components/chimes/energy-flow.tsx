import type { LucideIcon } from "lucide-react";
import { BatteryMedium, Car, Home, Sun, Zap } from "lucide-react";
import { solarStatusHint } from "@/lib/house";
import { useHouse, useLive } from "@/lib/house-store";
import { cn } from "@/lib/utils";

const P = {
  solar: { x: 500, y: 100 },
  grid: { x: 140, y: 258 },
  battery: { x: 355, y: 392 },
  home: { x: 800, y: 202 },
  zappi: { x: 700, y: 410 },
  rover: { x: 900, y: 410 },
} as const;

type Tone = "paper" | "glass";

export function EnergyFlow({ tone = "paper", bare = false }: { tone?: Tone; bare?: boolean }) {
  const live = useLive();
  const status = useHouse((s) => s.status);
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
  const glass = tone === "glass";
  const idle = glass ? "flow-idle stroke-sidebar-fg/40" : "flow-idle stroke-teal-soft/45";
  const badge = battOut ? "On battery" : solarOn && home > 0 ? "Solar" : "Idle";

  return (
    <div
      className={cn(
        "relative",
        bare
          ? "h-full w-full"
          : "overflow-hidden rounded-lg border border-teal/20 bg-gradient-to-br from-sand/35 via-paper-raised to-teal/[0.06] shadow-[inset_0_1px_0_rgb(255_255_255_/_0.55)]",
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
            </div>
          </div>
          <div className="rounded-full border border-teal/25 bg-teal/10 px-2.5 py-1 text-xs font-medium text-teal">
            {badge}
          </div>
        </div>
      )}

      <div className={cn("relative", bare ? "h-full" : "h-[30rem] md:h-[36rem]")}>
        <svg viewBox="0 0 1000 580" className="absolute inset-0 h-full w-full" aria-hidden>
          <path
            d={q(P.solar, P.home, 700, 60)}
            className={cn("flow-line", solarOn ? "flow-active stroke-sand" : idle)}
          />
          <path
            d={q(P.grid, P.home, 430, 150)}
            className={cn("flow-line", gridIn || gridOut ? "flow-active stroke-teal-soft" : idle)}
          />
          <path
            d={q(P.home, P.zappi, 720, 300)}
            className={cn("flow-line", zappiOn ? "flow-active stroke-terra" : idle)}
          />
          <path
            d={q(P.home, P.rover, 920, 300)}
            className={cn("flow-line", idle)}
          />
          <path
            d={q(P.solar, P.battery, 340, 220)}
            className={cn("flow-line", solarOn && battIn ? "flow-active stroke-sand" : idle)}
          />
          <path
            d={q(P.battery, P.home, 540, 250)}
            className={cn("flow-line", battOut ? "flow-active stroke-terra" : idle)}
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
          at="left-[80%] top-[36%]"
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
          at="left-[70%] top-[73%]"
          icon={Zap}
          ring="border-terra"
          value={`${live.zappiW} W`}
          label="Zappi"
          hint={zappiOn ? "charging" : live.zappiPlugged ? "plugged in" : "driveway"}
          on={zappiOn || live.zappiPlugged}
        />
        <Node
          tone={tone}
          at="left-[90%] top-[73%]"
          icon={Car}
          ring="border-umber"
          value="—"
          label="Range Rover"
          hint="front garden"
          on={false}
        />
      </div>
    </div>
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
                : "bg-paper-raised/90 text-ink backdrop-blur-sm",
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
