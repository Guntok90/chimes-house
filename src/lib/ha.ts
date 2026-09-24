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
  // Range Rover — no preferred ids (do not invent brand integrations). Fuzzy map only.
  rangeRoverW: [],
  rangeRoverSoc: [],
  rangeRoverPlugged: [],
  // myenergi daily energy used by the Zappi (resets at local midnight).
  zappiTodayKwh: [
    "sensor.myenergi_zappi_25435526_energy_used_today",
    "sensor.myenergi_zappi_25435526_green_energy_today",
  ],
  // Optional — many JLR installs lack a daily charged-kWh entity.
  rangeRoverTodayKwh: [],
  offPeak: [],
  intelligent: [],
  gridCharge: [],
  stevieHome: ["person.stevie_w"],
  // Read-only tariff sensors (£/kWh or p/kWh) — never written back to HA.
  cheapRateGbp: [],
  peakRateGbp: [],
};

/** True when entity name/id clearly refers to the Range Rover (second vehicle). */
function isRangeRoverBlob(b: string) {
  return (
    b.includes("range_rover") ||
    b.includes("range rover") ||
    b.includes("rangerover") ||
    b.includes("range-rover")
  );
}

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

/** True for tariff unit-rate sensors (£/kWh, p/kWh, GBP/kWh, …). */
export function isRateUnit(s: HaState) {
  const u = unitOf(s);
  if (!u) {
    // Many Octopus rate sensors omit unit; entity/name must still look like a rate.
    const b = blob(s);
    return b.includes("rate") || b.includes("price") || b.includes("tariff");
  }
  return (
    u.includes("gbp") ||
    u.includes("£") ||
    u.includes("/kwh") ||
    u.includes("p/kwh") ||
    u.includes("pence") ||
    u === "p" ||
    u.includes("£/kwh")
  );
}

/**
 * Normalise a HA rate state to £/kWh.
 * Values > 1 are treated as pence/kWh (e.g. 7 or 22.6 → 0.07 / 0.226).
 */
