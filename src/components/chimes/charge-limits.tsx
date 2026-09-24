import { useEffect, useState } from "react";
import {
  DEFAULT_MIN_DISCHARGE_SOC,
  type ChargeLimitKey,
} from "@/lib/ha";
import { useHouse, useLive } from "@/lib/house-store";
import { cn } from "@/lib/utils";
import { SectionLabel, Surface } from "./ui";

type Tint = "teal" | "terra" | "sand" | "umber";
type BusyKey = "grid" | "solar" | "min" | "allow" | null;

/**
 * Huawei LUNA charge-from-grid + SOC cutoff controls (incl. minimum discharge SOC).
 * Writes only after Apply. Intelligent Go / Dispatch stay elsewhere (read-only).
 */
export function ChargeLimitsSection({
  title = "Charge limits",
  tone,
}: {
  title?: string;
  tone?: Tint;
}) {
  const live = useLive();
  const status = useHouse((s) => s.status);
  const map = useHouse((s) => s.map);
  const meta = useHouse((s) => s.chargeLimitMeta);
  const writeError = useHouse((s) => s.writeError);
  const writePending = useHouse((s) => s.writePending);
  const applyChargeLimit = useHouse((s) => s.applyChargeLimit);
  const applyGridCharge = useHouse((s) => s.applyGridCharge);

  const liveMode = status === "live";
  const gridSwitchMapped = Boolean(map.gridCharge);
  const gridCutoffMapped = Boolean(map.gridChargeCutoffSoc);
  const solarCutoffMapped = Boolean(map.solarChargeCutoffSoc);
  const minSocMapped = Boolean(map.minDischargeSoc);

  // Demo snapshot shows example values; live without entities stays read-only.
  const gridCutoffValue = live.gridChargeCutoffSoc ?? (liveMode ? null : 90);
  const solarCutoffValue = live.solarChargeCutoffSoc ?? (liveMode ? null : 100);
  const minSocValue =
    live.minDischargeSoc ?? (liveMode ? null : DEFAULT_MIN_DISCHARGE_SOC);

  const [gridDraft, setGridDraft] = useState(String(gridCutoffValue ?? ""));
  const [solarDraft, setSolarDraft] = useState(String(solarCutoffValue ?? ""));
  const [minDraft, setMinDraft] = useState(
    String(minSocValue ?? DEFAULT_MIN_DISCHARGE_SOC),
  );
  const [gridAllowDraft, setGridAllowDraft] = useState(live.gridCharge);
  const [busy, setBusy] = useState<BusyKey>(null);
  const [note, setNote] = useState<string | null>(null);

  const pendingAllow = writePending?.key === "gridCharge";
  const pendingGrid = writePending?.key === "gridChargeCutoffSoc";
  const pendingSolar = writePending?.key === "solarChargeCutoffSoc";
  const pendingMin = writePending?.key === "minDischargeSoc";
  const anyPending = Boolean(writePending);

  // Do not clobber drafts while Apply / HA confirm is in flight — that was the
  // Allowed → Off flip when a timed-out write left live briefly stale.
  useEffect(() => {
    if (busy === "grid" || pendingGrid) return;
    if (live.gridChargeCutoffSoc !== null) setGridDraft(String(live.gridChargeCutoffSoc));
  }, [live.gridChargeCutoffSoc, busy, pendingGrid]);

  useEffect(() => {
    if (busy === "solar" || pendingSolar) return;
    if (live.solarChargeCutoffSoc !== null) setSolarDraft(String(live.solarChargeCutoffSoc));
  }, [live.solarChargeCutoffSoc, busy, pendingSolar]);

  useEffect(() => {
    if (busy === "min" || pendingMin) return;
    if (live.minDischargeSoc !== null) setMinDraft(String(live.minDischargeSoc));
  }, [live.minDischargeSoc, busy, pendingMin]);

  useEffect(() => {
    if (busy === "allow" || pendingAllow) return;
    setGridAllowDraft(live.gridCharge);
  }, [live.gridCharge, busy, pendingAllow]);

  async function applySoc(key: ChargeLimitKey, raw: string) {
    const n = Number.parseFloat(raw);
    if (!Number.isFinite(n)) {
      setNote("Enter a whole-number percent first.");
      return;
    }
    const busyKey: BusyKey =
      key === "gridChargeCutoffSoc" ? "grid" : key === "solarChargeCutoffSoc" ? "solar" : "min";
    setBusy(busyKey);
    setNote(null);
    const ok = await applyChargeLimit(key, n);
    setBusy(null);
    if (ok) {
      setNote(
        key === "minDischargeSoc"
          ? "Minimum SOC sent to the battery on the Pi."
          : "Sent to the battery on the Pi.",
      );
    }
  }

  async function applyAllow() {
    setBusy("allow");
    setNote(null);
    const wanted = gridAllowDraft;
    const ok = await applyGridCharge(wanted);
    setBusy(null);
    if (ok) setNote(wanted ? "Grid charge allowed." : "Grid charge turned off.");
  }

  const statusLine = (() => {
    if (busy || anyPending) {
      return "Waiting for the Pi to confirm…";
    }
    return note;
  })();

  return (
    <section>
      <SectionLabel tone={tone}>{title}</SectionLabel>
      <Surface tone={tone} className="space-y-5 p-5">
        <p className="text-sm leading-relaxed text-ink-soft">
          Grid, solar, and minimum SOC are Huawei LUNA settings on the Pi. Change the value, then
          press Apply — nothing is sent while you type or drag.
        </p>

        <GridChargeAllowRow
          current={live.gridCharge}
          draft={gridAllowDraft}
          onDraft={setGridAllowDraft}
          onApply={() => {
            void applyAllow();
          }}
          busy={busy === "allow" || pendingAllow}
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
          busy={busy === "grid" || pendingGrid}
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
          busy={busy === "solar" || pendingSolar}
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

        <SocLimitRow
          title="Minimum SOC"
          hint="Discharge floor — how empty the house battery may go (default 5%)"
          valueLabel={minSocValue === null ? "—" : `${minSocValue}%`}
          draft={minDraft}
          onDraft={setMinDraft}
          meta={meta.minDischargeSoc}
          onApply={() => {
            void applySoc("minDischargeSoc", minDraft);
          }}
          busy={busy === "min" || pendingMin}
          writable={liveMode && minSocMapped && minSocValue !== null}
          entityId={map.minDischargeSoc}
          missingNote={
            liveMode && !minSocMapped
              ? "Minimum SOC (discharging cutoff) entity not on this Pi — read-only."
              : !liveMode
                ? "Demo only — connect to the Pi to change."
                : null
          }
        />

        {statusLine ? (
          <p className={cn("text-sm", anyPending || busy ? "text-ink-soft" : "text-teal")}>
            {statusLine}
          </p>
        ) : null}
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
          <div className="text-sm text-ink-soft">Allow the pack to take power from AC / grid</div>
        </div>
        <div className="text-sm tabular-nums text-ink-soft">
          Now: {current ? "Allowed" : "Off"}
          {busy ? " · confirming…" : ""}
        </div>
      </div>
      {missingNote ? <p className="text-sm text-ink-soft">{missingNote}</p> : null}
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
        <div className="text-sm tabular-nums text-ink-soft">
          Now: {valueLabel}
          {busy ? " · confirming…" : ""}
        </div>
      </div>
      {missingNote ? <p className="text-sm text-ink-soft">{missingNote}</p> : null}
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
      {writable && entityId ? (
        <p className="text-xs text-ink-soft/80">{entityId} · number.set_value</p>
      ) : null}
    </div>
  );
}
