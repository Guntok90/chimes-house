import { useEffect, useState } from "react";
import { Car, PlugZap, Zap } from "lucide-react";
import { EV_READY_BY_ENTITY_PLACEHOLDER } from "@/lib/ha";
import { useHouse, useLive } from "@/lib/house-store";
import { cn } from "@/lib/utils";
import { Row, SectionLabel, Surface } from "./ui";

function formatTodayKwh(v: number | null): string {
  return v == null ? "—" : `${v} kWh`;
}

function formatPlug(mapped: boolean, plugged: boolean): string {
  if (!mapped) return "—";
  return plugged ? "Connected" : "Unplugged";
}

function rangeRoverStatus(
  live: {
    rangeRoverPlugged: boolean;
    rangeRoverW: number;
    rangeRoverSoc: number;
  },
  plugMapped: boolean,
): string {
  if (live.rangeRoverW > 30) return "Charging";
  if (!plugMapped) return live.rangeRoverSoc > 0 ? "Parked" : "—";
  if (live.rangeRoverPlugged) return "Plugged in";
  return "Unplugged";
}

/**
 * Live driveway charge UI shared by Energy → Charge and the Charge page.
 * Zappi mode + Octopus EV ready-by are writable via mapped select/time entities;
 * Cheap Energy Available / cheap window stay read-only.
 */
