'use strict';

// ============================================================
// Config — stop IDs come from the Transitous (MOTIS) dataset.
// Verify with: https://api.transitous.org/api/v1/geocode?text=<name>&type=STOP
// ============================================================
const API = 'https://api.transitous.org/api/v1';

// All NS train product types MOTIS may report at Bijlmer ArenA.
const RAIL_MODES = new Set([
  'REGIONAL_RAIL', 'REGIONAL_FAST_RAIL', 'HIGHSPEED_RAIL',
  'LONG_DISTANCE', 'NIGHT_RAIL', 'RAIL',
]);

const BOARDS = [
  {
    el: 'board-metro',
    stopId: 'nl-OpenOV_NL:S:30009550', // Station Gaasperplas
    // Gaasperplas is the 53 terminus: every metro departure heads to Centraal.
    filter: (st) => st.mode === 'SUBWAY',
    n: 16,
    count: 3,
  },
  {
    el: 'board-bus',
    stopId: 'nl-OpenOV_3980641', // Leerdamhof (returns both quays)
    // "Towards the city" = bus 47 richting Station Bijlmer ArenA.
    filter: (st) => st.mode === 'BUS' && /aren/i.test(st.headsign || ''),
    n: 16,
    count: 3,
  },
  {
    el: 'board-train',
    stopId: 'nl-OpenOV_NL:S:30000559', // Station Bijlmer ArenA
    // All NS trains, both directions. Times are from now (not the +15 bike
    // offset) so this board works both at home and standing on the platform.
    filter: (st) => RAIL_MODES.has(st.mode),
    n: 120,          // enough departures to cover a full hour of trains
    count: 5,        // collapsed view
    expandable: true,
    windowMin: 60,   // expanded view: everything in the next hour
    showTrack: true,
  },
];

const ROUTE_ORIGINS = [
  {
    iconType: 'metro',
    label: 'Metrostation Gaasperplas',
    place: 'nl-OpenOV_NL:S:30009550',
    coord: '52.311016,4.984585', // for the Google Maps link
    offsetMin: 0,
  },
  {
    iconType: 'bus',
    label: 'Bushalte Leerdamhof',
    place: 'nl-OpenOV_3980641',
    coord: '52.30539,4.97526',
    offsetMin: 0,
  },
  {
    iconType: 'bike',
    label: 'Bijlmer ArenA',
    place: 'nl-OpenOV_NL:S:30000559', // Station Bijlmer ArenA
    coord: '52.311302,4.947578',
    offsetMin: 15, // bike time to the station (not shown — the user knows)
  },
];

// Inline mode-icon SVGs, shared by the route-card headers. The board headers
// use the same artwork (see index.html).
const MODE_SVGS = {
  metro: '<svg viewBox="0 0 52 44" aria-hidden="true">'
    + '<path d="M6 42 L6 24 A20 17 0 0 1 46 24 L46 42 Z" fill="#0f0e1f"/>'
    + '<rect x="13" y="10" width="26" height="28" rx="7" fill="#d6231d"/>'
    + '<rect x="13" y="23" width="26" height="2.5" fill="#ffffff" opacity="0.22"/>'
    + '<rect x="17" y="14" width="18" height="8" rx="3" fill="#11101f"/>'
    + '<circle cx="19" cy="34" r="2.2" fill="#ffffff"/><circle cx="33" cy="34" r="2.2" fill="#ffffff"/></svg>',
  bus: '<svg viewBox="0 0 52 44" aria-hidden="true">'
    + '<rect x="6" y="12" width="40" height="20" rx="3" fill="#14a3a3"/>'
    + '<rect x="9" y="15" width="30" height="8" rx="2" fill="#11101f"/>'
    + '<line x1="16" y1="15" x2="16" y2="23" stroke="#14a3a3" stroke-width="1.5"/>'
    + '<line x1="24" y1="15" x2="24" y2="23" stroke="#14a3a3" stroke-width="1.5"/>'
    + '<line x1="32" y1="15" x2="32" y2="23" stroke="#14a3a3" stroke-width="1.5"/>'
    + '<circle cx="43" cy="28" r="1.8" fill="#ffd34d"/>'
    + '<circle cx="16" cy="33" r="4" fill="#11101f"/><circle cx="36" cy="33" r="4" fill="#11101f"/>'
    + '<circle cx="16" cy="33" r="1.6" fill="#14a3a3"/><circle cx="36" cy="33" r="1.6" fill="#14a3a3"/></svg>',
  bike: '<svg viewBox="0 0 52 44" aria-hidden="true">'
    + '<g fill="none" stroke="#ffc917" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">'
    + '<circle cx="14" cy="31" r="8"/><circle cx="38" cy="31" r="8"/>'
    + '<path d="M14 31 L24 31 L19 16 L31 16 L38 31"/><path d="M24 31 L31 16"/>'
    + '<path d="M16 16 L22 16"/><path d="M29 14 L34 14"/></g></svg>',
};

function modeIcon(type) {
  const span = el('span', 'mode-tile', '');
  span.innerHTML = MODE_SVGS[type] || '';
  return span;
}

// Favourite destinations — edit freely. `label` shows in the split-flap
// placeholder and the quick-pick chips; `address` is geocoded when tapped.
const QUICK_DESTINATIONS = [
  { label: 'Oma',               address: 'Eerste Jan Steenstraat, Amsterdam' },
  { label: 'Boze-Zwaanmuseum',  address: 'Museumstraat 1, Amsterdam' },
  { label: 'Opa Boot',          address: 'Magere Brug, Amsterdam' },
  { label: 'Cafeetje',          address: 'Pretoriusstraat 15, Amsterdam' },
  { label: 'De Hut',            address: 'Rampweg 10, Renesse' },
  { label: 'Opa & Oma Zeeland', address: 'Rollandhof, Zierikzee' },
  { label: 'Skydive',           address: 'Noodweg 49, Hilversum' },
  { label: 'Niels & Katinka',   address: 'Roggekamp, Diemen' },
  { label: 'Robin!',            address: 'Polderland, Diemen' },
];

const GEOCODE_BIAS = '52.305,4.975'; // home area, ranks nearby results higher
const REFRESH_MS = 30_000;
const MAX_RECENTS = 8;
const ITINERARIES_PER_ROUTE = 3;

const $ = (id) => document.getElementById(id);
const timeFmt = new Intl.DateTimeFormat('nl-NL', {
  hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam',
});

// ============================================================
// Departure boards
// ============================================================
let refreshTimer = null;

async function loadBoard(board) {
  const res = await fetch(`${API}/stoptimes?stopId=${encodeURIComponent(board.stopId)}&n=${board.n}`);
  if (!res.ok) throw new Error(`stoptimes ${res.status}`);
  const data = await res.json();

  const now = Date.now();
  // Keep cancelled departures (they're shown struck through, not hidden); a
  // cancelled trip may drop its realtime `departure`, so fall back to schedule.
  board._deps = (data.stopTimes || [])
    .map((st) => ({ ...st, _when: st.place.departure || st.place.scheduledDeparture }))
    .filter((st) => st.place.pickupType !== 'NOT_ALLOWED' && st._when)
    .filter(board.filter)
    .filter((st) => new Date(st._when).getTime() >= now - 30_000);

  renderBoard(board);
}

