import type { LucideIcon } from "lucide-react";
import { Car, Zap } from "lucide-react";
import { useLive } from "@/lib/house-store";
import { cn } from "@/lib/utils";
import { SectionLabel } from "./ui";

function formatTodayKwh(v: number | null): string {
  return v == null ? "—" : `${v} kWh`;
}

/** Both driveway chargers — same labels as Site / Overview / Charge. */
export function VehiclesSection({ className }: { className?: string }) {
  const live = useLive();
  return (
    <section className={className}>
      <SectionLabel tone="umber">Vehicles</SectionLabel>
      <div className="grid gap-2.5 md:grid-cols-2">
        <VehicleCard
          icon={Zap}
          name="Zappi Charger"
          place="Driveway"
          status={live.zappiPlugged ? "Plugged in" : "Unplugged"}
          detail={
            live.zappiW > 30
              ? `${live.zappiW} W`
              : live.zappiMode === "—"
                ? undefined
                : live.zappiMode
          }
          todayKwh={live.zappiTodayKwh}
          live={live.zappiW > 30 || live.zappiPlugged}
          tone="terra"
        />
        <VehicleCard
          icon={Car}
          name="Range Rover"
          place="Driveway"
          status="Plug off"
          todayKwh={live.rangeRoverTodayKwh}
          tone="teal"
        />
      </div>
    </section>
  );
}

export function VehicleCard({
  icon: Icon,
  name,
  place,
  status,
  detail,
  todayKwh,
  live = false,
  tone = "teal",
}: {
  icon: LucideIcon;
  name: string;
  place: string;
  status: string;
  detail?: string;
  todayKwh?: number | null;
  live?: boolean;
  tone?: "teal" | "terra";
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-md border px-4 py-4 backdrop-blur-sm",
        tone === "terra"
          ? "border-terra/35 bg-gradient-to-br from-terra/[0.16] via-sand/30 to-white/55"
          : "border-teal/35 bg-gradient-to-br from-teal/[0.14] via-sand/25 to-white/55",
      )}
    >
      <span
        className={cn(
          "grid size-11 place-items-center rounded-md",
          live || tone === "terra" ? "bg-terra/15 text-terra" : "bg-teal/10 text-teal",
        )}
      >
        <Icon className="size-5" strokeWidth={1.7} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-medium">{name}</div>
        <div className="text-sm text-ink-soft">{place}</div>
        {todayKwh !== undefined ? (
          <div className="mt-0.5 text-sm text-ink-soft">Today {formatTodayKwh(todayKwh)}</div>
        ) : null}
      </div>
      <div className="text-right text-sm">
        <div className="font-medium">{status}</div>
        {detail ? <div className="text-ink-soft tabular-nums">{detail}</div> : null}
      </div>
    </div>
  );
}
