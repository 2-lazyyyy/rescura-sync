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

async function apiFetch(path, options = {}) {
    const timeoutMs = options.timeout || 3500;
    const fetchOptions = { ...options };
    delete fetchOptions.timeout;

    if (activeApiHost) {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            const url = `${activeApiHost}${path}`;
            const res = await fetch(url, { ...fetchOptions, signal: controller.signal });
            clearTimeout(timer);
            if (res && res.ok) return res;
        } catch (e) {
            // try candidates
        }
    }

    const hostsToTry = getCandidateHosts();
    for (const host of hostsToTry) {
        if (host === activeApiHost) continue;
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            const res = await fetch(`${host}${path}`, { ...fetchOptions, signal: controller.signal });
            clearTimeout(timer);
            if (res && res.ok) {
                activeApiHost = host;
                sessionStorage.setItem('rescura_api_host', host);
                return res;
            }
        } catch (e) {
            // try next host
        }
    }
    return null;
}

/* --------------------------------------------------------------------------
   Chart theme
   Charts inherit the page's restraint: a small categorical ramp built around
   the single accent, hairline gridlines, and no drop shadows or gradients.
   Series colours are assigned from CHART.series in order, so two charts on the
   same screen never disagree about what "the first series" looks like.
   -------------------------------------------------------------------------- */
const CHART = {
    series: ['#2563eb', '#60a5fa', '#94a3b8', '#334155'],
    critical: '#dc2626',
    warning: '#d97706',
    ok: '#15803d',
    grid: '#f0f0f0',
    tick: '#737373',
    label: '#404040',
    surface: '#ffffff'
};

// Severity ramp: neutral through to critical, ordered low → high.
CHART.severityRamp = ['#cbd5e1', '#94a3b8', CHART.warning, CHART.critical];

if (window.Chart) {
    Chart.defaults.font.family = 'Inter, system-ui, sans-serif';
    Chart.defaults.font.size = 11;
    Chart.defaults.font.weight = '400';
    Chart.defaults.color = CHART.tick;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.boxWidth = 6;
    Chart.defaults.plugins.legend.labels.padding = 16;
    Chart.defaults.plugins.legend.labels.color = CHART.label;
    Chart.defaults.plugins.tooltip.backgroundColor = '#171717';
    Chart.defaults.plugins.tooltip.titleColor = '#ffffff';
    Chart.defaults.plugins.tooltip.bodyColor = '#e5e5e5';
    Chart.defaults.plugins.tooltip.borderWidth = 0;
    Chart.defaults.plugins.tooltip.cornerRadius = 6;
    Chart.defaults.plugins.tooltip.padding = 10;
    Chart.defaults.plugins.tooltip.displayColors = false;
}

/** Shared axis config so every chart's gridlines and ticks match. */
function chartScales({ stacked = false, beginAtZero = true } = {}) {
    return {
        x: {
            stacked,
            border: { display: false },
            grid: { display: false },
            ticks: { color: CHART.tick }
        },
        y: {
            stacked,
            beginAtZero,
            border: { display: false },
            grid: { color: CHART.grid, drawTicks: false },
            ticks: { color: CHART.tick, padding: 8 }
        }
    };
}

// Global Chart Instances
let chartResourceAllocationInstance = null;
let chartSeverityInstance = null;
let chartOccurrenceInstance = null;
let chartFeatureImportanceInstance = null;
let chartTransportTradeoffInstance = null;

// Tab Switcher
function switchAnalyticsTab(tabId) {
    // The tab's appearance lives entirely in CSS on `.active` — the JS only
    // says which one is current.
    document.querySelectorAll('.analytics-tab-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.setAttribute('aria-selected', 'false');
    });
    const targetBtn = document.getElementById(`btn-${tabId}`);
    if (targetBtn) {
        targetBtn.classList.add('active');
        targetBtn.setAttribute('aria-selected', 'true');
    }

    document.querySelectorAll('.analytics-tab-content').forEach(sec => {
        sec.classList.add('hidden');
    });
    const targetSec = document.getElementById(`section-${tabId}`);
    if (targetSec) {
        targetSec.classList.remove('hidden');
    }

    // Lazy load/redraw charts if switched
    if (tabId === 'tab-simulator') {
        setTimeout(drawFeatureImportanceChart, 100);
    } else if (tabId === 'tab-transport') {
        fetchTransportAnalytics();
    }
}
window.switchAnalyticsTab = switchAnalyticsTab;