function renderBoard(board) {
  const card = $(board.el);
  const list = card.querySelector('.departures');
  const all = board._deps || [];
  const now = Date.now();

  // Collapsed = next `count`. Expanded = everything in the next `windowMin`,
  // but never fewer rows than the collapsed view.
  let shown = all.slice(0, board.count);
  if (board.expandable && board._expanded) {
    const cutoff = now + board.windowMin * 60_000;
    const within = all.filter((st) => new Date(st.place.departure).getTime() <= cutoff);
    shown = within.length >= board.count ? within : all.slice(0, board.count);
  }

  // Remember the previously shown clock time per row so the time flaps only
  // animate the digits that actually changed on this render.
  const prevTm = {};
  list.querySelectorAll('li[data-key]').forEach((li) => {
    prevTm[li.dataset.key] = li.dataset.tm;
  });
  // The first render of a board boots up: every time digit spins 0 -> value.
  const boot = !board._booted;
  board._booted = true;

  // Reserve a delay column only as wide as the current view needs: 0 when
  // everything is on time, otherwise sized to the largest delay shown.
  const delays = shown.map((st) =>
    Math.round((new Date(st._when) - new Date(st.place.scheduledDeparture)) / 60000));
  const maxDelay = Math.max(0, ...delays);
  const showDelay = maxDelay > 0;
  list.style.setProperty('--delay-w', showDelay ? `${`+${maxDelay}`.length}ch` : '0px');

  list.innerHTML = '';
  shown.forEach((st, i) => {
    const cancelled = !!(st.cancelled || st.tripCancelled);
    const dep = new Date(st._when);
    const sched = new Date(st.place.scheduledDeparture);
    const mins = Math.max(0, Math.round((dep - now) / 60000));
    const delayMin = delays[i];
    const key = st.tripId || `${st.routeShortName}-${st.place.scheduledDeparture}`;
    const cdText = countdownText(mins);
    const tmText = timeFmt.format(sched);

    const li = document.createElement('li');
    li.dataset.key = key;
    li.dataset.tm = tmText;
    if (cancelled) li.classList.add('cancelled');

    const badge = el('span', `line-badge small mode-${st.mode.toLowerCase()}`,
      shortLine(st));
    const headsign = el('span', 'dep-headsign', st.headsign || '');
    li.append(badge, headsign);
    if (board.showTrack && st.place.track) {
      const tr = el('span', 'dep-track', String(st.place.track));
      tr.title = `spoor ${st.place.track}`;
      tr.setAttribute('aria-label', `spoor ${st.place.track}`);
      li.append(tr);
    }
    const time = el('span', 'dep-time', '');
    const oldTm = key in prevTm ? prevTm[key] : null;
    time.append(clockFlap(tmText, oldTm, boot));
    li.append(time);
    if (showDelay) li.append(el('span', 'dep-delay', !cancelled && delayMin > 0 ? `+${delayMin}` : ''));

    const countdown = el('span', 'dep-countdown', '');
    if (cancelled) {
      countdown.append(document.createTextNode('vervallen'));
    } else {
      if (st.realTime) countdown.append(el('span', 'rt-dot', ''));
      countdown.append(document.createTextNode(cdText));
    }
    li.append(countdown);
    list.append(li);
  });

  // Expand toggle: only when there's more to reveal than the collapsed view.
  if (board.expandable) {
    const toggle = card.querySelector('.board-expand');
    const hasMore = all.length > board.count;
    toggle.hidden = !hasMore;
    toggle.setAttribute('aria-expanded', String(!!board._expanded));
    toggle.querySelector('.expand-label').textContent =
      board._expanded ? 'Minder' : 'Komend uur';
  }
}

// NS product names are long; abbreviate for the badge. Metro/bus keep their
// line number.
function shortLine(st) {
  if (RAIL_MODES.has(st.mode)) {
    const name = (st.routeShortName || st.routeLongName || '').toLowerCase();
    if (name.includes('intercity direct')) return 'ICD';
    if (name.includes('intercity')) return 'IC';
    if (name.includes('sprinter')) return 'SPR';
    return 'NS';
  }
  return st.routeShortName || '?';
}

async function refreshBoards() {
  const results = await Promise.allSettled(BOARDS.map(loadBoard));

  results.forEach((r, i) => {
    const card = $(BOARDS[i].el);
    card.classList.toggle('error', r.status === 'rejected');
    if (r.status === 'rejected') {
      const list = card.querySelector('.departures');
      list.innerHTML = '';
      list.dataset.empty = 'Kon vertrektijden niet laden';
      console.error(r.reason);
    }
  });

  $('boards-updated').textContent = `Bijgewerkt om ${timeFmt.format(new Date())}`;
}

function startAutoRefresh() {
  clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (document.visibilityState === 'visible') refreshActive();
  }, REFRESH_MS);
}

// ============================================================
// Home vs return mode (geolocation)
// Near home -> the three "leaving home" boards. Away -> a "Naar huis" board
// that plans the fastest ways home from wherever you are. A toggle overrides
// the auto-detect for the session.
// ============================================================
const HOME = { lat: 52.305, lon: 4.975 };   // home neighbourhood (no house number)
const HOME_RADIUS_M = 1300;                  // ~15 min walk
const HOME_BOARDS = ['board-metro', 'board-bus', 'board-train'];
let mode = 'home';
let manualMode = null;     // set by the toggle; overrides auto-detect this session
let userCoords = null;
let homeBooted = false;

