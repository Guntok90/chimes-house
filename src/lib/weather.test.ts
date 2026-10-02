import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { HaState } from "./ha.ts";
import {
  DEMO_WEATHER,
  ECOWITT_PREFIX,
  WEATHER_SENSORS,
  formatWeatherNumber,
  formatWeatherValue,
  mapWeatherEntities,
  overlayRainReading,
  overlayReadings,
  overlayWeatherRows,
  weatherFromStates,
  weatherInterestIds,
} from "./weather.ts";

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

const STATION: HaState[] = [
  state(`${ECOWITT_PREFIX}outdoor_temperature`, "22.5", "Chimes Outdoor Temperature", "°C"),
  state(`${ECOWITT_PREFIX}feels_like_temperature`, "21.8", "Chimes Feels Like", "°C"),
  state(`${ECOWITT_PREFIX}dewpoint`, "14.2", "Chimes Dewpoint", "°C"),
  state(`${ECOWITT_PREFIX}humidity`, "58", "Chimes Humidity", "%"),
  state(`${ECOWITT_PREFIX}indoor_temperature`, "21.1", "Chimes Lounge Temperature", "°C"),
  state(`${ECOWITT_PREFIX}temperature_1`, "32.6", "Chimes Greenhouse Temperature", "°C"),
  state(`${ECOWITT_PREFIX}wind_speed`, "8.4", "Chimes Wind Speed", "km/h"),
  state(`${ECOWITT_PREFIX}wind_gust`, "12.1", "Chimes Wind Gust", "mph"),
  state(`${ECOWITT_PREFIX}max_daily_gust`, "18.6", "Chimes Max Gust", "mph"),
  state(`${ECOWITT_PREFIX}wind_direction`, "220", "Chimes Wind Direction", "°"),
  state(`${ECOWITT_PREFIX}rain_rate`, "0.0", "Chimes Rainfall Rate", "mm/h"),
  state(`${ECOWITT_PREFIX}daily_rain`, "1.2", "Chimes Daily Rain", "mm"),
  state(`${ECOWITT_PREFIX}relative_pressure`, "761.2", "Chimes Relative Pressure", "mmHg"),
  state(`${ECOWITT_PREFIX}solar_radiation`, "412", "Chimes Solar Radiation", "W/m²"),
  state(`${ECOWITT_PREFIX}uv`, "3", "Chimes UV Index", "UV index"),
  state(
    "sensor.t_h_sensor_with_external_probe_temperature",
    "18.2",
    "Pond Air Temperature",
    "°C",
  ),
  state(
    "sensor.t_h_sensor_with_external_probe_probe_temperature",
    "12.4",
    "Pond Water Temperature",
    "°C",
  ),
  // Extra not in curated list — still discovered.
  state(`${ECOWITT_PREFIX}lightning_count`, "2", "Chimes Lightning Count", "strikes"),
  // Battery — skipped as extra noise.
  state(`${ECOWITT_PREFIX}battery`, "85", "Chimes Battery", "%"),
];

