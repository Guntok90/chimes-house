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
| Grid charge     | `switch.batteries_charge_from_grid` (`switch.turn_on` / `turn_off`) — Battery / Energy only; **hidden on Home** |
| Grid cutoff SOC | `number.batteries_grid_charge_cutoff_soc` (`number.set_value`)                   |
| Solar cutoff SOC| `number.batteries_charging_cutoff_capacity` — End-of-charge (`number.set_value`) |
| Grid W          | `sensor.power_meter_active_power` (also `sensor.myenergi_chimes_power_grid`)     |
| House W         | Real load W if present; else **derived** `solar + grid − battery` (never kWh)    |
| Zappi mode      | `select.myenergi_zappi_25435526_charge_mode` (`select.select_option` Apply)     |
| Zappi plug      | `sensor.myenergi_zappi_25435526_plug_status`                                     |
| Zappi charge W  | Internal CT (`…_power_ct_internal` / `…_internal_load`) — not generation/battery |
| Zappi today kWh | `sensor.myenergi_zappi_25435526_energy_used_today` (Charge page)                 |
| Fan (Home)      | Smart Life / Tuya Fan. Preferred `fan.fan` / `fan.bedroom_fan` / `fan.tuya_fan` / `fan.ceiling_fan` (`fan.turn_on` / `turn_off` + `fan.set_percentage` for Speed 1–N). Optional speed helper: `number.fan_speed` / `select.fan_speed` (or `input_number.*`). Optional light: `light.fan_light`. When no `fan.*` exists, Home shows **Not mapped** (does not fake speed). Plug real ids into `PREFERRED_FAN` / `PREFERRED_FAN_SPEED` / `PREFERRED_FAN_LIGHT` in `src/lib/ha.ts`. The mislabelled switch named “Fan” is renamed in the UI to **Master Bedroom Light** and is not used as the Fan tile. |
| Nest heating    | Home **Central Heating** + Overview **Nest** window. The climate entity is discovered live: device-registry identifier domain `nest` (official Google Nest integration), else a `climate.*` whose name contains Nest. No preferred entity id — HA names it after the thermostat (`climate.downstairs`, …). Current temperature and setpoint come from that entity’s attributes. Setpoint uses `climate.set_temperature`, mode uses `climate.set_hvac_mode` (only modes HA lists), eco uses `climate.set_preset_mode` (`eco` / `none`) when `preset_modes` includes eco. 24h history is recorder history of the same entity **with attributes** (the state string is only the HVAC mode). **Schedule is not available:** the Nest SDM climate traits Home Assistant exposes do not include the weekly timetable, and Chimes will not invent one. A schedule control appears only if that same Nest device has a real schedule entity. |
| Range Rover     | Meross Hybrid preferred: plug = cable sensor → `switch.range_rover_hybrid` (on = charging path) → ambiguous plug binary last. Power = `sensor.smart_plug_power` (kW→W; preferred over Meross `current_consumption`). No Cupra/VAG ids. |
| Range Rover kWh | Prefer `sensor.smart_plug_today_s_consumption` (or other smart_plug *today* energy). Skip Meross `*_today_s_consumption` when stuck at 0. If still blank, Charge “Today” is filled from today’s hourly means of `sensor.smart_plug_power`. |
| Cupra / VAG     | Driveway Cupra stays on the **Zappi** path (`zappiPlugged` / `zappiW` / today). Do not remap VAG `*_plug_connected` onto Range Rover. |
| Cheap window    | Import Octopus off-peak binary only: preferred `binary_sensor.octopus_off_peak`, else `binary_sensor.octopus_energy_electricity_*_off_peak` (never automations / `input_*` / `export_off_peak`) — UI: Cheap/Peak badge, Cheap Energy Available |
| EV Ready by     | `select.octopus_energy_<DEVICE_ID>_intelligent_target_time` (or `time.*_intelligent_target_time`) via `select.select_option` / `time.set_value` |
| Stevie          | `person.stevie_w`                                                                |
| Pond water °C   | `sensor.t_h_sensor_with_external_probe_probe_temperature` (external probe — Overview pond graphs Day/Week/Month/Year are **hourly** means; not ambient unit temp) |
| Pond air °C     | `sensor.t_h_sensor_with_external_probe_temperature` (T&H body — Overview “Pond air temperature” series; HaMap key `gardenTempC`) |
| Outdoor temp    | `sensor.hp2553ae_pro_v1_9_0_outdoor_temperature` (Ecowitt HP2553AE — Weather page + Overview overlay) |
| Feels like      | `sensor.hp2553ae_pro_v1_9_0_feels_like_temperature` |
| Dewpoint        | `sensor.hp2553ae_pro_v1_9_0_dewpoint` |
| Humidity        | `sensor.hp2553ae_pro_v1_9_0_humidity` |
| Lounge temp     | `sensor.hp2553ae_pro_v1_9_0_indoor_temperature` |
| Greenhouse      | `sensor.hp2553ae_pro_v1_9_0_temperature_1` |
| Wind / rain / pressure / solar / UV | `sensor.hp2553ae_pro_v1_9_0_*` (gust may be mph while speed is km/h — display HA units as-is) |