function haversine(a, b) {
  const R = 6371000, rad = (d) => d * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function updateToggleUI() {
  document.querySelectorAll('#mode-toggle .seg').forEach((b) =>
    b.setAttribute('aria-selected', String(b.dataset.mode === mode)));
}

function applyMode(m) {
  mode = m;
  const home = m === 'home';
  HOME_BOARDS.forEach((id) => { $(id).hidden = !home; });
  $('board-home').hidden = home;
  updateToggleUI();
  if (home) refreshBoards(); else loadReturnBoard();
}

function refreshActive() {
  if (mode === 'return') loadReturnBoard(); else refreshBoards();
}

// Last-known location, so the app works on load without waiting on a prompt.
function loadCachedCoords() {
  try {
    const c = JSON.parse(localStorage.getItem('bcp-coords'));
    if (c && typeof c.lat === 'number') userCoords = { lat: c.lat, lon: c.lon };
  } catch { /* ignore */ }
}

// Rough, permission-free location from the visitor's IP. City-level only
// (can be well off on mobile), so it never prompts — we just use it to pick
// home vs return and to roughly centre the plane map.
const ROUGH_RADIUS_M = 15_000;   // ~greater Amsterdam: within -> home, else -> return

async function fetchRoughLocation() {
  try {
    const res = await fetch('https://get.geojs.io/v1/ip/geo.json');
    const d = await res.json();
    const lat = parseFloat(d.latitude), lon = parseFloat(d.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lon)) {
      userCoords = { lat, lon };
      try { localStorage.setItem('bcp-coords', JSON.stringify({ ...userCoords, t: Date.now() })); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

const decideMode = () =>
  (userCoords && haversine(userCoords, HOME) > ROUGH_RADIUS_M) ? 'return' : 'home';

// No GPS prompt: apply the cached decision now, then refine from the IP lookup.
function locateAndSetMode() {
  if (manualMode) { applyMode(manualMode); return; }
  applyMode(decideMode());
  fetchRoughLocation().then(() => {
    if (!manualMode && decideMode() !== mode) applyMode(decideMode());
    if (activeTab === 'lucht') { recenterPlaneMap(); loadPlanes(); }
  });
}

async function loadReturnBoard() {
  const card = $('board-home');
  const list = card.querySelector('.departures');
  if (!userCoords) {                 // no rough location yet; fetch it, then re-enter
    list.innerHTML = ''; list.dataset.empty = 'Locatie bepalen…';
    fetchRoughLocation().then(() => { if (userCoords && mode === 'return') loadReturnBoard(); });
    return;
  }
  try {
    const url = `${API}/plan?fromPlace=${userCoords.lat},${userCoords.lon}`
      + `&toPlace=${HOME.lat},${HOME.lon}`
      + `&time=${encodeURIComponent(new Date().toISOString())}&numItineraries=6`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`plan ${res.status}`);
    const data = await res.json();
    renderReturnBoard(data.itineraries || []);
    card.classList.remove('error');
    $('boards-updated').textContent = `Bijgewerkt om ${timeFmt.format(new Date())}`;
  } catch (err) {
    console.error(err);
    list.innerHTML = ''; list.dataset.empty = 'Kon routes naar huis niet laden';
  }
}

function renderReturnBoard(itineraries) {
  const card = $('board-home');
  const list = card.querySelector('.departures');
  const now = Date.now();
  const trips = itineraries
    .map((it) => ({ it, transit: it.legs.filter((l) => l.mode !== 'WALK') }))
    .filter((t) => t.transit.length > 0)
    .slice(0, 3);

  const boot = !homeBooted; homeBooted = true;

  if (trips.length) {
    const board0 = trips[0].transit[0];
    $('home-sub').textContent = `vanaf ${cleanStop(board0.from?.name || 'je locatie')}`;
  }

  list.innerHTML = '';
  trips.forEach(({ transit }) => {
    const first = transit[0];
    const last = transit[transit.length - 1];
    const dep = new Date(first.startTime);
    const mins = Math.max(0, Math.round((dep - now) / 60000));
    const li = document.createElement('li');

    transit.forEach((leg, i) => {
      if (i > 0) li.append(el('span', 'leg-sep', '›'));
      li.append(el('span', `line-badge small mode-${leg.mode.toLowerCase()}`, shortLine(leg)));
    });
    li.append(el('span', 'dep-headsign', cleanStop(last.to?.name) || 'naar huis'));

    const time = el('span', 'dep-time', '');
    time.append(clockFlap(timeFmt.format(dep), null, boot));
    li.append(time);

    const cd = el('span', 'dep-countdown', '');
    if (first.realTime) cd.append(el('span', 'rt-dot', ''));
    cd.append(document.createTextNode(countdownText(mins)));
    li.append(cd);

    list.append(li);
  });
  if (!trips.length) { list.dataset.empty = 'Geen route naar huis gevonden'; }
}

// ============================================================
// Planes overhead — "In de lucht" tab
// airplanes.live for nearby aircraft, adsbdb to resolve callsign -> route.
// Both are keyless and CORS-open. Used so we can look up a plane we hear.
// ============================================================
const PLANES_POINT = 'https://api.airplanes.live/v2/point';   // /{lat}/{lon}/{nm}
const ROUTE_API = 'https://api.adsbdb.com/v0/callsign';
const PLANES_RADIUS_NM = 22;        // ~40 km
const PLANES_REFRESH_MS = 15_000;
const routeCache = new Map();       // callsign -> {from,to} | null (null = no known route)
let planesTimer = null;
let activeTab = 'reizen';
let lastPlanes = [];
let planeView = 'kaart';
let selectedPlane = null;
let ghostMode = 'search';   // persistent ghost board: 'search' (Reizen) | 'planes' (selected flight)
let planeMap = null, planeLayer = null, youMarker = null, rangeRing = null, leafletLoading = null;

function switchTab(tab) {
  activeTab = tab;
  document.body.classList.toggle('lucht', tab === 'lucht');   // full-height map layout
  $('tab-reizen').hidden = tab !== 'reizen';
  $('tab-lucht').hidden = tab !== 'lucht';
  $('tab-uitjes').hidden = tab !== 'uitjes';
  document.querySelectorAll('#tabbar .tab').forEach((b) =>
    b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
  const machine = document.querySelector('.machine');
  if (tab === 'lucht') {
    machine.classList.add('planes');   // bottom flap rows now show the selected flight
    ghostMode = 'planes';
    showPlaneInfo(selectedPlane);
    loadPlanes();
    setPlaneView(planeView);           // defaults to the map
    startPlanesRefresh();
    return;
  }
  machine.classList.remove('planes');
  stopPlanesRefresh();
  if (tab === 'uitjes') {
    ghostMode = 'uitjes';        // flap board cycles the event short names
    showUitjesSuggestions();
    loadFamily();
  } else {
    ghostMode = 'search';
    showGhost();
  }
}

function startPlanesRefresh() {
  clearInterval(planesTimer);
  planesTimer = setInterval(() => {
    if (document.visibilityState === 'visible' && activeTab === 'lucht') loadPlanes();
  }, PLANES_REFRESH_MS);
}
function stopPlanesRefresh() { clearInterval(planesTimer); }

const callsignOf = (a) => (a.flight || '').trim();
const airlineTag = (s) => (s.match(/^[A-Z]{2,3}/) || [s.slice(0, 3)])[0];
const fmtAlt = (ft) => `${Math.round(ft).toLocaleString('nl-NL')} ft`;
const fmtKm = (nm) => `${(nm * 1.852).toFixed(1).replace('.', ',')} km`;
function altTrend(a) {
  const r = a.baro_rate ?? a.geom_rate ?? 0;
  return r > 128 ? '↑' : r < -128 ? '↓' : '';
}

async function loadPlanes() {
  const card = $('board-planes');
  const list = card.querySelector('.departures');
  const c = userCoords || HOME;
  $('planes-sub').textContent =
    `${userCoords ? 'om je heen' : 'boven Zuidoost'} · dichtstbij eerst`;
  try {
    const res = await fetch(`${PLANES_POINT}/${c.lat}/${c.lon}/${PLANES_RADIUS_NM}`);
    if (!res.ok) throw new Error(`planes ${res.status}`);
    const data = await res.json();
    const ac = (data.ac || [])
      .filter((a) => typeof a.alt_baro === 'number' && a.lat != null && a.lon != null)
      .filter((a) => !(a.category || '').startsWith('C'))   // drop surface vehicles
      .sort((x, y) => (x.dst ?? 1e3) - (y.dst ?? 1e3))
      .slice(0, 8);
    lastPlanes = ac;
    renderPlanes(ac);
    if (planeView === 'kaart') { renderPlaneMarkers(ac); syncSelection(ac); }
    card.classList.remove('error');
    ac.forEach((a, i) => setTimeout(() => resolveRoute(a), i * 120));  // stagger route lookups
  } catch (err) {
    console.error(err);
    list.innerHTML = ''; list.dataset.empty = 'Kon vliegtuigen niet laden';
  }
}

function renderPlanes(ac) {
  const list = $('board-planes').querySelector('.departures');
  list.innerHTML = '';
  ac.forEach((a) => {
    const cs = callsignOf(a);
    const label = cs || a.r || a.hex || '?';
    const li = document.createElement('li');
    li.dataset.cs = cs;
    li.dataset.hex = a.hex;
    // The list never "selects" (the flap board stays blank here); the FR24 chip
    // is the only action.

    li.append(el('span', 'plane-badge', airlineTag(label)));

    const info = el('div', 'plane-info', '');
    const cached = cs && routeCache.get(cs);
    const routeText = cached ? `${cached.from} → ${cached.to}` : (a.desc || a.t || label);
    info.append(el('div', 'plane-route', routeText));
    info.append(el('div', 'plane-meta',
      [KIND_LABEL[planeKind(a)], label, a.t, `${fmtAlt(a.alt_baro)}${altTrend(a) ? ` ${altTrend(a)}` : ''}`, fmtKm(a.dst ?? 0)]
        .filter(Boolean).join(' · ')));
    li.append(info);

    const link = el('a', 'fr24-link', 'FR24 ›');
    link.href = fr24Url(a);
    link.target = '_blank';
    link.rel = 'noopener';
    li.append(link);

    list.append(li);
  });
}

async function resolveRoute(a) {
  const cs = callsignOf(a);
  if (!cs) return;
  let route = routeCache.get(cs);
  if (route === undefined) {
    try {
      const res = await fetch(`${ROUTE_API}/${encodeURIComponent(cs)}`);
      if (res.status === 404) { route = null; routeCache.set(cs, null); }
      else if (res.ok) {
        const fr = (await res.json()).response?.flightroute;
        route = fr ? { from: cityOf(fr.origin), to: cityOf(fr.destination) } : null;
        routeCache.set(cs, route);
      } else { return; }   // transient (429/5xx): leave uncached, retry next refresh
    } catch { return; }
  }
  if (route) {
    applyRoute(cs, route);
    if (ghostMode === 'planes' && selectedPlane && callsignOf(selectedPlane) === cs) showPlaneInfo(selectedPlane);
  }
}

const cityOf = (ap) => (ap ? (ap.municipality || ap.iata_code || ap.name || '') : '');

function applyRoute(cs, route) {
  document.querySelectorAll('#board-planes .departures li').forEach((li) => {
    if (li.dataset.cs === cs) {
      const r = li.querySelector('.plane-route');
      if (r) r.textContent = `${route.from} → ${route.to}`;
    }
  });
}

// ---- Plane radar map (Leaflet + CARTO dark tiles, lazy-loaded) ----------
const fr24Url = (a) => {
  const cs = callsignOf(a);
  return cs
    ? `https://www.flightradar24.com/${encodeURIComponent(cs)}`
    : `https://www.flightradar24.com/data/aircraft/${encodeURIComponent(a.r || '')}`;
};
// Top-view glyphs per aircraft kind (pointing north; rotated to the track).
const GA_ICON = '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="11.5" rx="2.5" ry="7.8"/><rect x="3" y="8.6" width="18" height="2.8" rx="1.4"/><rect x="8.6" y="17.4" width="6.8" height="2" rx="1"/><ellipse cx="12" cy="3.2" rx="2.6" ry="0.8"/></svg>';
const PLANE_ICONS = {
  jet: '<svg viewBox="0 0 24 24"><path d="M12 1.8 C12.7 1.8 13.1 3.2 13.2 5.4 L13.3 9.2 L22 13.6 L22 15.2 L13.3 13 L13.4 18 L16.3 20 L16.3 21.2 L12 19.9 L7.7 21.2 L7.7 20 L10.6 18 L10.7 13 L2 15.2 L2 13.6 L10.7 9.2 L10.8 5.4 C10.9 3.2 11.3 1.8 12 1.8 Z"/></svg>',
  ga: GA_ICON,
  glider: '<svg viewBox="0 0 24 24"><path d="M12 3 L12.5 9.5 L23 10.3 L23 11.2 L12.5 10.9 L12.4 18 L14 20 L14 21 L12 20.3 L10 21 L10 20 L11.6 18 L11.5 10.9 L1 11.2 L1 10.3 L11.5 9.5 Z"/></svg>',
  heli: '<svg viewBox="0 0 24 24"><rect x="3" y="9.3" width="18" height="1.4" rx="0.7"/><ellipse cx="12" cy="11.8" rx="2.6" ry="3.8"/><rect x="11.2" y="14.5" width="1.6" height="6" rx="0.6"/><rect x="9.6" y="19.6" width="4.8" height="1.3" rx="0.6"/></svg>',
  misc: GA_ICON,
};

// ADS-B emitter category -> our buckets. (C* = surface vehicles, filtered out.)
function planeKind(a) {
  const c = a.category || '';
  if (c === 'A7') return 'heli';
  if (c === 'B1') return 'glider';
  if (c === 'A3' || c === 'A4' || c === 'A5' || c === 'A6') return 'jet';
  if (c === 'A1' || c === 'A2') return 'ga';
  return 'misc';   // A0/unknown, B2-B7 (balloon, parachutist, ultralight, UAV)
}

const KIND_LABEL = { jet: '', ga: 'Klein', heli: 'Heli', glider: 'Zweef', misc: 'Overig' };

// Pull Leaflet from the CDN only when the map is first opened.
function ensureLeaflet() {
  if (window.L) return Promise.resolve();
  if (leafletLoading) return leafletLoading;
  leafletLoading = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css';
    document.head.append(css);
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js';
    s.onload = resolve;
    s.onerror = reject;
    document.head.append(s);
  });
  return leafletLoading;
}

function setPlaneView(v) {
  planeView = v;
  $('plane-list').hidden = v !== 'lijst';
  $('plane-map').hidden = v !== 'kaart';
  document.querySelectorAll('#plane-view-toggle .seg').forEach((b) =>
    b.setAttribute('aria-selected', String(b.dataset.view === v)));
  if (v === 'kaart') {
    showPlaneMap();
  } else {                              // list never selects -> blank flap board
    selectedPlane = null;
    showPlaneInfo(null);
    updateFr24(null);
  }
}

async function showPlaneMap() {
  const host = $('plane-map');
  try {
    await ensureLeaflet();
  } catch {
    host.textContent = 'Kaart kon niet laden';
    return;
  }
  const c = userCoords || HOME;
  if (!planeMap) {
    planeMap = L.map(host, { zoomControl: true, attributionControl: true }).setView([c.lat, c.lon], 11);
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      subdomains: 'abcd', maxZoom: 18,
      attribution: '&copy; OpenStreetMap &copy; CARTO',
    }).addTo(planeMap);
    rangeRing = L.layerGroup([     // radar range rings: 1 / 5 / 10 km, centred on you/home
      L.circle([c.lat, c.lon], { radius: 10000, color: '#2bbcbc', weight: 1, opacity: 0.28, fill: false }),
      L.circle([c.lat, c.lon], { radius: 5000, color: '#2bbcbc', weight: 1, opacity: 0.35, fill: false }),
      L.circle([c.lat, c.lon], { radius: 1000, color: '#2bbcbc', weight: 1.5, opacity: 0.6, fillColor: '#2bbcbc', fillOpacity: 0.06 }),
    ]).addTo(planeMap);
    planeLayer = L.layerGroup().addTo(planeMap);
    youMarker = L.circleMarker([c.lat, c.lon], {
      radius: 5, color: '#2bbcbc', weight: 2, fillColor: '#2bbcbc', fillOpacity: 0.9,
    }).addTo(planeMap);
  } else {
    recenterPlaneMap();
  }
  setTimeout(() => {     // the map was hidden until now; size it, then frame the rings
    planeMap.invalidateSize();
    planeMap.fitBounds(L.latLng(c.lat, c.lon).toBounds(26000), { padding: [6, 6] });
  }, 0);
  renderPlaneMarkers(lastPlanes);
  if (!selectedPlane) autoSelectClosestLow();       // default to the closest low flyer
}

