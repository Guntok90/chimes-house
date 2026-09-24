import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveHouseW } from "./energy-balance.ts";
import {
  HOUSE_W_BLOCKLIST,
  PREFERRED,
  PREFERRED_SWITCHES,
  SPARES_AREA,
  areaSwitchesFromStates,
  autoMap,
  credsForBoot,
  demoAreaSwitches,
  groupSwitchesByArea,
  liveFromStates,
  wsFailureMessage,
  type HaState,
} from "./ha.ts";
import { EMPTY_LIVE, SNAPSHOT, solarStatusHint } from "./house.ts";

function state(
  entity_id: string,
  value: string,
  friendly_name = "",
  unit_of_measurement?: string,
): HaState {
  return {
    entity_id,
    state: value,
    attributes: {
      ...(friendly_name ? { friendly_name } : {}),
      ...(unit_of_measurement ? { unit_of_measurement } : {}),
    },
  };
}

/** Live Chimes-Pi inventory shape (ids from Dad’s HA). */
const CHIMES_PI: HaState[] = [
  state("sensor.inverter_input_power", "1150", "Inverter input power", "W"),
  state("sensor.inverter_active_power", "470", "Inverter active power", "W"),
  state("sensor.inverter_daily_yield", "4.04", "Inverter daily yield", "kWh"),
  state("sensor.inverter_device_status", "On-grid"),
  state("sensor.battery_1_state_of_capacity", "72", "", "%"),
  state("sensor.batteries_charge_discharge_power", "-380", "", "W"),
  state("sensor.power_meter_active_power", "40", "", "W"),
  state("sensor.power_meter_consumption", "128450.2", "", "kWh"),
  state("sensor.myenergi_chimes_power_grid", "40", "", "W"),
  state("sensor.myenergi_chimes_home_consumption", "7", "Home consumption", "W"),
  state("sensor.myenergi_chimes_power_charging", "0", "Power charging", "W"),
  state("select.myenergi_zappi_25435526_charge_mode", "Eco+"),
  state("sensor.myenergi_zappi_25435526_status", "Not Connected"),
  state("sensor.myenergi_zappi_25435526_plug_status", "Not Connected"),
  state("sensor.myenergi_zappi_25435526_power_ct_internal", "0", "", "W"),
  state("sensor.myenergi_zappi_25435526_power_generation", "900", "Generation", "W"),
  state("binary_sensor.octopus_off_peak", "on"),
  state("binary_sensor.octopus_intelligent_ready", "off"),
  state("person.stevie_w", "home"),
  state("sun.sun", "above_horizon"),
  state("switch.smart_switch_4", "on", "Lamp"),
  state("switch.smart_switch", "off", "Telly"),
  state("switch.smart_switch_2", "off", "Stevie’s blanket"),
  state("switch.smart_switch_5", "off", "Baby’s blanket"),
  state("switch.smart_switch_6", "on", "Fish"),
  state("switch.pergola_switch_1", "off", "Pergola"),
  state("switch.pond_1_switch_1", "on", "Pond 1"),
  state("switch.pond_2_switch_1", "off", "Pond 2"),
];

