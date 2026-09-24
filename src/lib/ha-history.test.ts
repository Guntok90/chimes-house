import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dayKeyFromStart,
  daySpendGbp,
  daysFromStatistics,
  hoursFromHistory,
  localDayKey,
  normalizeHistoryResult,
  splitGridImportForDay,
  type HaStatisticsBag,
} from "./ha-history.ts";
import type { HaMap } from "./ha.ts";
import { DEFAULT_TARIFF } from "./octopus.ts";

describe("ha history helpers", () => {
  const map: HaMap = {
    solarNowW: "sensor.inverter_input_power",
    batteryW: "sensor.batteries_charge_discharge_power",
    soc: "sensor.battery_1_state_of_capacity",
    gridW: "sensor.power_meter_active_power",
  };

  it("builds hourly points and derives houseW", () => {
    const now = new Date("2026-09-23T12:00:00Z");
    const bag = {
      "sensor.inverter_input_power": [{ s: "800", lu: now.getTime() / 1000 - 60 }],
      "sensor.batteries_charge_discharge_power": [{ s: "-200", lu: now.getTime() / 1000 - 60 }],
      "sensor.battery_1_state_of_capacity": [{ s: "70", lu: now.getTime() / 1000 - 60 }],
      "sensor.power_meter_active_power": [{ s: "50", lu: now.getTime() / 1000 - 60 }],
    };
    const hours = hoursFromHistory(bag, map, now);
    assert.equal(hours.length, 24);
    const last = hours[hours.length - 1];
    assert.equal(last.solarW, 800);
    assert.equal(last.battW, -200);
    assert.equal(last.soc, 70);
    assert.equal(last.houseW, 1050);
  });

  it("returns empty days when statistics are all zero", () => {
    assert.deepEqual(daysFromStatistics({}, map, 7), []);
  });

  it("normalises legacy history arrays", () => {
    const bag = normalizeHistoryResult([
      [
        { entity_id: "sensor.inverter_input_power", state: "1", last_changed: "2026-09-23T00:00:00Z" },
      ],
    ]);
    assert.ok(bag["sensor.inverter_input_power"]);
  });

  it("dayKeyFromStart accepts ISO strings", () => {
    assert.equal(dayKeyFromStart("2026-09-17T00:00:00+01:00"), "2026-09-17");
    assert.equal(dayKeyFromStart("2026-09-17T00:00:00.000Z"), "2026-09-17");
  });

  it("dayKeyFromStart accepts epoch milliseconds (number and numeric string)", () => {
    // Local noon on 2026-09-17 — stable across UTC± offsets used in CI.
    const noon = new Date(2026, 8, 17, 12, 0, 0, 0);
    assert.equal(dayKeyFromStart(noon.getTime()), "2026-09-17");
    assert.equal(dayKeyFromStart(String(noon.getTime())), "2026-09-17");
  });

  it("builds 7-day series from Pi-shaped stats (epoch ms start, mean set, change null)", () => {
    const now = new Date(2026, 8, 23, 15, 0, 0, 0); // local afternoon
    const solarId = "sensor.inverter_daily_yield";
    const gridId = "sensor.myenergi_chimes_power_grid";
    const houseId = "sensor.inverter_input_power";
    const liveMap: HaMap = {
      solarTodayKwh: solarId,
      solarNowW: houseId,
      gridW: gridId,
      houseW: houseId,
    };

    const stats: HaStatisticsBag = {};
    for (const id of [solarId, gridId, houseId]) {
      stats[id] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - i);
        stats[id].push({
          start: d.getTime(),
          end: d.getTime() + 24 * 60 * 60 * 1000,
          mean: id === houseId || id === gridId ? 400 + i * 10 : null,
          change: id === solarId ? 8.5 + i * 0.1 : null,
          state: null,
          sum: null,
        });
      }
    }

    const week = daysFromStatistics(stats, liveMap, 7, now);
    assert.equal(week.length, 7);
    assert.ok(week.every((d) => d.solar > 0));
    assert.equal(week[week.length - 1].key, localDayKey(now));

    const month = daysFromStatistics(stats, liveMap, 28, now);
    assert.equal(month.length, 28);
    // Days without rows stay 0; days with rows are non-zero — series is kept.
    assert.ok(month.some((d) => d.solar > 0));
    assert.ok(month.some((d) => d.gridIn > 0 || d.house > 0));
  });

  it("builds days from ISO start strings without throwing", () => {
    const now = new Date(2026, 8, 23, 15, 0, 0, 0);
    const solarId = "sensor.inverter_daily_yield";
    const liveMap: HaMap = { solarTodayKwh: solarId, gridW: "sensor.grid" };
    const key = localDayKey(now);
    const stats: HaStatisticsBag = {
      [solarId]: [{ start: `${key}T00:00:00+01:00`, change: 12.3, mean: null, state: null }],
      "sensor.grid": [{ start: `${key}T00:00:00.000Z`, mean: 500, change: null, state: null }],
    };
    const week = daysFromStatistics(stats, liveMap, 7, now);
    assert.equal(week.length, 7);
    const today = week[week.length - 1];
    assert.equal(today.solar, 12.3);
    assert.equal(today.gridIn, 12); // 500 W mean → 12 kWh
  });

  it("splits hourly grid import into cheap vs peak using Intelligent Go window", () => {
    const day = new Date(2026, 8, 23, 0, 0, 0, 0);
    const key = localDayKey(day);
    const rows = [];
    for (let h = 0; h < 24; h++) {
      const start = new Date(2026, 8, 23, h, 0, 0, 0);
      // 1 kWh import every hour
      rows.push({ start: start.getTime(), change: 1, mean: null, state: null });
    }
    const split = splitGridImportForDay(rows, key);
    assert.ok(split);
    // Cheap: 00–04 full (5) + 05 half (0.5) + 23 half (0.5) = 6
    assert.equal(split!.lowKwh, 6);
    assert.equal(split!.highKwh, 18);
  });

  it("day spend uses low×cheap + high×peak from hourly grid, not flat peak×total", () => {
    const day = new Date(2026, 8, 23, 0, 0, 0, 0);
    const key = localDayKey(day);
    const rows = [];
    for (let h = 0; h < 24; h++) {
      rows.push({
        start: new Date(2026, 8, 23, h, 0, 0, 0).getTime(),
        change: 1,
        mean: null,
        state: null,
      });
    }
    // 6×0.07 + 18×0.226 = 0.42 + 4.068 = 4.49
    assert.equal(daySpendGbp(24, key, rows, DEFAULT_TARIFF), 4.49);
    assert.notEqual(daySpendGbp(24, key, rows, DEFAULT_TARIFF), Number((24 * 0.226).toFixed(2)));
  });

  it("daysFromStatistics prefers hourly grid split for cost", () => {
    const now = new Date(2026, 8, 23, 15, 0, 0, 0);
    const key = localDayKey(now);
    const gridId = "sensor.myenergi_chimes_power_grid";
    const solarId = "sensor.inverter_daily_yield";
    const liveMap: HaMap = { solarTodayKwh: solarId, gridW: gridId };
    const stats: HaStatisticsBag = {
      [solarId]: [{ start: new Date(2026, 8, 23, 0, 0, 0, 0).getTime(), change: 5, mean: null }],
      [gridId]: [{ start: new Date(2026, 8, 23, 0, 0, 0, 0).getTime(), change: 24, mean: null }],
    };
    const hourRows = [];
    for (let h = 0; h < 24; h++) {
      hourRows.push({
        start: new Date(2026, 8, 23, h, 0, 0, 0).getTime(),
        change: 1,
        mean: null,
        state: null,
      });
    }
    const week = daysFromStatistics(stats, liveMap, 7, now, {
      hourStats: { [gridId]: hourRows },
      rates: DEFAULT_TARIFF,
    });
    const today = week.find((d) => d.key === key)!;
    assert.equal(today.gridIn, 24);
    assert.equal(today.cost, 4.49); // not 24 * 0.226 = 5.42
  });
});
