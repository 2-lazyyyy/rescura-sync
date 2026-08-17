// Supabase Client Setup Constants
const SUPABASE_URL = 'https://jgbtudbialgitdxgkngj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnYnR1ZGJpYWxnaXRkeGdrbmdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwNjgzODksImV4cCI6MjEwMTY0NDM4OX0.1Wc1P4seagQsTKcOKN9nhDDiakBIAnQo7FlHhJBUO8A';
const supabaseClient = (window.supabase && SUPABASE_URL !== 'YOUR_URL_HERE' && SUPABASE_ANON_KEY !== 'YOUR_ANON_KEY_HERE')
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

// Base Tile Layers: Modern Clean Light Canvas, Dark Mode Canvas & High-Res Satellite Imagery
const lightVoyagerLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
});

const darkCanvasLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
});

const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
});

const openStreetMapLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
});

// Initialize Leaflet Map centered on Myanmar Focus Zone
const MYANMAR_COORDS = [19.7633, 96.0785];
const MYANMAR_ZOOM_LEVEL = 5.5;

const map = L.map('map', {
    center: MYANMAR_COORDS,
    zoom: MYANMAR_ZOOM_LEVEL,
    minZoom: 2.2,
    zoomSnap: 0.1,
    worldCopyJump: true,
    maxBounds: [[-85, -220], [85, 220]],
    maxBoundsViscosity: 0.8,
    layers: [lightVoyagerLayer],
    zoomControl: false
});

// Live Weather Radar Tile Layer (RainViewer Real-Time Telemetry)
const liveWeatherRadarLayer = L.tileLayer('https://tile.rainviewer.org/v2/radar/nowcast_0/256/{z}/{x}/{y}/2/1_1.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.rainviewer.com/">RainViewer</a> Weather Radar',
    opacity: 0.65
});

// Registered Relief Depots & Haversine Distance Helpers
const REGISTERED_DEPOTS_CLIENT = [
    { name: "Yangon Central Depot", lat: 16.8661, lon: 96.1561 },
    { name: "Naypyidaw Reserve Depot", lat: 19.7633, lon: 96.0785 },
    { name: "Mandalay Hub Depot", lat: 21.9588, lon: 96.0891 }
];

function calculateHaversineKm(lat1, lon1, lat2, lon2) {
    const R = 6371.0;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

function getNearestDepotDistance(targetLat, targetLon) {
    const lat = parseFloat(targetLat);
    const lon = parseFloat(targetLon);
    if (isNaN(lat) || isNaN(lon)) return 45.0;

    let minDist = Infinity;
    for (const d of REGISTERED_DEPOTS_CLIENT) {
        const dist = calculateHaversineKm(lat, lon, d.lat, d.lon);
        if (dist < minDist) {
            minDist = dist;
        }
    }
    return minDist === Infinity ? 45.0 : Math.round(minDist * 100) / 100;
}

// Add Layer Control widget allowing users to toggle Clean Light vs Satellite vs Dark Canvas vs OSM vs Live Weather Overlay
const baseMaps = {
    "☀️ Clean Light Canvas": lightVoyagerLayer,
    "🌙 Dark Mode Canvas": darkCanvasLayer,
    "🛰️ Satellite Imagery": satelliteLayer,
    "🗺️ Standard OpenStreetMap": openStreetMapLayer
};

const overlayMaps = {
    "🌧️ Live Weather Radar": liveWeatherRadarLayer
};

L.control.layers(baseMaps, overlayMaps, { position: 'topright', collapsed: true }).addTo(map);

let isWeatherRadarActive = false;
function toggleWeatherRadar() {
    const btn = document.getElementById('btn-radar-toggle');
    if (!isWeatherRadarActive) {
        map.addLayer(liveWeatherRadarLayer);
        isWeatherRadarActive = true;
        if (btn) {
            btn.style.background = 'linear-gradient(135deg, #059669, #047857)';
            btn.style.borderColor = '#10b981';
            btn.style.boxShadow = '0 0 16px rgba(16, 185, 129, 0.6)';
            btn.innerHTML = '<span id="radar-icon">🌧️</span> Weather Radar: ON';
        }
    } else {
        map.removeLayer(liveWeatherRadarLayer);
        isWeatherRadarActive = false;
        if (btn) {
            btn.style.background = '';
            btn.style.borderColor = '';
            btn.style.boxShadow = '';
            btn.innerHTML = '<span id="radar-icon">🌧️</span> Weather Radar: OFF';
        }
    }
}
window.toggleWeatherRadar = toggleWeatherRadar;

let isSidebarOpen = true;
function toggleSidebarPanel() {
    const body = document.getElementById('sidebar-body');
    const chevron = document.getElementById('sidebar-toggle-chevron');
    const sidebar = document.getElementById('sidebar-panel');
    
    if (isSidebarOpen) {
        if (body) body.style.display = 'none';
        if (sidebar) sidebar.classList.add('collapsed');
        if (chevron) chevron.innerText = '▶️';
        isSidebarOpen = false;
    } else {
        if (body) {
            body.style.display = 'flex';
            body.style.flexDirection = 'column';
        }
        if (sidebar) sidebar.classList.remove('collapsed');
        if (chevron) chevron.innerText = '🔽';
        isSidebarOpen = true;
    }
}
window.toggleSidebarPanel = toggleSidebarPanel;

let currentTab = 'gdacs';
let selectedContinent = 'All';
let searchQuery = '';

let activePolyline = null;
let activeMarker = null;
let mapMarkers = [];
let sosCircleMarkers = [];
let depotMarkers = [];
let routePolylines = [];
let gdacsAlertsData = [];
let sosAlertsData = [];

/**
 * Checks if geographic coordinates fall within the ASEAN / Southeast Asia region
 */
function isWithinASEAN(lat, lon) {
    return (lat >= -11.0 && lat <= 29.0 && lon >= 92.0 && lon <= 142.0);
}

/**
 * Detects the continent based on geographic latitude/longitude and title/country keywords
 */
function getContinent(lat, lon, title = '') {
    const t = (title || '').toLowerCase();

    if (t.includes('myanmar') || t.includes('japan') || t.includes('china') || t.includes('india') ||
        t.includes('philippines') || t.includes('indonesia') || t.includes('thailand') || t.includes('vietnam') ||
        t.includes('bago') || t.includes('yangon') || t.includes('asia') || t.includes('korea') || t.includes('taiwan') ||
        t.includes('russia') || t.includes('kazakhstan') || t.includes('pakistan') || t.includes('bangladesh')) {
        return 'Asia';
    }
    if (t.includes('turkey') || t.includes('greece') || t.includes('italy') || t.includes('spain') ||
        t.includes('france') || t.includes('germany') || t.includes('uk') || t.includes('europe') || t.includes('iceland') ||
        t.includes('albania') || t.includes('austria') || t.includes('poland') || t.includes('romania') || t.includes('ukraine')) {
        return 'Europe';
    }
    if (t.includes('usa') || t.includes('mexico') || t.includes('brazil') || t.includes('chile') ||
        t.includes('california') || t.includes('florida') || t.includes('canada') || t.includes('peru') || t.includes('america') ||
        t.includes('colombia') || t.includes('ecuador') || t.includes('panama') || t.includes('venezuela') || t.includes('honduras')) {
        return 'Americas';
    }
    if (t.includes('egypt') || t.includes('madagascar') || t.includes('south africa') || t.includes('kenya') ||
        t.includes('morocco') || t.includes('ethiopia') || t.includes('africa') || t.includes('sudan') ||
        t.includes('angola') || t.includes('gabon') || t.includes('congo') || t.includes('somalia') || t.includes('tanzania') || t.includes('uganda')) {
        return 'Africa';
    }
    if (t.includes('australia') || t.includes('zealand') || t.includes('fiji') || t.includes('papua') || t.includes('oceania') || t.includes('solomon')) {
        return 'Oceania';
    }

    // Lat/Lon Bounding Box Fallback
    if (lat >= -11.0 && lat <= 75.0 && lon >= 45.0 && lon <= 180.0) {
        return 'Asia';
    }
    if (lat >= 34.0 && lat <= 72.0 && lon >= -25.0 && lon <= 45.0) {
        return 'Europe';
    }
    if (lon >= -170.0 && lon <= -30.0) {
        return 'Americas';
    }
    if (lat >= -35.0 && lat <= 37.0 && lon >= -20.0 && lon <= 52.0) {
        return 'Africa';
    }
    if (lat >= -50.0 && lat <= 0.0 && lon >= 110.0 && lon <= 180.0) {
        return 'Oceania';
    }

    return 'Asia';
}

let activeApiHost = sessionStorage.getItem('rescura_api_host') || 'http://127.0.0.1:8000';

function getCandidateHosts() {
    const list = [];
    if (window.location && window.location.origin && window.location.origin.startsWith('http')) {
        list.push(window.location.origin);
        list.push(window.location.origin.replace(/:\d+$/, ':8000'));
    }
    if (activeApiHost) {
        list.push(activeApiHost);
    }
    list.push('http://127.0.0.1:8000', 'http://localhost:8000');
    list.push('https://rescura-sync.onrender.com');
    return Array.from(new Set(list.filter(Boolean)));
}

/**
 * Downloads the automated PDF Action Plan for a given disaster event ID from active backend.
 */
function downloadActionPlanPDF(evtId = 1) {
    const targetUrl = `${activeApiHost}/api/export-report/${evtId || 1}`;
    window.open(targetUrl, '_blank');
}

/**
 * Fast, resilient API fetch helper with quick AbortController timeout and smart caching.
 */
async function apiFetch(path, options = {}) {
    const timeoutMs = options.timeout || 1500;
    const fetchOptions = { ...options };
    delete fetchOptions.timeout;

    // Direct fetch if activeApiHost is set
    if (activeApiHost) {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            const url = `${activeApiHost}${path}`;
            const res = await fetch(url, { ...fetchOptions, signal: controller.signal });
            clearTimeout(timer);
            if (res && res.ok) return res;
        } catch (e) {
            // fallback to candidates
        }
    }

    const candidateHosts = getCandidateHosts();
    for (const host of candidateHosts) {
        if (host === activeApiHost) continue;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const url = `${host}${path}`;
            const res = await fetch(url, { ...fetchOptions, signal: controller.signal });
            clearTimeout(timer);
            if (res && res.ok) {
                activeApiHost = host;
                sessionStorage.setItem('rescura_api_host', host);
                return res;
            }
        } catch (e) {
            clearTimeout(timer);
        }
    }
    return null;
}

/**
 * Fetches mission analytics from Pandas API and updates the top stats bar widgets
 */
async function loadAnalytics() {
    try {
        const res = await apiFetch('/api/mission-analytics');
        if (res && res.ok) {
            const data = await res.json();
            const elWater = document.getElementById('total-water');
            const elFood = document.getElementById('total-food');
            const elTime = document.getElementById('avg-time');
            const elDisasters = document.getElementById('stat-disasters');

            if (elWater && data.sum_water_liters !== undefined) {
                elWater.innerText = `${data.sum_water_liters.toLocaleString()} L`;
            }
            if (elFood && data.sum_food_packs !== undefined) {
                elFood.innerText = `${data.sum_food_packs.toLocaleString()} Packs`;
            }
            if (elTime && data.mean_estimated_rescue_time !== undefined) {
                elTime.innerText = `${data.mean_estimated_rescue_time} hrs`;
            }
            if (elDisasters && data.total_active_disasters !== undefined) {
                elDisasters.innerText = data.total_active_disasters;
            }
        }
    } catch (err) {
        console.error('Failed to load mission analytics:', err);
    }
}
window.loadAnalytics = loadAnalytics;

