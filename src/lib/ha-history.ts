import { deriveHouseW } from "./energy-balance.ts";
import type { HaMap } from "./ha.ts";
import type { DayPoint, HourPoint } from "./house.ts";
import {
  DEFAULT_TARIFF,
  cheapFractionInLocalHour,
  gridSpendPartsGbp,
  splitDailyImportByWindow,
  type TariffRates,
} from "./octopus.ts";

type HistPoint = {
  state?: string;
  last_changed?: string;
  last_updated?: string;
  /** minimal_response compact keys */
  s?: string;
  lu?: number;
};

/** HA history payload: entity_id → list of states (full or minimal_response). */
export type HaHistoryBag = Record<string, HistPoint[]>;

export type HaStatRow = {
  /** ISO string or Unix epoch milliseconds (HA WS often sends numbers). */
  start: string | number;
  end?: string | number;
  mean?: number | null;
  state?: number | null;
  sum?: number | null;
  change?: number | null;
};

export type HaStatisticsBag = Record<string, HaStatRow[]>;

export type DaysFromStatisticsOpts = {
  /** Hourly grid statistics for the same entity as map.gridW (preferred for spend). */
  hourStats?: HaStatisticsBag;
  /** £/kWh cheap + peak — from HA rate sensors when mapped, else Intelligent Go fallbacks. */
  rates?: Pick<TariffRates, "lowGbpPerKwh" | "highGbpPerKwh">;
};

function num(v: string | number | null | undefined) {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v == null) return null;
  const n = Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Local calendar YYYY-MM-DD — matches house-dashboard day buckets. */
export function localDayKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Local calendar YYYY-MM for monthly statistics buckets. */
export function localMonthKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

/**
 * Parse HA statistics `start` (ISO string, epoch ms number, or numeric string)
 * into a Date. Never assume `start` is a string — HA WS often returns ms.
 */
export function dateFromStatStart(start: string | number | null | undefined): Date | null {
  if (start == null || start === "") return null;
  if (typeof start === "number") {
    if (!Number.isFinite(start)) return null;
    return new Date(start);
  }
  const s = String(start).trim();
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    return new Date(n);
  }
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return null;
  return new Date(t);
}

/**
 * Normalise a statistics row `start` (ISO string, epoch ms number, or numeric
 * string) to YYYY-MM-DD. Never assume `start` is a string — HA WS returns ms.
 */
export function dayKeyFromStart(start: string | number | null | undefined): string | null {
  if (start == null || start === "") return null;
  if (typeof start === "number") {
    if (!Number.isFinite(start)) return null;
    return localDayKey(new Date(start));
  }
  const s = String(start).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    return localDayKey(new Date(n));
  }
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return null;
  return localDayKey(new Date(t));
}

/** YYYY-MM from statistics `start` (ISO or epoch ms). */
export function monthKeyFromStart(start: string | number | null | undefined): string | null {
  if (start == null || start === "") return null;
  if (typeof start === "number") {
    if (!Number.isFinite(start)) return null;
    return localMonthKey(new Date(start));
  }
  const s = String(start).trim();
  if (/^\d{4}-\d{2}/.test(s)) return s.slice(0, 7);
  const d = dateFromStatStart(start);
  return d ? localMonthKey(d) : null;
}

function sampleAt(series: HistPoint[] | undefined, atMs: number): number | null {
  if (!series?.length) return null;
  let best: number | null = null;
  for (const p of series) {
    const t = p.lu != null ? p.lu * 1000 : Date.parse(p.last_changed ?? p.last_updated ?? "");
    if (!Number.isFinite(t) || t > atMs) break;
    const v = num(p.s ?? p.state);
    if (v != null) best = v;
  }
  return best;
}

function hourLabel(t: Date, multiDay: boolean): string {
  const hh = `${pad2(t.getHours())}:00`;
  if (!multiDay) return hh;
  const day = t.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });
  return `${day} ${hh}`;
}

/**
 * Build hourly points from live HA history.
 * `count` defaults to 24; Overview day-scroll uses 7×24 over the past week.
 * Empty → [] (never invent demo curves).
 */
