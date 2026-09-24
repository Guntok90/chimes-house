import { useEffect, useState } from "react";
import { HOURS, WEEK } from "@/lib/house";
import { useHouse, useLive } from "@/lib/house-store";
import type { ChargeLimitKey } from "@/lib/ha";
import { cn } from "@/lib/utils";
import { LineArea } from "./charts";
import { NoHistoryYet } from "./no-history";
import { Metric, PageTitle, Row, SectionLabel, Surface } from "./ui";

export function BatteryView() {
  const live = useLive();
  const status = useHouse((s) => s.status);
  const historyStatus = useHouse((s) => s.historyStatus);
  const historyHours = useHouse((s) => s.historyHours);
  const historyWeek = useHouse((s) => s.historyWeek);
  const liveMode = status === "live";
  const week = liveMode ? historyWeek : WEEK;
  const hoursSrc = liveMode ? historyHours : HOURS;
  const chartsReady = !liveMode || (historyStatus === "ready" && hoursSrc.length > 0);
  const today = week[week.length - 1];
  const discharging = live.batteryW < 0;
  const lastDay = hoursSrc.slice(-24);
  const hours = lastDay.map((h) => ({
    hour: h.hour.includes(" ") ? h.hour.split(" ").pop()! : h.hour,
    SOC: h.soc,
    Power: h.battW,
  }));

  return (
    <div className="space-y-8">
      <PageTitle>Battery</PageTitle>

      <div className="grid gap-6 lg:grid-cols-[auto_1fr] lg:items-center">
        <Surface className="flex items-center justify-center px-8 py-8">
          <SocRing soc={live.soc} watts={live.batteryW} />
        </Surface>
        <div className="grid grid-cols-2 gap-2.5">
          <Metric
            accent
            label="State"
            value={discharging ? "Discharging" : live.batteryW > 30 ? "Charging" : "Idle"}
            hint={`${Math.abs(live.batteryW)} W`}
          />
          <Metric label="Capacity" value={`${live.soc}%`} hint="Pack 1" />
          <Metric
            label="Charged today"
            value={today ? `${today.battCharge} kWh` : "—"}
            hint="Into the pack"
          />
          <Metric
            label="Used today"
            value={today ? `${today.battDischarge} kWh` : "—"}
            hint="Out to the house"
          />
        </div>
      </div>

      <ChargeLimitsSection />

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionLabel>State of charge · 24 h</SectionLabel>
          {chartsReady ? (
            <Surface className="h-56 p-3">
              <LineArea
                data={hours}
                dataKey="SOC"
                name="SOC"
                color="var(--color-teal)"
                unit="%"
              />
            </Surface>
          ) : (
            <NoHistoryYet label="SOC chart" />
          )}
        </section>
        <section>
          <SectionLabel>Power · 24 h</SectionLabel>
          {chartsReady ? (
            <Surface className="h-56 p-3">
              <LineArea
                data={hours}
                dataKey="Power"
                name="Battery"
                color="var(--color-terra)"
                unit=" W"
              />
            </Surface>
          ) : (
            <NoHistoryYet label="power chart" />
          )}
        </section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section>
          <SectionLabel>Pack</SectionLabel>
          <Surface className="px-5">
            <Row label="Pack" value="Battery 1" />
            <Row label="Mode" value={live.inverterStatus} />
            <Row label="Power" value={`${live.batteryW} W`} />
            <Row label="Through inverter" value={`${live.inverterW} W`} />
            <Row label="Charge from grid" value={live.gridCharge ? "Allowed" : "Off"} />
            <Row
              label="Grid charge cutoff"
              value={
                live.gridChargeCutoffSoc === null ? "—" : `${live.gridChargeCutoffSoc}%`
              }
            />
            <Row
              label="Solar charge cutoff"
              value={
                live.solarChargeCutoffSoc === null ? "—" : `${live.solarChargeCutoffSoc}%`
              }
            />
          </Surface>
        </section>
        <section>
          <SectionLabel>This week</SectionLabel>
          <Surface className="px-5">
            <Row
              label="Charged"
              value={
                week.length
                  ? `${week.reduce((s, d) => s + d.battCharge, 0).toFixed(1)} kWh`
                  : "—"
              }
            />
            <Row
              label="Discharged"
              value={
                week.length
                  ? `${week.reduce((s, d) => s + d.battDischarge, 0).toFixed(1)} kWh`
                  : "—"
              }
            />
            <Row
              label="Highest SOC"
              value={
                lastDay.length ? `${Math.max(...lastDay.map((h) => h.soc))}%` : "—"
              }
            />
            <Row
              label="Lowest SOC"
              value={
                lastDay.length ? `${Math.min(...lastDay.map((h) => h.soc))}%` : "—"
              }
            />
            <Row label="Now" value={`${live.soc}%`} />
          </Surface>
        </section>
      </div>
    </div>
  );
}

