/**
 * Custom £/kWh rates for Chimes display maths (History spend, Energy cost).
 *
 * These override dashboard maths only — they do NOT change Octopus’s real tariff
 * or any charge automation (including automation.charge_cars_at_off_peak).
 *
 * Persistence (preferred first):
 * 1) Home Assistant helpers — create these on the Pi, then restart / reload:
 *      input_number.chimes_tariff_cheap   (min 0, max 2, step 0.001, unit £/kWh)
 *      input_number.chimes_tariff_peak    (min 0, max 2, step 0.001, unit £/kWh)
 *    `number.chimes_tariff_cheap` / `number.chimes_tariff_peak` also work.
 * 2) Tablet localStorage (`chimes.tariffs`) until those helpers exist.
 */

export type TariffRates = {
  /** Off-peak / cheap £ per kWh (Intelligent Go night window). */
  cheap: number;
  /** Peak / high £ per kWh. */
  peak: number;
};

export type TariffSource = "ha" | "local" | "default";

export type TariffState = TariffRates & {
  source: TariffSource;
  /** True when the preferred HA helpers (or fuzzy matches) are mapped. */
  haHelpers: boolean;
};

/** Defaults match the previous hardcoded Intelligent Go-ish figures. */
export const DEFAULT_TARIFFS: TariffRates = {
  cheap: 0.07,
  peak: 0.226,
};

/**
 * Without hourly TOU import split, estimate daily spend as a blend.
 * ~25% of imported kWh at cheap (overnight Intelligent window), rest at peak.
 */
export const OFF_PEAK_IMPORT_SHARE = 0.25;

export const TARIFF_STORAGE_KEY = "chimes.tariffs";

/** Exact entity ids dad/Guy should create in Home Assistant. */
export const PREFERRED_TARIFF_ENTITIES = {
  cheap: ["input_number.chimes_tariff_cheap", "number.chimes_tariff_cheap"],
  peak: ["input_number.chimes_tariff_peak", "number.chimes_tariff_peak"],
} as const;

export function clampRate(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.min(2, Math.max(0, n));
}

export function parseRateInput(raw: string): number | null {
  const cleaned = raw.trim().replace(/£/g, "").replace(/,/g, "");
  if (!cleaned) return null;
  const n = Number.parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  return clampRate(n);
}

/** Daily import cost parts £ from kWh + custom rates (display estimate only). */
export function estimateImportCostParts(
  gridInKwh: number,
  rates: TariffRates,
): { costOffPeak: number; costPeak: number; cost: number } {
  const cheap = clampRate(rates.cheap);
  const peak = clampRate(rates.peak);
  const kwh = Math.max(0, gridInKwh);
  const lowKwh = kwh * OFF_PEAK_IMPORT_SHARE;
  const highKwh = kwh - lowKwh;
  const costOffPeak = Number((lowKwh * cheap).toFixed(2));
  const costPeak = Number((highKwh * peak).toFixed(2));
  return {
    costOffPeak,
    costPeak,
    cost: Number((costOffPeak + costPeak).toFixed(2)),
  };
}

/** Daily import cost £ from kWh + custom rates (display estimate only). */
export function estimateImportCost(gridInKwh: number, rates: TariffRates): number {
  return estimateImportCostParts(gridInKwh, rates).cost;
}

export function formatGbpPerKwh(n: number): string {
  return `£${clampRate(n).toFixed(3)}`;
}

export function readLocalTariffs(): TariffRates | null {
  try {
    const raw = localStorage.getItem(TARIFF_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TariffRates>;
    if (typeof parsed.cheap !== "number" || typeof parsed.peak !== "number") return null;
    return { cheap: clampRate(parsed.cheap), peak: clampRate(parsed.peak) };
  } catch {
    return null;
  }
}

export function writeLocalTariffs(rates: TariffRates) {
  localStorage.setItem(
    TARIFF_STORAGE_KEY,
    JSON.stringify({
      cheap: clampRate(rates.cheap),
      peak: clampRate(rates.peak),
    }),
  );
}

export function resolveTariffs(
  haRates: Partial<TariffRates> | null,
  local: TariffRates | null,
): TariffState {
  const haHelpers = Boolean(
    haRates && (typeof haRates.cheap === "number" || typeof haRates.peak === "number"),
  );
  if (haHelpers && haRates) {
    return {
      cheap: clampRate(haRates.cheap ?? local?.cheap ?? DEFAULT_TARIFFS.cheap),
      peak: clampRate(haRates.peak ?? local?.peak ?? DEFAULT_TARIFFS.peak),
      source: "ha",
      haHelpers: true,
    };
  }
  if (local) {
    return { ...local, source: "local", haHelpers: false };
  }
  return { ...DEFAULT_TARIFFS, source: "default", haHelpers: false };
}
