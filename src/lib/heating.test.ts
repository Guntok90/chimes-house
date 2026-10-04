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
    assert.deepEqual(heatingHistoryFromResult({}, DOWNSTAIRS, end), []);
  });
});