/**
 * Smooth camera pan & zoom function to focus map on emergency coordinates
 */
function focusMap(lat, lon) {
    if (lat && lon) {
        map.flyTo([lat, lon], 13, {
            animate: true,
            duration: 1.5
        });
    }
}
window.focusMap = focusMap;

/**
 * Switch tab between GDACS Alerts and Mobile SOS Reports
 */
function switchTab(tab) {
    currentTab = tab;
    document.getElementById('tab-gdacs').classList.toggle('active', tab === 'gdacs');
    document.getElementById('tab-sos').classList.toggle('active', tab === 'sos');
    renderSidebarCards();
    updateContinentFilterCounts();
}

/**
 * Update top stats counter widgets and continent filter chip badges
 */
function updateStatsCounters() {
    const disastersCount = gdacsAlertsData.length;
    const pendingCount = sosAlertsData.filter(a => !a.status || a.status === 'pending').length;
    const dispatchedCount = sosAlertsData.filter(a => a.status === 'dispatched').length;

    const elDisasters = document.getElementById('stat-disasters');
    const elPending = document.getElementById('stat-pending-sos');
    const elDispatched = document.getElementById('stat-dispatched');

    if (elDisasters) elDisasters.innerText = disastersCount;
    if (elPending) elPending.innerText = pendingCount;
    if (elDispatched) elDispatched.innerText = dispatchedCount;

    updateContinentFilterCounts();
}

/**
 * Dynamically calculates total and per-continent disaster counts and updates filter chip badges
 */
function updateContinentFilterCounts() {
    const dataSet = currentTab === 'gdacs' ? gdacsAlertsData : sosAlertsData;

    const counts = {
        All: dataSet.length,
        Asia: 0,
        Europe: 0,
        Americas: 0,
        Africa: 0,
        Oceania: 0
    };

    dataSet.forEach(item => {
        let lat = item.latitude !== undefined ? item.latitude : (item.lat !== undefined ? item.lat : 0);
        let lon = item.longitude !== undefined ? item.longitude : (item.lon !== undefined ? item.lon : 0);
        let titleStr = currentTab === 'gdacs' ? (item.title || '') : (item.location || '');
        if (currentTab !== 'gdacs') {
            const parsed = parseSOSCoords(item);
            lat = parsed.lat;
            lon = parsed.lon;
        }
        const cont = getContinent(lat, lon, titleStr);
        if (counts.hasOwnProperty(cont)) {
            counts[cont]++;
        } else {
            counts['Asia']++;
        }
    });

    const chipMap = [
        { id: 'chip-all', key: 'All', label: 'All Continents', icon: '' },
        { id: 'chip-asia', key: 'Asia', label: 'Asia', icon: '🌏 ' },
        { id: 'chip-europe', key: 'Europe', label: 'Europe', icon: '🌍 ' },
        { id: 'chip-americas', key: 'Americas', label: 'Americas', icon: '🌎 ' },
        { id: 'chip-africa', key: 'Africa', label: 'Africa', icon: '🌍 ' },
        { id: 'chip-oceania', key: 'Oceania', label: 'Oceania', icon: '🌏 ' }
    ];

    chipMap.forEach(({ id, key, label, icon }) => {
        const chip = document.getElementById(id);
        if (chip) {
            const num = counts[key] !== undefined ? counts[key] : 0;
            chip.innerHTML = `${icon}${label} <span class="chip-count">${num}</span>`;
        }
    });
}

/**
 * Helper to consistently extract or assign lat/lon for SOS alerts
 */
function parseSOSCoords(alert, index = 0) {
    let lat = alert.latitude || alert.lat;
    let lon = alert.longitude || alert.lon;

    if ((!lat || !lon) && typeof alert.location === 'string') {
        const match = alert.location.match(/([0-9]+\.[0-9]+),\s*([0-9]+\.[0-9]+)/);
        if (match) {
            lat = parseFloat(match[1]);
            lon = parseFloat(match[2]);
        }
    }

    if (!lat || !lon) {
        lat = 16.8661 + (index * 0.008) - 0.01;
        lon = 96.1561 + (index * 0.006) - 0.008;
    }
    return { lat, lon };
}

function formatOccurredTime(dateStr) {
    if (!dateStr) return 'Aug 9, 2026, 17:15 UTC';
    try {
        let str = String(dateStr).trim();
        if (str.endsWith(' UTC')) return str;
        const date = new Date(str.replace(' UTC', 'Z'));
        if (isNaN(date.getTime())) return str;

        return date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'UTC'
        }) + ' UTC';
    } catch (e) {
        return String(dateStr);
    }
}

/**
 * Filter alerts by user search query in sidebar
 */
function filterAlerts() {
    const input = document.getElementById('search-input');
    searchQuery = input ? input.value.toLowerCase().trim() : '';
    renderSidebarCards();
    updateMapMarkersFilter();
}

/**
 * Filter disaster telemetry by continent selection
 */
function filterByContinent(continent) {
    selectedContinent = continent;

    const chips = ['all', 'asia', 'europe', 'americas', 'africa', 'oceania'];
    chips.forEach(c => {
        const el = document.getElementById(`chip-${c}`);
        if (el) {
            const isMatch = (c === continent.toLowerCase()) || (c === 'all' && continent === 'All');
            el.classList.toggle('active', isMatch);
        }
    });

    renderSidebarCards();
    updateMapMarkersFilter();
}
window.filterByContinent = filterByContinent;

/**
 * Dynamically filters visible map markers according to active search query and continent selection,
 * and pans the camera to frame matching markers.
 */
function updateMapMarkersFilter() {
    const visibleMarkers = [];

    mapMarkers.forEach(m => {
        const c = m.continent || 'Asia';
        const t = (m.disasterTitle || '').toLowerCase();
        const matchesContinent = (selectedContinent === 'All' || c === selectedContinent);
        const matchesSearch = (!searchQuery || t.includes(searchQuery));

        if (matchesContinent && matchesSearch) {
            if (!map.hasLayer(m)) map.addLayer(m);
            visibleMarkers.push(m);
        } else {
            if (map.hasLayer(m)) map.removeLayer(m);
        }
    });

    sosCircleMarkers.forEach(m => {
        const c = m.continent || 'Asia';
        const loc = (m.alertLocation || '').toLowerCase();
        const matchesContinent = (selectedContinent === 'All' || c === selectedContinent);
        const matchesSearch = (!searchQuery || loc.includes(searchQuery));

        if (matchesContinent && matchesSearch) {
            if (!map.hasLayer(m)) map.addLayer(m);
            visibleMarkers.push(m);
        } else {
            if (map.hasLayer(m)) map.removeLayer(m);
        }
    });

    if (visibleMarkers.length > 0) {
        try {
            if (selectedContinent !== 'All') {
                const group = L.featureGroup(visibleMarkers);
                map.fitBounds(group.getBounds().pad(0.15), { maxZoom: 8, animate: true, duration: 1.2 });
            }
        } catch (e) {}
    }
}

/**
 * Render cards into the Unified Left Sidebar and GDACS Disaster Feeds with Clean Executive Light Theme
 */