function ChargeLimitsSection() {
  const live = useLive();
  const status = useHouse((s) => s.status);
  const map = useHouse((s) => s.map);
  const meta = useHouse((s) => s.chargeLimitMeta);
  const writeError = useHouse((s) => s.writeError);
  const applyChargeLimit = useHouse((s) => s.applyChargeLimit);
  const applyGridCharge = useHouse((s) => s.applyGridCharge);

  const liveMode = status === "live";
  const gridSwitchMapped = Boolean(map.gridCharge);
  const gridCutoffMapped = Boolean(map.gridChargeCutoffSoc);
  const solarCutoffMapped = Boolean(map.solarChargeCutoffSoc);

  // Demo snapshot shows example values; live without entities stays read-only.
  const gridCutoffValue =
    live.gridChargeCutoffSoc ?? (liveMode ? null : 90);
  const solarCutoffValue =
    live.solarChargeCutoffSoc ?? (liveMode ? null : 100);

  const [gridDraft, setGridDraft] = useState(String(gridCutoffValue ?? ""));
  const [solarDraft, setSolarDraft] = useState(String(solarCutoffValue ?? ""));
  const [gridAllowDraft, setGridAllowDraft] = useState(live.gridCharge);
  const [busy, setBusy] = useState<"grid" | "solar" | "allow" | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (live.gridChargeCutoffSoc !== null) setGridDraft(String(live.gridChargeCutoffSoc));
  }, [live.gridChargeCutoffSoc]);

  useEffect(() => {
    if (live.solarChargeCutoffSoc !== null) setSolarDraft(String(live.solarChargeCutoffSoc));
  }, [live.solarChargeCutoffSoc]);

  useEffect(() => {
    setGridAllowDraft(live.gridCharge);
  }, [live.gridCharge]);

  async function applySoc(key: ChargeLimitKey, raw: string) {
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n)) {
      setNote("Enter a whole-number percent first.");
      return;
    }
    setBusy(key === "gridChargeCutoffSoc" ? "grid" : "solar");
    setNote(null);
    const ok = await applyChargeLimit(key, n);
    setBusy(null);
    if (ok) setNote("Sent to the battery on the Pi.");
  }

  async function applyAllow() {
    setBusy("allow");
    setNote(null);
    const ok = await applyGridCharge(gridAllowDraft);
    setBusy(null);
    if (ok) setNote(gridAllowDraft ? "Grid charge allowed." : "Grid charge turned off.");
  }

  return (
    <section>
      <SectionLabel>Charge limits</SectionLabel>
      <Surface className="space-y-5 p-5">
        <p className="text-sm leading-relaxed text-ink-soft">
          Grid and solar cutoffs are Huawei LUNA settings on the Pi. Change the value, then press
          Apply — nothing is sent while you type or drag.
        </p>

        <GridChargeAllowRow
          current={live.gridCharge}
          draft={gridAllowDraft}
          onDraft={setGridAllowDraft}
          onApply={() => {
            void applyAllow();
          }}
          busy={busy === "allow"}
          writable={liveMode && gridSwitchMapped}
          entityId={map.gridCharge}
          missingNote={
            liveMode && !gridSwitchMapped
              ? "Charge-from-grid switch not found on this Pi — showing read-only."
              : !liveMode
                ? "Demo only — connect to the Pi to change."
                : null
          }
        />

        <SocLimitRow
          title="Grid charge cutoff"
          hint="How full the pack may get when charging from the grid"
          valueLabel={gridCutoffValue === null ? "—" : `${gridCutoffValue}%`}
          draft={gridDraft}
          onDraft={setGridDraft}
          meta={meta.gridChargeCutoffSoc}
          onApply={() => {
            void applySoc("gridChargeCutoffSoc", gridDraft);
          }}
          busy={busy === "grid"}
          writable={liveMode && gridCutoffMapped && gridCutoffValue !== null}
          entityId={map.gridChargeCutoffSoc}
          missingNote={
            liveMode && !gridCutoffMapped
              ? "Grid charge cutoff entity not on this Pi — read-only."
              : !liveMode
                ? "Demo only — connect to the Pi to change."
                : null
          }
        />

        <SocLimitRow
          title="Solar charge cutoff"
          hint="End-of-charge SOC — how full the pack may get from solar"
          valueLabel={solarCutoffValue === null ? "—" : `${solarCutoffValue}%`}
          draft={solarDraft}
          onDraft={setSolarDraft}
          meta={meta.solarChargeCutoffSoc}
          onApply={() => {
            void applySoc("solarChargeCutoffSoc", solarDraft);
          }}
          busy={busy === "solar"}
          writable={liveMode && solarCutoffMapped && solarCutoffValue !== null}
          entityId={map.solarChargeCutoffSoc}
          missingNote={
            liveMode && !solarCutoffMapped
              ? "Solar (end-of-charge) entity not on this Pi — read-only."
              : !liveMode
                ? "Demo only — connect to the Pi to change."
                : null
          }
        />

        {note ? <p className="text-sm text-teal">{note}</p> : null}
        {writeError ? <p className="text-sm text-terra">{writeError}</p> : null}
      </Surface>
    </section>
  );
}

