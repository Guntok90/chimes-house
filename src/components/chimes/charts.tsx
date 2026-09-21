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

function GlassTip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
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
              : `${Math.round(p.value)} W`}
          </span>
        </div>
      ))}
    </div>
  );
}

export function DayAllChart({ data }: { data: HourPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <ComposedChart data={data} margin={{ top: 10, right: 28, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="rgba(244,239,232,0.12)" strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="hour"
          tick={glassTick}
          axisLine={false}
          tickLine={false}
          interval={2}
          tickFormatter={(v: string) => v.slice(0, 2)}
        />
        <YAxis
          yAxisId="w"
          tick={glassTick}
          axisLine={false}
          tickLine={false}
          width={40}
        />
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
        <Tooltip content={<GlassTip />} />
        <Area
          yAxisId="w"
          type="monotone"
          dataKey="solarW"
          name="Solar"
          stroke="#e6d2c0"
          fill="#e6d2c0"
          fillOpacity={0.22}
          strokeWidth={1.6}
        />
        <Line
          yAxisId="w"
          type="monotone"
          dataKey="houseW"
          name="House"
          stroke="#ae593c"
          dot={false}
          strokeWidth={1.8}
        />
        <Line
          yAxisId="w"
          type="monotone"
          dataKey="battW"
          name="Battery"
          stroke="#7eb8c0"
          dot={false}
          strokeWidth={1.6}
        />
        <Line
          yAxisId="w"
          type="monotone"
          dataKey="gridW"
          name="Grid"
          stroke="#c4a484"
          dot={false}
          strokeWidth={1.4}
        />
        <Line
          yAxisId="soc"
          type="monotone"
          dataKey="soc"
          name="SOC"
          stroke="#f4efe8"
          strokeDasharray="4 5"
          dot={false}
          strokeWidth={1.3}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