// Keep the rings + you-dot on the current location (or home), e.g. after the
// IP lookup resolves.
function recenterPlaneMap() {
  if (!planeMap) return;
  const c = userCoords || HOME;
  youMarker.setLatLng([c.lat, c.lon]);
  rangeRing.eachLayer((l) => l.setLatLng([c.lat, c.lon]));
}

function renderPlaneMarkers(ac) {
  if (!planeLayer) return;
  planeLayer.clearLayers();
  ac.forEach((a) => {
    if (a.lat == null || a.lon == null) return;
    const sel = selectedPlane && a.hex === selectedPlane.hex;
    const low = a.alt_baro < 10000;                 // the ones we care about most: bigger, opaque
    const scale = sel ? 1.3 : (low ? 1 : 0.62);
    const opacity = sel ? 1 : (low ? 1 : 0.5);
    const kind = planeKind(a);
    const rot = Math.round(a.track || 0);
    const icon = L.divIcon({
      className: 'plane-marker',
      html: `<div class="pm${sel ? ' sel' : ''}" `
        + `style="transform:rotate(${rot}deg) scale(${scale});opacity:${opacity}">`
        + `${PLANE_ICONS[kind]}</div>`,
      iconSize: [26, 26], iconAnchor: [13, 13],
    });
    const m = L.marker([a.lat, a.lon], { icon }).addTo(planeLayer).on('click', () => selectPlane(a));
    if (sel) m.setZIndexOffset(1000);
  });
}

// ---- Selected flight on the machine's bottom flap rows ------------------
const fmtAltShort = (ft) => `${Math.round(ft)}FT`;

// City for the flap board: Amsterdam -> AMS, strip parentheticals/slashes.
const flapCity = (name) =>
  /amsterdam/i.test(name) ? 'AMS' : (name || '').split('(')[0].split('/')[0].trim();

// "FROM-TO" trimmed to fit one 12-cell row.
function planeRouteLine(plane) {
  const r = routeCache.get(callsignOf(plane));
  if (!r) return '';
  let from = flapCity(r.from).toUpperCase();
  let to = flapCity(r.to).toUpperCase();
  let s = `${from}-${to}`;
  if (s.length > GHOST_COLS) {
    const over = s.length - GHOST_COLS;
    if (from.length >= to.length) from = from.slice(0, Math.max(3, from.length - over));
    else to = to.slice(0, Math.max(3, to.length - over));
    s = `${from}-${to}`.slice(0, GHOST_COLS);
  }
  return s;
}

// Repurpose the machine's bottom three flap rows to show the selected flight.
function showPlaneInfo(plane) {
  ensureGhost();
  ghost.classList.remove('hidden');
  clearInterval(ghostTimer);
  ghostBoard.forEach(stopRow);
  if (!plane) {                          // nothing selected -> blank rows
    spinRows([[ghostBoard[0], ''], [ghostBoard[1], ''], [ghostBoard[2], '']]);
    return;
  }
  const cs = callsignOf(plane) || plane.r || '';
  const route = planeRouteLine(plane) || plane.desc || plane.t || '';
  const typeAlt = [plane.t, fmtAltShort(plane.alt_baro)].filter(Boolean).join(' ');
  spinRows([[ghostBoard[0], cs], [ghostBoard[1], route], [ghostBoard[2], typeAlt]]);
}

function selectPlane(a) {
  selectedPlane = a;
  showPlaneInfo(a);
  updateFr24(a);
  if (planeView === 'kaart') renderPlaneMarkers(lastPlanes);   // re-highlight
  document.querySelectorAll('#plane-list li').forEach((li) =>
    li.classList.toggle('selected', li.dataset.hex === a.hex));
}

// Visible Flightradar24 link for the selected flight (real browser, new tab).
function updateFr24(plane) {
  const link = $('fr24-link');
  if (!link) return;
  if (plane) {
    link.href = fr24Url(plane);
    link.textContent = `${callsignOf(plane) || plane.r || 'Vlucht'} op Flightradar24 ›`;
    link.hidden = false;
  } else {
    link.hidden = true;
  }
}

// lastPlanes is sorted by distance, so the first low flyer is the closest one.
function autoSelectClosestLow() {
  const pick = lastPlanes.find((a) => a.alt_baro < 10000) || lastPlanes[0];
  if (pick) selectPlane(pick);
}

// On the map: keep the user's pick fresh, re-pick if it left, else default-select.
function syncSelection(ac) {
  if (selectedPlane) {
    const upd = ac.find((a) => a.hex === selectedPlane.hex);
    if (upd) { selectedPlane = upd; showPlaneInfo(upd); return; }
    selectedPlane = null;
  }
  autoSelectClosestLow();
}

function refreshCurrent() { if (activeTab === 'lucht') loadPlanes(); else refreshActive(); }

// ============================================================
// Uitjes — family outings (family-fun.json, refreshed by an agent)
// ============================================================
let familyData = null;

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const dateShortNL = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short' });
const fmtShort = (iso) => dateShortNL.format(new Date(iso)).replace('.', '');
const DAY_NL = { Mon: 'Ma', Tue: 'Di', Wed: 'Wo', Thu: 'Do', Fri: 'Vr', Sat: 'Za', Sun: 'Zo' };
const dayLabelNL = (s) => (s || '').replace(/Mon|Tue|Wed|Thu|Fri|Sat|Sun/g, (m) => DAY_NL[m]);
const itemStart = (it) => it.start || (it.days && it.days[0]);
const itemEnd = (it) => it.end || (it.days && it.days[it.days.length - 1]) || it.start;
const cleanLoc = (s) => (s || '').replace(/Amsterdam /g, '').trim();

