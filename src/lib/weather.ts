/**
 * Ecowitt / pond weather readings for the Weather page + Overview ambient tile.
 *
 * Live entity ids come from Dad’s HP2553AE station (prefix
 * `sensor.hp2553ae_pro_v1_9_0_*`) plus the T&H pond probe pair already used
 * for Overview pond graphs. Units are whatever HA reports — never converted.
 */

import type { HaState } from "./ha.ts";

/** Station entity prefix on Chimes-Pi (Ecowitt defaults until renamed). */
export const ECOWITT_PREFIX = "sensor.hp2553ae_pro_v1_9_0_";

/** Alternate prefixes / renamed stubs Dad mentioned — preferred list first. */
export const ECOWITT_PREFIXES = [
  ECOWITT_PREFIX,
  "sensor.hp2553ae_",
  "sensor.chimes_",
] as const;

export type WeatherGroup =
  | "conditions"
  | "wind"
  | "rain"
  | "sun"
  | "greenhouse"
  | "lounge"
  | "pond"
  | "pressure"
  | "extra";

export type WeatherKey =
  | "outdoorTemp"
  | "feelsLike"
  | "dewpoint"
  | "humidity"
  | "loungeTemp"
  | "greenhouseTemp"
  | "windSpeed"
  | "windGust"
  | "maxDailyGust"
  | "windDirection"
  | "windDirection10m"
  | "windchill"
  | "rainRate"
  | "hourlyRain"
  | "dailyRain"
  | "eventRain"
  | "weeklyRain"
  | "monthlyRain"
  | "yearlyRain"
  | "relativePressure"
  | "absolutePressure"
  | "solarRadiation"
  | "uv"
  | "pondAir"
  | "pondWater";

/** HaMap keys for weather entities (kept out of HouseLive). */
export type WeatherMapKey = `wx${Capitalize<WeatherKey>}`;

export type WeatherReading = {
  key: WeatherKey | string;
  label: string;
  value: number | null;
  unit: string;
  entityId: string;
  group: WeatherGroup;
  /** True when state is unavailable / unknown / missing. */
  unavailable: boolean;
};

export type WeatherLive = {
  readings: WeatherReading[];
  /** Quick lookup for overlay / hero cards. */
  byKey: Partial<Record<WeatherKey, WeatherReading>>;
};

type SensorDef = {
  key: WeatherKey;
  mapKey: WeatherMapKey;
  label: string;
  group: WeatherGroup;
  /** Preferred entity ids (exact). */
  preferred: string[];
  /** Suffix after Ecowitt prefix, e.g. `outdoor_temperature`. */
  suffixes: string[];
  /** Extra id/friendly-name tokens for fuzzy match. */
  match?: string[];
};

/**
 * Curated Chimes-facing labels. Preferred ids match live HA (Ecowitt defaults).
 * Pond air/water reuse the T&H body/probe pair already mapped for Overview.
 */
