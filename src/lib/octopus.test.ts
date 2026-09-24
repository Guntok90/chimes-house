import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_TARIFF,
  cheapFractionInLocalHour,
  gridSpendGbp,
  gridSpendPartsGbp,
  isIntelligentGoCheapLocal,
  splitDailyImportByWindow,
} from "./octopus.ts";

describe("octopus Intelligent Go helpers", () => {
  it("marks 23:30–05:30 local as cheap", () => {
    assert.equal(isIntelligentGoCheapLocal(new Date(2026, 8, 23, 23, 30)), true);
    assert.equal(isIntelligentGoCheapLocal(new Date(2026, 8, 23, 2, 0)), true);
    assert.equal(isIntelligentGoCheapLocal(new Date(2026, 8, 23, 5, 29)), true);
    assert.equal(isIntelligentGoCheapLocal(new Date(2026, 8, 23, 5, 30)), false);
    assert.equal(isIntelligentGoCheapLocal(new Date(2026, 8, 23, 12, 0)), false);
    assert.equal(isIntelligentGoCheapLocal(new Date(2026, 8, 23, 23, 29)), false);
  });

  it("cheapFractionInLocalHour handles half-hours at 23:00 and 05:00", () => {
    assert.equal(cheapFractionInLocalHour(new Date(2026, 8, 23, 23, 0)), 0.5);
    assert.equal(cheapFractionInLocalHour(new Date(2026, 8, 23, 0, 0)), 1);
    assert.equal(cheapFractionInLocalHour(new Date(2026, 8, 23, 4, 0)), 1);
    assert.equal(cheapFractionInLocalHour(new Date(2026, 8, 23, 5, 0)), 0.5);
    assert.equal(cheapFractionInLocalHour(new Date(2026, 8, 23, 12, 0)), 0);
  });

  it("gridSpendGbp is low×cheap + high×peak (not a flat average)", () => {
    // 10 kWh cheap @ 7p + 10 kWh peak @ 22.6p = 0.70 + 2.26 = 2.96
    assert.equal(gridSpendGbp(10, 10, DEFAULT_TARIFF), 2.96);
    // Flat average of 20 kWh @ 22.6p would be 4.52 — must differ.
    assert.notEqual(gridSpendGbp(10, 10, DEFAULT_TARIFF), Number((20 * 0.226).toFixed(2)));
  });

  it("gridSpendPartsGbp breaks out off-peak, peak, and total", () => {
    const parts = gridSpendPartsGbp(10, 10, DEFAULT_TARIFF);
    assert.equal(parts.lowKwh, 10);
    assert.equal(parts.highKwh, 10);
    assert.equal(parts.offPeak, 0.7);
    assert.equal(parts.peak, 2.26);
    assert.equal(parts.total, 2.96);
    assert.equal(parts.total, Number((parts.offPeak + parts.peak).toFixed(2)));
  });

  it("splitDailyImportByWindow uses 6/24 cheap hours", () => {
    const { lowKwh, highKwh } = splitDailyImportByWindow(24);
    assert.equal(lowKwh, 6);
    assert.equal(highKwh, 18);
  });
});