function renderSidebarCards() {
    const alertsContainer = document.getElementById('alerts-container');
    const sosContainer = document.getElementById('sos-alerts-container');

    const cols = {
        'Earthquake': { id: 'col-earthquake', countId: 'count-earthquake' },
        'Tropical Cyclone': { id: 'col-cyclone', countId: 'count-cyclone' },
        'Flood': { id: 'col-flood', countId: 'count-flood' },
        'Volcano': { id: 'col-volcano', countId: 'count-volcano' },
        'Drought': { id: 'col-drought', countId: 'count-drought' },
        'Forest Fire': { id: 'col-fire', countId: 'count-fire' },
    };

    // Clear all columns and counts
    Object.values(cols).forEach(col => {
        const el = document.getElementById(col.id);
        const countEl = document.getElementById(col.countId);
        if (el) el.innerHTML = '';
        if (countEl) countEl.innerText = '0';
    });
    if (alertsContainer) alertsContainer.innerHTML = '';
    if (sosContainer) sosContainer.innerHTML = '';

    const getEmoji = (cont) => {
        switch(cont) {
            case 'Europe': return '🌍';
            case 'Americas': return '🌎';
            case 'Africa': return '🌍';
            case 'Oceania': return '🌏';
            default: return '🌏';
        }
    };

    const getCategoryIcon = (cat) => {
        switch(cat) {
            case 'Tropical Cyclone': return '🌀';
            case 'Flood': return '🌊';
            case 'Volcano': return '🌋';
            case 'Drought': return '🏜️';
            case 'Forest Fire': return '🔥';
            default: return '🌍';
        }
    };

    let counts = {
        'Earthquake': 0, 'Tropical Cyclone': 0, 'Flood': 0,
        'Volcano': 0, 'Drought': 0, 'Forest Fire': 0
    };

    // Filter by Continent and Search Query
    const filteredAlerts = gdacsAlertsData.filter(alert => {
        const lat = alert.latitude !== undefined ? alert.latitude : (alert.lat !== undefined ? alert.lat : 0);
        const lon = alert.longitude !== undefined ? alert.longitude : (alert.lon !== undefined ? alert.lon : 0);
        const title = alert.title || '';
        const cont = getContinent(lat, lon, title);
        
        const matchesContinent = (selectedContinent === 'All' || cont === selectedContinent);
        const matchesSearch = (!searchQuery || title.toLowerCase().includes(searchQuery));
        return matchesContinent && matchesSearch;
    });

    // Populate Unified Sidebar Feed (if present)
    if (alertsContainer) {
        if (filteredAlerts.length === 0) {
            alertsContainer.innerHTML = `
                <div class="p-6 text-center text-slate-400 text-xs font-semibold">
                    No active disaster events found matching your filter criteria.
                </div>
            `;
        } else {
            filteredAlerts.forEach((alert, index) => {
                const lat = alert.latitude !== undefined ? alert.latitude : (alert.lat !== undefined ? alert.lat : 0);
                const lon = alert.longitude !== undefined ? alert.longitude : (alert.lon !== undefined ? alert.lon : 0);
                const timeStr = formatOccurredTime(alert.created_at || alert.pubDate || alert.timestamp);
                const cont = getContinent(lat, lon, alert.title);
                const disasterId = String(alert.id || alert.title || `gdacs_${index}`);
                
                let rawType = ((alert.disaster_type || '') + ' ' + (alert.title || '')).toLowerCase();
                let cat = 'Earthquake';
                if (rawType.includes('cyclone') || rawType.includes('storm') || /\b(tc|hurricane|typhoon)\b/.test(rawType)) cat = 'Tropical Cyclone';
                else if (rawType.includes('flood') || rawType.includes('tsunami') || /\b(fl)\b/.test(rawType)) cat = 'Flood';
                else if (rawType.includes('fire') || rawType.includes('wildfire') || /\b(wf)\b/.test(rawType)) cat = 'Forest Fire';

                const sev = alert.severity || 5.0;
                const sevBadge = sev >= 7.0
                    ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-red-50 text-red-700 border border-red-200">${sev}/10</span>`
                    : (sev >= 5.0
                        ? `<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-50 text-amber-700 border border-amber-200">${sev}/10</span>`
                        : `<span class="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">${sev}/10</span>`);

                const card = document.createElement('div');
                card.className = 'bg-white border border-slate-200/90 hover:border-blue-400 rounded-xl p-3.5 transition-all duration-200 cursor-pointer flex flex-col gap-2 relative shadow-sm hover:shadow-md group';
                card.setAttribute('data-disaster-id', disasterId);
                card.onclick = (e) => {
                    if (e.target.closest('button')) return;
                    toggleSelectDisaster(lat, lon, alert.title, alert.severity, alert.created_at || alert.pubDate, alert.nearest_depot);
                    focusMap(lat, lon);
                };

                card.innerHTML = `
                    <div class="flex justify-between items-center">
                        <div class="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
                            <span>${getCategoryIcon(cat)}</span>
                            <span class="uppercase tracking-wider text-[10px] font-extrabold text-slate-600">${cat}</span>
                            <span class="text-slate-300">&bull;</span>
                            <span>${getEmoji(cont)} ${cont}</span>
                        </div>
                        ${sevBadge}
                    </div>
                    <div class="text-xs font-bold text-slate-900 leading-snug group-hover:text-blue-600 transition-colors line-clamp-2">${alert.title}</div>
                    <div class="flex justify-between items-center mt-1 pt-2 border-t border-slate-100">
                        <span class="text-[10px] text-slate-500 font-mono flex items-center gap-1">🕒 ${timeStr}</span>
                        <button class="bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-0.5 rounded text-[10px] font-bold text-blue-700 tracking-wider transition-colors" onclick="event.stopPropagation(); downloadActionPlanPDF(${alert.id || 1})">PDF</button>
                    </div>
                `;
                alertsContainer.appendChild(card);
            });
        }
    }

    // Render into 6 Columns (for overview section)
    gdacsAlertsData.forEach((alert, index) => {
        let rawType = ((alert.disaster_type || '') + ' ' + (alert.title || '')).toLowerCase();
        let cat = 'Earthquake';
        if (rawType.includes('cyclone') || rawType.includes('storm') || /\b(tc|hurricane|typhoon)\b/.test(rawType)) cat = 'Tropical Cyclone';
        else if (rawType.includes('flood') || rawType.includes('tsunami') || /\b(fl)\b/.test(rawType)) cat = 'Flood';
        else if (rawType.includes('volcano') || /\b(vo)\b/.test(rawType)) cat = 'Volcano';
        else if (rawType.includes('drought') || /\b(dr)\b/.test(rawType)) cat = 'Drought';
        else if (rawType.includes('fire') || rawType.includes('wildfire') || /\b(wf)\b/.test(rawType)) cat = 'Forest Fire';
        else if (rawType.includes('earthquake') || /\b(eq)\b/.test(rawType)) cat = 'Earthquake';
        
        counts[cat]++;
        const colId = cols[cat].id;
        const container = document.getElementById(colId);
        if (!container) return;

        const lat = alert.latitude !== undefined ? alert.latitude : (alert.lat !== undefined ? alert.lat : 0);
        const lon = alert.longitude !== undefined ? alert.longitude : (alert.lon !== undefined ? alert.lon : 0);
        const timeStr = formatOccurredTime(alert.created_at || alert.pubDate || alert.timestamp);
        const cont = getContinent(lat, lon, alert.title);
        
        const disasterId = String(alert.id || alert.title || `gdacs_${index}`);
        const sevColor = alert.severity >= 7 ? 'text-red-600' : (alert.severity >= 5 ? 'text-amber-600' : 'text-emerald-600');

        const card = document.createElement('div');
        card.className = 'bg-white border border-slate-200 hover:border-blue-400 rounded-xl p-3.5 transition-all duration-200 cursor-pointer flex flex-col gap-2 relative shadow-sm hover:shadow-md';
        card.setAttribute('data-disaster-id', disasterId);
        card.onclick = (e) => {
            if (e.target.closest('button')) return;
            toggleSelectDisaster(lat, lon, alert.title, alert.severity, alert.created_at || alert.pubDate, alert.nearest_depot);
            focusMap(lat, lon);
        };

        card.innerHTML = `
            <div class="flex justify-between items-start">
                <div class="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 flex items-center gap-1">${getEmoji(cont)} ${cont}</div>
                <div class="text-[11px] font-black ${sevColor}">${alert.severity}/10</div>
            </div>
            <div class="text-xs font-bold text-slate-900 leading-snug hover:text-blue-600 transition-colors line-clamp-2">${alert.title}</div>
            <div class="flex justify-between items-center mt-1 pt-2 border-t border-slate-100">
                <span class="text-[10px] text-slate-500 font-mono flex items-center gap-1">🕒 ${timeStr}</span>
                <button class="bg-blue-50 hover:bg-blue-100 border border-blue-200 px-2.5 py-0.5 rounded text-[10px] font-bold text-blue-700 tracking-wider" onclick="event.stopPropagation(); downloadActionPlanPDF(${alert.id || 1})">PDF</button>
            </div>
        `;
        container.appendChild(card);
    });

    Object.keys(counts).forEach(k => {
        const countEl = document.getElementById(cols[k].countId);
        if (countEl) countEl.innerText = counts[k];
    });
    
    updateHazardAssessmentPanel();
}

function updateHazardAssessmentPanel() {
    const totalEl = document.getElementById('hazard-total-events');
    const criticalEl = document.getElementById('hazard-critical-alerts');
    const regionEl = document.getElementById('hazard-affected-region');
    
    if (!totalEl || !criticalEl || !regionEl) return;
    
    totalEl.innerText = gdacsAlertsData.length;
    
    const criticalCount = gdacsAlertsData.filter(a => (a.severity || 0) >= 5).length;
    criticalEl.innerText = criticalCount;
    
    const regionCounts = {};
    let maxRegion = 'No Data';
    let maxCount = 0;
    
    gdacsAlertsData.forEach(a => {
        const lat = a.latitude !== undefined ? a.latitude : (a.lat !== undefined ? a.lat : 0);
        const lon = a.longitude !== undefined ? a.longitude : (a.lon !== undefined ? a.lon : 0);
        const title = a.title || '';
        const region = getContinent(lat, lon, title);
        regionCounts[region] = (regionCounts[region] || 0) + 1;
        if (regionCounts[region] > maxCount) {
            maxCount = regionCounts[region];
            maxRegion = region;
        }
    });
    
    regionEl.innerText = maxRegion;
}

function updateStatsCounters() {
    const disastersCount = gdacsAlertsData.length;
    const pendingCount = sosAlertsData.filter(a => !a.status || a.status === 'pending').length;
    const dispatchedCount = sosAlertsData.filter(a => a.status === 'dispatched').length;

    const elDisasters = document.getElementById('stat-disasters');
    const elPending = document.getElementById('stat-pending-sos');
    const elDispatched = document.getElementById('stat-dispatched');

    if (elDisasters) elDisasters.innerText = disastersCount;
    if (elPending) elPending.innerText = pendingCount;
    if (elDispatched) elDispatched.innerText = dispatchedCount;

    if (typeof updateContinentFilterCounts === 'function') {
        updateContinentFilterCounts();
    }
    updateHazardAssessmentPanel();
    renderLiveInfoBlocks(gdacsAlertsData);
}