export function ChargeSection({
  tone,
  showLabel = true,
}: {
  tone?: "teal" | "terra" | "sand" | "umber";
  showLabel?: boolean;
}) {
  const live = useLive();
  const status = useHouse((s) => s.status);
  const map = useHouse((s) => s.map);
  const options = useHouse((s) => s.zappiModeOptions);
  const readyOptions = useHouse((s) => s.evReadyByOptions);
  const writeError = useHouse((s) => s.writeError);
  const writePending = useHouse((s) => s.writePending);
  const applyZappiMode = useHouse((s) => s.applyZappiMode);
  const applyEvReadyBy = useHouse((s) => s.applyEvReadyBy);

  const liveMode = status === "live";
  const modeMapped = Boolean(map.zappiMode);
  const readyMapped = Boolean(map.evReadyBy);
  const demo = status === "demo";
  const zappiPlugMapped = demo || Boolean(map.zappiPlugged);
  const roverPlugMapped = demo || Boolean(map.rangeRoverPlugged);
  const roverWMapped = demo || Boolean(map.rangeRoverW);
  const roverSocMapped = demo || Boolean(map.rangeRoverSoc);
  const [draftMode, setDraftMode] = useState(live.zappiMode);
  const [draftReady, setDraftReady] = useState(
    live.evReadyBy !== "—" ? live.evReadyBy : (readyOptions[0] ?? "07:00"),
  );
  const [busy, setBusy] = useState(false);
  const [readyBusy, setReadyBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [readyNote, setReadyNote] = useState<string | null>(null);
  const pendingMode = writePending?.key === "zappiMode";
  const pendingReady = writePending?.key === "evReadyBy";

  useEffect(() => {
    if (busy || pendingMode) return;
    if (live.zappiMode && live.zappiMode !== "—") setDraftMode(live.zappiMode);
  }, [live.zappiMode, busy, pendingMode]);

  useEffect(() => {
    if (readyBusy || pendingReady) return;
    if (live.evReadyBy && live.evReadyBy !== "—") setDraftReady(live.evReadyBy);
  }, [live.evReadyBy, readyBusy, pendingReady]);

  async function applyMode() {
    setBusy(true);
    setNote(null);
    const ok = await applyZappiMode(draftMode);
    setBusy(false);
    if (ok) setNote(`Zappi mode set to ${draftMode}.`);
  }

  async function applyReady() {
    setReadyBusy(true);
    setReadyNote(null);
    const ok = await applyEvReadyBy(draftReady);
    setReadyBusy(false);
    if (ok) setReadyNote(`EV ready by set to ${draftReady}.`);
  }

  const dirty = draftMode !== live.zappiMode && draftMode !== "—";
  const readyDirty = draftReady !== live.evReadyBy && draftReady !== "—";
  const writable = liveMode && modeMapped;
  const readyWritable = liveMode && readyMapped;
  const applying = busy || pendingMode;
  const readyApplying = readyBusy || pendingReady;

  return (
    <section className="space-y-4">
      {showLabel ? <SectionLabel tone={tone}>Charge</SectionLabel> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Surface className="space-y-5 p-5" tone={tone === "terra" ? "terra" : undefined}>
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-md bg-teal/10 text-teal">
              <Zap className="size-5" strokeWidth={1.7} />
            </span>
            <div>
              <div className="font-medium">Zappi Charger</div>
              <div className="text-sm text-ink-soft">
                {live.zappiMode === "—" ? "Mode unknown" : live.zappiMode}
                {live.zappiW > 30 ? ` · ${live.zappiW} W` : " · idle"}
              </div>
            </div>
          </div>

          <div className="px-1">
            <Row label="Mode" value={live.zappiMode} />
            <Row
              label="Plug"
              value={formatPlug(zappiPlugMapped, live.zappiPlugged)}
            />
            <Row label="Charge" value={live.zappiW > 30 ? `${live.zappiW} W` : "Idle"} />
            <Row label="Today" value={formatTodayKwh(live.zappiTodayKwh)} />
          </div>

          <div className="space-y-3 border-t border-line pt-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <div className="font-medium">Charge mode</div>
                <div className="text-sm text-ink-soft">
                  Eco+ uses surplus solar first — pick a mode, then Apply
                </div>
              </div>
              <div className="text-sm tabular-nums text-ink-soft">
                Now: {live.zappiMode === "—" ? "—" : live.zappiMode}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex flex-wrap rounded-md bg-paper-deep p-1">
                {(options.length ? options : ["Eco+", "Eco", "Fast", "Stop"]).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    disabled={!writable || applying}
                    onClick={() => setDraftMode(opt)}
                    className={cn(
                      "min-h-9 rounded-sm px-3 text-sm font-medium transition-colors duration-150",
                      draftMode === opt
                        ? "bg-paper-raised text-ink shadow-sm"
                        : "text-ink-soft",
                      (!writable || applying) && "opacity-60",
                    )}
                  >
                    {opt}
                  </button>
                ))}
              </div>
              <button
                type="button"
                disabled={!writable || applying || !dirty}
                onClick={() => {
                  void applyMode();
                }}
                className="rounded-md bg-teal px-3.5 py-2 text-sm text-paper disabled:opacity-50"
              >
                {applying ? "Sending…" : "Apply mode"}
              </button>
            </div>
            {!liveMode ? (
              <p className="text-sm text-ink-soft">Demo only — connect to the Pi to change.</p>
            ) : !modeMapped ? (
              <p className="text-sm text-ink-soft">
                Zappi charge-mode select not found on this Pi — showing read-only.
              </p>
            ) : map.zappiMode ? (
              <p className="text-xs text-ink-soft/80">
                {map.zappiMode} · select.select_option
              </p>
            ) : null}
            {applying ? (
              <p className="text-sm text-ink-soft">Waiting for the Pi to confirm…</p>
            ) : note ? (
              <p className="text-sm text-teal">{note}</p>
            ) : null}
            {writeError && !pendingReady && !readyBusy ? (
              <p className="text-sm text-terra">{writeError}</p>
            ) : null}
          </div>
        </Surface>

        <Surface className="space-y-5 p-5" tone={tone === "teal" ? "teal" : undefined}>
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-md bg-teal/10 text-teal">
              <Car className="size-5" strokeWidth={1.7} />
            </span>
            <div>
              <div className="font-medium">Range Rover</div>
              <div className="text-sm text-ink-soft">
                {rangeRoverStatus(live, roverPlugMapped)}
                {live.rangeRoverSoc > 0 ? ` · ${live.rangeRoverSoc}%` : ""}
              </div>
            </div>
          </div>
          <div className="px-1">
            <Row label="Plug" value={formatPlug(roverPlugMapped, live.rangeRoverPlugged)} />
            <Row
              label="Charge"
              value={
                roverWMapped
                  ? live.rangeRoverW > 30
                    ? `${live.rangeRoverW} W`
                    : "Idle"
                  : "—"
              }
            />
            <Row
              label="SOC"
              value={roverSocMapped ? `${live.rangeRoverSoc}%` : "—"}
            />
            <Row label="Today" value={formatTodayKwh(live.rangeRoverTodayKwh)} />
          </div>
          <p className="text-sm leading-relaxed text-ink-soft">
            Plug/charge from a cable sensor when present, else the Front garden Meross Range Rover
            Hybrid switch (on = charging path) and its today kWh. Cupra / VAG Connect stays on the
            Zappi path — no invented Rover charge writes.
          </p>
        </Surface>
      </div>

      <Surface className="space-y-1 px-5 pb-4" tone="umber">
        <div className="flex flex-wrap items-center gap-2 border-b border-line py-3">
          <PlugZap className="size-4 text-umber" strokeWidth={1.7} />
          <span className="text-sm font-medium">Octopus Intelligent</span>
        </div>
        <Row
          label="Cheap Energy Available"
          value={live.intelligent ? "On" : "Off"}
        />
        <Row
          label="Cheap window"
          value={live.offPeak ? "On" : "Off"}
        />
        <p className="pb-2 text-xs leading-relaxed text-ink-soft">
          On means the cheap Intelligent / off-peak window is active right now (read-only).
        </p>

        <div className="space-y-3 border-t border-line pt-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <div className="font-medium">EV Ready by time</div>
              <div className="text-sm text-ink-soft">
                Octopus target — car should be ready by this time
              </div>
            </div>
            <div className="text-sm tabular-nums text-ink-soft">
              Now: {live.evReadyBy === "—" ? "—" : live.evReadyBy}
              {readyApplying ? " · confirming…" : ""}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="text-sm text-ink-soft">
              Ready by
              <select
                value={draftReady}
                disabled={!readyWritable || readyApplying}
                onChange={(e) => setDraftReady(e.target.value)}
                className="ml-2 min-h-9 rounded-md border border-line bg-paper px-3 py-1.5 text-sm tabular-nums text-ink disabled:opacity-60"
              >
                {(readyOptions.length ? readyOptions : ["07:00"]).map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={!readyWritable || readyApplying || !readyDirty}
              onClick={() => {
                void applyReady();
              }}
              className="rounded-md bg-teal px-3.5 py-2 text-sm text-paper disabled:opacity-50"
            >
              {readyApplying ? "Sending…" : "Apply ready by"}
            </button>
          </div>

          {!liveMode ? (
            <p className="text-sm text-ink-soft">Demo only — connect to the Pi to change.</p>
          ) : !readyMapped ? (
            <p className="text-sm text-ink-soft">
              Intelligent target-time entity not found — expected{" "}
              <span className="font-mono text-xs">{EV_READY_BY_ENTITY_PLACEHOLDER}</span> (or{" "}
              <span className="font-mono text-xs">time.*_intelligent_target_time</span>). Read-only
              until that select/time exists on the Pi. Does not change charge automations.
            </p>
          ) : map.evReadyBy ? (
            <p className="text-xs text-ink-soft/80">
              {map.evReadyBy} ·{" "}
              {map.evReadyBy.startsWith("time.") || map.evReadyBy.startsWith("input_datetime.")
                ? "time.set_value"
                : "select.select_option"}
            </p>
          ) : null}
          {readyApplying ? (
            <p className="text-sm text-ink-soft">Waiting for the Pi to confirm…</p>
          ) : readyNote ? (
            <p className="text-sm text-teal">{readyNote}</p>
          ) : null}
          {writeError && (pendingReady || readyBusy || readyMapped) && !pendingMode && !busy ? (
            <p className="text-sm text-terra">{writeError}</p>
          ) : null}
        </div>
      </Surface>
    </section>
  );
}