describe("ha autoMap preferences", () => {
  it("maps the full HouseLive surface from live Chimes-Pi entities", () => {
    const map = autoMap(CHIMES_PI);
    assert.equal(map.solarNowW, "sensor.inverter_input_power");
    assert.equal(map.solarTodayKwh, "sensor.inverter_daily_yield");
    assert.equal(map.inverterW, "sensor.inverter_active_power");
    assert.equal(map.inverterStatus, "sensor.inverter_device_status");
    assert.equal(map.soc, "sensor.battery_1_state_of_capacity");
    assert.equal(map.batteryW, "sensor.batteries_charge_discharge_power");
    assert.equal(map.gridW, "sensor.myenergi_chimes_power_grid");
    assert.equal(map.zappiMode, "select.myenergi_zappi_25435526_charge_mode");
    assert.equal(map.zappiPlugged, "sensor.myenergi_zappi_25435526_plug_status");
    assert.equal(map.zappiW, "sensor.myenergi_chimes_power_charging");
    assert.notEqual(map.zappiW, "sensor.myenergi_zappi_25435526_power_generation");
    assert.equal(map.stevieHome, "person.stevie_w");
    assert.equal(map.offPeak, "binary_sensor.octopus_off_peak");
    assert.equal(map.intelligent, "binary_sensor.octopus_intelligent_ready");
    // No true house-load W → leave unmapped (derive later); never lifetime kWh or myenergi home.
    assert.equal(map.houseW, undefined);
    assert.notEqual(map.houseW, "sensor.power_meter_consumption");
    assert.notEqual(map.houseW, "sensor.myenergi_chimes_home_consumption");
    assert.equal(HOUSE_W_BLOCKLIST.includes("sensor.power_meter_consumption"), true);
    assert.equal(HOUSE_W_BLOCKLIST.includes("sensor.myenergi_chimes_home_consumption"), true);
    assert.equal(PREFERRED.houseW?.includes("sensor.power_meter_consumption"), false);
    assert.equal(PREFERRED.houseW?.includes("sensor.myenergi_chimes_home_consumption"), false);

    const live = liveFromStates(CHIMES_PI, map, EMPTY_LIVE);
    assert.equal(live.solarNowW, 1150);
    assert.equal(live.solarTodayKwh, 4.04);
    assert.equal(live.inverterW, 470);
    assert.equal(live.inverterStatus, "On-grid");
    assert.equal(live.soc, 72);
    assert.equal(live.batteryW, -380);
    assert.equal(live.gridW, 40);
    assert.equal(live.zappiMode, "Eco+");
    assert.equal(live.zappiPlugged, false);
    assert.equal(live.zappiW, 0);
    assert.equal(live.stevieHome, true);
    assert.equal(live.offPeak, true);
    assert.equal(live.intelligent, false);
    assert.equal(live.sunAboveHorizon, true);
    // houseW = solar + grid − battery − zappi = 1150 + 40 − (−380) − 0 = 1570
    assert.equal(live.houseW, deriveHouseW(1150, 40, -380, 0));
    assert.equal(live.houseW, 1570);
    assert.notEqual(live.solarTodayKwh, SNAPSHOT.solarTodayKwh);
    assert.notEqual(live.houseW, 7);
    assert.notEqual(live.houseW, SNAPSHOT.houseW);
  });

  it("maps preferred switch entity ids (kitchen stays unmapped)", () => {
    const map = autoMap(CHIMES_PI);
    assert.equal(map.lamp, PREFERRED_SWITCHES.lamp![0]);
    assert.equal(map.telly, "switch.smart_switch");
    assert.equal(map["stevie-blanket"], "switch.smart_switch_2");
    assert.equal(map["baby-blanket"], "switch.smart_switch_5");
    assert.equal(map.fish, "switch.smart_switch_6");
    assert.equal(map.pergola, "switch.pergola_switch_1");
    assert.equal(map["pond-1"], "switch.pond_1_switch_1");
    assert.equal(map["pond-2"], "switch.pond_2_switch_1");
    assert.equal(map.kitchen, undefined);
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
    // Derived from solar only: 1100 + 0 − 0 − 0
    assert.equal(live.houseW, 1100);
    assert.notEqual(live.houseW, SNAPSHOT.houseW);
  });

  it("rejects lifetime kWh as houseW and derives instead", () => {
    const states = [
      state("sensor.inverter_input_power", "500", "", "W"),
      state("sensor.batteries_charge_discharge_power", "-200", "", "W"),
      state("sensor.power_meter_active_power", "100", "", "W"),
      state("sensor.power_meter_consumption", "99999", "", "kWh"),
    ];
    const map = autoMap(states);
    assert.notEqual(map.houseW, "sensor.power_meter_consumption");
    const live = liveFromStates(states, map, EMPTY_LIVE);
    assert.equal(live.houseW, deriveHouseW(500, 100, -200, 0));
    assert.equal(live.houseW, 800);
  });

  it("never maps myenergi home consumption as houseW", () => {
    const states = [
      state("sensor.inverter_input_power", "392", "", "W"),
      state("sensor.batteries_charge_discharge_power", "-4819", "", "W"),
      state("sensor.myenergi_chimes_power_grid", "3015", "", "W"),
      state("sensor.myenergi_chimes_home_consumption", "7", "Home consumption", "W"),
      state("sensor.myenergi_chimes_power_charging", "7533", "", "W"),
      state("sensor.power_meter_active_power", "-999", "", "W"),
    ];
    const map = autoMap(states);
    assert.equal(map.houseW, undefined);
    assert.notEqual(map.houseW, "sensor.myenergi_chimes_home_consumption");
    assert.equal(map.gridW, "sensor.myenergi_chimes_power_grid");
    assert.equal(map.zappiW, "sensor.myenergi_chimes_power_charging");
    assert.equal(map.solarNowW, "sensor.inverter_input_power");

    // Stale map pointing at myenergi home must still derive, not use 7 W.
    const staleMap = {
      ...map,
      houseW: "sensor.myenergi_chimes_home_consumption",
    };
    const live = liveFromStates(states, staleMap, EMPTY_LIVE);
    // 392 + 3015 − (−4819) − 7533 = 693
    assert.equal(live.houseW, deriveHouseW(392, 3015, -4819, 7533));
    assert.equal(live.houseW, 693);
    assert.notEqual(live.houseW, 7);
  });

  it("derives houseW excluding zappi when car is charging", () => {
    const states = [
      state("sensor.inverter_input_power", "392", "", "W"),
      state("sensor.batteries_charge_discharge_power", "-4819", "", "W"),
      state("sensor.myenergi_chimes_power_grid", "3015", "", "W"),
      state("sensor.myenergi_chimes_power_charging", "7533", "", "W"),
    ];
    const live = liveFromStates(states, autoMap(states), EMPTY_LIVE);
    assert.equal(live.zappiW, 7533);
    assert.equal(live.houseW, 693);
  });

  it("when zappiW is 0, houseW = solar + grid − battery", () => {
    const states = [
      state("sensor.inverter_input_power", "1000", "", "W"),
      state("sensor.batteries_charge_discharge_power", "200", "", "W"),
      state("sensor.myenergi_chimes_power_grid", "-300", "", "W"),
      state("sensor.myenergi_chimes_power_charging", "0", "", "W"),
    ];
    const live = liveFromStates(states, autoMap(states), EMPTY_LIVE);
    assert.equal(live.zappiW, 0);
    assert.equal(live.houseW, deriveHouseW(1000, -300, 200, 0));
    assert.equal(live.houseW, 500);
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
    const states = [state("sensor.inverter_input_power", "0"), state("sun.sun", "below_horizon")];
    const live = liveFromStates(states, autoMap(states), EMPTY_LIVE);
    assert.equal(live.sunAboveHorizon, false);
  });

  it("says after dusk only for a live sun below the horizon", () => {
    const day = { ...EMPTY_LIVE, solarNowW: 0, sunAboveHorizon: true };
    const night = { ...EMPTY_LIVE, solarNowW: 0, sunAboveHorizon: false };
    assert.equal(solarStatusHint("live", day), "idle");
    assert.equal(solarStatusHint("live", night), "after dusk");
    assert.equal(solarStatusHint("live", { ...day, solarNowW: 1239 }), "producing");
    assert.equal(solarStatusHint("error", night), "not connected");
    assert.equal(solarStatusHint("demo", SNAPSHOT), "demo");
  });

  it("keeps Huawei signed battery power (negative = discharging)", () => {
    const states = [
      state("sensor.batteries_charge_discharge_power", "-250"),
      state("sensor.battery_1_state_of_capacity", "55"),
    ];
    const live = liveFromStates(states, autoMap(states), EMPTY_LIVE);
    assert.equal(live.batteryW, -250);
    assert.equal(live.soc, 55);
  });
});