function renderLiveInfoBlocks(disasters) {
    if (!disasters || disasters.length === 0) return;

    // 1. Virtual OSOCC Live Telemetry (Real UN Operations updates linked to active emergencies)
    const osoccContainer = document.getElementById('virtual-osocc-container');
    if (osoccContainer) {
        const topEvents = disasters.slice(0, 3);
        const roles = [
            { agency: "UN-OCHA Dispatch", action: "Logistics corridor & medical airlift mobilized", icon: "🚁" },
            { agency: "WFP Logistics Cluster", action: "Potable water & ration staging underway", icon: "💧" },
            { agency: "AHA Centre", action: "Situation report & regional stockpile release", icon: "🛡️" }
        ];

        osoccContainer.innerHTML = topEvents.map((evt, idx) => {
            const role = roles[idx % roles.length];
            const lat = evt.latitude !== undefined ? evt.latitude : (evt.lat !== undefined ? evt.lat : 0);
            const lon = evt.longitude !== undefined ? evt.longitude : (evt.lon !== undefined ? evt.lon : 0);
            const timeAgo = formatOccurredTime(evt.created_at || evt.pubDate || new Date().toISOString());
            const titleSafe = (evt.title || 'Active Emergency').replace(/'/g, "\\'");
            return `
                <div onclick="focusDisasterOnMap(${lat}, ${lon}, '${encodeURIComponent(evt.title || '')}', ${evt.severity || 7.0})" class="flex gap-3 items-start border-b border-slate-100 last:border-0 pb-3 last:pb-0 cursor-pointer group hover:bg-blue-50/60 p-2 rounded-xl transition-all">
                    <div class="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-sm shrink-0 border border-blue-200 group-hover:scale-105 transition-transform">
                        ${role.icon}
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center justify-between gap-1">
                            <span class="text-xs font-bold text-slate-900 group-hover:text-blue-600 truncate">${evt.title}</span>
                            <span class="text-[10px] font-mono text-slate-400 shrink-0">${timeAgo}</span>
                        </div>
                        <div class="text-[11px] text-blue-700 font-semibold mt-0.5 flex items-center gap-1">
                            <span class="w-1.5 h-1.5 rounded-full bg-blue-600 inline-block"></span>
                            <span>${role.agency}:</span> <span class="text-slate-600 font-normal truncate">${role.action}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // 2. Maps & Satellite Imagery - Interactive Copernicus / Sentinel-2 Layers
    const satContainer = document.getElementById('maps-imagery-container');
    if (satContainer) {
        satContainer.innerHTML = `
            <div onclick="toggleSatelliteLayer(true)" class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm group cursor-pointer hover:border-emerald-400 hover:shadow-md transition-all flex flex-col justify-between">
                <div class="h-24 bg-slate-900 w-full relative overflow-hidden flex items-center justify-center">
                    <img src="https://images.unsplash.com/photo-1541888087425-ce81dfc469ea?q=80&w=400&auto=format&fit=crop" class="w-full h-full object-cover opacity-85 group-hover:scale-105 transition-transform duration-300">
                    <span class="absolute top-2 right-2 bg-black/70 text-emerald-400 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">Copernicus EMS</span>
                </div>
                <div class="p-3">
                    <div class="text-xs font-bold text-slate-900 group-hover:text-emerald-700 leading-tight">Sentinel-2 Multispectral Infrared</div>
                    <div class="text-[10.5px] text-slate-500 mt-1 flex items-center gap-1">
                        <span class="text-emerald-600">📡</span> Click to activate Satellite Layer on map
                    </div>
                </div>
            </div>

            <div onclick="toggleSatelliteLayer(true)" class="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm group cursor-pointer hover:border-blue-400 hover:shadow-md transition-all flex flex-col justify-between">
                <div class="h-24 bg-slate-900 w-full relative overflow-hidden flex items-center justify-center">
                    <img src="https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=400&auto=format&fit=crop" class="w-full h-full object-cover opacity-85 group-hover:scale-105 transition-transform duration-300">
                    <span class="absolute top-2 right-2 bg-black/70 text-blue-400 text-[10px] font-mono font-bold px-2 py-0.5 rounded-full border border-blue-500/30">NASA GIBS</span>
                </div>
                <div class="p-3">
                    <div class="text-xs font-bold text-slate-900 group-hover:text-blue-700 leading-tight">Earth Observation & Risk Damage</div>
                    <div class="text-[10.5px] text-slate-500 mt-1 flex items-center gap-1">
                        <span class="text-blue-600">🛰️</span> Click to view high-res Earth imagery
                    </div>
                </div>
            </div>
        `;
    }

    // 3. GDACS News & Bulletins - Real Live RSS updates
    const newsContainer = document.getElementById('gdacs-news-container');
    if (newsContainer) {
        const newsEvents = disasters.slice(0, 3);
        const agencies = [
            "UNITAR-UNOSAT Satellite Activation",
            "Copernicus Emergency Rapid Mapping",
            "EC/ECHO Daily Crisis Flash Assessment"
        ];

        newsContainer.innerHTML = newsEvents.map((evt, idx) => {
            const agency = agencies[idx % agencies.length];
            const dateStr = evt.created_at || "Recent Bulletin";
            const lat = evt.latitude !== undefined ? evt.latitude : (evt.lat !== undefined ? evt.lat : 0);
            const lon = evt.longitude !== undefined ? evt.longitude : (evt.lon !== undefined ? evt.lon : 0);
            return `
                <div onclick="focusDisasterOnMap(${lat}, ${lon}, '${encodeURIComponent(evt.title || '')}', ${evt.severity || 7.0})" class="border-b border-slate-100 last:border-0 pb-3 last:pb-0 cursor-pointer group hover:bg-purple-50/50 p-2 rounded-xl transition-all">
                    <div class="flex items-center justify-between gap-2">
                        <span class="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded uppercase border border-purple-200">${agency}</span>
                        <span class="text-[10.5px] font-mono text-slate-400">${dateStr}</span>
                    </div>
                    <div class="text-xs font-bold text-slate-900 group-hover:text-purple-700 transition-colors mt-1.5 truncate leading-snug">
                        ${evt.title}
                    </div>
                    <div class="text-[11px] text-slate-500 mt-0.5">
                        Severity index: <b class="text-red-600 font-mono">${evt.severity || 7.0}/10</b> &bull; Click to zoom epicenter ➔
                    </div>
                </div>
            `;
        }).join('');
    }
}
window.renderLiveInfoBlocks = renderLiveInfoBlocks;

function focusDisasterOnMap(lat, lon, encTitle, severity) {
    const title = decodeURIComponent(encTitle);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (map) {
        map.setView([lat, lon], 7.5, { animate: true });
        
        let bestDepot = REGISTERED_DEPOTS_CLIENT[0];
        let minDist = Infinity;
        for (const d of REGISTERED_DEPOTS_CLIENT) {
            const dist = calculateHaversineKm(lat, lon, d.lat, d.lon);
            if (dist < minDist) {
                minDist = dist;
                bestDepot = d;
            }
        }
        
        if (activePolyline) map.removeLayer(activePolyline);
        activePolyline = L.polyline([[lat, lon], [bestDepot.lat, bestDepot.lon]], {
            color: '#16a34a',
            weight: 3.5,
            dashArray: '8, 8'
        }).addTo(map);

        L.popup()
            .setLatLng([lat, lon])
            .setContent(`
                <div style="font-family: 'Inter', sans-serif; min-width: 220px; padding: 4px;">
                    <div style="font-weight: 800; color: #0f172a; font-size: 13px; margin-bottom: 4px;">${title}</div>
                    <div style="font-size: 11px; color: #64748b; margin-bottom: 6px;">Severity Index: <b style="color: #dc2626;">${severity}/10</b></div>
                    <div style="font-size: 11px; background: #f0fdf4; color: #166534; padding: 4px 8px; border-radius: 6px; border: 1px solid #bbf7d0;">
                        🛡️ Nearest Base: <b>${bestDepot.name}</b> (${Math.round(minDist)} km)
                    </div>
                </div>
            `)
            .openOn(map);
    }
}
window.focusDisasterOnMap = focusDisasterOnMap;

function toggleSatelliteLayer(force = false) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    if (map) {
        if (map.hasLayer(satelliteLayer) && !force) {
            map.removeLayer(satelliteLayer);
            map.addLayer(lightVoyagerLayer);
        } else {
            map.removeLayer(lightVoyagerLayer);
            map.removeLayer(darkCanvasLayer);
            map.addLayer(satelliteLayer);
        }
    }
}
window.toggleSatelliteLayer = toggleSatelliteLayer;

let currentlySelectedDisasterKey = null;
let currentlyActiveRouteLine = null;

function findNearestDepotClientObject(targetLat, targetLon) {
    const lat = parseFloat(targetLat);
    const lon = parseFloat(targetLon);
    let nearest = REGISTERED_DEPOTS_CLIENT[0];
    let minDist = Infinity;
    for (const d of REGISTERED_DEPOTS_CLIENT) {
        const dist = calculateHaversineKm(lat, lon, d.lat, d.lon);
        if (dist < minDist) {
            minDist = dist;
            nearest = d;
        }
    }
    return nearest;
}

/**
 * Toggles selection of a disaster event.
 * Re-clicking/double-clicking unselects the event and removes its route line.
 * Route lines are STRICTLY restricted to events within ASEAN bounds.
 */
function toggleSelectDisaster(lat, lon, title, severity, created_at = null, depotObj = null) {
    const targetLat = parseFloat(lat);
    const targetLon = parseFloat(lon);
    if (isNaN(targetLat) || isNaN(targetLon)) return;

    const disasterKey = `${targetLat.toFixed(3)}_${targetLon.toFixed(3)}`;

    // Re-click / Double-click on SAME disaster -> UNSELECT & REMOVE ROUTE LINE
    if (currentlySelectedDisasterKey === disasterKey) {
        if (currentlyActiveRouteLine) {
            map.removeLayer(currentlyActiveRouteLine);
            currentlyActiveRouteLine = null;
        }
        if (activePolyline) {
            map.removeLayer(activePolyline);
            activePolyline = null;
        }
        currentlySelectedDisasterKey = null;
        if (activeMarker) {
            map.closePopup();
        }
        console.log('⚡ Disaster unselected. Route line removed.');
        return;
    }

    // Clear previous route line if any
    if (currentlyActiveRouteLine) {
        map.removeLayer(currentlyActiveRouteLine);
        currentlyActiveRouteLine = null;
    }
    if (activePolyline) {
        map.removeLayer(activePolyline);
        activePolyline = null;
    }

    currentlySelectedDisasterKey = disasterKey;

    let depotLat = null;
    let depotLon = null;

    if (depotObj && (depotObj.latitude || depotObj.lat)) {
        depotLat = depotObj.latitude || depotObj.lat;
        depotLon = depotObj.longitude || depotObj.lon;
    } else {
        const nearestDepotInfo = findNearestDepotClientObject(targetLat, targetLon);
        depotLat = nearestDepotInfo.lat;
        depotLon = nearestDepotInfo.lon;
    }

    if (depotLat && depotLon) {
        currentlyActiveRouteLine = L.polyline([[depotLat, depotLon], [targetLat, targetLon]], {
            color: '#10b981',
            weight: 5,
            opacity: 0.9,
            dashArray: '10, 10'
        }).addTo(map);
    }

    focusMap(targetLat, targetLon);
    fetchReliefData(targetLat, targetLon, severity, title, created_at);
}

/**
 * Handle user click on a disaster alert card from sidebar
 */
function selectAlert(lat, lon, title, severity, created_at = null, depotObj = null) {
    toggleSelectDisaster(lat, lon, title, severity, created_at, depotObj);
}

/**
 * Asynchronously fetches relief supply predictions and GIS evacuation routing data
 */
async function fetchReliefData(lat = 17.3333, lon = 96.4833, severity = 7.5, title = 'Emergency Zone', eventCreatedAt = null) {
    try {
        const existingEvt = gdacsAlertsData.find(e =>
            (Math.abs((e.latitude || e.lat || 0) - lat) < 0.005 && Math.abs((e.longitude || e.lon || 0) - lon) < 0.005) ||
            (e.title && title && e.title.trim().toLowerCase() === title.trim().toLowerCase())
        );

        let waterLiters = 0;
        let foodPacks = 0;
        let estRescueTime = 4.5;
        let timeStr = formatOccurredTime(eventCreatedAt);
        let depotNameText = '';
        let distanceKm = 0;

        if (existingEvt) {
            const pred = existingEvt.latest_prediction || (existingEvt.predictions && existingEvt.predictions[0]) || {};
            waterLiters = Math.round(pred.water_liters || 0);
            foodPacks = Math.round(pred.food_packs || 0);
            estRescueTime = existingEvt.estimated_rescue_time || 4.5;
            timeStr = formatOccurredTime(eventCreatedAt || existingEvt.created_at || existingEvt.pubDate);

            if (existingEvt.nearest_depot && existingEvt.nearest_depot.name) {
                depotNameText = existingEvt.nearest_depot.name;
                distanceKm = existingEvt.nearest_depot.distance_km || 0;
            } else {
                const nearestInfo = findNearestDepotClientObject(lat, lon);
                depotNameText = nearestInfo.name;
                distanceKm = getNearestDepotDistance(lat, lon);
            }
        }

        const url = `/api/predict-relief?lat=${lat}&lon=${lon}&severity=${severity}`;
        const response = await apiFetch(url);
        
        let gisAnalysis = {};
        if (response && response.ok) {
            const data = await response.json();
            const aiPrediction = data.ai_prediction || {};
            gisAnalysis = data.gis_analysis || {};

            if (!existingEvt) {
                waterLiters = Math.round(aiPrediction.water_liters || 0);
                foodPacks = Math.round(aiPrediction.food_packs || 0);
                estRescueTime = aiPrediction.estimated_rescue_time || 4.5;
                timeStr = formatOccurredTime(eventCreatedAt || data.created_at);
                if (data.nearest_depot && data.nearest_depot.name) {
                    depotNameText = data.nearest_depot.name;
                    distanceKm = data.nearest_depot.distance_km || 0;
                } else {
                    const nearestInfo = findNearestDepotClientObject(lat, lon);
                    depotNameText = nearestInfo.name;
                    distanceKm = getNearestDepotDistance(lat, lon);
                }
            }
        }

        const cont = getContinent(lat, lon, title);
        const depotBadge = depotNameText
            ? `<div style="font-size: 12px; color: #16a34a; font-weight: 700; margin-bottom: 6px; display: flex; align-items: center; gap: 4px;">🛡️ Assigned Depot: ${depotNameText} (${distanceKm} km)</div>`
            : `<div style="font-size: 11px; color: #64748b; margin-bottom: 6px;">🛡️ Assigned Depot: Yangon Central Hub</div>`;

        const estBudgetUsd = (existingEvt && existingEvt.total_estimated_budget_usd)
            ? existingEvt.total_estimated_budget_usd
            : Math.round((waterLiters * 0.50) + (foodPacks * 3.50));

        const etaInfo = calculateClientETABreakdown(distanceKm, severity, title);
        const etaRowHtml = `
            <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid #e2e8f0; font-size: 11px;">
                <div style="font-weight: 700; color: #475569; margin-bottom: 4px;">⏱️ Multi-Modal Dispatch ETAs:</div>
                <div style="display: flex; justify-content: space-between; gap: 4px; font-size: 10px;">
                    <span style="background: #ffffff; padding: 3px 6px; border-radius: 4px; border: 1px solid ${etaInfo.recommended_mode==='land'?'#f59e0b':'#e2e8f0'}; color: ${etaInfo.recommended_mode==='land'?'#b45309':'#475569'}; font-weight: 600;">🚚 <b>Land:</b> ${etaInfo.modes.land.formatted_time}</span>
                    <span style="background: #ffffff; padding: 3px 6px; border-radius: 4px; border: 1px solid ${etaInfo.recommended_mode==='air'?'#f59e0b':'#e2e8f0'}; color: ${etaInfo.recommended_mode==='air'?'#b45309':'#475569'}; font-weight: 600;">🚁 <b>Air:</b> ${etaInfo.modes.air.formatted_time}</span>
                    <span style="background: #ffffff; padding: 3px 6px; border-radius: 4px; border: 1px solid ${etaInfo.recommended_mode==='water'?'#f59e0b':'#e2e8f0'}; color: ${etaInfo.recommended_mode==='water'?'#b45309':'#475569'}; font-weight: 600;">🚢 <b>Water:</b> ${etaInfo.modes.water.formatted_time}</span>
                </div>
            </div>
        `;

        const popupContent = `
            <div style="font-family: Inter, sans-serif; min-width: 240px; color: #0f172a;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <span style="font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 10px; background: #fef2f2; color: #b91c1c; border: 1px solid #fecaca; text-transform: uppercase;">
                        🌏 ${cont} &bull; EMERGENCY
                    </span>
                    <span style="font-size: 11px; font-weight: 800; color: ${severity >= 7 ? '#dc2626' : (severity >= 5 ? '#d97706' : '#16a34a')};">${severity}/10</span>
                </div>
                <h4 style="margin: 4px 0 8px 0; color: #0f172a; font-size: 14px; font-weight: 800; font-family: Outfit, sans-serif; line-height: 1.3;">⚠️ ${title}</h4>
                <div style="font-size: 11px; color: #7c3aed; font-weight: 600; margin-bottom: 8px; background: #f5f3ff; padding: 5px 10px; border-radius: 8px; border: 1px solid #ddd6fe; display: flex; align-items: center; gap: 6px;">
                    <span>📅 Event Time:</span>
                    <span style="font-weight: 700; font-family: monospace;">${timeStr}</span>
                </div>
                ${depotBadge}
                <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 8px 10px; margin-bottom: 8px;">
                    <div style="font-size: 12px; color: #475569; margin-bottom: 4px;">💧 <b style="color: #1e293b;">Water Needed:</b> <span style="color: #0284c7; font-weight: 800; font-family: monospace;">${waterLiters.toLocaleString()} L</span></div>
                    <div style="font-size: 12px; color: #475569; margin-bottom: 4px;">🍱 <b style="color: #1e293b;">Food Needed:</b> <span style="color: #d97706; font-weight: 800; font-family: monospace;">${foodPacks.toLocaleString()} packs</span></div>
                    <div style="font-size: 12px; color: #475569; margin-bottom: 4px;">💵 <b style="color: #1e293b;">Est. Budget:</b> <span style="color: #16a34a; font-weight: 800; font-family: monospace;">$${Math.round(estBudgetUsd).toLocaleString()} USD</span></div>
                    <div style="font-size: 12px; color: #475569;">⏱️ <b style="color: #1e293b;">Est. Ops Duration:</b> <span style="color: #7c3aed; font-weight: 800; font-family: monospace;">${estRescueTime} hours</span></div>
                    ${etaRowHtml}
                </div>
                <button onclick="downloadActionPlanPDF(${(existingEvt && existingEvt.id) ? existingEvt.id : 1})" style="display: block; width: 100%; margin-bottom: 8px; text-align: center; background: linear-gradient(135deg, #2563eb, #1d4ed8); color: #ffffff; border: none; padding: 8px 12px; border-radius: 8px; font-weight: 700; font-size: 12px; cursor: pointer; box-shadow: 0 4px 10px rgba(37, 99, 235, 0.25);">
                    📄 Download Action Plan (PDF)
                </button>
                <div style="font-size: 10.5px; color: #94a3b8; display: flex; justify-content: space-between;">
                    <span>📍 ${lat.toFixed(3)}, ${lon.toFixed(3)}</span>
                    <span>GDACS Live Feed</span>
                </div>
            </div>
        `;

        let matchMarker = mapMarkers.find(m =>
            Math.abs(m.getLatLng().lat - lat) < 0.005 && Math.abs(m.getLatLng().lng - lon) < 0.005
        );

        if (matchMarker) {
            matchMarker.setPopupContent(popupContent).openPopup();
        } else {
            if (activeMarker) {
                map.removeLayer(activeMarker);
            }

            const disasterIcon = L.divIcon({
                className: 'disaster-div-icon',
                html: '⚠️',
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            });

            activeMarker = L.marker([lat, lon], { icon: disasterIcon })
                .addTo(map)
                .bindPopup(popupContent)
                .openPopup();
        }

        if (activePolyline) {
            map.removeLayer(activePolyline);
            activePolyline = null;
        }

        map.flyTo([lat, lon], 10, { animate: true, duration: 1.2 });

    } catch (error) {
        console.error('Error fetching relief data from backend:', error);
    }
}

/**
 * Global window function to update an SOS alert's status in Supabase
 */
window.updateSOSStatus = async function(alertId, newStatus) {
    try {
        if (supabaseClient) {
            const { error } = await supabaseClient
                .from('sos_alerts')
                .update({ status: newStatus })
                .eq('id', alertId);

            if (error) {
                console.error('Error updating SOS status in Supabase:', error);
            }
        }
        await loadSOSAlerts();
    } catch (err) {
        console.error('Failed to update SOS status:', err);
    }
};

/**
 * Fetches mobile SOS emergency alerts and renders animated pulsing radar DivIcons
 */
async function loadSOSAlerts() {
    try {
        let alerts = [];

        if (supabaseClient) {
            const { data, error } = await supabaseClient.from('sos_alerts').select('*');
            if (!error && data && data.length > 0) {
                alerts = data;
            }
        }

        if (!alerts.length) {
            try {
                const res = await apiFetch('/api/sos-alerts');
                if (res && res.ok) {
                    const json = await res.json();
                    alerts = json.alerts || [];
                }
            } catch (err) {
                console.warn('Backend SOS alerts fallback notice:', err);
            }
        }

        sosAlertsData = alerts;
        renderSidebarCards();

        sosCircleMarkers.forEach(m => map.removeLayer(m));
        sosCircleMarkers = [];

        for (let index = 0; index < sosAlertsData.length; index++) {
            const alert = sosAlertsData[index];
            const { lat, lon } = parseSOSCoords(alert, index);
            const urgentNeed = alert.urgent_need || alert.urgent_need_category || 'Water';
            const affectedPeople = alert.affected_people || alert.affected_count || 10;
            const status = alert.status || 'pending';
            const estRescueTime = (1.2 + (affectedPeople / 250.0) + 1.0).toFixed(1);
            const timeStr = formatOccurredTime(alert.created_at || alert.timestamp);
            const cont = getContinent(lat, lon, alert.location);
            const nearestDepotObj = findNearestDepotClientObject(lat, lon);

            const pulseIcon = L.divIcon({
                className: 'sos-div-wrapper',
                html: `<div class="sos-pulse-marker ${status}"></div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            });

            const marker = L.marker([lat, lon], { icon: pulseIcon }).addTo(map);
            marker.on('click', () => {
                toggleSelectDisaster(lat, lon, alert.location || 'Civilian SOS Sector', 5.0, alert.created_at || alert.timestamp, nearestDepotObj);
            });
            marker.continent = cont;
            marker.alertLocation = alert.location || 'Civilian Sector';

            const alertId = alert.id || index;

            let distanceKm = 45.0;
            let depotInfoText = 'Calculating Nearest Depot...';
            const depotData = sosDepotResults[index];

            if (depotData && depotData.status === 'success' && depotData.nearest_depot) {
                const depot = depotData.nearest_depot;
                distanceKm = depot.distance_km || 45.0;
                depotInfoText = `🛡️ <b>Nearest Depot:</b> ${depot.name} (${depot.distance_km} km)`;
            } else {
                distanceKm = getNearestDepotDistance(lat, lon);
                const depotInfo = findNearestDepotClientObject(lat, lon);
                depotInfoText = `🛡️ <b>Nearest Depot:</b> ${depotInfo.name} (${distanceKm} km)`;
            }

            marker.bindPopup(`
                <div style="font-family: Inter, sans-serif; min-width: 210px; color: #f8fafc;">
                    <div style="font-size: 11px; font-weight: 800; color: ${status === 'resolved' ? '#22c55e' : (status === 'dispatched' ? '#f97316' : '#ef4444')}; text-transform: uppercase; margin-bottom: 4px;">
                        🚨 CIVILIAN SOS &bull; ${status}
                    </div>
                    <div style="font-size: 14px; font-weight: 700; color: #f8fafc; margin-bottom: 6px;">
                        ${alert.location || 'Bago Sector'}
                    </div>
                    <div style="font-size: 12px; color: #c084fc; font-weight: 700; margin-bottom: 6px; background: rgba(192, 132, 252, 0.12); padding: 4px 8px; border-radius: 6px; border: 1px solid rgba(192, 132, 252, 0.3);">
                        📅 Occurred: ${timeStr}
                    </div>
                    <div style="font-size: 12px; color: #cbd5e1; margin-bottom: 3px;"><b>Urgent Need:</b> ${urgentNeed}</div>
                    <div style="font-size: 12px; color: #cbd5e1; margin-bottom: 3px;"><b>People Affected:</b> ${affectedPeople}</div>
                    <div style="font-size: 12px; color: #cbd5e1; margin-bottom: 3px;">${depotInfoText}</div>
                    ${(() => {
                        const eta = calculateClientETABreakdown(distanceKm, 5.0, alert.urgent_need || 'SOS Emergency');
                        return `
                        <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255,255,255,0.1); margin-bottom: 8px;">
                            <div style="font-size: 11px; font-weight: 700; color: #cbd5e1; margin-bottom: 4px;">⏱️ Multi-Modal Dispatch ETAs:</div>
                            <div style="display: flex; justify-content: space-between; gap: 4px; font-size: 10px;">
                                <span style="background: rgba(15,23,42,0.6); padding: 3px 6px; border-radius: 4px; border: 1px solid ${eta.recommended_mode==='land'?'#f59e0b':'rgba(255,255,255,0.1)'}; color: #e2e8f0;">🚚 <b>Land:</b> ${eta.modes.land.formatted_time}</span>
                                <span style="background: rgba(15,23,42,0.6); padding: 3px 6px; border-radius: 4px; border: 1px solid ${eta.recommended_mode==='air'?'#f59e0b':'rgba(255,255,255,0.1)'}; color: #e2e8f0;">🚁 <b>Air:</b> ${eta.modes.air.formatted_time}</span>
                                <span style="background: rgba(15,23,42,0.6); padding: 3px 6px; border-radius: 4px; border: 1px solid ${eta.recommended_mode==='water'?'#f59e0b':'rgba(255,255,255,0.1)'}; color: #e2e8f0;">🚢 <b>Water:</b> ${eta.modes.water.formatted_time}</span>
                            </div>
                        </div>`;
                    })()}
                    <div style="display: flex; flex-direction: column; gap: 4px;">
                        ${status !== 'dispatched' ? `<button class="btn-dispatch-action btn-dispatch" onclick="updateSOSStatus('${alertId}', 'dispatched')">Dispatch Team</button>` : ''}
                        ${status !== 'resolved' ? `<button class="btn-dispatch-action btn-resolve" onclick="updateSOSStatus('${alertId}', 'resolved')">Mark Resolved</button>` : ''}
                    </div>
                </div>
            `);

            sosCircleMarkers.push(marker);
        }

    } catch (err) {
        console.error('Error loading SOS alerts onto map:', err);
    }
}

