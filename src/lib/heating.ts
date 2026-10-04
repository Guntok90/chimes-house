/**
 * Nest central heating — discovered from the live Home Assistant inventory.
 *
 * The official Nest integration names the climate entity after the thermostat
 * (climate.hallway, climate.downstairs, …). Those ids are not stable across
 * houses, so Chimes does not keep a preferred-id list. A device is the Nest
 * when the device registry identifier domain is `nest`, or the manufacturer /
 * model / name says Nest. The climate entity on that device is the one Home
 * and the ambient window both use.
 *
 * Schedule: Google’s SDM climate traits (what HA’s nest integration exposes)
 * cover setpoint, HVAC mode, and eco. They do not include the weekly timetable.
 * Chimes only offers a schedule control when HA actually has a schedule entity
 * on that same device.
 */

import type { ConnectionStatus } from "./house.ts";
import type { HaDeviceReg, HaEntityReg, HaState } from "./ha.ts";

export const NEST_SCHEDULE_NOTE =
  "The weekly schedule stays in the Nest app. Home Assistant’s Nest climate entity does not expose the timetable, so Chimes cannot change it.";

export type HeatingHistPoint = {
  label: string;
  currentC: number | null;
  /** Active heat setpoint, or the low end of a heat/cool range. */
  targetC: number | null;
  /** High end of a heat/cool range, when HA reports one. */
  targetHighC?: number | null;
};

export type NestSetLine = {
  label: string;
  c: number | null;
};

export type HeatingControl = {
  entityId: string | null;
  label: string;
  available: boolean;
  /** Room temperature the Nest shows (°C from HA; Nest SDM is Celsius). */
  currentC: number | null;
  targetC: number | null;
  targetLowC: number | null;
  targetHighC: number | null;
  hvacMode: string;
  hvacModes: string[];
  /** heating / cooling / idle / off — null when HA omits hvac_action. */
  hvacAction: string | null;
  presetMode: string | null;
  presetModes: string[];
  eco: boolean;
  ecoSupported: boolean;
  /** SDM rejects setpoint writes while Eco is on, and while the thermostat is off. */
  setpointWritable: boolean;
  minC: number;
  maxC: number;
  stepC: number;
  scheduleEntityId: string | null;
  scheduleState: string | null;
  scheduleOptions: string[];
  /** Set when this Nest climate has no schedule entity on the device. */
  scheduleNote: string | null;
};

const NEST_MIN_C = 10;
const NEST_MAX_C = 32;

export function unmappedHeatingControl(): HeatingControl {
  return {
    entityId: null,
    label: "Nest",
    available: false,
    currentC: null,
    targetC: null,
    targetLowC: null,
    targetHighC: null,
    hvacMode: "",
    hvacModes: [],
    hvacAction: null,
    presetMode: null,
    presetModes: [],
    eco: false,
    ecoSupported: false,
    setpointWritable: false,
    minC: NEST_MIN_C,
    maxC: NEST_MAX_C,
    stepC: 0.5,
    scheduleEntityId: null,
    scheduleState: null,
    scheduleOptions: [],
    scheduleNote: null,
  };
}

/** Demo snapshot only — never shown once the tablet is live. */
export function demoHeatingControl(): HeatingControl {
  return {
    entityId: "demo.climate",
    label: "Nest",
    available: true,
    currentC: 19.5,
    targetC: 21,
    targetLowC: null,
    targetHighC: null,
    hvacMode: "heat",
    hvacModes: ["heat", "off"],
    hvacAction: "heating",
    presetMode: "none",
    presetModes: ["eco", "none"],
    eco: false,
    ecoSupported: true,
    setpointWritable: true,
    minC: NEST_MIN_C,
    maxC: NEST_MAX_C,
    stepC: 0.5,
    scheduleEntityId: null,
    scheduleState: null,
    scheduleOptions: [],
    scheduleNote: NEST_SCHEDULE_NOTE,
  };
}

/**
 * Demo 24h curve for the Home chart while the app is on the snapshot.
 * Live mode never reads this.
 */