describe("deriveHouseW energy balance", () => {
  it("solar + grid − battery − zappi (charging positive, discharging negative)", () => {
    assert.equal(deriveHouseW(1000, -300, 200), 500);
    assert.equal(deriveHouseW(0, 0, -400), 400);
    assert.equal(deriveHouseW(0, 500, 0), 500);
    assert.equal(deriveHouseW(200, 50, -100), 350);
    assert.equal(deriveHouseW(392, 3015, -4819, 7533), 693);
    assert.equal(deriveHouseW(1000, -300, 200, 0), 500);
  });

  it("clamps noise below zero to 0", () => {
    assert.equal(deriveHouseW(0, -100, 50), 0);
    assert.equal(deriveHouseW(100, 0, 0, 200), 0);
  });
});

describe("browser boot creds", () => {
  it("prefers the session bootstrap over a saved browser token", () => {
    const creds = credsForBoot(
      {
        configured: true,
        url: "https://chimes-pi.tail8e29b8.ts.net/",
        token: "server-token",
      },
      { url: "http://localhost:8123", token: "old" },
    );
    assert.deepEqual(creds, {
      url: "https://chimes-pi.tail8e29b8.ts.net",
      token: "server-token",
    });
  });

  it("uses a saved token when the host has no HA_TOKEN", () => {
    const saved = { url: "https://chimes-pi.tail8e29b8.ts.net", token: "pasted" };
    assert.equal(credsForBoot({ configured: false }, saved), saved);
    assert.equal(credsForBoot(null, null), null);
  });

  it("explains a failed socket as a Tailscale reachability problem", () => {
    assert.match(wsFailureMessage("Could not reach Home Assistant."), /Tailscale/);
    assert.equal(wsFailureMessage("Token refused."), "Token refused.");
  });
});