export function hoursFromHistory(
  bag: HaHistoryBag,
  map: HaMap,
  now = new Date(),
  count = 24,
): HourPoint[] {
  const solarId = map.solarNowW;
  const battId = map.batteryW;
  const socId = map.soc;
  const gridId = map.gridW;
  const houseId = map.houseW;
  const zappiId = map.zappiW;
  if (!solarId && !battId && !socId && !gridId && !zappiId) return [];

  const out: HourPoint[] = [];
  const end = new Date(now);
  end.setMinutes(0, 0, 0);
  const multiDay = count > 24;
  for (let i = count - 1; i >= 0; i--) {
    const t = new Date(end);
    t.setHours(end.getHours() - i);
    const at = t.getTime();
    const solarW = sampleAt(solarId ? bag[solarId] : undefined, at) ?? 0;
    const battW = sampleAt(battId ? bag[battId] : undefined, at) ?? 0;
    const soc = sampleAt(socId ? bag[socId] : undefined, at) ?? 0;
    const gridW = sampleAt(gridId ? bag[gridId] : undefined, at) ?? 0;
    const zappiW = sampleAt(zappiId ? bag[zappiId] : undefined, at) ?? 0;
    const houseMapped = houseId ? sampleAt(bag[houseId], at) : null;
    const houseW =
      houseMapped != null
        ? Math.max(0, Math.round(houseMapped))
        : deriveHouseW(solarW, gridW, battW, zappiW);
    out.push({
      hour: hourLabel(t, multiDay),
      soc: Math.round(soc),
      battW: Math.round(battW),
      solarW: Math.round(solarW),
      houseW,
      gridW: Math.round(gridW),
      carW: Math.round(Math.max(0, zappiW)),
    });
  }
  return out;
}

function dayLabel(isoDay: string) {
  const d = new Date(`${isoDay}T12:00:00`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });
}

function monthLabel(isoMonth: string) {
  const d = new Date(`${isoMonth}-01T12:00:00`);
  return d.toLocaleDateString("en-GB", { month: "short", year: "2-digit" });
}

/** Signed energy-ish value for one period key (day YYYY-MM-DD or month YYYY-MM). */
function periodValue(
  rows: HaStatRow[] | undefined,
  key: string,
  keyOf: (start: string | number | null | undefined) => string | null,
  hoursInPeriod: number,
): number {
  if (!rows?.length) return 0;
  const row = rows.find((r) => keyOf(r.start) === key);
  if (!row) return 0;
  const change = num(row.change);
  const mean = num(row.mean);
  // Energy sensors: non-zero change is the period delta (kWh).
  // Power sensors often report change: 0 with mean in W — prefer mean then.
  if (change != null && change !== 0) return Number(change.toFixed(2));
  if (mean != null && mean !== 0) {
    return Number(((mean * hoursInPeriod) / 1000).toFixed(2));
  }
  const state = num(row.state);
  if (state != null && state !== 0) return Number(state.toFixed(2));
  // Genuine zero-energy period (or flat zero power).
  if (change === 0 || mean === 0 || state === 0) return 0;
  const sum = num(row.sum);
  if (sum != null) return Number(sum.toFixed(2));
  return 0;
}

function dayValue(rows: HaStatRow[] | undefined, key: string): number {
  return periodValue(rows, key, dayKeyFromStart, 24);
}

function monthValue(rows: HaStatRow[] | undefined, key: string): number {
  // ~30.4 days — rough monthly energy from mean W when change is absent.
  return periodValue(rows, key, monthKeyFromStart, 24 * 30.4);
}

function metersForPeriod(
  stats: HaStatisticsBag,
  map: HaMap,
  key: string,
  valueFn: (rows: HaStatRow[] | undefined, key: string) => number,
): Omit<
  DayPoint,
  | "key"
  | "label"
  | "cost"
  | "costOffPeak"
  | "costPeak"
  | "importOffPeakKwh"
  | "importPeakKwh"