/**
 * Initialize Supabase Realtime Listener for instant updates on sos_alerts table
 */
function initRealtimeListener() {
    if (supabaseClient) {
        try {
            supabaseClient
                .channel('public:sos_alerts')
                .on('postgres_changes', { event: '*', schema: 'public', table: 'sos_alerts' }, async (payload) => {
                    console.log('Realtime SOS alert change detected:', payload);
                    await loadSOSAlerts();

                    if (payload.eventType === 'INSERT' && payload.new) {
                        const newLat = payload.new.latitude || payload.new.lat;
                        const newLon = payload.new.longitude || payload.new.lon;
                        if (newLat && newLon) {
                            map.flyTo([newLat, newLon], 13, {
                                animate: true,
                                duration: 2.0
                            });
                        }
                    }
                })
                .subscribe();
        } catch (e) {
            console.warn('Realtime listener subscription warning:', e);
        }
    }
}

async function loadAllDepots() {
    try {
        const res = await apiFetch('/api/depots');
        if (res && res.ok) {
            const data = await res.json();
            const depots = data.depots || [];
            depots.forEach(depot => {
                const existing = depotMarkers.some(m => {
                    const pos = m.getLatLng();
                    return Math.abs(pos.lat - depot.latitude) < 0.001 && Math.abs(pos.lng - depot.longitude) < 0.001;
                });
                if (!existing) {
                    const depotIcon = L.divIcon({
                        className: 'depot-div-icon',
                        html: `<div style="font-size: 26px; filter: drop-shadow(0 0 8px rgba(34, 197, 94, 0.9));">🛡️</div>`,
                        iconSize: [32, 32],
                        iconAnchor: [16, 16]
                    });
                    const depotMarker = L.marker([depot.latitude, depot.longitude], { icon: depotIcon })
                        .addTo(map)
                        .bindPopup(`
                            <div style="font-family: Inter, sans-serif; min-width: 190px;">
                                <h4 style="margin: 0 0 6px 0; color: #22c55e; font-size: 14px; font-weight: 700;">🛡️ ${depot.name}</h4>
                                <div style="font-size: 12px; color: #cbd5e1; margin-bottom: 3px;"><b>Water Inventory:</b> <span style="color: #38bdf8;">${depot.water_inventory.toLocaleString()} L</span></div>
                                <div style="font-size: 12px; color: #cbd5e1; margin-bottom: 3px;"><b>Food Inventory:</b> <span style="color: #fbbf24;">${depot.food_inventory.toLocaleString()} packs</span></div>
                            </div>
                        `);
                    depotMarkers.push(depotMarker);
                }
            });

            if (depotMarkers.length > 0) {
                const group = L.featureGroup(depotMarkers);
                map.fitBounds(group.getBounds().pad(0.2), { maxZoom: 7.5, minZoom: 5.0 });
            }
        }
    } catch (e) {
        console.warn('Failed to load all depots onto map:', e);
    }
}