async function loadFamily() {
  if (familyData) { renderFamily(); return; }
  const root = $('uitjes-content');
  try {
    const res = await fetch('family-fun.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error(`family ${res.status}`);
    familyData = await res.json();
    renderFamily();
    if (activeTab === 'uitjes') showUitjesSuggestions();   // cycle the loaded short names
  } catch (err) {
    console.error(err);
    root.innerHTML = '';
    root.append(el('p', 'uitjes-foot', 'Kon uitjes niet laden'));
  }
}

function relWeekLabel(w) {
  const today = startOfToday();
  if (today >= new Date(w.start) && today <= new Date(w.end)) return 'Deze week';
  const days = Math.round((new Date(w.start) - today) / 86_400_000);
  return days > 0 && days <= 7 ? 'Volgende week' : null;
}
const weekRange = (w) => `${fmtShort(w.start)} – ${fmtShort(w.end)}`;

function priceChip(it) {
  if (it.free === true) return { text: 'gratis', cls: 'free' };
  if (it.price) {
    const euros = it.price.match(/€\s?\d+/g);
    return { text: euros ? euros.join(' / ') : 'betaald', cls: 'paid' };
  }
  if (it.free === false) return { text: 'betaald', cls: 'paid' };
  return null;
}

// Same nav-cursor glyph + styling as the departure-board maps links.
function mapsLinkFor(location) {
  const a = el('a', 'maps-link', '');
  a.href = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(location || '')}`;
  a.target = '_blank';
  a.rel = 'noopener';
  a.setAttribute('aria-label', 'Op Google Maps');
  a.title = 'Op Google Maps';
  a.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 L20 21 L12 16 L4 21 Z" fill="currentColor"/></svg>';
  a.addEventListener('click', (e) => e.stopPropagation());
  return a;
}

function familyCard(it, isRadar) {
  const local = it.local === true || (it.themes || []).includes('local');
  const card = el('div', `uitjes-card${local ? ' local' : ''}${isRadar ? ' radar' : ''}`, '');
  card.append(el('span', 'uitjes-emoji', it.emoji || '📍'));

  const body = el('div', 'uitjes-body', '');
  body.append(el('div', 'uitjes-name', it.name || ''));
  const when = isRadar ? (it.date_label || '') : dayLabelNL(it.day_label || '');
  body.append(el('div', 'uitjes-meta', [when, cleanLoc(it.location)].filter(Boolean).join(' · ')));
  if (it.note) body.append(el('div', 'uitjes-note', it.note));
  card.append(body);

  const right = el('div', 'uitjes-right', '');
  const chip = priceChip(it);
  if (chip) right.append(el('span', `uitjes-price ${chip.cls}`, chip.text));
  const actions = el('div', 'uitjes-actions', '');
  if (it.url) actions.append(siteLinkFor(it.url));   // opens the site in the real browser
  actions.append(mapsLinkFor(it.location));
  right.append(actions);
  card.append(right);

  // Tapping the card plans a route there (like a Reizen quick-pick).
  card.addEventListener('click', () => planUitje(it));
  return card;
}

// Plan a route to this outing on the Reizen tab, using its short name.
function planUitje(it) {
  const label = (it.short && it.short.join(' ').trim()) || it.name;
  switchTab('reizen');
  selectQuick({ label, address: it.location || it.name });
}

// External-link icon (real browser, new tab) — same teal styling as maps links.
function siteLinkFor(url) {
  const a = el('a', 'maps-link', '');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  a.setAttribute('aria-label', 'Open website');
  a.title = 'Open website';
  a.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" '
    + 'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
    + '<path d="M14 4h6v6"/><path d="M20 4 L10 14"/>'
    + '<path d="M18 13v5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h5"/></svg>';
  a.addEventListener('click', (e) => e.stopPropagation());
  return a;
}

// Event short names (2-line) for the flap-board suggestions, deduped.
function familyEntries() {
  if (!familyData) return [];
  const seen = new Set();
  const out = [];
  const add = (it) => {
    if (!it.short) return;
    const key = it.short.join('|');
    if (seen.has(key)) return;
    seen.add(key);
    out.push([it.short[0] || '', `${it.short[1] || ''}?`]);
  };
  (familyData.weeks || []).forEach((w) => (w.items || []).forEach(add));
  (familyData.radar || []).forEach(add);
  return out;
}

function showUitjesSuggestions() {
  const entries = familyEntries();
  cycleGhost(entries.length ? entries : destEntries());
}

function familySection(title, range, items, isRadar) {
  const sec = el('section', 'uitjes-week', '');
  const head = el('div', 'uitjes-week-head', '');
  head.append(el('h3', '', title));
  if (range) head.append(el('span', 'uitjes-week-range', range));
  sec.append(head);
  items.forEach((it) => sec.append(familyCard(it, isRadar)));
  return sec;
}

function renderFamily() {
  const root = $('uitjes-content');
  root.innerHTML = '';
  if (!familyData) return;
  const today = startOfToday();

  (familyData.weeks || [])
    .filter((w) => new Date(w.end) >= today)
    .forEach((w) => {
      const items = (w.items || [])
        .filter((it) => new Date(itemEnd(it)) >= today)
        .sort((a, b) => new Date(itemStart(a)) - new Date(itemStart(b)));
      if (!items.length) return;
      const rel = relWeekLabel(w);
      root.append(familySection(rel || weekRange(w), rel ? weekRange(w) : '', items, false));
    });

  const radar = (familyData.radar || []).filter((it) => new Date(itemEnd(it)) >= today);
  if (radar.length) root.append(familySection('Op de radar', 'later deze zomer', radar, true));

  if (familyData.generated) root.append(el('p', 'uitjes-foot', `Bijgewerkt ${fmtShort(familyData.generated)}`));
}

// ============================================================
// Autocomplete
// ============================================================
const input = $('dest-input');
const sugList = $('suggestions');
let debounceTimer = null;
let geocodeAbort = null;

input.addEventListener('input', () => {
  if (input.value.length > 0) hideGhost();
  clearTimeout(debounceTimer);
  const q = input.value.trim();
  if (q.length < 2) {
    hideSuggestions();
    showIdle();
    return;
  }
  hideIdle();
  debounceTimer = setTimeout(() => autocomplete(q), 280);
});

input.addEventListener('focus', () => {
  if (activeTab !== 'reizen') switchTab('reizen');   // searching is a travel action
  hideGhost();
  if (input.value.trim().length < 2) showIdle();
});

// On the planes tab the flap area shows the selected flight; tapping it follows in FR24.
document.querySelector('.search-wrap').addEventListener('click', () => {
  if (activeTab === 'lucht' && selectedPlane) window.open(fr24Url(selectedPlane), '_blank', 'noopener');
});

input.addEventListener('blur', () => {
  if (input.value.trim().length === 0) showGhost();
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-wrap')) hideSuggestions();
});

// ---- Shared split-flap character row -----------------------------------
// A row of flap cells that spin forward through the drum to spell a string.
// Used by the search placeholder (cycling) and the results title.
const DRUM = " ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789&-?!:'.";
const FLAP_STEP_MS = 34;

function makeCell(extra) {
  const node = el('span', `fcell${extra ? ` ${extra}` : ''}`, '');
  const bottom = el('span', 'cf cf-bottom', '');
  const top = el('span', 'cf cf-top', '');
  node.append(bottom, top);
  return { node, bottom, top, cur: ' ', timer: null, start: null };
}

function makeFlapRow(cols, cls) {
  const row = el('span', `flaprow${cls ? ` ${cls}` : ''}`, '');
  const cells = [];
  for (let i = 0; i < cols; i++) {
    const c = makeCell();
    row.append(c.node);
    cells.push(c);
  }
  return { row, cells };
}

function setCellGlyph(cell, ch) {
  const g = ch === ' ' ? '' : ch;
  cell.bottom.textContent = g;
  cell.top.textContent = g;
}

// Spin one cell forward through the drum from its current glyph to `target`.
function spinCellTo(cell, target) {
  const tgt = Math.max(0, DRUM.indexOf(target));
  clearInterval(cell.timer);
  if (Math.max(0, DRUM.indexOf(cell.cur)) === tgt) return;
  cell.timer = setInterval(() => {
    let ci = Math.max(0, DRUM.indexOf(cell.cur));
    const old = DRUM[ci];
    ci = (ci + 1) % DRUM.length;
    cell.cur = DRUM[ci];
    setCellGlyph(cell, cell.cur);
    cell.node.querySelectorAll('.cf-fall').forEach((f) => f.remove());
    const fall = el('span', 'cf cf-fall', old === ' ' ? '' : old);
    cell.node.append(fall);
    fall.addEventListener('animationend', () => fall.remove());
    if (ci === tgt) clearInterval(cell.timer);
  }, FLAP_STEP_MS);
}

// Flip boards have no accented flaps, so fold diacritics away (ë -> E).
function boardText(s) {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
}

// Real flip-boards don't flip everything at once: stagger characters left to
// right, and rows top to bottom (row offset independent of how many chars the
// previous row had).
const CHAR_STAGGER_MS = 1000 / 24;
const ROW_STAGGER_MS = 200;

function spinRowTo(flap, str, baseDelay = 0) {
  const s = boardText(str).slice(0, flap.cells.length);
  flap.cells.forEach((cell, i) => {
    clearTimeout(cell.start);
    const target = s[i] || ' ';
    cell.start = setTimeout(() => spinCellTo(cell, target), baseDelay + i * CHAR_STAGGER_MS);
  });
}

// Spin a set of rows (top to bottom) with the row-stagger between their starts.
// `baseRow` offsets the wave so the search rows can continue on from the two
// logo rows above them (rows 2-4 of the one 5-row machine).
function spinRows(pairs, baseRow = 0) {
  pairs.forEach(([flap, text], ri) => spinRowTo(flap, text, (baseRow + ri) * ROW_STAGGER_MS));
}

function stopRow(flap) {
  flap.cells.forEach((c) => { clearTimeout(c.start); clearInterval(c.timer); });
}

// Lay a string across `rows` board lines of `cols`, breaking at spaces and
// (failing that) after a hyphen, like text wrapping on a real flip-board.
function wrapToBoard(text, cols, rows) {
  // Break opportunities: between words (with a space) and after a hyphen
  // (without a space), like real text wrapping.
  const segs = [];
  boardText(text).split(/\s+/).forEach((word, wi) => {
    (word.match(/[^-]*-|[^-]+/g) || [word]).forEach((piece, pi) => {
      segs.push({ text: piece, space: pi === 0 && wi > 0 });
    });
  });
  const lines = [];
  let cur = '';
  for (const seg of segs) {
    let piece = seg.text;
    const sep = cur && seg.space ? ' ' : '';
    if ((cur + sep + piece).length <= cols) {
      cur += sep + piece;
    } else {
      if (cur) { lines.push(cur); cur = ''; }
      while (piece.length > cols) { lines.push(piece.slice(0, cols)); piece = piece.slice(cols); }
      cur = piece;
    }
  }
  if (cur) lines.push(cur);
  return Array.from({ length: rows }, (_, i) => (lines[i] || '').slice(0, cols));
}

// ---- Search board: "Where to?" on top, destinations below --------------
// Three rows: row 0 is a fixed "Where to?" header; rows 1-2 hold the chosen
// destination, or scroll through the suggestions when idle.
const ghost = $('ghost');
const GHOST_COLS = 12;
const HEADERS = ['Where to?', 'Waarheen?', 'Bestemming:', 'Op reis naar', 'Destination:'];
const DESTINATIONS = QUICK_DESTINATIONS.map((d) => d.label);
let ghostBoard = null;
let ghostTimer = null;
let ghostIdx = 0;
let currentDest = null;

function ensureGhost() {
  if (ghostBoard) return;
  ghostBoard = Array.from({ length: 3 },
    () => makeFlapRow(GHOST_COLS, 'flaprow-display'));
  ghostBoard.forEach((row) => ghost.append(row.row));
}

const randomHeader = () => HEADERS[Math.floor(Math.random() * HEADERS.length)];

// Cycle a list of 2-line entries through the board (rotating header on top).
function cycleGhost(entries, baseRow = 0) {
  ensureGhost();
  ghost.classList.remove('hidden');
  clearInterval(ghostTimer);
  ghostBoard.forEach(stopRow);
  if (!entries.length) return;
  ghostIdx = 0;
  spinRows([[ghostBoard[0], HEADERS[0]], [ghostBoard[1], entries[0][0]], [ghostBoard[2], entries[0][1]]], baseRow);
  ghostTimer = setInterval(() => {
    ghostIdx += 1;
    const e = entries[ghostIdx % entries.length];
    const rows = [];
    if (Math.random() < 0.25) rows.push([ghostBoard[0], randomHeader()]);   // header changes occasionally
    rows.push([ghostBoard[1], e[0]], [ghostBoard[2], e[1]]);
    spinRows(rows);
  }, 3600);
}

const destEntries = () => DESTINATIONS.map((d) => wrapToBoard(`${d}?`, GHOST_COLS, 2));

// `baseRow` (2 on first load / reload) continues the logo's top-to-bottom wave.
function showGhost(baseRow = 0) {
  if (currentDest) {
    ensureGhost();
    ghost.classList.remove('hidden');
    clearInterval(ghostTimer);
    ghostBoard.forEach(stopRow);
    const [a, b] = wrapToBoard(currentDest.name, GHOST_COLS, 2);
    spinRows([[ghostBoard[0], 'Op reis naar'], [ghostBoard[1], a], [ghostBoard[2], b]], baseRow);
    return;
  }
  cycleGhost(destEntries(), baseRow);
}

function hideGhost() {
  ghost.classList.add('hidden');
  clearInterval(ghostTimer);
  if (ghostBoard) ghostBoard.forEach(stopRow);
}

// Idle lists = quick-pick favourites + recents (shown when not typing).
function showIdle() {
  $('quick').hidden = false;
  renderRecents();
}

function hideIdle() {
  $('quick').hidden = true;
  $('recents').hidden = true;
}

function renderQuick() {
  const wrap = $('quick-chips');
  wrap.innerHTML = '';
  for (const d of QUICK_DESTINATIONS) {
    const chip = el('button', 'chip quick', d.label);
    chip.addEventListener('click', () => selectQuick(d));
    wrap.append(chip);
  }
}

async function selectQuick(d) {
  hideSuggestions();
  hideIdle();
  input.value = '';
  input.blur();
  currentDest = { name: d.label };   // show on the board right away
  showGhost();
  try {
    const dest = await geocodeAddress(d.address);
    dest.name = d.label;
    currentDest = dest;
    planRoutes(dest);
  } catch (err) {
    console.error(err);
    $('routes').hidden = false;
    $('route-cards').innerHTML = '';
    $('route-cards').append(el('div', 'status error', `Kon ${d.label} niet vinden`));
  }
}

async function geocodeAddress(address) {
  const res = await fetch(
    `${API}/geocode?text=${encodeURIComponent(address)}&language=nl&place=${GEOCODE_BIAS}`);
  const results = await res.json();
  const r = results.find((x) => x.lat && x.lon) || results[0];
  if (!r) throw new Error('geocode failed');
  return { name: r.name, area: areaOf(r), lat: r.lat, lon: r.lon, isStop: r.type === 'STOP' };
}

async function autocomplete(q) {
  geocodeAbort?.abort();
  geocodeAbort = new AbortController();
  let results;
  try {
    const res = await fetch(
      `${API}/geocode?text=${encodeURIComponent(q)}&language=nl&place=${GEOCODE_BIAS}`,
      { signal: geocodeAbort.signal },
    );
    results = await res.json();
  } catch (err) {
    if (err.name !== 'AbortError') console.error(err);
    return;
  }

  const seen = new Set();
  const items = results
    .filter((r) => r.country === 'NL')
    .map((r) => ({
      name: r.name,
      area: areaOf(r),
      lat: r.lat,
      lon: r.lon,
      isStop: r.type === 'STOP',
    }))
    .filter((r) => {
      const key = `${r.name}|${r.area}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 6);

  if (items.length === 0) {
    hideSuggestions();
    return;
  }

  sugList.innerHTML = '';
  for (const item of items) {
    const li = document.createElement('li');
    li.append(
      el('span', 'sug-icon', item.isStop ? '🚏' : '📍'),
      (() => {
        const t = el('div', 'sug-text', '');
        t.append(el('div', 'sug-name', item.name));
        if (item.area) t.append(el('div', 'sug-area', item.area));
        return t;
      })(),
    );
    li.addEventListener('click', () => selectDestination(item));
    sugList.append(li);
  }
  sugList.hidden = false;
  $('recents').hidden = true;
}

