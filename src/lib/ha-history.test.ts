import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  dayKeyFromStart,
  daysFromStatistics,
  hoursFromHistory,
  localDayKey,
  localMonthKey,
  monthKeyFromStart,
  monthsFromStatistics,
  normalizeHistoryResult,
  type HaStatisticsBag,
} from "./ha-history.ts";
import type { HaMap } from "./ha.ts";

describe("ha history helpers", () => {
  const map: HaMap = {
    solarNowW: "sensor.inverter_input_power",
    batteryW: "sensor.batteries_charge_discharge_power",
    soc: "sensor.battery_1_state_of_capacity",
    gridW: "sensor.power_meter_active_power",
    zappiW: "sensor.myenergi_chimes_power_charging",
  };

  it("builds hourly points and derives houseW including carW", () => {
    const now = new Date("2026-09-23T12:00:00Z");
    const bag = {
      "sensor.inverter_input_power": [{ s: "800", lu: now.getTime() / 1000 - 60 }],
      "sensor.batteries_charge_discharge_power": [{ s: "-200", lu: now.getTime() / 1000 - 60 }],
      "sensor.battery_1_state_of_capacity": [{ s: "70", lu: now.getTime() / 1000 - 60 }],
      "sensor.power_meter_active_power": [{ s: "50", lu: now.getTime() / 1000 - 60 }],
      "sensor.myenergi_chimes_power_charging": [{ s: "1500", lu: now.getTime() / 1000 - 60 }],
    };
    const hours = hoursFromHistory(bag, map, now);
    assert.equal(hours.length, 24);
    const last = hours[hours.length - 1];
    assert.equal(last.solarW, 800);
    assert.equal(last.battW, -200);
    assert.equal(last.soc, 70);
    assert.equal(last.carW, 1500);
    // house = solar + grid − battery − zappi = 800 + 50 − (−200) − 1500 = −450 → 0
    assert.equal(last.houseW, 0);
  });

  it("builds multi-day hourly series for Overview day scroll", () => {
    const now = new Date("2026-09-23T12:00:00Z");
    const bag = {
      "sensor.inverter_input_power": [{ s: "100", lu: now.getTime() / 1000 - 60 }],
    };
    const hours = hoursFromHistory(bag, { solarNowW: map.solarNowW }, now, 48);
    assert.equal(hours.length, 48);
    assert.match(hours[0].hour, / /); // weekday label when multi-day
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

  it("monthKeyFromStart accepts epoch milliseconds", () => {
    const mid = new Date(2026, 8, 15, 12, 0, 0, 0);
    assert.equal(monthKeyFromStart(mid.getTime()), "2026-09");
    assert.equal(monthKeyFromStart("2026-09-01T00:00:00.000Z"), "2026-09");
  });

  it("builds 7-day series from Pi-shaped stats (epoch ms start, mean set, change null)", () => {
    const now = new Date(2026, 8, 23, 15, 0, 0, 0); // local afternoon
    const solarId = "sensor.inverter_daily_yield";
    const gridId = "sensor.myenergi_chimes_power_grid";
    const houseId = "sensor.inverter_input_power";
    const battId = "sensor.batteries_charge_discharge_power";
    const carId = "sensor.myenergi_chimes_power_charging";
    const liveMap: HaMap = {
      solarTodayKwh: solarId,
      solarNowW: houseId,
      gridW: gridId,
      houseW: houseId,
      batteryW: battId,
      zappiW: carId,
    };

    const stats: HaStatisticsBag = {};
    for (const id of [solarId, gridId, houseId, battId, carId]) {
      stats[id] = [];
      for (let i = 6; i >= 0; i--) {
        const d = new Date(now);
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - i);
        stats[id].push({
          start: d.getTime(),
          end: d.getTime() + 24 * 60 * 60 * 1000,
          mean:
            id === houseId || id === gridId || id === battId || id === carId
              ? 400 + i * 10
              : null,
          change: id === solarId ? 8.5 + i * 0.1 : null,
          state: null,
          sum: null,
        });
      }
    }

    const week = daysFromStatistics(stats, liveMap, 7, now);
    assert.equal(week.length, 7);
    assert.ok(week.every((d) => d.solar > 0));
    assert.ok(week.every((d) => d.cars > 0));
    assert.ok(week.every((d) => d.battCharge > 0));
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
    assert.equal(today.cars, 0);
  });

  it("builds monthly year series from epoch-ms month starts", () => {
    const now = new Date(2026, 8, 23, 15, 0, 0, 0);
    const solarId = "sensor.inverter_daily_yield";
    const liveMap: HaMap = { solarTodayKwh: solarId, zappiW: "sensor.car" };
    const stats: HaStatisticsBag = { [solarId]: [], "sensor.car": [] };
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1, 0, 0, 0, 0);
      stats[solarId].push({ start: d.getTime(), change: 120 + i, mean: null, state: null });
      stats["sensor.car"].push({ start: d.getTime(), mean: 200, change: null, state: null });
    }
    const year = monthsFromStatistics(stats, liveMap, 12, now);
    assert.equal(year.length, 12);
    assert.equal(year[year.length - 1].key, localMonthKey(now));
    assert.ok(year.every((m) => m.solar > 0));
    assert.ok(year.every((m) => m.cars > 0));
  });
});