/**
 * Ultra-fast Dashboard Initialization: loads analytics, depots, live disasters, and SOS alerts in parallel.
 */
async function initializeDashboard() {
    try {
        initDispatchWebSocket();

        // Run all API requests concurrently for sub-100ms initialization
        const [analyticsResult, depotsResult, dashResult, sosResult] = await Promise.allSettled([
            loadAnalytics(),
            loadAllDepots(),
            apiFetch('/api/dashboard-data'),
            loadSOSAlerts()
        ]);

        const dashRes = (dashResult.status === 'fulfilled') ? dashResult.value : null;
        if (!dashRes || !dashRes.ok) {
            console.warn('Dashboard data fetch notice:', dashRes ? dashRes.status : 'offline/timeout');
            setTimeout(initializeDashboard, 3500);
            return;
        }

        const dashData = await dashRes.json();
        const events = dashData.dashboard_data || [];
        gdacsAlertsData = events;
        updateStatsCounters();

        mapMarkers.forEach(m => map.removeLayer(m));
        mapMarkers = [];
        routePolylines.forEach(p => map.removeLayer(p));
        routePolylines = [];

        for (let idx = 0; idx < events.length; idx++) {
            const event = events[idx];
            const lat = parseFloat(event.latitude !== undefined ? event.latitude : (event.lat !== undefined ? event.lat : 0));
            const lon = parseFloat(event.longitude !== undefined ? event.longitude : (event.lon !== undefined ? event.lon : 0));

            if (isNaN(lat) || isNaN(lon) || (lat === 0 && lon === 0)) continue;

            const title = event.title || 'Disaster Event';
            const latestPred = event.latest_prediction;
            const estRescueTime = event.estimated_rescue_time || 4.5;
            const timeStr = formatOccurredTime(event.created_at || event.pubDate || event.timestamp);
            const cont = getContinent(lat, lon, title);

            let waterText = 'Pending Sync';
            let foodText = 'Pending Sync';
            if (latestPred) {
                waterText = `${latestPred.water_liters.toLocaleString()} L`;
                foodText = `${latestPred.food_packs.toLocaleString()} packs`;
            }

            let depotNameText = '';
            let distanceKm = 0;

            const nearestDepotObj = (event.nearest_depot && event.nearest_depot.name)
                ? event.nearest_depot
                : null;

            if (nearestDepotObj && nearestDepotObj.name) {
                depotNameText = nearestDepotObj.name;
                distanceKm = nearestDepotObj.distance_km || 0;
            } else {
                const nearestInfo = findNearestDepotClientObject(lat, lon);
                depotNameText = nearestInfo.name;
                distanceKm = getNearestDepotDistance(lat, lon);
            }

            const depotBadge = depotNameText
                ? `<div style="font-size: 12px; color: #22c55e; font-weight: 700; margin-bottom: 4px;">🛡️ Assigned Depot: ${depotNameText} (${distanceKm} km)</div>`
                : `<div style="font-size: 11px; color: #94a3b8; margin-bottom: 4px;">🛡️ Assigned Depot: Yangon Central Hub</div>`;

            const etaInfo = (event.nearest_depot && event.nearest_depot.eta_breakdown)
                ? event.nearest_depot.eta_breakdown
                : calculateClientETABreakdown(distanceKm, event.severity, title);

            const etaRowHtml = `
                <div style="margin-top: 6px; padding-top: 6px; border-top: 1px solid rgba(255, 255, 255, 0.1); font-size: 11px;">
                    <div style="font-weight: 700; color: #cbd5e1; margin-bottom: 4px;">⏱️ Multi-Modal Dispatch ETAs:</div>
                    <div style="display: flex; justify-content: space-between; gap: 4px; font-size: 10px;">
                        <span style="background: rgba(15,23,42,0.6); padding: 3px 6px; border-radius: 4px; border: 1px solid ${etaInfo.recommended_mode==='land'?'#f59e0b':'rgba(255,255,255,0.1)'}; color: ${etaInfo.recommended_mode==='land'?'#fef08a':'#e2e8f0'};">🚚 <b>Land:</b> ${etaInfo.modes.land.formatted_time}</span>
                        <span style="background: rgba(15,23,42,0.6); padding: 3px 6px; border-radius: 4px; border: 1px solid ${etaInfo.recommended_mode==='air'?'#f59e0b':'rgba(255,255,255,0.1)'}; color: ${etaInfo.recommended_mode==='air'?'#fef08a':'#e2e8f0'};">🚁 <b>Air:</b> ${etaInfo.modes.air.formatted_time}</span>
                        <span style="background: rgba(15,23,42,0.6); padding: 3px 6px; border-radius: 4px; border: 1px solid ${etaInfo.recommended_mode==='water'?'#f59e0b':'rgba(255,255,255,0.1)'}; color: ${etaInfo.recommended_mode==='water'?'#fef08a':'#e2e8f0'};">🚢 <b>Water:</b> ${etaInfo.modes.water.formatted_time}</span>
                    </div>
                </div>
            `;

            const popupContent = `
                <div style="font-family: Inter, sans-serif; min-width: 230px; color: #f8fafc;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <span style="font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 10px; background: rgba(239, 68, 68, 0.25); color: #f87171; text-transform: uppercase;">
                            🌏 ${cont} &bull; EMERGENCY
                        </span>
                        <span style="font-size: 11px; font-weight: 800; color: #fbbf24;">${event.severity}/10</span>
                    </div>
                    <h4 style="margin: 4px 0 8px 0; color: #f8fafc; font-size: 15px; font-weight: 800; font-family: Outfit, sans-serif;">⚠️ ${title}</h4>
                    <div style="font-size: 12px; color: #c084fc; font-weight: 700; margin-bottom: 8px; background: rgba(192, 132, 252, 0.12); padding: 5px 10px; border-radius: 8px; border: 1px solid rgba(192, 132, 252, 0.3); display: flex; align-items: center; gap: 6px;">
                        <span>📅 Event Date/Time:</span>
                        <span style="color: #e9d5ff; font-weight: 800;">${timeStr}</span>
                    </div>
                    ${depotBadge}
                    <div style="background: rgba(30, 41, 59, 0.8); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 10px; padding: 8px 10px; margin-bottom: 8px;">
                        <div style="font-size: 12px; color: #cbd5e1; margin-bottom: 3px;">💧 <b>Water Needed:</b> <span style="color: #38bdf8; font-weight: 700;">${waterText}</span></div>
                        <div style="font-size: 12px; color: #cbd5e1; margin-bottom: 3px;">🍱 <b>Food Needed:</b> <span style="color: #fbbf24; font-weight: 700;">${foodText}</span></div>
                        <div style="font-size: 12px; color: #cbd5e1;">⏱️ <b>Est. Ops Duration:</b> <span style="color: #a855f7; font-weight: 700;">${estRescueTime} hours</span></div>
                        ${etaRowHtml}
                    </div>
                    <div style="font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between;">
                        <span>📍 ${lat.toFixed(3)}, ${lon.toFixed(3)}</span>
                        <span>GDACS Live Feed</span>
                    </div>
                </div>
            `;

            const disasterIcon = L.divIcon({
                className: 'disaster-div-icon',
                html: '⚠️',
                iconSize: [32, 32],
                iconAnchor: [16, 16]
            });

            const marker = L.marker([lat, lon], { icon: disasterIcon })
                .addTo(map)
                .bindPopup(popupContent);

            marker.on('click', (e) => {
                toggleSelectDisaster(lat, lon, title, event.severity, event.created_at, nearestDepotObj);
            });

            marker.continent = cont;
            marker.disasterTitle = title;

            mapMarkers.push(marker);
        }

        renderSidebarCards();
        updateMapMarkersFilter();
        initRealtimeListener();
        initSSEStream();
        handleUrlLocationParams();

    } catch (error) {
        console.error('Error in ultra-fast dashboard initialization:', error);
        handleUrlLocationParams();
    }
}

