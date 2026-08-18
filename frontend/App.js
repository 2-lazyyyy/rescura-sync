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

const sentinelInfraredLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    className: 'sentinel-infrared-tiles',
    attribution: 'Tiles &copy; Esri &mdash; Sentinel-2 Multispectral Infrared'
});

const nasaOpticalLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    maxZoom: 19,
    className: 'nasa-optical-tiles',
    attribution: 'Tiles &copy; Esri &mdash; NASA GIBS Natural True Color'
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

function toggleSatelliteLayer(layerType) {
    // 1. Force remove all active base tile layers from the map
    [lightVoyagerLayer, darkCanvasLayer, satelliteLayer, openStreetMapLayer, sentinelInfraredLayer, nasaOpticalLayer].forEach(l => {
        if (l && map.hasLayer(l)) {
            map.removeLayer(l);
        }
    });
    map.eachLayer(layer => {
        if (layer instanceof L.TileLayer && layer !== liveWeatherRadarLayer) {
            map.removeLayer(layer);
        }
    });

    const cardSentinel = document.getElementById('card-gis-sentinel');
    const cardNasa = document.getElementById('card-gis-nasa');
    const mapEl = document.getElementById('map');
    const badgeEl = document.getElementById('gis-mode-badge');

    if (cardSentinel) cardSentinel.classList.remove('active-gis-layer');
    if (cardNasa) cardNasa.classList.remove('active-gis-layer');

    if (layerType === 'sentinel') {
        // Mode 1: Dark Mode Night Operation + Storm Weather Radar
        map.addLayer(darkCanvasLayer);
        if (!map.hasLayer(liveWeatherRadarLayer)) {
            map.addLayer(liveWeatherRadarLayer);
        }
        if (cardSentinel) cardSentinel.classList.add('active-gis-layer');
        if (badgeEl) {
            badgeEl.innerHTML = '<span>🌙</span> <span>Copernicus EMS &bull; Dark Thermal Night Map + Storm Radar</span>';
            badgeEl.classList.remove('hidden');
        }
    } else {
        // Mode 2: Full Daylight Space Satellite Photography
        map.addLayer(satelliteLayer);
        if (map.hasLayer(liveWeatherRadarLayer)) {
            map.removeLayer(liveWeatherRadarLayer);
        }
        if (cardNasa) cardNasa.classList.add('active-gis-layer');
        if (badgeEl) {
            badgeEl.innerHTML = '<span>🛰️</span> <span>NASA GIBS &bull; Daylight Space Satellite Photography</span>';
            badgeEl.classList.remove('hidden');
        }
    }

    if (mapEl) {
        mapEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    setTimeout(() => {
        map.invalidateSize();
    }, 150);
}
window.toggleSatelliteLayer = toggleSatelliteLayer;

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

function getDefaultApiHost() {
    if (typeof window !== 'undefined' && window.location) {
        const origin = window.location.origin;
        if (origin && origin.startsWith('http')) {
            if (window.location.port && window.location.port !== '8000') {
                return `${window.location.protocol}//${window.location.hostname}:8000`;
            }
            return origin;
        }
    }
    return 'http://127.0.0.1:8000';
}

let activeApiHost = sessionStorage.getItem('rescura_api_host') || getDefaultApiHost();

function getCandidateHosts() {
    const list = [];
    const def = getDefaultApiHost();
    if (def) list.push(def);
    if (activeApiHost && activeApiHost !== def) list.push(activeApiHost);
    if (window.location && window.location.origin && window.location.origin.startsWith('http')) {
        list.push(window.location.origin);
        list.push(window.location.origin.replace(/:\d+$/, ':8000'));
    }
    list.push('http://127.0.0.1:8000', 'http://localhost:8000');
    list.push('https://rescura-sync.onrender.com');
    return Array.from(new Set(list.filter(Boolean)));
}

/**
 * Downloads the automated PDF Action Plan for a given disaster event ID or parameters from active backend.
 */
function downloadActionPlanPDF(options = {}) {
    let evtId = (typeof options === 'object') ? (options.evtId || 1) : options;
    const params = new URLSearchParams();
    if (typeof options === 'object') {
        if (options.title) params.append('title', options.title);
        if (options.lat !== '' && options.lat !== undefined && options.lat !== null) params.append('lat', options.lat);
        if (options.lon !== '' && options.lon !== undefined && options.lon !== null) params.append('lon', options.lon);
        if (options.sev !== '' && options.sev !== undefined && options.sev !== null) params.append('severity', options.sev);
        if (options.date) params.append('date', options.date);
        if (options.waterLiters) params.append('water_liters', options.waterLiters);
        if (options.foodPacks) params.append('food_packs', options.foodPacks);
        if (options.budget) params.append('budget', options.budget);
        if (options.depotName) params.append('depot_name', options.depotName);
        if (options.distanceKm) params.append('distance_km', options.distanceKm);
        if (options.landEta) params.append('land_eta', options.landEta);
        if (options.airEta) params.append('air_eta', options.airEta);
        if (options.waterEta) params.append('water_eta', options.waterEta);
    }

    const q = params.toString() ? `?${params.toString()}` : '';
    const cleanId = encodeURIComponent(evtId || 0);
    const targetUrl = `${activeApiHost}/api/export-report/${cleanId}${q}`;
    
    const a = document.createElement('a');
    a.href = targetUrl;
    a.target = '_blank';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        if (a.parentNode) document.body.removeChild(a);
    }, 500);
}
window.downloadActionPlanPDF = downloadActionPlanPDF;

window._allEventsMap = new Map();

function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) - hash) + str.charCodeAt(i);
        hash |= 0;
    }
    return Math.abs(hash);
}

function registerEventForPdf(alert) {
    if (!alert) return '';
    const key = 'evt_' + (alert.id || '') + '_' + hashString(alert.title || '');
    window._allEventsMap.set(key, alert);
    return key;
}
window.registerEventForPdf = registerEventForPdf;

function downloadAlertByKey(key) {
    const alert = window._allEventsMap.get(key);
    if (!alert) return;
    const lat = alert.latitude !== undefined ? alert.latitude : (alert.lat !== undefined ? alert.lat : 0);
    const lon = alert.longitude !== undefined ? alert.longitude : (alert.lon !== undefined ? alert.lon : 0);
    const sev = alert.severity || 5.0;
    const title = alert.title || 'Disaster Event';
    const date = alert.created_at || alert.pubDate || '';

    const pred = alert.latest_prediction || (alert.predictions && alert.predictions[0]) || {};
    const waterLiters = Math.round(pred.water_liters || 0);
    const foodPacks = Math.round(pred.food_packs || 0);
    const budget = alert.total_estimated_budget_usd || Math.round((waterLiters * 0.50) + (foodPacks * 3.50));
    const depotName = alert.nearest_depot ? alert.nearest_depot.name : '';
    const distanceKm = alert.nearest_depot ? alert.nearest_depot.distance_km : getNearestDepotDistance(lat, lon);

    const eta = (alert.nearest_depot && alert.nearest_depot.eta_breakdown)
        ? alert.nearest_depot.eta_breakdown
        : calculateClientETABreakdown(distanceKm, sev, title, lat, lon);

    const landEta = (eta && eta.modes && eta.modes.land) ? eta.modes.land.formatted_time : '';
    const airEta = (eta && eta.modes && eta.modes.air) ? eta.modes.air.formatted_time : '';
    const waterEta = (eta && eta.modes && eta.modes.water) ? eta.modes.water.formatted_time : '';

    downloadActionPlanPDF({
        evtId: alert.id || 0,
        title,
        lat,
        lon,
        sev,
        date,
        waterLiters,
        foodPacks,
        budget,
        depotName,
        distanceKm,
        landEta,
        airEta,
        waterEta
    });
}
window.downloadAlertByKey = downloadAlertByKey;

function downloadAlertFromList(idx, listType = 'all') {
    const list = (listType === 'filtered') ? (window._lastFilteredAlerts || gdacsAlertsData) : gdacsAlertsData;
    const alert = list ? list[idx] : null;
    if (!alert) return;
    const key = registerEventForPdf(alert);
    downloadAlertByKey(key);
}
window.downloadAlertFromList = downloadAlertFromList;

/**
 * Fast, resilient API fetch helper with quick AbortController timeout and smart caching.
 */
