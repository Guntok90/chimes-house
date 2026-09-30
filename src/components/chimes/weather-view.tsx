import { CloudSun } from "lucide-react";
import { useMemo } from "react";
import { usesDemoCharts } from "@/lib/house";
import { useHouse, useWeather } from "@/lib/house-store";
import {
  DEMO_WEATHER,
  WEATHER_SECTION_ORDER,
  formatWeatherValue,
  weatherByGroup,
  type WeatherGroup,
  type WeatherLive,
  type WeatherReading,
} from "@/lib/weather";
import { Metric, PageTitle, SectionLabel, Surface } from "./ui";

/**
 * Full Weather page — Ecowitt HP2553AE station + pond T&H probe.
 * Live via the same HA WebSocket as Energy/House (no separate poll loop).
 */
export function WeatherView() {
  const status = useHouse((s) => s.status);
  const liveWeather = useWeather();
  const demo = usesDemoCharts(status);
  const weather: WeatherLive = demo ? DEMO_WEATHER : liveWeather;

  const sections = useMemo(() => {
    return WEATHER_SECTION_ORDER.map(({ group, title }) => ({
      group,
      title,
      readings: weatherByGroup(weather, group),
    })).filter((s) => s.readings.length > 0);
  }, [weather]);

  const outdoor = weather.byKey.outdoorTemp;
  const feels = weather.byKey.feelsLike;
  const dew = weather.byKey.dewpoint;
  const humidity = weather.byKey.humidity;

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <PageTitle>Weather</PageTitle>
        <p className="text-sm text-ink-soft">
          {demo ? "Demo snapshot" : status === "live" ? "Live from the station" : "Waiting for Live…"}
        </p>
      </div>

      <section>
        <SectionLabel tone="teal">Outdoor</SectionLabel>
        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <Metric
            accent
            label="Outdoor"
            value={formatWeatherValue(outdoor)}
            hint="Station"
          />
          <Metric tone="sand" label="Feels like" value={formatWeatherValue(feels)} />
          <Metric tone="teal" label="Dewpoint" value={formatWeatherValue(dew)} />
          <Metric tone="umber" label="Humidity" value={formatWeatherValue(humidity)} />
        </div>
      </section>

      {sections
        .filter((s) => s.group !== "conditions")
        .map((section) => (
          <WeatherSection
            key={section.group}
            title={section.title}
            group={section.group}
            readings={section.readings}
          />
        ))}

      {sections.length === 0 ? (
        <Surface className="flex items-center gap-3 px-5 py-6 text-ink-soft">
          <CloudSun className="size-6 shrink-0" strokeWidth={1.6} />
          <div>
            <p className="font-medium text-ink">No weather sensors mapped yet</p>
            <p className="mt-1 text-sm">
              Connect to the Pi (House → Connect / Live) so the Ecowitt station entities can
              appear.
            </p>
          </div>
        </Surface>
      ) : null}
    </div>
  );
}

function WeatherSection({
  title,
  group,
  readings,
}: {
  title: string;
  group: WeatherGroup;
  readings: WeatherReading[];
}) {
  const tone =
    group === "pond"
      ? "teal"
      : group === "greenhouse"
        ? "terra"
        : group === "rain"
          ? "umber"
          : group === "sun"
            ? "sand"
            : undefined;

  return (
    <section>
      <SectionLabel tone={tone}>{title}</SectionLabel>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
        {readings.map((r) => (
          <Metric
            key={r.entityId || r.key}
            label={r.label}
            value={formatWeatherValue(r)}
            hint={r.unavailable ? "Unavailable" : undefined}
            tone={
              group === "pond" && r.key === "pondWater"
                ? "teal"
                : group === "pond"
                  ? "sand"
                  : tone === "terra" || tone === "sand" || tone === "umber" || tone === "teal"
                    ? tone
                    : undefined
            }
          />
        ))}
      </div>
    </section>
  );
}