export const DEMO_HEATING_HISTORY: HeatingHistPoint[] = [
  { label: "00:00", currentC: 18.4, targetC: 18 },
  { label: "03:00", currentC: 17.8, targetC: 18 },
  { label: "06:00", currentC: 18.6, targetC: 20 },
  { label: "09:00", currentC: 19.4, targetC: 20 },
  { label: "12:00", currentC: 20.1, targetC: 20 },
  { label: "15:00", currentC: 20.4, targetC: 20 },
  { label: "18:00", currentC: 19.8, targetC: 21 },
  { label: "21:00", currentC: 19.5, targetC: 21 },
];

export function heatingForScreen(
  status: ConnectionStatus,
  heating: HeatingControl,
): HeatingControl {
  if (status === "demo") {
    return heating.entityId?.startsWith("demo.") ? heating : demoHeatingControl();
  }
  if (!heating.entityId || heating.entityId.startsWith("demo.")) {
    return unmappedHeatingControl();
  }
  return heating;
}

export function isNestDevice(device: HaDeviceReg): boolean {
  const bits = [device.manufacturer, device.model, device.name, device.name_by_user]
    .filter((part) => typeof part === "string" && part.trim())
    .join(" ")
    .toLowerCase();
  if (bits.includes("nest")) return true;
  for (const row of device.identifiers ?? []) {
    const domain = String(row[0] ?? "").toLowerCase();
    if (domain === "nest") return true;
  }
  return false;
}

function stateAvailable(s: HaState) {
  return s.state !== "unavailable" && s.state !== "unknown";
}

