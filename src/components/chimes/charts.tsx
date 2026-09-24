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
import { useEffect, useRef, type ReactNode } from "react";
import type { DayPoint, HourPoint } from "@/lib/house";

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

export const METER_COLORS = {
  solar: "#e6d2c0",
  house: "#ae593c",
  battery: "#7eb8c0",
  grid: "#c4a484",
  cars: "#d4a017",
  soc: "#f4efe8",
} as const;

function GlassTip({
  active,
  payload,
  label,
  unit = "W",
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
  unit?: "W" | "kWh";
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-md border border-sidebar-fg/20 bg-teal-deep/85 px-3 py-2 text-xs text-sidebar-fg shadow-sm backdrop-blur-md">
      <div className="mb-1 font-medium">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex justify-between gap-5 tabular-nums text-sidebar-fg/70">
          <span>{p.name}</span>
          <span className="text-sidebar-fg">
            {p.name === "SOC"
              ? `${Math.round(p.value)}%`
              : unit === "kWh"
                ? `${typeof p.value === "number" ? p.value.toFixed(p.value >= 10 ? 1 : 2) : p.value} kWh`
                : `${Math.round(p.value)} W`}
          </span>
        </div>
      ))}
    </div>
  );
}

/** Horizontally scrollable chart host — scrolls to the newest point on mount/data change. */
export function ChartScroll({
  children,
  widthPx,
  className,
}: {
  children: ReactNode;
  widthPx: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.scrollLeft = el.scrollWidth;
  }, [widthPx]);
  return (
    <div
      ref={ref}
      className={className ?? "h-full w-full overflow-x-auto overflow-y-hidden overscroll-x-contain"}
      style={{ WebkitOverflowScrolling: "touch" }}
    >
      <div className="h-full min-w-full" style={{ width: Math.max(widthPx, 1) }}>
        {children}
      </div>
    </div>
  );
}

export function DayAllChart({
  data,
  showCars = true,
}: {
  data: HourPoint[];
  showCars?: boolean;
}) {
  const multiDay = data.length > 24;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 10, right: 28, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="rgba(244,239,232,0.12)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="hour"
          tick={glassTick}
          axisLine={false}
          tickLine={false}
          interval={multiDay ? 11 : 2}
          minTickGap={multiDay ? 28 : 8}
          tickFormatter={(v: string) => (multiDay ? v : v.slice(0, 2))}
        />
        <YAxis yAxisId="w" tick={glassTick} axisLine={false} tickLine={false} width={40} />
        <YAxis
          yAxisId="soc"
          orientation="right"
          domain={[0, 100]}
          tick={glassTick}
          axisLine={false}
          tickLine={false}
          width={32}
          tickFormatter={(v: number) => `${v}`}
        />
        <Tooltip content={<GlassTip unit="W" />} />
        <Area
          yAxisId="w"
          type="monotone"
          dataKey="solarW"
          name="Solar"
          stroke={METER_COLORS.solar}
          fill={METER_COLORS.solar}
          fillOpacity={0.22}
          strokeWidth={1.6}
        />
        <Line
          yAxisId="w"
          type="monotone"
          dataKey="houseW"
          name="House"
          stroke={METER_COLORS.house}
          dot={false}
          strokeWidth={1.8}
        />
        <Line
          yAxisId="w"
          type="monotone"
          dataKey="battW"
          name="Battery"
          stroke={METER_COLORS.battery}
          dot={false}
          strokeWidth={1.6}
        />
        <Line
          yAxisId="w"
          type="monotone"
          dataKey="gridW"
          name="Grid"
          stroke={METER_COLORS.grid}
          dot={false}
          strokeWidth={1.4}
        />
        {showCars ? (
          <Line
            yAxisId="w"
            type="monotone"
            dataKey="carW"
            name="Cars"
            stroke={METER_COLORS.cars}
            dot={false}
            strokeWidth={1.5}
          />
        ) : null}
        <Line
          yAxisId="soc"
          type="monotone"
          dataKey="soc"
          name="SOC"
          stroke={METER_COLORS.soc}
          strokeDasharray="4 5"
          dot={false}
          strokeWidth={1.3}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

type EnergyRow = {
  label: string;
  solar: number;
  house: number;
  grid: number;
  battery: number;
  cars: number;
};

function toEnergyRows(data: DayPoint[]): EnergyRow[] {
  return data.map((d) => ({
    label: d.label,
    solar: d.solar,
    house: d.house,
    grid: d.gridIn - d.gridOut,
    battery: d.battCharge - d.battDischarge,
    cars: d.cars,
  }));
}

/** Daily/monthly kWh meters for Overview week / month / year tabs. */
export function EnergyMetersChart({
  data,
  showCars = true,
}: {
  data: DayPoint[];
  showCars?: boolean;
}) {
  const rows = toEnergyRows(data);
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={rows} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="rgba(244,239,232,0.12)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="label"
          tick={glassTick}
          axisLine={false}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={20}
        />
        <YAxis tick={glassTick} axisLine={false} tickLine={false} width={40} />
        <Tooltip content={<GlassTip unit="kWh" />} />
        <Area
          type="monotone"
          dataKey="solar"
          name="Solar"
          stroke={METER_COLORS.solar}
          fill={METER_COLORS.solar}
          fillOpacity={0.22}
          strokeWidth={1.6}
        />
        <Line
          type="monotone"
          dataKey="house"
          name="House"
          stroke={METER_COLORS.house}
          dot={false}
          strokeWidth={1.8}
        />
        <Line
          type="monotone"
          dataKey="battery"
          name="Battery"
          stroke={METER_COLORS.battery}
          dot={false}
          strokeWidth={1.6}
        />
        <Line
          type="monotone"
          dataKey="grid"
          name="Grid"
          stroke={METER_COLORS.grid}
          dot={false}
          strokeWidth={1.4}
        />
        {showCars ? (
          <Line
            type="monotone"
            dataKey="cars"
            name="Cars"
            stroke={METER_COLORS.cars}
            dot={false}
            strokeWidth={1.5}
          />
        ) : null}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
