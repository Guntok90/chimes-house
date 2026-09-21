# Chimes

Home Assistant dashboard for Dad’s house. Paper-and-teal UI, live energy flow, battery, Zappi, garden, and an iPad overview.

Built to sit on the new Pi. Until you connect, it runs a demo snapshot of the house.

## Connect to the house

1. In Home Assistant: **Profile → Security → Long-lived access tokens**
2. Open Chimes → **House**
3. Address: `http://homeassistant.local:8123`
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
npm run dev
```

Open the app, go to **House**, paste the token.

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
| House | Lights, plugs, **Pi connection** |
| Overview | iPad wall — house film, glass tiles (flow + 24h graph) |

## Note

The cinematic overview video is not in this repo (too large). Drop `house.mp4` in `public/media/` if you have it.
