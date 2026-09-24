/**
 * Octopus Intelligent Go tariff helpers (read-only).
 *
 * Cheap household window: 23:30–05:30 Europe/London (local wall clock).
 * Extra Intelligent smart-charge slots outside that window are not modelled
 * unless HA’s off-peak binary is already on — History uses the fixed window.
 *
 * Rates (£/kWh): prefer live HA rate sensors when mapped. Fallbacks match the
 * figures already used in this app (7p / 22.6p). Published Intelligent Go is
 * currently ~8p off-peak with a regional peak (~30–35p); HA sensors override.
 */

/** Fallback cheap rate (£/kWh) — same as demo / prior History assumption. */
export const FALLBACK_LOW_RATE_GBP = 0.07;

/** Fallback peak rate (£/kWh) — same as prior flat History multiplier. */
export const FALLBACK_HIGH_RATE_GBP = 0.226;

export type TariffRates = {
  lowGbpPerKwh: number;
  highGbpPerKwh: number;
  /** Where the numbers came from (never written back to HA). */
  source: "ha" | "fallback";
};

export const DEFAULT_TARIFF: TariffRates = {
  lowGbpPerKwh: FALLBACK_LOW_RATE_GBP,
  highGbpPerKwh: FALLBACK_HIGH_RATE_GBP,
  source: "fallback",
};

/** Minutes from local midnight — cheap window is [23:30, 24:00) ∪ [00:00, 05:30). */
export function isIntelligentGoCheapLocal(d: Date): boolean {
  const mins = d.getHours() * 60 + d.getMinutes();
  return mins >= 23 * 60 + 30 || mins < 5 * 60 + 30;
}

/**
 * Fraction of a local clock-hour bucket (starting at `hourStart`) that falls
 * inside the Intelligent Go cheap window. Half-hours at 23:00 and 05:00 are 0.5.
 */
export function cheapFractionInLocalHour(hourStart: Date): number {
  const h = hourStart.getHours();
  if (h === 23) return 0.5;
  if (h >= 0 && h <= 4) return 1;
  if (h === 5) return 0.5;
  return 0;
}

/** Off-peak / peak / total £ from grid import split across low / high rates. */
export type SpendPartsGbp = {
  /** Off-peak (cheap window) £. */
  offPeak: number;
  /** Peak / high £. */
  peak: number;
  /** Always offPeak + peak (Dad-facing total). */
  total: number;
};

/** Spend parts £ from grid import split across low / high rates. */
export function gridSpendPartsGbp(
  gridImportLowKwh: number,
  gridImportHighKwh: number,
  rates: Pick<TariffRates, "lowGbpPerKwh" | "highGbpPerKwh"> = DEFAULT_TARIFF,
): SpendPartsGbp {
  const low = Math.max(0, gridImportLowKwh);
  const high = Math.max(0, gridImportHighKwh);
  const offPeak = Number((low * rates.lowGbpPerKwh).toFixed(2));
  const peak = Number((high * rates.highGbpPerKwh).toFixed(2));
  return {
    offPeak,
    peak,
    total: Number((offPeak + peak).toFixed(2)),
  };
}

/** Spend £ from grid import split across low / high rates. */
export function gridSpendGbp(
  gridImportLowKwh: number,
  gridImportHighKwh: number,
  rates: Pick<TariffRates, "lowGbpPerKwh" | "highGbpPerKwh"> = DEFAULT_TARIFF,
): number {
  return gridSpendPartsGbp(gridImportLowKwh, gridImportHighKwh, rates).total;
}

/**
 * Best-effort split when only a daily import total exists (no hourly series).
 * Weights by cheap-window hours in a calendar day (6h / 24h). Approximate —
 * real import is not uniform; prefer hourly stats when available.
 */
export function splitDailyImportByWindow(gridInKwh: number): {
  lowKwh: number;
  highKwh: number;
} {
  const cheapHours = 6;
  const frac = cheapHours / 24;
  const lowKwh = Math.max(0, gridInKwh) * frac;
  const highKwh = Math.max(0, gridInKwh) - lowKwh;
  return { lowKwh, highKwh };
}