export const WEATHER_SENSORS: readonly SensorDef[] = [
  {
    key: "outdoorTemp",
    mapKey: "wxOutdoorTemp",
    label: "Outdoor temperature",
    group: "conditions",
    preferred: [`${ECOWITT_PREFIX}outdoor_temperature`],
    suffixes: ["outdoor_temperature"],
    match: ["outdoor temperature", "chimes outdoor"],
  },
  {
    key: "feelsLike",
    mapKey: "wxFeelsLike",
    label: "Feels like",
    group: "conditions",
    preferred: [`${ECOWITT_PREFIX}feels_like_temperature`],
    suffixes: ["feels_like_temperature"],
    match: ["feels like"],
  },
  {
    key: "dewpoint",
    mapKey: "wxDewpoint",
    label: "Dewpoint",
    group: "conditions",
    preferred: [
      `${ECOWITT_PREFIX}dewpoint`,
      "sensor.chimes_dew_point",
      "sensor.chimes_dewpoint",
    ],
    suffixes: ["dewpoint", "dew_point"],
    match: ["dewpoint", "dew point"],
  },
  {
    key: "humidity",
    mapKey: "wxHumidity",
    label: "Humidity",
    group: "conditions",
    preferred: [`${ECOWITT_PREFIX}humidity`],
    suffixes: ["humidity"],
    match: ["outdoor humidity", "chimes humidity"],
  },
  {
    key: "loungeTemp",
    mapKey: "wxLoungeTemp",
    label: "Lounge temperature",
    group: "lounge",
    preferred: [`${ECOWITT_PREFIX}indoor_temperature`],
    suffixes: ["indoor_temperature"],
    match: ["lounge temperature", "indoor temperature"],
  },
  {
    key: "greenhouseTemp",
    mapKey: "wxGreenhouseTemp",
    label: "Greenhouse temperature",
    group: "greenhouse",
    preferred: [`${ECOWITT_PREFIX}temperature_1`],
    suffixes: ["temperature_1"],
    match: ["greenhouse temperature", "temperature 1"],
  },
  {
    key: "windSpeed",
    mapKey: "wxWindSpeed",
    label: "Wind speed",
    group: "wind",
    preferred: [`${ECOWITT_PREFIX}wind_speed`],
    suffixes: ["wind_speed"],
    match: ["wind speed"],
  },
  {
    key: "windGust",
    mapKey: "wxWindGust",
    label: "Wind gust",
    group: "wind",
    preferred: [`${ECOWITT_PREFIX}wind_gust`],
    suffixes: ["wind_gust"],
    match: ["wind gust"],
  },
  {
    key: "maxDailyGust",
    mapKey: "wxMaxDailyGust",
    label: "Max daily gust",
    group: "wind",
    preferred: [`${ECOWITT_PREFIX}max_daily_gust`],
    suffixes: ["max_daily_gust"],
    match: ["max daily gust", "max gust"],
  },
  {
    key: "windDirection",
    mapKey: "wxWindDirection",
    label: "Wind direction",
    group: "wind",
    preferred: [`${ECOWITT_PREFIX}wind_direction`],
    suffixes: ["wind_direction"],
    match: ["wind direction"],
  },
  {
    key: "windDirection10m",
    mapKey: "wxWindDirection10m",
    label: "Wind direction (10m avg)",
    group: "wind",
    preferred: [`${ECOWITT_PREFIX}wind_direction_10m_avg`],
    suffixes: ["wind_direction_10m_avg"],
    match: ["wind direction 10m", "10m avg"],
  },
  {
    key: "windchill",
    mapKey: "wxWindchill",
    label: "Windchill",
    group: "wind",
    preferred: [`${ECOWITT_PREFIX}windchill`],
    suffixes: ["windchill"],
    match: ["windchill", "wind chill"],
  },
  {
    key: "rainRate",
    mapKey: "wxRainRate",
    label: "Rain rate",
    group: "rain",
    preferred: [`${ECOWITT_PREFIX}rain_rate`],
    suffixes: ["rain_rate"],
    match: ["rain rate", "rainfall rate"],
  },
  {
    key: "hourlyRain",
    mapKey: "wxHourlyRain",
    label: "Rain · hour",
    group: "rain",
    preferred: [`${ECOWITT_PREFIX}hourly_rain`],
    suffixes: ["hourly_rain"],
    match: ["hourly rain"],
  },
  {
    key: "dailyRain",
    mapKey: "wxDailyRain",
    label: "Rain · today",
    group: "rain",
    preferred: [`${ECOWITT_PREFIX}daily_rain`],
    suffixes: ["daily_rain"],
    match: ["daily rain", "rainfall today"],
  },
  {
    key: "eventRain",
    mapKey: "wxEventRain",
    label: "Rain · event",
    group: "rain",
    preferred: [`${ECOWITT_PREFIX}event_rain`],
    suffixes: ["event_rain"],
    match: ["event rain"],
  },
  {
    key: "weeklyRain",
    mapKey: "wxWeeklyRain",
    label: "Rain · week",
    group: "rain",
    preferred: [`${ECOWITT_PREFIX}weekly_rain`],
    suffixes: ["weekly_rain"],
    match: ["weekly rain"],
  },
  {
    key: "monthlyRain",
    mapKey: "wxMonthlyRain",
    label: "Rain · month",
    group: "rain",
    preferred: [`${ECOWITT_PREFIX}monthly_rain`],
    suffixes: ["monthly_rain"],
    match: ["monthly rain"],
  },
  {
    key: "yearlyRain",
    mapKey: "wxYearlyRain",
    label: "Rain · year",
    group: "rain",
    preferred: [`${ECOWITT_PREFIX}yearly_rain`],
    suffixes: ["yearly_rain"],
    match: ["yearly rain"],
  },
  {
    key: "relativePressure",
    mapKey: "wxRelativePressure",
    label: "Relative pressure",
    group: "pressure",
    preferred: [`${ECOWITT_PREFIX}relative_pressure`],
    suffixes: ["relative_pressure"],
    match: ["relative pressure"],
  },
  {
    key: "absolutePressure",
    mapKey: "wxAbsolutePressure",
    label: "Absolute pressure",
    group: "pressure",
    preferred: [
      `${ECOWITT_PREFIX}absolute_pressure`,
      `${ECOWITT_PREFIX}abs_pressure`,
    ],
    suffixes: ["absolute_pressure", "abs_pressure"],
    match: ["absolute pressure", "abs pressure"],
  },
  {
    key: "solarRadiation",
    mapKey: "wxSolarRadiation",
    label: "Solar radiation",
    group: "sun",
    preferred: [
      `${ECOWITT_PREFIX}solar_radiation`,
      `${ECOWITT_PREFIX}solarirradiance`,
      `${ECOWITT_PREFIX}solarradiation`,
    ],
    suffixes: ["solar_radiation", "solarirradiance", "solarradiation"],
    match: ["solar radiation", "solar irradiance"],
  },
  {
    key: "uv",
    mapKey: "wxUv",
    label: "UV index",
    group: "sun",
    preferred: [`${ECOWITT_PREFIX}uv`, `${ECOWITT_PREFIX}uv_index`],
    suffixes: ["uv", "uv_index"],
    match: ["uv index", "uv"],
  },
  {
    key: "pondAir",
    mapKey: "wxPondAir",
    label: "Pond air temperature",
    group: "pond",
    preferred: [
      "sensor.t_h_sensor_with_external_probe_temperature",
      "sensor.th_sensor_with_external_probe_temperature",
    ],
    suffixes: [],
    match: ["pond air"],
  },
  {
    key: "pondWater",
    mapKey: "wxPondWater",
    label: "Pond water temperature",
    group: "pond",
    preferred: [
      "sensor.t_h_sensor_with_external_probe_probe_temperature",
      "sensor.th_sensor_with_external_probe_probe_temperature",
    ],
    suffixes: [],
    match: ["pond water"],
  },
] as const;