> {
  const solarId = map.solarTodayKwh ?? map.solarNowW;
  const solar = valueFn(solarId ? stats[solarId] : undefined, key);
  const house = valueFn(map.houseW ? stats[map.houseW] : undefined, key);
  const gridRaw = valueFn(map.gridW ? stats[map.gridW] : undefined, key);
  const gridIn = Math.max(0, gridRaw);
  const gridOut = Math.max(0, -gridRaw);
  const battRaw = valueFn(map.batteryW ? stats[map.batteryW] : undefined, key);
  // Signed battery: + charge into pack, − discharge (matches live battW).
  const battCharge = Math.max(0, battRaw);
  const battDischarge = Math.max(0, -battRaw);
  const cars = Math.max(0, valueFn(map.zappiW ? stats[map.zappiW] : undefined, key));
  return {
    solar,
    house,
    gridIn,
    gridOut,
    battCharge,
    battDischarge,
    cars,
  };
}

function hasMeterSignal(d: Omit<DayPoint, "key" | "label">): boolean {
  return (
    d.solar !== 0 ||
    d.house !== 0 ||
    d.gridIn !== 0 ||
    d.gridOut !== 0 ||
    d.battCharge !== 0 ||
    d.battDischarge !== 0 ||
    d.cars !== 0
  );
}

/**
 * kWh for one hour row from HA statistics.
 *
 * Prefer energy `change` (kWh delta). For power sensors (myenergi grid W), HA
 * often returns `change: 0` with `mean` in watts — use mean W → kWh.
 *
 * Never treat `state` or cumulative `sum` as hourly kWh: on power sensors
 * `state` is watts; on energy sensors `sum` is lifetime — both inflate Peak £.
 */
export function hourKwh(row: HaStatRow): number {
  const change = num(row.change);
  const mean = num(row.mean);
  if (change != null && change !== 0) return change;
  if (mean != null && mean !== 0) return mean / 1000; // mean W over 1h ≈ kWh
  if (change === 0 || mean === 0) return 0;
  return 0;
}

function startAsDate(start: string | number | null | undefined): Date | null {
  if (start == null || start === "") return null;
  if (typeof start === "number") {
    if (!Number.isFinite(start)) return null;
    return new Date(start);
  }
  const s = String(start).trim();
  if (/^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (!Number.isFinite(n)) return null;
    return new Date(n);
  }
  const t = Date.parse(s);
  if (!Number.isFinite(t)) return null;
  return new Date(t);
}

/**
 * Split one calendar day's grid import into cheap-window vs peak kWh using
 * hourly statistics + Intelligent Go window fractions.
 * Returns null when there are no hourly rows for that day.
 */
export function splitGridImportForDay(
  hourRows: HaStatRow[] | undefined,
  dayKey: string,
): { lowKwh: number; highKwh: number } | null {
  if (!hourRows?.length) return null;
  let low = 0;
  let high = 0;
  let hits = 0;
  for (const row of hourRows) {
    const start = startAsDate(row.start);
    if (!start) continue;
    if (localDayKey(start) !== dayKey) continue;
    const kwh = hourKwh(row);
    // Import only — export (negative) does not reduce spend.
    const importKwh = Math.max(0, kwh);
    if (importKwh === 0 && kwh === 0) {
      // Still count the hour so an all-zero day is distinguishable from missing.
      hits += 1;
      continue;
    }
    hits += 1;
    const cheapFrac = cheapFractionInLocalHour(start);
    low += importKwh * cheapFrac;
    high += importKwh * (1 - cheapFrac);
  }
  if (hits === 0) return null;
  return {
    lowKwh: Number(low.toFixed(4)),
    highKwh: Number(high.toFixed(4)),
  };
}

/**
 * Daily spend parts from low+high grid import × tariff rates.
 * Prefers hourly Intelligent Go window split; never prices all kWh at peak.
 */
export function daySpendPartsGbp(
  gridIn: number,
  dayKey: string,
  hourRows: HaStatRow[] | undefined,
  rates: Pick<TariffRates, "lowGbpPerKwh" | "highGbpPerKwh"> = DEFAULT_TARIFF,
) {
  const split = splitGridImportForDay(hourRows, dayKey);
  const splitTotal = split ? split.lowKwh + split.highKwh : 0;
  // Use hourly TOU when it actually measured import. An all-zero split while
  // daily gridIn > 0 means hourKwh failed (e.g. change:0 masking mean) — fall back.
  if (split && (splitTotal > 0.0001 || gridIn <= 0.0001)) {
    return gridSpendPartsGbp(split.lowKwh, split.highKwh, rates);
  }
  // Gap: no usable hourly import series — best available is window-hour weighting.
  const approx = splitDailyImportByWindow(gridIn);
  return gridSpendPartsGbp(approx.lowKwh, approx.highKwh, rates);
}

