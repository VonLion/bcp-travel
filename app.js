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
    icon: '🚇',
    label: 'Metrostation Gaasperplas',
    place: 'nl-OpenOV_NL:S:30009550',
    coord: '52.311016,4.984585', // for the Google Maps link
    offsetMin: 0,
  },
  {
    icon: '🚌',
    label: 'Bushalte Leerdamhof',
    place: 'nl-OpenOV_3980641',
    coord: '52.30539,4.97526',
    offsetMin: 0,
  },
  {
    icon: '🚲',
    label: 'Bijlmer ArenA',
    place: 'nl-OpenOV_NL:S:30000559', // Station Bijlmer ArenA
    coord: '52.311302,4.947578',
    offsetMin: 15,
    note: '+15 min fietsen',
  },
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

  list.innerHTML = '';
  for (const st of shown) {
    const dep = new Date(st.place.departure);
    const sched = new Date(st.place.scheduledDeparture);
    const mins = Math.max(0, Math.round((dep - now) / 60000));
    const delayMin = Math.round((dep - sched) / 60000);

    const li = document.createElement('li');
    const badge = el('span', `line-badge small mode-${st.mode.toLowerCase()}`,
      shortLine(st));
    const headsign = el('span', 'dep-headsign', st.headsign || '');
    li.append(badge, headsign);
    if (board.showTrack && st.place.track) {
      li.append(el('span', 'dep-track', `spoor ${st.place.track}`));
    }
    li.append(el('span', 'dep-time', timeFmt.format(sched)));
    if (delayMin > 0) li.append(el('span', 'dep-delay', `+${delayMin}`));

    const countdown = el('span', 'dep-countdown', '');
    if (st.realTime) countdown.append(el('span', 'rt-dot', ''));
    countdown.append(document.createTextNode(mins === 0 ? 'nu' : `${mins} min`));
    li.append(countdown);
    list.append(li);
  }

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
    renderRecents();
    return;
  }
  debounceTimer = setTimeout(() => autocomplete(q), 280);
});

input.addEventListener('focus', () => {
  if (input.value.trim().length < 2) renderRecents();
});

document.addEventListener('click', (e) => {
  if (!e.target.closest('.search-wrap')) hideSuggestions();
});

$('clear-btn').addEventListener('click', () => {
  input.value = '';
  $('clear-btn').hidden = true;
  hideSuggestions();
  $('routes').hidden = true;
  renderRecents();
  input.focus();
});

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
  $('recents').hidden = true;
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
    head.append(el('span', 'icon', origin.icon), el('h3', '', origin.label));
    if (origin.note) head.append(el('span', 'route-note', origin.note));
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

  // Direct Google Maps link for this journey (origin stop → destination, transit).
  const o = it.legs[0]?.from;
  const oCoord = o?.lat ? `${o.lat},${o.lon}` : origin.coord;
  const maps = el('a', 'maps-link', 'Open in Google Maps ↗');
  maps.href = `https://www.google.com/maps/dir/?api=1`
    + `&origin=${encodeURIComponent(oCoord)}`
    + `&destination=${encodeURIComponent(`${dest.lat},${dest.lon}`)}`
    + `&travelmode=transit`;
  maps.target = '_blank';
  maps.rel = 'noopener';
  detail.append(maps);

  return detail;
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

$('refresh-btn').addEventListener('click', refreshBoards);

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

refreshBoards();
startAutoRefresh();
renderRecents();