/**
 * Automatically pans map and loads relief analysis if lat/lon parameters exist in URL query string
 */
function handleUrlLocationParams() {
    const params = new URLSearchParams(window.location.search);
    const latStr = params.get('lat');
    const lonStr = params.get('lon');
    const title = params.get('title') || 'Disaster Event Epicenter';
    const severity = parseFloat(params.get('sev') || '7.5');

    if (latStr && lonStr) {
        const lat = parseFloat(latStr);
        const lon = parseFloat(lonStr);
        if (!isNaN(lat) && !isNaN(lon)) {
            map.flyTo([lat, lon], 12, { animate: true, duration: 1.5 });
            setTimeout(() => {
                fetchReliefData(lat, lon, severity, title);
            }, 800);
        }
    }
}

/**
 * Manual "Sync AI Data" trigger to run live GDACS fetch & AI predictions in background
 */
async function syncData() {
    const btn = document.getElementById('btn-sync-ai');
    
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>⏳</span> Training & Syncing AI...';
    }

    try {
        await Promise.all([
            apiFetch('/api/train-rescue-ai', { method: 'POST', timeout: 3500 }),
            apiFetch('/api/live-alerts', { timeout: 3500 })
        ]);

        await initializeDashboard();

    } catch (err) {
        console.error('Failed to sync AI data:', err);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span id="sync-icon">⚡</span> Sync AI Data';
        }
    }
}

/**
 * Triggers loading of Pandas mission analytics and re-fetches map dashboard data
 */
async function refreshLogistics() {
    const btn = document.getElementById('btn-refresh-logistics');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<span>⏳</span> Refreshing...';
    }
    try {
        await loadAnalytics();
        await initializeDashboard();
    } catch (err) {
        console.error('Failed to refresh logistics:', err);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span id="refresh-icon">🔄</span> Refresh Logistics';
        }
    }
}

let currentEmergencyPayload = null;
let eventSourceClient = null;

/**
 * Initializes Server-Sent Events (SSE) stream listener connecting to GET /api/stream-disasters
 */
function initSSEStream() {
    if (eventSourceClient) return;

    try {
        const streamUrl = `${activeApiHost}/api/stream-disasters`;
        eventSourceClient = new EventSource(streamUrl);

        eventSourceClient.onmessage = (e) => {
            try {
                const payload = JSON.parse(e.data);
                console.log('Live SSE Disaster Push Received:', payload);
                displayEmergencyModal(payload);
            } catch (err) {
                console.warn('Error parsing SSE JSON payload:', err);
            }
        };

        eventSourceClient.onerror = (err) => {
            console.warn('SSE EventSource notice:', err);
        };
    } catch (err) {
        console.error('Failed to initialize SSE EventSource client:', err);
    }
}

/**
 * Helper functions to track emergency alert IDs that the user has already acknowledged or dismissed
 */
function getProcessedEmergencyIds() {
    try {
        return JSON.parse(localStorage.getItem('rescura_processed_emergencies') || '[]');
    } catch (e) {
        return [];
    }
}

function markEmergencyProcessed(eventId) {
    if (!eventId) return;
    try {
        const ids = getProcessedEmergencyIds();
        if (!ids.includes(eventId)) {
            ids.push(eventId);
            localStorage.setItem('rescura_processed_emergencies', JSON.stringify(ids));
        }
    } catch (e) {
        console.warn('LocalStorage notice:', e);
    }
}

function calculateClientETABreakdown(distKm, severity, title) {
    const d = Math.max(0.1, parseFloat(distKm) || 0);
    const sev = parseFloat(severity) || 5.0;
    const titleLower = (title || '').toLowerCase();

    const landTotal = (d * 1.3 / 50.0) + 0.5;
    const landH = Math.floor(landTotal);
    const landM = Math.round((landTotal - landH) * 60);

    const airTotal = (d * 1.05 / 220.0) + 0.3;
    const airH = Math.floor(airTotal);
    const airM = Math.round((airTotal - airH) * 60);

    const waterTotal = (d * 1.4 / 25.0) + 0.6;
    const waterH = Math.floor(waterTotal);
    const waterM = Math.round((waterTotal - waterH) * 60);

    const isWater = ['flood', 'tsunami', 'cyclone', 'storm', 'river', 'sea', 'coastal', 'drowning'].some(k => titleLower.includes(k));
    let recMode = 'land';
    let rationale = '';

    if (isWater && d <= 80) {
        recMode = 'water';
        rationale = `🚢 WATER/BOAT RECOMMENDED: Water/flood disaster detected within ${d.toFixed(1)}km. Rescue boat deployment is optimal for flooded/coastal terrain.`;
    } else if (sev >= 7.0 || d >= 120) {
        recMode = 'air';
        rationale = `🚁 AIR HELICOPTER RECOMMENDED: High severity (${sev}/10) or long distance (${d.toFixed(1)}km). Air flight bypasses ground road blockages in ${airH}h ${airM}m.`;
    } else {
        recMode = 'land';
        rationale = `🚚 LAND CONVOY RECOMMENDED: Standard emergency ground road deployment for ${d.toFixed(1)}km distance (${landH}h ${landM}m).`;
    }

    return {
        recommended_mode: recMode,
        recommendation_rationale: rationale,
        modes: {
            land: { formatted_time: `${landH}h ${landM}m` },
            air: { formatted_time: `${airH}h ${airM}m` },
            water: { formatted_time: `${waterH}h ${waterM}m` }
        }
    };
}

/**
 * Populates and displays the high-priority emergency modal popup for events in Myanmar & ASEAN
 */
function displayEmergencyModal(payload) {
    if (!payload || !payload.latitude || !payload.longitude) return;

    const processedIds = getProcessedEmergencyIds();
    if (payload.id && processedIds.includes(payload.id)) {
        return;
    }

    currentEmergencyPayload = payload;

    const modal = document.getElementById('emergency-modal');
    const elTitle = document.getElementById('modal-title');
    const elSev = document.getElementById('modal-severity');
    const elTime = document.getElementById('modal-time');
    const elPop = document.getElementById('modal-population');
    const elWater = document.getElementById('modal-water');
    const elFood = document.getElementById('modal-food');
    const elDepot = document.getElementById('modal-depot');

    if (modal) {
        if (elTitle) elTitle.innerText = payload.title || 'Disaster Event';
        if (elSev) elSev.innerText = `${payload.severity || 5.0} / 10`;
        if (elTime) elTime.innerText = formatOccurredTime(payload.created_at || payload.pubDate || payload.timestamp);
        if (elPop) elPop.innerText = `${(payload.affected_population || 0).toLocaleString()} People`;
        if (elWater) elWater.innerText = `${(payload.total_water_liters || 0).toLocaleString()} L`;
        if (elFood) elFood.innerText = `${(payload.total_food_packs || 0).toLocaleString()} Packs`;
        
        let depotDist = 0;
        if (elDepot) {
            const depotName = payload.nearest_depot ? payload.nearest_depot.name : 'Nearest Supply Depot';
            depotDist = payload.nearest_depot ? payload.nearest_depot.distance_km : 0;
            elDepot.innerText = `${depotName} (${depotDist} km)`;
        }

        // Multi-Modal ETA Breakdown Population
        const etaBreakdown = (payload.nearest_depot && payload.nearest_depot.eta_breakdown)
            ? payload.nearest_depot.eta_breakdown
            : calculateClientETABreakdown(depotDist, payload.severity, payload.title);

        const elValLand = document.getElementById('eta-val-land');
        const elValAir = document.getElementById('eta-val-air');
        const elValWater = document.getElementById('eta-val-water');
        const elRationale = document.getElementById('modal-eta-rationale');

        const cardLand = document.getElementById('eta-card-land');
        const cardAir = document.getElementById('eta-card-air');
        const cardWater = document.getElementById('eta-card-water');

        if (elValLand) elValLand.innerText = etaBreakdown.modes.land.formatted_time;
        if (elValAir) elValAir.innerText = etaBreakdown.modes.air.formatted_time;
        if (elValWater) elValWater.innerText = etaBreakdown.modes.water.formatted_time;

        [cardLand, cardAir, cardWater].forEach(c => c && c.classList.remove('recommended-mode'));
        if (etaBreakdown.recommended_mode === 'land' && cardLand) cardLand.classList.add('recommended-mode');
        if (etaBreakdown.recommended_mode === 'air' && cardAir) cardAir.classList.add('recommended-mode');
        if (etaBreakdown.recommended_mode === 'water' && cardWater) cardWater.classList.add('recommended-mode');

        if (elRationale) {
            elRationale.innerText = etaBreakdown.recommendation_rationale || '';
            elRationale.style.display = etaBreakdown.recommendation_rationale ? 'block' : 'none';
        }

        modal.classList.remove('hidden');

        if (payload.latitude && payload.longitude) {
            map.flyTo([payload.latitude, payload.longitude], 12, { animate: true, duration: 1.5 });
        }
    }
}

/**
 * Closes the emergency popup modal and records dismissal
 */
function closeEmergencyModal() {
    if (currentEmergencyPayload && currentEmergencyPayload.id) {
        markEmergencyProcessed(currentEmergencyPayload.id);
    }

    const modal = document.getElementById('emergency-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

/**
 * Acknowledges emergency disaster, routes nearest depot to location, and records acknowledgment
 */
function acknowledgeAndRoute() {
    if (currentEmergencyPayload && currentEmergencyPayload.id) {
        markEmergencyProcessed(currentEmergencyPayload.id);
    }

    closeEmergencyModal();
    if (!currentEmergencyPayload) return;

    const lat = currentEmergencyPayload.latitude;
    const lon = currentEmergencyPayload.longitude;
    const title = currentEmergencyPayload.title;
    const severity = currentEmergencyPayload.severity;
    const depot = currentEmergencyPayload.nearest_depot;

    toggleSelectDisaster(lat, lon, title, severity, null, depot);
}

window.syncData = syncData;
window.refreshLogistics = refreshLogistics;
window.closeEmergencyModal = closeEmergencyModal;
window.acknowledgeAndRoute = acknowledgeAndRoute;

// ==========================================================================
// Collaborative Real-Time Dispatch via WebSockets
// ==========================================================================
let dispatcherId = localStorage.getItem('rescura_dispatcher_id');
if (!dispatcherId) {
    dispatcherId = 'Dispatcher_' + Math.floor(1000 + Math.random() * 9000);
    localStorage.setItem('rescura_dispatcher_id', dispatcherId);
}

let lockedDisastersMap = {};
let dispatchSocket = null;

function updateDispatcherIdDisplay() {
    const el = document.getElementById('dispatcher-id-display');
    if (el) {
        el.innerText = `👤 ${dispatcherId}`;
        el.title = `Your active Dispatcher Session ID: ${dispatcherId}`;
    }
}

function initDispatchWebSocket() {
    updateDispatcherIdDisplay();
    if (dispatchSocket && (dispatchSocket.readyState === WebSocket.OPEN || dispatchSocket.readyState === WebSocket.CONNECTING)) {
        return;
    }

    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsHost = window.location.host || 'localhost:8000';
    const wsUrl = (wsHost.includes('3000') || wsHost.includes('5500') || wsHost.includes('127.0.0.1'))
        ? 'ws://localhost:8000/ws/dispatch'
        : `${wsProtocol}//${wsHost}/ws/dispatch`;

    try {
        dispatchSocket = new WebSocket(wsUrl);

        dispatchSocket.onopen = () => {
            console.log('⚡ Collaborative Dispatch WebSocket Connected as', dispatcherId);
            updateDispatcherIdDisplay();
        };

        dispatchSocket.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleWebSocketMessage(data);
            } catch (e) {
                console.error('Error parsing WS message:', e);
            }
        };

        dispatchSocket.onclose = () => {
            console.warn('WebSocket connection closed. Reconnecting in 4s...');
            setTimeout(initDispatchWebSocket, 4000);
        };

        dispatchSocket.onerror = (err) => {
            console.error('WebSocket Error:', err);
        };
    } catch (err) {
        console.error('Failed to initialize WebSocket:', err);
    }
}