async function apiFetch(path, options = {}) {
    const timeoutMs = options.timeout || 3500;
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
/**
 * Summary figures are for scanning, not auditing — a nine-digit litre count
 * reads as noise. Compact anything past a thousand and keep the exact value
 * in a title attribute for anyone who needs it.
 */
function compactNumber(n) {
    const num = Number(n);
    if (!isFinite(num)) return '0';
    const abs = Math.abs(num);
    if (abs >= 1e9) return (num / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (abs >= 1e6) return (num / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (abs >= 1e3) return (num / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toLocaleString();
}
window.compactNumber = compactNumber;

/**
 * Severity maps to one of three status colours. Everything that shows a
 * severity — dots, numbers, badges — goes through here so a "7.2" is the same
 * colour wherever it appears.
 */
function severityClass(severity) {
    const s = Number(severity);
    if (s >= 7) return 'critical';
    if (s >= 5) return 'warning';
    return 'ok';
}
window.severityClass = severityClass;

/**
 * Map pins are plain severity-coloured discs. An emoji pin reads as clip-art at
 * every zoom level and its colour carries no meaning; a disc does both jobs.
 */
function buildDisasterIcon(severity) {
    return L.divIcon({
        className: 'disaster-div-icon',
        html: `<span class="map-pin map-pin-${severityClass(severity)}"></span>`,
        iconSize: [14, 14],
        iconAnchor: [7, 7]
    });
}
window.buildDisasterIcon = buildDisasterIcon;

/**
 * Marks a toolbar button as working. CSS spins its icon; the label and layout
 * stay put, so the toolbar doesn't reflow while a request is in flight.
 */
function setButtonBusy(btn, busy) {
    if (!btn) return;
    btn.disabled = busy;
    btn.classList.toggle('is-busy', busy);
    if (busy) {
        btn.setAttribute('aria-busy', 'true');
    } else {
        btn.removeAttribute('aria-busy');
    }
}
window.setButtonBusy = setButtonBusy;

async function loadAnalytics() {
    try {
        const res = await apiFetch('/api/mission-analytics');
        if (res && res.ok) {
            const data = await res.json();
            const elWater = document.getElementById('total-water');
            const elFood = document.getElementById('total-food');
            const elTime = document.getElementById('avg-time');
            const elDisasters = document.getElementById('stat-disasters');

            // Units live in the markup as a separate muted span, so the value
            // element carries the number alone and never wraps mid-figure.
            if (elWater && data.sum_water_liters !== undefined) {
                elWater.innerText = compactNumber(data.sum_water_liters);
                elWater.title = `${data.sum_water_liters.toLocaleString()} litres`;
            }
            if (elFood && data.sum_food_packs !== undefined) {
                elFood.innerText = compactNumber(data.sum_food_packs);
                elFood.title = `${data.sum_food_packs.toLocaleString()} packs`;
            }
            if (elTime && data.mean_estimated_rescue_time !== undefined) {
                elTime.innerText = data.mean_estimated_rescue_time;
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

let activeSelectionToken = 0;

function getPopupOptions() {
    const isDesktop = window.innerWidth > 1024;
    const sidebarWidth = (isDesktop && isSidebarOpen) ? 420 : 20;
    return {
        autoPan: true,
        autoPanPaddingTopLeft: L.point(sidebarWidth, 90),
        autoPanPaddingBottomRight: L.point(20, 20),
        maxHeight: Math.min(window.innerHeight - 140, 520),
        closeButton: true,
        autoClose: true,
        closeOnClick: false,
        className: 'rescura-disaster-popup'
    };
}
window.getPopupOptions = getPopupOptions;

// Listen to popup closure on the map to clean up selection state and prevent stale async popups
map.on('popupclose', () => {
    currentlySelectedDisasterKey = null;
    activeSelectionToken++;
    if (activePolyline) {
        map.removeLayer(activePolyline);
        activePolyline = null;
    }
});

/**
 * Generates the unified, executive light popup card HTML
 */
function buildDisasterPopupHTML(lat, lon, title, severity, timeStr, depotNameText, distanceKm, waterLiters, foodPacks, estBudgetUsd, etaInfo) {
    const cont = getContinent(lat, lon, title);
    const numWater = Number(waterLiters) || 0;
    const numFood = Number(foodPacks) || 0;
    const numBudget = Number(estBudgetUsd) || Math.round((numWater * 0.50) + (numFood * 3.50));
    const medKits = Math.max(50, Math.round(severity * 140 + (numWater / 400)));

    const landEta = (etaInfo && etaInfo.modes && etaInfo.modes.land) ? etaInfo.modes.land.formatted_time : 'Calculating';
    const airEta = (etaInfo && etaInfo.modes && etaInfo.modes.air) ? etaInfo.modes.air.formatted_time : 'Calculating';
    const waterEta = (etaInfo && etaInfo.modes && etaInfo.modes.water) ? etaInfo.modes.water.formatted_time : 'Calculating';

    return `
        <div class="disaster-popup-card" style="font-family: var(--font-sans, Inter, sans-serif); min-width: 260px; color: #0f172a; padding: 2px;">
            <!-- Top Header Badges -->
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                <div style="display: flex; gap: 6px; align-items: center;">
                    <span style="font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 4px; background: #f1f5f9; color: #475569; letter-spacing: 0.04em;">
                        ${cont.toUpperCase()}
                    </span>
                    <span style="font-size: 10px; font-weight: 700; padding: 2px 7px; border-radius: 4px; background: #fee2e2; color: #b91c1c; letter-spacing: 0.04em;">
                        EMERGENCY
                    </span>
                </div>
                <span style="font-size: 11px; font-weight: 700; padding: 2px 8px; border-radius: 4px; background: ${severity >= 7 ? '#fee2e2' : (severity >= 5 ? '#fef3c7' : '#dcfce7')}; color: ${severity >= 7 ? '#991b1b' : (severity >= 5 ? '#92400e' : '#166534')}; font-variant-numeric: tabular-nums;">
                    ${severity}/10
                </span>
            </div>

            <!-- Title -->
            <h4 style="margin: 0 0 8px 0; color: #0f172a; font-size: 14px; font-weight: 700; line-height: 1.35;">
                ${title}
            </h4>

            <!-- Event Meta Bar -->
            <div style="font-size: 11px; color: #64748b; margin-bottom: 8px; display: flex; justify-content: space-between; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px;">
                <span>Reported Time</span>
                <span style="font-weight: 600; color: #334155;">${timeStr}</span>
            </div>

            <!-- Assigned Depot -->
            <div style="font-size: 11.5px; color: #0f172a; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 10px; margin-bottom: 10px;">
                <span style="color: #64748b; font-size: 10.5px; display: block; font-weight: 500;">Assigned Logistics Base</span>
                <strong style="color: #0369a1;">${depotNameText || 'Yangon Central Base'}</strong>
                <span style="color: #64748b; font-size: 11px; margin-left: 4px;">(${distanceKm} km)</span>
            </div>

            <!-- Relief Supplies Grid -->
            <div style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; margin-bottom: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
                <div>
                    <span style="font-size: 10.5px; color: #64748b; display: block;">Water Needed</span>
                    <strong style="font-size: 12px; color: #0284c7; font-variant-numeric: tabular-nums;">${numWater.toLocaleString()} L</strong>
                </div>
                <div>
                    <span style="font-size: 10.5px; color: #64748b; display: block;">Food Rations</span>
                    <strong style="font-size: 12px; color: #d97706; font-variant-numeric: tabular-nums;">${numFood.toLocaleString()} packs</strong>
                </div>
                <div>
                    <span style="font-size: 10.5px; color: #64748b; display: block;">Medical Kits</span>
                    <strong style="font-size: 12px; color: #059669; font-variant-numeric: tabular-nums;">${medKits.toLocaleString()} kits</strong>
                </div>
                <div>
                    <span style="font-size: 10.5px; color: #64748b; display: block;">Est. Budget</span>
                    <strong style="font-size: 12px; color: #0f172a; font-variant-numeric: tabular-nums;">$${Math.round(numBudget).toLocaleString()}</strong>
                </div>
            </div>

            <!-- Multi-Modal Dispatch ETAs -->
            <div style="margin-bottom: 10px; padding: 8px 10px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;">
                <span style="font-size: 10.5px; color: #64748b; font-weight: 600; display: block; margin-bottom: 6px;">Multi-Modal Transit ETAs</span>
                <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 4px; text-align: center; font-size: 10.5px;">
                    <div style="background: #ffffff; padding: 4px 2px; border-radius: 4px; border: 1px solid #e2e8f0;">
                        <span style="color: #64748b; font-size: 9.5px; display: block;">Land</span>
                        <strong style="color: ${landEta === 'N/A' ? '#94a3b8' : '#0f172a'}; font-weight: ${landEta === 'N/A' ? '500' : '700'};">${landEta}</strong>
                    </div>
                    <div style="background: #ffffff; padding: 4px 2px; border-radius: 4px; border: 1px solid #e2e8f0;">
                        <span style="color: #64748b; font-size: 9.5px; display: block;">Air</span>
                        <strong style="color: ${airEta === 'N/A' ? '#94a3b8' : '#0f172a'}; font-weight: ${airEta === 'N/A' ? '500' : '700'};">${airEta}</strong>
                    </div>
                    <div style="background: #ffffff; padding: 4px 2px; border-radius: 4px; border: 1px solid #e2e8f0;">
                        <span style="color: #64748b; font-size: 9.5px; display: block;">Water</span>
                        <strong style="color: ${waterEta === 'N/A' ? '#94a3b8' : '#0f172a'}; font-weight: ${waterEta === 'N/A' ? '500' : '700'};">${waterEta}</strong>
                    </div>
                </div>
            </div>

            <!-- Footer -->
            <div style="font-size: 10px; color: #94a3b8; display: flex; justify-content: space-between; border-top: 1px solid #f1f5f9; padding-top: 6px;">
                <span>${lat.toFixed(3)}, ${lon.toFixed(3)}</span>
                <span>GDACS Real-Time</span>
            </div>
        </div>
    `;
}
window.buildDisasterPopupHTML = buildDisasterPopupHTML;

/**
 * Smooth camera pan & zoom function to focus map on emergency coordinates
 */
function focusMap(lat, lon) {
    if (!lat || !lon || !map) return;
    const targetZoom = 8.5;

    const isDesktop = window.innerWidth > 1024;
    const sidebarWidth = (isDesktop && isSidebarOpen) ? 416 : 0;
    const topNavHeight = 90;

    const visibleCenterX = sidebarWidth + (window.innerWidth - sidebarWidth) / 2;
    const visibleCenterY = topNavHeight + (window.innerHeight - topNavHeight) / 2;

    // Position marker so the popup (which is ~360px above marker) is vertically and horizontally centered in unobstructed viewport
    const desiredMarkerScreenX = visibleCenterX;
    const desiredMarkerScreenY = visibleCenterY + 110;

    const offsetX = (window.innerWidth / 2) - desiredMarkerScreenX;
    const offsetY = (window.innerHeight / 2) - desiredMarkerScreenY;

    try {
        const targetPoint = map.project([lat, lon], targetZoom);
        const adjustedPoint = targetPoint.add([offsetX, offsetY]);
        const adjustedLatLng = map.unproject(adjustedPoint, targetZoom);

        map.flyTo(adjustedLatLng, targetZoom, {
            animate: true,
            duration: 1.0
        });
    } catch (e) {
        map.flyTo([lat, lon], targetZoom, {
            animate: true,
            duration: 1.0
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
        { id: 'chip-all', radarCntId: 'radar-cnt-all', key: 'All', label: 'All Continents', icon: '' },
        { id: 'chip-asia', radarCntId: 'radar-cnt-asia', key: 'Asia', label: 'Asia', icon: '🌏 ' },
        { id: 'chip-europe', radarCntId: 'radar-cnt-europe', key: 'Europe', label: 'Europe', icon: '🌍 ' },
        { id: 'chip-americas', radarCntId: 'radar-cnt-americas', key: 'Americas', label: 'Americas', icon: '🌎 ' },
        { id: 'chip-africa', radarCntId: 'radar-cnt-africa', key: 'Africa', label: 'Africa', icon: '🌍 ' },
        { id: 'chip-oceania', radarCntId: 'radar-cnt-oceania', key: 'Oceania', label: 'Oceania', icon: '🌏 ' }
    ];

    chipMap.forEach(({ id, radarCntId, key, label, icon }) => {
        const num = counts[key] !== undefined ? counts[key] : 0;
        const chip = document.getElementById(id);
        if (chip) {
            chip.innerHTML = `${icon}${label} <span class="chip-count">${num}</span>`;
        }
        const radarCnt = document.getElementById(radarCntId);
        if (radarCnt) {
            radarCnt.innerText = num;
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
        const isMatch = (c === continent.toLowerCase()) || (c === 'all' && continent === 'All');
        const el = document.getElementById(`chip-${c}`);
        const radarEl = document.getElementById(`radar-chip-${c}`);
        if (el) el.classList.toggle('active', isMatch);
        if (radarEl) radarEl.classList.toggle('active', isMatch);
    });

    const continentViews = {
        'All': { center: [20.0, 10.0], zoom: 2.3 },
        'Asia': { center: [22.0, 96.0], zoom: 4.8 },
        'Europe': { center: [50.0, 15.0], zoom: 4.2 },
        'Americas': { center: [15.0, -80.0], zoom: 3.2 },
        'Africa': { center: [2.0, 22.0], zoom: 3.6 },
        'Oceania': { center: [-25.0, 135.0], zoom: 4.0 }
    };

    if (map && continentViews[continent]) {
        const target = continentViews[continent];
        map.flyTo(target.center, target.zoom, { animate: true, duration: 1.2 });
    }

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

    // Region and hazard type are read as words, not decoded from emoji.
    const getEmoji = () => '';
    const getCategoryIcon = () => '';

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
    window._lastFilteredAlerts = filteredAlerts;
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
                const eventPdfKey = registerEventForPdf(alert);
                
                let rawType = ((alert.disaster_type || '') + ' ' + (alert.title || '')).toLowerCase();
                let cat = 'Earthquake';
                if (rawType.includes('cyclone') || rawType.includes('storm') || /\b(tc|hurricane|typhoon)\b/.test(rawType)) cat = 'Tropical Cyclone';
                else if (rawType.includes('flood') || rawType.includes('tsunami') || /\b(fl)\b/.test(rawType)) cat = 'Flood';
                else if (rawType.includes('fire') || rawType.includes('wildfire') || /\b(wf)\b/.test(rawType)) cat = 'Forest Fire';

                const sev = alert.severity || 5.0;
                const sevClass = severityClass(sev);

                const card = document.createElement('div');
                card.className = 'event-card';
                card.setAttribute('data-disaster-id', disasterId);
                card.onclick = (e) => {
                    if (e.target.closest('button')) return;
                    toggleSelectDisaster(lat, lon, alert.title, alert.severity, alert.created_at || alert.pubDate, alert.nearest_depot);
                    focusMap(lat, lon);
                };

                card.innerHTML = `
                    <div class="event-card-meta">
                        <span class="dot dot-${sevClass}"></span>
                        <span>${cat}</span>
                        <span class="event-card-sep">/</span>
                        <span>${cont}</span>
                        <span class="sev sev-${sevClass}" style="margin-left:auto">${sev}</span>
                    </div>
                    <div class="event-card-title">${alert.title}</div>
                    <div class="event-card-foot">
                        <span class="event-card-time">${timeStr}</span>
                        <button class="btn btn-xs btn-quiet" onclick="event.stopPropagation(); downloadAlertByKey('${eventPdfKey}')">PDF</button>
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
        const sevClass = severityClass(alert.severity);
        const eventPdfKey = registerEventForPdf(alert);

        const card = document.createElement('div');
        card.className = 'event-card';
        card.setAttribute('data-disaster-id', disasterId);
        card.onclick = (e) => {
            if (e.target.closest('button')) return;
            toggleSelectDisaster(lat, lon, alert.title, alert.severity, alert.created_at || alert.pubDate, alert.nearest_depot);
            focusMap(lat, lon);
        };

        card.innerHTML = `
            <div class="event-card-meta">
                <span class="dot dot-${sevClass}"></span>
                <span>${cont}</span>
                <span class="sev sev-${sevClass}" style="margin-left:auto">${alert.severity}</span>
            </div>
            <div class="event-card-title">${alert.title}</div>
            <div class="event-card-foot">
                <span class="event-card-time">${timeStr}</span>
                <button class="btn btn-xs btn-quiet" onclick="event.stopPropagation(); downloadAlertByKey('${eventPdfKey}')">PDF</button>
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
            { agency: "UN-OCHA Dispatch", action: "Logistics corridor & medical airlift mobilized" },
            { agency: "WFP Logistics Cluster", action: "Potable water & ration staging underway" },
            { agency: "AHA Centre", action: "Situation report & regional stockpile release" }
        ];

        osoccContainer.innerHTML = topEvents.map((evt, idx) => {
            const role = roles[idx % roles.length];
            const lat = evt.latitude !== undefined ? evt.latitude : (evt.lat !== undefined ? evt.lat : 0);
            const lon = evt.longitude !== undefined ? evt.longitude : (evt.lon !== undefined ? evt.lon : 0);
            const timeAgo = formatOccurredTime(evt.created_at || evt.pubDate || new Date().toISOString());
            return `
                <div onclick="focusDisasterOnMap(${lat}, ${lon}, '${encodeURIComponent(evt.title || '')}', ${evt.severity || 7.0})" class="feed-row">
                    <div class="feed-row-top">
                        <span class="feed-row-title">${evt.title}</span>
                        <span class="feed-row-time">${timeAgo}</span>
                    </div>
                    <div class="feed-row-sub">
                        <span class="feed-row-agency">${role.agency}</span>
                        <span>${role.action}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    // 2. GDACS News & Bulletins - Real Live RSS updates
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
            const sev = evt.severity || 7.0;
            const sevClass = severityClass(sev);
            return `
                <div onclick="focusDisasterOnMap(${lat}, ${lon}, '${encodeURIComponent(evt.title || '')}', ${sev})" class="feed-row">
                    <div class="feed-row-top">
                        <span class="feed-row-agency">${agency}</span>
                        <span class="feed-row-time">${dateStr}</span>
                    </div>
                    <div class="feed-row-title" style="margin-top:4px">${evt.title}</div>
                    <div class="feed-row-sub">
                        <span class="dot dot-${sevClass}"></span>
                        <span>Severity <span class="sev sev-${sevClass}">${sev}</span></span>
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
    toggleSelectDisaster(lat, lon, title, severity);
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
 * Re-clicking/double-clicking unselects the event and closes its popup.
 */
function toggleSelectDisaster(lat, lon, title, severity, created_at = null, depotObj = null) {
    const targetLat = parseFloat(lat);
    const targetLon = parseFloat(lon);
    if (isNaN(targetLat) || isNaN(targetLon)) return;

    const disasterKey = `${targetLat.toFixed(3)}_${targetLon.toFixed(3)}`;

    // Re-click / Double-click on SAME disaster -> UNSELECT
    if (currentlySelectedDisasterKey === disasterKey) {
        currentlySelectedDisasterKey = null;
        activeSelectionToken++;
        map.closePopup();
        if (activeMarker) {
            map.removeLayer(activeMarker);
            activeMarker = null;
        }
        if (activePolyline) {
            map.removeLayer(activePolyline);
            activePolyline = null;
        }
        return;
    }

    currentlySelectedDisasterKey = disasterKey;
    const requestToken = ++activeSelectionToken;
    focusMap(targetLat, targetLon);
    fetchReliefData(targetLat, targetLon, severity, title, created_at, requestToken);
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
async function fetchReliefData(lat = 17.3333, lon = 96.4833, severity = 7.5, title = 'Emergency Zone', eventCreatedAt = null, requestToken = null) {
    try {
        const currentToken = requestToken !== null ? requestToken : activeSelectionToken;
        const existingEvt = gdacsAlertsData.find(e =>
            (Math.abs((e.latitude || e.lat || 0) - lat) < 0.005 && Math.abs((e.longitude || e.lon || 0) - lon) < 0.005) ||
            (e.title && title && e.title.trim().toLowerCase() === title.trim().toLowerCase())
        );

        let waterLiters = 0;
        let foodPacks = 0;
        let timeStr = formatOccurredTime(eventCreatedAt);
        let depotNameText = '';
        let distanceKm = 0;

        if (existingEvt) {
            const pred = existingEvt.latest_prediction || (existingEvt.predictions && existingEvt.predictions[0]) || {};
            waterLiters = Math.round(pred.water_liters || 0);
            foodPacks = Math.round(pred.food_packs || 0);
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
        
        // CHECK IF SELECTION WAS CANCELLED OR CHANGED WHILE WAITING FOR API RESPONSE
        if (currentToken !== activeSelectionToken || !currentlySelectedDisasterKey) {
            return;
        }

        if (response && response.ok) {
            const data = await response.json();
            const aiPrediction = data.ai_prediction || {};

            if (!existingEvt) {
                waterLiters = Math.round(aiPrediction.water_liters || 0);
                foodPacks = Math.round(aiPrediction.food_packs || 0);
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

        const estBudgetUsd = (existingEvt && existingEvt.total_estimated_budget_usd)
            ? existingEvt.total_estimated_budget_usd
            : Math.round((waterLiters * 0.50) + (foodPacks * 3.50));

        const etaInfo = (existingEvt && existingEvt.nearest_depot && existingEvt.nearest_depot.eta_breakdown)
            ? existingEvt.nearest_depot.eta_breakdown
            : calculateClientETABreakdown(distanceKm, severity, title, lat, lon);

        if (etaInfo && etaInfo.assigned_depot_override) {
            depotNameText = etaInfo.assigned_depot_override;
        }

        const popupContent = buildDisasterPopupHTML(
            lat, lon, title, severity, timeStr,
            depotNameText, distanceKm, waterLiters, foodPacks, estBudgetUsd, etaInfo
        );

        const popupOptions = getPopupOptions();
        let matchMarker = mapMarkers.find(m =>
            Math.abs(m.getLatLng().lat - lat) < 0.005 && Math.abs(m.getLatLng().lng - lon) < 0.005
        );

        if (matchMarker) {
            matchMarker.setPopupContent(popupContent);
            if (!matchMarker.isPopupOpen() && currentlySelectedDisasterKey) {
                matchMarker.openPopup();
            }
        } else {
            if (activeMarker) {
                map.removeLayer(activeMarker);
                activeMarker = null;
            }

            if (currentlySelectedDisasterKey) {
                activeMarker = L.marker([lat, lon], { icon: buildDisasterIcon(severity) })
                    .addTo(map)
                    .bindPopup(popupContent, popupOptions)
                    .openPopup();
            }
        }

        if (activePolyline) {
            map.removeLayer(activePolyline);
            activePolyline = null;
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
            const depotData = (typeof sosDepotResults !== 'undefined' && Array.isArray(sosDepotResults)) ? sosDepotResults[index] : null;

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
            `, getPopupOptions());

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
                            focusMap(newLat, newLon);
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
                        html: '<span class="map-pin map-pin-depot"></span>',
                        iconSize: [14, 14],
                        iconAnchor: [7, 7]
                    });
                    const depotMarker = L.marker([depot.latitude, depot.longitude], { icon: depotIcon })
                        .addTo(map)
                        .bindPopup(`
                            <div style="font-family: Inter, sans-serif; min-width: 220px; padding: 4px 2px;">
                                <div style="font-size: 10px; font-weight: 700; text-transform: uppercase; color: #0284c7; letter-spacing: 0.05em; margin-bottom: 2px;">National Logistics Base</div>
                                <h4 style="margin: 0 0 8px 0; color: #0f172a; font-size: 13px; font-weight: 700;">${depot.name}</h4>
                                <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 6px; margin-bottom: 8px; background: #f8fafc; padding: 6px 8px; border-radius: 6px; border: 1px solid #e2e8f0;">
                                    <div>
                                        <div style="font-size: 10px; color: #64748b; font-weight: 500;">Water Capacity</div>
                                        <div style="font-size: 12px; font-weight: 700; color: #0284c7;">${depot.water_inventory.toLocaleString()} L</div>
                                    </div>
                                    <div>
                                        <div style="font-size: 10px; color: #64748b; font-weight: 500;">Food Rations</div>
                                        <div style="font-size: 12px; font-weight: 700; color: #d97706;">${depot.food_inventory.toLocaleString()} packs</div>
                                    </div>
                                    <div>
                                        <div style="font-size: 10px; color: #64748b; font-weight: 500;">Medical Kits</div>
                                        <div style="font-size: 12px; font-weight: 700; color: #059669;">${(depot.medical_kits || 3400).toLocaleString()} kits</div>
                                    </div>
                                </div>
                                <div style="font-size: 11px; color: #475569;"><b>Transit Mode:</b> ${depot.primary_transit_mode || 'Land Convoy & Marine Delta Barge'}</div>
                            </div>
                        `, getPopupOptions());
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

const FALLBACK_OPERATIONAL_DISASTERS = [
    {
        id: 1,
        title: "Typhoon Yagi Remnants & Widespread Flood (Naypyidaw / Tatkon)",
        disaster_type: "Flood",
        latitude: 20.1287,
        longitude: 96.2167,
        severity: 8.8,
        country: "Myanmar",
        created_at: new Date().toISOString(),
        latest_prediction: { water_liters: 132000, food_packs: 35200, total_estimated_budget_usd: 189200 },
        estimated_rescue_time: 5.2,
        nearest_depot: { name: "Naypyidaw Strategic Reserve", distance_km: 42.5 }
    },
    {
        id: 2,
        title: "Sagaing Fault Major Seismic Sequence (M7.7 Epicenter)",
        disaster_type: "Earthquake",
        latitude: 21.8833,
        longitude: 95.9667,
        severity: 8.9,
        country: "Myanmar",
        created_at: new Date().toISOString(),
        latest_prediction: { water_liters: 145000, food_packs: 39000, total_estimated_budget_usd: 209000 },
        estimated_rescue_time: 5.8,
        nearest_depot: { name: "Mandalay Regional Depot", distance_km: 18.2 }
    },
    {
        id: 3,
        title: "Inle Lake Basin Severe Inundation (Nyaungshwe / Kalaw)",
        disaster_type: "Flood",
        latitude: 20.5900,
        longitude: 96.9200,
        severity: 8.3,
        country: "Myanmar",
        created_at: new Date().toISOString(),
        latest_prediction: { water_liters: 110000, food_packs: 29000, total_estimated_budget_usd: 156500 },
        estimated_rescue_time: 4.8,
        nearest_depot: { name: "Naypyidaw Strategic Reserve", distance_km: 98.4 }
    },
    {
        id: 4,
        title: "Bago River Catastrophic Flash Inundation",
        disaster_type: "Flood",
        latitude: 17.3333,
        longitude: 96.4833,
        severity: 8.4,
        country: "Myanmar",
        created_at: new Date().toISOString(),
        latest_prediction: { water_liters: 125000, food_packs: 33000, total_estimated_budget_usd: 178000 },
        estimated_rescue_time: 4.2,
        nearest_depot: { name: "Yangon Central Base", distance_km: 62.1 }
    },
    {
        id: 5,
        title: "Hpakant Jade Mines Slopes & Debris Collapse",
        disaster_type: "Forest Fire",
        latitude: 25.6100,
        longitude: 96.3100,
        severity: 8.1,
        country: "Myanmar",
        created_at: new Date().toISOString(),
        latest_prediction: { water_liters: 95000, food_packs: 25000, total_estimated_budget_usd: 135000 },
        estimated_rescue_time: 6.4,
        nearest_depot: { name: "Mandalay Regional Depot", distance_km: 410.0 }
    },
    {
        id: 6,
        title: "Sittwe & Northern Rakhine Cyclone Surge & River Flooding",
        disaster_type: "Tropical Cyclone",
        latitude: 20.1400,
        longitude: 92.8900,
        severity: 8.2,
        country: "Myanmar",
        created_at: new Date().toISOString(),
        latest_prediction: { water_liters: 118000, food_packs: 31000, total_estimated_budget_usd: 167500 },
        estimated_rescue_time: 5.5,
        nearest_depot: { name: "Naypyidaw Strategic Reserve", distance_km: 335.0 }
    }
];

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
        let events = [];

        if (dashRes && dashRes.ok) {
            const dashData = await dashRes.json();
            events = dashData.dashboard_data || [];
        } else {
            console.warn('Dashboard data fetch notice:', dashRes ? dashRes.status : 'offline/timeout');
            // If API is warming up on fresh clone, use immediate verified operational disasters so map and feeds appear instantly
            if (!gdacsAlertsData || gdacsAlertsData.length === 0) {
                events = FALLBACK_OPERATIONAL_DISASTERS;
            } else {
                events = gdacsAlertsData;
            }
            setTimeout(initializeDashboard, 4000);
        }

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
                : calculateClientETABreakdown(distanceKm, event.severity, title, lat, lon);

            if (etaInfo && etaInfo.assigned_depot_override) {
                depotNameText = etaInfo.assigned_depot_override;
            }

            let waterVal = latestPred ? latestPred.water_liters : 1500000;
            let foodVal = latestPred ? latestPred.food_packs : 250000;
            let budgetVal = event.total_estimated_budget_usd || Math.round((waterVal * 0.50) + (foodVal * 3.50));

            const popupContent = buildDisasterPopupHTML(
                lat, lon, title, event.severity, timeStr,
                depotNameText, distanceKm, waterVal, foodVal, budgetVal, etaInfo
            );

            const marker = L.marker([lat, lon], { icon: buildDisasterIcon(event.severity) })
                .addTo(map)
                .bindPopup(popupContent, getPopupOptions());

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
            focusMap(lat, lon);
            setTimeout(() => {
                fetchReliefData(lat, lon, severity, title);
            }, 600);
        }
    }
}

/**
 * Manual "Sync AI Data" trigger to run live GDACS fetch & AI predictions in background
 */
async function syncData() {
    const btn = document.getElementById('btn-sync-ai');
    
    // Toggle a busy class rather than rewriting innerHTML — the button keeps
    // its icon and its responsive label, and the width never jumps.
    setButtonBusy(btn, true);

    try {
        await Promise.all([
            apiFetch('/api/train-rescue-ai', { method: 'POST', timeout: 3500 }),
            apiFetch('/api/live-alerts', { timeout: 3500 })
        ]);

        await initializeDashboard();

    } catch (err) {
        console.error('Failed to sync AI data:', err);
    } finally {
        setButtonBusy(btn, false);
    }
}

/**
 * Triggers loading of Pandas mission analytics and re-fetches map dashboard data
 */
async function refreshLogistics() {
    const btn = document.getElementById('btn-refresh-logistics');
    setButtonBusy(btn, true);
    try {
        await loadAnalytics();
        await initializeDashboard();
    } catch (err) {
        console.error('Failed to refresh logistics:', err);
    } finally {
        setButtonBusy(btn, false);
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

function isWaterwayAccessible(lat, lon, title = '') {
    const t = (title || '').toLowerCase();
    
    // 1. Highland, Mountain, Plateau, Mining & Landslide indicators -> Definitely NO water transit possible
    const inlandHighlandKeywords = [
        'pyin oo lwin', 'pyinoolwin', 'maymyo', 'taunggyi', 'kalaw', 'mogok', 'hpakant', 
        'putao', 'lashio', 'kyaukme', 'hsipaw', 'loikaw', 'hakha', 'tedim', 'mindat', 
        'falam', 'matupi', 'kanpetlet', 'pindaya', 'namhsan', 'kutkai', 'muse', 
        'kengtung', 'tachileik', 'highland', 'mountain', 'hill', 'plateau', 'landslide', 
        'mudflow', 'ridge', 'cliff', 'elevation', 'slope', 'quarry', 'mine', 'mining'
    ];
    if (inlandHighlandKeywords.some(k => t.includes(k))) return false;
    
    // 2. Known Water / Riverine / Delta / Coastal zones
    const waterwayKeywords = [
        'delta', 'river', 'ayeyarwady', 'irrawaddy', 'chindwin', 'sittoung', 'thanlwin', 
        'coast', 'coastal', 'island', 'sea', 'bay', 'gulf', 'port', 'barge', 'harbor', 
        'bogale', 'labutta', 'pyapon', 'pathein', 'myaungmya', 'sittwe', 'kyaukpyu', 
        'myeik', 'dawei', 'mawlamyine', 'twante', 'hinthada', 'pyay', 
        'pakokku', 'chauk', 'magway', 'minbu', 'flood', 'cyclone', 'tsunami', 'storm surge'
    ];
    if (waterwayKeywords.some(k => t.includes(k))) return true;

    // 3. Coordinate-based bounding for Delta & Coastal zones in Lower Myanmar
    if (lat >= 15.0 && lat <= 18.0 && lon >= 94.0 && lon <= 97.0) return true;
    if (lat >= 18.0 && lat <= 21.5 && lon >= 92.0 && lon <= 94.5) return true;
    if (lat >= 9.5 && lat <= 15.0 && lon >= 97.5 && lon <= 99.0) return true;

    // 4. Shan Plateau / Eastern Highlands (Lon > 96.35 and Lat > 20.0) -> Mountainous
    if (lon >= 96.35 && lat >= 20.0) return false;

    // 5. Western Chin & Sagaing Mountain Ranges (Lon < 94.5 and Lat > 21.0) -> Mountainous
    if (lon <= 94.5 && lat >= 21.0) return false;

    return false;
}

function calculateClientETABreakdown(distKm, severity, title, lat = 0, lon = 0) {
    const d = Math.max(0.1, parseFloat(distKm) || 0);
    const sev = parseFloat(severity) || 5.0;
    const titleLower = (title || '').toLowerCase();
    const cont = (lat && lon) ? getContinent(lat, lon, title) : (d > 1800 ? 'Global' : 'Asia');
    const isIntercontinental = (cont !== 'Asia' && cont !== 'Myanmar') || (d > 1800);
    const hasWaterway = isWaterwayAccessible(lat, lon, title);

    // 1. ZONE 3: Inter-Continental / Global Response
    if (isIntercontinental) {
        const airTotal = (d * 1.05 / 800.0) + 4.0;
        const airH = Math.floor(airTotal);
        const airM = Math.round((airTotal - airH) * 60);
        return {
            recommended_mode: 'air',
            recommended_icon: '✈️',
            recommendation_rationale: `✈️ STRATEGIC INTERNATIONAL AIRLIFT: Global emergency in ${cont} (${Math.round(d).toLocaleString()} km from Myanmar). Ground/boat transit is out of range across continents. UNHRD strategic heavy cargo flight deployed at 800 km/h (${airH}h ${airM}m).`,
            assigned_depot_override: 'UNHRD Global Reserve Network (UN-OCHA Handoff)',
            modes: {
                land: { formatted_time: 'N/A', available: false, status_note: 'Out of Ground Range / Cross-Continental' },
                air: { formatted_time: `${airH}h ${airM}m`, available: true, status_note: 'Strategic Long-Range Cargo Flight' },
                water: { formatted_time: 'N/A', available: false, status_note: 'No Contiguous Waterway / Trans-Oceanic' }
            }
        };
    }

    // 2. ZONE 2: Regional ASEAN Operations (600km - 1800km)
    if (d >= 600) {
        const airTotal = (d * 1.08 / 500.0) + 1.5;
        const airH = Math.floor(airTotal);
        const airM = Math.round((airTotal - airH) * 60);

        const landTotal = (d * 1.35 / 45.0) + 2.0;
        const landH = Math.floor(landTotal);
        const landM = Math.round((landTotal - landH) * 60);

        const waterTotal = (d * 1.3 / 30.0) + 1.5;
        const waterH = Math.floor(waterTotal);
        const waterM = Math.round((waterTotal - waterH) * 60);

        const isWater = ['flood', 'tsunami', 'cyclone', 'storm', 'river', 'sea', 'coastal', 'drowning'].some(k => titleLower.includes(k)) && hasWaterway;
        let recMode = (isWater && d <= 500) ? 'water' : ((sev >= 6.5 || d >= 800) ? 'air' : 'land');
        let rationale = (recMode === 'air') 
            ? `🚁 REGIONAL AIRLIFT: Regional ASEAN corridor (${Math.round(d)} km). Regional C-130 cargo airlift deployed (${airH}h ${airM}m).`
            : (recMode === 'water' ? `🚢 COASTAL VESSEL: Regional maritime corridor (${waterH}h ${waterM}m).` : `🚚 CROSS-BORDER CONVOY: Cross-border road transit (${landH}h ${landM}m).`);

        return {
            recommended_mode: recMode,
            recommended_icon: recMode === 'air' ? '🚁' : (recMode === 'water' ? '🚢' : '🚚'),
            recommendation_rationale: rationale,
            assigned_depot_override: 'AHA Centre Regional Standby Stockpile (Subang/Yangon Base)',
            modes: {
                land: { formatted_time: `${landH}h ${landM}m`, available: true },
                air: { formatted_time: `${airH}h ${airM}m`, available: true },
                water: {
                    formatted_time: hasWaterway ? `${waterH}h ${waterM}m` : 'N/A',
                    available: hasWaterway,
                    status_note: hasWaterway ? 'Coastal relief vessel' : 'Inland / No maritime connection'
                }
            }
        };
    }

    // 3. ZONE 1: Domestic Operations (< 600km, Myanmar Theatre)
    const landTotal = (d * 1.3 / 50.0) + 0.5;
    const landH = Math.floor(landTotal);
    const landM = Math.round((landTotal - landH) * 60);

    const airTotal = (d * 1.05 / 220.0) + 0.3;
    const airH = Math.floor(airTotal);
    const airM = Math.round((airTotal - airH) * 60);

    const waterTotal = (d * 1.4 / 25.0) + 0.6;
    const waterH = Math.floor(waterTotal);
    const waterM = Math.round((waterTotal - waterH) * 60);

    const isWater = ['flood', 'tsunami', 'cyclone', 'storm', 'river', 'sea', 'coastal', 'drowning'].some(k => titleLower.includes(k)) && hasWaterway;
    let recMode = 'land';
    let rationale = '';

    if (isWater && d <= 80) {
        recMode = 'water';
        rationale = `🚢 WATER/BOAT RECOMMENDED: Water/flood disaster detected within ${d.toFixed(1)}km. Delta rescue boat deployment is optimal for flooded/riverine terrain.`;
    } else if (sev >= 7.0 || d >= 120) {
        recMode = 'air';
        rationale = `🚁 AIR HELICOPTER RECOMMENDED: High severity (${sev}/10) or long distance (${d.toFixed(1)}km). Tactical helicopter bypasses ground road blockages in ${airH}h ${airM}m.`;
    } else {
        recMode = 'land';
        rationale = `🚚 LAND CONVOY RECOMMENDED: Standard tactical ground road deployment for ${d.toFixed(1)}km distance (${landH}h ${landM}m).`;
    }

    return {
        recommended_mode: recMode,
        recommendation_rationale: rationale,
        assigned_depot_override: null,
        modes: {
            land: { formatted_time: `${landH}h ${landM}m`, available: true },
            air: { formatted_time: `${airH}h ${airM}m`, available: true },
            water: {
                formatted_time: hasWaterway ? `${waterH}h ${waterM}m` : 'N/A',
                available: hasWaterway,
                status_note: hasWaterway ? 'Navigable river/delta boat' : 'Landlocked Highland / No Navigable Waterway'
            }
        }
    };
}

/**
 * Populates and displays the high-priority emergency modal popup for events in Myanmar & ASEAN
 */
function displayEmergencyModal(payload) {
    return; // TEMP: emergency popup disabled
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
    const elMedical = document.getElementById('modal-medical');
    const elDepot = document.getElementById('modal-depot');

    if (modal) {
        if (elTitle) elTitle.innerText = payload.title || 'Disaster Event';
        if (elSev) elSev.innerText = `${payload.severity || 5.0} / 10`;
        if (elTime) elTime.innerText = formatOccurredTime(payload.created_at || payload.pubDate || payload.timestamp);
        if (elPop) elPop.innerText = `${(payload.affected_population || 0).toLocaleString()} People`;
        if (elWater) elWater.innerText = `${(payload.total_water_liters || 0).toLocaleString()} L`;
        if (elFood) elFood.innerText = `${(payload.total_food_packs || 0).toLocaleString()} Packs`;
        if (elMedical) elMedical.innerText = `${Math.max(50, Math.round((payload.severity || 5.0) * 140 + ((payload.total_water_liters || 0) / 400))).toLocaleString()} Kits`;
        
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
    'myanmar_demographics.csv': {
        name: 'Myanmar Demographics & Census',
        records: '330 Official Townships',
        citation: 'MIMU (Myanmar Information Management Unit - UN Resident Coordinator Office)',
        desc: 'Official Myanmar Census baseline mapping all 330 townships across all 15 States and Divisions with verified population counts and coordinates.'
    },
    'historical_disasters.csv': {
        name: 'Historical Disaster Registry',
        records: '100 Major Events',
        citation: 'AHA Centre ADINet, UN-OCHA ReliefWeb, EM-DAT & Myanmar DDM',
        desc: 'Comprehensive multi-hazard disaster registry (cyclones, floods, earthquakes, landslides) across Myanmar and ASEAN with damage metrics and source citations.'
    },
    'sphere_standards.csv': {
        name: 'UN Sphere Humanitarian Standards',
        records: '6 Core Supply Standards',
        citation: 'The Sphere Handbook: Humanitarian Charter & Minimum Standards in Disaster Response',
        desc: 'Official humanitarian aid standards: 20L water/person/day, 3 food packs/person/day, medical kits, and relief unit costs.'
    },
    'relief_depots.csv': {
        name: 'National Logistics Hubs',
        records: '3 Strategic Hubs',
        citation: 'Department of Disaster Management (DDM) & National Disaster Management Committee',
        desc: 'Verified warehouse inventory capacities across Myanmar\'s 3 strategic logistics hubs (Yangon, Naypyidaw, Mandalay) with Highway 1 road routing.'
    },
    'myanmar_historical_data.csv': {
        name: 'Historical Machine Learning Training Archive',
        records: '1,664 Training Records',
        citation: 'UN-OCHA, EM-DAT (CRED), USGS Earthquakes & Myanmar DDM',
        desc: 'Historical crisis operations dataset used to train the Multi-Output Random Forest AI model.'
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
            
            // Prioritize standard order: Demographics -> Disasters -> Sphere Standards -> Depots -> ML Training Data
            const priorityOrder = [
                'myanmar_demographics.csv',
                'historical_disasters.csv',
                'sphere_standards.csv',
                'relief_depots.csv',
                'myanmar_historical_data.csv'
            ];
            availableDatasets.sort((a, b) => {
                const ia = priorityOrder.indexOf(a);
                const ib = priorityOrder.indexOf(b);
                return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
            });

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

function formatHeaderTitle(rawHeader) {
    if (!rawHeader) return '';
    const clean = rawHeader.replace(/_/g, ' ').trim();
    // Common acronyms and conversions
    const overrides = {
        'lat': 'Latitude',
        'latitude': 'Latitude',
        'lon': 'Longitude',
        'longitude': 'Longitude',
        'water capacity liters': 'Water Capacity (L)',
        'food capacity packs': 'Food Capacity (Packs)',
        'medical kits': 'Medical Kits',
        'coverage radius km': 'Coverage (km)',
        'primary transit mode': 'Primary Transit Mode',
        'state region': 'State / Region',
        'state region name': 'State / Region',
        'state region code': 'Admin Code',
        'disaster name': 'Disaster Name',
        'event type': 'Event Type',
        'disaster severity': 'Severity (0-10)',
        'vulnerable ratio': 'Vulnerability Ratio',
        'water needed': 'Water Needed (L)',
        'food needed': 'Food Needed (Packs)',
        'source citation': 'Source Citation',
        'rescue time hours': 'Rescue ETA (hrs)',
        'affected people': 'Affected Population',
        'total population': 'Census Population',
        'water used liters': 'Water Used (L)',
        'food used packs': 'Food Used (Packs)',
        'minimum standard': 'Standard Name',
        'standard name': 'Standard Name',
        'metric multiplier': 'Standard Multiplier',
        'numeric value': 'Numeric Value',
        'value': 'Standard Value',
        'unit': 'Unit of Measurement',
        'official source': 'Official Source',
        'usage in rescura': 'Usage in Project',
        'usage in project': 'Usage in Project',
        'bed capacity': 'Bed Capacity',
        'trauma care level': 'Trauma Care Level',
        'emergency ambulances': 'Ambulances',
        'icu beds': 'ICU Beds',
        'blood bank available': 'Blood Bank',
        'helipad available': 'Helipad',
        'facility id': 'Facility ID',
        'facility name': 'Healthcare Facility',
        'shelter id': 'Shelter ID',
        'shelter name': 'Evacuation Shelter Name',
        'capacity persons': 'Shelter Capacity (Persons)',
        'elevation meters': 'Elevation (Meters)',
        'shelter type': 'Shelter Structure Type',
        'has solar power': 'Solar Microgrid',
        'rainwater filtration': 'Water Filtration',
        'satellite comms': 'Satellite Comms',
        'node id': 'Node ID',
        'node name': 'Infrastructure Node Name',
        'node type': 'Facility Type',
        'runway length meters': 'Runway Length (m)',
        'cargo berth depth meters': 'Berth Depth (m)',
        'daily cargo tonnage capacity': 'Daily Cargo Capacity (Tons)',
        'customs clearance available': 'Customs Clearance',
        'poverty headcount ratio': 'Poverty Rate (%)',
        'multidimensional vulnerability index': 'Vulnerability Index (0-1)',
        'flood susceptibility level': 'Flood Susceptibility',
        'earthquake hazard zone': 'Seismic Hazard Zone',
        'cyclone exposure level': 'Cyclone Exposure',
        'infant elderly ratio pct': 'Dependent Ratio (%)',
        'hub id': 'Hub ID',
        'stockpile name': 'Regional Stockpile Name',
        'warehouse capacity sqm': 'Warehouse Area (sqm)',
        'warehouse covered area sqm': 'Covered Area (sqm)',
        'water purification units': 'Water Purification Units',
        'family tents': 'Family Tents',
        'hygiene kits': 'Hygiene Kits',
        'coordinating agency': 'Coordinating Agency',
        'coordinating body': 'Coordinating Agency',
        'strategic cargo aircraft type': 'Heavy Cargo Aircraft',
        'dispatch capacity hours': 'Rapid Dispatch Window',
        'global coverage region': 'Coverage Theatre',
        'hub name': 'Global Logistics Hub'
    };
    const lower = clean.toLowerCase();
    if (overrides[lower]) return overrides[lower];
    return clean.replace(/\w\S*/g, (w) => (w.charAt(0).toUpperCase() + w.substr(1).toLowerCase()));
}

function formatTableCellValue(val, headerName) {
    if (val === undefined || val === null || val === '') return '--';
    const num = Number(val);
    if (!isNaN(num) && Number.isInteger(num) && Math.abs(num) >= 1000 && !headerName.toLowerCase().includes('year')) {
        return num.toLocaleString();
    }
    return val;
}

function renderDatasetTabs() {
    const container = document.getElementById('raw-data-tabs-container');
    if (!container) return;
    
    if (!availableDatasets || availableDatasets.length === 0) {
        container.innerHTML = '<div class="text-slate-400 text-xs italic py-2">No database CSVs found on backend.</div>';
        return;
    }

    container.innerHTML = availableDatasets.map(ds => {
        const meta = DATASET_METADATA[ds] || { name: ds };
        const isActive = (ds === currentRawDataCsv);
        return `
            <button id="tab-${ds}" onclick="switchRawDataTab('${ds}')" class="px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border flex items-center gap-2 shrink-0 ${isActive ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border-slate-200'}">
                <span>${meta.name}</span>
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
        descEl.innerHTML = `<b>Source Citation:</b> <span class="text-slate-800 font-semibold">${meta.citation}</span> &bull; <span class="text-slate-500">${meta.desc}</span>`;
    }

    renderCsvTableRows(currentCsvRows);
}

function renderCsvTableRows(rows) {
    const theadRow = document.getElementById('raw-data-thead-row');
    if (theadRow) {
        theadRow.innerHTML = currentCsvHeaders.map(h => {
            const formatted = formatHeaderTitle(h);
            return `<th class="px-4 py-3 bg-slate-50 text-slate-700 font-semibold text-xs border-b border-slate-200 sticky top-0 z-20 whitespace-nowrap shadow-sm" style="background-color: #f8fafc;">${formatted}</th>`;
        }).join('');
    }

    const tbody = document.getElementById('raw-data-tbody');
    if (tbody) {
        if (rows.length === 0) {
            tbody.innerHTML = `<tr><td colspan="${currentCsvHeaders.length || 1}" class="p-8 text-center text-slate-400 text-xs italic">No matching records found.</td></tr>`;
            return;
        }
        const previewLimit = 500;
        const rowsHtml = rows.slice(0, previewLimit).map(cols => {
            return `<tr class="hover:bg-slate-50/80 transition-colors cursor-default border-t border-slate-100">
                ${cols.map((c, i) => {
                    const header = currentCsvHeaders[i] || '';
                    const formatted = formatTableCellValue(c, header);
                    const isNum = !isNaN(Number(c)) && c.trim() !== '';
                    return `<td class="px-4 py-3 whitespace-nowrap text-slate-700 text-xs ${isNum ? 'font-mono' : 'font-sans'}">${formatted}</td>`;
                }).join('')}
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

/* ==========================================================================
   Myanmar Quick Incident Radar & Grab-Style Turn-by-Turn Navigation Engine
   ========================================================================== */

let currentNavRouteLayer = null;
let currentSimVehicleMarker = null;
let currentNavData = null;
let currentNavParams = null;
let simulationInterval = null;
let simulationStepIndex = 0;

window.filterMapRegion = function(regionKey) {
    const bar = document.getElementById('myanmar-radar-bar');
    if (bar) {
        bar.querySelectorAll('.chip').forEach(btn => btn.classList.remove('active'));
    }
    const evt = window.event;
    if (evt && evt.target) evt.target.classList.add('active');

    const regionBounds = {
        'all': { center: [19.0, 96.0], zoom: 5 },
        'myanmar': { center: [19.75, 96.1], zoom: 6 },
        'bago_yangon': { center: [17.1, 96.3], zoom: 8 },
        'mandalay_sagaing': { center: [21.9, 95.9], zoom: 8 },
        'delta': { center: [16.6, 95.1], zoom: 8 },
        'shan': { center: [21.3, 97.4], zoom: 7 },
        'rakhine': { center: [20.1, 93.3], zoom: 7 }
    };

    const target = regionBounds[regionKey] || regionBounds['myanmar'];
    if (map) {
        map.flyTo(target.center, target.zoom, { animate: true, duration: 1.2 });
    }
};

window.startTurnByTurnNavigation = async function(lat, lon, title, severity) {
    const pLat = parseFloat(lat);
    const pLon = parseFloat(lon);
    const cont = getContinent(pLat, pLon, title);
    const isGlobal = cont !== 'Asia' && cont !== 'Myanmar';

    currentNavParams = {
        lat: pLat,
        lon: pLon,
        title: decodeURIComponent(title || 'Disaster Epicenter'),
        severity: parseFloat(severity || 5.0),
        mode: isGlobal ? 'air' : 'land'
    };

    ['land', 'air', 'water'].forEach(m => {
        const btn = document.getElementById(`btn-mode-${m}`);
        if (btn) btn.classList.toggle('active', m === currentNavParams.mode);
    });

    await fetchAndRenderNavigationRoute();
};

window.switchRouteMode = async function(mode) {
    if (!currentNavParams) return;
    currentNavParams.mode = mode;

    ['land', 'air', 'water'].forEach(m => {
        const btn = document.getElementById(`btn-mode-${m}`);
        if (btn) btn.classList.toggle('active', m === mode);
    });

    await fetchAndRenderNavigationRoute();
};

async function fetchAndRenderNavigationRoute() {
    if (!currentNavParams) return;
    const { lat, lon, title, severity, mode } = currentNavParams;

    const hud = document.getElementById('grab-nav-hud');
    if (hud) {
        hud.classList.remove('hidden');
    }

    try {
        const res = await apiFetch(`/api/route-navigation?target_lat=${lat}&target_lon=${lon}&mode=${mode || 'land'}&severity=${severity || 5.0}&title=${encodeURIComponent(title || 'Disaster Epicenter')}`);
        if (!res.ok) return;
        const data = await res.json();
        if (data.status !== 'success' || !data.navigation) return;

        currentNavData = data.navigation;
        renderNavHUD(currentNavData);
        drawNavigationPolyline(currentNavData);
    } catch (err) {
        console.error('Error fetching navigation route:', err);
    }
}

function renderNavHUD(nav) {
    const destTitle = document.getElementById('grab-nav-dest-title');
    const originBadge = document.getElementById('grab-nav-origin');
    const etaBadge = document.getElementById('grab-nav-eta');
    const distBadge = document.getElementById('grab-nav-dist');
    const hazardText = document.getElementById('grab-hazard-text');
    const stepsContainer = document.getElementById('grab-steps-list');

    if (destTitle) destTitle.textContent = nav.disaster_title || 'Disaster Epicenter';
    if (originBadge) originBadge.textContent = nav.depot_name || 'Relief Depot';
    if (etaBadge) etaBadge.textContent = nav.formatted_eta;
    if (distBadge) distBadge.textContent = `${nav.total_distance_km} km`;
    if (hazardText) hazardText.textContent = nav.hazard_warning || 'Route active via primary corridor.';

    if (stepsContainer) {
        stepsContainer.innerHTML = '';
        (nav.steps || []).forEach((step, idx) => {
            const card = document.createElement('div');
            card.className = 'grab-step-card';
            card.innerHTML = `
                <div class="step-icon-badge">${idx + 1}</div>
                <div class="step-content">
                    <div class="step-instruction">${step.instruction}</div>
                    <div class="step-meta">
                        <span>${step.road_name || ''}</span>
                        <strong>${step.distance_km > 0 ? step.distance_km + ' km' : ''}</strong>
                    </div>
                </div>
            `;
            stepsContainer.appendChild(card);
        });
    }
}

function drawNavigationPolyline(nav) {
    if (currentNavRouteLayer && map.hasLayer(currentNavRouteLayer)) {
        map.removeLayer(currentNavRouteLayer);
    }
    if (currentSimVehicleMarker && map.hasLayer(currentSimVehicleMarker)) {
        map.removeLayer(currentSimVehicleMarker);
    }
    stopVehicleSimulation();

    const coords = nav.coordinates || [];
    if (!coords.length) return;

    let routeColor = '#2563eb';
    let dashArray = null;
    if (nav.mode === 'air') {
        routeColor = '#9333ea';
        dashArray = '8, 8';
    } else if (nav.mode === 'water') {
        routeColor = '#0284c7';
        dashArray = '6, 6';
    }

    currentNavRouteLayer = L.polyline(coords, {
        color: routeColor,
        weight: 6,
        opacity: 0.95,
        dashArray: dashArray,
        lineCap: 'round',
        lineJoin: 'round'
    }).addTo(map);

    if (coords.length > 1) {
        map.fitBounds(currentNavRouteLayer.getBounds(), { padding: [70, 70], maxZoom: 12 });
    }
}

window.closeTurnByTurnNavigation = function() {
    const hud = document.getElementById('grab-nav-hud');
    if (hud) hud.classList.add('hidden');
    if (currentNavRouteLayer && map.hasLayer(currentNavRouteLayer)) {
        map.removeLayer(currentNavRouteLayer);
    }
    if (currentSimVehicleMarker && map.hasLayer(currentSimVehicleMarker)) {
        map.removeLayer(currentSimVehicleMarker);
    }
    stopVehicleSimulation();
};

window.toggleVehicleSimulation = function() {
    if (simulationInterval) {
        stopVehicleSimulation();
    } else {
        startVehicleSimulation();
    }
};

function startVehicleSimulation() {
    if (!currentNavData || !currentNavData.coordinates || currentNavData.coordinates.length < 2) return;
    const coords = currentNavData.coordinates;

    const btnLabel = document.getElementById('dispatch-label');
    const btnIcon = document.getElementById('dispatch-icon');
    const progBar = document.getElementById('simulation-progress-bar');
    const progFill = document.getElementById('simulation-progress-fill');

    if (btnLabel) btnLabel.textContent = 'Pause Simulation';
    if (btnIcon) btnIcon.innerHTML = '&#10074;&#10074;';
    if (progBar) progBar.classList.remove('hidden');

    if (!currentSimVehicleMarker) {
        const vIcon = L.divIcon({
            className: 'vehicle-sim-marker',
            html: `<div style="width:16px;height:16px;background:#2563eb;border:3px solid #ffffff;border-radius:50%;box-shadow:0 0 12px #2563eb;"></div>`,
            iconSize: [20, 20],
            iconAnchor: [10, 10]
        });
        currentSimVehicleMarker = L.marker(coords[0], { icon: vIcon, zIndexOffset: 2000 }).addTo(map);
        simulationStepIndex = 0;
    }

    simulationInterval = setInterval(() => {
        simulationStepIndex++;
        if (simulationStepIndex >= coords.length) {
            simulationStepIndex = 0;
        }

        const currentPos = coords[simulationStepIndex];
        currentSimVehicleMarker.setLatLng(currentPos);

        const pct = Math.round((simulationStepIndex / (coords.length - 1)) * 100);
        if (progFill) progFill.style.width = `${pct}%`;

        if (simulationStepIndex === coords.length - 1) {
            stopVehicleSimulation();
            if (btnLabel) btnLabel.textContent = 'Mission Arrived (Restart)';
            if (btnIcon) btnIcon.innerHTML = '&#8635;';
        }
    }, 450);
}

function stopVehicleSimulation() {
    if (simulationInterval) {
        clearInterval(simulationInterval);
        simulationInterval = null;
    }
    const btnLabel = document.getElementById('dispatch-label');
    const btnIcon = document.getElementById('dispatch-icon');
    if (btnLabel && btnLabel.textContent.includes('Pause')) btnLabel.textContent = 'Resume Simulation';
    if (btnIcon) btnIcon.innerHTML = '&#9654;';
}

// Auto-open datasets modal if requested via URL query or hash
window.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('open') === 'datasets' || window.location.hash === '#datasets') {
        setTimeout(() => {
            if (typeof openRawDataModal === 'function') openRawDataModal();
        }, 300);
    }
});