/** Section order on the Weather page. */
export const WEATHER_SECTION_ORDER: { group: WeatherGroup; title: string }[] = [
  { group: "conditions", title: "Outdoor" },
  { group: "wind", title: "Wind" },
  { group: "rain", title: "Rain" },
  { group: "sun", title: "Sun" },
  { group: "lounge", title: "Lounge" },
  { group: "greenhouse", title: "Greenhouse" },
  { group: "pond", title: "Pond" },
  { group: "pressure", title: "Pressure" },
  { group: "extra", title: "More from the station" },
];

/** Overlay shows only these keys (quiet large numbers, no charts). */
export const WEATHER_OVERLAY_KEYS: readonly WeatherKey[] = [
  "outdoorTemp",
  "feelsLike",
  "dewpoint",
  "greenhouseTemp",
  "pondAir",
  "pondWater",
  "windSpeed",
  "rainRate",
  "dailyRain",
] as const;

const SKIP_EXTRA_TOKENS = [
  "battery",
  "signal",
  "rssi",
  "voltage",
  "firmware",
  "last_seen",
  "update",
];

function blob(s: HaState) {
  return `${s.entity_id} ${String(s.attributes.friendly_name ?? "")}`.toLowerCase();
}

function available(s: HaState) {
  return s.state !== "unavailable" && s.state !== "unknown";
}