If Range Rover Plug/Today still show “—” live, add (or rename) HA entities so the id/friendly name includes `range_rover` / `land_rover` / `jlr`, for example:

- Plug: `binary_sensor.*_charging_cable_connected` / `*_plug_connected` / `*_plugged_in`, or leave the Front garden **Range Rover Hybrid** Meross switch named with both tokens (preferred over stale `*_plug_status` binaries that stay off on AC charge)
- Today kWh: Hybrid `*_today_s_consumption` (kWh) or `*_energy_charged_today`, same naming rule
- Optional: a utility meter that resets at midnight feeding today’s kWh

Cupra portal / VAG Connect SOC work is out of scope here — keep those entities on the Zappi side.
| Switches        | Lamp/Telly/blankets/Fish/Pergola/Ponds → `switch.smart_switch_*` / garden ids    |

Live values use neutral zeros for unmapped fields — they never mix demo numbers (e.g. 16.68 kWh) with partial live data. History / Overview charts use HA recorder history over the same WebSocket when available; otherwise they show **No history yet** (never fake WEEK/HOURS curves while Live). “After dusk” only when a live `sun.sun` is `below_horizon`. If bootstrap is unconfigured, or the WebSocket cannot reach the Pi, the app stays on the demo snapshot and shows a connect error.

## Connect to the house (manual)

For a browser that is already on Tailscale, without `HA_TOKEN` on the host:

1. In Home Assistant: **Profile → Security → Long-lived access tokens**
2. Open Chimes → **House**
3. Address: `https://chimes-pi.tail8e29b8.ts.net` (Tailscale Serve HTTPS → HA on the Pi)
4. Paste the token → **Connect**

When `HA_TOKEN` is set, the next load uses the server token again. Chimes maps Huawei / LUNA / Zappi / Octopus / lights / plugs / Stevie automatically. Sidebar shows **Live** instead of Demo.

## Custom £/kWh rates (display only)

Energy → **Custom rates** lets Steve set cheap/off-peak and peak/high £/kWh. History spend, Energy cost charts, and Charge “today cost” use these values.

**They override dashboard maths only.** They do not change Octopus Intelligent Go, Cheap Energy Available / EV Ready by writes on their own entities, or any charge automation (including `automation.charge_cars_at_off_peak`). Huawei/inverter entities are never written from the tariff editor.

### Persistence

1. **Preferred — Home Assistant helpers** (shared across every tablet). Create Number helpers on the Pi with these exact entity ids:

   | Role            | Entity id                         | Suggested settings                          |
   | --------------- | --------------------------------- | ------------------------------------------- |
   | Cheap / off-peak | `input_number.chimes_tariff_cheap` | min 0, max 2, step 0.001, unit `£/kWh`     |
   | Peak / high      | `input_number.chimes_tariff_peak`  | min 0, max 2, step 0.001, unit `£/kWh`     |

   Also accepted: `number.chimes_tariff_cheap` / `number.chimes_tariff_peak`.

   Chimes writes them via the existing tablet WebSocket (`input_number.set_value` / `number.set_value`). Until the helpers exist, the UI degrades gracefully.

2. **Fallback — tablet localStorage** (`chimes.tariffs`) when helpers are missing. Rates stay on that device until HA helpers are created.

Daily spend without a TOU import split is estimated as **25% cheap + 75% peak** × imported kWh (Intelligent-ish overnight share). Defaults are £0.070 / £0.226 per kWh.

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
| Home     | 24h energy graph, Central Heating (Nest: now, heat set to, mode, eco, 24h history — schedule stays in the Nest app), Fan on/off+speed, area-grouped switches (device areas when entity.area_id is null; keeps registry-hidden Meross/Smart Life plugs; no Spares heading; hides dnd / myenergi / child lock / enable / grid-charge; UI renames Fan→Master Bedroom Light, first Spare→Fly Killer), Stevie |
| Energy   | Live flow (solar / grid / battery / home / Zappi / Range Rover) + Charge (Zappi mode Apply + Rover + Cheap Energy Available + EV Ready by) + **Battery** charge limits (grid/solar cutoffs + min SOC) + inverter / Octopus + custom £/kWh rates |
| Site     | 3D plot — house, solar, battery, both cars             |
| Battery  | SOC / charge / discharge + Grid / Solar cutoffs + min SOC (Allow vs actively charging clarified) |
| Charge   | Zappi Eco+ mode, Range Rover status, Cheap Energy Available (read-only), EV Ready by Apply |
| History  | 7 / 28 day solar, house, grid, spend                   |
| Weather  | Ecowitt outdoor / wind / rain / sun + greenhouse + pond |
| Garden   | Front (Willow Tree + Range Rover Hybrid switches) · Back (Pergola, ponds, Frank) |
| House    | Lights, plugs, **Pi connection**, sign out             |
| Overview | iPad wall — house film, glass tiles (flow + 24h graph + weather + pond + Nest: current temp and Heat set to) |

## Note

Dad’s house timelapse (`public/media/house.mp4`) loops behind the Overview glass tiles at `/media/house.mp4`.