function areaOf(r) {
  const def = (r.areas || []).find((a) => a.default) || (r.areas || []).find((a) => a.adminLevel === 8);
  return def ? def.name : '';
}

function hideSuggestions() {
  sugList.hidden = true;
}

// ============================================================
// Recents
// ============================================================
function getRecents() {
  try {
    return JSON.parse(localStorage.getItem('ezov-recents')) || [];
  } catch {
    return [];
  }
}

function saveRecent(dest) {
  const recents = getRecents().filter((r) => !(r.name === dest.name && r.area === dest.area));
  recents.unshift(dest);
  localStorage.setItem('ezov-recents', JSON.stringify(recents.slice(0, MAX_RECENTS)));
}

function renderRecents() {
  const recents = getRecents();
  const box = $('recents');
  if (recents.length === 0) {
    box.hidden = true;
    return;
  }
  const chips = $('recent-chips');
  chips.innerHTML = '';
  for (const r of recents) {
    const chip = el('button', 'chip', r.name);
    chip.addEventListener('click', () => selectDestination(r));
    chips.append(chip);
  }
  box.hidden = false;
}

// ============================================================
// Route planning
// ============================================================
function selectDestination(dest) {
  currentDest = dest;
  input.value = '';
  hideSuggestions();
  hideIdle();
  saveRecent(dest);
  input.blur();
  showGhost();        // board shows the destination below "Where to?"
  planRoutes(dest);
}