function unitOf(s: HaState) {
  return String(s.attributes.unit_of_measurement ?? "");
}

function num(state: string) {
  const n = Number.parseFloat(state);
  return Number.isFinite(n) ? n : null;
}

function isDisabled(s: HaState) {
  // HA entity registry “disabled” entities usually never appear in get_states.
  // Skip obvious non-sensor noise and disabled-looking states.
  const b = blob(s);
  if (s.attributes.restored === true && !available(s)) return true;
  if (SKIP_EXTRA_TOKENS.some((t) => b.includes(t))) return true;
  return false;
}

function isEcowittStation(s: HaState) {
  const id = s.entity_id.toLowerCase();
  return (
    id.includes("hp2553ae") ||
    (id.startsWith("sensor.") &&
      (id.includes("ecowitt") ||
        (id.includes("weather_station") && !id.includes("t_h_sensor"))))
  );
}

function preferredHit(states: HaState[], ids: readonly string[] | undefined) {
  if (!ids?.length) return undefined;
  for (const id of ids) {
    const hit = states.find((s) => s.entity_id === id && !isDisabled(s));
    if (hit) return hit;
  }
  return undefined;
}

function suffixHit(states: HaState[], suffixes: readonly string[]) {
  for (const suffix of suffixes) {
    for (const prefix of ECOWITT_PREFIXES) {
      const id = `${prefix}${suffix}`;
      const hit = states.find((s) => s.entity_id === id && !isDisabled(s));
      if (hit) return hit;
    }
    // Any hp2553ae_*…_suffix
    const hit = states.find((s) => {
      if (!s.entity_id.startsWith("sensor.")) return false;
      if (isDisabled(s)) return false;
      const id = s.entity_id.toLowerCase();
      return id.includes("hp2553ae") && id.endsWith(`_${suffix}`);
    });
    if (hit) return hit;
  }
  return undefined;
}

function fuzzyHit(states: HaState[], def: SensorDef, used: Set<string>) {
  if (!def.match?.length) return undefined;
  return states.find((s) => {
    if (!s.entity_id.startsWith("sensor.")) return false;
    if (used.has(s.entity_id) || isDisabled(s)) return false;
    if (def.group !== "pond" && !isEcowittStation(s) && !blob(s).includes("chimes")) {
      return false;
    }
    const b = blob(s);
    return def.match!.some((m) => b.includes(m));
  });
}

/** Map curated weather entity ids into HaMap-compatible wx* keys. */
export function mapWeatherEntities(states: HaState[]): Partial<Record<WeatherMapKey, string>> {
  const out: Partial<Record<WeatherMapKey, string>> = {};
  const used = new Set<string>();

  for (const def of WEATHER_SENSORS) {
    const hit =
      preferredHit(states, def.preferred) ??
      suffixHit(states, def.suffixes) ??
      fuzzyHit(states, def, used);
    if (!hit) continue;
    // Skip unavailable curated sensors so we don't pin a dead id.
    if (!available(hit) && def.key !== "windchill") continue;
    out[def.mapKey] = hit.entity_id;
    used.add(hit.entity_id);
  }

  return out;
}