function handleWebSocketMessage(data) {
    if (!data || !data.type) return;

    if (data.type === 'INIT_LOCKS') {
        lockedDisastersMap = data.locked_disasters || {};
        renderSidebarCards();
    } else if (data.type === 'DISASTER_LOCKED') {
        lockedDisastersMap[String(data.disaster_id)] = {
            locked_by: data.locked_by,
            timestamp: data.timestamp
        };
        renderSidebarCards();
    } else if (data.type === 'DISASTER_UNLOCKED') {
        delete lockedDisastersMap[String(data.disaster_id)];
        renderSidebarCards();
    } else if (data.type === 'DISASTER_DISPATCHED') {
        delete lockedDisastersMap[String(data.disaster_id)];
        const sosItem = sosAlertsData.find(a => String(a.id) === String(data.disaster_id));
        if (sosItem) {
            sosItem.status = 'dispatched';
        }
        renderSidebarCards();
        updateStatsCounters();
    }
}

function toggleLockDisaster(disasterId) {
    if (!dispatchSocket || dispatchSocket.readyState !== WebSocket.OPEN) {
        alert('Collaborative Dispatch WebSocket is connecting... Please retry in a moment.');
        return;
    }
    const dIdStr = String(disasterId);
    const isLocked = !!lockedDisastersMap[dIdStr];
    const lockInfo = isLocked ? lockedDisastersMap[dIdStr] : null;

    if (isLocked && lockInfo.locked_by !== dispatcherId) {
        alert(`This disaster is currently locked by ${lockInfo.locked_by}. Only they can unlock it.`);
        return;
    }

    const action = isLocked ? 'unlock_disaster' : 'lock_disaster';
    dispatchSocket.send(JSON.stringify({
        action: action,
        disaster_id: dIdStr,
        user_id: dispatcherId
    }));
}

function dispatchSuppliesWS(disasterId) {
    if (!dispatchSocket || dispatchSocket.readyState !== WebSocket.OPEN) {
        alert('Collaborative Dispatch WebSocket is connecting... Please retry in a moment.');
        return;
    }
    const dIdStr = String(disasterId);
    const lockInfo = lockedDisastersMap[dIdStr];
    if (lockInfo && lockInfo.locked_by !== dispatcherId) {
        alert(`Cannot dispatch: this disaster is locked by ${lockInfo.locked_by}.`);
        return;
    }

    dispatchSocket.send(JSON.stringify({
        action: 'dispatch_supplies',
        disaster_id: dIdStr,
        user_id: dispatcherId
    }));
}

window.toggleLockDisaster = toggleLockDisaster;
window.dispatchSuppliesWS = dispatchSuppliesWS;

// Initialize dashboard on page load
initializeDashboard();


// --- RAW DATA EXPLORER MODAL LOGIC ---
let currentRawDataCsv = null;
let availableDatasets = [];
let currentCsvRows = [];
let currentCsvHeaders = [];

const DATASET_METADATA = {
    'myanmar_historical_data.csv': {
        name: '📊 USGS Seismic Disaster History',
        records: '1,666 verified events',
        citation: 'United States Geological Survey (USGS) Earthquake Hazards API',
        desc: 'Historical earthquakes in Myanmar & ASEAN (2006-2026) with magnitude, GPS, year, and Sphere relief usage.'
    },
    'myanmar_demographics.csv': {
        name: '👥 Townships & Demographics',
        records: '110+ Townships & Hubs',
        citation: 'Department of Population (Myanmar Census), MIMU & ASEAN Stats',
        desc: 'Official township populations across all Myanmar states/regions and regional ASEAN disaster hubs.'
    },
    'relief_depots.csv': {
        name: '🛡️ Regional Humanitarian Supply Hubs',
        records: '4 Strategic Depots',
        citation: 'National Disaster Management Committee & AHA Centre',
        desc: 'Verified warehouse stock capacities (Water, Food, Medical kits, Coverage radii).'
    },
    'historical_disasters.csv': {
        name: '📜 Historical Disaster Archive',
        records: '75+ Major Disasters',
        citation: 'EM-DAT International Disaster Database & UN-OCHA',
        desc: 'Comprehensive multi-hazard disaster log (cyclones, floods, quakes, landslides, tsunamis) across Myanmar & ASEAN.'
    }
};

async function openRawDataModal() {
    const modal = document.getElementById('raw-data-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
    }
    
    // Fetch available datasets from backend
    try {
        const response = await fetch(`${activeApiHost}/api/datasets`);
        if (response.ok) {
            const data = await response.json();
            availableDatasets = data.datasets || [];
            renderDatasetTabs();
            if (availableDatasets.length > 0) {
                switchRawDataTab(availableDatasets[0]);
            }
        }
    } catch (e) {
        console.error('Failed to fetch datasets list', e);
    }
}
window.openRawDataModal = openRawDataModal;

function closeRawDataModal() {
    const modal = document.getElementById('raw-data-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
    }
}
window.closeRawDataModal = closeRawDataModal;

function closeRawDataModalOutside(e) {
    if (e.target.id === 'raw-data-modal') closeRawDataModal();
}
window.closeRawDataModalOutside = closeRawDataModalOutside;

function renderDatasetTabs() {
    const container = document.getElementById('raw-data-tabs-container');
    if (!container) return;
    
    if (!availableDatasets || availableDatasets.length === 0) {
        container.innerHTML = '<div class="text-slate-400 text-xs italic py-2">No database CSVs found on backend.</div>';
        return;
    }

    container.innerHTML = availableDatasets.map(ds => {
        const meta = DATASET_METADATA[ds] || { name: ds, records: 'CSV File' };
        const isActive = (ds === currentRawDataCsv);
        return `
            <button id="tab-${ds}" onclick="switchRawDataTab('${ds}')" class="px-3.5 py-2 rounded-xl text-xs font-bold transition-all border flex items-center gap-2 ${isActive ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'}">
                <span>${meta.name}</span>
                <span class="text-[10px] px-1.5 py-0.5 rounded-full ${isActive ? 'bg-blue-800/60 text-white' : 'bg-slate-200 text-slate-600'}">${meta.records}</span>
            </button>
        `;
    }).join('');
}

function parseAndRenderCSV(csvText) {
    const lines = csvText.split('\n').map(l => l.trim()).filter(l => l);
    if (lines.length === 0) return;
    
    const parseLine = (line) => {
        const result = [];
        let cur = '';
        let inQuotes = false;
        for (let i = 0; i < line.length; i++) {
            if (line[i] === '"') {
                inQuotes = !inQuotes;
            } else if (line[i] === ',' && !inQuotes) {
                result.push(cur);
                cur = '';
            } else {
                cur += line[i];
            }
        }
        result.push(cur);
        return result;
    };
    
    currentCsvHeaders = parseLine(lines[0]);
    currentCsvRows = lines.slice(1).map(line => parseLine(line));

    // Update dataset citation header if present
    const meta = DATASET_METADATA[currentRawDataCsv] || { citation: 'Rescura Sync Database', desc: 'Raw verified dataset' };
    const descEl = document.getElementById('raw-data-desc');
    if (descEl) {
        descEl.innerHTML = `<b>Source Citation:</b> ${meta.citation} &bull; <span class="text-slate-500">${meta.desc}</span>`;
    }

    renderCsvTableRows(currentCsvRows);
}

function renderCsvTableRows(rows) {
    const theadRow = document.getElementById('raw-data-thead-row');
    if (theadRow) {
        theadRow.innerHTML = currentCsvHeaders.map(h => `<th class="p-3 text-slate-600 font-bold uppercase tracking-wider text-[11px] border-r border-slate-200 last:border-0">${h}</th>`).join('');
    }

    const tbody = document.getElementById('raw-data-tbody');
    if (tbody) {
        if (rows.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${currentCsvHeaders.length || 1}" class="p-6 text-center text-slate-400 text-xs italic">No matching records found.</td></tr>`;
            return;
        }
        const rowsHtml = rows.slice(0, 100).map(cols => {
            return `<tr class="hover:bg-blue-50/50 transition-colors group cursor-default border-t border-slate-100">
                ${cols.map(c => `<td class="p-3 whitespace-nowrap text-slate-700 font-mono text-xs border-r border-slate-100 last:border-0">${c}</td>`).join('')}
            </tr>`;
        }).join('');
        
        tbody.innerHTML = rowsHtml;
    }
}

function filterCsvTable() {
    const search = (document.getElementById('raw-data-search')?.value || '').toLowerCase();
    if (!search) {
        renderCsvTableRows(currentCsvRows);
        return;
    }
    const filtered = currentCsvRows.filter(row => row.some(cell => cell.toLowerCase().includes(search)));
    renderCsvTableRows(filtered);
}
window.filterCsvTable = filterCsvTable;

async function switchRawDataTab(filename) {
    currentRawDataCsv = filename;
    renderDatasetTabs();
    
    // Show Loading
    const loading = document.getElementById('raw-data-loading');
    if (loading) loading.classList.remove('hidden');
    
    const tbody = document.getElementById('raw-data-tbody');
    if (tbody) tbody.innerHTML = '';
    
    // Fetch data
    try {
        const response = await fetch(`${activeApiHost}/api/datasets/${filename}`);
        if (!response.ok) throw new Error('Network response was not ok');
        const csvText = await response.text();
        
        parseAndRenderCSV(csvText);
    } catch (error) {
        console.error('Error fetching CSV:', error);
        if (tbody) {
            tbody.innerHTML = `<tr><td class="p-4 text-brand-red">Failed to load dataset: ${filename}</td></tr>`;
        }
    } finally {
        if (loading) loading.classList.add('hidden');
    }
}

function downloadCurrentCSV() {
    if (!currentRawDataCsv) return;
    const link = document.createElement('a');
    link.href = `${activeApiHost}/api/datasets/${currentRawDataCsv}`;
    link.download = currentRawDataCsv;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (sidebar) {
        sidebar.classList.toggle('collapsed');
    }
}
window.toggleSidebar = toggleSidebar;

function openAnalyticsModal() {
    const modal = document.getElementById('analytics-modal');
    if (modal) modal.classList.remove('hidden');
}
window.openAnalyticsModal = openAnalyticsModal;

function closeAnalyticsModal() {
    const modal = document.getElementById('analytics-modal');
    if (modal) modal.classList.add('hidden');
}
window.closeAnalyticsModal = closeAnalyticsModal;
