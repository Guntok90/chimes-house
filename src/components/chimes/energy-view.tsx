import { WEEK } from "@/lib/house";
import { useLive } from "@/lib/house-store";
import { CostBars, PowerArea } from "./charts";
import { EnergyFlow } from "./energy-flow";
import { Metric, PageTitle, Row, SectionLabel, Surface } from "./ui";

export function EnergyView() {
  const LIVE = useLive();
  const today = WEEK[WEEK.length - 1];
  const solarHint =
    LIVE.solarNowW > 30
      ? "Producing"
      : LIVE.sunAboveHorizon === false
        ? "After dusk"
        : "Idle";
  const gridHint =
    LIVE.gridW > 30 ? "Importing" : LIVE.gridW < -30 ? "Exporting" : "Balanced";
  const battHint =
    LIVE.batteryW < -30 ? "Discharging" : LIVE.batteryW > 30 ? "Charging" : "Idle";
  const blurb =
    LIVE.solarNowW > 30
      ? `Solar is producing ${LIVE.solarNowW} W. House load ${LIVE.houseW} W.`
      : LIVE.batteryW < -30
        ? `Battery is covering the house (${Math.abs(LIVE.batteryW)} W out). Solar is ${solarHint.toLowerCase()}.`
        : `Solar is ${solarHint.toLowerCase()}. House load ${LIVE.houseW} W.`;

  return (
    <div className="space-y-8">
      <PageTitle>Energy</PageTitle>
      <section>
        <SectionLabel>Live flow</SectionLabel>
        <EnergyFlow />
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">{blurb}</p>
      </section>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Metric accent label="Solar now" value={`${LIVE.solarNowW} W`} hint={solarHint} />
        <Metric label="House" value={`${LIVE.houseW} W`} hint="Live load" />
        <Metric
          label="Battery"
          value={`${Math.abs(LIVE.batteryW)} W`}
          hint={battHint}
        />
        <Metric label="Grid" value={`${LIVE.gridW} W`} hint={gridHint} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionLabel>Today</SectionLabel>
          <Surface className="px-5">
            <Row label="Solar yield" value={`${LIVE.solarTodayKwh} kWh`} />
            <Row label="House used" value={`${today.house} kWh`} />
            <Row label="Battery charged" value={`${today.battCharge} kWh`} />
            <Row label="Battery used" value={`${today.battDischarge} kWh`} />
            <Row label="Imported" value={`${today.gridIn} kWh`} />
            <Row label="Exported" value={`${today.gridOut} kWh`} />
          </Surface>
        </section>
        <section>
          <SectionLabel>Inverter</SectionLabel>
          <Surface className="px-5">
            <Row label="Status" value={LIVE.inverterStatus} />
            <Row label="Active power" value={`${LIVE.inverterW} W`} />
            <Row label="Input" value={`${LIVE.solarNowW} W`} />
            <Row label="Daily yield" value={`${LIVE.solarTodayKwh} kWh`} />
            <Row label="Grid charge" value={LIVE.gridCharge ? "On" : "Off"} />
          </Surface>
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionLabel>Seven days · kWh</SectionLabel>
          <Surface className="h-64 p-3">
            <PowerArea
              data={WEEK.map((d) => ({
                label: d.label.replace(/^\w+ /, ""),
                Solar: d.solar,
                House: d.house,
              }))}
              keys={[
                { key: "Solar", name: "Solar", color: "var(--color-teal)" },
                { key: "House", name: "House", color: "var(--color-terra)" },
              ]}
            />
          </Surface>
        </section>
        <section>
          <SectionLabel>Octopus</SectionLabel>
          <Surface className="mb-3 px-5">
            <Row label="Tariff" value="Intelligent" />
            <Row label="Window" value={LIVE.offPeak ? "Off-peak now" : "Peak"} />
            <Row label="Today so far" value={`£${today.cost.toFixed(2)}`} />
          </Surface>
          <Surface className="h-48 p-3">
            <CostBars data={WEEK.map((d) => ({ label: d.label.split(" ")[0], cost: d.cost }))} />
          </Surface>
        </section>
      </div>
    </div>
  );
}
