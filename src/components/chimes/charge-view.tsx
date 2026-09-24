import { PlugZap } from "lucide-react";
import { WEEK, usesDemoCharts } from "@/lib/house";
import { useHouse, useLive, useTariffs } from "@/lib/house-store";
import { estimateImportCostParts } from "@/lib/tariffs";
import { ChargeSection } from "./charge-section";
import { Metric, PageTitle, Row, SectionLabel, Surface } from "./ui";

export function ChargeView() {
  const live = useLive();
  const status = useHouse((s) => s.status);
  const historyWeek = useHouse((s) => s.historyWeek);
  const tariffs = useTariffs();
  const week =
    !usesDemoCharts(status)
      ? historyWeek
      : WEEK.map((d) => ({ ...d, ...estimateImportCostParts(d.gridIn, tariffs) }));
  const today = week[week.length - 1];
  return (
    <div className="space-y-8">
      <PageTitle>Charge</PageTitle>

      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Metric
          accent
          label="Zappi Charger"
          value={live.zappiMode === "—" ? "—" : live.zappiMode}
          hint={live.zappiPlugged ? "Plugged in" : "Waiting"}
        />
        <Metric label="Intelligent" value={live.intelligent ? "Ready" : "Off"} hint="Octopus" />
        <Metric
          label="Window"
          value={live.offPeak ? "Off-peak" : "Peak"}
          hint="Cheap rate"
        />
        <Metric
          label="Charge power"
          value={`${live.zappiW} W`}
          hint={live.zappiW > 30 ? "Charging" : "Idle"}
        />
      </div>

      <ChargeSection showLabel={false} />

      <div className="grid gap-6 lg:grid-cols-2">
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
        <section>
          <SectionLabel>House rules</SectionLabel>
          <Surface className="p-5 text-sm leading-relaxed text-ink-soft">
            <p>
              Cars and the battery charge on cheap rate. That schedule is already running — this
              page only shows Dispatch status (no write controls for Octopus).
            </p>
            <div className="mt-4 flex items-center gap-2 text-ink">
              <PlugZap className="size-4 text-teal" strokeWidth={1.7} />
              <span className="font-medium">Off-peak charge is on</span>
            </div>
            <div className="mt-4 px-1">
              <Row label="Today import" value={today ? `${today.gridIn} kWh` : "—"} />
              <Row label="Today cost" value={today ? `£${today.cost.toFixed(2)}` : "—"} />
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
