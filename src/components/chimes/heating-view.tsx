import { useMemo } from "react";
import { Flame } from "lucide-react";
import {
  DEMO_HEATING_HISTORY,
  formatNestTemp,
  heatingForScreen,
  hvacModeLabel,
  nestSetLines,
  stepHeatingTarget,
  type HeatingControl,
} from "@/lib/heating";
import { usesDemoCharts } from "@/lib/house";
import { useHouse } from "@/lib/house-store";
import { cn } from "@/lib/utils";
import { HeatingHistoryChart } from "./charts";
import { NoHistoryYet } from "./no-history";
import { SectionLabel, Surface } from "./ui";

function chipClass(selected: boolean) {
  return cn(
    "min-h-11 rounded-sm px-3 text-sm font-medium transition-colors",
    selected ? "bg-paper-raised text-ink shadow-sm" : "bg-paper-deep text-ink-soft hover:text-ink",
  );
}

export function CentralHeatingSection() {
  const status = useHouse((s) => s.status);
  const stored = useHouse((s) => s.heating);
  const history = useHouse((s) => s.heatingHistory);
  const historyStatus = useHouse((s) => s.heatingHistoryStatus);
  const writeError = useHouse((s) => s.heatingWriteError);
  const setTemperature = useHouse((s) => s.setHeatingTemperature);
  const setMode = useHouse((s) => s.setHeatingMode);
  const setEco = useHouse((s) => s.setHeatingEco);
  const setSchedule = useHouse((s) => s.setHeatingSchedule);

  const heating = heatingForScreen(status, stored);
  const demo = usesDemoCharts(status);
  const points = demo ? DEMO_HEATING_HISTORY : history;
  const historyReady = demo || (historyStatus === "ready" && points.length > 0);

  return (
    <section>
      <SectionLabel>Central Heating</SectionLabel>
      <Surface className="p-4 sm:p-5">
        <HeatingBody
          heating={heating}
          connecting={status === "connecting" && !heating.available}
          writeError={demo ? undefined : writeError}
          onTemperature={setTemperature}
          onMode={setMode}
          onEco={setEco}
          onSchedule={setSchedule}
        />
        {heating.available ? (
          <div className="mt-5">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-ink-soft">
              History
            </p>
            {historyReady ? (
              <div className="h-52">
                <HeatingHistoryChart data={points} />
              </div>
            ) : (
              <NoHistoryYet
                label={
                  historyStatus === "loading" ? "temperature history (loading)" : "temperature history"
                }
              />
            )}
            <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-soft">
              <ChartKey color="#2a4e56" label="Now" />
              <ChartKey color="#ae593c" label="Heat set to" dashed />
            </div>
          </div>
        ) : null}
      </Surface>
    </section>
  );
}

