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

## Live Home Assistant (tablet WebSocket)

Home Assistant is only on Tailscale Serve: `https://chimes-pi.tail8e29b8.ts.net`. Vercel cannot see MagicDNS, so the server never fetches `/api/states`. Tablets and phones must be on Tailscale (or the house LAN) to reach the Pi. Vercel hosts the UI and, after the family password, hands the Pi address and token to that session.

```bash
HA_URL=https://chimes-pi.tail8e29b8.ts.net   # optional; this is the default
HA_TOKEN=your-ha-long-lived-access-token     # required for automatic live mode
```

After login the app calls `GET /api/ha/bootstrap` (family session cookie required). When `HA_TOKEN` is set the response is `{ configured, url, token }`. The browser stores that the same way as House → Connect and opens a WebSocket to the Pi. Overview, Energy Flow, Battery, and Charge follow `state_changed`. The sidebar shows **Live**.

`HA_TOKEN` is not in the JavaScript bundle. Logged-out calls get 401, or a redirect to `/login`, and no token.

Mapped when present (preferred ids first):

| Field           | Preferred entity                                                                 |
| --------------- | -------------------------------------------------------------------------------- |
| Solar now       | `sensor.inverter_input_power`                                                    |
| Solar today     | `sensor.inverter_daily_yield`                                                    |
| Inverter W      | `sensor.inverter_active_power`                                                   |
| Inverter status | `sensor.inverter_device_status`                                                  |
| Battery SOC     | `sensor.battery_1_state_of_capacity`                                             |
| Battery W       | `sensor.batteries_charge_discharge_power` (signed; negative = discharging)       |
| Grid W          | `sensor.power_meter_active_power` (also `sensor.myenergi_chimes_power_grid`)     |
| House W         | Real load W if present; else **derived** `solar + grid − battery` (never kWh)    |
| Zappi mode      | `select.myenergi_zappi_25435526_charge_mode`                                     |
| Zappi plug      | `sensor.myenergi_zappi_25435526_plug_status`                                     |
| Zappi charge W  | Internal CT (`…_power_ct_internal` / `…_internal_load`) — not generation/battery |
| Zappi today kWh | `sensor.myenergi_zappi_25435526_energy_used_today` (Charge page)                 |
| Range Rover kWh | Optional daily energy entity if present; otherwise “—” on Charge                 |
| Stevie          | `person.stevie_w`                                                                |
| Switches        | Lamp/Telly/blankets/Fish/Pergola/Ponds → `switch.smart_switch_*` / garden ids    |

Live values use neutral zeros for unmapped fields — they never mix demo numbers (e.g. 16.68 kWh) with partial live data. History / Overview charts use HA recorder history over the same WebSocket when available; otherwise they show **No history yet** (never fake WEEK/HOURS curves while Live). “After dusk” only when a live `sun.sun` is `below_horizon`. If bootstrap is unconfigured, or the WebSocket cannot reach the Pi, the app stays on the demo snapshot and shows a connect error.

## Connect to the house (manual)

For a browser that is already on Tailscale, without `HA_TOKEN` on the host:

1. In Home Assistant: **Profile → Security → Long-lived access tokens**
2. Open Chimes → **House**
3. Address: `https://chimes-pi.tail8e29b8.ts.net` (Tailscale Serve HTTPS → HA on the Pi)
4. Paste the token → **Connect**

When `HA_TOKEN` is set, the next load uses the server token again. Chimes maps Huawei / LUNA / Zappi / Octopus / lights / plugs / Stevie automatically. Sidebar shows **Live** instead of Demo.

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

Open `/login`, enter the password. With `HA_TOKEN` set, a machine on Tailscale goes live over the WebSocket. Or open **House** and paste a browser token.

## What’s in here

| Page     | What it is                                             |
| -------- | ------------------------------------------------------ |
| Home     | Solar today, battery, house load, lights, Stevie       |
| Energy   | Live 5-node flow + inverter / Octopus                  |
| Site     | 3D plot — house, solar, battery, both cars             |
| Battery  | SOC / charge / discharge                               |
| Charge   | Zappi Eco+, Intelligent                                |
| History  | 7 / 28 day solar, house, grid, spend                   |
| Garden   | Front (Willow, Range Rover cams) · Back (Pergola, ponds, Frank) |
| House    | Lights, plugs, **Pi connection**, sign out             |
| Overview | iPad wall — house film, glass tiles (flow + 24h graph) |

## Note

Dad’s house timelapse (`public/media/house.mp4`) loops behind the Overview glass tiles at `/media/house.mp4`.
