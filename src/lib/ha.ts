import { deriveHouseW } from "./energy-balance.ts";
import { EMPTY_LIVE, SNAPSHOT, type HouseLive } from "./house.ts";

export type HaState = {
  entity_id: string;
  state: string;
  attributes: Record<string, unknown>;
};

export type HaMap = Partial<Record<keyof HouseLive | SwitchId, string>>;

export type SwitchId =
  | "lamp"
  | "kitchen"
  | "pergola"
  | "pond-1"
  | "pond-2"
  | "telly"
  | "fish"
  | "stevie-blanket"
  | "baby-blanket";

export const SWITCHES: { id: SwitchId; label: string; match: string[] }[] = [
  { id: "lamp", label: "Lamp", match: ["lamp", "lounge lamp", "living lamp"] },
  { id: "kitchen", label: "Kitchen", match: ["kitchen"] },
  { id: "pergola", label: "Pergola", match: ["pergola"] },
  { id: "pond-1", label: "Pond 1", match: ["pond 1", "pond_1", "pond1"] },
  { id: "pond-2", label: "Pond 2", match: ["pond 2", "pond_2", "pond2"] },
  { id: "telly", label: "Telly", match: ["telly", "tv", "television"] },
  { id: "fish", label: "Fish", match: ["fish", "aquarium"] },
  { id: "stevie-blanket", label: "Stevie’s blanket", match: ["stevie"] },
  { id: "baby-blanket", label: "Baby’s blanket", match: ["baby"] },
];

/**
 * Exact switch entity ids on Chimes-Pi (friendly names → smart_switch_* / garden).
 * Kitchen has no clear switch in the live inventory — leave unmapped.
 */
export const PREFERRED_SWITCHES: Partial<Record<SwitchId, string[]>> = {
  lamp: ["switch.smart_switch_4"],
  telly: ["switch.smart_switch"],
  "stevie-blanket": ["switch.smart_switch_2"],
  "baby-blanket": ["switch.smart_switch_5"],
  fish: ["switch.smart_switch_6"],
  pergola: ["switch.pergola_switch_1"],
  "pond-1": ["switch.pond_1_switch_1"],
  "pond-2": ["switch.pond_2_switch_1"],
};

const CREDS = "chimes.ha.creds";
const MAP = "chimes.ha.map";

/** Dad’s Pi Home Assistant via Tailscale Serve HTTPS (dashboard is HTTPS → avoid mixed content). */
export const DEFAULT_HA_URL = "https://chimes-pi.tail8e29b8.ts.net";

/**
 * Preferred entity ids for Chimes-Pi (Huawei / LUNA / myenergi / Octopus).
 * Never list lifetime-energy sensors (e.g. power_meter_consumption kWh) under houseW.
 */
export const PREFERRED: Partial<Record<keyof HouseLive, string[]>> = {
  soc: [
    "sensor.battery_1_state_of_capacity",
    "sensor.battery_state_of_capacity",
    "sensor.luna2000_state_of_capacity",
  ],
  batteryW: [
    "sensor.batteries_charge_discharge_power",
    "sensor.battery_1_charge_discharge_power",
    "sensor.battery_charge_discharge_power",
    "sensor.battery_1_power",
    "sensor.luna2000_charge_discharge_power",
  ],
  solarNowW: ["sensor.inverter_input_power", "sensor.pv_input_power"],
  solarTodayKwh: ["sensor.inverter_daily_yield", "sensor.daily_yield"],
  inverterW: ["sensor.inverter_active_power"],
  inverterStatus: [
    "sensor.inverter_device_status",
    "sensor.inverter_status",
    "sensor.inverter_state",
  ],
  // Only known-good live house-load W sensors — never myenergi “home consumption”
  // (unreliable / can be ~0 or negative while the house is drawing). Prefer derive.
  houseW: [
    "sensor.house_power",
    "sensor.load_power",
    "sensor.home_load_power",
    "sensor.home_power",
  ],
  // Prefer myenergi grid (matches Octopus demand when importing). Huawei
  // power_meter_active_power often disagrees in sign on this install.
  gridW: [
    "sensor.myenergi_chimes_power_grid",
    "sensor.power_meter_active_power",
    "sensor.grid_active_power",
    "sensor.grid_power",
    "sensor.meter_active_power",
    "sensor.active_power",
  ],
  zappiMode: ["select.myenergi_zappi_25435526_charge_mode"],
  zappiPlugged: [
    "sensor.myenergi_zappi_25435526_plug_status",
    "sensor.myenergi_zappi_25435526_status",
  ],
  // Charge power = site EV session watts / internal CT — never generation or battery CT.
  zappiW: [
    "sensor.myenergi_chimes_power_charging",
    "sensor.myenergi_zappi_25435526_power_ct_internal",
    "sensor.myenergi_zappi_25435526_power_internal_load",
    "sensor.myenergi_zappi_25435526_internal_load_ct1",
    "sensor.myenergi_zappi_25435526_ct_internal",
  ],
  offPeak: [],
  intelligent: [],
  // Huawei Solar (wlcrs) — ESS device is usually named "Batteries" on Chimes-Pi.
  gridCharge: ["switch.batteries_charge_from_grid", "switch.inverter_charge_from_grid"],
  gridChargeCutoffSoc: [
    "number.batteries_grid_charge_cutoff_soc",
    "number.inverter_grid_charge_cutoff_soc",
  ],
  // End-of-charge SOC = solar / self-consumption charge cutoff (not grid).
  solarChargeCutoffSoc: [
    "number.batteries_charging_cutoff_capacity",
    "number.inverter_charging_cutoff_capacity",
  ],
  stevieHome: ["person.stevie_w"],
};

