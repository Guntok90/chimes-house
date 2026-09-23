import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { daysFromStatistics, hoursFromHistory, normalizeHistoryResult } from "./ha-history.ts";
import type { HaMap } from "./ha.ts";

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
});
