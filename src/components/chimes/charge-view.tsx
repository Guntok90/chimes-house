import { Car, PlugZap, Zap } from "lucide-react";
import { WEEK } from "@/lib/house";
import { useLive } from "@/lib/house-store";
import { Metric, PageTitle, Row, SectionLabel, Surface } from "./ui";
import { cn } from "@/lib/utils";

export function ChargeView() {
  const live = useLive();
  const today = WEEK[WEEK.length - 1];
  return (
    <div className="space-y-8">
      <PageTitle>Charge</PageTitle>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Metric accent label="Zappi" value="Eco+" hint={live.zappiPlugged ? "Plugged in" : "Waiting"} />
        <Metric label="Intelligent" value={live.intelligent ? "Ready" : "Off"} hint="Octopus" />
        <Metric
          label="Window"
          value={live.offPeak ? "Off-peak" : "Peak"}
          hint="Cheap rate"
        />
        <Metric label="Session" value="0.00 kWh" hint="No charge running" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionLabel>Zappi · Chimes</SectionLabel>
          <Surface className="p-5">
            <div className="mb-5 flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-md bg-teal/10 text-teal">
                <Zap className="size-5" strokeWidth={1.7} />
              </span>
              <div>
                <div className="font-medium">Driveway charger</div>
                <div className="text-sm text-ink-soft">Eco+ · surplus then off-peak</div>
              </div>
            </div>
            <div className="px-1">
              <Row label="Mode" value="Eco+" />
              <Row label="Plug" value={live.zappiPlugged ? "Connected" : "Unplugged"} />
              <Row label="Charge" value="Idle" />
              <Row label="House CT" value={`${live.houseW} W`} />
              <Row label="Grid CT" value={`${live.gridW} W`} />
              <Row label="Generation" value={`${live.solarNowW + Math.max(0, -live.batteryW)} W`} />
            </div>
          </Surface>
        </section>

        <section>
          <SectionLabel>How Eco+ behaves</SectionLabel>
          <Surface className="space-y-4 p-5 text-sm leading-relaxed text-ink-soft">
            <p>
              Uses spare solar first. If there isn’t enough, it waits. Off-peak it can finish a
              charge on cheap rate.
            </p>
            <ol className="space-y-3">
              <Step n="1" title="Surplus" body="Export would go to the car instead." />
              <Step n="2" title="Off-peak" body="Intelligent may start a cheap top-up." />
              <Step n="3" title="Hold" body="Peak hours stay idle unless you force it." />
            </ol>
          </Surface>
        </section>
      </div>

      <section>
        <SectionLabel>Vehicles</SectionLabel>
        <div className="grid gap-2.5 md:grid-cols-2">
          <VehicleCard
            icon={Zap}
            name="Zappi"
            place="Driveway"
            status={live.zappiPlugged ? "Plugged in" : "Unplugged"}
            live
          />
          <VehicleCard
            icon={Car}
            name="Range Rover"
            place="Front garden"
            status="Plug off"
          />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionLabel>Octopus Intelligent</SectionLabel>
          <Surface className="px-5">
            <Row label="Dispatch" value={live.intelligent ? "Armed" : "Off"} />
            <Row label="Off-peak" value={live.offPeak ? "Yes" : "No"} />
            <Row label="Today import" value={`${today.gridIn} kWh`} />
            <Row label="Today cost" value={`£${today.cost.toFixed(2)}`} />
          </Surface>
        </section>
        <section>
          <SectionLabel>House rules</SectionLabel>
          <Surface className="p-5 text-sm leading-relaxed text-ink-soft">
            <p>
              Cars and the battery charge on cheap rate. That schedule is already running — this
              page only shows it.
            </p>
            <div className="mt-4 flex items-center gap-2 text-ink">
              <PlugZap className="size-4 text-teal" strokeWidth={1.7} />
              <span className="font-medium">Off-peak charge is on</span>
            </div>
          </Surface>
        </section>
      </div>
    </div>
  );
}

function Step({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <li className="flex gap-3">
      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-teal text-xs font-medium text-paper">
        {n}
      </span>
      <span>
        <span className="block font-medium text-ink">{title}</span>
        {body}
      </span>
    </li>
  );
}

function VehicleCard({
  icon: Icon,
  name,
  place,
  status,
  live = false,
}: {
  icon: typeof Car;
  name: string;
  place: string;
  status: string;
  live?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-line bg-white/60 px-4 py-4">
      <span
        className={cn(
          "grid size-11 place-items-center rounded-md",
          live ? "bg-terra/15 text-terra" : "bg-teal/10 text-teal",
        )}
      >
        <Icon className="size-5" strokeWidth={1.7} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-medium">{name}</div>
        <div className="text-sm text-ink-soft">{place}</div>
      </div>
      <div className="text-sm font-medium">{status}</div>
    </div>
  );
}