function HeatingBody({
  heating,
  connecting,
  writeError,
  onTemperature,
  onMode,
  onEco,
  onSchedule,
}: {
  heating: HeatingControl;
  connecting: boolean;
  writeError?: string;
  onTemperature: (patch: {
    temperature?: number;
    targetLow?: number;
    targetHigh?: number;
  }) => Promise<boolean>;
  onMode: (mode: string) => Promise<boolean>;
  onEco: (on: boolean) => Promise<boolean>;
  onSchedule: (option: string) => Promise<boolean>;
}) {
  const lines = useMemo(() => nestSetLines(heating), [heating]);
  const heatingNow = heating.hvacAction === "heating";

  if (!heating.available) {
    return (
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-sm bg-paper-deep text-ink-soft">
          <Flame className="size-4" strokeWidth={1.7} />
        </span>
        <p className="text-sm text-ink-soft">
          {connecting
            ? "Connecting to Home Assistant…"
            : "Not mapped — Chimes uses the Nest device already on the Pi (registry identifier nest, or a climate entity whose name contains Nest). Nothing is shown until that device is there."}
        </p>
      </div>
    );
  }

  function nudge(delta: number, which: "single" | "low" | "high") {
    const current =
      which === "low" ? heating.targetLowC : which === "high" ? heating.targetHighC : heating.targetC;
    if (current == null || !heating.setpointWritable) return;
    const next = stepHeatingTarget(current, delta, heating.stepC, heating.minC, heating.maxC);
    if (which === "low") {
      void onTemperature({ targetLow: next, targetHigh: heating.targetHighC ?? undefined });
      return;
    }
    if (which === "high") {
      void onTemperature({ targetLow: heating.targetLowC ?? undefined, targetHigh: next });
      return;
    }
    void onTemperature({ temperature: next });
  }

  const range = heating.hvacMode === "heat_cool";

  return (
    <div>
      <div className="flex items-start gap-3">
        <span
          className={cn(
            "grid size-9 shrink-0 place-items-center rounded-sm",
            heatingNow ? "bg-terra/15 text-terra" : "bg-teal/10 text-teal",
          )}
        >
          <Flame className="size-4" strokeWidth={1.7} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="font-medium">{heating.label}</div>
          <p className="mt-1 text-sm text-ink-soft">
            {heatingNow ? "Heating" : heating.hvacAction === "idle" ? "Idle" : hvacModeLabel(heating.hvacMode)}
            {heating.eco ? " · Eco" : ""}
          </p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest text-ink-soft">Now</div>
          <div className="mt-1 text-4xl font-medium tabular-nums tracking-tight">
            {formatNestTemp(heating.currentC)}
          </div>
        </div>
        {range ? (
          <div className="flex flex-col gap-3">
            <SetStepper
              label="Heat set to"
              value={heating.targetLowC}
              disabled={!heating.setpointWritable}
              onLower={() => nudge(-1, "low")}
              onRaise={() => nudge(1, "low")}
            />
            <SetStepper
              label="Cool set to"
              value={heating.targetHighC}
              disabled={!heating.setpointWritable}
              onLower={() => nudge(-1, "high")}
              onRaise={() => nudge(1, "high")}
            />
          </div>
        ) : (
          <SetStepper
            label={lines[0]?.label === "OFF" || lines[0]?.label === "ECO" ? lines[0].label : "Heat set to"}
            value={heating.eco ? (heating.targetC ?? heating.targetLowC) : heating.targetC}
            disabled={!heating.setpointWritable}
            onLower={() => nudge(-1, "single")}
            onRaise={() => nudge(1, "single")}
          />
        )}
      </div>

      {heating.eco ? (
        <p className="mt-3 text-sm text-ink-soft">
          Eco is on. Nest does not let Home Assistant change the heat setpoint until Eco is off.
        </p>
      ) : heating.hvacMode === "off" ? (
        <p className="mt-3 text-sm text-ink-soft">Thermostat is off. Choose Heat to set a temperature.</p>
      ) : null}

      {heating.hvacModes.length > 0 ? (
        <div className="mt-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-ink-soft">Mode</div>
          <div className="flex flex-wrap gap-2">
            {heating.hvacModes.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => void onMode(mode)}
                className={chipClass(heating.hvacMode === mode)}
              >
                {hvacModeLabel(mode)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {heating.ecoSupported ? (
        <div className="mt-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-ink-soft">Eco</div>
          <button
            type="button"
            onClick={() => void onEco(!heating.eco)}
            className={cn(
              "min-h-11 rounded-sm px-3 text-sm font-medium transition-colors",
              heating.eco ? "bg-terra/15 text-terra" : "bg-teal/10 text-teal",
            )}
          >
            Eco {heating.eco ? "On" : "Off"}
          </button>
        </div>
      ) : null}

      <div className="mt-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-widest text-ink-soft">
          Schedule
        </div>
        {heating.scheduleOptions.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {heating.scheduleOptions.map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => void onSchedule(option)}
                className={chipClass(heating.scheduleState === option)}
              >
                {option}
              </button>
            ))}
          </div>
        ) : heating.scheduleState ? (
          <p className="text-sm text-ink-soft">{heating.scheduleState}</p>
        ) : heating.scheduleNote ? (
          <p className="max-w-prose text-sm text-ink-soft">{heating.scheduleNote}</p>
        ) : null}
      </div>

      {writeError ? <p className="mt-3 text-sm text-terra">{writeError}</p> : null}
    </div>
  );
}

function SetStepper({
  label,
  value,
  disabled,
  onLower,
  onRaise,
}: {
  label: string;
  value: number | null;
  disabled: boolean;
  onLower: () => void;
  onRaise: () => void;
}) {
  return (
    <div>
      <div className="text-xs font-semibold uppercase tracking-widest text-ink-soft">{label}</div>
      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          aria-label={`Lower ${label}`}
          disabled={disabled || value == null}
          onClick={onLower}
          className="grid size-11 place-items-center rounded-sm bg-paper-deep text-lg text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          −
        </button>
        <div className="min-w-16 text-4xl font-medium tabular-nums tracking-tight">
          {formatNestTemp(value)}
        </div>
        <button
          type="button"
          aria-label={`Raise ${label}`}
          disabled={disabled || value == null}
          onClick={onRaise}
          className="grid size-11 place-items-center rounded-sm bg-paper-deep text-lg text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
}

function ChartKey({ color, label, dashed = false }: { color: string; label: string; dashed?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className="h-px w-3.5"
        style={{ borderTop: `${dashed ? "1.5px dashed" : "2px solid"} ${color}` }}
      />
      {label}
    </span>
  );
}

/** Ambient Nest face — current temperature and Heat set to, no controls. */
export function NestAmbientFace({ heating }: { heating: HeatingControl }) {
  const lines = nestSetLines(heating);
  const heatingNow = heating.hvacAction === "heating";

  if (!heating.available) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-center text-sm text-sidebar-fg/70">
        Waiting for the Nest thermostat…
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 px-3 text-center">
      <div className="flex items-baseline justify-center gap-1 tabular-nums leading-none text-sidebar-fg">
        <span className="text-5xl font-medium tracking-tight sm:text-6xl">
          {formatNestTemp(heating.currentC, false)}
        </span>
        <span className="text-lg text-sidebar-fg/55">°</span>
      </div>
      <div className="mt-3 flex flex-col items-center gap-2">
        {lines.map((line) => (
          <div key={line.label}>
            <div className="text-[0.65rem] font-bold uppercase tracking-widest text-sidebar-fg/80">
              {line.label}
            </div>
            {line.c != null ? (
              <div
                className={cn(
                  "mt-1 flex items-baseline justify-center gap-1 tabular-nums leading-none",
                  heatingNow ? "text-sand" : "text-sidebar-fg",
                )}
              >
                <span className="text-3xl font-medium tracking-tight sm:text-4xl">
                  {formatNestTemp(line.c, false)}
                </span>
                <span className="text-sm text-sidebar-fg/55">°</span>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
