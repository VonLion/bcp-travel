# BCP Travel

Personal PWA for planning trips from home (Amsterdam Zuidoost) with public
transport. Pure static site — no build step, no backend, no API keys.

The logo is a split-flap departure board
spelling out the three initials ([logo.svg](logo.svg) / [icon.svg](icon.svg)).

## Features

- **Departure boards** — next 3 departures towards the city from
  Station Gaasperplas (metro 53, 12 min walk) and Leerdamhof
  (bus 47 richting Station Bijlmer ArenA, 7 min walk). Real-time where
  available (green dot), delays shown in red. Auto-refreshes every 30s,
  on app resume, via pull-to-refresh and the refresh button.
- **Route planner** — type a destination (autocomplete biased to the
  neighbourhood), get three route options:
  1. 🚇 from Gaasperplas, departing now
  2. 🚌 from Leerdamhof, departing now
  3. 🚲 from Station Bijlmer ArenA, departing now + 15 min (bike time)
- **Recent destinations** — stored locally on the phone.
- Light/dark mode follows the system theme.

## Data

Everything comes from [Transitous](https://transitous.org) (community-run
MOTIS instance, free, CORS-enabled): `/geocode` for autocomplete,
`/stoptimes` for departures, `/plan` for routing. Realtime comes from the
Dutch OpenOV GTFS-RT feeds it ingests.

Stop IDs and direction filters live at the top of [app.js](app.js). If GVB
renumbers a line or a stop ID changes, verify with:

```
https://api.transitous.org/api/v1/geocode?text=<stop name>&type=STOP
```

## Run locally

```sh
python3 -m http.server 8741
# open http://localhost:8741
```

## Deploy

Any static host works. Easiest: push this folder to a GitHub repo, enable
GitHub Pages (Settings → Pages → deploy from branch). Netlify/Vercel
drag-and-drop also works. HTTPS is required for the service worker and
Add-to-Home-Screen.

When you change `app.js`/`style.css`, bump `CACHE` in [sw.js](sw.js)
(e.g. `bcp-v5` → `bcp-v6`) so installed phones pick up the update.

## Install on iPhone

Open the deployed URL in Safari → Share → **Zet op beginscherm**.
It launches fullscreen with its own icon. Repeat on the second phone.

## Icons

The PNG app icons are rasterised from [icon.svg](icon.svg) by
[gen_icons.py](gen_icons.py) (needs `brew install librsvg`):

```sh
python3 gen_icons.py
```

Edit `icon.svg` / `logo.svg` to change the brand, then re-run the script.