function GridChargeAllowRow({
  current,
  draft,
  onDraft,
  onApply,
  busy,
  writable,
  entityId,
  missingNote,
}: {
  current: boolean;
  draft: boolean;
  onDraft: (v: boolean) => void;
  onApply: () => void;
  busy: boolean;
  writable: boolean;
  entityId?: string;
  missingNote: string | null;
}) {
  const dirty = draft !== current;
  return (
    <div className="space-y-3 border-b border-line pb-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="font-medium">Charge from grid</div>
          <div className="text-sm text-ink-soft">Allow the pack to take power from the grid</div>
        </div>
        <div className="text-sm tabular-nums text-ink-soft">
          Now: {current ? "Allowed" : "Off"}
        </div>
      </div>
      {missingNote ? (
        <p className="text-sm text-ink-soft">{missingNote}</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-md bg-paper-deep p-1">
            {(
              [
                { id: true, label: "Allowed" },
                { id: false, label: "Off" },
              ] as const
            ).map((opt) => (
              <button
                key={String(opt.id)}
                type="button"
                disabled={!writable || busy}
                onClick={() => onDraft(opt.id)}
                className={cn(
                  "min-h-9 rounded-sm px-3 text-sm font-medium transition-colors duration-150",
                  draft === opt.id ? "bg-paper-raised text-ink shadow-sm" : "text-ink-soft",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            disabled={!writable || busy || !dirty}
            onClick={onApply}
            className="rounded-md bg-teal px-3.5 py-2 text-sm text-paper disabled:opacity-50"
          >
            {busy ? "Sending…" : "Apply grid charge"}
          </button>
        </div>
      )}
      {writable && entityId ? (
        <p className="text-xs text-ink-soft/80">{entityId} · switch.turn_on / turn_off</p>
      ) : null}
    </div>
  );
}

function SocLimitRow({
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
    Number.isFinite(draftNum) && valueLabel !== "—" && draftNum !== Number.parseFloat(valueLabel);
  return (
    <div className="space-y-3 border-b border-line pb-5 last:border-0 last:pb-0">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <div className="font-medium">{title}</div>
          <div className="text-sm text-ink-soft">{hint}</div>
        </div>
        <div className="text-sm tabular-nums text-ink-soft">Now: {valueLabel}</div>
      </div>
      {missingNote ? (
        <p className="text-sm text-ink-soft">{missingNote}</p>
      ) : (
        <div className="flex flex-wrap items-end gap-3">
          <label className="block text-sm">
            <span className="text-ink-soft">
              New % ({meta.min}–{meta.max})
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
              className="mt-1 w-28 rounded-md border border-line bg-paper px-3 py-2 text-sm tabular-nums disabled:opacity-60"
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
            className="rounded-md bg-teal px-3.5 py-2 text-sm text-paper disabled:opacity-50"
          >
            {busy ? "Sending…" : "Apply"}
          </button>
        </div>
      )}
      {writable && entityId ? (
        <p className="text-xs text-ink-soft/80">{entityId} · number.set_value</p>
      ) : null}
    </div>
  );
}

function SocRing({ soc, watts }: { soc: number; watts: number }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const dash = (soc / 100) * c;
  return (
    <div className="relative size-52">
      <svg viewBox="0 0 140 140" className="size-full -rotate-90">
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          className="stroke-paper-deep"
          strokeWidth="10"
        />
        <circle
          cx="70"
          cy="70"
          r={r}
          fill="none"
          className="stroke-teal"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
        />
      </svg>
      <div className="absolute inset-0 grid place-items-center text-center">
        <div>
          <div className="text-4xl font-medium tracking-tight tabular-nums">{soc}%</div>
          <div className="mt-1 text-sm text-ink-soft">
            {watts < -30 ? "Discharging" : watts > 30 ? "Charging" : "Idle"}
          </div>
        </div>
      </div>
    </div>
  );
}
