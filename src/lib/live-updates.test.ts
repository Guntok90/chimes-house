import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { autoMap, liveFromStates, type HaMap, type HaState } from "./ha.ts";
import { applyLiveStates } from "./live-updates.ts";
import { EMPTY_LIVE, SNAPSHOT, type HouseLive } from "./house.ts";

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

const PI: HaState[] = [
  state("sensor.inverter_input_power", "1150", "", "W"),
  state("sensor.battery_1_state_of_capacity", "72", "", "%"),
  state("sensor.batteries_charge_discharge_power", "-380", "", "W"),
  state("sensor.myenergi_chimes_power_grid", "40", "", "W"),
  state("sun.sun", "above_horizon"),
  state("switch.smart_switch_4", "on", "Lamp"),
];

type Slice = {
  live: HouseLive;
  switches: Record<string, boolean>;
  status: "demo" | "connecting" | "live" | "error";
  map: HaMap;
  refreshHistory: () => Promise<void>;
};

function memoryStorage() {
  const bag = new Map<string, string>();
  return {
    getItem: (k: string) => bag.get(k) ?? null,
    setItem: (k: string, v: string) => {
      bag.set(k, v);
    },
    removeItem: (k: string) => {
      bag.delete(k);
    },
    bag,
  };
}

describe("applyLiveStates", () => {
  let mem: ReturnType<typeof memoryStorage>;

  beforeEach(() => {
    mem = memoryStorage();
    Object.defineProperty(globalThis, "localStorage", {
      value: mem,
      configurable: true,
      writable: true,
    });
  });

  it("remaps and writes localStorage only on the first live payload", () => {
    let historyCalls = 0;
    const slice: Slice = {
      live: { ...SNAPSHOT },
      switches: {},
      status: "connecting",
      map: {},
      refreshHistory: async () => {
        historyCalls += 1;
      },
    };
    const sock = { interest: null as Set<string> | null };
    const sets: unknown[] = [];

    applyLiveStates(
      PI,
      () => slice,
      (partial) => {
        sets.push(partial);
        Object.assign(slice, partial);
      },
      sock,
    );

    assert.equal(sets.length, 1);
    assert.equal(slice.status, "live");
    assert.equal(slice.live.soc, 72);
    assert.equal(historyCalls, 1);
    assert.ok(sock.interest?.has("sensor.battery_1_state_of_capacity"));
    const writesAfterBoot = mem.bag.size;
    assert.ok(writesAfterBoot >= 1);

    // Second tick: SOC change only — no remapping, no extra history refresh.
    const next = PI.map((s) =>
      s.entity_id === "sensor.battery_1_state_of_capacity" ? state(s.entity_id, "73", "", "%") : s,
    );
    applyLiveStates(
      next,
      () => slice,
      (partial) => {
        sets.push(partial);
        Object.assign(slice, partial);
      },
      sock,
    );

    assert.equal(sets.length, 2);
    assert.equal(slice.live.soc, 73);
    assert.equal(historyCalls, 1);
    assert.equal(mem.bag.size, writesAfterBoot);

    // Identical payload must not push another React set.
    applyLiveStates(
      next,
      () => slice,
      (partial) => {
        sets.push(partial);
        Object.assign(slice, partial);
      },
      sock,
    );
    assert.equal(sets.length, 2);
  });

  it("matches liveFromStates for the mapped Chimes entities", () => {
    const map = autoMap(PI);
    const expected = liveFromStates(PI, map, EMPTY_LIVE);
    const slice: Slice = {
      live: { ...SNAPSHOT },
      switches: {},
      status: "connecting",
      map: {},
      refreshHistory: async () => {},
    };
    applyLiveStates(
      PI,
      () => slice,
      (partial) => Object.assign(slice, partial),
      { interest: null },
    );
    assert.equal(slice.live.soc, expected.soc);
    assert.equal(slice.live.batteryW, expected.batteryW);
    assert.equal(slice.live.solarNowW, expected.solarNowW);
  });

  it("keeps the previous live object when only a switch flips", () => {
    const slice: Slice = {
      live: { ...SNAPSHOT },
      switches: {},
      status: "connecting",
      map: {},
      refreshHistory: async () => {},
    };
    const sock = { interest: null as Set<string> | null };
    applyLiveStates(PI, () => slice, (partial) => Object.assign(slice, partial), sock);
    const liveRef = slice.live;

    const flipped = PI.map((s) =>
      s.entity_id === "switch.smart_switch_4" ? state(s.entity_id, "off", "Lamp") : s,
    );
    applyLiveStates(flipped, () => slice, (partial) => Object.assign(slice, partial), sock);

    assert.equal(slice.live, liveRef);
    assert.equal(slice.switches.lamp, false);
  });
});