describe("Ecowitt weather mapping", () => {
  it("maps preferred hp2553ae entity ids and pond T&H pair", () => {
    const map = mapWeatherEntities(STATION);
    assert.equal(map.wxOutdoorTemp, `${ECOWITT_PREFIX}outdoor_temperature`);
    assert.equal(map.wxGreenhouseTemp, `${ECOWITT_PREFIX}temperature_1`);
    assert.equal(map.wxWindGust, `${ECOWITT_PREFIX}wind_gust`);
    assert.equal(map.wxRelativePressure, `${ECOWITT_PREFIX}relative_pressure`);
    assert.equal(map.wxSolarRadiation, `${ECOWITT_PREFIX}solar_radiation`);
    assert.equal(map.wxUv, `${ECOWITT_PREFIX}uv`);
    assert.equal(
      map.wxPondAir,
      "sensor.t_h_sensor_with_external_probe_temperature",
    );
    assert.equal(
      map.wxPondWater,
      "sensor.t_h_sensor_with_external_probe_probe_temperature",
    );
  });

  it("builds readings with HA units as-is (mixed mph / km/h)", () => {
    const map = mapWeatherEntities(STATION);
    const weather = weatherFromStates(STATION, map);
    assert.equal(weather.byKey.outdoorTemp?.value, 22.5);
    assert.equal(weather.byKey.outdoorTemp?.unit, "°C");
    assert.equal(weather.byKey.windSpeed?.unit, "km/h");
    assert.equal(weather.byKey.windGust?.unit, "mph");
    assert.equal(weather.byKey.greenhouseTemp?.value, 32.6);
    assert.equal(weather.byKey.pondAir?.label, "Pond air temperature");
    assert.equal(weather.byKey.pondWater?.value, 12.4);
    // Discovered extras include solar/UV (curated) and lightning; not battery.
    assert.ok(weather.readings.some((r) => r.key === `${ECOWITT_PREFIX}lightning_count`));
    assert.equal(
      weather.readings.some((r) => r.entityId.includes("battery")),
      false,
    );
  });

  it("skips unavailable curated sensors except when still useful to show", () => {
    const states = [
      state(`${ECOWITT_PREFIX}outdoor_temperature`, "unavailable", "Outdoor", "°C"),
      state(`${ECOWITT_PREFIX}windchill`, "unknown", "Windchill", "°C"),
      state(`${ECOWITT_PREFIX}humidity`, "55", "Humidity", "%"),
    ];
    const map = mapWeatherEntities(states);
    assert.equal(map.wxOutdoorTemp, undefined);
    assert.equal(map.wxHumidity, `${ECOWITT_PREFIX}humidity`);
    // windchill may stay mapped even when unknown so the UI can show —
    assert.equal(map.wxWindchill, `${ECOWITT_PREFIX}windchill`);
  });

  it("includes station sensors in WS interest", () => {
    const map = mapWeatherEntities(STATION);
    const ids = weatherInterestIds(STATION, map);
    assert.ok(ids.includes(`${ECOWITT_PREFIX}outdoor_temperature`));
    assert.ok(ids.includes(`${ECOWITT_PREFIX}lightning_count`));
    assert.ok(ids.includes("sensor.t_h_sensor_with_external_probe_probe_temperature"));
  });

  it("overlay prefers rain rate when raining, else daily rain", () => {
    const map = mapWeatherEntities(STATION);
    const dry = weatherFromStates(STATION, map);
    assert.equal(overlayRainReading(dry)?.key, "dailyRain");

    const wetStates = STATION.map((s) =>
      s.entity_id.endsWith("rain_rate") ? state(s.entity_id, "2.4", "Rain rate", "mm/h") : s,
    );
    const wet = weatherFromStates(wetStates, map);
    assert.equal(overlayRainReading(wet)?.key, "rainRate");
    assert.equal(overlayRainReading(wet)?.value, 2.4);
  });

  it("overlay ambient rows: lounge hero then Dad’s pairs (rain today|week)", () => {
    // STATION fixture needs weekly rain for this assertion.
    const withWeek = [
      ...STATION,
      state(`${ECOWITT_PREFIX}weekly_rain`, "4.8", "Chimes Weekly Rain", "mm"),
    ];
    const mapWeek = mapWeatherEntities(withWeek);
    const live = weatherFromStates(withWeek, mapWeek);
    const overlay = overlayReadings(live);
    assert.equal(overlay[0]?.key, "loungeTemp");
    assert.deepEqual(
      overlay.map((r) => r.key),
      [
        "loungeTemp",
        "outdoorTemp",
        "feelsLike",
        "windSpeed",
        "windGust",
        "dailyRain",
        "weeklyRain",
        "pondWater",
        "pondAir",
        "greenhouseTemp",
        "dewpoint",
      ],
    );

    const rows = overlayWeatherRows(live);
    assert.equal(rows[0]?.kind, "hero");
    if (rows[0]?.kind === "hero") assert.equal(rows[0].reading.key, "loungeTemp");
    assert.equal(rows.length, 6);
    const pairKeys = rows.slice(1).map((r) => {
      assert.equal(r.kind, "pair");
      if (r.kind !== "pair") return "";
      return `${r.left?.key}|${r.right?.key}`;
    });
    assert.deepEqual(pairKeys, [
      "outdoorTemp|feelsLike",
      "windSpeed|windGust",
      "dailyRain|weeklyRain",
      "pondWater|pondAir",
      "greenhouseTemp|dewpoint",
    ]);

    // Demo snapshot also covers the ambient set Dad asked for.
    const demo = overlayReadings(DEMO_WEATHER);
    assert.equal(demo[0]?.key, "loungeTemp");
    assert.ok(demo.some((r) => r.key === "windGust"));
    assert.ok(demo.some((r) => r.key === "weeklyRain"));
    assert.ok(demo.some((r) => r.key === "dailyRain"));
    assert.ok(!demo.some((r) => r.key === "rainRate"));
  });

  it("formats values with HA units", () => {
    const r = DEMO_WEATHER.byKey.outdoorTemp!;
    assert.equal(formatWeatherNumber(r), "22.5");
    assert.match(formatWeatherValue(r), /22\.5 °C/);
  });

  it("demo snapshot covers curated keys dad asked for", () => {
    const keys = new Set(DEMO_WEATHER.readings.map((r) => r.key));
    for (const def of WEATHER_SENSORS) {
      if (def.key === "windchill") continue; // may be unavailable in demo
      assert.ok(keys.has(def.key), `missing ${def.key}`);
    }
  });
});
