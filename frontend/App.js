// Supabase Client Setup Constants
const SUPABASE_URL = 'https://jgbtudbialgitdxgkngj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnYnR1ZGJpYWxnaXRkeGdrbmdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwNjgzODksImV4cCI6MjEwMTY0NDM4OX0.1Wc1P4seagQsTKcOKN9nhDDiakBIAnQo7FlHhJBUO8A';
const supabaseClient = (window.supabase && SUPABASE_URL !== 'YOUR_URL_HERE' && SUPABASE_ANON_KEY !== 'YOUR_ANON_KEY_HERE')
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

// Base Tile Layers: Dark Mode Canvas & High-Res Satellite Imagery
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

// Initialize Leaflet Map
const BAGO_COORDS = [17.3333, 96.4833];
const ZOOM_LEVEL = 13;

const map = L.map('map', {
    center: BAGO_COORDS,
    zoom: ZOOM_LEVEL,
    layers: [darkCanvasLayer],
    zoomControl: false
});

// Live Weather Radar Tile Layer (RainViewer Real-Time Telemetry)
const liveWeatherRadarLayer = L.tileLayer('https://tile.rainviewer.org/v2/radar/nowcast_0/256/{z}/{x}/{y}/2/1_1.png', {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.rainviewer.com/">RainViewer</a> Weather Radar',
    opacity: 0.65
});

