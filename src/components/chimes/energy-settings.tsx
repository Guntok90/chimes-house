import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, Sun } from "lucide-react";
import {
  workingModeLabel,
  type PowerLimitKey,
} from "@/lib/ha";
import { useHouse, useLive } from "@/lib/house-store";
import { cn } from "@/lib/utils";
import { SectionLabel, Surface } from "./ui";

type Tint = "teal" | "terra" | "sand" | "umber";
type BusyKey =
  | "preset"
  | "mode"
  | "gridMax"
  | "discharge"
  | "stop"
  | "luna"
  | "rr"
  | "cars"
  | "lunaHelper"
  | "stopClear"
  | "rrPlug"
  | null;

/**
 * Dad-facing battery + cheap-window Settings — toggles, selects, Apply.
 * Lives next to ChargeLimits on Battery / Energy. Writes only when Live.
 */
export function EnergySettingsSection({
  title = "Settings",
  tone = "teal",
}: {
  title?: string;
  tone?: Tint;
}) {
  const live = useLive();
  const status = useHouse((s) => s.status);
  const map = useHouse((s) => s.map);
  const switches = useHouse((s) => s.switches);
  const toggle = useHouse((s) => s.toggle);
  const meta = useHouse((s) => s.powerLimitMeta);
  const modeOptions = useHouse((s) => s.workingModeOptions);
  const writeError = useHouse((s) => s.writeError);
  const writePending = useHouse((s) => s.writePending);
  const applyWorkingMode = useHouse((s) => s.applyWorkingMode);
  const applyPowerLimit = useHouse((s) => s.applyPowerLimit);
  const applySettingsBool = useHouse((s) => s.applySettingsBool);
  const stopForcibleCharge = useHouse((s) => s.stopForcibleCharge);
  const applySolarSelfUseNow = useHouse((s) => s.applySolarSelfUseNow);

  const liveMode = status === "live";
  const modeMapped = Boolean(map.workingMode);
  const gridMaxMapped = Boolean(map.gridChargeMaxPowerW);
  const dischargeMapped = Boolean(map.maxDischargePowerW);
  const forcibleMapped = Boolean(map.forcibleCharge);
  const stopMapped = Boolean(map.stopForcibleCharge);
  const lunaMapped = Boolean(map.automationLunaCheap);
  const rrMapped = Boolean(map.automationRrCheap);
  const carsMapped = Boolean(map.automationChargeCars);
  const lunaHelperMapped = Boolean(map.offPeakChargeLuna);
  const stopClearMapped = Boolean(map.offPeakStopLunaOnClear);
  const rrPlugEntity = map["range-rover-hybrid"];
  const rrPlugMapped = Boolean(rrPlugEntity);
  const rrPlugOn = Boolean(switches["range-rover-hybrid"]);

  const gridMaxValue = live.gridChargeMaxPowerW ?? (liveMode ? null : 0);
  const dischargeValue = live.maxDischargePowerW ?? (liveMode ? null : 5000);

  const [modeDraft, setModeDraft] = useState(
    live.workingMode !== "—" ? live.workingMode : (modeOptions[0] ?? "maximise_self_consumption"),
  );
  const [gridMaxDraft, setGridMaxDraft] = useState(String(gridMaxValue ?? ""));
  const [dischargeDraft, setDischargeDraft] = useState(String(dischargeValue ?? ""));
  const [busy, setBusy] = useState<BusyKey>(null);
  const [note, setNote] = useState<string | null>(null);

  const pendingMode = writePending?.key === "workingMode";
  const pendingGridMax = writePending?.key === "gridChargeMaxPowerW";
  const pendingDischarge = writePending?.key === "maxDischargePowerW";
  const anyPending = Boolean(writePending);

  useEffect(() => {
    if (busy === "mode" || pendingMode) return;
    if (live.workingMode && live.workingMode !== "—") setModeDraft(live.workingMode);
  }, [live.workingMode, busy, pendingMode]);

  useEffect(() => {
    if (busy === "gridMax" || pendingGridMax) return;
    if (live.gridChargeMaxPowerW !== null) setGridMaxDraft(String(live.gridChargeMaxPowerW));
  }, [live.gridChargeMaxPowerW, busy, pendingGridMax]);

  useEffect(() => {
    if (busy === "discharge" || pendingDischarge) return;
    if (live.maxDischargePowerW !== null) setDischargeDraft(String(live.maxDischargePowerW));
  }, [live.maxDischargePowerW, busy, pendingDischarge]);

  const forcibleActive =
    forcibleMapped &&
    live.forcibleCharge !== "—" &&
    !/stop/i.test(live.forcibleCharge);

  async function runPreset() {
    setBusy("preset");
    setNote(null);
    const ok = await applySolarSelfUseNow();
    setBusy(null);
    if (ok) {
      setNote(
        "Solar self-use sent: forcible stopped, grid charge off, grid max 0 W, discharge 5000 W, self-consumption mode.",
      );
    }
  }

  async function applyMode() {
    setBusy("mode");
    setNote(null);
    const ok = await applyWorkingMode(modeDraft);
    setBusy(null);
    if (ok) setNote(`Working mode set to ${workingModeLabel(modeDraft)}.`);
  }

  async function applyPower(key: PowerLimitKey, raw: string, busyKey: BusyKey) {
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n)) {
      setNote("Enter a whole-number watt value first.");
      return;
    }
    setBusy(busyKey);
    setNote(null);
    const ok = await applyPowerLimit(key, n);
    setBusy(null);
    if (ok) {
      setNote(
        key === "gridChargeMaxPowerW"
          ? `Grid charge max set to ${Math.round(n)} W.`
          : `Max discharge set to ${Math.round(n)} W.`,
      );
    }
  }

  async function stopForcible() {
    setBusy("stop");
    setNote(null);
    const ok = await stopForcibleCharge();
    setBusy(null);
    if (ok) setNote("Stop forcible charge sent to the Pi.");
  }

  async function setBool(
    key:
      | "automationLunaCheap"
      | "automationRrCheap"
      | "automationChargeCars"
      | "offPeakChargeLuna"
      | "offPeakStopLunaOnClear",
    on: boolean,
    busyKey: BusyKey,
    okNote: string,
  ) {
    setBusy(busyKey);
    setNote(null);
    const ok = await applySettingsBool(key, on);
    setBusy(null);
    if (ok) setNote(okNote);
  }

  const statusLine = busy || anyPending ? "Waiting for the Pi to confirm…" : note;
  const demoNote = !liveMode ? "Demo only — connect to the Pi to change." : null;

  return (
    <section>
      <SectionLabel tone={tone}>{title}</SectionLabel>
      <Surface tone={tone} className="space-y-6 p-5">
        <p className="text-sm leading-relaxed text-ink-soft">
          Battery and overnight cheap-window controls for Steve. Change a value, then Apply — nothing
          is sent while you tap options. Charge limits (SOC cutoffs) stay in the Battery section
          above.
        </p>

        {/* Solar self-use preset */}
        <div className="space-y-3 rounded-md border border-teal/30 bg-teal/5 p-4">
          <div className="flex flex-wrap items-start gap-3">
            <span className="grid size-11 shrink-0 place-items-center rounded-md bg-teal/15 text-teal">
              <Sun className="size-5" strokeWidth={1.7} />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-base font-medium">Solar self-use now</div>
              <p className="mt-1 text-sm leading-relaxed text-ink-soft">
                One tap: stop forcible charge, turn grid charge off, set grid max to 0 W, discharge
                max to 5000 W, and working mode to maximise self consumption.
              </p>
            </div>
          </div>
          <button
            type="button"
            disabled={!liveMode || busy === "preset" || anyPending}
            onClick={() => {
              void runPreset();
            }}
            className="min-h-11 w-full rounded-md bg-teal px-4 py-3 text-base font-medium text-paper disabled:opacity-50 sm:w-auto"
          >
            {busy === "preset" ? "Sending…" : "Solar self-use now"}
          </button>
          {demoNote ? <p className="text-sm text-ink-soft">{demoNote}</p> : null}
        </div>

        {/* Working mode */}
        <ControlBlock
          title="Working mode"
          hint="How the LUNA pack balances solar, battery, and grid"
          nowLabel={
            live.workingMode === "—" ? "—" : workingModeLabel(live.workingMode)
          }
          busy={busy === "mode" || pendingMode}
          missingNote={
            liveMode && !modeMapped
              ? "Working-mode select not found on this Pi — read-only."
              : demoNote
          }
          entityId={map.workingMode}
          serviceHint="select.select_option"
        >
          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex flex-wrap rounded-md bg-paper-deep p-1">
              {(modeOptions.length
                ? modeOptions
                : ["maximise_self_consumption", "time_of_use_luna2000"]
              ).map((opt) => (
                <button
                  key={opt}
                  type="button"
                  disabled={!liveMode || !modeMapped || busy === "mode" || pendingMode}
                  onClick={() => setModeDraft(opt)}
                  className={cn(
                    "min-h-11 rounded-sm px-3.5 text-sm font-medium transition-colors duration-150",
                    modeDraft === opt
                      ? "bg-paper-raised text-ink shadow-sm"
                      : "text-ink-soft",
                  )}
                >
                  {workingModeLabel(opt)}
                </button>
              ))}
            </div>
            <button
              type="button"
              disabled={
                !liveMode ||
                !modeMapped ||
                busy === "mode" ||
                pendingMode ||
                modeDraft === live.workingMode
              }
              onClick={() => {
                void applyMode();
              }}
              className="min-h-11 rounded-md bg-teal px-4 py-2.5 text-sm text-paper disabled:opacity-50"
            >
              {busy === "mode" || pendingMode ? "Sending…" : "Apply mode"}
            </button>
          </div>
        </ControlBlock>

        {/* Power limits */}
        <PowerRow
          title="Grid charge max power"
          hint="How many watts the pack may take from AC / grid"
          valueLabel={gridMaxValue === null ? "—" : `${gridMaxValue} W`}
          draft={gridMaxDraft}
          onDraft={setGridMaxDraft}
          meta={meta.gridChargeMaxPowerW}
          onApply={() => {
            void applyPower("gridChargeMaxPowerW", gridMaxDraft, "gridMax");
          }}
          busy={busy === "gridMax" || pendingGridMax}
          writable={liveMode && gridMaxMapped && gridMaxValue !== null}
          entityId={map.gridChargeMaxPowerW}
          missingNote={
            liveMode && !gridMaxMapped
              ? "Grid charge max power entity not on this Pi — read-only."
              : demoNote
          }
        />

        <PowerRow
          title="Max discharge power"
          hint="How hard the pack may discharge to the house"
          valueLabel={dischargeValue === null ? "—" : `${dischargeValue} W`}
          draft={dischargeDraft}
          onDraft={setDischargeDraft}
          meta={meta.maxDischargePowerW}
          onApply={() => {
            void applyPower("maxDischargePowerW", dischargeDraft, "discharge");
          }}
          busy={busy === "discharge" || pendingDischarge}
          writable={liveMode && dischargeMapped && dischargeValue !== null}
          entityId={map.maxDischargePowerW}
          missingNote={
            liveMode && !dischargeMapped
              ? "Max discharge power entity not on this Pi — read-only."
              : demoNote
          }
        />

        {/* Stop forcible */}
        <div
          className={cn(
            "space-y-3 border-b border-line pb-5",
            forcibleActive && "rounded-md border border-terra/40 bg-terra/5 p-4",
          )}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <div className="font-medium">Forcible charge</div>
              <div className="text-sm text-ink-soft">
                Huawei forced AC charge status — stop if it is stuck on
              </div>
            </div>
            <div className="text-sm tabular-nums text-ink-soft">
              Now: {forcibleMapped || !liveMode ? live.forcibleCharge : "—"}
              {busy === "stop" ? " · confirming…" : ""}
            </div>
          </div>
          {liveMode && !forcibleMapped && !stopMapped ? (
            <p className="text-sm text-ink-soft">
              Forcible-charge sensor not found — Stop still tries the Huawei service when Live.
            </p>
          ) : demoNote && !liveMode ? (
            <p className="text-sm text-ink-soft">{demoNote}</p>
          ) : null}
          <button
            type="button"
            disabled={!liveMode || busy === "stop" || anyPending}
            onClick={() => {
              void stopForcible();
            }}
            className={cn(
              "min-h-11 rounded-md px-4 py-2.5 text-sm font-medium text-paper disabled:opacity-50",
              forcibleActive ? "bg-terra" : "bg-umber",
            )}
          >
            {busy === "stop" ? "Sending…" : "Stop forcible charge"}
          </button>
          {liveMode ? (
            <p className="text-xs text-ink-soft/80">
              {map.stopForcibleCharge
                ? `${map.stopForcibleCharge} · button.press`
                : "huawei_solar.stop_forcible_charge · device fallback"}
            </p>
          ) : null}
        </div>

        {/* Automations */}
        <div className="space-y-4">
          <div>
            <div className="font-medium">Cheap-window automations</div>
            <p className="text-sm text-ink-soft">
              Enable or disable the overnight schedules on the Pi
            </p>
          </div>

          <ToggleRow
            title="LUNA grid charge on Octopus cheap"
            hint="Soft AC fill overnight when cheap energy is available"
            on={live.automationLunaCheap}
            busy={busy === "luna" || writePending?.key === "automationLunaCheap"}
            writable={liveMode && lunaMapped}
            onToggle={(on) => {
              void setBool(
                "automationLunaCheap",
                on,
                "luna",
                on ? "LUNA cheap automation enabled." : "LUNA cheap automation disabled.",
              );
            }}
            entityId={map.automationLunaCheap}
            missingNote={
              liveMode && !lunaMapped
                ? "automation.luna_grid_charge_on_octopus_cheap not found — read-only."
                : demoNote
            }
          />

          <ToggleRow
            title="Range Rover overnight cheap charge"
            hint="Force-override path for the driveway Hybrid plug at cheap rate"
            on={live.automationRrCheap}
            busy={busy === "rr" || writePending?.key === "automationRrCheap"}
            writable={liveMode && rrMapped}
            onToggle={(on) => {
              void setBool(
                "automationRrCheap",
                on,
                "rr",
                on
                  ? "Range Rover overnight automation enabled."
                  : "Range Rover overnight automation disabled.",
              );
            }}
            entityId={map.automationRrCheap}
            missingNote={
              liveMode && !rrMapped
                ? "automation.range_rover_hybrid_cheap_charge_force_override not found — read-only."
                : demoNote
            }
          />

          <ToggleRow
            title="Charge Cars + Battery at Off Peak"
            hint="Shows status and lets you enable/disable the off-peak charge automation"
            on={live.automationChargeCars}
            busy={busy === "cars" || writePending?.key === "automationChargeCars"}
            writable={liveMode && carsMapped}
            onToggle={(on) => {
              void setBool(
                "automationChargeCars",
                on,
                "cars",
                on
                  ? "Charge Cars + Battery at Off Peak enabled."
                  : "Charge Cars + Battery at Off Peak disabled.",
              );
            }}
            entityId={map.automationChargeCars}
            missingNote={
              liveMode && !carsMapped
                ? "automation.charge_cars_at_off_peak not found — read-only."
                : demoNote
            }
            warning={
              <div className="flex gap-2 rounded-md border border-umber/25 bg-umber/5 p-3 text-sm leading-relaxed text-ink-soft">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-umber" strokeWidth={1.7} />
                <span>
                  The LUNA forcible path inside this automation only runs when{" "}
                  <span className="font-medium text-ink">off-peak charge LUNA</span> is On below.
                  Leave that helper Off unless you want the old car+battery forcible behaviour.
                </span>
              </div>
            }
          />

          <ToggleRow
            title="Off-peak charge LUNA (forcible helper)"
            hint="Default Off — turning On re-enables the old car+battery forcible path"
            on={live.offPeakChargeLuna}
            busy={busy === "lunaHelper" || writePending?.key === "offPeakChargeLuna"}
            writable={liveMode && lunaHelperMapped}
            onToggle={(on) => {
              void setBool(
                "offPeakChargeLuna",
                on,
                "lunaHelper",
                on
                  ? "Off-peak LUNA forcible helper turned On — old path re-enabled."
                  : "Off-peak LUNA forcible helper turned Off (default).",
              );
            }}
            entityId={map.offPeakChargeLuna}
            missingNote={
              liveMode && !lunaHelperMapped
                ? "input_boolean.off_peak_charge_luna not found — read-only."
                : demoNote
            }
            warning={
              live.offPeakChargeLuna ? (
                <p className="text-sm text-terra">
                  Warning: On means overnight off-peak may forcibly charge the house battery as well
                  as the cars. Leave Off for the softer LUNA cheap automation above.
                </p>
              ) : null
            }
          />

          {stopClearMapped || !liveMode ? (
            <ToggleRow
              title="Stop LUNA on cheap-window clear"
              hint="When present — stop forcible charge when the cheap window ends"
              on={live.offPeakStopLunaOnClear}
              busy={busy === "stopClear" || writePending?.key === "offPeakStopLunaOnClear"}
              writable={liveMode && stopClearMapped}
              onToggle={(on) => {
                void setBool(
                  "offPeakStopLunaOnClear",
                  on,
                  "stopClear",
                  on
                    ? "Stop LUNA on clear helper turned On."
                    : "Stop LUNA on clear helper turned Off.",
                );
              }}
              entityId={map.offPeakStopLunaOnClear}
              missingNote={demoNote}
            />
          ) : null}
        </div>

        {/* RR plug */}
        <div className="space-y-3 border-t border-line pt-5">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <div className="font-medium">Range Rover cheap plug</div>
              <div className="text-sm text-ink-soft">
                Driveway Hybrid outdoor socket — same switch as Garden Front
              </div>
            </div>
            <div className="text-sm tabular-nums text-ink-soft">
              Now: {rrPlugMapped || !liveMode ? (rrPlugOn ? "On" : "Off") : "—"}
            </div>
          </div>
          {liveMode && !rrPlugMapped ? (
            <p className="text-sm text-ink-soft">
              Range Rover plug switch not found on this Pi — read-only.
            </p>
          ) : demoNote && !liveMode ? (
            <p className="text-sm text-ink-soft">{demoNote}</p>
          ) : null}
          <div className="inline-flex rounded-md bg-paper-deep p-1">
            {(
              [
                { id: true, label: "On" },
                { id: false, label: "Off" },
              ] as const
            ).map((opt) => (
              <button
                key={String(opt.id)}
                type="button"
                disabled={!liveMode || !rrPlugMapped || busy === "rrPlug"}
                onClick={() => {
                  if (rrPlugOn === opt.id) return;
                  setBusy("rrPlug");
                  setNote(null);
                  toggle("range-rover-hybrid");
                  setBusy(null);
                  setNote(opt.id ? "Range Rover plug turned On." : "Range Rover plug turned Off.");
                }}
                className={cn(
                  "min-h-11 rounded-sm px-4 text-sm font-medium transition-colors duration-150",
                  rrPlugOn === opt.id
                    ? "bg-paper-raised text-ink shadow-sm"
                    : "text-ink-soft",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {liveMode && rrPlugEntity ? (
            <p className="text-xs text-ink-soft/80">
              {rrPlugEntity} · switch.turn_on / turn_off
            </p>
          ) : null}
        </div>

        {statusLine ? (
          <p className={cn("text-sm", busy || anyPending ? "text-ink-soft" : "text-teal")}>
            {statusLine}
          </p>
        ) : null}
        {writeError ? <p className="text-sm text-terra">{writeError}</p> : null}
      </Surface>
    </section>
  );
}

function ControlBlock({
  title,
  hint,
  nowLabel,
  busy,
  missingNote,
  entityId,
  serviceHint,
  children,
}: {
  title: string;
  hint: string;
  nowLabel: string;
  busy: boolean;
  missingNote: string | null;
  entityId?: string;
  serviceHint: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3 border-b border-line pb-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="font-medium">{title}</div>
          <div className="text-sm text-ink-soft">{hint}</div>
        </div>
        <div className="text-sm tabular-nums text-ink-soft">
          Now: {nowLabel}
          {busy ? " · confirming…" : ""}
        </div>
      </div>
      {missingNote ? <p className="text-sm text-ink-soft">{missingNote}</p> : null}
      {children}
      {entityId ? (
        <p className="text-xs text-ink-soft/80">
          {entityId} · {serviceHint}
        </p>
      ) : null}
    </div>
  );
}

function PowerRow({
  title,
  hint,
  valueLabel,
  draft,
  onDraft,
  meta,
  onApply,
  busy,
  writable,
  entityId,
  missingNote,
}: {
  title: string;
  hint: string;
  valueLabel: string;
  draft: string;
  onDraft: (v: string) => void;
  meta: { min: number; max: number; step: number };
  onApply: () => void;
  busy: boolean;
  writable: boolean;
  entityId?: string;
  missingNote: string | null;
}) {
  const draftNum = Number.parseFloat(draft);
  const dirty =
    Number.isFinite(draftNum) &&
    valueLabel !== "—" &&
    draftNum !== Number.parseFloat(valueLabel);
  return (
    <div className="space-y-3 border-b border-line pb-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="font-medium">{title}</div>
          <div className="text-sm text-ink-soft">{hint}</div>
        </div>
        <div className="text-sm tabular-nums text-ink-soft">
          Now: {valueLabel}
          {busy ? " · confirming…" : ""}
        </div>
      </div>
      {missingNote ? <p className="text-sm text-ink-soft">{missingNote}</p> : null}
      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-sm">
          <span className="text-ink-soft">
            New W ({meta.min}–{meta.max})
          </span>
          <input
            type="number"
            inputMode="numeric"
            min={meta.min}
            max={meta.max}
            step={meta.step}
            value={draft}
            disabled={!writable || busy}
            onChange={(e) => onDraft(e.target.value)}
            className="mt-1 w-32 rounded-md border border-line bg-paper px-3 py-2.5 text-sm tabular-nums disabled:opacity-60"
          />
        </label>
        <input
          type="range"
          min={meta.min}
          max={meta.max}
          step={meta.step}
          value={Number.isFinite(draftNum) ? draftNum : meta.min}
          disabled={!writable || busy}
          onChange={(e) => onDraft(e.target.value)}
          className="min-w-[10rem] flex-1 accent-teal disabled:opacity-60"
          aria-label={`${title} slider`}
        />
        <button
          type="button"
          disabled={!writable || busy || !dirty}
          onClick={onApply}
          className="min-h-11 rounded-md bg-teal px-4 py-2.5 text-sm text-paper disabled:opacity-50"
        >
          {busy ? "Sending…" : "Apply"}
        </button>
      </div>
      {writable && entityId ? (
        <p className="text-xs text-ink-soft/80">{entityId} · number.set_value</p>
      ) : null}
    </div>
  );
}

function ToggleRow({
  title,
  hint,
  on,
  busy,
  writable,
  onToggle,
  entityId,
  missingNote,
  warning,
}: {
  title: string;
  hint: string;
  on: boolean;
  busy: boolean;
  writable: boolean;
  onToggle: (on: boolean) => void;
  entityId?: string;
  missingNote: string | null;
  warning?: ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-md border border-line/80 bg-paper/40 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="font-medium">{title}</div>
          <div className="text-sm text-ink-soft">{hint}</div>
        </div>
        <div className="text-sm tabular-nums text-ink-soft">
          {on ? "Enabled" : "Disabled"}
          {busy ? " · confirming…" : ""}
        </div>
      </div>
      {missingNote ? <p className="text-sm text-ink-soft">{missingNote}</p> : null}
      {warning}
      <div className="inline-flex rounded-md bg-paper-deep p-1">
        {(
          [
            { id: true, label: "Enabled" },
            { id: false, label: "Disabled" },
          ] as const
        ).map((opt) => (
          <button
            key={String(opt.id)}
            type="button"
            disabled={!writable || busy}
            onClick={() => onToggle(opt.id)}
            className={cn(
              "min-h-11 rounded-sm px-4 text-sm font-medium transition-colors duration-150",
              on === opt.id ? "bg-paper-raised text-ink shadow-sm" : "text-ink-soft",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
      {writable && entityId ? (
        <p className="text-xs text-ink-soft/80">
          {entityId} · turn_on / turn_off
        </p>
      ) : null}
    </div>
  );
}