/** Defaults when HA number entities omit min/max/step attributes. */
export const CHARGE_LIMIT_DEFAULTS = {
  gridChargeCutoffSoc: { min: 20, max: 100, step: 1 },
  solarChargeCutoffSoc: { min: 90, max: 100, step: 1 },
} as const;

export type ChargeLimitKey = keyof typeof CHARGE_LIMIT_DEFAULTS;

export type NumberControlMeta = { min: number; max: number; step: number };

/**
 * Never treat these as live house watts.
 * Includes lifetime kWh totals and myenergi’s unreliable “home consumption”.
 */
export const HOUSE_W_BLOCKLIST = [
  "sensor.myenergi_chimes_home_consumption",
  "sensor.power_meter_consumption",
  "sensor.power_meter_consumption_2",
  "sensor.house_consumption_daily",
  "sensor.house_consumption_monthly",
  "sensor.house_consumption_yearly",
];

export type HaCreds = { url: string; token: string };

export type HaBootstrapResponse = {
  configured: boolean;
  url?: string;
  token?: string;
};

/**
 * Server bootstrap wins when HA_TOKEN is set.
 * Otherwise a token saved from House → Connect is used.
 */
export function credsForBoot(
  bootstrap: HaBootstrapResponse | null,
  saved: HaCreds | null,
): HaCreds | null {
  if (bootstrap?.configured && bootstrap.url && bootstrap.token) {
    return { url: bootstrap.url.replace(/\/$/, ""), token: bootstrap.token };
  }
  return saved;
}

export function wsFailureMessage(message: string): string {
  if (
    message === "Could not reach Home Assistant." ||
    message === "Home Assistant did not answer." ||
    message === "Disconnected."
  ) {
    return "Could not reach the Pi. This tablet needs Tailscale or the house Wi-Fi.";
  }
  return message;
}

