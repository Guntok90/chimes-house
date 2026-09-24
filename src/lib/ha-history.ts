import { deriveHouseW } from "./energy-balance.ts";
import type { HaMap } from "./ha.ts";
import type { DayPoint, HourPoint } from "./house.ts";

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

/** Build 24 hourly points from live HA history. Empty → [] (never invent demo curves). */
export function hoursFromHistory(bag: HaHistoryBag, map: HaMap, now = new Date()): HourPoint[] {
  const solarId = map.solarNowW;
  const battId = map.batteryW;
  const socId = map.soc;
  const gridId = map.gridW;
  const houseId = map.houseW;
  const zappiId = map.zappiW;
  if (!solarId && !battId && !socId && !gridId) return [];

  const out: HourPoint[] = [];
  const end = new Date(now);
  end.setMinutes(0, 0, 0);
  for (let i = 23; i >= 0; i--) {
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
      hour: `${String(t.getHours()).padStart(2, "0")}:00`,
      soc: Math.round(soc),
      battW: Math.round(battW),
      solarW: Math.round(solarW),
      houseW,
      gridW: Math.round(gridW),
    });
  }
  return out;
}

function dayLabel(isoDay: string) {
  const d = new Date(`${isoDay}T12:00:00`);
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });
}

function dayValue(rows: HaStatRow[] | undefined, key: string): number {
  if (!rows?.length) return 0;
  const row = rows.find((r) => dayKeyFromStart(r.start) === key);
  if (!row) return 0;
  const change = num(row.change);
  if (change != null) return Number(change.toFixed(2));
  const state = num(row.state);
  if (state != null) return Number(state.toFixed(2));
  const sum = num(row.sum);
  if (sum != null) return Number(sum.toFixed(2));
  const mean = num(row.mean);
  // Power sensor mean W → rough daily kWh.
  if (mean != null) return Number(((mean * 24) / 1000).toFixed(2));
  return 0;
}

/** Daily kWh rows from recorder statistics. Empty → []. */
export function daysFromStatistics(
  stats: HaStatisticsBag,
  map: HaMap,
  count: number,
  now = new Date(),
): DayPoint[] {
  const solarId = map.solarTodayKwh ?? map.solarNowW;
  if (!solarId && !map.gridW && !map.houseW) return [];

  const out: DayPoint[] = [];
  for (let i = count - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = localDayKey(d);
    const solar = dayValue(solarId ? stats[solarId] : undefined, key);
    const house = dayValue(map.houseW ? stats[map.houseW] : undefined, key);
    const gridRaw = dayValue(map.gridW ? stats[map.gridW] : undefined, key);
    const gridIn = Math.max(0, gridRaw);
    const gridOut = Math.max(0, -gridRaw);
    out.push({
      key,
      label: dayLabel(key),
      solar,
      house,
      gridIn,
      gridOut,
      battCharge: 0,
      battDischarge: 0,
      cost: Number((gridIn * 0.226).toFixed(2)),
    });
  }
  if (out.every((d) => d.solar === 0 && d.house === 0 && d.gridIn === 0)) return [];
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