async function planRoutes(dest) {
  const section = $('routes');
  const cardsBox = $('route-cards');
  section.hidden = false;
  cardsBox.innerHTML = '';

  const cards = ROUTE_ORIGINS.map((origin) => {
    const card = el('div', 'route-card', '');
    const head = el('div', 'route-card-head', '');
    head.append(modeIcon(origin.iconType), el('h3', '', origin.label));
    head.append(mapsLink(origin, dest));
    card.append(head, el('div', 'skeleton', ''), el('div', 'skeleton', ''));
    cardsBox.append(card);
    return card;
  });

  // Search + results live at the top now; scroll the boards out of sight.
  window.scrollTo({ top: 0, behavior: 'smooth' });

  await Promise.allSettled(ROUTE_ORIGINS.map(async (origin, i) => {
    const card = cards[i];
    try {
      const depart = new Date(Date.now() + origin.offsetMin * 60_000);
      const url = `${API}/plan?fromPlace=${encodeURIComponent(origin.place)}`
        + `&toPlace=${dest.lat},${dest.lon}`
        + `&time=${encodeURIComponent(depart.toISOString())}`
        + `&numItineraries=${ITINERARIES_PER_ROUTE}`;
      const res = await fetch(url);
      if (!res.ok) throw new Error(`plan ${res.status}`);
      const data = await res.json();
      renderItineraries(card, data.itineraries || [], origin, dest);
    } catch (err) {
      console.error(err);
      card.querySelectorAll('.skeleton').forEach((s) => s.remove());
      card.append(el('div', 'status error', 'Route plannen mislukt — probeer opnieuw'));
    }
  }));
}

function renderItineraries(card, itineraries, origin, dest) {
  card.querySelectorAll('.skeleton').forEach((s) => s.remove());

  if (itineraries.length === 0) {
    card.append(el('div', 'status', 'Geen route gevonden'));
    return;
  }

  for (const it of itineraries.slice(0, ITINERARIES_PER_ROUTE)) {
    const box = el('div', 'itinerary', '');

    // --- tappable summary row ---
    const summary = el('button', 'itin-summary', '');
    const times = el('div', 'itin-times', '');
    const start = new Date(it.startTime);
    const end = new Date(it.endTime);
    times.append(el('span', 'itin-range', `${timeFmt.format(start)} – ${timeFmt.format(end)}`));
    const transfers = it.transfers === 0 ? 'direct'
      : it.transfers === 1 ? '1 overstap'
      : `${it.transfers} overstappen`;
    times.append(el('span', 'itin-meta', transfers));
    times.append(el('span', 'itin-duration', formatDuration(it.duration)));
    summary.append(times);

    const legsRow = el('div', 'itin-legs', '');
    const parts = [];
    for (const leg of it.legs) {
      if (leg.mode === 'WALK') {
        const mins = Math.round(leg.duration / 60);
        if (mins >= 2) parts.push(el('span', 'leg-walk', `🚶 ${mins}'`));
        continue;
      }
      parts.push(el('span', `line-badge small mode-${leg.mode.toLowerCase()}`, shortLine(leg)));
    }
    parts.forEach((p, idx) => {
      if (idx > 0) legsRow.append(el('span', 'leg-sep', '›'));
      legsRow.append(p);
    });
    legsRow.append(el('span', 'itin-chevron', '▾'));
    summary.append(legsRow);
    box.append(summary);

    // --- expandable step-by-step detail ---
    const detail = renderItineraryDetail(it, origin, dest);
    box.append(detail);
    summary.addEventListener('click', () => box.classList.toggle('open'));

    card.append(box);
  }
}

function renderItineraryDetail(it, origin, dest) {
  const detail = el('div', 'itin-detail', '');

  for (const leg of it.legs) {
    if (leg.mode === 'WALK') {
      const mins = Math.round(leg.duration / 60);
      if (mins < 1) continue;
      const where = leg.to?.name && !/^end$/i.test(leg.to.name)
        ? ` naar ${cleanStop(leg.to.name)}` : ' naar de bestemming';
      detail.append(el('div', 'leg-walk-detail', `🚶 ${mins} min lopen${where}`));
      continue;
    }

    const row = el('div', 'leg-detail', '');

    const head = el('div', 'leg-detail-head', '');
    head.append(el('span', `line-badge small mode-${leg.mode.toLowerCase()}`, shortLine(leg)));
    head.append(el('span', 'leg-dir', `richting ${leg.headsign || cleanStop(leg.to.name)}`));
    row.append(head);

    row.append(stopLine(leg.from, 'instappen'));

    const stops = leg.intermediateStops?.length || 0;
    const ride = stops > 0
      ? `${stops} ${stops === 1 ? 'halte' : 'haltes'} · ${formatDuration(leg.duration)}`
      : formatDuration(leg.duration);
    row.append(el('div', 'leg-ride', ride));

    row.append(stopLine(leg.to, 'uitstappen'));
    detail.append(row);
  }

  return detail;
}

// Nav-cursor glyph linking the route's origin → destination in Google Maps
// (transit). Lives in the route-card header; the planner already shows the
// concrete itineraries, so this is just a quick hand-off to Maps.
function mapsLink(origin, dest) {
  const a = el('a', 'maps-link', '');
  a.href = 'https://www.google.com/maps/dir/?api=1'
    + `&origin=${encodeURIComponent(origin.coord)}`
    + `&destination=${encodeURIComponent(`${dest.lat},${dest.lon}`)}`
    + '&travelmode=transit';
  a.target = '_blank';
  a.rel = 'noopener';
  a.setAttribute('aria-label', 'Open in Google Maps');
  a.title = 'Open in Google Maps';
  a.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true">'
    + '<path d="M12 3 L20 21 L12 16 L4 21 Z" fill="currentColor"/></svg>';
  return a;
}

function stopLine(place, verb) {
  const row = el('div', 'leg-stop', '');
  row.append(el('span', 'leg-stop-time', timeFmt.format(new Date(place.departure || place.arrival))));
  let txt = `${verb}: ${cleanStop(place.name)}`;
  if (place.track) txt += ` · spoor ${place.track}`;
  row.append(el('span', 'leg-stop-name', txt));
  return row;
}

// Dutch transit names often carry a "Amsterdam, " city prefix; trim the
// redundant local one for readability.
function cleanStop(name) {
  return (name || '').replace(/^Amsterdam,\s*/, '');
}

function formatDuration(seconds) {
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}u ${String(mins % 60).padStart(2, '0')}`;
}

// Countdown label: "nu", "X min", or "Hu MM" once it's an hour or more away
// (keeps the column narrow when the next departure is far off, e.g. at night).
function countdownText(mins) {
  if (mins === 0) return 'nu';
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}u${String(mins % 60).padStart(2, '0')}`;
}

// ============================================================
// Pull to refresh
// ============================================================
let pullStartY = null;

document.addEventListener('touchstart', (e) => {
  if (window.scrollY <= 0) pullStartY = e.touches[0].clientY;
}, { passive: true });

document.addEventListener('touchmove', (e) => {
  if (pullStartY === null) return;
  const dy = e.touches[0].clientY - pullStartY;
  $('pull-indicator').classList.toggle('visible', dy > 70);
}, { passive: true });

document.addEventListener('touchend', async () => {
  if (pullStartY === null) return;
  pullStartY = null;
  const indicator = $('pull-indicator');
  if (indicator.classList.contains('visible')) {
    await refreshCurrent();
    indicator.classList.remove('visible');
  }
});

// ============================================================
// Wiring
// ============================================================
function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

// ---- Clock split-flap (per digit) ---------------------------------------
// Render a "HH:MM" time as little amber flaps. On a board's first render
// (`boot`) every digit spins 0 -> its value; afterwards only changed digits
// flip. The colon is a plain separator.
const CLK_SPIN_MS = 110; // ~1s for a 9 (9 steps)

function clockFlap(newText, oldText, boot) {
  const row = el('span', 'clock-flap', '');
  row.setAttribute('aria-label', newText);
  row.setAttribute('role', 'text');
  const chars = [...newText];
  const oldChars = oldText != null ? [...oldText] : null;
  chars.forEach((ch, i) => {
    if (!/\d/.test(ch)) {                 // colon (or any non-digit) — separator
      row.append(el('span', 'sep', ch));
      return;
    }
    const cell = el('span', 'cell', '');
    cell.setAttribute('aria-hidden', 'true');
    const bottom = el('span', 'cf cf-bottom', ch);
    const top = el('span', 'cf cf-top', ch);
    cell.append(bottom, top);
    if (boot) {
      spinDigit(cell, bottom, top, ch);
    } else if (oldChars && oldChars[i] !== ch && /\d/.test(oldChars[i] || '')) {
      const fall = el('span', 'cf cf-fall', oldChars[i]);
      cell.append(fall);
      fall.addEventListener('animationend', () => fall.remove());
    }
    row.append(cell);
  });
  return row;
}

function spinDigit(cell, bottom, top, targetChar) {
  const target = +targetChar;
  if (target === 0) { bottom.textContent = top.textContent = targetChar; return; }
  let d = 0;
  bottom.textContent = top.textContent = '0';
  const id = setInterval(() => {
    const old = String(d);
    d += 1;
    bottom.textContent = top.textContent = String(d);
    cell.querySelectorAll('.cf-fall').forEach((f) => f.remove());
    const fall = el('span', 'cf cf-fall', old);
    fall.style.animationDuration = '0.1s';
    cell.append(fall);
    fall.addEventListener('animationend', () => fall.remove());
    if (d >= target) clearInterval(id);
  }, CLK_SPIN_MS);
}

