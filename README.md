# Chimes

Home Assistant dashboard for Dad’s house. Paper-and-teal UI, live energy flow, battery, Zappi, garden, and an iPad overview.

Built to sit on the new Pi. Until you connect, it runs a demo snapshot of the house.

## Family password (required)

The whole app is gated by a Shyft glass login (`/login`) — same family-password pattern as LinksView, not Grok OAuth.

On the host (Vercel / Nitro / local), set:

```bash
CHIMES_SITE_PASSWORD=your-family-password
```

Optional: `CHIMES_SESSION_SECRET` (16+ chars). If omitted, a secret is derived from the site password.

After a correct password, the server sets an httpOnly `Secure` `SameSite=Lax` session cookie (~30 days). Sign out is on the **House** page.

## Connect to the house

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
CHIMES_SITE_PASSWORD=dev-password npm run dev
```

Open `/login`, enter the password, then go to **House** and paste the HA token.

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