describe("area-grouped switches (Home)", () => {
  it("lists every switch including unassigned Spares", () => {
    const states: HaState[] = [
      state("switch.smart_switch_4", "on", "Lamp"),
      state("switch.smart_switch_7", "off", "Spare Meross"),
      state("light.kitchen_spots", "on", "Kitchen"),
      state("sensor.inverter_input_power", "100", "", "W"),
    ];
    const areas = [
      { area_id: "living", name: "Living room" },
      { area_id: "spares", name: "Spares" },
    ];
    const entities = [
      { entity_id: "switch.smart_switch_4", area_id: "living", name: null },
      { entity_id: "switch.smart_switch_7", area_id: "spares", name: null },
      { entity_id: "light.kitchen_spots", area_id: null, name: null },
    ];
    const list = areaSwitchesFromStates(states, areas, entities);
    assert.equal(list.length, 3);
    assert.equal(list.find((s) => s.entityId === "switch.smart_switch_4")?.area, "Living room");
    assert.equal(list.find((s) => s.entityId === "switch.smart_switch_7")?.area, "Spares");
    assert.equal(list.find((s) => s.entityId === "light.kitchen_spots")?.area, SPARES_AREA);
    assert.equal(list.find((s) => s.entityId === "switch.smart_switch_4")?.on, true);
  });

  it("skips disabled or hidden registry entities", () => {
    const states = [
      state("switch.smart_switch_4", "on", "Lamp"),
      state("switch.hidden_spare", "off", "Hidden"),
    ];
    const entities = [
      { entity_id: "switch.smart_switch_4", area_id: null, name: null },
      {
        entity_id: "switch.hidden_spare",
        area_id: null,
        name: null,
        disabled_by: "user",
        hidden_by: null,
      },
    ];
    const list = areaSwitchesFromStates(states, [], entities);
    assert.equal(list.length, 1);
    assert.equal(list[0].entityId, "switch.smart_switch_4");
    assert.equal(list[0].area, SPARES_AREA);
  });

  it("puts Spares last when grouping", () => {
    const groups = groupSwitchesByArea([
      {
        entityId: "switch.a",
        label: "A",
        area: SPARES_AREA,
        on: false,
        available: true,
      },
      {
        entityId: "switch.b",
        label: "B",
        area: "Garden",
        on: true,
        available: true,
      },
      {
        entityId: "switch.c",
        label: "C",
        area: "Bedrooms",
        on: false,
        available: true,
      },
    ]);
    assert.deepEqual(
      groups.map((g) => g.area),
      ["Bedrooms", "Garden", "Spares"],
    );
  });

  it("demo list includes Spares plugs", () => {
    const demo = demoAreaSwitches({ lamp: true });
    assert.ok(demo.some((s) => s.area === SPARES_AREA));
    assert.equal(demo.find((s) => s.entityId === "demo.lamp")?.on, true);
  });
});