export function rateToGbpPerKwh(raw: number | null | undefined): number | null {
  if (raw == null || !Number.isFinite(raw) || raw < 0) return null;
  if (raw === 0) return 0;
  if (raw > 1) return Number((raw / 100).toFixed(5));
  return Number(raw.toFixed(5));
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

  // Second vehicle — only when entity names already say Range Rover (never invent brands).
  const rangeRoverW = resolve(
    states,
    "rangeRoverW",
    (_s, b) =>
      isRangeRoverBlob(b) &&
      (b.includes("power") ||
        b.includes("charge_rate") ||
        b.includes("charging") ||
        b.includes("watt")) &&
      !b.includes("today") &&
      !b.includes("daily") &&
      !b.includes("energy") &&
      !b.includes("zappi"),
    (s) => !isEnergyUnit(s) && isPowerUnit(s),
  );

  const rangeRoverSoc = resolve(
    states,
    "rangeRoverSoc",
    (_s, b) =>
      isRangeRoverBlob(b) &&
      (b.includes("soc") ||
        b.includes("state_of_charge") ||
        b.includes("battery") ||
        b.includes("charge_level") ||
        b.includes("fuel")) &&
      !b.includes("zappi") &&
      !b.includes("luna") &&
      !b.includes("house"),
  );

  const rangeRoverPlug = resolve(
    states,
    "rangeRoverPlugged",
    (s, b) =>
      isRangeRoverBlob(b) &&
      !b.includes("power") &&
      !b.includes("watt") &&
      !b.includes("soc") &&
      !b.includes("charge_level") &&
      !b.includes("battery") &&
      (b.includes("plug") ||
        b.includes("plugged") ||
        b.includes("connected") ||
        b.includes("cable") ||
        (b.includes("status") && !b.includes("mode") && !b.includes("charg"))) &&
      (s.entity_id.startsWith("binary_sensor.") || s.entity_id.startsWith("sensor.")),
  );

  const zappiToday = resolve(
    states,
    "zappiTodayKwh",
    (_s, b) =>
      b.includes("zappi") &&
      (b.includes("energy_used_today") ||
        b.includes("green_energy_today") ||
        b.includes("energy diverted today") ||
        ((b.includes("energy") || b.includes("charged") || b.includes("charge")) &&
          (b.includes("today") || b.includes("daily")) &&
          !b.includes("session"))) &&
      !b.includes("generation") &&
      !b.includes("battery") &&
      !b.includes("grid_import") &&
      !b.includes("grid_export") &&
      !b.includes("home_consumption"),
    isEnergyUnit,
  );

  const rangeRoverToday = resolve(
    states,
    "rangeRoverTodayKwh",
    (_s, b) =>
      (b.includes("range_rover") ||
        b.includes("range rover") ||
        b.includes("land_rover") ||
        b.includes("land rover") ||
        b.includes("jlr")) &&
      (b.includes("energy_used_today") ||
        b.includes("charged_today") ||
        b.includes("charge_today") ||
        b.includes("energy_today") ||
        b.includes("charging_energy") ||
        ((b.includes("energy") || b.includes("charged") || b.includes("kwh")) &&
          (b.includes("today") || b.includes("daily")))) &&
      !b.includes("zappi") &&
      !b.includes("myenergi"),
    isEnergyUnit,
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

  const gridCharge = find(
    states,
    (_s, b) =>
      (b.includes("grid") && b.includes("charge")) ||
      b.includes("charge_from_grid") ||
      b.includes("forcible_charge"),
  );

  const stevie = resolve(
    states,
    "stevieHome",
    (s, b) => s.entity_id.startsWith("person.") && (b.includes("stevie") || b.includes("steve")),
  );

  // Cheap / peak £·kWh⁻¹ from Octopus (or similarly named) rate sensors — read only.
  const cheapRate = find(
    states,
    (s, b) =>
      isRateUnit(s) &&
      (b.includes("cheap") || b.includes("off_peak") || b.includes("off-peak") || b.includes("offpeak")) &&
      (b.includes("rate") || b.includes("price") || b.includes("unit")),
  );
  const peakRate = find(
    states,
    (s, b) =>
      isRateUnit(s) &&
      (b.includes("peak") || b.includes("day_rate") || b.includes("standard_rate") || b.includes("day rate")) &&
      !b.includes("off") &&
      (b.includes("rate") || b.includes("price") || b.includes("unit")),
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
  if (rangeRoverW) map.rangeRoverW = rangeRoverW.entity_id;
  if (rangeRoverSoc) map.rangeRoverSoc = rangeRoverSoc.entity_id;
  if (rangeRoverPlug) map.rangeRoverPlugged = rangeRoverPlug.entity_id;
  if (zappiToday) map.zappiTodayKwh = zappiToday.entity_id;
  if (rangeRoverToday) map.rangeRoverTodayKwh = rangeRoverToday.entity_id;
  if (offPeak) map.offPeak = offPeak.entity_id;
  if (intelligent) map.intelligent = intelligent.entity_id;
  if (gridCharge) map.gridCharge = gridCharge.entity_id;
  if (stevie) map.stevieHome = stevie.entity_id;
  if (cheapRate) map.cheapRateGbp = cheapRate.entity_id;
  if (peakRate) map.peakRateGbp = peakRate.entity_id;

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

/** Entity ids Overview / live cards care about — plus sun.sun for dusk hint. */
export function interestFromMap(map: HaMap): Set<string> {
  const ids = new Set<string>(["sun.sun"]);
  for (const value of Object.values(map)) {
    if (typeof value === "string" && value) ids.add(value);
  }
  return ids;
}

export function sameLive(a: HouseLive, b: HouseLive): boolean {
  return (
    a.soc === b.soc &&
    a.batteryW === b.batteryW &&
    a.inverterW === b.inverterW &&
    a.solarNowW === b.solarNowW &&
    a.houseW === b.houseW &&
    a.gridW === b.gridW &&
    a.solarTodayKwh === b.solarTodayKwh &&
    a.inverterStatus === b.inverterStatus &&
    a.zappiMode === b.zappiMode &&
    a.zappiPlugged === b.zappiPlugged &&
    a.zappiW === b.zappiW &&
    a.intelligent === b.intelligent &&
    a.offPeak === b.offPeak &&
    a.gridCharge === b.gridCharge &&
    a.stevieHome === b.stevieHome &&
    a.sunAboveHorizon === b.sunAboveHorizon
  );
}

export function sameSwitches(
  a: Record<string, boolean>,
  b: Record<string, boolean>,
): boolean {
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const key of keys) {
    if (Boolean(a[key]) !== Boolean(b[key])) return false;
  }
  return true;
}

function statesById(states: HaState[] | Map<string, HaState>): Map<string, HaState> {
  return states instanceof Map ? states : new Map(states.map((s) => [s.entity_id, s]));
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
  states: HaState[] | Map<string, HaState>,
  map: HaMap,
  fallback: HouseLive = EMPTY_LIVE,
): HouseLive {
  const byId = statesById(states);
  const take = (key: keyof HouseLive) => {
    const id = map[key];
    return id ? byId.get(id) : undefined;
  };
  const n = (key: keyof HouseLive, current: number) => {
    const s = take(key);
    if (!s) return current;
    return num(s.state) ?? current;
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

  const rangeRoverPlugState = take("rangeRoverPlugged");
  let rangeRoverPlugged = fallback.rangeRoverPlugged;
  if (rangeRoverPlugState) {
    const v = rangeRoverPlugState.state.toLowerCase();
    const negative =
      v.includes("not connected") ||
      v.includes("not_connected") ||
      v.includes("unplugged") ||
      v.includes("disconnected") ||
      v === "off" ||
      v === "false";
    rangeRoverPlugged = negative
      ? false
      : flag("rangeRoverPlugged", false) || /\b(plugged|connected|charging)\b/.test(v);
  }

  const solarNowW = Math.round(n("solarNowW", fallback.solarNowW));
  const gridW = Math.round(n("gridW", fallback.gridW));
  const zappiW = Math.round(n("zappiW", fallback.zappiW));
  const rangeRoverW = Math.round(n("rangeRoverW", fallback.rangeRoverW));
  const rangeRoverSoc = Math.round(n("rangeRoverSoc", fallback.rangeRoverSoc));
  batteryW = Math.round(batteryW);

  const rateGbp = (key: "cheapRateGbp" | "peakRateGbp", current: number) => {
    const s = take(key);
    if (!s) return current;
    return rateToGbpPerKwh(num(s.state)) ?? current;
  };

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

  /** Optional daily kWh — null when entity missing (never invent 0 as “no data”). */
  const todayKwh = (key: "zappiTodayKwh" | "rangeRoverTodayKwh"): number | null => {
    const s = take(key);
    if (!s || !available(s)) return null;
    const raw = num(s.state);
    if (raw == null) return null;
    const u = unitOf(s);
    const kwh = u === "wh" || u.includes("watt-hour") ? raw / 1000 : raw;
    return Number(kwh.toFixed(2));
  };

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
    rangeRoverW,
    rangeRoverSoc,
    rangeRoverPlugged,
    zappiTodayKwh: todayKwh("zappiTodayKwh"),
    rangeRoverTodayKwh: todayKwh("rangeRoverTodayKwh"),
    intelligent: flag("intelligent", fallback.intelligent),
    offPeak: flag("offPeak", fallback.offPeak),
    gridCharge: flag("gridCharge", fallback.gridCharge),
    stevieHome: flag("stevieHome", fallback.stevieHome),
    sunAboveHorizon,
    cheapRateGbp: rateGbp("cheapRateGbp", fallback.cheapRateGbp),
    peakRateGbp: rateGbp("peakRateGbp", fallback.peakRateGbp),
  };
}

export function switchOn(
  states: HaState[] | Map<string, HaState>,
  map: HaMap,
): Record<string, boolean> {
  const byId = statesById(states);
  const out: Record<string, boolean> = {};
  for (const sw of SWITCHES) {
    const id = map[sw.id];
    const s = id ? byId.get(id) : undefined;
    if (s) out[sw.id] = s.state === "on";
  }
  return out;
}

type Msg = { id?: number; type: string; [k: string]: unknown };

/**
 * Browser WebSocket to Home Assistant.
 *
 * State updates are Map-backed (O(1)), coalesced per animation frame, and
 * optionally filtered by `interest` so unrelated Pi entities do not thrash React.
 */
export class HaSocket {
  private ws: WebSocket | null = null;
  private id = 1;
  private pending = new Map<number, { ok: (v: unknown) => void; err: (e: Error) => void }>();
  private statesByEntity = new Map<string, HaState>();
  private dirtyIds = new Set<string>();
  private flushRaf = 0;
  private bootstrapFlush = false;
  /**
   * When set, only flush `onStates` if a dirty entity is in this set.
   * Cleared on connect; the store fills it after the first autoMap.
   */
  interest: Set<string> | null = null;
  onStates: ((states: Map<string, HaState>) => void) | null = null;
  onStatus: ((s: "connecting" | "live" | "error", err?: string) => void) | null = null;

  async connect(url: string, token: string) {
    this.close();
    this.interest = null;
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
          if (next) this.noteState(next);
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
    const states = (await this.send("get_states")) as HaState[];
    this.statesByEntity = new Map(states.map((s) => [s.entity_id, s]));
    // First snapshot must reach the store immediately (no rAF wait).
    this.bootstrapFlush = true;
    this.flushStates();
    await this.send("subscribe_events", { event_type: "state_changed" });
    return states;
  }

  /** Apply one entity state and schedule a coalesced UI flush. */
  private noteState(next: HaState) {
    this.statesByEntity.set(next.entity_id, next);
    this.dirtyIds.add(next.entity_id);
    this.scheduleFlush();
  }

  private scheduleFlush() {
    if (this.flushRaf || this.bootstrapFlush) return;
    this.flushRaf = window.requestAnimationFrame(() => {
      this.flushRaf = 0;
      this.flushStates();
    });
  }

  private flushStates() {
    this.bootstrapFlush = false;
    if (!this.onStates) {
      this.dirtyIds.clear();
      return;
    }
    if (this.interest && this.dirtyIds.size > 0) {
      let relevant = false;
      for (const id of this.dirtyIds) {
        if (this.interest.has(id)) {
          relevant = true;
          break;
        }
      }
      this.dirtyIds.clear();
      if (!relevant) return;
    } else {
      this.dirtyIds.clear();
    }
    // Pass the live Map — store must not mutate it.
    this.onStates(this.statesByEntity);
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
    period: "hour" | "day" | "month" = "day",
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
    if (this.flushRaf) {
      window.cancelAnimationFrame(this.flushRaf);
      this.flushRaf = 0;
    }
    this.bootstrapFlush = false;
    this.dirtyIds.clear();
    this.interest = null;
    this.statesByEntity.clear();
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
