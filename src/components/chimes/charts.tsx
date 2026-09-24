import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { HourPoint } from "@/lib/house";

const axis = { fill: "var(--color-ink-soft)", fontSize: 11 };
const grid = { stroke: "var(--color-line)", strokeDasharray: "3 3" };

type TipProps = {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
  unit?: string;
};

function Tip({ active, payload, label, unit = "kWh" }: TipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-line bg-paper-raised px-3 py-2 text-xs shadow-sm">
      <div className="mb-1 font-medium">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex justify-between gap-4 tabular-nums text-ink-soft">
          <span>{p.name}</span>
          <span className="text-ink">
            {typeof p.value === "number" ? p.value.toFixed(p.value >= 10 ? 1 : 2) : p.value}
            {unit}
          </span>
        </div>
      ))}
    </div>
  );
}

export function PowerArea({
  data,
  keys,
}: {
  data: Record<string, string | number>[];
  keys: { key: string; color: string; name: string }[];
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid {...grid} />
        <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
        <YAxis tick={axis} axisLine={false} tickLine={false} width={36} />
        <Tooltip content={<Tip />} />
        {keys.map((k) => (
          <Area
            key={k.key}
            type="monotone"
            dataKey={k.key}
            name={k.name}
            stroke={k.color}
            fill={k.color}
            fillOpacity={0.18}
            strokeWidth={1.6}
          />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

export function CostBars({ data }: { data: { label: string; cost: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid {...grid} vertical={false} />
        <XAxis dataKey="label" tick={axis} axisLine={false} tickLine={false} />
        <YAxis tick={axis} axisLine={false} tickLine={false} width={36} />
        <Tooltip content={<Tip unit="" />} />
        <Bar dataKey="cost" name="Cost £" fill="var(--color-teal)" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LineArea({
  data,
  dataKey,
  name,
  color,
  unit,
}: {
  data: Record<string, string | number>[];
  dataKey: string;
  name: string;
  color: string;
  unit?: string;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid {...grid} />
        <XAxis dataKey="hour" tick={axis} axisLine={false} tickLine={false} interval={3} />
        <YAxis tick={axis} axisLine={false} tickLine={false} width={40} />
        <Tooltip content={<Tip unit={unit ?? ""} />} />
        <Area
          type="monotone"
          dataKey={dataKey}
          name={name}
          stroke={color}
          fill={color}
          fillOpacity={0.16}
          strokeWidth={1.8}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

const glassTick = { fill: "rgba(244,239,232,0.62)", fontSize: 11 };

type DayTipProps = {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
  glass?: boolean;
};

function DayTip({ active, payload, label, glass = false }: DayTipProps) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className={
        glass
          ? "rounded-md border border-sidebar-fg/20 bg-teal-deep/85 px-3 py-2 text-xs text-sidebar-fg shadow-sm backdrop-blur-md"
          : "rounded-md border border-line bg-paper-raised px-3 py-2 text-xs shadow-sm"
      }
    >
      <div className="mb-1 font-medium">{label}</div>
      {payload.map((p) => (
        <div
          key={p.name}
          className={
            glass
              ? "flex justify-between gap-5 tabular-nums text-sidebar-fg/70"
              : "flex justify-between gap-5 tabular-nums text-ink-soft"
          }
        >
          <span>{p.name}</span>
          <span className={glass ? "text-sidebar-fg" : "text-ink"}>
            {p.name === "SOC" ? `${Math.round(p.value)}%` : `${Math.round(p.value)} W`}
          </span>
        </div>
      ))}
    </div>
  );
}

const DAY_SERIES = {
  glass: {
    solar: "#e6d2c0",
    house: "#ae593c",
    battery: "#7eb8c0",
    grid: "#c4a484",
    soc: "#f4efe8",
    gridStroke: "rgba(244,239,232,0.12)",
  },
  paper: {
    solar: "var(--color-teal-soft)",
    house: "var(--color-terra)",
    battery: "var(--color-teal)",
    grid: "var(--color-umber)",
    soc: "var(--color-ink)",
    gridStroke: "var(--color-line)",
  },
} as const;

/** 24h multi-series energy chart — glass (Overview) or paper (Home / History family). */
export function DayAllChart({
  data,
  theme = "glass",
}: {
  data: HourPoint[];
  theme?: "glass" | "paper";
}) {
  const colors = DAY_SERIES[theme];
  const tick = theme === "glass" ? glassTick : axis;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 10, right: 28, left: 0, bottom: 0 }}>
        <CartesianGrid
          stroke={colors.gridStroke}
          strokeDasharray="3 3"
          vertical={false}
        />
        <XAxis
          dataKey="hour"
          tick={tick}
          axisLine={false}
          tickLine={false}
          interval={2}
          tickFormatter={(v: string) => v.slice(0, 2)}
        />
        <YAxis yAxisId="w" tick={tick} axisLine={false} tickLine={false} width={40} />
        <YAxis
          yAxisId="soc"
          orientation="right"
          domain={[0, 100]}
          tick={tick}
          axisLine={false}
          tickLine={false}
          width={32}
          tickFormatter={(v: number) => `${v}`}
        />
        <Tooltip content={<DayTip glass={theme === "glass"} />} />
        <Area
          yAxisId="w"
          type="monotone"
          dataKey="solarW"
          name="Solar"
          stroke={colors.solar}
          fill={colors.solar}
          fillOpacity={0.22}
          strokeWidth={1.6}
        />
        <Line
          yAxisId="w"
          type="monotone"
          dataKey="houseW"
          name="House"
          stroke={colors.house}
          dot={false}
          strokeWidth={1.8}
        />
        <Line
          yAxisId="w"
          type="monotone"
          dataKey="battW"
          name="Battery"
          stroke={colors.battery}
          dot={false}
          strokeWidth={1.6}
        />
        <Line
          yAxisId="w"
          type="monotone"
          dataKey="gridW"
          name="Grid"
          stroke={colors.grid}
          dot={false}
          strokeWidth={1.4}
        />
        <Line
          yAxisId="soc"
          type="monotone"
          dataKey="soc"
          name="SOC"
          stroke={colors.soc}
          strokeDasharray="4 5"
          dot={false}
          strokeWidth={1.3}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

export const DAY_CHART_LEGEND = [
  { key: "solar", label: "Solar" },
  { key: "house", label: "House" },
  { key: "battery", label: "Battery" },
  { key: "grid", label: "Grid" },
  { key: "soc", label: "SOC", dashed: true },
] as const;

export function dayChartLegendColors(theme: "glass" | "paper" = "glass") {
  const c = DAY_SERIES[theme];
  return {
    solar: c.solar,
    house: c.house,
    battery: c.battery,
    grid: c.grid,
    soc: c.soc,
  };
}
