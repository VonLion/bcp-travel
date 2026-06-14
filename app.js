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
  { label: 'Boze Zwanenmuseum', address: 'Museumstraat 1, Amsterdam' },
  { label: 'Opa',               address: 'Amstel, Amsterdam' },
  { label: 'Cafeetje',          address: 'Pretoriusstraat 15, Amsterdam' },
  { label: 'De Hut',            address: 'Rampweg 10, Renesse' },
  { label: 'Opa & Oma',         address: 'Rollandhof, Zierikzee' },
  { label: 'Skydive',           address: 'Noodweg 49, Hilversum' },
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
  board._deps = (data.stopTimes || [])
    .filter((st) => !st.cancelled && st.place.pickupType !== 'NOT_ALLOWED' && st.place.departure)
    .filter(board.filter)
    .filter((st) => new Date(st.place.departure).getTime() >= now - 30_000);

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

  // Remember the previously shown countdown per row so we can split-flap
  // only the digits that actually changed on this render.
  const prevCd = {};
  list.querySelectorAll('li[data-key]').forEach((li) => {
    prevCd[li.dataset.key] = li.dataset.cd;
  });

  // Reserve a delay column only as wide as the current view needs: 0 when
  // everything is on time, otherwise sized to the largest delay shown.
  const delays = shown.map((st) =>
    Math.round((new Date(st.place.departure) - new Date(st.place.scheduledDeparture)) / 60000));
  const maxDelay = Math.max(0, ...delays);
  const showDelay = maxDelay > 0;
  list.style.setProperty('--delay-w', showDelay ? `${`+${maxDelay}`.length}ch` : '0px');

  list.innerHTML = '';
  shown.forEach((st, i) => {
    const dep = new Date(st.place.departure);
    const sched = new Date(st.place.scheduledDeparture);
    const mins = Math.max(0, Math.round((dep - now) / 60000));
    const delayMin = delays[i];
    const key = st.tripId || `${st.routeShortName}-${st.place.scheduledDeparture}`;
    const cdText = mins === 0 ? 'nu' : `${mins} min`;

    const li = document.createElement('li');
    li.dataset.key = key;
    li.dataset.cd = cdText;

    const badge = el('span', `line-badge small mode-${st.mode.toLowerCase()}`,
      shortLine(st));
    const headsign = el('span', 'dep-headsign', st.headsign || '');
    li.append(badge, headsign);
    if (board.showTrack && st.place.track) {
      li.append(el('span', 'dep-track', `spoor ${st.place.track}`));
    }
    li.append(el('span', 'dep-time', timeFmt.format(sched)));
    if (showDelay) li.append(el('span', 'dep-delay', delayMin > 0 ? `+${delayMin}` : ''));

    const countdown = el('span', 'dep-countdown', '');
    if (st.realTime) countdown.append(el('span', 'rt-dot', ''));
    const oldCd = key in prevCd ? prevCd[key] : null;
    countdown.append(countdownFlap(cdText, oldCd));
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
  const btn = $('refresh-btn');
  btn.classList.add('spinning');
  const results = await Promise.allSettled(BOARDS.map(loadBoard));
  btn.classList.remove('spinning');

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
    if (document.visibilityState === 'visible') refreshBoards();
  }, REFRESH_MS);
}

// ============================================================
// Autocomplete
// ============================================================
const input = $('dest-input');
const sugList = $('suggestions');
let debounceTimer = null;
let geocodeAbort = null;

input.addEventListener('input', () => {
  $('clear-btn').hidden = input.value.length === 0;
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
  hideGhost();
  if (input.value.trim().length < 2) showIdle();
});

input.addEventListener('blur', () => {
  if (input.value.trim().length === 0) showGhost();
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-wrap')) hideSuggestions();
});

$('clear-btn').addEventListener('click', () => {
  input.value = '';
  $('clear-btn').hidden = true;
  hideSuggestions();
  $('routes').hidden = true;
  showIdle();
  input.focus();
});

// ---- Split-flap placeholder + quick destinations ----------------------
const ghost = $('ghost');
const flapWord = ghost.querySelector('.flap-word');
const PLACEHOLDERS = ['Where to?', ...QUICK_DESTINATIONS.map((d) => d.label)];
const REDUCE = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
let ghostTimer = null;
let ghostIdx = 0;

function startGhost() {
  if (REDUCE) { flapWord.textContent = 'Where to?'; return; }
  clearInterval(ghostTimer);
  ghostTimer = setInterval(() => {
    flapWord.classList.remove('in');
    flapWord.classList.add('out');
    setTimeout(() => {
      ghostIdx = (ghostIdx + 1) % PLACEHOLDERS.length;
      flapWord.textContent = PLACEHOLDERS[ghostIdx];
      flapWord.classList.remove('out');
      flapWord.classList.add('in');
    }, 320);
  }, 2600);
}

function showGhost() {
  ghost.classList.remove('hidden');
  startGhost();
}

function hideGhost() {
  ghost.classList.add('hidden');
  clearInterval(ghostTimer);
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
    const chip = el('button', 'chip quick', '');
    chip.append(el('span', 'chip-pin', ''), document.createTextNode(d.label));
    chip.addEventListener('click', () => selectQuick(d));
    wrap.append(chip);
  }
}