// ---- Logo board: BCP (as quarter-flaps) + TRAVEL + live clock -----------
// The machine's top two rows are the logo, built from the same flap cells as
// the search board (one 5x12 raster). Each B/C/P letter is a 2x2 grid of
// quarter cells; on load every quarter cycles the whole alphabet — showing
// that corner of each passing letter — before resolving to its corner of
// B/C/P. TRAVEL fills the rest of the top row; the live clock (white) sits
// right-aligned on the bottom row.
const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
let logoRows = [[], []];        // [row0 cells, row1 cells], 12 each
let clockDigitCells = [];       // the 4 animating HH:MM digit cells, left -> right

function makeQuarterCell(quadrant, target) {
  const cell = makeCell('qcell');
  cell.node.dataset.q = quadrant;        // tl / tr / bl / br
  cell.bottom.append(el('span', 'qbig', ''));
  cell.top.append(el('span', 'qbig', ''));
  cell.kind = 'q';
  cell.target = target;
  return cell;
}

function setQGlyph(cell, ch) {
  const g = ch === ' ' ? '' : ch;
  cell.bottom.firstChild.textContent = g;
  cell.top.firstChild.textContent = g;
}

// One quarter runs a full alphabet loop (start one letter past the target, so
// it shows all 26) and stops on its target corner.
function spinQuarter(cell) {
  clearInterval(cell.timer);
  let idx = (ALPHA.indexOf(cell.target) + 1) % 26;
  cell.cur = ALPHA[idx];
  setQGlyph(cell, cell.cur);
  cell.timer = setInterval(() => {
    const old = cell.cur;
    idx = (idx + 1) % 26;
    cell.cur = ALPHA[idx];
    setQGlyph(cell, cell.cur);
    cell.node.querySelectorAll('.cf-fall').forEach((f) => f.remove());
    const fall = el('span', 'cf cf-fall', '');
    fall.append(el('span', 'qbig', old));
    cell.node.append(fall);
    fall.addEventListener('animationend', () => fall.remove());
    if (cell.cur === cell.target) clearInterval(cell.timer);
  }, FLAP_STEP_MS);
}

// A clock / boot digit flap: always rolls forward, wrapping 9 -> 0.
function spinDigitCell(cell, fromChar, toChar) {
  clearInterval(cell.timer);
  let idx = Math.max(0, DIGITS.indexOf(fromChar));
  const tgt = Math.max(0, DIGITS.indexOf(toChar));
  cell.cur = DIGITS[idx];
  setCellGlyph(cell, cell.cur);
  if (idx === tgt) return;
  cell.timer = setInterval(() => {
    const old = cell.cur;
    idx = (idx + 1) % 10;
    cell.cur = DIGITS[idx];
    setCellGlyph(cell, cell.cur);
    cell.node.querySelectorAll('.cf-fall').forEach((f) => f.remove());
    const fall = el('span', 'cf cf-fall', old);
    cell.node.append(fall);
    fall.addEventListener('animationend', () => fall.remove());
    if (idx === tgt) clearInterval(cell.timer);
  }, FLAP_STEP_MS);
}

// The colon boots like a digit: flips 0..9 forward, then settles on ":".
const COLON_DRUM = '0123456789:';
function spinColonCell(cell) {
  clearInterval(cell.timer);
  let idx = 0;
  cell.cur = COLON_DRUM[0];
  setCellGlyph(cell, cell.cur);
  cell.timer = setInterval(() => {
    const old = cell.cur;
    idx += 1;
    cell.cur = COLON_DRUM[idx];
    setCellGlyph(cell, cell.cur);
    cell.node.querySelectorAll('.cf-fall').forEach((f) => f.remove());
    const fall = el('span', 'cf cf-fall', old);
    cell.node.append(fall);
    fall.addEventListener('animationend', () => fall.remove());
    if (idx >= COLON_DRUM.length - 1) clearInterval(cell.timer);
  }, FLAP_STEP_MS);
}

const clockDigits = () => {
  const t = timeFmt.format(new Date());   // "HH:MM"
  return [t[0], t[1], t[3], t[4]];
};

function startLogoCell(cell) {
  if (cell.kind === 'q') spinQuarter(cell);
  else if (cell.kind === 'char') spinCellTo(cell, cell.target);
  else if (cell.kind === 'digit') spinDigitCell(cell, '0', cell.target);
  else if (cell.kind === 'colon') spinColonCell(cell);
  else setCellGlyph(cell, cell.target);   // static (blank)
}

function buildLogoBoard() {
  const board = $('logo-board');
  board.classList.add('logo-board');
  const row0 = el('span', 'flaprow flaprow-display logo-row', '');
  const row1 = el('span', 'flaprow flaprow-display logo-row', '');
  logoRows = [[], []];

  // Columns 0-5: B C P, each a 2x2 grid of quarter cells.
  for (const L of ['B', 'C', 'P']) {
    const tl = makeQuarterCell('tl', L);
    const tr = makeQuarterCell('tr', L);
    const bl = makeQuarterCell('bl', L);
    const br = makeQuarterCell('br', L);
    row0.append(tl.node, tr.node);
    row1.append(bl.node, br.node);
    logoRows[0].push(tl, tr);
    logoRows[1].push(bl, br);
  }

  // Columns 6-11, top row: T R A V E L.
  for (const ch of 'TRAVEL') {
    const cell = makeCell();
    cell.kind = 'char';
    cell.target = ch;
    row0.append(cell.node);
    logoRows[0].push(cell);
  }

  // Columns 6-11, bottom row: a blank, then the right-aligned clock " HH:MM".
  const dig = clockDigits();
  const slots = [' ', dig[0], dig[1], ':', dig[2], dig[3]];
  clockDigitCells = [];
  for (const ch of slots) {
    const cell = makeCell('clock-cell');
    if (/\d/.test(ch)) { cell.kind = 'digit'; cell.target = ch; clockDigitCells.push(cell); }
    else if (ch === ':') { cell.kind = 'colon'; cell.target = ':'; }
    else { cell.kind = 'static'; cell.target = ch; setCellGlyph(cell, ch); }
    row1.append(cell.node);
    logoRows[1].push(cell);
  }

  board.append(row0, row1);
}

// Animate the two logo rows on the shared wave: row 0 first, row 1 a
// row-stagger later, each cell offset left to right by the char-stagger.
function spinLogo() {
  const dig = clockDigits();
  let di = 0;
  for (const cell of logoRows[1]) if (cell.kind === 'digit') cell.target = dig[di++];
  logoRows.forEach((cells, ri) => {
    cells.forEach((cell, col) => {
      clearTimeout(cell.start);
      cell.start = setTimeout(() => startLogoCell(cell),
        ri * ROW_STAGGER_MS + col * CHAR_STAGGER_MS);
    });
  });
}

// Live clock: flip only the digits that changed, left to right, forward only.
function updateClock() {
  const dig = clockDigits();
  clockDigitCells.forEach((cell, i) => {
    if (cell.cur === dig[i]) return;
    clearTimeout(cell.start);
    cell.start = setTimeout(() => spinDigitCell(cell, cell.cur, dig[i]), i * CHAR_STAGGER_MS);
  });
}

function startLogoClock() {
  const ms = 60_000 - (Date.now() % 60_000);
  setTimeout(() => { updateClock(); setInterval(updateClock, 60_000); }, ms + 50);
}

// The logo doubles as the refresh button (so does pull-to-refresh).
$('logo-board').addEventListener('click', () => {
  spinLogo();
  if (!ghost.classList.contains('hidden')) showGhost(2);
  refreshCurrent();
});

// Expand/collapse toggles (train board's "Volgend uur").
for (const board of BOARDS) {
  if (!board.expandable) continue;
  $(board.el).querySelector('.board-expand').addEventListener('click', () => {
    board._expanded = !board._expanded;
    renderBoard(board);
  });
}

// Home / return toggle — a manual choice sticks for the session.
document.querySelectorAll('#mode-toggle .seg').forEach((b) => {
  b.addEventListener('click', () => { manualMode = b.dataset.mode; applyMode(manualMode); });
});

// Bottom tab bar: Reizen <-> In de lucht.
document.querySelectorAll('#tabbar .tab').forEach((b) => {
  b.addEventListener('click', () => switchTab(b.dataset.tab));
});

// Planes board: list <-> map view.
document.querySelectorAll('#plane-view-toggle .seg').forEach((b) => {
  b.addEventListener('click', () => setPlaneView(b.dataset.view));
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    refreshActive();        // reuse the cached location; don't re-prompt on every refocus
    startAutoRefresh();
  }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}

buildLogoBoard();
spinLogo();
startLogoClock();
loadCachedCoords();      // use last-known location immediately (no prompt)
startAutoRefresh();
renderQuick();
showIdle();
showGhost(2);            // continue the logo's wave into the search rows
locateAndSetMode();      // applies cached decision now, refines with one request