/** Daily spend from low+high grid import × tariff rates (never a flat average). */
export function daySpendGbp(
  gridIn: number,
  dayKey: string,
  hourRows: HaStatRow[] | undefined,
  rates: Pick<TariffRates, "lowGbpPerKwh" | "highGbpPerKwh"> = DEFAULT_TARIFF,
): number {
  return daySpendPartsGbp(gridIn, dayKey, hourRows, rates).total;
}

/** Daily kWh rows from recorder statistics. Empty → []. */
export function daysFromStatistics(
  stats: HaStatisticsBag,
  map: HaMap,
  count: number,
  now = new Date(),
  opts: DaysFromStatisticsOpts = {},
): DayPoint[] {
  const solarId = map.solarTodayKwh ?? map.solarNowW;
  if (!solarId && !map.gridW && !map.houseW && !map.batteryW && !map.zappiW) return [];

  const rates = opts.rates ?? DEFAULT_TARIFF;
  const hourRows = map.gridW && opts.hourStats ? opts.hourStats[map.gridW] : undefined;

  const out: DayPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = localDayKey(d);
    const meters = metersForPeriod(stats, map, key, dayValue);
    const spend = daySpendPartsGbp(meters.gridIn, key, hourRows, rates);
    out.push({
      key,
      label: dayLabel(key),
      ...meters,
      importOffPeakKwh: Number(spend.lowKwh.toFixed(4)),
      importPeakKwh: Number(spend.highKwh.toFixed(4)),
      costOffPeak: spend.offPeak,
      costPeak: spend.peak,
      cost: spend.total,
    });
  }
  if (out.every((d) => !hasMeterSignal(d))) return [];
  return out;
}

/** Monthly kWh rows from recorder statistics (period: month). Empty → []. */
export function monthsFromStatistics(
  stats: HaStatisticsBag,
  map: HaMap,
  count: number,
  now = new Date(),
  opts: DaysFromStatisticsOpts = {},
): DayPoint[] {
  const solarId = map.solarTodayKwh ?? map.solarNowW;
  if (!solarId && !map.gridW && !map.houseW && !map.batteryW && !map.zappiW) return [];

  const rates = opts.rates ?? DEFAULT_TARIFF;
  const out: DayPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1, 12, 0, 0, 0);
    const key = localMonthKey(d);
    const meters = metersForPeriod(stats, map, key, monthValue);
    const spend = daySpendPartsGbp(meters.gridIn, key, undefined, rates);
    out.push({
      key,
      label: monthLabel(key),
      ...meters,
      // No hourly series for monthly buckets — window-hour weighting.
      importOffPeakKwh: Number(spend.lowKwh.toFixed(4)),
      importPeakKwh: Number(spend.highKwh.toFixed(4)),
      costOffPeak: spend.offPeak,
      costPeak: spend.peak,
      cost: spend.total,
    });
  }
  if (out.every((d) => !hasMeterSignal(d))) return [];
  return out;
}

export function historyEntityIds(map: HaMap): string[] {
  return [
    map.solarNowW,
    map.batteryW,
    map.soc,
    map.gridW,
    map.houseW,
    map.zappiW,
    map.solarTodayKwh,
  ].filter((id): id is string => Boolean(id));
}

/** Normalise HA history/history_during_period result into entity_id → points. */
export function normalizeHistoryResult(result: unknown): HaHistoryBag {
  if (!result) return {};
  // Object map already
  if (!Array.isArray(result) && typeof result === "object") {
    return result as HaHistoryBag;
  }
  // Legacy array-of-arrays
  if (Array.isArray(result)) {
    const bag: HaHistoryBag = {};
    for (const series of result) {
      if (!Array.isArray(series) || !series.length) continue;
      const first = series[0] as { entity_id?: string };
      const id = first.entity_id;
      if (!id) continue;
      bag[id] = series as HistPoint[];
    }
    return bag;
  }
  return {};
}