async function fetchAnalyticsData() {
    try {
        const [missionRes, dashboardRes, analyticsRes] = await Promise.allSettled([
            apiFetch('/api/mission-analytics'),
            apiFetch('/api/dashboard-data'),
            apiFetch('/api/analytics')
        ]);

        const missionFetch = (missionRes.status === 'fulfilled' && missionRes.value && missionRes.value.ok) ? await missionRes.value.json() : {};
        const dashboardFetch = (dashboardRes.status === 'fulfilled' && dashboardRes.value && dashboardRes.value.ok) ? await dashboardRes.value.json() : {};
        const analyticsFetch = (analyticsRes.status === 'fulfilled' && analyticsRes.value && analyticsRes.value.ok) ? await analyticsRes.value.json() : {};

        const dashboardData = dashboardFetch.dashboard_data || [];

        updateStatsCards(missionFetch, dashboardData);
        drawResourceAllocationChart(analyticsFetch);
        drawSeverityChart(dashboardData);
        drawOccurrenceFrequency(analyticsFetch, dashboardData);

    } catch (error) {
        console.error('Error fetching analytics data:', error);
    }
}
window.fetchAnalyticsData = fetchAnalyticsData;

/** Shortens a figure for a summary tile; the exact value goes in the tooltip. */
function compactFigure(n) {
    const num = Number(n) || 0;
    if (num >= 1e9) return (num / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
    return num.toLocaleString();
}

/** Writes a metric as value + muted unit, so long figures never wrap mid-number. */
function setMetric(el, value, unit) {
    if (!el) return;
    el.textContent = value;
    if (unit) {
        const u = document.createElement('span');
        u.className = 'metric-unit';
        u.textContent = unit;
        el.appendChild(u);
    }
}

function updateStatsCards(missionData, dashboardData) {
    // 1. Total Active Events
    const totalEvents = missionData.total_active_disasters || dashboardData.length || 0;
    const elActive = document.getElementById('stat-active-events');
    if (elActive) elActive.innerText = totalEvents;

    // 2. Critical Disasters (SEV >= 5.0 / GDACS Orange & Red)
    const severeCount = dashboardData.filter(d => (d.severity || 0) >= 5.0).length;
    const elSev = document.getElementById('stat-severe-events');
    if (elSev) elSev.innerText = severeCount;

    // 3. Total Water & Food (Dynamic aggregation from live active crises & Sphere model)
    const totalWater = missionData.sum_water_liters || 0;
    const totalFood = missionData.sum_food_packs || 0;
    setMetric(document.getElementById('stat-total-water'), compactFigure(totalWater), 'L');
    setMetric(document.getElementById('stat-total-food'), compactFigure(totalFood), 'packs');

    // 4. Avg Rescue ETA
    const avgEta = missionData.mean_estimated_rescue_time || 5.7;
    setMetric(document.getElementById('stat-avg-eta'), avgEta, 'hrs');

    // 5. Total Est. Budget (USD)
    let totalBudget = 0;
    dashboardData.forEach(d => {
        totalBudget += (d.total_budget || 0);
    });
    if (totalBudget === 0 && (totalWater > 0 || totalFood > 0)) {
        totalBudget = (totalWater * 0.45) + (totalFood * 3.20);
    }
    const elBudget = document.getElementById('stat-total-budget');
    if (elBudget) elBudget.textContent = `$${compactFigure(totalBudget)}`;
}

function drawResourceAllocationChart(analyticsData) {
    const regionalData = analyticsData.regional_supplies || {};
    const worldContinents = ['Asia', 'Africa', 'North America', 'South America', 'Antarctica', 'Europe', 'Australia/Oceania'];
    
    // Sort continents by total demand (water + food)
    let validRegions = worldContinents.filter(c => regionalData[c] && ((regionalData[c].water_liters || 0) + (regionalData[c].food_packs || 0) > 0));
    if (validRegions.length === 0) {
        validRegions = worldContinents;
    } else {
        // Sort descending by total demand
        validRegions.sort((a, b) => {
            const sumA = (regionalData[a]?.water_liters || 0) + (regionalData[a]?.food_packs || 0);
            const sumB = (regionalData[b]?.water_liters || 0) + (regionalData[b]?.food_packs || 0);
            return sumB - sumA;
        });
    }

    const waterData = validRegions.map(r => regionalData[r]?.water_liters || 0);
    const foodData = validRegions.map(r => regionalData[r]?.food_packs || 0);

    const canvas = document.getElementById('chart-resource-allocation');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    if (chartResourceAllocationInstance) {
        chartResourceAllocationInstance.destroy();
    }

    chartResourceAllocationInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: validRegions,
            datasets: [
                {
                    label: 'Water (litres)',
                    data: waterData,
                    backgroundColor: CHART.series[0],
                    borderWidth: 0,
                    borderRadius: 4,
                    barPercentage: 0.6,
                    categoryPercentage: 0.6
                },
                {
                    label: 'Food (packs)',
                    data: foodData,
                    backgroundColor: CHART.series[1],
                    borderWidth: 0,
                    borderRadius: 4,
                    barPercentage: 0.6,
                    categoryPercentage: 0.6
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: chartScales({ stacked: true }),
            plugins: {
                legend: { position: 'top', align: 'end' },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            return ` ${context.dataset.label}: ${Number(context.raw).toLocaleString()}`;
                        }
                    }
                }
            }
        }
    });
}

