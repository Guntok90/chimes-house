import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { autoMap, liveFromStates, type HaState } from "./ha.ts";
import { EMPTY_LIVE, SNAPSHOT } from "./house.ts";

function state(entity_id: string, value: string, friendly_name = ""): HaState {
  return {
    entity_id,
    state: value,
    attributes: friendly_name ? { friendly_name } : {},
  };
}

const CHIMES_PI: HaState[] = [
  state("sensor.zappi_generation_battery", "900", "Zappi Generation & Battery"),
  state("sensor.inverter_input_power", "1150"),
  state("sensor.inverter_active_power", "470"),
  state("sensor.inverter_daily_yield", "4.04"),
  state("sensor.inverter_status", "On-grid"),
  state("sensor.battery_1_state_of_capacity", "72"),
  state("sensor.battery_1_charge_discharge_power", "-380"),
  state("sensor.house_consumption", "520"),
  state("sensor.grid_active_power", "40"),
  state("sensor.zappi_charge_mode", "Eco+"),
  state("sensor.zappi_status", "Not Connected"),
  state("sensor.zappi_charging_power", "0"),
  state("binary_sensor.octopus_off_peak", "on"),
  state("binary_sensor.octopus_intelligent_ready", "off"),
  state("sun.sun", "above_horizon"),
];

describe("ha autoMap preferences", () => {
  it("maps the full HouseLive surface from preferred Pi entities", () => {
    const map = autoMap(CHIMES_PI);
    assert.equal(map.solarNowW, "sensor.inverter_input_power");
    assert.equal(map.solarTodayKwh, "sensor.inverter_daily_yield");
    assert.equal(map.inverterW, "sensor.inverter_active_power");
    assert.equal(map.inverterStatus, "sensor.inverter_status");
    assert.equal(map.soc, "sensor.battery_1_state_of_capacity");
    assert.equal(map.batteryW, "sensor.battery_1_charge_discharge_power");
    assert.equal(map.houseW, "sensor.house_consumption");
    assert.equal(map.gridW, "sensor.grid_active_power");
    assert.equal(map.zappiMode, "sensor.zappi_charge_mode");
    assert.ok(map.zappiPlugged);
    assert.equal(map.zappiW, "sensor.zappi_charging_power");
    assert.equal(map.offPeak, "binary_sensor.octopus_off_peak");
    assert.equal(map.intelligent, "binary_sensor.octopus_intelligent_ready");

    const live = liveFromStates(CHIMES_PI, map, EMPTY_LIVE);
    assert.equal(live.solarNowW, 1150);
    assert.equal(live.solarTodayKwh, 4.04);
    assert.equal(live.inverterW, 470);
    assert.equal(live.inverterStatus, "On-grid");
    assert.equal(live.soc, 72);
    assert.equal(live.batteryW, -380);
    assert.equal(live.houseW, 520);
    assert.equal(live.gridW, 40);
    assert.equal(live.zappiMode, "Eco+");
    assert.equal(live.zappiPlugged, false);
    assert.equal(live.zappiW, 0);
    assert.equal(live.offPeak, true);
    assert.equal(live.intelligent, false);
    assert.equal(live.sunAboveHorizon, true);
  });

  it("never blends SNAPSHOT demo solarToday when falling back", () => {
    const states = [
      state("sensor.inverter_input_power", "1100"),
      state("sun.sun", "above_horizon"),
    ];
    const live = liveFromStates(states, autoMap(states), EMPTY_LIVE);
    assert.equal(live.solarNowW, 1100);
    assert.equal(live.solarTodayKwh, 0);
    assert.notEqual(live.solarTodayKwh, SNAPSHOT.solarTodayKwh);
    assert.equal(live.soc, 0);
    assert.equal(live.houseW, 0);
  });

  it("does not treat low watts as dusk without sun.sun below horizon", () => {
    const states = [
      state("sensor.inverter_input_power", "0"),
      state("sensor.inverter_daily_yield", "4.04"),
      state("sun.sun", "above_horizon"),
    ];
    const live = liveFromStates(states, autoMap(states), EMPTY_LIVE);
    assert.equal(live.solarNowW, 0);
    assert.equal(live.sunAboveHorizon, true);
  });

  it("marks sun below horizon from sun.sun", () => {
    const states = [
      state("sensor.inverter_input_power", "0"),
      state("sun.sun", "below_horizon"),
    ];
    const live = liveFromStates(states, autoMap(states), EMPTY_LIVE);
    assert.equal(live.sunAboveHorizon, false);
  });

  it("keeps Huawei signed battery power (negative = discharging)", () => {
    const states = [
      state("sensor.battery_1_charge_discharge_power", "-250"),
      state("sensor.battery_1_state_of_capacity", "55"),
    ];
    const live = liveFromStates(states, autoMap(states), EMPTY_LIVE);
    assert.equal(live.batteryW, -250);
    assert.equal(live.soc, 55);
  });
});
