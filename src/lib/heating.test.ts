import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { HaDeviceReg, HaEntityReg, HaState } from "./ha.ts";
import {
  NEST_SCHEDULE_NOTE,
  demoHeatingControl,
  formatNestTemp,
  heatingControlFromInventory,
  heatingForScreen,
  heatingHistoryFromResult,
  isNestDevice,
  nestAmbientBadge,
  nestSetLines,
  stepHeatingTarget,
  unmappedHeatingControl,
} from "./heating.ts";

function climate(
  entity_id: string,
  state: string,
  attributes: Record<string, unknown>,
): HaState {
  return { entity_id, state, attributes };
}

const DOWNSTAIRS = "climate.downstairs";

function nestDevice(): HaDeviceReg {
  return {
    id: "dev-nest",
    area_id: "hall",
    name: "Downstairs",
    name_by_user: null,
    manufacturer: "Google Nest",
    model: "Thermostat",
    identifiers: [["nest", "enterprises/chimes/devices/abc"]],
  };
}

function nestEntity(): HaEntityReg {
  return {
    entity_id: DOWNSTAIRS,
    area_id: null,
    device_id: "dev-nest",
    name: null,
  };
}

describe("Nest discovery", () => {
  it("maps the climate entity on a Nest device even when the name is not Nest", () => {
    const states = [
      climate(DOWNSTAIRS, "heat", {
        friendly_name: "Downstairs",
        current_temperature: 19.5,
        temperature: 21,
        hvac_modes: ["heat", "off"],
        hvac_action: "heating",
        preset_mode: "none",
        preset_modes: ["eco", "none"],
        min_temp: 10,
        max_temp: 32,
        target_temp_step: 0.5,
      }),
      climate("climate.bedroom_ac", "cool", {
        friendly_name: "Bedroom AC",
        current_temperature: 22,
        temperature: 23,
        hvac_modes: ["cool", "off"],
      }),
    ];
    const heating = heatingControlFromInventory(states, [nestDevice()], [nestEntity()]);
    assert.equal(heating.entityId, DOWNSTAIRS);
    assert.equal(heating.label, "Downstairs");
    assert.equal(heating.currentC, 19.5);
    assert.equal(heating.targetC, 21);
    assert.equal(heating.hvacMode, "heat");
    assert.deepEqual(heating.hvacModes, ["heat", "off"]);
    assert.equal(heating.ecoSupported, true);
    assert.equal(heating.eco, false);
    assert.equal(heating.setpointWritable, true);
    assert.equal(heating.scheduleEntityId, null);
    assert.equal(heating.scheduleNote, NEST_SCHEDULE_NOTE);
    assert.deepEqual(nestSetLines(heating), [{ label: "HEAT SET TO", c: 21 }]);
  });

  it("does not invent a climate entity when the Pi has no Nest", () => {
    const states = [
      climate("climate.bedroom_ac", "cool", {
        friendly_name: "Bedroom AC",
        current_temperature: 22,
        temperature: 23,
        hvac_modes: ["cool", "off"],
      }),
    ];
    const heating = heatingControlFromInventory(states, [], []);
    assert.equal(heating.entityId, null);
    assert.equal(heating.available, false);
    assert.equal(heating.currentC, null);
    assert.equal(heating.scheduleNote, null);
  });

  it("matches a climate whose own name says Nest when the registry is empty", () => {
    const heating = heatingControlFromInventory([
      climate("climate.nest_thermostat", "off", {
        friendly_name: "Nest Thermostat",
        current_temperature: 18,
        hvac_modes: ["heat", "off"],
        preset_modes: ["eco", "none"],
        preset_mode: "none",
      }),
    ]);
    assert.equal(heating.entityId, "climate.nest_thermostat");
    assert.equal(heating.hvacMode, "off");
    assert.equal(heating.setpointWritable, false);
    assert.deepEqual(nestSetLines(heating), [{ label: "OFF", c: null }]);
  });

  it("treats eco as the Nest preset and blocks setpoint writes", () => {
    const heating = heatingControlFromInventory(
      [
        climate(DOWNSTAIRS, "heat", {
          current_temperature: 17,
          temperature: 15,
          hvac_modes: ["heat", "off"],
          preset_mode: "eco",
          preset_modes: ["eco", "none"],
          hvac_action: "idle",
        }),
      ],
      [nestDevice()],
      [nestEntity()],
    );
    assert.equal(heating.eco, true);
    assert.equal(heating.setpointWritable, false);
    assert.deepEqual(nestSetLines(heating), [{ label: "ECO", c: 15 }]);
  });

  it("exposes a schedule entity only when it sits on the Nest device", () => {
    const schedule: HaState = {
      entity_id: "select.downstairs_schedule",
      state: "Weekday",
      attributes: { friendly_name: "Downstairs schedule", options: ["Weekday", "Weekend"] },
    };
    const decoy: HaState = {
      entity_id: "schedule.garden_lights",
      state: "on",
      attributes: { friendly_name: "Garden lights schedule" },
    };
    const entities: HaEntityReg[] = [
      nestEntity(),
      {
        entity_id: "select.downstairs_schedule",
        area_id: null,
        device_id: "dev-nest",
        name: "Schedule",
      },
      {
        entity_id: "schedule.garden_lights",
        area_id: null,
        device_id: "dev-other",
        name: "Garden lights schedule",
      },
    ];
    const heating = heatingControlFromInventory(
      [
        climate(DOWNSTAIRS, "heat", {
          current_temperature: 20,
          temperature: 20,
          hvac_modes: ["heat", "off"],
        }),
        schedule,
        decoy,
      ],
      [nestDevice()],
      entities,
    );
    assert.equal(heating.scheduleEntityId, "select.downstairs_schedule");
    assert.equal(heating.scheduleState, "Weekday");
    assert.deepEqual(heating.scheduleOptions, ["Weekday", "Weekend"]);
    assert.equal(heating.scheduleNote, null);
  });

  it("recognises the nest identifier domain without the word Nest in the name", () => {
    assert.equal(
      isNestDevice({
        id: "x",
        area_id: null,
        name: "Hall",
        identifiers: [["nest", "enterprises/p/devices/1"]],
      }),
      true,
    );
    assert.equal(
      isNestDevice({
        id: "y",
        area_id: null,
        name: "Hall",
        manufacturer: "Someone",
        identifiers: [["hue", "lamp"]],
      }),
      false,
    );
  });

  it("maps Nest Legacy even when the manufacturer is Google and the name is not Nest", () => {
    const states = [
      climate("climate.hallway", "heat", {
        friendly_name: "Hallway",
        current_temperature: 18.5,
        temperature: 20,
        hvac_modes: ["heat", "cool", "heat_cool", "off"],
        hvac_action: "idle",
        preset_mode: "none",
        preset_modes: ["none", "eco"],
      }),
      climate("climate.bedroom_ac", "cool", {
        friendly_name: "Bedroom AC",
        current_temperature: 22,
        temperature: 23,
        hvac_modes: ["cool", "off"],
      }),
    ];
    const heating = heatingControlFromInventory(
      states,
      [
        {
          id: "dev-legacy",
          area_id: "hall",
          name: "Hallway",
          manufacturer: "Google",
          model: "Thermostat",
          identifiers: [["nest_legacy", "09AA01AC351406WN"]],
        },
      ],
      [
        {
          entity_id: "climate.hallway",
          area_id: null,
          device_id: "dev-legacy",
          name: null,
          platform: "nest_legacy",
        },
      ],
    );
    assert.equal(heating.entityId, "climate.hallway");
    assert.equal(heating.integration, "nest_legacy");
    assert.equal(heating.label, "Hallway");
    assert.equal(heating.currentC, 18.5);
    assert.equal(heating.targetC, 20);
    assert.equal(heating.ecoSupported, true);
    assert.equal(heating.setpointWritable, true);
    assert.equal(nestAmbientBadge(heating), "20°");
    assert.deepEqual(nestSetLines(heating), [{ label: "HEAT SET TO", c: 20 }]);
  });

  it("lets Nest Legacy change the setpoint while Eco is on", () => {
    const heating = heatingControlFromInventory(
      [
        climate("climate.hallway", "heat", {
          current_temperature: 17,
          temperature: 15,
          hvac_modes: ["heat", "off"],
          preset_mode: "eco",
          preset_modes: ["none", "eco"],
          hvac_action: "idle",
        }),
      ],
      [
        {
          id: "dev-legacy",
          area_id: null,
          name: "Hallway",
          manufacturer: "Google",
          identifiers: [["nest_legacy", "serial"]],
        },
      ],
      [
        {
          entity_id: "climate.hallway",
          area_id: null,
          device_id: "dev-legacy",
          platform: "nest_legacy",
        },
      ],
    );
    assert.equal(heating.eco, true);
    assert.equal(heating.integration, "nest_legacy");
    assert.equal(heating.setpointWritable, true);
    assert.deepEqual(nestSetLines(heating), [{ label: "ECO", c: 15 }]);
    assert.equal(nestAmbientBadge(heating), "15°");
  });

  it("uses the entity platform when the device registry has not arrived", () => {
    const heating = heatingControlFromInventory(
      [
        climate("climate.living_room", "heat", {
          friendly_name: "Living Room",
          current_temperature: 19,
          temperature: 21,
          hvac_modes: ["heat", "off"],
        }),
      ],
      [],
      [
        {
          entity_id: "climate.living_room",
          area_id: null,
          device_id: null,
          platform: "nest_legacy",
        },
      ],
    );
    assert.equal(heating.entityId, "climate.living_room");
    assert.equal(heating.integration, "nest_legacy");
  });

  it("uses the only climate when Nest Legacy is installed and registries are empty", () => {
    const heating = heatingControlFromInventory([
      {
        entity_id: "update.nest_legacy_update",
        state: "off",
        attributes: { friendly_name: "Nest Legacy update" },
      },
      climate("climate.hallway", "heat", {
        friendly_name: "Hallway",
        current_temperature: 19,
        temperature: 21,
        hvac_modes: ["heat", "off"],
        preset_modes: ["none", "eco"],
        preset_mode: "none",
      }),
    ]);
    assert.equal(heating.entityId, "climate.hallway");
    assert.equal(heating.integration, "nest_legacy");
    assert.equal(heating.targetC, 21);
  });

  it("does not guess when Nest Legacy is installed beside another climate", () => {
    const heating = heatingControlFromInventory([
      {
        entity_id: "update.nest_legacy_update",
        state: "off",
        attributes: {},
      },
      climate("climate.hallway", "heat", {
        friendly_name: "Hallway",
        current_temperature: 19,
        temperature: 21,
        hvac_modes: ["heat", "off"],
      }),
      climate("climate.bedroom_ac", "cool", {
        friendly_name: "Bedroom AC",
        current_temperature: 22,
        temperature: 23,
        hvac_modes: ["cool", "off"],
      }),
    ]);
    assert.equal(heating.entityId, null);
  });

  it("prefers the downstairs Nest over an upstairs one", () => {
    const states = [
      climate("climate.upstairs", "heat", {
        friendly_name: "Upstairs",
        current_temperature: 18,
        temperature: 18,
        hvac_modes: ["heat", "off"],
      }),
      climate("climate.downstairs", "heat", {
        friendly_name: "Downstairs",
        current_temperature: 19,
        temperature: 21,
        hvac_modes: ["heat", "off"],
      }),
    ];
    const heating = heatingControlFromInventory(
      states,
      [
        {
          id: "up",
          area_id: null,
          name: "Upstairs",
          manufacturer: "Google",
          identifiers: [["nest_legacy", "up"]],
        },
        {
          id: "down",
          area_id: null,
          name: "Downstairs",
          manufacturer: "Google",
          identifiers: [["nest_legacy", "down"]],
        },
      ],
      [
        { entity_id: "climate.upstairs", area_id: null, device_id: "up", platform: "nest_legacy" },
        {
          entity_id: "climate.downstairs",
          area_id: null,
          device_id: "down",
          platform: "nest_legacy",
        },
      ],
    );
    assert.equal(heating.entityId, "climate.downstairs");
  });

  it("treats a Nest Legacy device as Nest without the word Nest in the name", () => {
    assert.equal(
      isNestDevice({
        id: "legacy",
        area_id: null,
        name: "Hallway",
        manufacturer: "Google",
        model: "Thermostat",
        identifiers: [["nest_legacy", "serial"]],
      }),
      true,
    );
  });
});

