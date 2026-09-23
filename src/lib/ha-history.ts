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
  start: string;
  end?: string;
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
    const houseMapped = houseId ? sampleAt(bag[houseId], at) : null;
    const houseW =
      houseMapped != null ? Math.max(0, Math.round(houseMapped)) : deriveHouseW(solarW, gridW, battW);
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
  const row = rows.find((r) => (r.start ?? "").slice(0, 10) === key);
  if (!row) return 0;
  const change = num(row.change);
  if (change != null) return Number(change.toFixed(2));
  const state = num(row.state);
  if (state != null) return Number(state.toFixed(2));
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
    const key = d.toISOString().slice(0, 10);
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
  return [map.solarNowW, map.batteryW, map.soc, map.gridW, map.houseW, map.solarTodayKwh].filter(
    (id): id is string => Boolean(id),
  );
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
