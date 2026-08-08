// Supabase Client Setup Constants
const SUPABASE_URL = 'https://jgbtudbialgitdxgkngj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnYnR1ZGJpYWxnaXRkeGdrbmdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwNjgzODksImV4cCI6MjEwMTY0NDM4OX0.1Wc1P4seagQsTKcOKN9nhDDiakBIAnQo7FlHhJBUO8A';
const supabaseClient = (window.supabase && SUPABASE_URL !== 'YOUR_URL_HERE' && SUPABASE_ANON_KEY !== 'YOUR_ANON_KEY_HERE')
    ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
    : null;

// Initialize Leaflet Map centered on Bago, Myanmar
const BAGO_COORDS = [17.3333, 96.4833];
const ZOOM_LEVEL = 13;

const map = L.map('map').setView(BAGO_COORDS, ZOOM_LEVEL);

// Sleek Dark Mode Base Layer using CartoDB Dark Matter
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    maxZoom: 19,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>'
}).addTo(map);

let currentTab = 'gdacs';
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
    return (lat >= -11.0 && lat <= 28.5 && lon >= 90.0 && lon <= 141.0);
}

const API_HOSTS = ['https://rescura-sync.onrender.com', 'http://127.0.0.1:8000', 'http://localhost:8000'];

/**
 * Fast, resilient API fetch helper with AbortController timeout (max 3.5s)
 * and automatic host fallback (127.0.0.1 -> localhost).
 */
async function apiFetch(path, options = {}) {
    const timeoutMs = options.timeout || 3500;
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
}

/**
 * Update top stats counter widgets
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

/**
 * Render cards in the sidebar based on active tab with click-to-focus interactivity
 */
function renderSidebarCards() {
    const container = document.getElementById('alerts-container');
    container.innerHTML = '';

    if (currentTab === 'gdacs') {
        if (!gdacsAlertsData.length) {
            container.innerHTML = '<div style="color: #94a3b8; text-align: center; padding: 20px;">No GDACS alerts loaded.</div>';
            return;
        }

        gdacsAlertsData.forEach(alert => {
            const lat = alert.latitude || alert.lat;
            const lon = alert.longitude || alert.lon;
            const card = document.createElement('div');
            card.className = 'alert-card';
            card.onclick = () => {
                focusMap(lat, lon);
                selectAlert(lat, lon, alert.title, alert.severity);
            };
            card.innerHTML = `
                <div class="card-header">
                    <span class="card-type">${alert.disaster_type || 'EMERGENCY'}</span>
                    <span class="card-severity">Severity: ${alert.severity}/10</span>
                </div>
                <div class="card-title">${alert.title}</div>
                <div class="card-meta">Coords: ${lat.toFixed(4)}, ${lon.toFixed(4)}</div>
            `;
            container.appendChild(card);
        });
    } else {
        if (!sosAlertsData.length) {
            container.innerHTML = '<div style="color: #94a3b8; text-align: center; padding: 20px;">No Mobile SOS reports recorded.</div>';
            return;
        }

        sosAlertsData.forEach((alert, index) => {
            const { lat, lon } = parseSOSCoords(alert, index);

            const urgentNeed = alert.urgent_need || alert.urgent_need_category || 'Water';
            const affectedCount = alert.affected_people || alert.affected_count || 10;
            const status = alert.status || 'pending';
            const statusBadgeColor = status === 'resolved' ? '#22c55e' : (status === 'dispatched' ? '#f97316' : '#ef4444');

            const card = document.createElement('div');
            card.className = 'alert-card';
            card.onclick = () => focusMap(lat, lon);
            card.innerHTML = `
                <div class="card-header">
                    <span class="card-type" style="background: rgba(239, 68, 68, 0.3); color: #fca5a5;">SOS ALERT</span>
                    <span class="card-severity" style="color: ${statusBadgeColor}; text-transform: uppercase;">${status}</span>
                </div>
                <div class="card-title">${alert.location || 'Bago Civilian Sector'}</div>
                <div class="card-meta">Need: <b>${urgentNeed}</b> &bull; Affected: <b>${affectedCount}</b> people</div>
            `;
            container.appendChild(card);
        });
    }

    updateStatsCounters();
}