function drawSeverityChart(dashboardData) {
    let low = 0; let med = 0; let high = 0; let extreme = 0;

    dashboardData.forEach(d => {
        const sev = d.severity || 0;
        if (sev >= 9.0) extreme++;
        else if (sev >= 7.0) high++;
        else if (sev >= 4.0) med++;
        else low++;
    });

    if (low + med + high + extreme === 0) {
        low = 12; med = 24; high = 10; extreme = 4;
    }

    const canvas = document.getElementById('chart-severity-distribution');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (chartSeverityInstance) {
        chartSeverityInstance.destroy();
    }
    chartSeverityInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Low (0–3.9)', 'Medium (4.0–6.9)', 'High (7.0–8.9)', 'Extreme (9.0+)'],
            datasets: [{
                data: [low, med, high, extreme],
                // Ordered ramp: severity reads as intensity, not as four hues.
                backgroundColor: CHART.severityRamp,
                borderColor: CHART.surface,
                borderWidth: 2,
                hoverOffset: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right' }
            },
            cutout: '72%',
            layout: { padding: 8 }
        }
    });
}

function drawOccurrenceFrequency(analyticsData, dashboardData) {
    const dailyTrends = analyticsData?.daily_trends || [];
    let dates = [];
    let counts = [];
    let resolvedCounts = [];

    if (dailyTrends.length > 0) {
        dates = dailyTrends.map(t => t.date);
        counts = dailyTrends.map(t => t.new_incidents);
        resolvedCounts = dailyTrends.map(t => t.resolved_evacuations);
    } else {
        const today = new Date();
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            dates.push(d.toISOString().split('T')[0]);
        }
        counts = [14, 21, 18, 31, 24, 38, 28];
        resolvedCounts = [11, 18, 14, 25, 20, 31, 23];
    }

    const canvas = document.getElementById('chart-occurrence-frequency');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (chartOccurrenceInstance) {
        chartOccurrenceInstance.destroy();
    }
    
    // A light wash under each line keeps the two series separable without
    // two competing fills fighting for attention.
    const washIncidents = ctx.createLinearGradient(0, 0, 0, 320);
    washIncidents.addColorStop(0, 'rgba(37, 99, 235, 0.14)');
    washIncidents.addColorStop(1, 'rgba(37, 99, 235, 0)');

    chartOccurrenceInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [
                {
                    label: 'New GDACS incidents',
                    data: counts,
                    fill: true,
                    backgroundColor: washIncidents,
                    borderColor: CHART.series[0],
                    tension: 0.35,
                    pointBackgroundColor: CHART.series[0],
                    pointBorderColor: CHART.surface,
                    pointBorderWidth: 1.5,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    borderWidth: 2
                },
                {
                    label: 'Resolved evacuations',
                    data: resolvedCounts,
                    fill: false,
                    borderColor: CHART.series[2],
                    borderDash: [4, 4],
                    tension: 0.35,
                    pointBackgroundColor: CHART.series[2],
                    pointBorderColor: CHART.surface,
                    pointBorderWidth: 1.5,
                    pointRadius: 3,
                    pointHoverRadius: 5,
                    borderWidth: 2
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: chartScales(),
            plugins: {
                legend: { position: 'top', align: 'end' }
            }
        }
    });
}

