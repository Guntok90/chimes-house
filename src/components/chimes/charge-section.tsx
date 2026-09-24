import { useEffect, useState } from "react";
import { Car, PlugZap, Zap } from "lucide-react";
import { useHouse, useLive } from "@/lib/house-store";
import { cn } from "@/lib/utils";
import { Row, SectionLabel, Surface } from "./ui";
import { VehicleCard } from "./vehicles";

function formatTodayKwh(v: number | null): string {
  return v == null ? "—" : `${v} kWh`;
}

function rangeRoverStatus(live: {
  rangeRoverPlugged: boolean;
  rangeRoverW: number;
  rangeRoverSoc: number;
}): string {
  if (live.rangeRoverW > 30) return "Charging";
  if (live.rangeRoverPlugged) return "Plugged in";
  return "Plug off";
}

/**
 * Live driveway charge UI shared by Energy → Charge and the Charge page.
 * Zappi mode is writable via the mapped select entity; Octopus Dispatch stays read-only.
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
  const writeError = useHouse((s) => s.writeError);
  const applyZappiMode = useHouse((s) => s.applyZappiMode);

  const liveMode = status === "live";
  const modeMapped = Boolean(map.zappiMode);
  const [draftMode, setDraftMode] = useState(live.zappiMode);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    if (live.zappiMode && live.zappiMode !== "—") setDraftMode(live.zappiMode);
  }, [live.zappiMode]);

  async function applyMode() {
    setBusy(true);
    setNote(null);
    const ok = await applyZappiMode(draftMode);
    setBusy(false);
    if (ok) setNote(`Zappi mode set to ${draftMode}.`);
  }

  const dirty = draftMode !== live.zappiMode && draftMode !== "—";
  const writable = liveMode && modeMapped;

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
            <Row label="Plug" value={live.zappiPlugged ? "Connected" : "Unplugged"} />
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

            {!liveMode ? (
              <p className="text-sm text-ink-soft">Demo only — connect to the Pi to change.</p>
            ) : !modeMapped ? (
              <p className="text-sm text-ink-soft">
                Zappi charge-mode select not found on this Pi — showing read-only.
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <div className="inline-flex flex-wrap rounded-md bg-paper-deep p-1">
                  {options.map((opt) => (
                    <button
                      key={opt}
                      type="button"
                      disabled={!writable || busy}
                      onClick={() => setDraftMode(opt)}
                      className={cn(
                        "min-h-9 rounded-sm px-3 text-sm font-medium transition-colors duration-150",
                        draftMode === opt
                          ? "bg-paper-raised text-ink shadow-sm"
                          : "text-ink-soft",
                      )}
                    >
                      {opt}
                    </button>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={!writable || busy || !dirty}
                  onClick={() => {
                    void applyMode();
                  }}
                  className="rounded-md bg-teal px-3.5 py-2 text-sm text-paper disabled:opacity-50"
                >
                  {busy ? "Sending…" : "Apply mode"}
                </button>
              </div>
            )}
            {writable && map.zappiMode ? (
              <p className="text-xs text-ink-soft/80">
                {map.zappiMode} · select.select_option
              </p>
            ) : null}
            {note ? <p className="text-sm text-teal">{note}</p> : null}
            {writeError ? <p className="text-sm text-terra">{writeError}</p> : null}
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
                {rangeRoverStatus(live)}
                {live.rangeRoverSoc > 0 ? ` · ${live.rangeRoverSoc}%` : ""}
              </div>
            </div>
          </div>
          <div className="px-1">
            <Row label="Plug" value={live.rangeRoverPlugged ? "Connected" : "Unplugged"} />
            <Row
              label="Charge"
              value={live.rangeRoverW > 30 ? `${live.rangeRoverW} W` : "Idle"}
            />
            <Row
              label="SOC"
              value={live.rangeRoverSoc > 0 ? `${live.rangeRoverSoc}%` : "—"}
            />
            <Row label="Today" value={formatTodayKwh(live.rangeRoverTodayKwh)} />
          </div>
          <p className="text-sm leading-relaxed text-ink-soft">
            Status only from entities already on the Pi — no invented charge writes for the
            Rover.
          </p>
        </Surface>
      </div>

      <div className="grid gap-2.5 md:grid-cols-2">
        <VehicleCard
          icon={Zap}
          name="Zappi Charger"
          place="Driveway"
          status={live.zappiPlugged ? "Plugged in" : "Unplugged"}
          detail={
            live.zappiW > 30
              ? `${live.zappiW} W`
              : live.zappiMode === "—"
                ? undefined
                : live.zappiMode
          }
          todayKwh={live.zappiTodayKwh}
          live={live.zappiW > 30 || live.zappiPlugged}
          tone="terra"
        />
        <VehicleCard
          icon={Car}
          name="Range Rover"
          place="Driveway"
          status={rangeRoverStatus(live)}
          detail={
            live.rangeRoverW > 30
              ? `${live.rangeRoverW} W`
              : live.rangeRoverSoc > 0
                ? `${live.rangeRoverSoc}%`
                : undefined
          }
          todayKwh={live.rangeRoverTodayKwh}
          live={live.rangeRoverW > 30 || live.rangeRoverPlugged}
          tone="teal"
        />
      </div>

      <Surface className="px-5" tone="umber">
        <div className="flex flex-wrap items-center gap-2 border-b border-line py-3">
          <PlugZap className="size-4 text-umber" strokeWidth={1.7} />
          <span className="text-sm font-medium">Octopus Intelligent · read-only</span>
        </div>
        <Row label="Dispatch" value={live.intelligent ? "Armed" : "Off"} />
        <Row label="Off-peak" value={live.offPeak ? "Yes" : "No"} />
      </Surface>
    </section>
  );
}
