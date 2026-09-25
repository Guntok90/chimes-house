import { useEffect, useState } from "react";
import { useHouse, useTariffs } from "@/lib/house-store";
import {
  PREFERRED_TARIFF_ENTITIES,
  formatGbpPerKwh,
  parseRateInput,
} from "@/lib/tariffs";
import { cn } from "@/lib/utils";
import { SectionLabel, Surface } from "./ui";

/**
 * Edit custom £/kWh rates used for History / Energy spend maths.
 * Writes HA input_number helpers when present; otherwise tablet localStorage.
 * Does not change Octopus or charge automations.
 */
export function TariffEditor() {
  const tariffs = useTariffs();
  const setTariffs = useHouse((s) => s.setTariffs);
  const map = useHouse((s) => s.map);
  const [cheapDraft, setCheapDraft] = useState(String(tariffs.cheap));
  const [peakDraft, setPeakDraft] = useState(String(tariffs.peak));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    setCheapDraft(String(tariffs.cheap));
    setPeakDraft(String(tariffs.peak));
  }, [tariffs.cheap, tariffs.peak]);

  const dirty =
    parseRateInput(cheapDraft) !== tariffs.cheap || parseRateInput(peakDraft) !== tariffs.peak;

  async function save() {
    const cheap = parseRateInput(cheapDraft);
    const peak = parseRateInput(peakDraft);
    if (cheap == null || peak == null) {
      setMessage("Enter valid £/kWh numbers (e.g. 0.070 and 0.226).");
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      await setTariffs({ cheap, peak });
      setMessage(
        map.tariffCheap || map.tariffPeak
          ? "Saved to Home Assistant helpers."
          : "Saved on this tablet (create HA helpers to share across devices).",
      );
    } finally {
      setSaving(false);
    }
  }

  const sourceHint =
    tariffs.source === "ha"
      ? "Live from Home Assistant helpers"
      : tariffs.source === "local"
        ? "Saved on this tablet"
        : "Built-in defaults";

  return (
    <section>
      <SectionLabel>Custom rates</SectionLabel>
      <Surface className="space-y-4 p-5">
        <p className="text-sm leading-relaxed text-ink-soft">
          These £/kWh figures drive History spend and Energy cost only. They do not change
          Octopus Intelligent Go, Cheap Energy Available, or any charge automation.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <RateField
            label="Cheap / off-peak"
            value={cheapDraft}
            onChange={setCheapDraft}
            hint={`Now ${formatGbpPerKwh(tariffs.cheap)}`}
          />
          <RateField
            label="Peak / high"
            value={peakDraft}
            onChange={setPeakDraft}
            hint={`Now ${formatGbpPerKwh(tariffs.peak)}`}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={saving || !dirty}
            onClick={() => void save()}
            className={cn(
              "min-h-10 rounded-md px-4 text-sm font-medium transition-colors",
              dirty && !saving
                ? "bg-teal text-paper"
                : "cursor-not-allowed bg-paper-deep text-ink-soft",
            )}
          >
            {saving ? "Saving…" : "Save rates"}
          </button>
          <span className="text-xs text-ink-soft">{sourceHint}</span>
        </div>
        {message ? <p className="text-sm text-ink-soft">{message}</p> : null}
        {!map.tariffCheap && !map.tariffPeak ? (
          <details className="text-sm text-ink-soft">
            <summary className="cursor-pointer font-medium text-ink">HA helpers (optional)</summary>
            <p className="mt-2 leading-relaxed">
              Create these on the Pi so every tablet shares the same rates. Until they exist,
              Chimes keeps rates in localStorage on this device.
            </p>
            <ul className="mt-2 list-inside list-disc font-mono text-xs">
              <li>{PREFERRED_TARIFF_ENTITIES.cheap[0]}</li>
              <li>{PREFERRED_TARIFF_ENTITIES.peak[0]}</li>
            </ul>
            <p className="mt-2 leading-relaxed">
              Settings → Devices &amp; services → Helpers → Create helper → Number. Min 0, max 2,
              step 0.001, unit £/kWh. Also accepts{" "}
              <span className="font-mono text-xs">{PREFERRED_TARIFF_ENTITIES.cheap[1]}</span> /{" "}
              <span className="font-mono text-xs">{PREFERRED_TARIFF_ENTITIES.peak[1]}</span>.
            </p>
          </details>
        ) : (
          <p className="text-xs text-ink-soft">
            Writing{" "}
            <span className="font-mono">{map.tariffCheap ?? "—"}</span> /{" "}
            <span className="font-mono">{map.tariffPeak ?? "—"}</span>
          </p>
        )}
      </Surface>
    </section>
  );
}

function RateField({
  label,
  value,
  onChange,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint: string;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-widest text-ink-soft">{label}</span>
      <div className="mt-1.5 flex items-center gap-2">
        <span className="text-ink-soft">£</span>
        <input
          type="text"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="min-h-10 w-full rounded-md border border-line bg-white/80 px-3 font-medium tabular-nums outline-none focus:border-teal"
          aria-label={`${label} pounds per kWh`}
        />
        <span className="shrink-0 text-sm text-ink-soft">/kWh</span>
      </div>
      <span className="mt-1 block text-xs text-ink-soft">{hint}</span>
    </label>
  );
}
