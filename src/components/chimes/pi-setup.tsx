import { useEffect, useState } from "react";
import { useHouse } from "@/lib/house-store";
import { SWITCHES, readCreds } from "@/lib/ha";
import { Surface, SectionLabel, Row } from "./ui";

const YAML = `panel_iframe:
  chimes:
    title: Chimes
    icon: mdi:home-variant
    url: REPLACE_WITH_CHIMES_URL
    require_admin: false`;

export function PiSetup() {
  const { status, error, url, map, connect, disconnect } = useHouse();
  const [host, setHost] = useState(url);
  const [token, setToken] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setHost(url);
  }, [url]);

  const yaml = YAML.replace("REPLACE_WITH_CHIMES_URL", typeof window === "undefined" ? "URL" : window.location.origin);

  return (
    <section className="space-y-3">
      <SectionLabel>Pi · Home Assistant</SectionLabel>
      <Surface className="space-y-4 p-5">
        <p className="text-sm leading-relaxed text-ink-soft">
          This is the dashboard for the new Pi. Paste a long-lived token from Home Assistant
          (Profile → Security). On the same network it talks live to the house.
        </p>
        <label className="block text-sm">
          <span className="text-ink-soft">Address</span>
          <input
            value={host}
            onChange={(e) => setHost(e.target.value)}
            className="mt-1 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm"
            placeholder="http://homeassistant.local:8123"
            autoComplete="off"
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-soft">Token</span>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            className="mt-1 w-full rounded-md border border-line bg-paper px-3 py-2 text-sm"
            placeholder="Long-lived access token"
            type="password"
            autoComplete="off"
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="rounded-md bg-teal px-3.5 py-2 text-sm text-paper"
            onClick={() => {
              const saved = readCreds()?.token ?? "";
              const next = token || saved;
              if (!next) return;
              void connect({ url: host.replace(/\/$/, ""), token: next });
            }}
            disabled={status === "connecting" || (!token && !readCreds()?.token)}
          >
            {status === "connecting" ? "Connecting…" : "Connect"}
          </button>
          {status === "live" ? (
            <button
              type="button"
              className="rounded-md border border-line px-3.5 py-2 text-sm"
              onClick={disconnect}
            >
              Use demo
            </button>
          ) : null}
          <span className="text-sm text-ink-soft">
            {status === "live"
              ? "Live on the Pi"
              : status === "error"
                ? error
                : status === "connecting"
                  ? "Talking to Home Assistant…"
                  : "Demo snapshot"}
          </span>
        </div>
      </Surface>

      <Surface className="px-5">
        <Row label="Mode" value={status === "live" ? "Live" : "Demo"} />
        <Row label="Mapped" value={`${Object.keys(map).length} entities`} />
      </Surface>

      {Object.keys(map).length > 0 ? (
        <Surface className="px-5">
          {Object.entries(map).map(([key, id]) => (
            <Row
              key={key}
              label={SWITCHES.find((s) => s.id === key)?.label ?? key}
              value={id}
            />
          ))}
        </Surface>
      ) : null}

      <Surface className="p-5">
        <div className="mb-2 text-xs font-medium uppercase tracking-widest text-ink-soft">
          configuration.yaml
        </div>
        <p className="mb-3 text-sm text-ink-soft">
          On the Pi, add this so Chimes is a sidebar panel. Then Chromium kiosk that panel.
        </p>
        <pre className="overflow-auto rounded-md bg-paper-deep px-3 py-3 text-xs leading-relaxed text-ink">
          {yaml}
        </pre>
        <button
          type="button"
          className="mt-3 rounded-md border border-line px-3 py-1.5 text-sm"
          onClick={() => {
            void navigator.clipboard.writeText(yaml);
            setCopied(true);
            window.setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </Surface>
    </section>
  );
}