// Add Layer Control widget allowing users to toggle Satellite vs Dark Canvas vs OSM vs Live Weather Overlay
const baseMaps = {
    "🌙 Dark Canvas (Street)": darkCanvasLayer,
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

const API_HOSTS = [
    window.location.origin.replace(':5500', ':8000'),
    'http://127.0.0.1:8000',
    'http://localhost:8000',
    'https://rescura-sync.onrender.com'
];
let activeApiHost = 'http://127.0.0.1:8000';

/**
 * Downloads the automated PDF Action Plan for a given disaster event ID from active backend.
 */
function downloadActionPlanPDF(evtId = 1) {
    const targetUrl = `${activeApiHost}/api/export-report/${evtId}`;
    window.open(targetUrl, '_blank');
}

/**
 * Fast, resilient API fetch helper with AbortController timeout (max 12s)
 * and automatic host fallback.
 */
async function apiFetch(path, options = {}) {
    const timeoutMs = options.timeout || 12000;
    const fetchOptions = { ...options };
    delete fetchOptions.timeout;

    for (const host of API_HOSTS) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        try {
            const url = `${host}${path}`;
            const res = await fetch(url, { ...fetchOptions, signal: controller.signal });
            clearTimeout(timer);
            if (res.ok) {
                activeApiHost = host;
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
            const group = L.featureGroup(visibleMarkers);
            map.fitBounds(group.getBounds().pad(0.15), { animate: true, duration: 1.2 });
        } catch (e) {}
    }
}

/**
 * Render cards in the sidebar based on active tab with click-to-focus interactivity
 */
function renderSidebarCards() {
    const container = document.getElementById('alerts-container');
    container.innerHTML = '';

    const getEmoji = (cont) => {
        switch(cont) {
            case 'Europe': return '🌍';
            case 'Americas': return '🌎';
            case 'Africa': return '🌍';
            case 'Oceania': return '🌏';
            default: return '🌏';
        }
    };

    if (currentTab === 'gdacs') {
        const filtered = gdacsAlertsData.filter(alert => {
            const lat = alert.latitude || alert.lat || 0;
            const lon = alert.longitude || alert.lon || 0;
            const cont = getContinent(lat, lon, alert.title);

            if (selectedContinent !== 'All' && cont !== selectedContinent) return false;

            if (!searchQuery) return true;
            const t = (alert.title || '').toLowerCase();
            const d = (alert.disaster_type || '').toLowerCase();
            return t.includes(searchQuery) || d.includes(searchQuery);
        });

        if (!filtered.length) {
            if (!gdacsAlertsData.length) {
                container.innerHTML = '<div style="color: #38bdf8; text-align: center; padding: 20px; font-size: 13px; font-weight: 600;">⚡ Synchronizing GDACS Live Telemetry...</div>';
            } else {
                container.innerHTML = '<div style="color: #94a3b8; text-align: center; padding: 20px; font-size: 13px;">No matching GDACS disasters found for this filter.</div>';
            }
            return;
        }

        filtered.forEach(alert => {
            const lat = alert.latitude || alert.lat;
            const lon = alert.longitude || alert.lon;
            const timeStr = formatOccurredTime(alert.created_at || alert.pubDate || alert.timestamp);
            const cont = getContinent(lat, lon, alert.title);
            const waterVal = alert.water_needed_liters || Math.round((alert.affected_population || 5000) * 3);
            const foodVal = alert.food_needed_packs || Math.round((alert.affected_population || 5000) * 0.5);
            const estTimeVal = alert.ai_rescue_time_hrs || 178;
            const isASEAN = (lat >= -10 && lat <= 28 && lon >= 90 && lon <= 140);
            const zoneText = isASEAN ? "🟢 Inside ASEAN Dispatch Zone" : "🔵 Out of ASEAN Dispatch Zone";

            const card = document.createElement('div');
            card.className = 'alert-card';
            card.onclick = (e) => {
                if (e.target.closest('.btn-card-pdf')) return;
                focusMap(lat, lon);
                selectAlert(lat, lon, alert.title, alert.severity, alert.created_at || alert.pubDate);
            };
            card.innerHTML = `
                <div class="card-header">
                    <span class="card-type">⚡ ${alert.disaster_type || 'EMERGENCY'}</span>
                    <div style="display: flex; gap: 4px; align-items: center;">
                        <span class="meta-pill continent-pill">${getEmoji(cont)} ${cont}</span>
                        <span class="card-severity">SEV ${alert.severity}/10</span>
                    </div>
                </div>
                <div class="card-title">${alert.title}</div>
                <div class="card-meta">
                    <span class="meta-pill time-pill">🕒 Occurred: ${timeStr}</span>
                    <span class="meta-pill">📍 ${lat.toFixed(3)}, ${lon.toFixed(3)}</span>
                </div>
                <div class="card-metrics-block">
                    <div class="metric-row">
                        <span style="color: #94a3b8; font-size: 10px;">${zoneText}</span>
                    </div>
                    <div class="metric-row">
                        <span style="color: #94a3b8;">💧 Water Needed:</span>
                        <span class="metric-text-water">${waterVal.toLocaleString()} L</span>
                    </div>
                    <div class="metric-row">
                        <span style="color: #94a3b8;">🍱 Food Needed:</span>
                        <span class="metric-text-food">${foodVal.toLocaleString()} Packs</span>
                    </div>
                    <div class="metric-row">
                        <span style="color: #94a3b8;">⏱️ AI Est. Rescue Time:</span>
                        <span class="metric-text-time">${estTimeVal} hrs</span>
                    </div>
                </div>
                <button class="btn-card-pdf" onclick="downloadActionPlanPDF(${alert.id || 1})">
                    📄 Action Plan PDF
                </button>
            `;
            container.appendChild(card);
        });
    } else {
        const filtered = sosAlertsData.filter(alert => {
            const { lat, lon } = parseSOSCoords(alert);
            const cont = getContinent(lat, lon, alert.location);

            if (selectedContinent !== 'All' && cont !== selectedContinent) return false;

            if (!searchQuery) return true;
            const loc = (alert.location || '').toLowerCase();
            const need = (alert.urgent_need || alert.urgent_need_category || '').toLowerCase();
            return loc.includes(searchQuery) || need.includes(searchQuery);
        });

        if (!filtered.length) {
            container.innerHTML = '<div style="color: #94a3b8; text-align: center; padding: 20px; font-size: 13px;">No matching Mobile SOS reports recorded.</div>';
            return;
        }

        filtered.forEach((alert, index) => {
            const { lat, lon } = parseSOSCoords(alert, index);

            const urgentNeed = alert.urgent_need || alert.urgent_need_category || 'Water';
            const affectedCount = alert.affected_people || alert.affected_count || 10;
            const status = alert.status || 'pending';
            const statusBadgeColor = status === 'resolved' ? '#10b981' : (status === 'dispatched' ? '#fb923c' : '#f87171');
            const sosTimeStr = formatOccurredTime(alert.created_at || alert.timestamp);
            const cont = getContinent(lat, lon, alert.location);

            const card = document.createElement('div');
            card.className = 'alert-card';
            card.onclick = () => focusMap(lat, lon);
            card.innerHTML = `
                <div class="card-header">
                    <span class="card-type" style="background: rgba(239, 68, 68, 0.2); color: #f87171; border: 1px solid rgba(239, 68, 68, 0.3);">🚨 SOS SIGNAL</span>
                    <div style="display: flex; gap: 4px; align-items: center;">
                        <span class="meta-pill continent-pill">${getEmoji(cont)} ${cont}</span>
                        <span class="card-severity" style="background: rgba(255,255,255,0.08); color: ${statusBadgeColor}; border-color: ${statusBadgeColor}; text-transform: uppercase;">${status}</span>
                    </div>
                </div>
                <div class="card-title">${alert.location || 'Civilian Sector Emergency'}</div>
                <div class="card-meta">
                    <span class="meta-pill time-pill">🕒 ${sosTimeStr}</span>
                    <span class="meta-pill">Need: <b>${urgentNeed}</b></span>
                    <span class="meta-pill">Affected: <b>${affectedCount}</b></span>
                </div>
            `;
            container.appendChild(card);
        });
    }

    updateStatsCounters();
}

/**
 * Handle user click on a disaster alert card from sidebar
 */
function selectAlert(lat, lon, title, severity, created_at = null) {
    fetchReliefData(lat, lon, severity, title, created_at);
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

            if (existingEvt.nearest_depot && existingEvt.nearest_depot.name && isWithinASEAN(lat, lon)) {
                depotNameText = existingEvt.nearest_depot.name;
                distanceKm = existingEvt.nearest_depot.distance_km || 0;
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
                if (data.nearest_depot && data.nearest_depot.name && isWithinASEAN(lat, lon)) {
                    depotNameText = data.nearest_depot.name;
                    distanceKm = data.nearest_depot.distance_km || 0;
                }
            }
        }

        const cont = getContinent(lat, lon, title);
        const depotBadge = (depotNameText && isWithinASEAN(lat, lon))
            ? `<div style="font-size: 12px; color: #22c55e; font-weight: 700; margin-bottom: 4px;">🛡️ Assigned Depot: ${depotNameText} (${distanceKm} km)</div>`
            : `<div style="font-size: 11px; color: #94a3b8; margin-bottom: 4px;">🌐 Out of ASEAN Dispatch Zone</div>`;

        const estBudgetUsd = (existingEvt && existingEvt.total_estimated_budget_usd)
            ? existingEvt.total_estimated_budget_usd
            : Math.round((waterLiters * 0.50) + (foodPacks * 3.50));

        const evtId = existingEvt ? existingEvt.id : 1;

        const popupContent = `
            <div style="font-family: Inter, sans-serif; min-width: 220px; color: #f8fafc;">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                    <span style="font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 10px; background: rgba(239, 68, 68, 0.25); color: #f87171; text-transform: uppercase;">
                        🌏 ${cont} &bull; EMERGENCY
                    </span>
                    <span style="font-size: 11px; font-weight: 800; color: #fbbf24;">SEV ${severity}/10</span>
                </div>
                <h4 style="margin: 4px 0 8px 0; color: #f8fafc; font-size: 15px; font-weight: 800; font-family: Outfit, sans-serif;">⚠️ ${title}</h4>
                <div style="font-size: 12px; color: #c084fc; font-weight: 700; margin-bottom: 8px; background: rgba(192, 132, 252, 0.12); padding: 5px 10px; border-radius: 8px; border: 1px solid rgba(192, 132, 252, 0.3); display: flex; align-items: center; gap: 6px;">
                    <span>📅 Event Date/Time:</span>
                    <span style="color: #e9d5ff; font-weight: 800;">${timeStr}</span>
                </div>
                ${depotBadge}
                <div style="background: rgba(30, 41, 59, 0.8); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 10px; padding: 8px 10px; margin-bottom: 8px;">
                    <div style="font-size: 12px; color: #cbd5e1; margin-bottom: 3px;">💧 <b>Water Needed:</b> <span style="color: #38bdf8; font-weight: 700;">${waterLiters.toLocaleString()} L</span></div>
                    <div style="font-size: 12px; color: #cbd5e1; margin-bottom: 3px;">🍱 <b>Food Needed:</b> <span style="color: #fbbf24; font-weight: 700;">${foodPacks.toLocaleString()} packs</span></div>
                    <div style="font-size: 12px; color: #cbd5e1; margin-bottom: 3px;">💵 <b>Est. Budget:</b> <span style="color: #4ade80; font-weight: 800;">$${Math.round(estBudgetUsd).toLocaleString()} USD</span></div>
                    <div style="font-size: 12px; color: #cbd5e1;">⏱️ <b>AI Est. Rescue Time:</b> <span style="color: #a855f7; font-weight: 700;">${estRescueTime} hours</span></div>
                </div>
                <button onclick="downloadActionPlanPDF(${evtId})" style="display: block; width: 100%; margin-bottom: 8px; text-align: center; background: linear-gradient(135deg, #0ea5e9, #2563eb); color: #ffffff; border: none; padding: 7px 12px; border-radius: 8px; font-weight: 700; font-size: 12px; cursor: pointer; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.3);">
                    📄 Download Action Plan (PDF)
                </button>
                <div style="font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between;">
                    <span>📍 ${lat.toFixed(3)}, ${lon.toFixed(3)}</span>
                    <span>GDACS Live Feed</span>
                </div>
            </div>
        `;

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

        if (activePolyline) {
            map.removeLayer(activePolyline);
        }

        const optimalRouteCoords = gisAnalysis.optimal_route_coords;
        if (optimalRouteCoords && optimalRouteCoords.length > 0 && isWithinASEAN(lat, lon)) {
            activePolyline = L.polyline(optimalRouteCoords, {
                color: '#ef4444',
                weight: 5,
                opacity: 0.8
            }).addTo(map);

            map.fitBounds(activePolyline.getBounds(), { padding: [40, 40] });
        } else {
            map.flyTo([lat, lon], 10, { animate: true, duration: 1.2 });
        }

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

        const sosFetchPromises = sosAlertsData.map((alert, index) => {
            const { lat, lon } = parseSOSCoords(alert, index);
            if (isWithinASEAN(lat, lon)) {
                return apiFetch(`/api/nearest-depot?lat=${lat}&lon=${lon}`)
                    .then(res => res && res.ok ? res.json() : null)
                    .catch(() => null);
            }
            return Promise.resolve(null);
        });

        const sosDepotResults = await Promise.all(sosFetchPromises);

        for (let index = 0; index < sosAlertsData.length; index++) {
            const alert = sosAlertsData[index];
            const { lat, lon } = parseSOSCoords(alert, index);
            const urgentNeed = alert.urgent_need || alert.urgent_need_category || 'Water';
            const affectedPeople = alert.affected_people || alert.affected_count || 10;
            const status = alert.status || 'pending';
            const estRescueTime = (1.2 + (affectedPeople / 250.0) + 1.0).toFixed(1);
            const timeStr = formatOccurredTime(alert.created_at || alert.timestamp);
            const cont = getContinent(lat, lon, alert.location);

            const pulseIcon = L.divIcon({
                className: 'sos-div-wrapper',
                html: `<div class="sos-pulse-marker ${status}"></div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            });

            const marker = L.marker([lat, lon], { icon: pulseIcon }).addTo(map);
            marker.continent = cont;
            marker.alertLocation = alert.location || 'Civilian Sector';

            const alertId = alert.id || index;

            let depotInfoText = 'Calculating Nearest Depot...';
            const depotData = sosDepotResults[index];

            if (depotData && depotData.status === 'success' && depotData.nearest_depot) {
                const depot = depotData.nearest_depot;
                depotInfoText = `🛡️ <b>Nearest Depot:</b> ${depot.name} (${depot.distance_km} km)`;

                const sosRouteLine = L.polyline([[depot.latitude, depot.longitude], [lat, lon]], {
                    color: '#10b981',
                    weight: 4,
                    opacity: 0.85,
                    dashArray: '8, 8'
                }).addTo(map);

                routePolylines.push(sosRouteLine);
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
                    <div style="font-size: 12px; color: #cbd5e1; margin-bottom: 8px;"><b>⏱️ AI Est. Rescue Time:</b> <span style="color: #a855f7; font-weight: 700;">${estRescueTime} hours</span></div>
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
                map.fitBounds(group.getBounds().pad(0.15));
            }
        }
    } catch (e) {
        console.warn('Failed to load all depots onto map:', e);
    }
}

/**
 * Ultra-fast Dashboard Initialization using pre-calculated data from /api/dashboard-data
 */
async function initializeDashboard() {
    try {
        await loadAnalytics();
        await loadAllDepots();

        const dashRes = await apiFetch('/api/dashboard-data');
        if (!dashRes || !dashRes.ok) {
            console.warn('Dashboard data fetch notice:', dashRes ? dashRes.status : 'timeout');
            await loadSOSAlerts();
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
            const lat = event.latitude;
            const lon = event.longitude;
            const title = event.title;
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

            if (nearestDepotObj && nearestDepotObj.name && isWithinASEAN(lat, lon)) {
                depotNameText = nearestDepotObj.name;
                distanceKm = nearestDepotObj.distance_km || 0;

                const routeLine = L.polyline([[nearestDepotObj.latitude, nearestDepotObj.longitude], [lat, lon]], {
                    color: '#10b981',
                    weight: 4,
                    opacity: 0.85,
                    dashArray: '10, 10'
                }).addTo(map);

                routePolylines.push(routeLine);
            }

            const depotBadge = (depotNameText && isWithinASEAN(lat, lon))
                ? `<div style="font-size: 12px; color: #22c55e; font-weight: 700; margin-bottom: 4px;">🛡️ Assigned Depot: ${depotNameText} (${distanceKm} km)</div>`
                : `<div style="font-size: 11px; color: #94a3b8; margin-bottom: 4px;">🌐 Out of ASEAN Dispatch Zone</div>`;

            const popupContent = `
                <div style="font-family: Inter, sans-serif; min-width: 220px; color: #f8fafc;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
                        <span style="font-size: 10px; font-weight: 800; padding: 2px 8px; border-radius: 10px; background: rgba(239, 68, 68, 0.25); color: #f87171; text-transform: uppercase;">
                            🌏 ${cont} &bull; EMERGENCY
                        </span>
                        <span style="font-size: 11px; font-weight: 800; color: #fbbf24;">SEV ${event.severity}/10</span>
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
                        <div style="font-size: 12px; color: #cbd5e1;">⏱️ <b>AI Est. Rescue Time:</b> <span style="color: #a855f7; font-weight: 700;">${estRescueTime} hours</span></div>
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

            marker.continent = cont;
            marker.disasterTitle = title;

            if (idx === 0) {
                marker.openPopup();
            }

            mapMarkers.push(marker);
        }

        renderSidebarCards();
        await loadSOSAlerts();
        initRealtimeListener();
        initSSEStream();
        handleUrlLocationParams();

    } catch (error) {
        console.error('Error in ultra-fast dashboard initialization:', error);
        await loadSOSAlerts();
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

/**
 * Populates and displays the high-priority emergency modal popup for events in Myanmar & ASEAN
 */
function displayEmergencyModal(payload) {
    if (!payload || !payload.latitude || !payload.longitude) return;

    if (!isWithinASEAN(payload.latitude, payload.longitude)) {
        console.log('Skipping emergency popup modal for non-ASEAN event:', payload.title);
        return;
    }

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
        
        if (elDepot) {
            const depotName = payload.nearest_depot ? payload.nearest_depot.name : 'Nearest Supply Depot';
            const depotDist = payload.nearest_depot ? payload.nearest_depot.distance_km : 0;
            elDepot.innerText = `${depotName} (${depotDist} km)`;
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

    map.setView([lat, lon], 12);

    if (isWithinASEAN(lat, lon) && depot && depot.latitude && depot.longitude) {
        const routeLine = L.polyline([[depot.latitude, depot.longitude], [lat, lon]], {
            color: '#10b981',
            weight: 5,
            opacity: 0.9,
            dashArray: '10, 10'
        }).addTo(map);

        routePolylines.push(routeLine);
    }

    fetchReliefData(lat, lon, severity, title);
}

window.syncData = syncData;
window.refreshLogistics = refreshLogistics;
window.closeEmergencyModal = closeEmergencyModal;
window.acknowledgeAndRoute = acknowledgeAndRoute;

// Initialize dashboard on page load
initializeDashboard();
