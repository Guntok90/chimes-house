import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  DEFAULT_TARIFFS,
  OFF_PEAK_IMPORT_SHARE,
  clampRate,
  estimateImportCost,
  parseRateInput,
  resolveTariffs,
} from "./tariffs.ts";

describe("tariffs", () => {
  it("clamps rates to 0–2 £/kWh", () => {
    assert.equal(clampRate(-1), 0);
    assert.equal(clampRate(3), 2);
    assert.equal(clampRate(0.226), 0.226);
  });

  it("parses £/kWh draft input", () => {
    assert.equal(parseRateInput("0.07"), 0.07);
    assert.equal(parseRateInput("£0.226"), 0.226);
    assert.equal(parseRateInput(""), null);
    assert.equal(parseRateInput("abc"), null);
  });

  it("estimates import cost with the off-peak blend", () => {
    const rates = { cheap: 0.1, peak: 0.3 };
    const blended = 0.1 * OFF_PEAK_IMPORT_SHARE + 0.3 * (1 - OFF_PEAK_IMPORT_SHARE);
    assert.equal(estimateImportCost(10, rates), Number((10 * blended).toFixed(2)));
    assert.equal(estimateImportCost(0, DEFAULT_TARIFFS), 0);
  });

  it("prefers HA rates over local, then defaults", () => {
    const fromHa = resolveTariffs({ cheap: 0.08, peak: 0.24 }, { cheap: 0.05, peak: 0.2 });
    assert.equal(fromHa.source, "ha");
    assert.equal(fromHa.cheap, 0.08);
    assert.equal(fromHa.haHelpers, true);

    const fromLocal = resolveTariffs(null, { cheap: 0.05, peak: 0.2 });
    assert.equal(fromLocal.source, "local");
    assert.equal(fromLocal.peak, 0.2);

    const fromDefault = resolveTariffs(null, null);
    assert.equal(fromDefault.source, "default");
    assert.deepEqual(
      { cheap: fromDefault.cheap, peak: fromDefault.peak },
      DEFAULT_TARIFFS,
    );
  });

  it("fills missing HA half from local/default", () => {
    const partial = resolveTariffs({ cheap: 0.09 }, { cheap: 0.01, peak: 0.3 });
    assert.equal(partial.cheap, 0.09);
    assert.equal(partial.peak, 0.3);
    assert.equal(partial.source, "ha");
  });
});