describe("Nest screen helpers", () => {
  it("formats whole and half degrees the way the thermostat reads", () => {
    assert.equal(formatNestTemp(21), "21°");
    assert.equal(formatNestTemp(19.5), "19.5°");
    assert.equal(formatNestTemp(null), "—");
  });

  it("steps the setpoint on the Nest half-degree and clamps", () => {
    assert.equal(stepHeatingTarget(21, 1, 0.5, 10, 32), 21.5);
    assert.equal(stepHeatingTarget(21, -1, 0.5, 10, 32), 20.5);
    assert.equal(stepHeatingTarget(32, 1, 0.5, 10, 32), 32);
    assert.equal(stepHeatingTarget(10, -1, 0.5, 10, 32), 10);
  });

  it("keeps demo numbers off the live screen", () => {
    const demo = demoHeatingControl();
    assert.equal(heatingForScreen("demo", unmappedHeatingControl()).entityId, "demo.climate");
    assert.equal(heatingForScreen("demo", { ...demo, targetC: 22 }).targetC, 22);
    assert.equal(heatingForScreen("live", demo).entityId, null);
    assert.equal(heatingForScreen("connecting", demo).available, false);
    assert.equal(heatingForScreen("live", heatingControlFromInventory([])).entityId, null);
  });

  it("builds 24h points from climate attributes and returns nothing when history is empty", () => {
    const end = new Date("2026-10-04T12:30:00");
    const points = heatingHistoryFromResult(
      {
        [DOWNSTAIRS]: [
          {
            state: "heat",
            last_changed: "2026-10-04T10:15:00",
            attributes: { current_temperature: 19.5, temperature: 21 },
          },
          {
            state: "heat",
            last_changed: "2026-10-04T11:05:00",
            attributes: { current_temperature: 20, temperature: 21 },
          },
        ],
      },
      DOWNSTAIRS,
      end,
      24,
    );
    assert.ok(points.length >= 1);
    const last = points[points.length - 1]!;
    assert.equal(last.currentC, 20);
    assert.equal(last.targetC, 21);
    assert.match(last.label, /^\d{2}:00$/);
    assert.deepEqual(heatingHistoryFromResult({}, DOWNSTAIRS, end), []);
  });

  it("labels a week of climate history with the day as well as the hour", () => {
    const end = new Date("2026-10-04T12:30:00");
    const points = heatingHistoryFromResult(
      {
        [DOWNSTAIRS]: [
          {
            state: "heat",
            last_changed: "2026-10-01T09:10:00",
            attributes: { current_temperature: 18, temperature: 20 },
          },
          {
            state: "heat",
            last_changed: "2026-10-04T11:05:00",
            attributes: { current_temperature: 20, temperature: 21 },
          },
        ],
      },
      DOWNSTAIRS,
      end,
      7 * 24,
    );
    assert.ok(points.length >= 2);
    for (const point of points) {
      assert.match(point.label, /:00$/);
      assert.equal(/^\d{2}:00$/.test(point.label), false);
    }
    const last = points[points.length - 1]!;
    assert.equal(last.currentC, 20);
    assert.equal(last.targetC, 21);
  });
});