export function readCreds(): HaCreds | null {
  try {
    const raw = localStorage.getItem(CREDS);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as HaCreds;
    if (!parsed.url || !parsed.token) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeCreds(creds: HaCreds | null) {
  if (!creds) localStorage.removeItem(CREDS);
  else localStorage.setItem(CREDS, JSON.stringify(creds));
}

export function readMap(): HaMap {
  try {
    return JSON.parse(localStorage.getItem(MAP) || "{}") as HaMap;
  } catch {
    return {};
  }
}

export function writeMap(map: HaMap) {
  localStorage.setItem(MAP, JSON.stringify(map));
}

export function toWs(url: string) {
  const u = new URL(url);
  u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
  u.pathname = "/api/websocket";
  u.search = "";
  u.hash = "";
  return u.toString();
}

function num(state: string) {
  const n = Number.parseFloat(state);
  return Number.isFinite(n) ? n : null;
}

function blob(s: HaState) {
  return `${s.entity_id} ${String(s.attributes.friendly_name ?? "")}`.toLowerCase();
}

function available(s: HaState) {
  return s.state !== "unavailable" && s.state !== "unknown";
}

function unitOf(s: HaState) {
  return String(s.attributes.unit_of_measurement ?? "").toLowerCase();
}

/** True when the state looks like energy (kWh), not live watts. */
export function isEnergyUnit(s: HaState) {
  const u = unitOf(s);
  return (
    u === "kwh" ||
    u === "wh" ||
    u.includes("kwh") ||
    u.includes("watt-hour") ||
    u.includes("watt hour")
  );
}

export function isPowerUnit(s: HaState) {
  const u = unitOf(s);
  if (!u) return true;
  return u === "w" || u === "kw" || u.includes("watt");
}

function find(states: HaState[], test: (s: HaState, b: string) => boolean) {
  return states.find((s) => available(s) && test(s, blob(s)));
}

function prefer(
  states: HaState[],
  ids: string[] | undefined,
  ok: (s: HaState) => boolean = () => true,
) {
  if (!ids?.length) return undefined;
  for (const id of ids) {
    const hit = states.find((s) => s.entity_id === id && available(s) && ok(s));
    if (hit) return hit;
  }
  return undefined;
}

/** Pick first matching preferred id, else fuzzy finder. */
function resolve(
  states: HaState[],
  key: keyof HouseLive,
  fuzzy: (s: HaState, b: string) => boolean,
  ok: (s: HaState) => boolean = () => true,
) {
  return prefer(states, PREFERRED[key], ok) ?? find(states, (s, b) => ok(s) && fuzzy(s, b));
}

function isLiveHouseWatts(s: HaState) {
  if (HOUSE_W_BLOCKLIST.includes(s.entity_id)) return false;
  const b = blob(s);
  // myenergi “home consumption” is unreliable (can read ~0 W or go negative).
  if (b.includes("myenergi") && (b.includes("home_consumption") || b.includes("home consumption"))) {
    return false;
  }
  if (isEnergyUnit(s)) return false;
  return isPowerUnit(s);
}

export function autoMap(states: HaState[]): HaMap {
  const map: HaMap = {};

  const soc = resolve(
    states,
    "soc",
    (_s, b) =>
      (b.includes("soc") ||
        b.includes("state_of_charge") ||
        b.includes("state_of_capacity") ||
        b.includes("battery_capacity")) &&
      (b.includes("battery") || b.includes("luna") || b.includes("ess")) &&
      !b.includes("zappi"),
  );

  // Signed Huawei charge/discharge power — not zappi CT, not PV.
  const battW = resolve(
    states,
    "batteryW",
    (_s, b) =>
      (b.includes("battery") || b.includes("luna")) &&
      (b.includes("charge_discharge") ||
        b.includes("charge/discharge") ||
        (b.includes("power") && (b.includes("charge") || b.includes("discharge")))) &&
      !b.includes("pv") &&
      !b.includes("today") &&
      !b.includes("daily") &&
      !b.includes("zappi") &&
      !b.includes("generation"),
  );

  // PV DC input — not zappi CT “generation & battery”, not inverter AC active power.
  const solarNow = resolve(
    states,
    "solarNowW",
    (_s, b) =>
      (b.includes("pv") || b.includes("solar") || b.includes("input_power")) &&
      (b.includes("power") || b.includes("watt")) &&
      !b.includes("today") &&
      !b.includes("daily") &&
      !b.includes("battery") &&
      !b.includes("zappi") &&
      !b.includes("generation"),
  );

  const solarToday = resolve(
    states,
    "solarTodayKwh",
    (_s, b) =>
      (b.includes("solar") || b.includes("pv") || b.includes("yield")) &&
      (b.includes("today") || b.includes("daily")) &&
      !b.includes("battery") &&
      !b.includes("zappi"),
  );

  const house = resolve(
    states,
    "houseW",
    (_s, b) =>
      (b.includes("house") ||
        b.includes("home_load") ||
        b.includes("load_power") ||
        (b.includes("load") && b.includes("power"))) &&
      (b.includes("power") || b.includes("watt") || b.includes("load")) &&
      !b.includes("myenergi") &&
      !b.includes("home_consumption") &&
      !b.includes("battery") &&
      !b.includes("solar") &&
      !b.includes("pv") &&
      !b.includes("zappi") &&
      !b.includes("grid") &&
      !b.includes("inverter") &&
      !b.includes("today") &&
      !b.includes("daily") &&
      !b.includes("meter_consumption"),
    isLiveHouseWatts,
  );

  const grid = resolve(
    states,
    "gridW",
    (_s, b) =>
      (b.includes("grid") || (b.includes("meter") && b.includes("active"))) &&
      (b.includes("power") || b.includes("watt") || b.includes("active")) &&
      !b.includes("today") &&
      !b.includes("daily") &&
      !b.includes("zappi") &&
      !b.includes("battery") &&
      !b.includes("charge") &&
      !b.includes("export_today") &&
      !b.includes("import_today"),
    (s) => !isEnergyUnit(s) && isPowerUnit(s),
  );

  const inverterW = resolve(
    states,
    "inverterW",
    (_s, b) =>
      (b.includes("inverter") || b.includes("sun2000")) &&
      (b.includes("active_power") || (b.includes("active") && b.includes("power"))) &&
      !b.includes("battery") &&
      !b.includes("input_power") &&
      !b.includes("today"),
  );

  const inverterStatus = resolve(
    states,
    "inverterStatus",
    (_s, b) =>
      b.includes("inverter") &&
      (b.includes("status") || b.includes("state") || b.includes("device_status")) &&
      !b.includes("power") &&
      !b.includes("yield"),
  );

  const zappiMode = resolve(
    states,
    "zappiMode",
    (s, b) =>
      b.includes("zappi") &&
      (b.includes("mode") || b.includes("charge_mode")) &&
      (s.entity_id.startsWith("sensor.") ||
        s.entity_id.startsWith("select.") ||
        s.entity_id.startsWith("binary_sensor.")),
  );

  const zappiPlug = resolve(
    states,
    "zappiPlugged",
    (s, b) =>
      b.includes("zappi") &&
      (b.includes("plug") ||
        b.includes("connected") ||
        b.includes("car_connected") ||
        (b.includes("status") && !b.includes("mode") && !b.includes("device"))),
  );

  const zappiW = resolve(
    states,
    "zappiW",
    (_s, b) =>
      (b.includes("zappi") || (b.includes("myenergi") && b.includes("power_charging"))) &&
      (b.includes("charge_rate") ||
        b.includes("charging_power") ||
        b.includes("charge_power") ||
        b.includes("power_charging") ||
        b.includes("ct_internal") ||
        b.includes("internal_load") ||
        (b.includes("power") &&
          b.includes("internal") &&
          !b.includes("generation") &&
          !b.includes("battery") &&
          !b.includes("grid"))) &&
      !b.includes("generation") &&
      !b.includes("battery") &&
      !b.includes("today") &&
      !b.includes("added") &&
      !b.includes("home_consumption"),
    (s) => !isEnergyUnit(s) && isPowerUnit(s),
  );

  const offPeak = find(
    states,
    (_s, b) =>
      b.includes("off_peak") ||
      b.includes("off-peak") ||
      b.includes("offpeak") ||
      (b.includes("octopus") && (b.includes("slot") || b.includes("cheap") || b.includes("off"))),
  );

  const intelligent = find(
    states,
    (_s, b) =>
      b.includes("intelligent") ||
      (b.includes("octopus") && (b.includes("ready") || b.includes("dispatch"))),
  );

  // Charge-from-grid allow — switch only (never number / forcible services).
  const gridCharge = resolve(
    states,
    "gridCharge",
    (s, b) =>
      s.entity_id.startsWith("switch.") &&
      (b.includes("charge_from_grid") ||
        (b.includes("grid") && b.includes("charge") && !b.includes("cutoff") && !b.includes("power"))),
  );

  const gridChargeCutoffSoc = resolve(
    states,
    "gridChargeCutoffSoc",
    (s, b) =>
      s.entity_id.startsWith("number.") &&
      (b.includes("grid_charge_cutoff") ||
        (b.includes("grid") && b.includes("cutoff") && (b.includes("soc") || b.includes("state_of_charge")))),
  );

  // Solar / self-consumption end-of-charge — not grid cutoff, not discharge cutoff.
  const solarChargeCutoffSoc = resolve(
    states,
    "solarChargeCutoffSoc",
    (s, b) =>
      s.entity_id.startsWith("number.") &&
      !b.includes("grid") &&
      !b.includes("discharg") &&
      (b.includes("charging_cutoff_capacity") ||
        b.includes("charging_cutoff") ||
        (b.includes("end_of_charge") && (b.includes("soc") || b.includes("capacity")))),
  );

  const stevie = resolve(
    states,
    "stevieHome",
    (s, b) => s.entity_id.startsWith("person.") && (b.includes("stevie") || b.includes("steve")),
  );

  if (soc) map.soc = soc.entity_id;
  if (battW) map.batteryW = battW.entity_id;
  if (solarNow) map.solarNowW = solarNow.entity_id;
  if (solarToday) map.solarTodayKwh = solarToday.entity_id;
  if (house) map.houseW = house.entity_id;
  if (grid) map.gridW = grid.entity_id;
  if (inverterW) map.inverterW = inverterW.entity_id;
  if (inverterStatus) map.inverterStatus = inverterStatus.entity_id;
  if (zappiMode) map.zappiMode = zappiMode.entity_id;
  if (zappiPlug) map.zappiPlugged = zappiPlug.entity_id;
  if (zappiW) map.zappiW = zappiW.entity_id;
  if (offPeak) map.offPeak = offPeak.entity_id;
  if (intelligent) map.intelligent = intelligent.entity_id;
  if (gridCharge) map.gridCharge = gridCharge.entity_id;
  if (gridChargeCutoffSoc) map.gridChargeCutoffSoc = gridChargeCutoffSoc.entity_id;
  if (solarChargeCutoffSoc) map.solarChargeCutoffSoc = solarChargeCutoffSoc.entity_id;
  if (stevie) map.stevieHome = stevie.entity_id;

  for (const sw of SWITCHES) {
    const preferred = prefer(states, PREFERRED_SWITCHES[sw.id]);
    if (preferred) {
      map[sw.id] = preferred.entity_id;
      continue;
    }
    const hit = states.find((s) => {
      if (!s.entity_id.startsWith("light.") && !s.entity_id.startsWith("switch.")) return false;
      const b = blob(s);
      return sw.match.some((m) => b.includes(m));
    });
    if (hit) map[sw.id] = hit.entity_id;
  }
  return map;
}

/**
 * Build HouseLive from HA states. Pass EMPTY_LIVE (default) so missing entities
 * become zeros/false — never demo SNAPSHOT leftovers like 16.68 kWh.
 *
 * When no live house-load watt sensor is mapped, houseW is derived via
 * `deriveHouseW(solar, grid, battery, zappi)` — household load excluding Zappi,
 * never from SNAPSHOT, kWh totals, or myenergi home consumption.
 */
export function liveFromStates(
  states: HaState[],
  map: HaMap,
  fallback: HouseLive = EMPTY_LIVE,
): HouseLive {
  const byId = new Map(states.map((s) => [s.entity_id, s]));
  const take = (key: keyof HouseLive) => {
    const id = map[key];
    return id ? byId.get(id) : undefined;
  };
  const n = (key: keyof HouseLive, current: number) => {
    const s = take(key);
    if (!s) return current;
    return num(s.state) ?? current;
  };
  const optionalPct = (key: keyof HouseLive): number | null => {
    const s = take(key);
    if (!s) return null;
    const v = num(s.state);
    return v === null ? null : Math.round(v);
  };
  const flag = (key: keyof HouseLive, current: boolean) => {
    const s = take(key);
    if (!s) return current;
    const v = s.state.toLowerCase();
    return (
      v === "on" ||
      v === "true" ||
      v === "home" ||
      v === "yes" ||
      v === "active" ||
      v === "plugged_in" ||
      v === "connected" ||
      v === "charging"
    );
  };

  const batt = take("batteryW");
  let batteryW = n("batteryW", fallback.batteryW);
  if (batt) {
    const b = blob(batt);
    const signed =
      b.includes("charge_discharge") ||
      b.includes("charge/discharge") ||
      b.includes("charge_and_discharge");
    // Huawei signed power: negative = discharging, positive = charging — leave as-is.
    if (!signed) {
      const charging = b.includes("charg") && !b.includes("discharg");
      if (b.includes("discharg") && batteryW > 0) batteryW = -batteryW;
      if (charging && batteryW < 0) batteryW = Math.abs(batteryW);
    }
  }

  const sun = byId.get("sun.sun");
  const sunAboveHorizon = sun ? sun.state === "above_horizon" : fallback.sunAboveHorizon;

  const zappiModeState = take("zappiMode")?.state;
  const zappiPlugState = take("zappiPlugged");
  let zappiPlugged = fallback.zappiPlugged;
  if (zappiPlugState) {
    const v = zappiPlugState.state.toLowerCase();
    const negative =
      v.includes("not connected") ||
      v.includes("not_connected") ||
      v.includes("unplugged") ||
      v.includes("disconnected") ||
      v === "off" ||
      v === "false";
    zappiPlugged = negative
      ? false
      : flag("zappiPlugged", false) || /\b(plugged|connected|charging)\b/.test(v);
  }

  const solarNowW = Math.round(n("solarNowW", fallback.solarNowW));
  const gridW = Math.round(n("gridW", fallback.gridW));
  const zappiW = Math.round(n("zappiW", fallback.zappiW));
  batteryW = Math.round(batteryW);

  const houseState = take("houseW");
  const houseMappedOk =
    Boolean(houseState) &&
    isLiveHouseWatts(houseState!) &&
    !isEnergyUnit(houseState!) &&
    isPowerUnit(houseState!);

  let houseW: number;
  if (houseMappedOk) {
    houseW = Math.round(n("houseW", fallback.houseW));
  } else if (map.solarNowW || map.gridW || map.batteryW || map.zappiW) {
    // Derive household load (excludes Zappi) when no true house-load W sensor exists.
    houseW = deriveHouseW(solarNowW, gridW, batteryW, zappiW);
  } else {
    houseW = Math.round(fallback.houseW);
  }

  return {
    soc: Math.round(n("soc", fallback.soc)),
    batteryW,
    inverterW: Math.round(n("inverterW", fallback.inverterW)),
    solarNowW,
    houseW,
    gridW,
    solarTodayKwh: Number(n("solarTodayKwh", fallback.solarTodayKwh).toFixed(2)),
    inverterStatus: take("inverterStatus")?.state ?? fallback.inverterStatus,
    zappiMode: zappiModeState ?? fallback.zappiMode,
    zappiPlugged,
    zappiW,
    intelligent: flag("intelligent", fallback.intelligent),
    offPeak: flag("offPeak", fallback.offPeak),
    gridCharge: flag("gridCharge", fallback.gridCharge),
    gridChargeCutoffSoc: optionalPct("gridChargeCutoffSoc"),
    solarChargeCutoffSoc: optionalPct("solarChargeCutoffSoc"),
    stevieHome: flag("stevieHome", fallback.stevieHome),
    sunAboveHorizon,
  };
}

/** Read min/max/step from a mapped HA number entity, else Huawei defaults. */
export function chargeLimitMeta(
  states: HaState[],
  map: HaMap,
  key: ChargeLimitKey,
): NumberControlMeta {
  const defaults = CHARGE_LIMIT_DEFAULTS[key];
  const id = map[key];
  const s = id ? states.find((x) => x.entity_id === id) : undefined;
  if (!s) return { ...defaults };
  const min = num(String(s.attributes.min ?? "")) ?? defaults.min;
  const max = num(String(s.attributes.max ?? "")) ?? defaults.max;
  const step = num(String(s.attributes.step ?? "")) ?? defaults.step;
  return { min, max, step: step > 0 ? step : defaults.step };
}

export function chargeLimitMetaMap(
  states: HaState[],
  map: HaMap,
): Record<ChargeLimitKey, NumberControlMeta> {
  return {
    gridChargeCutoffSoc: chargeLimitMeta(states, map, "gridChargeCutoffSoc"),
    solarChargeCutoffSoc: chargeLimitMeta(states, map, "solarChargeCutoffSoc"),
  };
}

export function switchOn(states: HaState[], map: HaMap): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const sw of SWITCHES) {
    const id = map[sw.id];
    const s = id ? states.find((x) => x.entity_id === id) : undefined;
    if (s) out[sw.id] = s.state === "on";
  }
  return out;
}