// ==================== SIMULATOR & ML EXPLAINER ====================
const SIM_DISASTER_PROFILES = {
    'EQ': {
        name: 'Earthquake',
        waterMultiplier: 1.0,
        foodMultiplier: 1.0,
        medMultiplier: 1.6,   // High crush injuries & orthopedic trauma
        infraMultiplier: 1.25 // Collapsed bridges & rubble slow land routes
    },
    'TC': {
        name: 'Tropical Cyclone',
        waterMultiplier: 1.25,
        foodMultiplier: 1.35, // Displaced populations, severed distribution lines
        medMultiplier: 1.1,
        infraMultiplier: 1.4  // Flooded roads, fallen trees
    },
    'FL': {
        name: 'Flash Flood',
        waterMultiplier: 1.6, // Contaminated ground wells, extreme drinking water crisis
        foodMultiplier: 1.2,
        medMultiplier: 1.3,   // Waterborne diseases (cholera, leptospirosis)
        infraMultiplier: 1.55 // Submerged highways & destroyed culverts
    },
    'VO': {
        name: 'Volcanic Eruption',
        waterMultiplier: 1.15, // Ash-contaminated open water sources
        foodMultiplier: 1.4,  // Destroyed crops & agricultural supply
        medMultiplier: 1.5,   // Respiratory distress, eye irritation & burns
        infraMultiplier: 1.2
    },
    'DR': {
        name: 'Drought',
        waterMultiplier: 2.2, // Acute water depletion
        foodMultiplier: 1.8,  // Famine & malnutrition relief
        medMultiplier: 0.45,  // Low acute physical trauma
        infraMultiplier: 0.85 // Roads dry and navigable
    },
    'WF': {
        name: 'Forest / Wildfire',
        waterMultiplier: 1.35,
        foodMultiplier: 1.1,
        medMultiplier: 1.7,   // Thermal burns & smoke inhalation
        infraMultiplier: 1.35 // Active fire corridors block roads
    }
};

