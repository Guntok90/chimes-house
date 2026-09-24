import { useMemo, useState } from "react";
import { MONTH, WEEK, type DayPoint } from "@/lib/house";
import { useHouse, useTariffs } from "@/lib/house-store";
import { estimateImportCost } from "@/lib/tariffs";
import { CostBars, PowerArea } from "./charts";
import { NoHistoryYet } from "./no-history";
import { PageTitle, SectionLabel, Segmented, Surface } from "./ui";

type Range = "week" | "month";

export function HistoryView() {
  const [range, setRange] = useState<Range>("week");
  const status = useHouse((s) => s.status);
  const historyStatus = useHouse((s) => s.historyStatus);
  const historyWeek = useHouse((s) => s.historyWeek);
  const historyMonth = useHouse((s) => s.historyMonth);
  const tariffs = useTariffs();

  const liveMode = status === "live";
  const rows: DayPoint[] = liveMode
    ? range === "week"
      ? historyWeek
      : historyMonth
    : (range === "week" ? WEEK : MONTH).map((d) => ({
        ...d,
        cost: estimateImportCost(d.gridIn, tariffs),
      }));

  const showEmpty = liveMode && (historyStatus === "empty" || historyStatus === "loading" || rows.length === 0);
  const totals = useMemo(() => sum(rows), [rows]);
  const chart = rows.map((d) => ({
    label: range === "week" ? d.label : d.label.replace(/^\w{3} /, ""),
    Solar: d.solar,
    House: d.house,
    Import: d.gridIn,
    Export: d.gridOut,
  }));

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle>History</PageTitle>
        <Segmented
          value={range}
          onChange={setRange}
          options={[
            { id: "week", label: "7 days" },
            { id: "month", label: "28 days" },
          ]}
        />
      </div>

      {showEmpty ? (
        <NoHistoryYet label={historyStatus === "loading" ? "history (loading)" : "history"} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
            <Stat label="Solar" value={`${totals.solar.toFixed(1)} kWh`} />
            <Stat label="House" value={`${totals.house.toFixed(1)} kWh`} />
            <Stat label="Imported" value={`${totals.gridIn.toFixed(1)} kWh`} />
            <Stat label="Cost" value={`£${totals.cost.toFixed(2)}`} />
          </div>

          <section>
            <SectionLabel>Solar and house</SectionLabel>
            <Surface className="h-72 p-3">
              <PowerArea
                data={chart}
                keys={[
                  { key: "Solar", name: "Solar", color: "var(--color-teal)" },
                  { key: "House", name: "House", color: "var(--color-terra)" },
                ]}
              />
            </Surface>
          </section>

          <section>
            <SectionLabel>Grid</SectionLabel>
            <Surface className="h-64 p-3">
              <PowerArea
                data={chart}
                keys={[
                  { key: "Import", name: "Import", color: "var(--color-umber)" },
                  { key: "Export", name: "Export", color: "var(--color-teal-soft)" },
                ]}
              />
            </Surface>
          </section>

          <section>
            <SectionLabel>Spend</SectionLabel>
            <Surface className="h-56 p-3">
              <CostBars
                data={rows.map((d) => ({
                  label: range === "week" ? d.label.split(" ")[0] : d.label.split(" ")[1] ?? d.label,
                  cost: d.cost,
                }))}
              />
            </Surface>
          </section>

          <section>
            <SectionLabel>Daily</SectionLabel>
            <Surface className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-widest text-ink-soft">
                  <tr className="border-b border-line">
                    <th className="px-4 py-3 font-medium">Day</th>
                    <th className="px-3 py-3 font-medium">Solar</th>
                    <th className="px-3 py-3 font-medium">House</th>
                    <th className="px-3 py-3 font-medium">In</th>
                    <th className="px-3 py-3 font-medium">Out</th>
                    <th className="px-3 py-3 font-medium">Batt +</th>
                    <th className="px-3 py-3 font-medium">Batt −</th>
                    <th className="px-4 py-3 font-medium">£</th>
                  </tr>
                </thead>
                <tbody>
                  {[...rows].reverse().map((d) => (
                    <tr key={d.key} className="border-b border-line last:border-0">
                      <td className="px-4 py-2.5 font-medium">{d.label}</td>
                      <Num n={d.solar} />
                      <Num n={d.house} />
                      <Num n={d.gridIn} />
                      <Num n={d.gridOut} />
                      <Num n={d.battCharge} />
                      <Num n={d.battDischarge} />
                      <td className="px-4 py-2.5 tabular-nums">£{d.cost.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Surface>
          </section>
        </>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-line bg-white/60 px-4 py-4">
      <div className="text-xs uppercase tracking-widest text-ink-soft">{label}</div>
      <div className="mt-1.5 text-xl font-medium tracking-tight tabular-nums">{value}</div>
    </div>
  );
}

function Num({ n }: { n: number }) {
  return <td className="px-3 py-2.5 tabular-nums text-ink-soft">{n.toFixed(1)}</td>;
}

function sum(rows: DayPoint[]) {
  return rows.reduce(
    (acc, d) => ({
      solar: acc.solar + d.solar,
      house: acc.house + d.house,
      gridIn: acc.gridIn + d.gridIn,
      cost: acc.cost + d.cost,
    }),
    { solar: 0, house: 0, gridIn: 0, cost: 0 },
  );
}