type Msg = { id?: number; type: string; [k: string]: unknown };

export class HaSocket {
  private ws: WebSocket | null = null;
  private id = 1;
  private pending = new Map<number, { ok: (v: unknown) => void; err: (e: Error) => void }>();
  private states: HaState[] = [];
  onStates: ((states: HaState[]) => void) | null = null;
  onStatus: ((s: "connecting" | "live" | "error", err?: string) => void) | null = null;

  async connect(url: string, token: string) {
    this.close();
    this.onStatus?.("connecting");
    const ws = new WebSocket(toWs(url));
    this.ws = ws;
    let handshake = true;
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(
        () => reject(new Error("Home Assistant did not answer.")),
        8000,
      );
      ws.onmessage = (ev) => {
        const msg = JSON.parse(String(ev.data)) as Msg;
        if (msg.type === "auth_required") {
          ws.send(JSON.stringify({ type: "auth", access_token: token }));
          return;
        }
        if (msg.type === "auth_ok") {
          window.clearTimeout(timer);
          handshake = false;
          resolve();
          return;
        }
        if (msg.type === "auth_invalid") {
          window.clearTimeout(timer);
          reject(new Error("Token refused."));
          return;
        }
        if (typeof msg.id === "number") {
          const p = this.pending.get(msg.id);
          if (p) {
            this.pending.delete(msg.id);
            if (msg.success === false) p.err(new Error("Home Assistant request failed."));
            else p.ok(msg.result);
          }
        }
        if (msg.type === "event") {
          const event = msg.event as { data?: { new_state?: HaState } };
          const next = event.data?.new_state;
          if (next) {
            const i = this.states.findIndex((s) => s.entity_id === next.entity_id);
            if (i >= 0) this.states[i] = next;
            else this.states.push(next);
            this.onStates?.([...this.states]);
          }
        }
      };
      ws.onerror = () => {
        window.clearTimeout(timer);
        if (this.ws !== ws) return;
        reject(new Error("Could not reach Home Assistant."));
      };
      ws.onclose = () => {
        if (this.ws !== ws) return;
        this.ws = null;
        if (handshake) {
          window.clearTimeout(timer);
          reject(new Error("Could not reach Home Assistant."));
          return;
        }
        this.onStatus?.("error", "Disconnected.");
      };
    });
    this.onStatus?.("live");
    this.states = (await this.send("get_states")) as HaState[];
    this.onStates?.([...this.states]);
    await this.send("subscribe_events", { event_type: "state_changed" });
    return this.states;
  }

  async call(entityId: string, turnOn?: boolean) {
    const [domain] = entityId.split(".");
    const service = turnOn === undefined ? "toggle" : turnOn ? "turn_on" : "turn_off";
    await this.send("call_service", {
      domain,
      service,
      target: { entity_id: entityId },
    });
  }

  /** Set a `number.*` entity via `number.set_value` (Huawei charge cutoffs). */
  async setNumber(entityId: string, value: number) {
    await this.send("call_service", {
      domain: "number",
      service: "set_value",
      service_data: { value },
      target: { entity_id: entityId },
    });
  }

  /**
   * HA recorder history for chart series. Returns [] when the Pi has no data or
   * the command is unsupported — callers must not fall back to demo curves.
   */
  async historyDuringPeriod(entityIds: string[], start: string, end: string) {
    if (!entityIds.length || !this.ws) return [];
    try {
      const result = await this.send("history/history_during_period", {
        start_time: start,
        end_time: end,
        entity_ids: entityIds,
        include_start_time_state: true,
        significant_changes_only: false,
        minimal_response: true,
        no_attributes: true,
      });
      return result;
    } catch {
      return [];
    }
  }

  async statisticsDuringPeriod(
    statisticIds: string[],
    start: string,
    end: string,
    period: "hour" | "day" = "day",
  ) {
    if (!statisticIds.length || !this.ws) return {};
    try {
      return await this.send("recorder/statistics_during_period", {
        start_time: start,
        end_time: end,
        statistic_ids: statisticIds,
        period,
        types: ["change", "state", "mean", "sum"],
      });
    } catch {
      return {};
    }
  }

  private send(type: string, extra: Record<string, unknown> = {}, timeoutMs = 20_000) {
    const id = this.id++;
    return new Promise((ok, err) => {
      const timer = window.setTimeout(() => {
        this.pending.delete(id);
        err(new Error("Home Assistant request timed out."));
      }, timeoutMs);
      this.pending.set(id, {
        ok: (v) => {
          window.clearTimeout(timer);
          ok(v);
        },
        err: (e) => {
          window.clearTimeout(timer);
          err(e);
        },
      });
      this.ws?.send(JSON.stringify({ id, type, ...extra }));
    });
  }

  close() {
    const ws = this.ws;
    this.ws = null;
    this.pending.clear();
    if (!ws) return;
    ws.onmessage = null;
    ws.onerror = null;
    ws.onclose = null;
    ws.close();
  }
}

export { EMPTY_LIVE, SNAPSHOT, deriveHouseW };