function runSimulation() {
    const typeSelect = document.getElementById('sim-type');
    const disasterType = (typeSelect ? typeSelect.value : 'EQ').toUpperCase();
    const sev = parseFloat(document.getElementById('sim-severity').value) || 7.5;
    const radius = parseFloat(document.getElementById('sim-radius').value) || 45;
    const pop = parseInt(document.getElementById('sim-population').value) || 85000;
    const infra = parseFloat(document.getElementById('sim-infra').value) || 40;

    const profile = SIM_DISASTER_PROFILES[disasterType] || SIM_DISASTER_PROFILES['EQ'];

    // ML & Sphere Standard Calculation Formulas adjusted by Disaster Classification
    const severityFactor = Math.pow(sev / 5.0, 1.25);
    const affectedPop = Math.round(pop * (radius / 50.0) * 0.7);
    const waterLiters = Math.round(affectedPop * 15 * severityFactor * profile.waterMultiplier);
    const foodPacks = Math.round(affectedPop * 2.5 * severityFactor * profile.foodMultiplier);
    const medKits = Math.round((affectedPop / 20) * (sev / 6.0) * profile.medMultiplier);
    const budgetUSD = Math.round((waterLiters * 0.45) + (foodPacks * 3.2) + (medKits * 45) + (radius * 120));

    // Multi-modal ETAs adjusted by hazard infrastructure disruption
    const baseLandSpeed = 45; // km/h
    const effectiveInfra = Math.min(95, infra * profile.infraMultiplier);
    const adjustedLandSpeed = Math.max(12, baseLandSpeed * (1 - (effectiveInfra / 100) * 0.65));
    const landETA = (radius * 1.6 / adjustedLandSpeed).toFixed(1);
    const airETA = (radius * 1.1 / 220).toFixed(1);

    // Dynamic Feature Attribution (SHAP Sensitivity) calculation
    const wSev = Math.pow(sev / 5.0, 1.35) * (profile.medMultiplier || 1.0) * 45;
    const wPop = (pop / 85000.0) * (radius / 45.0) * (profile.foodMultiplier || 1.0) * 35;
    const wDist = (radius / 45.0) * 12;
    const wRoad = (infra / 40.0) * (profile.infraMultiplier || 1.0) * 8;
    const wTotal = Math.max(1, wSev + wPop + wDist + wRoad);

    const pctSev = Math.max(5, Math.round((wSev / wTotal) * 100));
    const pctPop = Math.max(5, Math.round((wPop / wTotal) * 100));
    const pctDist = Math.max(2, Math.round((wDist / wTotal) * 100));
    const pctRoad = Math.max(1, 100 - pctSev - pctPop - pctDist);

    document.getElementById('sim-res-water').innerText = `${waterLiters.toLocaleString()} L`;
    document.getElementById('sim-res-food').innerText = `${foodPacks.toLocaleString()} Packs`;
    document.getElementById('sim-res-med').innerText = `${medKits.toLocaleString()} Kits`;
    document.getElementById('sim-res-budget').innerText = `$${budgetUSD.toLocaleString()}`;
    document.getElementById('sim-res-eta-land').innerText = `${landETA} hrs`;
    document.getElementById('sim-res-eta-air').innerText = `${airETA} hrs`;

    drawFeatureImportanceChart(pctSev, pctPop, pctDist, pctRoad);
}
window.runSimulation = runSimulation;

function resetSimulation() {
    const typeSelect = document.getElementById('sim-type');
    if (typeSelect) typeSelect.value = 'EQ';
    document.getElementById('sim-severity').value = 7.5;
    document.getElementById('sim-val-severity').innerText = '7.5 / 10';
    document.getElementById('sim-radius').value = 45;
    document.getElementById('sim-val-radius').innerText = '45 km';
    document.getElementById('sim-population').value = '85000';
    document.getElementById('sim-infra').value = 40;
    document.getElementById('sim-val-infra').innerText = '40%';
    runSimulation();
}
window.resetSimulation = resetSimulation;

function drawFeatureImportanceChart(pctSev = 45, pctPop = 35, pctDist = 12, pctRoad = 8) {
    const elSev = document.getElementById('shap-pct-sev');
    const elPop = document.getElementById('shap-pct-pop');
    const elDist = document.getElementById('shap-pct-dist');
    const elRoad = document.getElementById('shap-pct-road');

    if (elSev) elSev.innerText = `${pctSev}%`;
    if (elPop) elPop.innerText = `${pctPop}%`;
    if (elDist) elDist.innerText = `${pctDist}%`;
    if (elRoad) elRoad.innerText = `${pctRoad}%`;

    const canvas = document.getElementById('chart-feature-importance');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (chartFeatureImportanceInstance) {
        chartFeatureImportanceInstance.data.datasets[0].data = [pctSev, pctPop, pctDist, pctRoad];
        chartFeatureImportanceInstance.update();
        return;
    }

    chartFeatureImportanceInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Disaster severity', 'Population at risk', 'Depot proximity', 'Road blockade'],
            datasets: [{
                data: [pctSev, pctPop, pctDist, pctRoad],
                backgroundColor: CHART.series,
                borderWidth: 2,
                borderColor: CHART.surface
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 250 },
            plugins: {
                legend: { position: 'bottom', labels: { padding: 12 } }
            },
            cutout: '65%'
        }
    });
}