/**
 * Handle user click on a disaster alert card from sidebar
 */
function selectAlert(lat, lon, title, severity) {
    fetchReliefData(lat, lon, severity, title);
}

/**
 * Asynchronously fetches relief supply predictions and GIS evacuation routing data
 */
async function fetchReliefData(lat = 17.3333, lon = 96.4833, severity = 7.5, title = 'Emergency Zone') {
    try {
        const url = `http://127.0.0.1:8000/api/predict-relief?lat=${lat}&lon=${lon}&population=50000&vulnerability=0.20&severity=${severity}`;
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        const aiPrediction = data.ai_prediction;
        const gisAnalysis = data.gis_analysis;
        const nearestDepot = data.nearest_depot || (gisAnalysis ? gisAnalysis.depot_info : null);

        const waterLiters = aiPrediction.water_liters;
        const foodPacks = aiPrediction.food_packs;
        const totalRescueTime = aiPrediction.estimated_rescue_time || 4.5;
        const travelHours = aiPrediction.dispatch_travel_hours || 1.0;
        const onSiteHours = aiPrediction.on_site_operation_hours || 3.5;

        const depotName = nearestDepot ? nearestDepot.name : 'Nearest Supply Hub';
        const depotDist = nearestDepot ? nearestDepot.distance_km : 10.0;

        const popupContent = `
            <div style="font-family: Inter, sans-serif; min-width: 220px;">
                <h4 style="margin: 0 0 6px 0; color: #ef4444; font-size: 15px; font-weight: 700;">⚠️ ${title}</h4>
                <div style="font-size: 12px; color: #22c55e; font-weight: 700; margin-bottom: 6px;">
                    🛡️ Assigned Depot: ${depotName} (${depotDist} km)
                </div>
                <div style="font-size: 12px; color: #e2e8f0; margin-bottom: 3px;"><b>Water Needed:</b> <span style="color: #38bdf8; font-weight: 700;">${waterLiters.toLocaleString()} L</span></div>
                <div style="font-size: 12px; color: #e2e8f0; margin-bottom: 3px;"><b>Food Needed:</b> <span style="color: #fbbf24; font-weight: 700;">${foodPacks.toLocaleString()} packs</span></div>
                <div style="font-size: 12px; color: #e2e8f0; margin-bottom: 4px;">
                    <b>⏱️ Total Est. Rescue Time:</b> <span style="color: #a855f7; font-weight: 700;">${totalRescueTime} hrs</span>
                    <div style="font-size: 10px; color: #94a3b8;">(Truck Travel: ${travelHours}h + On-site Ops: ${onSiteHours}h)</div>
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
        if (optimalRouteCoords && optimalRouteCoords.length > 0) {
            activePolyline = L.polyline(optimalRouteCoords, {
                color: '#ef4444',
                weight: 5,
                opacity: 0.85
            }).addTo(map);

            map.fitBounds(activePolyline.getBounds(), { padding: [40, 40] });
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

        // Construct concurrent fetch promises for all SOS alerts
        const sosFetchPromises = sosAlertsData.map((alert, index) => {
            const { lat, lon } = parseSOSCoords(alert, index);
            if (isWithinASEAN(lat, lon)) {
                return apiFetch(`/api/nearest-depot?lat=${lat}&lon=${lon}`)
                    .then(res => res && res.ok ? res.json() : null)
                    .catch(() => null);
            }
            return Promise.resolve(null);
        });

        // Execute all network requests concurrently using Promise.all()
        const sosDepotResults = await Promise.all(sosFetchPromises);

        for (let index = 0; index < sosAlertsData.length; index++) {
            const alert = sosAlertsData[index];
            const { lat, lon } = parseSOSCoords(alert, index);
            const urgentNeed = alert.urgent_need || alert.urgent_need_category || 'Water';
            const affectedPeople = alert.affected_people || alert.affected_count || 10;
            const status = alert.status || 'pending';
            const estRescueTime = (1.2 + (affectedPeople / 250.0) + 1.0).toFixed(1);

            const pulseIcon = L.divIcon({
                className: 'sos-div-wrapper',
                html: `<div class="sos-pulse-marker ${status}"></div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            });

            const marker = L.marker([lat, lon], { icon: pulseIcon }).addTo(map);
            const alertId = alert.id || index;

            let depotInfoText = 'Calculating Nearest Depot...';
            const depotData = sosDepotResults[index];

            if (depotData && depotData.status === 'success' && depotData.nearest_depot) {
                const depot = depotData.nearest_depot;
                depotInfoText = `🛡️ <b>Nearest Depot:</b> ${depot.name} (${depot.distance_km} km)`;

                // Draw Route Line from Nearest Depot to SOS Alert
                const sosRouteLine = L.polyline([[depot.latitude, depot.longitude], [lat, lon]], {
                    color: '#10b981',
                    weight: 4,
                    opacity: 0.85,
                    dashArray: '8, 8'
                }).addTo(map);

                routePolylines.push(sosRouteLine);
            }

            marker.bindPopup(`
                <div style="font-family: Inter, sans-serif; min-width: 190px;">
                    <div style="font-size: 11px; font-weight: 800; color: ${status === 'resolved' ? '#22c55e' : (status === 'dispatched' ? '#f97316' : '#ef4444')}; text-transform: uppercase; margin-bottom: 4px;">
                        🚨 CIVILIAN SOS &bull; ${status}
                    </div>
                    <div style="font-size: 14px; font-weight: 700; color: #f8fafc; margin-bottom: 6px;">
                        ${alert.location || 'Bago Sector'}
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

            // Automatically frame the camera to fit all 3 depots across Myanmar
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
            return;
        }

        const dashData = await dashRes.json();
        const events = dashData.dashboard_data || [];
        gdacsAlertsData = events;

        mapMarkers.forEach(m => map.removeLayer(m));
        mapMarkers = [];
        routePolylines.forEach(p => map.removeLayer(p));
        routePolylines = [];

        // Construct concurrent fetch promises for all active disaster events
        const fetchPromises = events.map(event => {
            const lat = event.latitude;
            const lon = event.longitude;
            if (isWithinASEAN(lat, lon)) {
                return apiFetch(`/api/nearest-depot?lat=${lat}&lon=${lon}`)
                    .then(res => res && res.ok ? res.json() : null)
                    .catch(() => null);
            }
            return Promise.resolve(null);
        });

        // Execute all network requests concurrently using Promise.all()
        const depotResults = await Promise.all(fetchPromises);

        for (let idx = 0; idx < events.length; idx++) {
            const event = events[idx];
            const lat = event.latitude;
            const lon = event.longitude;
            const title = event.title;
            const latestPred = event.latest_prediction;
            const estRescueTime = event.estimated_rescue_time || 4.5;

            let waterText = 'Pending Sync';
            let foodText = 'Pending Sync';
            if (latestPred) {
                waterText = `${latestPred.water_liters.toLocaleString()} L`;
                foodText = `${latestPred.food_packs.toLocaleString()} packs`;
            }

            let depotNameText = '';
            let distanceKm = 0;

            const depotData = depotResults[idx];
            if (depotData && depotData.status === 'success' && depotData.nearest_depot) {
                const depot = depotData.nearest_depot;
                depotNameText = depot.name;
                distanceKm = depot.distance_km;

                // Active Supply Route Polyline starting at nearest depot and ending at disaster location
                const routeLine = L.polyline([[depot.latitude, depot.longitude], [lat, lon]], {
                    color: '#10b981',
                    weight: 4,
                    opacity: 0.85,
                    dashArray: '10, 10'
                }).addTo(map);

                routePolylines.push(routeLine);
            }

            const depotBadge = depotNameText ? `<div style="font-size: 12px; color: #22c55e; font-weight: 700; margin-bottom: 4px;">🛡️ Assigned Depot: ${depotNameText} (${distanceKm} km)</div>` : '';

            const popupContent = `
                <div style="font-family: Inter, sans-serif; min-width: 210px;">
                    <h4 style="margin: 0 0 6px 0; color: #ef4444; font-size: 14px; font-weight: 700;">⚠️ ${title}</h4>
                    ${depotBadge}
                    <div style="font-size: 12px; color: #cbd5e1; margin-bottom: 3px;"><b>Water Needed:</b> <span style="color: #38bdf8; font-weight: 700;">${waterText}</span></div>
                    <div style="font-size: 12px; color: #cbd5e1; margin-bottom: 3px;"><b>Food Needed:</b> <span style="color: #fbbf24; font-weight: 700;">${foodText}</span></div>
                    <div style="font-size: 12px; color: #cbd5e1; margin-bottom: 4px;"><b>⏱️ AI Est. Rescue Time:</b> <span style="color: #a855f7; font-weight: 700;">${estRescueTime} hours</span></div>
                    <div style="font-size: 11px; color: #94a3b8; margin-top: 4px;">Severity Index: ${event.severity}/10</div>
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

            if (idx === 0) {
                marker.openPopup();
            }

            mapMarkers.push(marker);
        }

        renderSidebarCards();
        await loadSOSAlerts();
        initRealtimeListener();
        initSSEStream();

    } catch (error) {
        console.error('Error in ultra-fast dashboard initialization:', error);
        await loadSOSAlerts();
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
        // Trigger model training and live GDACS alert ingestion concurrently using apiFetch
        await Promise.all([
            apiFetch('/api/train-rescue-ai', { method: 'POST', timeout: 3500 }),
            apiFetch('/api/live-alerts', { timeout: 3500 })
        ]);

        // Immediately update dashboard map, statistics, and sidebar cards
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
        let streamUrl = 'https://rescura-sync.onrender.com/api/stream-disasters';
        try {
            eventSourceClient = new EventSource(streamUrl);
        } catch (e) {
            eventSourceClient = new EventSource('http://127.0.0.1:8000/api/stream-disasters');
        }

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

    // 1. Only display modal popup if the disaster is within Myanmar & ASEAN region
    if (!isWithinASEAN(payload.latitude, payload.longitude)) {
        console.log('Skipping emergency popup modal for non-ASEAN event:', payload.title);
        return;
    }

    // 2. Do not re-display popup if user has already acknowledged or closed this event
    const processedIds = getProcessedEmergencyIds();
    if (payload.id && processedIds.includes(payload.id)) {
        return;
    }

    currentEmergencyPayload = payload;

    const modal = document.getElementById('emergency-modal');
    const elTitle = document.getElementById('modal-title');
    const elSev = document.getElementById('modal-severity');
    const elPop = document.getElementById('modal-population');
    const elWater = document.getElementById('modal-water');
    const elFood = document.getElementById('modal-food');
    const elDepot = document.getElementById('modal-depot');

    if (modal) {
        if (elTitle) elTitle.innerText = payload.title || 'Disaster Event';
        if (elSev) elSev.innerText = `${payload.severity || 5.0} / 10`;
        if (elPop) elPop.innerText = `${(payload.affected_population || 0).toLocaleString()} People`;
        if (elWater) elWater.innerText = `${(payload.total_water_liters || 0).toLocaleString()} L`;
        if (elFood) elFood.innerText = `${(payload.total_food_packs || 0).toLocaleString()} Packs`;
        
        if (elDepot) {
            const depotName = payload.nearest_depot ? payload.nearest_depot.name : 'Nearest Supply Depot';
            const depotDist = payload.nearest_depot ? payload.nearest_depot.distance_km : 0;
            elDepot.innerText = `${depotName} (${depotDist} km)`;
        }

        modal.classList.remove('hidden');

        // Automatically pan map to disaster coordinates
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

    // Pan map to location
    map.setView([lat, lon], 12);

    // Draw dynamic green dashed route line from nearest depot to disaster location ONLY if within ASEAN region
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

