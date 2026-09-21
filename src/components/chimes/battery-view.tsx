import { HOURS, WEEK } from "@/lib/house";
import { useLive } from "@/lib/house-store";
import { LineArea } from "./charts";
import { Metric, PageTitle, Row, SectionLabel, Surface } from "./ui";

export function BatteryView() {
  const live = useLive();
  const today = WEEK[WEEK.length - 1];
  const discharging = live.batteryW < 0;
  const hours = HOURS.map((h) => ({
    hour: h.hour,
    SOC: h.soc,
    Power: h.battW,
  }));

  return (
    <div className="space-y-8">
      <PageTitle>Battery</PageTitle>

      <div className="grid gap-6 lg:grid-cols-[auto_1fr] lg:items-center">
        <Surface className="flex items-center justify-center px-8 py-8">
          <SocRing soc={live.soc} watts={live.batteryW} />
        </Surface>
        <div className="grid grid-cols-2 gap-2.5">
          <Metric
            accent
            label="State"
            value={discharging ? "Discharging" : "Charging"}
            hint={`${Math.abs(live.batteryW)} W`}
          />
          <Metric label="Capacity" value={`${live.soc}%`} hint="Pack 1" />
          <Metric
            label="Charged today"
            value={`${today.battCharge} kWh`}
            hint="Into the pack"
          />
          <Metric
            label="Used today"
            value={`${today.battDischarge} kWh`}
            hint="Out to the house"
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionLabel>State of charge · 24 h</SectionLabel>
          <Surface className="h-56 p-3">
            <LineArea
              data={hours}
              dataKey="SOC"
              name="SOC"
              color="var(--color-teal)"
              unit="%"
            />
          </Surface>
        </section>
        <section>
          <SectionLabel>Power · 24 h</SectionLabel>
          <Surface className="h-56 p-3">
            <LineArea
              data={hours}
              dataKey="Power"
              name="Battery"
              color="var(--color-terra)"
              unit=" W"
            />
          </Surface>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionLabel>Pack</SectionLabel>
          <Surface className="px-5">
            <Row label="Pack" value="Battery 1" />
            <Row label="Mode" value={live.inverterStatus} />
            <Row label="Power" value={`${live.batteryW} W`} />
            <Row label="Through inverter" value={`${live.inverterW} W`} />
            <Row label="Charge from grid" value={live.gridCharge ? "Allowed" : "Off"} />
          </Surface>
        </section>
        <section>
          <SectionLabel>This week</SectionLabel>
          <Surface className="px-5">
            <Row
              label="Charged"
              value={`${WEEK.reduce((s, d) => s + d.battCharge, 0).toFixed(1)} kWh`}
            />
            <Row
              label="Discharged"
              value={`${WEEK.reduce((s, d) => s + d.battDischarge, 0).toFixed(1)} kWh`}
            />
            <Row label="Highest SOC" value={`${Math.max(...HOURS.map((h) => h.soc))}%`} />
            <Row label="Lowest SOC" value={`${Math.min(...HOURS.map((h) => h.soc))}%`} />
            <Row label="Now" value={`${live.soc}%`} />
          </Surface>
        </section>
      </div>
    </div>
  );
}

function SocRing({ soc, watts }: { soc: number; watts: number }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const dash = (soc / 100) * c;
  return (
    <div className="relative size-52">
      <svg viewBox="0 0 140 140" className="size-full -rotate-90">
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          className="stroke-paper-deep"
          strokeWidth="10"
        />
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          className="stroke-teal"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-4xl font-medium tracking-tight tabular-nums">{soc}%</div>
          <div className="mt-1 text-sm text-ink-soft">
            {watts < 0 ? "Discharging" : "Charging"}
          </div>
        </div>
      </div>
    </div>
  );
}