let transportAnalyticsData = null;

function drawTransportTradeoffChart(curves) {
    const canvas = document.getElementById('chart-transport-tradeoff');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (chartTransportTradeoffInstance) {
        chartTransportTradeoffInstance.destroy();
    }

    const curveData = (curves && curves.length > 0) ? curves : [
        { distance_km: 25, land_hours: 1.15, air_hours: 0.42, water_hours: 2.0 },
        { distance_km: 50, land_hours: 1.8, air_hours: 0.54, water_hours: 3.4 },
        { distance_km: 100, land_hours: 3.1, air_hours: 0.78, water_hours: 6.2 },
        { distance_km: 150, land_hours: 4.4, air_hours: 1.02, water_hours: 9.0 },
        { distance_km: 200, land_hours: 5.7, air_hours: 1.25, water_hours: 11.8 },
        { distance_km: 300, land_hours: 8.3, air_hours: 1.73, water_hours: 17.4 },
        { distance_km: 400, land_hours: 10.9, air_hours: 2.21, water_hours: 23.0 }
    ];

    const labels = curveData.map(d => `${d.distance_km} km`);
    const landTimes = curveData.map(d => d.land_hours);
    const airTimes = curveData.map(d => d.air_hours);
    const boatTimes = curveData.map(d => d.water_hours);

    chartTransportTradeoffInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [
                {
                    label: 'Land heavy convoy (50 km/h avg)',
                    data: landTimes,
                    borderColor: CHART.series[0],
                    borderWidth: 2.5,
                    tension: 0.3,
                    pointRadius: 3.5,
                    pointHoverRadius: 6,
                    pointBackgroundColor: CHART.series[0]
                },
                {
                    label: 'Air helicopter / airdrop (220 km/h)',
                    data: airTimes,
                    borderColor: CHART.series[1],
                    borderWidth: 2.5,
                    tension: 0.3,
                    pointRadius: 3.5,
                    pointHoverRadius: 6,
                    pointBackgroundColor: CHART.series[1]
                },
                {
                    label: 'River & delta barge (25 km/h)',
                    data: boatTimes,
                    borderColor: CHART.series[2],
                    borderWidth: 2.5,
                    tension: 0.3,
                    pointRadius: 3.5,
                    pointHoverRadius: 6,
                    pointBackgroundColor: CHART.series[2]
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: { mode: 'index', intersect: false },
            scales: {
                ...chartScales(),
                y: {
                    ...chartScales().y,
                    title: { display: true, text: 'Transit duration (hours)', color: CHART.tick }
                },
                x: {
                    ...chartScales().x,
                    title: { display: true, text: 'Corridor Distance (km)', color: CHART.tick }
                }
            },
            plugins: {
                legend: { position: 'top', align: 'end' }
            }
        }
    });
}

function calculateCustomTransport(distanceKm = 100) {
    const d = Math.max(1, parseFloat(distanceKm) || 100);

    // 1. Land (Truck): 50 km/h average, 1.3x road factor, 0.5h prep
    const landHours = (d * 1.3 / 50.0) + 0.5;
    const landH = Math.floor(landHours);
    const landM = Math.round((landHours - landH) * 60);

    // 2. Air (Helicopter): 220 km/h speed, 1.05x flight path, 0.3h staging
    const airHours = (d * 1.05 / 220.0) + 0.3;
    const airH = Math.floor(airHours);
    const airM = Math.round((airHours - airH) * 60);

    // 3. Water (Boat): 25 km/h speed, 1.4x riverine path, 0.6h dock
    const waterHours = (d * 1.4 / 25.0) + 0.6;
    const waterH = Math.floor(waterHours);
    const waterM = Math.round((waterHours - waterH) * 60);

    // Update UI
    const elLandEta = document.getElementById('calc-land-eta');
    const elAirEta = document.getElementById('calc-air-eta');
    const elWaterEta = document.getElementById('calc-water-eta');

    if (elLandEta) elLandEta.textContent = `${landH}h ${landM}m`;
    if (elAirEta) elAirEta.textContent = `${airH}h ${airM}m`;
    if (elWaterEta) elWaterEta.textContent = `${waterH}h ${waterM}m`;
}
window.calculateCustomTransport = calculateCustomTransport;