async function selectQuick(d) {
  input.value = d.label;
  $('clear-btn').hidden = false;
  hideSuggestions();
  hideIdle();
  hideGhost();
  input.blur();
  try {
    const dest = await geocodeAddress(d.address);
    dest.name = d.label;          // show the friendly name in the results title
    planRoutes(dest);
  } catch (err) {
    console.error(err);
    $('routes').hidden = false;
    $('routes-title').textContent = `Kon ${d.label} niet vinden`;
    $('route-cards').innerHTML = '';
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
  input.value = dest.name;
  $('clear-btn').hidden = false;
  hideSuggestions();
  hideIdle();
  hideGhost();
  saveRecent(dest);
  input.blur();
  planRoutes(dest);
}

async function planRoutes(dest) {
  const section = $('routes');
  const cardsBox = $('route-cards');
  section.hidden = false;
  $('routes-title').textContent = `Naar ${dest.name}`;
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
    await refreshBoards();
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

// ---- Countdown split-flap (per character) -------------------------------
// Build a row of little cards for a countdown like "10 min". Each digit and
// the label is its own card; the number is right-aligned in >=2 slots so the
// tens digit appears/disappears in place (10 -> 9 peels the leading "1").
function countdownCells(text) {
  if (text === 'nu') {
    return [{ type: 'blank', char: '' }, { type: 'blank', char: '' }, { type: 'label', char: 'nu' }];
  }
  const m = text.match(/^(\d+)\s+(\D+)$/);
  if (!m) return [{ type: 'label', char: text }];
  const digits = m[1];
  const slots = Math.max(2, digits.length);
  const cells = [...digits.padStart(slots, ' ')].map((ch) =>
    ch === ' ' ? { type: 'blank', char: '' } : { type: 'digit', char: ch });
  cells.push({ type: 'label', char: m[2] });
  return cells;
}

function countdownFlap(newText, oldText) {
  const row = el('span', 'cd-flap', '');
  row.setAttribute('aria-label', newText);
  row.setAttribute('role', 'text');
  const nCells = countdownCells(newText);
  const oCells = oldText != null ? countdownCells(oldText) : null;
  const n = nCells.length;
  for (let i = 0; i < n; i++) {
    let oldChar = null;
    if (oCells) {
      const ri = n - 1 - i;                       // index from the right
      const o = oCells[oCells.length - 1 - ri];   // aligned right-to-left
      oldChar = o ? o.char : '';                  // nothing there before -> appears
    }
    row.append(flapCell(nCells[i], oldChar));
  }
  return row;
}

function flapCell(cell, oldChar) {
  const node = el('span', `cell cell-${cell.type}${cell.char === '' ? ' blank' : ''}`, '');
  node.setAttribute('aria-hidden', 'true');
  node.append(el('span', 'cf cf-bottom', cell.char));
  const top = el('span', 'cf cf-top', cell.char);
  node.append(top);
  if (oldChar != null && oldChar !== cell.char) {
    if (oldChar === '') {
      top.classList.add('drop');                  // glyph arriving: drop in
    } else {
      const fall = el('span', 'cf cf-fall', oldChar); // glyph leaving: peel down
      node.append(fall);
      fall.addEventListener('animationend', () => fall.remove());
    }
  }
  return node;
}

// ---- Brand tile alphabet spin -------------------------------------------
// On load / manual refresh each tile starts at "A" and flaps through the
// alphabet to its target letter. All tiles flip at the same rate, so B (1
// step) lands first, C (2) second, and P (15 steps) takes ~0.5s.
const SPIN_STEP_MS = 33; // 15 steps (A->P) ~= 0.5s

function setTileGlyph(tile, ch) {
  tile.querySelector('.tile-bottom').textContent = ch;
  tile.querySelector('.tile-top').textContent = ch;
}

function spinTile(tile) {
  const target = (tile.dataset.letter || 'A').toUpperCase().charCodeAt(0);
  let code = 'A'.charCodeAt(0);
  setTileGlyph(tile, 'A');
  if (target <= code) { setTileGlyph(tile, String.fromCharCode(target)); return; }
  const id = setInterval(() => {
    const oldCh = String.fromCharCode(code);
    code += 1;
    setTileGlyph(tile, String.fromCharCode(code));
    tile.querySelectorAll('.tile-fall').forEach((f) => f.remove());
    const fall = el('span', 'tile-half tile-fall', oldCh);
    fall.setAttribute('aria-hidden', 'true');
    tile.append(fall);
    fall.addEventListener('animationend', () => fall.remove());
    if (code >= target) clearInterval(id);
  }, SPIN_STEP_MS);
}

function spinBrandTiles() {
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.querySelectorAll('.brand .tile').forEach((tile) => {
    if (reduce) { setTileGlyph(tile, (tile.dataset.letter || '').toUpperCase()); return; }
    spinTile(tile);
  });
}

$('refresh-btn').addEventListener('click', () => {
  spinBrandTiles();
  refreshBoards();
});

// Expand/collapse toggles (train board's "Volgend uur").
for (const board of BOARDS) {
  if (!board.expandable) continue;
  $(board.el).querySelector('.board-expand').addEventListener('click', () => {
    board._expanded = !board._expanded;
    renderBoard(board);
  });
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    refreshBoards();
    startAutoRefresh();
  }
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js');
}

spinBrandTiles();
refreshBoards();
startAutoRefresh();
renderQuick();
showIdle();
showGhost();
