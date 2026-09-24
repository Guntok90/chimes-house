import { WEEK, solarStatusHint } from "@/lib/house";
import { useHouse, useLive } from "@/lib/house-store";
import { CostBars, PowerArea } from "./charts";
import { EnergyFlow } from "./energy-flow";
import { NoHistoryYet } from "./no-history";
import { Metric, PageTitle, Row, SectionLabel, Surface } from "./ui";
import { VehiclesSection } from "./vehicles";

export function EnergyView() {
  const LIVE = useLive();
  const status = useHouse((s) => s.status);
  const historyStatus = useHouse((s) => s.historyStatus);
  const historyWeek = useHouse((s) => s.historyWeek);
  const liveMode = status === "live";
  const week = liveMode ? historyWeek : WEEK;
  const today = week[week.length - 1];
  const chartsReady = !liveMode || (historyStatus === "ready" && week.length > 0);
  const solarHintRaw = solarStatusHint(status, LIVE);
  const solarHint = solarHintRaw.charAt(0).toUpperCase() + solarHintRaw.slice(1);
  const gridHint = LIVE.gridW > 30 ? "Importing" : LIVE.gridW < -30 ? "Exporting" : "Balanced";
  const battHint = LIVE.batteryW < -30 ? "Discharging" : LIVE.batteryW > 30 ? "Charging" : "Idle";
  const blurb =
    status === "error"
      ? "Not connected to the Pi. Showing the demo snapshot — the tablet needs Tailscale or the house Wi-Fi."
      : status !== "live"
        ? "Demo snapshot. Tablets on Tailscale go live after the family password."
        : LIVE.solarNowW > 30
          ? `Solar is producing ${LIVE.solarNowW} W. House load ${LIVE.houseW} W.`
          : LIVE.batteryW < -30
            ? `Battery is covering the house (${Math.abs(LIVE.batteryW)} W out). Solar is ${solarHint.toLowerCase()}.`
            : `Solar is ${solarHint.toLowerCase()}. House load ${LIVE.houseW} W.`;

  return (
    <div className="space-y-8">
      <PageTitle>Energy</PageTitle>
      <section>
        <SectionLabel tone="teal">Live flow</SectionLabel>
        <EnergyFlow />
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-ink-soft">{blurb}</p>
      </section>
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Metric accent label="Solar now" value={`${LIVE.solarNowW} W`} hint={solarHint} />
        <Metric tone="terra" label="House" value={`${LIVE.houseW} W`} hint="Live load" />
        <Metric tone="sand" label="Battery" value={`${Math.abs(LIVE.batteryW)} W`} hint={battHint} />
        <Metric tone="teal" label="Grid" value={`${LIVE.gridW} W`} hint={gridHint} />
      </div>

      <VehiclesSection />

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionLabel tone="sand">Today</SectionLabel>
          <Surface tone="sand" className="px-5">
            <Row label="Solar yield" value={`${LIVE.solarTodayKwh} kWh`} />
            <Row
              label="House used"
              value={today ? `${today.house} kWh` : liveMode ? "—" : `${WEEK[WEEK.length - 1]?.house ?? 0} kWh`}
            />
            <Row
              label="Battery charged"
              value={today ? `${today.battCharge} kWh` : "—"}
            />
            <Row
              label="Battery used"
              value={today ? `${today.battDischarge} kWh` : "—"}
            />
            <Row label="Imported" value={today ? `${today.gridIn} kWh` : "—"} />
            <Row label="Exported" value={today ? `${today.gridOut} kWh` : "—"} />
          </Surface>
        </section>
        <section>
          <SectionLabel tone="teal">Inverter</SectionLabel>
          <Surface tone="teal" className="px-5">
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
          <SectionLabel tone="terra">Seven days · kWh</SectionLabel>
          {chartsReady ? (
            <Surface tone="terra" className="h-64 p-3">
              <PowerArea
                data={week.map((d) => ({
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
          ) : (
            <NoHistoryYet label="seven-day chart" />
          )}
        </section>
        <section>
          <SectionLabel tone="umber">Octopus</SectionLabel>
          <Surface tone="umber" className="mb-3 px-5">
            <Row label="Tariff" value="Intelligent" />
            <Row label="Window" value={LIVE.offPeak ? "Off-peak now" : "Peak"} />
            <Row
              label="Today so far"
              value={today ? `£${today.cost.toFixed(2)}` : "—"}
            />
          </Surface>
          {chartsReady ? (
            <Surface tone="teal" className="h-48 p-3">
              <CostBars data={week.map((d) => ({ label: d.label.split(" ")[0], cost: d.cost }))} />
            </Surface>
          ) : (
            <NoHistoryYet label="spend chart" />
          )}
        </section>
      </div>
    </div>
  );
}