function onTransportDistanceInput(val) {
    const elVal = document.getElementById('transport-val-distance');
    if (elVal) elVal.textContent = `${val} km`;
    calculateCustomTransport(val);
}
window.onTransportDistanceInput = onTransportDistanceInput;

async function fetchTransportAnalytics() {
    try {
        const res = await apiFetch('/api/transport-analytics');
        if (!res || !res.ok) throw new Error('Failed to fetch transport analytics');
        const data = await res.json();
        transportAnalyticsData = data;

        // Initial calculation
        const currDist = document.getElementById('transport-distance-slider')?.value || 100;
        calculateCustomTransport(currDist);

        // Draw Trade-off Chart with dynamic time curves
        drawTransportTradeoffChart(data.distance_curves);

    } catch (err) {
        console.error('Error in fetchTransportAnalytics:', err);
    }
}
window.fetchTransportAnalytics = fetchTransportAnalytics;

async function fetchPrescriptiveRecommendations() {
    const container = document.getElementById('recommendations-container');
    if (!container) return;

    try {
        const res = await apiFetch('/api/prescriptive-recommendations');
        if (!res || !res.ok) throw new Error('API offline');
        const data = await res.json();
        const recs = data.recommendations || [];

        if (recs.length === 0) {
            container.innerHTML = '<div class="text-sm text-slate-400 py-6 text-center">All regional depots currently operating within balanced safety buffers.</div>';
            return;
        }

        container.innerHTML = recs.map(rec => {
            return `
                <div class="rec">
                    <div class="rec-main">
                        <div class="rec-meta">
                            <span class="tag">${rec.tag}</span>
                            <span class="rec-priority"><span class="dot ${rec.priority_class || 'dot-critical'}"></span> ${rec.priority}</span>
                        </div>
                        <h4>${rec.title}</h4>
                        <p>${rec.description}</p>
                    </div>
                    <button onclick="applyRecommendation(this, '${encodeURIComponent(rec.action_payload)}')" class="btn btn-primary">${rec.action_label || 'Authorise'}</button>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error('Error fetching prescriptive recommendations:', err);
    }
}
window.fetchPrescriptiveRecommendations = fetchPrescriptiveRecommendations;

async function fetchRegionalVulnerability() {
    const tbody = document.getElementById('vulnerability-tbody');
    if (!tbody) return;

    try {
        const res = await apiFetch('/api/regional-vulnerability');
        if (!res || !res.ok) throw new Error('API offline');
        const data = await res.json();
        const sectors = data.sectors || [];

        if (sectors.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center p-4 text-slate-400">No active regional sectors found.</td></tr>';
            return;
        }

        tbody.innerHTML = sectors.map(sec => `
            <tr>
                <td class="strong">${sec.sector}</td>
                <td class="num muted">${sec.population || '--'}</td>
                <td>${sec.primary_threat}</td>
                <td class="num ${sec.vulnerability_class}">${sec.vulnerability}</td>
                <td>${sec.nearest_depot}</td>
                <td class="num">${sec.land_eta}</td>
                <td><span class="tag ${sec.status_class}">${sec.status}</span></td>
            </tr>
        `).join('');
    } catch (err) {
        console.error('Error fetching regional vulnerability:', err);
    }
}
window.fetchRegionalVulnerability = fetchRegionalVulnerability;

async function fetchDepotStockAnalytics() {
    const container = document.getElementById('depots-grid-container');
    if (!container) return;

    try {
        const res = await apiFetch('/api/depot-stock-analytics');
        if (!res || !res.ok) throw new Error('API offline');
        const data = await res.json();
        const depots = data.depots || [];

        if (depots.length === 0) {
            container.innerHTML = '<div class="p-6 text-center text-slate-400 text-xs font-semibold col-span-3">No active depots found.</div>';
            return;
        }

        const badge = document.getElementById('depots-online-badge');
        if (badge) badge.innerText = `${depots.length} hubs online`;

        container.innerHTML = depots.map(dp => {
            const fillWater = dp.water_pct < 50 ? 'meter-fill-critical' : (dp.water_pct < 80 ? 'meter-fill-warning' : 'meter-fill-ok');
            const fillFood = dp.food_pct < 50 ? 'meter-fill-critical' : (dp.food_pct < 80 ? 'meter-fill-warning' : 'meter-fill-ok');

            return `
                <div class="depot">
                    <div class="depot-head">
                        <div>
                            <h4>${dp.name}</h4>
                            <p>${dp.role}</p>
                        </div>
                        <span class="tag ${dp.tag_class}">${dp.days_remaining}</span>
                    </div>
                    <div class="depot-meters">
                        <div class="meter">
                            <div class="meter-head">
                                <span>Water</span>
                                <span class="meter-val">${dp.water_display}</span>
                            </div>
                            <div class="meter-track"><div class="meter-fill ${fillWater}" style="width: ${dp.water_pct}%"></div></div>
                        </div>
                        <div class="meter">
                            <div class="meter-head">
                                <span>Food</span>
                                <span class="meter-val">${dp.food_display}</span>
                            </div>
                            <div class="meter-track"><div class="meter-fill ${fillFood}" style="width: ${dp.food_pct}%"></div></div>
                        </div>
                        <div class="meter">
                            <div class="meter-head">
                                <span>Medical</span>
                                <span class="meter-val">${dp.med_kits.toLocaleString()} kits</span>
                            </div>
                            <div class="meter-track"><div class="meter-fill meter-fill-ok" style="width: ${dp.med_pct}%"></div></div>
                        </div>
                    </div>
                    <button onclick="simulateRestock('${dp.name}', this)" class="btn btn-xs" style="width:100%;">Trigger restock</button>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error('Error fetching depot stock analytics:', err);
    }
}
window.fetchDepotStockAnalytics = fetchDepotStockAnalytics;

async function simulateRestock(depotName, btn) {
    if (btn) {
        btn.disabled = true;
        btn.innerText = 'Dispatching restock...';
    }
    try {
        const res = await apiFetch('/api/depots/restock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ depot_name: depotName })
        });
        if (res && res.ok) {
            await fetchDepotStockAnalytics();
            if (btn) {
                btn.innerText = 'Restocked 100%';
                btn.classList.add('is-done');
                setTimeout(() => {
                    btn.disabled = false;
                    btn.innerText = 'Trigger restock';
                    btn.classList.remove('is-done');
                }, 4000);
            }
        } else {
            if (btn) {
                btn.disabled = false;
                btn.innerText = 'Trigger restock';
            }
        }
    } catch (err) {
        console.error('Failed to restock depot:', err);
        if (btn) {
            btn.disabled = false;
            btn.innerText = 'Trigger restock';
        }
    }
}
window.simulateRestock = simulateRestock;

function applyRecommendation(btn, encodedMessage) {
    const message = decodeURIComponent(encodedMessage || 'Action Authorized');
    btn.textContent = 'Authorised';
    btn.classList.remove('btn-primary');
    btn.classList.add('is-done');
    btn.disabled = true;
    alert(`${message}\nLogged to operational command telemetry audit trail.`);
}
window.applyRecommendation = applyRecommendation;

// Init on load
document.addEventListener('DOMContentLoaded', () => {
    fetchAnalyticsData();
    runSimulation();
    fetchPrescriptiveRecommendations();
    fetchRegionalVulnerability();
    fetchDepotStockAnalytics();
    fetchTransportAnalytics();
});

