# Chimes

Home Assistant dashboard for Dad’s house. Paper-and-teal UI, live energy flow, battery, Zappi, garden, and an iPad overview.

Built to sit on the new Pi. Until Home Assistant is configured (server token or House Connect), it runs a demo snapshot of the house.

## Family password (required)

The whole app is gated by a Shyft glass login (`/login`) — same family-password pattern as LinksView, not Grok OAuth.

On the host (Vercel / Nitro / local), set:

```bash
CHIMES_SITE_PASSWORD=your-family-password
```

Optional: `CHIMES_SESSION_SECRET` (16+ chars). If omitted, a secret is derived from the site password.

After a correct password, the server sets an httpOnly `Secure` `SameSite=Lax` session cookie (~30 days). Sign out is on the **House** page.

## Live Home Assistant (server — preferred)

Tablets get live Overview / Energy Flow / Battery / Charge without pasting a long-lived token in the browser. Set on the host:

```bash
HA_URL=https://chimes-pi.tail8e29b8.ts.net   # optional; this is the default
HA_TOKEN=your-ha-long-lived-access-token     # required for server live mode
```

With `HA_TOKEN` set, logged-in clients poll `GET /api/ha/live` every ~5s (family session cookie required). The token never leaves the server.

Mapped when present (preferred ids first):

| Field | Preferred entity |
|---|---|
| Solar now | `sensor.inverter_input_power` |
| Solar today | `sensor.inverter_daily_yield` |
| Inverter W | `sensor.inverter_active_power` |
| Battery SOC | `sensor.battery_1_state_of_capacity` |
| Battery W | `sensor.battery_1_charge_discharge_power` (signed; negative = discharging) |
| House / grid / Zappi / Octopus | fuzzy + common Huawei / myenergi / Octopus names |

Live payloads use neutral zeros for unmapped fields — they never mix demo numbers (e.g. 16.68 kWh) with partial live data. Without `HA_TOKEN` (or if HA is unreachable on boot), the app stays on the demo snapshot / House Connect path.

## Connect to the house (optional browser override)

For local/dev without server env, or to override:

1. In Home Assistant: **Profile → Security → Long-lived access tokens**
2. Open Chimes → **House**
3. Address: `https://chimes-pi.tail8e29b8.ts.net` (Tailscale Serve HTTPS → HA on the Pi)
4. Paste the token → **Connect**

Chimes maps Huawei / LUNA / Zappi / Octopus / lights / plugs / Stevie automatically. Sidebar shows **Live** instead of Demo.

## Pi panel

Add to `/config/configuration.yaml`, then restart:

```yaml
panel_iframe:
  chimes:
    title: Chimes
    icon: mdi:home-variant
    url: https://YOUR-CHIMES-HOST
    require_admin: false
```

Kiosk the panel in Chromium on the Pi display.

## Run locally

```bash
npm install
CHIMES_SITE_PASSWORD=dev-password HA_TOKEN=your-token npm run dev
```

Open `/login`, enter the password. With `HA_TOKEN` set, Overview goes live automatically. Or open **House** and paste a browser token.

## What’s in here

| Page | What it is |
|---|---|
| Home | Solar today, battery, house load, lights, Stevie |
| Energy | Live 5-node flow + inverter / Octopus |
| Site | 3D plot — house, solar, battery, both cars |
| Battery | SOC / charge / discharge |
| Charge | Zappi Eco+, Intelligent |
| History | 7 / 28 day solar, house, grid, spend |
| Garden | Pergola, ponds |
| House | Lights, plugs, **Pi connection**, sign out |
| Overview | iPad wall — house film, glass tiles (flow + 24h graph) |

## Note

The cinematic overview video is not in this repo (too large). Drop `house.mp4` in `public/media/` if you have it.