function numAttr(attrs: Record<string, unknown>, key: string): number | null {
  const raw = attrs[key];
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim()) {
    const n = Number.parseFloat(raw);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function stringList(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function blobOf(s: HaState, reg?: HaEntityReg): string {
  return `${s.entity_id} ${String(s.attributes.friendly_name ?? "")} ${reg?.name ?? ""}`.toLowerCase();
}

function stepFrom(attrs: Record<string, unknown>): number {
  const raw = numAttr(attrs, "target_temp_step");
  if (raw != null && raw > 0 && raw <= 5) return raw;
  return 0.5;
}

export function roundTemp(n: number, step: number): number {
  const safe = step > 0 ? step : 0.5;
  const snapped = Math.round(n / safe) * safe;
  const decimals = safe < 1 ? 1 : 0;
  const factor = 10 ** decimals;
  return Math.round(snapped * factor) / factor;
}

export function stepHeatingTarget(
  current: number,
  deltaSteps: number,
  step: number,
  min: number,
  max: number,
): number {
  const next = current + deltaSteps * (step > 0 ? step : 0.5);
  return roundTemp(Math.min(max, Math.max(min, next)), step);
}

export function hvacModeLabel(mode: string): string {
  switch (mode) {
    case "heat":
      return "Heat";
    case "cool":
      return "Cool";
    case "heat_cool":
      return "Heat · Cool";
    case "off":
      return "Off";
    case "auto":
      return "Auto";
    case "dry":
      return "Dry";
    case "fan_only":
      return "Fan";
    default:
      return mode.replace(/_/g, " ");
  }
}

/** Words the Nest screen uses for the setpoint, plus the number HA reports. */
export function nestSetLines(heating: HeatingControl): NestSetLine[] {
  if (!heating.available) return [];
  if (heating.eco) {
    return [{ label: "ECO", c: heating.targetC ?? heating.targetLowC }];
  }
  if (heating.hvacMode === "off") return [{ label: "OFF", c: null }];
  if (
    heating.hvacMode === "heat_cool" ||
    (heating.targetC == null && heating.targetLowC != null && heating.targetHighC != null)
  ) {
    return [
      { label: "HEAT SET TO", c: heating.targetLowC },
      { label: "COOL SET TO", c: heating.targetHighC },
    ];
  }
  if (heating.hvacMode === "cool") return [{ label: "COOL SET TO", c: heating.targetC }];
  if (heating.hvacMode === "heat" || heating.targetC != null) {
    return [{ label: "HEAT SET TO", c: heating.targetC }];
  }
  return [{ label: hvacModeLabel(heating.hvacMode).toUpperCase(), c: heating.targetC }];
}

export function formatNestTemp(c: number | null, withUnit = true): string {
  if (c == null || !Number.isFinite(c)) return "—";
  const rounded = Math.round(c * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return withUnit ? `${text}°` : text;
}

export function nestAmbientBadge(heating: HeatingControl): string {
  if (!heating.available || heating.currentC == null) return "—";
  return formatNestTemp(heating.currentC);
}

function climateCandidates(
  states: HaState[],
  entities: HaEntityReg[],
): HaState[] {
  const byEntity = new Map(entities.map((e) => [e.entity_id, e]));
  return states.filter((s) => {
    if (!s.entity_id.startsWith("climate.")) return false;
    const reg = byEntity.get(s.entity_id);
    if (reg?.disabled_by) return false;
    return true;
  });
}

function pickClimate(
  states: HaState[],
  devices: HaDeviceReg[],
  entities: HaEntityReg[],
): { state: HaState; device: HaDeviceReg | null } | null {
  const byEntity = new Map(entities.map((e) => [e.entity_id, e]));
  const byDevice = new Map(devices.map((d) => [d.id, d]));
  const nestDeviceIds = new Set(devices.filter(isNestDevice).map((d) => d.id));

  const ranked = climateCandidates(states, entities).map((state) => {
    const reg = byEntity.get(state.entity_id);
    const device = reg?.device_id ? (byDevice.get(reg.device_id) ?? null) : null;
    const onNestDevice = Boolean(reg?.device_id && nestDeviceIds.has(reg.device_id));
    const nameHit = blobOf(state, reg).includes("nest");
    return { state, device, onNestDevice, nameHit };
  });

  const hits = ranked
    .filter((row) => row.onNestDevice || row.nameHit)
    .sort((a, b) => {
      if (a.onNestDevice !== b.onNestDevice) return a.onNestDevice ? -1 : 1;
      const aHeat = stringList(a.state.attributes.hvac_modes).includes("heat") ? 0 : 1;
      const bHeat = stringList(b.state.attributes.hvac_modes).includes("heat") ? 0 : 1;
      if (aHeat !== bHeat) return aHeat - bHeat;
      return a.state.entity_id.localeCompare(b.state.entity_id);
    });

  const hit = hits[0];
  if (!hit) return null;
  return { state: hit.state, device: hit.device };
}

function scheduleOnDevice(
  states: HaState[],
  entities: HaEntityReg[],
  deviceId: string | null | undefined,
): HaState | null {
  if (!deviceId) return null;
  const byEntity = new Map(entities.map((e) => [e.entity_id, e]));
  const hits = states.filter((s) => {
    const domain = s.entity_id.split(".")[0] ?? "";
    if (domain !== "schedule" && domain !== "calendar" && domain !== "select" && domain !== "input_select") {
      return false;
    }
    const reg = byEntity.get(s.entity_id);
    if (reg?.device_id !== deviceId || reg.disabled_by) return false;
    return blobOf(s, reg).includes("schedule");
  });
  hits.sort((a, b) => a.entity_id.localeCompare(b.entity_id));
  return hits[0] ?? null;
}

function controlFromClimate(
  state: HaState,
  device: HaDeviceReg | null,
  schedule: HaState | null,
): HeatingControl {
  const attrs = state.attributes;
  const hvacModes = stringList(attrs.hvac_modes);
  const presetModes = stringList(attrs.preset_modes);
  const hvacMode = typeof state.state === "string" ? state.state : "";
  const presetRaw = attrs.preset_mode;
  const presetMode = typeof presetRaw === "string" ? presetRaw : null;
  const eco = presetMode === "eco";
  const ecoSupported = presetModes.includes("eco");
  const actionRaw = attrs.hvac_action;
  const hvacAction = typeof actionRaw === "string" ? actionRaw : null;
  const currentC = numAttr(attrs, "current_temperature");
  const targetC = numAttr(attrs, "temperature");
  const targetLowC = numAttr(attrs, "target_temp_low");
  const targetHighC = numAttr(attrs, "target_temp_high");
  const minAttr = numAttr(attrs, "min_temp");
  const maxAttr = numAttr(attrs, "max_temp");
  const minC = minAttr ?? NEST_MIN_C;
  const maxC = maxAttr ?? NEST_MAX_C;
  const range = hvacMode === "heat_cool";
  const single = hvacMode === "heat" || hvacMode === "cool";
  const setpointWritable = stateAvailable(state) && !eco && hvacMode !== "off" && (single || range);

  const label =
    device?.name_by_user?.trim() ||
    device?.name?.trim() ||
    String(attrs.friendly_name ?? "").trim() ||
    "Nest";

  const scheduleOptions = schedule ? stringList(schedule.attributes.options) : [];
  const scheduleState =
    schedule && stateAvailable(schedule) && schedule.state.trim() ? schedule.state : null;

  return {
    entityId: state.entity_id,
    label,
    available: stateAvailable(state),
    currentC,
    targetC,
    targetLowC,
    targetHighC,
    hvacMode: stateAvailable(state) ? hvacMode : "",
    hvacModes,
    hvacAction,
    presetMode,
    presetModes,
    eco,
    ecoSupported,
    setpointWritable,
    minC,
    maxC,
    stepC: stepFrom(attrs),
    scheduleEntityId: schedule?.entity_id ?? null,
    scheduleState,
    scheduleOptions,
    scheduleNote: schedule ? null : NEST_SCHEDULE_NOTE,
  };
}

/**
 * Resolve the Nest climate entity from live states + registries.
 * Returns the unmapped control when nothing on the Pi is a Nest thermostat.
 */
export function heatingControlFromInventory(
  states: HaState[],
  devices: HaDeviceReg[] = [],
  entities: HaEntityReg[] = [],
): HeatingControl {
  const picked = pickClimate(states, devices, entities);
  if (!picked) return unmappedHeatingControl();
  const deviceId =
    entities.find((e) => e.entity_id === picked.state.entity_id)?.device_id ?? picked.device?.id;
  const schedule = scheduleOnDevice(states, entities, deviceId);
  return controlFromClimate(picked.state, picked.device, schedule);
}

type RawHist = {
  state?: string;
  s?: string;
  last_changed?: string;
  last_updated?: string;
  lu?: number;
  attributes?: Record<string, unknown>;
  a?: Record<string, unknown>;
};

function historySeries(result: unknown, entityId: string): RawHist[] {
  if (!result) return [];
  if (Array.isArray(result)) {
    for (const series of result) {
      if (!Array.isArray(series) || !series.length) continue;
      const first = series[0] as { entity_id?: string };
      if (first?.entity_id === entityId) return series as RawHist[];
    }
    return [];
  }
  if (typeof result === "object") {
    const bag = result as Record<string, unknown>;
    const series = bag[entityId];
    return Array.isArray(series) ? (series as RawHist[]) : [];
  }
  return [];
}

function pointTime(row: RawHist): number | null {
  if (typeof row.lu === "number" && Number.isFinite(row.lu)) return row.lu;
  const iso = row.last_changed || row.last_updated;
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : null;
}

function attrsOf(row: RawHist): Record<string, unknown> {
  if (row.attributes && typeof row.attributes === "object") return row.attributes;
  if (row.a && typeof row.a === "object") return row.a;
  return {};
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/**
 * Last 24h of Nest room temperature and setpoint from recorder history.
 * Temperatures live on climate attributes (the state string is the HVAC mode),
 * so this expects a history payload that includes attributes. Empty → [].
 */
export function heatingHistoryFromResult(
  result: unknown,
  entityId: string,
  end: Date = new Date(),
  hours = 24,
): HeatingHistPoint[] {
  const rows = historySeries(result, entityId)
    .map((row) => {
      const t = pointTime(row);
      if (t == null) return null;
      const attrs = attrsOf(row);
      const currentC = numAttr(attrs, "current_temperature");
      const single = numAttr(attrs, "temperature");
      const low = numAttr(attrs, "target_temp_low");
      const high = numAttr(attrs, "target_temp_high");
      return {
        t,
        currentC,
        targetC: single ?? low,
        targetHighC: high,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row != null)
    .sort((a, b) => a.t - b.t);

  if (!rows.length) return [];

  const endMs = end.getTime();
  const startMs = endMs - hours * 60 * 60 * 1000;
  const out: HeatingHistPoint[] = [];
  let cursor = 0;
  let last: (typeof rows)[number] | null = null;

  for (let h = 0; h < hours; h++) {
    const bucketEnd = startMs + (h + 1) * 60 * 60 * 1000;
    while (cursor < rows.length && rows[cursor]!.t <= bucketEnd) {
      last = rows[cursor]!;
      cursor += 1;
    }
    if (!last || last.t > bucketEnd) continue;
    if (last.currentC == null && last.targetC == null) continue;
    const stamp = new Date(bucketEnd);
    out.push({
      label: `${pad2(stamp.getHours())}:00`,
      currentC: last.currentC,
      targetC: last.targetC,
      targetHighC: last.targetHighC,
    });
  }

  return out;
}
