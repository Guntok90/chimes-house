import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { autoMap, liveFromStates, type HaState } from "./ha.ts";
import { SNAPSHOT } from "./house.ts";

function state(entity_id: string, value: string, friendly_name = ""): HaState {
  return {
    entity_id,
    state: value,
    attributes: friendly_name ? { friendly_name } : {},
  };
}

describe("ha autoMap preferences", () => {
  it("prefers inverter_input_power over zappi generation CT", () => {
    const states = [
      state("sensor.zappi_generation_battery", "900", "Zappi Generation & Battery"),
      state("sensor.inverter_input_power", "1150"),
      state("sensor.inverter_active_power", "470"),
      state("sensor.inverter_daily_yield", "4.04"),
      state("sensor.battery_1_state_of_capacity", "72"),
      state("sun.sun", "above_horizon"),
    ];
    const map = autoMap(states);
    assert.equal(map.solarNowW, "sensor.inverter_input_power");
    assert.equal(map.solarTodayKwh, "sensor.inverter_daily_yield");
    assert.equal(map.soc, "sensor.battery_1_state_of_capacity");
    assert.equal(map.inverterW, "sensor.inverter_active_power");

    const live = liveFromStates(states, map, SNAPSHOT);
    assert.equal(live.solarNowW, 1150);
    assert.equal(live.solarTodayKwh, 4.04);
    assert.equal(live.soc, 72);
    assert.equal(live.sunAboveHorizon, true);
  });

  it("does not treat low watts as dusk without sun.sun below horizon", () => {
    const states = [
      state("sensor.inverter_input_power", "0"),
      state("sensor.inverter_daily_yield", "4.04"),
      state("sun.sun", "above_horizon"),
    ];
    const live = liveFromStates(states, autoMap(states), SNAPSHOT);
    assert.equal(live.solarNowW, 0);
    assert.equal(live.sunAboveHorizon, true);
  });

  it("marks sun below horizon from sun.sun", () => {
    const states = [
      state("sensor.inverter_input_power", "0"),
      state("sun.sun", "below_horizon"),
    ];
    const live = liveFromStates(states, autoMap(states), SNAPSHOT);
    assert.equal(live.sunAboveHorizon, false);
  });
});
