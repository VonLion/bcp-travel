'use strict';

// ============================================================
// Config — stop IDs come from the Transitous (MOTIS) dataset.
// Verify with: https://api.transitous.org/api/v1/geocode?text=<name>&type=STOP
// ============================================================
const API = 'https://api.transitous.org/api/v1';

const BOARDS = [
  {
    el: 'board-metro',
    stopId: 'nl-OpenOV_NL:S:30009550', // Station Gaasperplas
    // Gaasperplas is the 53 terminus: every metro departure heads to Centraal.
    filter: (st) => st.mode === 'SUBWAY',
  },
  {
    el: 'board-bus',
    stopId: 'nl-OpenOV_3980641', // Leerdamhof (returns both quays)
    // "Towards the city" = bus 47 richting Station Bijlmer ArenA.
    filter: (st) => st.mode === 'BUS' && /aren/i.test(st.headsign || ''),
  },
];

const ROUTE_ORIGINS = [
  {
    icon: '🚇',
    label: 'Metro vanaf Gaasperplas',
    place: 'nl-OpenOV_NL:S:30009550',
    offsetMin: 0,
  },
  {
    icon: '🚌',
    label: 'Bus vanaf Leerdamhof',
    place: 'nl-OpenOV_3980641',
    offsetMin: 0,
  },
  {
    icon: '🚲',
    label: 'Vanaf Bijlmer ArenA',
    place: 'nl-OpenOV_NL:S:30000559', // Station Bijlmer ArenA
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
  const card = $(board.el);
  const list = card.querySelector('.departures');
  const res = await fetch(`${API}/stoptimes?stopId=${encodeURIComponent(board.stopId)}&n=16`);
  if (!res.ok) throw new Error(`stoptimes ${res.status}`);
  const data = await res.json();

  const now = Date.now();
  const deps = (data.stopTimes || [])
    .filter((st) => !st.cancelled && st.place.pickupType !== 'NOT_ALLOWED' && st.place.departure)
    .filter(board.filter)
    .filter((st) => new Date(st.place.departure).getTime() >= now - 30_000)
    .slice(0, 3);

  list.innerHTML = '';
  for (const st of deps) {
    const dep = new Date(st.place.departure);
    const sched = new Date(st.place.scheduledDeparture);
    const mins = Math.max(0, Math.round((dep - now) / 60000));
    const delayMin = Math.round((dep - sched) / 60000);

    const li = document.createElement('li');
    const badge = el('span', `line-badge small mode-${st.mode.toLowerCase()}`, st.routeShortName || '?');
    const headsign = el('span', 'dep-headsign', st.headsign || '');
    const time = el('span', 'dep-time', timeFmt.format(sched));
    li.append(badge, headsign, time);
    if (delayMin > 0) li.append(el('span', 'dep-delay', `+${delayMin}`));

    const countdown = el('span', 'dep-countdown', '');
    if (st.realTime) {
      const dot = el('span', 'rt-dot', '');
      countdown.append(dot);
    }
    countdown.append(document.createTextNode(mins === 0 ? 'nu' : `${mins} min`));
    li.append(countdown);
    list.append(li);
  }
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

  section.scrollIntoView({ behavior: 'smooth', block: 'start' });

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
      renderItineraries(card, data.itineraries || []);
    } catch (err) {
      console.error(err);
      card.querySelectorAll('.skeleton').forEach((s) => s.remove());
      card.append(el('div', 'status error', 'Route plannen mislukt — probeer opnieuw'));
    }
  }));
}

function renderItineraries(card, itineraries) {
  card.querySelectorAll('.skeleton').forEach((s) => s.remove());

  if (itineraries.length === 0) {
    card.append(el('div', 'status', 'Geen route gevonden'));
    return;
  }

  for (const it of itineraries.slice(0, ITINERARIES_PER_ROUTE)) {
    const box = el('div', 'itinerary', '');

    const times = el('div', 'itin-times', '');
    const start = new Date(it.startTime);
    const end = new Date(it.endTime);
    times.append(el('span', 'itin-range', `${timeFmt.format(start)} – ${timeFmt.format(end)}`));
    const transfers = it.transfers === 1 ? '1 overstap' : `${it.transfers} overstappen`;
    times.append(el('span', 'itin-meta', transfers));
    times.append(el('span', 'itin-duration', formatDuration(it.duration)));
    box.append(times);

    const legsRow = el('div', 'itin-legs', '');
    const parts = [];
    for (const leg of it.legs) {
      if (leg.mode === 'WALK') {
        const mins = Math.round(leg.duration / 60);
        if (mins >= 2) parts.push(el('span', 'leg-walk', `🚶 ${mins}'`));
        continue;
      }
      const badge = el('span', `line-badge small mode-${leg.mode.toLowerCase()}`,
        leg.routeShortName || leg.displayName || leg.mode);
      badge.title = `${leg.from.name} → ${leg.headsign || leg.to.name}`;
      parts.push(badge);
    }
    parts.forEach((p, idx) => {
      if (idx > 0) legsRow.append(el('span', 'leg-sep', '›'));
      legsRow.append(p);
    });
    box.append(legsRow);
    card.append(box);
  }
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