/** Entity ids to keep in the WS interest set (curated + discovered extras). */
export function weatherInterestIds(
  states: HaState[] | Map<string, HaState>,
  map: Partial<Record<WeatherMapKey, string>>,
): string[] {
  const inventory = states instanceof Map ? Array.from(states.values()) : states;
  const ids = new Set<string>();
  for (const value of Object.values(map)) {
    if (typeof value === "string" && value) ids.add(value);
  }
  for (const s of inventory) {
    if (!s.entity_id.startsWith("sensor.")) continue;
    if (isDisabled(s)) continue;
    if (isEcowittStation(s)) ids.add(s.entity_id);
  }
  return [...ids];
}

function readingFromState(
  key: WeatherKey | string,
  label: string,
  group: WeatherGroup,
  s: HaState | undefined,
): WeatherReading {
  if (!s) {
    return {
      key,
      label,
      value: null,
      unit: "",
      entityId: "",
      group,
      unavailable: true,
    };
  }
  const ok = available(s);
  return {
    key,
    label,
    value: ok ? num(s.state) : null,
    unit: unitOf(s),
    entityId: s.entity_id,
    group,
    unavailable: !ok,
  };
}

function friendlyExtraLabel(s: HaState): string {
  const name = String(s.attributes.friendly_name ?? "").trim();
  if (name) {
    return name
      .replace(/^HP2553AE[_\s-]*Pro[_\s-]*V?[\d.]*\s*/i, "")
      .replace(/^Chimes\s+/i, "")
      .trim() || name;
  }
  const id = s.entity_id.replace(/^sensor\./, "");
  const stripped = id.replace(/^hp2553ae_pro_v1_9_0_/, "").replace(/^hp2553ae_/, "");
  return stripped
    .split("_")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Build live weather readings from HA states + wx* map.
 * Discovers additional hp2553ae_* sensors (solar/UV/abs pressure etc.) into extras.
 */
export function weatherFromStates(
  states: HaState[] | Map<string, HaState>,
  map: Partial<Record<WeatherMapKey, string>>,
): WeatherLive {
  const byId = states instanceof Map ? states : new Map(states.map((s) => [s.entity_id, s]));
  const inventory = [...byId.values()];
  const readings: WeatherReading[] = [];
  const byKey: Partial<Record<WeatherKey, WeatherReading>> = {};
  const used = new Set<string>();

  for (const def of WEATHER_SENSORS) {
    const id = map[def.mapKey];
    const s = id ? byId.get(id) : undefined;
    // Prefer mapped; fall back to preferred id lookup for demo/partial maps.
    const resolved =
      s ??
      preferredHit(inventory, def.preferred) ??
      suffixHit(inventory, def.suffixes);
    const reading = readingFromState(def.key, def.label, def.group, resolved);
    if (resolved) used.add(resolved.entity_id);
    // Omit fully missing curated sensors (no entity at all).
    if (!resolved) continue;
    readings.push(reading);
    byKey[def.key] = reading;
  }

  // Discover leftover station sensors (solar/UV etc. not in the curated list).
  for (const s of inventory) {
    if (!s.entity_id.startsWith("sensor.")) continue;
    if (!isEcowittStation(s) || isDisabled(s) || used.has(s.entity_id)) continue;
    if (!available(s) && num(s.state) == null) continue;
    const reading = readingFromState(
      s.entity_id,
      friendlyExtraLabel(s),
      "extra",
      s,
    );
    readings.push(reading);
    used.add(s.entity_id);
  }

  return { readings, byKey };
}

export const EMPTY_WEATHER: WeatherLive = { readings: [], byKey: {} };

/** Demo snapshot when not live — Chimes-ish UK late summer afternoon. */
export const DEMO_WEATHER: WeatherLive = weatherFromStates(
  [
    {
      entity_id: `${ECOWITT_PREFIX}outdoor_temperature`,
      state: "22.5",
      attributes: { friendly_name: "Chimes Outdoor Temperature", unit_of_measurement: "°C" },
    },
    {
      entity_id: `${ECOWITT_PREFIX}feels_like_temperature`,
      state: "21.8",
      attributes: { friendly_name: "Chimes Feels Like Temperature", unit_of_measurement: "°C" },
    },
    {
      entity_id: `${ECOWITT_PREFIX}dewpoint`,
      state: "14.2",
      attributes: { friendly_name: "Chimes Dewpoint", unit_of_measurement: "°C" },
    },
    {
      entity_id: `${ECOWITT_PREFIX}humidity`,
      state: "58",
      attributes: { friendly_name: "Chimes Humidity", unit_of_measurement: "%" },
    },
    {
      entity_id: `${ECOWITT_PREFIX}indoor_temperature`,
      state: "21.1",
      attributes: { friendly_name: "Chimes Lounge Temperature", unit_of_measurement: "°C" },
    },
    {
      entity_id: `${ECOWITT_PREFIX}temperature_1`,
      state: "32.6",
      attributes: { friendly_name: "Chimes Greenhouse Temperature", unit_of_measurement: "°C" },
    },
    {
      entity_id: `${ECOWITT_PREFIX}wind_speed`,
      state: "8.4",
      attributes: {
        friendly_name: "Chimes Weather Station Wind Speed",
        unit_of_measurement: "km/h",
      },
    },
    {
      entity_id: `${ECOWITT_PREFIX}wind_gust`,
      state: "12.1",
      attributes: { friendly_name: "Chimes Wind Gust", unit_of_measurement: "mph" },
    },
    {
      entity_id: `${ECOWITT_PREFIX}max_daily_gust`,
      state: "18.6",
      attributes: { friendly_name: "Chimes Wind Max Gust Speed", unit_of_measurement: "mph" },
    },
    {
      entity_id: `${ECOWITT_PREFIX}wind_direction`,
      state: "220",
      attributes: { friendly_name: "Chimes Wind Direction", unit_of_measurement: "°" },
    },
    {
      entity_id: `${ECOWITT_PREFIX}wind_direction_10m_avg`,
      state: "215",
      attributes: { friendly_name: "Chimes Wind Direction 10m Avg", unit_of_measurement: "°" },
    },
    {
      entity_id: `${ECOWITT_PREFIX}windchill`,
      state: "unknown",
      attributes: { friendly_name: "Chimes Windchill", unit_of_measurement: "°C" },
    },
    {
      entity_id: `${ECOWITT_PREFIX}rain_rate`,
      state: "0.0",
      attributes: { friendly_name: "Chimes Rainfall Rate", unit_of_measurement: "mm/h" },
    },
    {
      entity_id: `${ECOWITT_PREFIX}hourly_rain`,
      state: "0.0",
      attributes: { friendly_name: "Chimes Hourly Rain", unit_of_measurement: "mm" },
    },
    {
      entity_id: `${ECOWITT_PREFIX}daily_rain`,
      state: "1.2",
      attributes: { friendly_name: "Chimes Daily Rain", unit_of_measurement: "mm" },
    },
    {
      entity_id: `${ECOWITT_PREFIX}event_rain`,
      state: "1.2",
      attributes: { friendly_name: "Chimes Event Rain", unit_of_measurement: "mm" },
    },
    {
      entity_id: `${ECOWITT_PREFIX}weekly_rain`,
      state: "4.8",
      attributes: { friendly_name: "Chimes Weekly Rain", unit_of_measurement: "mm" },
    },
    {
      entity_id: `${ECOWITT_PREFIX}monthly_rain`,
      state: "32.4",
      attributes: { friendly_name: "Chimes Monthly Rain", unit_of_measurement: "mm" },
    },
    {
      entity_id: `${ECOWITT_PREFIX}yearly_rain`,
      state: "418.6",
      attributes: { friendly_name: "Chimes Yearly Rain", unit_of_measurement: "mm" },
    },
    {
      entity_id: `${ECOWITT_PREFIX}relative_pressure`,
      state: "761.2",
      attributes: { friendly_name: "Chimes Relative Pressure", unit_of_measurement: "mmHg" },
    },
    {
      entity_id: `${ECOWITT_PREFIX}absolute_pressure`,
      state: "758.4",
      attributes: { friendly_name: "Chimes Absolute Pressure", unit_of_measurement: "mmHg" },
    },
    {
      entity_id: `${ECOWITT_PREFIX}solar_radiation`,
      state: "412",
      attributes: { friendly_name: "Chimes Solar Radiation", unit_of_measurement: "W/m²" },
    },
    {
      entity_id: `${ECOWITT_PREFIX}uv`,
      state: "3",
      attributes: { friendly_name: "Chimes UV Index", unit_of_measurement: "UV index" },
    },
    {
      entity_id: "sensor.t_h_sensor_with_external_probe_temperature",
      state: "21.2",
      attributes: { friendly_name: "Pond Air Temperature", unit_of_measurement: "°C" },
    },
    {
      entity_id: "sensor.t_h_sensor_with_external_probe_probe_temperature",
      state: "12.4",
      attributes: { friendly_name: "Pond Water Temperature", unit_of_measurement: "°C" },
    },
  ],
  Object.fromEntries(
    WEATHER_SENSORS.map((d) => [d.mapKey, d.preferred[0]]),
  ) as Partial<Record<WeatherMapKey, string>>,
);

export function sameWeather(a: WeatherLive, b: WeatherLive): boolean {
  if (a.readings.length !== b.readings.length) return false;
  for (let i = 0; i < a.readings.length; i++) {
    const x = a.readings[i]!;
    const y = b.readings[i]!;
    if (
      x.key !== y.key ||
      x.value !== y.value ||
      x.unit !== y.unit ||
      x.entityId !== y.entityId ||
      x.unavailable !== y.unavailable
    ) {
      return false;
    }
  }
  return true;
}

/** Format a reading for Metric tiles — HA units as-is. */
export function formatWeatherValue(r: WeatherReading | undefined): string {
  if (!r || r.unavailable || r.value == null) return "—";
  const v = r.value;
  const abs = Math.abs(v);
  const text =
    abs >= 100 ? String(Math.round(v)) : abs >= 10 ? v.toFixed(1) : v.toFixed(1);
  return r.unit ? `${text} ${r.unit}` : text;
}

/** Large ambient number only (unit shown separately). */
export function formatWeatherNumber(r: WeatherReading | undefined): string {
  if (!r || r.unavailable || r.value == null) return "—";
  const v = r.value;
  const abs = Math.abs(v);
  if (Number.isInteger(v) || abs >= 100) return String(Math.round(v));
  return v.toFixed(1);
}

export function weatherByGroup(
  weather: WeatherLive,
  group: WeatherGroup,
): WeatherReading[] {
  return weather.readings.filter((r) => r.group === group);
}

/**
 * Overlay rain row: prefer rain rate when > 0, else rainfall today.
 * Always returns at most one of rainRate / dailyRain for the rain slot.
 */
export function overlayRainReading(weather: WeatherLive): WeatherReading | undefined {
  const rate = weather.byKey.rainRate;
  if (rate && !rate.unavailable && rate.value != null && rate.value > 0) return rate;
  const daily = weather.byKey.dailyRain;
  if (daily && !daily.unavailable) return daily;
  return rate ?? daily;
}

/** Overlay key list with rain collapsed to a single slot. */
export function overlayReadings(weather: WeatherLive): WeatherReading[] {
  const out: WeatherReading[] = [];
  for (const key of WEATHER_OVERLAY_KEYS) {
    if (key === "rainRate" || key === "dailyRain") continue;
    const r = weather.byKey[key];
    if (r) out.push(r);
  }
  const rain = overlayRainReading(weather);
  if (rain) out.push(rain);
  return out;
}
