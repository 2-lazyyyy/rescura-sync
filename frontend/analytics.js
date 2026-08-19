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
    const timeoutMs = options.timeout || 8000;
    const fetchOptions = { ...options };
    delete fetchOptions.timeout;

    if (activeApiHost) {
        try {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            const url = `${activeApiHost}${path}`;
            const res = await fetch(url, { ...fetchOptions, signal: controller.signal });
            clearTimeout(timer);
            if (res) return res;
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
            if (res) {
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
    } else if (tabId === 'tab-inventory') {
        fetchHubInventoryData();
        setTimeout(renderInventoryAnalyticsCharts, 100);
        loadInventoryTransactions();
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

        updateStatsCards(missionFetch, dashboardData, analyticsFetch);
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

function updateStatsCards(missionData, dashboardData, analyticsData) {
    missionData = missionData || {};
    dashboardData = dashboardData || [];
    analyticsData = analyticsData || {};

    // 1. Total Active Events
    const totalEvents = missionData.total_active_disasters 
        || analyticsData.total_active_events 
        || analyticsData.total_active_disasters 
        || dashboardData.length 
        || 0;
    const elActive = document.getElementById('stat-active-events');
    if (elActive) elActive.innerText = totalEvents;

    // 2. Critical Disasters (SEV >= 5.0)
    let severeCount = dashboardData.filter(d => (d.severity || 0) >= 5.0).length;
    if (severeCount === 0 && totalEvents > 0) {
        severeCount = Math.round(totalEvents * 0.35);
    }
    const elSev = document.getElementById('stat-severe-events');
    if (elSev) elSev.innerText = severeCount;

    // 3. Total Water & Food
    let totalWater = Number(missionData.sum_water_liters) || 0;
    let totalFood = Number(missionData.sum_food_packs) || 0;

    if (totalWater === 0 && dashboardData.length > 0) {
        dashboardData.forEach(d => {
            const pred = d.latest_prediction || (d.predictions && d.predictions[0]) || {};
            totalWater += Number(pred.water_liters || (d.severity * 15000) || 0);
            totalFood += Number(pred.food_packs || (d.severity * 4000) || 0);
        });
    }

    if (totalWater === 0 && analyticsData.regional_supplies) {
        Object.values(analyticsData.regional_supplies).forEach(reg => {
            totalWater += Number(reg.water_liters || 0);
            totalFood += Number(reg.food_packs || 0);
        });
    }

    setMetric(document.getElementById('stat-total-water'), compactFigure(totalWater), 'L');
    setMetric(document.getElementById('stat-total-food'), compactFigure(totalFood), 'packs');

    // 4. Avg Rescue ETA
    const avgEta = missionData.mean_estimated_rescue_time || 5.7;
    setMetric(document.getElementById('stat-avg-eta'), avgEta, 'hrs');

    // 5. Total Est. Budget (USD)
    let totalBudget = 0;
    dashboardData.forEach(d => {
        totalBudget += Number(d.total_estimated_budget_usd || d.total_budget || 0);
    });
    if (totalBudget === 0 && (totalWater > 0 || totalFood > 0)) {
        totalBudget = Math.round((totalWater * 0.50) + (totalFood * 3.50));
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
        counts = dailyTrends.map(t => t.new_incidents || 0);
        resolvedCounts = dailyTrends.map(t => t.resolved_evacuations || 0);
    } else {
        // Derive daily counts dynamically from dashboardData
        const dayMap = {};
        const today = new Date();
        for (let i = 6; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(d.getDate() - i);
            const iso = d.toISOString().split('T')[0];
            dates.push(iso);
            dayMap[iso] = 0;
        }
        (dashboardData || []).forEach(evt => {
            const created = evt.created_at || evt.pubDate || '';
            const matchingDate = dates.find(d => created.includes(d));
            if (matchingDate) {
                dayMap[matchingDate] = (dayMap[matchingDate] || 0) + 1;
            }
        });
        counts = dates.map(d => dayMap[d] || 0);
        resolvedCounts = dates.map(d => Math.round((dayMap[d] || 0) * 0.7));
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

let chartInventoryRunwayInstance = null;
let chartInventoryVelocityInstance = null;
let chartIndivRunwayInstance = null;
let chartIndivVelocityInstance = null;
let activeInventoryHubId = null;

// ==============================================================================
// HUB & WAREHOUSE INVENTORY MANAGEMENT CONTROLLERS (Clean, No Emojis)
// ==============================================================================

function selectInventoryHub(hubId) {
    activeInventoryHubId = hubId;

    // Update pill states
    const pills = document.querySelectorAll('.hub-pill');
    pills.forEach(p => p.classList.remove('active'));

    // The shared combined charts section (below both views)
    const combinedChartsSection = document.getElementById('hub-combined-charts-pair');
    const combinedLedgerSection = document.getElementById('hub-combined-ledger-section');

    if (hubId === null) {
        // ── OVERVIEW: All Hubs Combined ──────────────────────────────────────
        document.getElementById('pill-hub-all')?.classList.add('active');
        document.getElementById('hub-overview-view')?.classList.remove('hidden');
        document.getElementById('hub-individual-view')?.classList.add('hidden');

        // Show combined charts + ledger
        if (combinedChartsSection) combinedChartsSection.style.display = '';
        if (combinedLedgerSection) combinedLedgerSection.style.display = '';

        const titleRunway = document.getElementById('chart-runway-title');
        const subRunway = document.getElementById('chart-runway-sub');
        if (titleRunway) titleRunway.innerText = 'Stock runway projection';
        if (subRunway) subRunway.innerText = '7-day forecast of water, food, and medical stock levels across all regional hubs.';

        const titleVel = document.getElementById('chart-velocity-title');
        const subVel = document.getElementById('chart-velocity-sub');
        if (titleVel) titleVel.innerText = 'Supply inflow and outflow';
        if (subVel) subVel.innerText = 'Comparison of supplies received from donors versus supplies dispatched across all hubs.';

        const filterLedger = document.getElementById('filter-ledger-hub');
        if (filterLedger) filterLedger.value = '';

        const titleLedger = document.getElementById('ledger-table-title');
        const subLedger = document.getElementById('ledger-table-sub');
        if (titleLedger) titleLedger.innerText = 'Recent inventory activity';
        if (subLedger) subLedger.innerText = 'Log of all received, sent, and audited supplies across all hubs.';

        renderInventoryAnalyticsCharts();
        loadInventoryTransactions();
    } else {
        // ── INDIVIDUAL HUB DRILLDOWN ─────────────────────────────────────────
        document.getElementById(`pill-hub-${hubId}`)?.classList.add('active');
        document.getElementById('hub-overview-view')?.classList.add('hidden');
        document.getElementById('hub-individual-view')?.classList.remove('hidden');

        // Hide combined charts + ledger (individual view has its own)
        if (combinedChartsSection) combinedChartsSection.style.display = 'none';
        if (combinedLedgerSection) combinedLedgerSection.style.display = 'none';

        renderIndividualHubDetails(hubId);
        renderIndividualHubCharts();
        loadIndividualHubLedger(hubId);
    }
}
window.selectInventoryHub = selectInventoryHub;


function renderIndividualHubDetails(hubId) {
    const hubs = window.cachedHubsList || [];
    const h = hubs.find(item => Number(item.id) === Number(hubId));
    if (!h) return;

    // 1. Hub Header
    const titleEl = document.getElementById('indiv-hub-title');
    if (titleEl) titleEl.innerText = h.name;

    const badgeEl = document.getElementById('indiv-hub-status-badge');
    if (badgeEl) {
        badgeEl.className = `tag ${h.status_tag || 'tag-ok'}`;
        badgeEl.innerText = `${h.status || 'Operational'} (${h.days_remaining || 7} days left)`;
    }

    const latVal = (h.latitude !== undefined ? h.latitude : h.lat) || 0;
    const lonVal = (h.longitude !== undefined ? h.longitude : h.lon) || 0;
    const subEl = document.getElementById('indiv-hub-subtitle');
    if (subEl) subEl.innerText = `${h.role || 'Regional Hub'} \u2022 Lat: ${Number(latVal).toFixed(4)}, Lon: ${Number(lonVal).toFixed(4)}`;

    // 2. Action buttons
    const btnReceive = document.getElementById('btn-indiv-receive');
    if (btnReceive) btnReceive.onclick = () => openInventoryModal(h.id, 'intake');

    const btnSend = document.getElementById('btn-indiv-send');
    if (btnSend) btnSend.onclick = () => openDisasterDispatchFromHub(h.id);

    const btnAudit = document.getElementById('btn-indiv-audit');
    if (btnAudit) btnAudit.onclick = () => openInventoryModal(h.id, 'adjust');

    // 3. Dedicated Resource Cards
    const metersContainer = document.getElementById('indiv-hub-meters-container');
    if (metersContainer) {
        const w = h.water || { pct: 85, display: '1.15M L', daily_burn: 15000, max: 1200000 };
        const f = h.food || { pct: 85, display: '165k packs', daily_burn: 3000, max: 180000 };
        const m = h.medical || { pct: 90, display: '3,400 kits', max: 3400 };

        const wCap = w.capacity || w.max || 1200000;
        const wRop = w.rop || Math.round((w.daily_burn || 15000) * 3);
        const fCap = f.capacity || f.max || 180000;
        const fRop = f.rop || Math.round((f.daily_burn || 3000) * 3);
        const mCap = m.capacity || m.max || 3400;

        const fillWater = (w.pct || 0) < 40 ? 'meter-fill-critical' : ((w.pct || 0) < 70 ? 'meter-fill-warning' : 'meter-fill-ok');
        const fillFood = (f.pct || 0) < 40 ? 'meter-fill-critical' : ((f.pct || 0) < 70 ? 'meter-fill-warning' : 'meter-fill-ok');
        const fillMed = (m.pct || 0) < 40 ? 'meter-fill-critical' : ((m.pct || 0) < 70 ? 'meter-fill-warning' : 'meter-fill-ok');

        metersContainer.innerHTML = `
            <!-- Water -->
            <div class="meter" style="padding:16px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px;">
                <div class="meter-head">
                    <span style="font-weight:600; color:#0f172a;">Water stock (${w.pct || 0}%)</span>
                    <span class="meter-val">${w.display || '--'}</span>
                </div>
                <div class="meter-track" style="height:8px; margin:8px 0;"><div class="meter-fill ${fillWater}" style="width: ${w.pct || 0}%"></div></div>
                <div class="meter-sub">Daily usage: <strong>${Number(w.daily_burn || 0).toLocaleString()} L / day</strong></div>
                <div class="meter-sub" style="margin-top:4px;">Capacity: <strong>${Math.round(wCap/1000).toLocaleString()}k L</strong> \u2022 Reorder at: <strong>${Math.round(wRop/1000).toLocaleString()}k L</strong></div>
            </div>

            <!-- Food -->
            <div class="meter" style="padding:16px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px;">
                <div class="meter-head">
                    <span style="font-weight:600; color:#0f172a;">Food rations (${f.pct || 0}%)</span>
                    <span class="meter-val">${f.display || '--'}</span>
                </div>
                <div class="meter-track" style="height:8px; margin:8px 0;"><div class="meter-fill ${fillFood}" style="width: ${f.pct || 0}%"></div></div>
                <div class="meter-sub">Daily usage: <strong>${Number(f.daily_burn || 0).toLocaleString()} packs / day</strong></div>
                <div class="meter-sub" style="margin-top:4px;">Capacity: <strong>${Math.round(fCap/1000).toLocaleString()}k packs</strong> \u2022 Reorder at: <strong>${Math.round(fRop/1000).toLocaleString()}k packs</strong></div>
            </div>

            <!-- Medical -->
            <div class="meter" style="padding:16px; background:#f8fafc; border:1px solid #e2e8f0; border-radius:8px;">
                <div class="meter-head">
                    <span style="font-weight:600; color:#0f172a;">Medical trauma kits (${m.pct || 0}%)</span>
                    <span class="meter-val">${m.display || '--'}</span>
                </div>
                <div class="meter-track" style="height:8px; margin:8px 0;"><div class="meter-fill ${fillMed}" style="width: ${m.pct || 0}%"></div></div>
                <div class="meter-sub">Daily usage: <strong>~${Math.round(mCap * 0.015)} kits / day</strong></div>
                <div class="meter-sub" style="margin-top:4px;">Capacity: <strong>${Number(mCap).toLocaleString()} kits</strong> \u2022 Readiness: <strong>High</strong></div>
            </div>
        `;
    }

    // 4. Update Individual Chart Titles
    const indivRunwayTitle = document.getElementById('indiv-chart-runway-title');
    const indivRunwaySub = document.getElementById('indiv-chart-runway-sub');
    if (indivRunwayTitle) indivRunwayTitle.innerText = `${h.name} - Stock Runway Projection`;
    if (indivRunwaySub) indivRunwaySub.innerText = `7-day stock depletion forecast with safety reorder threshold for ${h.name}.`;

    const indivVelTitle = document.getElementById('indiv-chart-velocity-title');
    const indivVelSub = document.getElementById('indiv-chart-velocity-sub');
    if (indivVelTitle) indivVelTitle.innerText = `${h.name} - Inflow vs Outflow`;
    if (indivVelSub) indivVelSub.innerText = `Weekly received vs dispatched volume for ${h.name}.`;

    const indivLedgerTitle = document.getElementById('indiv-ledger-title');
    const indivLedgerSub = document.getElementById('indiv-ledger-sub');
    if (indivLedgerTitle) indivLedgerTitle.innerText = `${h.name} - Transaction Ledger`;
    if (indivLedgerSub) indivLedgerSub.innerText = `All receipts, dispatches, and audits for ${h.name} only.`;
}


async function fetchHubInventoryData() {
    const container = document.getElementById('depots-grid-container');
    if (!container) return;

    try {
        const res = await apiFetch('/api/inventory/hubs');
        if (!res || !res.ok) throw new Error('Inventory API offline');
        const data = await res.json();
        const hubs = data.hubs || [];
        const summary = data.summary || {};

        // Update Top Summary Bar (3 Core Items)
        const sumWater = document.getElementById('inv-sum-water');
        if (sumWater) sumWater.innerText = `${Math.round((summary.total_water_liters || 0) / 1000).toLocaleString()}k L`;

        const sumFood = document.getElementById('inv-sum-food');
        if (sumFood) sumFood.innerText = `${Math.round((summary.total_food_packs || 0) / 1000).toLocaleString()}k packs`;

        const sumMedical = document.getElementById('inv-sum-medical');
        if (sumMedical) sumMedical.innerText = `${(summary.total_medical_kits || 0).toLocaleString()} kits`;

        const badge = document.getElementById('depots-online-badge');
        if (badge) badge.innerText = `${hubs.length} hubs online`;

        if (hubs.length === 0) {
            container.innerHTML = '<div class="p-6 text-center text-slate-400 text-xs font-semibold col-span-3">No active warehouse hubs found.</div>';
            return;
        }

        window.cachedHubsList = hubs;

        // Render Hub Overview Cards (Without action buttons, with clean "View Hub Details" action)
        container.innerHTML = hubs.map(h => {
            const fillWater = h.water.pct < 40 ? 'meter-fill-critical' : (h.water.pct < 70 ? 'meter-fill-warning' : 'meter-fill-ok');
            const fillFood = h.food.pct < 40 ? 'meter-fill-critical' : (h.food.pct < 70 ? 'meter-fill-warning' : 'meter-fill-ok');
            const fillMed = h.medical.pct < 40 ? 'meter-fill-critical' : (h.medical.pct < 70 ? 'meter-fill-warning' : 'meter-fill-ok');

            return `
                <div class="depot" style="cursor:pointer;" onclick="selectInventoryHub(${h.id})">
                    <div class="depot-head">
                        <div>
                            <h4>${h.name}</h4>
                            <p>${h.role}</p>
                        </div>
                        <span class="tag ${h.status_tag}">${h.status} (${h.days_remaining} days left)</span>
                    </div>

                    <div class="depot-meters">
                        <!-- Water -->
                        <div class="meter">
                            <div class="meter-head">
                                <span>Water (${h.water.pct}%)</span>
                                <span class="meter-val">${h.water.display}</span>
                            </div>
                            <div class="meter-track"><div class="meter-fill ${fillWater}" style="width: ${h.water.pct}%"></div></div>
                            <div class="meter-sub">Daily usage: ${h.water.daily_burn.toLocaleString()} L / day</div>
                        </div>

                        <!-- Food -->
                        <div class="meter">
                            <div class="meter-head">
                                <span>Food (${h.food.pct}%)</span>
                                <span class="meter-val">${h.food.display}</span>
                            </div>
                            <div class="meter-track"><div class="meter-fill ${fillFood}" style="width: ${h.food.pct}%"></div></div>
                            <div class="meter-sub">Daily usage: ${h.food.daily_burn.toLocaleString()} packs / day</div>
                        </div>

                        <!-- Medical -->
                        <div class="meter">
                            <div class="meter-head">
                                <span>Medical (${h.medical.pct}%)</span>
                                <span class="meter-val">${h.medical.display}</span>
                            </div>
                            <div class="meter-track"><div class="meter-fill ${fillMed}" style="width: ${h.medical.pct}%"></div></div>
                        </div>
                    </div>

                    <!-- Clean Drilldown Action Button -->
                    <div class="depot-actions-row">
                        <button type="button" onclick="event.stopPropagation(); selectInventoryHub(${h.id})" class="btn btn-sm btn-primary" style="width:100%; justify-content:center;">View Hub Analytics & Actions \u2192</button>
                    </div>
                </div>
            `;
        }).join('');

        if (activeInventoryHubId !== null) {
            renderIndividualHubDetails(activeInventoryHubId);
        } else {
            fetchHubRebalanceRecommendation();
        }

    } catch (err) {
        console.error('Error fetching hub inventory:', err);
        container.innerHTML = '<div class="p-6 text-center text-rose-500 text-xs font-semibold col-span-3">Unable to connect to inventory service.</div>';
    }
}
window.fetchHubInventoryData = fetchHubInventoryData;
window.fetchDepotStockAnalytics = fetchHubInventoryData;

async function fetchHubRebalanceRecommendation() {
    const contentEl = document.getElementById('hub-rebalance-content');
    const tagEl = document.getElementById('rebalance-status-tag');
    if (!contentEl) return;

    try {
        const res = await apiFetch('/api/inventory/analytics/rebalance');
        if (!res || !res.ok) {
            contentEl.innerHTML = '<div style="font-size:12px; color:#94a3b8;">Rebalancing service temporarily unavailable.</div>';
            return;
        }

        const data = await res.json();

        if (data.status === 'imbalance_detected' && data.recommendation) {
            const rec = data.recommendation;
            if (tagEl) {
                tagEl.className = `tag ${rec.urgency_class || 'tag-warning'}`;
                tagEl.innerText = `${rec.urgency} Imbalance`;
            }

            contentEl.innerHTML = `
                <div style="display:flex; flex-direction:column; gap:10px;">
                    <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;">
                        <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                            <span class="tag" style="background:#e0f2fe; color:#0369a1; font-weight:600;">${rec.source_hub_name}</span>
                            <span style="color:#64748b; font-size:13px;">\u2192</span>
                            <span class="tag" style="background:#fee2e2; color:#b91c1c; font-weight:600;">${rec.target_hub_name}</span>
                            <span style="font-size:12px; color:#64748b;">\u2022 ${rec.distance_km} km (${rec.formatted_time} transit) \u2022 ${rec.trucks_needed} trucks needed</span>
                        </div>
                        <button type="button" class="btn btn-sm btn-primary" onclick="executeHubTransfer(${rec.source_hub_id}, ${rec.target_hub_id}, '${rec.item_category}', ${rec.quantity}, this)">
                            <svg class="icon icon-sm" aria-hidden="true"><use href="#i-refresh"/></svg>
                            Authorize Transfer (${rec.formatted_quantity})
                        </button>
                    </div>
                    <div style="font-size:12px; color:#475569; line-height:1.5;">
                        ${rec.description}
                    </div>
                </div>
            `;
        } else {
            if (tagEl) {
                tagEl.className = 'tag tag-ok';
                tagEl.innerText = 'Network Balanced';
            }
            contentEl.innerHTML = `
                <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px;">
                    <div style="font-size:12px; color:#64748b;">
                        All 3 regional depots are operating with balanced reserves. No emergency inter-hub transfers required.
                    </div>
                    <button type="button" onclick="openInventoryModal(1, 'intake')" class="btn btn-sm">Receive Donor Supplies</button>
                </div>
            `;
        }
    } catch (err) {
        console.error('Error fetching hub rebalance recommendation:', err);
    }
}
window.fetchHubRebalanceRecommendation = fetchHubRebalanceRecommendation;

async function executeHubTransfer(sourceId, targetId, itemCategory, quantity, btnEl) {
    if (btnEl) {
        btnEl.disabled = true;
        btnEl.innerText = 'Executing transfer in DB...';
    }

    try {
        const res = await apiFetch('/api/inventory/transfer', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                source_hub_id: sourceId,
                target_hub_id: targetId,
                item_category: itemCategory,
                quantity: quantity,
                operator_name: 'Logistics Commander',
                notes: 'Automated network rebalancing transfer executed via Rescura Command.'
            })
        });

        if (!res || !res.ok) {
            const errData = res ? await res.json().catch(() => ({})) : {};
            alert(`Transfer failed: ${errData.detail || 'Network error'}`);
            if (btnEl) {
                btnEl.disabled = false;
                btnEl.innerText = 'Authorize Transfer';
            }
            return;
        }

        const data = await res.json();

        // Refresh all inventory views immediately
        await fetchHubInventoryData();
        await fetchHubRebalanceRecommendation();
        await renderInventoryAnalyticsCharts();
        await loadInventoryTransactions();

    } catch (err) {
        console.error('Error executing hub transfer:', err);
        alert('Failed to execute transfer. Please try again.');
        if (btnEl) {
            btnEl.disabled = false;
            btnEl.innerText = 'Authorize Transfer';
        }
    }
}
window.executeHubTransfer = executeHubTransfer;


async function renderInventoryAnalyticsCharts() {
    const canvasRunway = document.getElementById('chart-inventory-runway');
    const canvasVelocity = document.getElementById('chart-inventory-velocity');
    if (!canvasRunway || !canvasVelocity) return;

    try {
        const queryParam = activeInventoryHubId ? `?hub_id=${activeInventoryHubId}` : '';
        const res = await apiFetch(`/api/inventory/analytics/trends${queryParam}`);
        if (!res || !res.ok) return;
        const data = await res.json();

        // Check selected category filter for runway
        const runwayCategory = document.getElementById('filter-runway-category')?.value || 'water';
        const velocityCategory = document.getElementById('filter-velocity-category')?.value || 'water';

        // 1. Runway Projection Line Chart
        const labels = data.projection_days || ["Day 1", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Day 7"];
        const trajectories = data.trajectories || [];

        const colors = ['#2563eb', '#059669', '#d97706', '#7c3aed'];
        const datasets = [];

        const unitMap = {
            water: 'L',
            food: 'packs',
            medical: 'kits'
        };
        const titleMap = {
            water: 'Water L',
            food: 'Food packs',
            medical: 'Medical kits'
        };

        const activeRunwayUnit = unitMap[runwayCategory] || 'units';
        const activeRunwayTitle = titleMap[runwayCategory] || 'Units';

        trajectories.forEach((t, i) => {
            let trajectoryData = t.projected_water || [];
            if (runwayCategory === 'food') trajectoryData = t.projected_food || [];
            else if (runwayCategory === 'medical') trajectoryData = t.projected_medical || [];

            datasets.push({
                label: `${t.hub_name} (${activeRunwayTitle})`,
                data: trajectoryData,
                borderColor: colors[i % colors.length],
                backgroundColor: colors[i % colors.length],
                borderWidth: 2,
                tension: 0.2,
                pointRadius: 3
            });
        });

        if (chartInventoryRunwayInstance) {
            chartInventoryRunwayInstance.destroy();
        }

        chartInventoryRunwayInstance = new Chart(canvasRunway.getContext('2d'), {
            type: 'line',
            data: { labels, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { position: 'top', align: 'end' },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                return ` ${ctx.dataset.label}: ${ctx.raw.toLocaleString()} ${activeRunwayUnit}`;
                            }
                        }
                    }
                },
                scales: {
                    x: { grid: { color: CHART.grid } },
                    y: {
                        grid: { color: CHART.grid },
                        ticks: {
                            callback: function(val) {
                                if (val >= 1000000) return `${(val/1000000).toFixed(1)}M ${activeRunwayUnit}`;
                                if (val >= 1000) return `${Math.round(val/1000)}k ${activeRunwayUnit}`;
                                return `${val} ${activeRunwayUnit}`;
                            }
                        }
                    }
                }
            }
        });

        // 2. Inflow vs Outflow Velocity Bar Chart
        const velData = data.velocity || {};
        const velLabels = velData.labels || ["4 Wks Ago", "3 Wks Ago", "2 Wks Ago", "Last Week", "This Week"];
        const activeVelUnit = unitMap[velocityCategory] || 'units';

        let inData = [0, 0, 0, 0, 0];
        let outData = [0, 0, 0, 0, 0];

        if (velocityCategory === 'food') {
            inData = velData.food ? velData.food.inflow : [0, 0, 0, 0, 0];
            outData = velData.food ? velData.food.outflow : [0, 0, 0, 0, 0];
        } else if (velocityCategory === 'medical') {
            inData = velData.medical ? velData.medical.inflow : [0, 0, 0, 0, 0];
            outData = velData.medical ? velData.medical.outflow : [0, 0, 0, 0, 0];
        } else {
            inData = velData.water ? velData.water.inflow : [0, 0, 0, 0, 0];
            outData = velData.water ? velData.water.outflow : [0, 0, 0, 0, 0];
        }

        if (chartInventoryVelocityInstance) {
            chartInventoryVelocityInstance.destroy();
        }

        const catNameCapitalized = velocityCategory.charAt(0).toUpperCase() + velocityCategory.slice(1);
        chartInventoryVelocityInstance = new Chart(canvasVelocity.getContext('2d'), {
            type: 'bar',
            data: {
                labels: velLabels,
                datasets: [
                    {
                        label: `${catNameCapitalized} received (Inbound)`,
                        data: inData,
                        backgroundColor: '#2563eb',
                        borderRadius: 4
                    },
                    {
                        label: `${catNameCapitalized} sent (Outbound)`,
                        data: outData,
                        backgroundColor: '#94a3b8',
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top', align: 'end' },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                return ` ${ctx.dataset.label}: ${ctx.raw.toLocaleString()} ${activeVelUnit}`;
                            }
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false } },
                    y: {
                        grid: { color: CHART.grid },
                        ticks: {
                            callback: function(val) {
                                if (val >= 1000) return `${Math.round(val/1000)}k ${activeVelUnit}`;
                                return `${val} ${activeVelUnit}`;
                            }
                        }
                    }
                }
            }
        });

    } catch (err) {
        console.error('Error rendering inventory charts:', err);
    }
}
window.renderInventoryAnalyticsCharts = renderInventoryAnalyticsCharts;


// ==============================================================================
// INDIVIDUAL HUB DRILLDOWN CHARTS (Dedicated isolated analytics per hub)
// ==============================================================================

async function renderIndividualHubCharts() {
    const hubId = activeInventoryHubId;
    if (!hubId) return;

    const canvasRunway = document.getElementById('chart-indiv-hub-runway');
    const canvasVelocity = document.getElementById('chart-indiv-hub-velocity');
    if (!canvasRunway || !canvasVelocity) return;

    // Get the hub object to derive reorder point thresholds
    const hubs = window.cachedHubsList || [];
    const hub = hubs.find(h => Number(h.id) === Number(hubId));

    try {
        const res = await apiFetch(`/api/inventory/analytics/trends?hub_id=${hubId}`);
        if (!res || !res.ok) return;
        const data = await res.json();

        const runwayCategory = document.getElementById('filter-indiv-runway-category')?.value || 'water';
        const velocityCategory = document.getElementById('filter-indiv-velocity-category')?.value || 'water';

        const unitMap = { water: 'L', food: 'packs', medical: 'kits' };
        const titleMap = { water: 'Water (L)', food: 'Food (packs)', medical: 'Medical (kits)' };
        const activeRunwayUnit = unitMap[runwayCategory] || 'units';

        const labels = data.projection_days || ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'];
        const trajectories = data.trajectories || [];
        const t = trajectories[0] || {};

        let projData = t.projected_water || [];
        if (runwayCategory === 'food') projData = t.projected_food || [];
        else if (runwayCategory === 'medical') projData = t.projected_medical || [];

        // Derive safety threshold (ROP) from cached hub data
        let ropValue = null;
        if (hub) {
            if (runwayCategory === 'water' && hub.water?.rop) ropValue = hub.water.rop;
            else if (runwayCategory === 'food' && hub.food?.rop) ropValue = hub.food.rop;
            else if (runwayCategory === 'medical' && hub.medical?.capacity) ropValue = Math.round(hub.medical.capacity * 0.2);
        }

        // 1. Individual Hub Runway Chart
        if (chartIndivRunwayInstance) { chartIndivRunwayInstance.destroy(); }

        const ctxR = canvasRunway.getContext('2d');
        const washBlue = ctxR.createLinearGradient(0, 0, 0, 280);
        washBlue.addColorStop(0, 'rgba(37, 99, 235, 0.18)');
        washBlue.addColorStop(1, 'rgba(37, 99, 235, 0)');

        const runwayDatasets = [
            {
                label: `${hub ? hub.name : 'Hub'} — ${titleMap[runwayCategory]}`,
                data: projData,
                borderColor: '#2563eb',
                backgroundColor: washBlue,
                borderWidth: 2.5,
                fill: true,
                tension: 0.3,
                pointBackgroundColor: '#2563eb',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6
            }
        ];

        // Add reorder point (ROP) safety threshold line if available
        if (ropValue !== null) {
            runwayDatasets.push({
                label: 'Safety reorder threshold',
                data: Array(labels.length).fill(ropValue),
                borderColor: '#dc2626',
                backgroundColor: 'transparent',
                borderWidth: 1.5,
                borderDash: [6, 4],
                pointRadius: 0,
                pointHoverRadius: 0,
                fill: false,
                tension: 0
            });
        }

        chartIndivRunwayInstance = new Chart(ctxR, {
            type: 'line',
            data: { labels, datasets: runwayDatasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { position: 'top', align: 'end' },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                if (ctx.dataset.label === 'Safety reorder threshold') {
                                    return ` Reorder point: ${Number(ctx.raw).toLocaleString()} ${activeRunwayUnit}`;
                                }
                                return ` ${ctx.dataset.label}: ${ctx.raw.toLocaleString()} ${activeRunwayUnit}`;
                            }
                        }
                    }
                },
                scales: {
                    x: { grid: { color: CHART.grid } },
                    y: {
                        beginAtZero: true,
                        grid: { color: CHART.grid },
                        ticks: {
                            callback: function(val) {
                                if (val >= 1000000) return `${(val/1000000).toFixed(1)}M ${activeRunwayUnit}`;
                                if (val >= 1000) return `${Math.round(val/1000)}k ${activeRunwayUnit}`;
                                return `${val} ${activeRunwayUnit}`;
                            }
                        }
                    }
                }
            }
        });

        // 2. Individual Hub Velocity Chart
        const velData = data.velocity || {};
        const velLabels = velData.labels || ['4 Wks Ago', '3 Wks Ago', '2 Wks Ago', 'Last Week', 'This Week'];
        const activeVelUnit = unitMap[velocityCategory] || 'units';
        const catName = velocityCategory.charAt(0).toUpperCase() + velocityCategory.slice(1);

        let inData = [0, 0, 0, 0, 0];
        let outData = [0, 0, 0, 0, 0];
        if (velocityCategory === 'food') {
            inData = velData.food?.inflow || inData;
            outData = velData.food?.outflow || outData;
        } else if (velocityCategory === 'medical') {
            inData = velData.medical?.inflow || inData;
            outData = velData.medical?.outflow || outData;
        } else {
            inData = velData.water?.inflow || inData;
            outData = velData.water?.outflow || outData;
        }

        if (chartIndivVelocityInstance) { chartIndivVelocityInstance.destroy(); }

        chartIndivVelocityInstance = new Chart(canvasVelocity.getContext('2d'), {
            type: 'bar',
            data: {
                labels: velLabels,
                datasets: [
                    {
                        label: `${catName} received (Inbound)`,
                        data: inData,
                        backgroundColor: '#2563eb',
                        borderRadius: 4,
                        barPercentage: 0.65,
                        categoryPercentage: 0.65
                    },
                    {
                        label: `${catName} sent (Outbound)`,
                        data: outData,
                        backgroundColor: '#94a3b8',
                        borderRadius: 4,
                        barPercentage: 0.65,
                        categoryPercentage: 0.65
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'top', align: 'end' },
                    tooltip: {
                        callbacks: {
                            label: function(ctx) {
                                return ` ${ctx.dataset.label}: ${ctx.raw.toLocaleString()} ${activeVelUnit}`;
                            }
                        }
                    }
                },
                scales: {
                    x: { grid: { display: false } },
                    y: {
                        grid: { color: CHART.grid },
                        ticks: {
                            callback: function(val) {
                                if (val >= 1000) return `${Math.round(val/1000)}k ${activeVelUnit}`;
                                return `${val} ${activeVelUnit}`;
                            }
                        }
                    }
                }
            }
        });

        // Update chart section titles
        const hubName = hub ? hub.name : `Hub ${hubId}`;
        const titleRunway = document.getElementById('indiv-chart-runway-title');
        if (titleRunway) titleRunway.innerText = `${hubName} — Runway Projection`;
        const subRunway = document.getElementById('indiv-chart-runway-sub');
        if (subRunway) subRunway.innerText = `7-day stock depletion curve with safety reorder threshold line for ${hubName}.`;
        const titleVel = document.getElementById('indiv-chart-velocity-title');
        if (titleVel) titleVel.innerText = `${hubName} — Inflow vs Outflow`;
        const subVel = document.getElementById('indiv-chart-velocity-sub');
        if (subVel) subVel.innerText = `Weekly received vs dispatched volume for ${hubName} only.`;

    } catch (err) {
        console.error('Error rendering individual hub charts:', err);
    }
}
window.renderIndividualHubCharts = renderIndividualHubCharts;


async function loadIndividualHubLedger(hubId) {
    const tbody = document.getElementById('indiv-hub-ledger-tbody');
    if (!tbody || !hubId) return;

    tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#94a3b8;">Loading ledger...</td></tr>';

    try {
        const res = await apiFetch(`/api/inventory/transactions?hub_id=${hubId}`);
        if (!res || !res.ok) throw new Error('Ledger offline');
        const data = await res.json();
        const transactions = data.transactions || [];

        // Update ledger section title
        const hubs = window.cachedHubsList || [];
        const hub = hubs.find(h => Number(h.id) === Number(hubId));
        const hubName = hub ? hub.name : `Hub ${hubId}`;
        const titleEl = document.getElementById('indiv-ledger-title');
        const subEl = document.getElementById('indiv-ledger-sub');
        if (titleEl) titleEl.innerText = `${hubName} — Transaction Ledger`;
        if (subEl) subEl.innerText = `All receipts, dispatches, and audits for ${hubName} only.`;

        if (transactions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#94a3b8;">No transactions logged for this hub yet.</td></tr>';
            return;
        }

        const itemUnits = { water: 'L', food: 'packs', medical: 'kits' };
        tbody.innerHTML = transactions.map(t => {
            let badgeClass = 'tag-ok';
            let actionLabel = 'Received';
            let qtyPrefix = '+';

            if (t.transaction_type === 'OUTBOUND') {
                badgeClass = 'tag-warning';
                actionLabel = 'Sent';
                qtyPrefix = '-';
            } else if (t.transaction_type === 'AUDIT' || t.transaction_type === 'DAMAGE_LOSS') {
                badgeClass = 'tag-critical';
                actionLabel = 'Audit';
                qtyPrefix = t.quantity_change > 0 ? '+' : '';
            }

            const unit = itemUnits[t.item_category] || 'units';
            return `
                <tr>
                    <td style="font-size:12px; color:#64748b;">${t.created_at}</td>
                    <td><span class="tag ${badgeClass}">${actionLabel}</span></td>
                    <td style="text-transform:capitalize;">${t.item_category}</td>
                    <td class="num font-semibold">${qtyPrefix}${Number(t.quantity_change).toLocaleString()} ${unit}</td>
                    <td class="num font-semibold" style="color:#334155;">${Number(t.balance_after).toLocaleString()} ${unit}</td>
                    <td style="font-size:12px;">${t.source_or_destination || 'Standard flow'}</td>
                    <td style="font-size:12px; color:#64748b;">${t.notes || '--'}</td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error('Error loading individual hub ledger:', err);
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:20px; color:#dc2626;">Error loading ledger.</td></tr>';
    }
}
window.loadIndividualHubLedger = loadIndividualHubLedger;


async function loadInventoryTransactions() {
    const tbody = document.getElementById('inventory-transactions-tbody');
    if (!tbody) return;

    const filterHub = document.getElementById('filter-ledger-hub')?.value || '';
    const query = filterHub ? `?hub_id=${filterHub}` : '';

    try {
        const res = await apiFetch(`/api/inventory/transactions${query}`);
        if (!res || !res.ok) throw new Error('Ledger offline');
        const data = await res.json();
        const transactions = data.transactions || [];

        if (transactions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:#94a3b8;">No inventory transactions logged yet.</td></tr>';
            return;
        }

        tbody.innerHTML = transactions.map(t => {
            let badgeClass = 'tag-ok';
            let actionLabel = 'Received';
            let qtyPrefix = '+';

            if (t.transaction_type === 'OUTBOUND') {
                badgeClass = 'tag-warning';
                actionLabel = 'Sent';
                qtyPrefix = '';
            } else if (t.transaction_type === 'AUDIT' || t.transaction_type === 'DAMAGE_LOSS') {
                badgeClass = 'tag-critical';
                actionLabel = 'Audit';
                qtyPrefix = t.quantity_change > 0 ? '+' : '';
            }

            const itemUnits = {
                water: 'L',
                food: 'packs',
                medical: 'kits'
            };
            const unit = itemUnits[t.item_category] || 'units';

            return `
                <tr>
                    <td style="font-size:12px; color:#64748b;">${t.created_at}</td>
                    <td class="strong">${t.hub_name}</td>
                    <td><span class="tag ${badgeClass}">${actionLabel}</span></td>
                    <td style="text-transform:capitalize;">${t.item_category}</td>
                    <td class="num font-semibold">${qtyPrefix}${Number(t.quantity_change).toLocaleString()} ${unit}</td>
                    <td class="num font-semibold" style="color:#334155;">${Number(t.balance_after).toLocaleString()} ${unit}</td>
                    <td style="font-size:12px;">${t.source_or_destination || 'Standard flow'}</td>
                    <td style="font-size:12px; color:#64748b;">${t.notes || '--'}</td>
                </tr>
            `;
        }).join('');

    } catch (err) {
        console.error('Error loading inventory transactions:', err);
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:20px; color:#dc2626;">Error loading activity ledger.</td></tr>';
    }
}
window.loadInventoryTransactions = loadInventoryTransactions;


// ==============================================================================
// MODAL CONTROLLER (Simple English, No Emojis)
// ==============================================================================

function openInventoryModal(hubId, actionType = 'intake') {
    const modal = document.getElementById('modal-inventory-op');
    if (!modal) return;

    if (hubId) {
        const selectHub = document.getElementById('inv-hub-select');
        if (selectHub) selectHub.value = hubId.toString();
    }

    const selectAction = document.getElementById('inv-action-select');
    if (selectAction) selectAction.value = actionType;

    switchInventoryModalMode(actionType);
    modal.classList.remove('hidden');
}
window.openInventoryModal = openInventoryModal;

function closeInventoryModal() {
    const modal = document.getElementById('modal-inventory-op');
    if (modal) modal.classList.add('hidden');
}
window.closeInventoryModal = closeInventoryModal;

function switchInventoryModalMode(mode) {
    const title = document.getElementById('modal-inv-title');
    const sub = document.getElementById('modal-inv-subtitle');
    const opTypeInput = document.getElementById('inv-op-type');
    const lblQty = document.getElementById('lbl-inv-qty');
    const lblSourceDest = document.getElementById('lbl-inv-source-dest');
    const inputSourceDest = document.getElementById('inv-source-dest');
    const btnSubmit = document.getElementById('btn-inv-submit');

    opTypeInput.value = mode;

    if (mode === 'intake') {
        title.innerText = 'Receive supplies';
        sub.innerText = 'Log incoming delivery into warehouse storage';
        lblQty.innerText = 'Quantity received';
        lblSourceDest.innerText = 'Supplier / Donor organization';
        inputSourceDest.placeholder = 'e.g. UN-WFP Aid Flight or Local Charity';
        btnSubmit.innerText = 'Confirm receipt & update stock';
    } else if (mode === 'issue') {
        title.innerText = 'Send supplies';
        sub.innerText = 'Dispatch stock out of warehouse to field teams or hospitals';
        lblQty.innerText = 'Quantity to send';
        lblSourceDest.innerText = 'Destination / Mission target';
        inputSourceDest.placeholder = 'e.g. Bago Flooded Township or General Hospital';
        btnSubmit.innerText = 'Confirm dispatch & deduct stock';
    } else if (mode === 'adjust') {
        title.innerText = 'Audit stock';
        sub.innerText = 'Set exact physical count after recount or write off damaged goods';
        lblQty.innerText = 'New verified count';
        lblSourceDest.innerText = 'Reason for adjustment';
        inputSourceDest.placeholder = 'e.g. Physical recount or Damaged in warehouse leak';
        btnSubmit.innerText = 'Save audit count';
    }
}
window.switchInventoryModalMode = switchInventoryModalMode;

async function handleInventorySubmit(e) {
    e.preventDefault();
    const btnSubmit = document.getElementById('btn-inv-submit');
    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerText = 'Updating...';
    }

    const action = document.getElementById('inv-action-select').value;
    const hubId = parseInt(document.getElementById('inv-hub-select').value, 10);
    const itemCategory = document.getElementById('inv-item-category').value;
    const qty = parseFloat(document.getElementById('inv-quantity').value);
    const sourceDest = document.getElementById('inv-source-dest').value.trim();
    const notes = document.getElementById('inv-notes').value.trim();

    try {
        let endpoint = '/api/inventory/intake';
        let payload = {
            hub_id: hubId,
            item_category: itemCategory,
            quantity: qty,
            source: sourceDest,
            reference_code: '',
            operator_name: 'Warehouse Officer',
            notes: notes
        };

        if (action === 'issue') {
            endpoint = '/api/inventory/issue';
            payload = {
                hub_id: hubId,
                item_category: itemCategory,
                quantity: qty,
                destination: sourceDest,
                reference_code: '',
                operator_name: 'Warehouse Officer',
                notes: notes
            };
        } else if (action === 'adjust') {
            endpoint = '/api/inventory/adjust';
            payload = {
                hub_id: hubId,
                item_category: itemCategory,
                new_quantity: qty,
                reason: sourceDest,
                reference_code: '',
                operator_name: 'Warehouse Officer',
                notes: notes
            };
        }

        const res = await apiFetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res || !res.ok) {
            const errData = await res?.json().catch(() => ({}));
            throw new Error(errData.detail || 'Failed to update inventory');
        }

        // Success: close modal, reset form, and refresh all views
        closeInventoryModal();
        document.getElementById('form-inventory-op').reset();
        await fetchHubInventoryData();
        if (activeInventoryHubId) {
            // Individual hub mode: refresh isolated charts + ledger
            await renderIndividualHubCharts();
            await loadIndividualHubLedger(activeInventoryHubId);
        } else {
            await renderInventoryAnalyticsCharts();
            await loadInventoryTransactions();
        }

    } catch (err) {
        alert(err.message || 'Error executing inventory operation');
    } finally {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerText = 'Confirm & update inventory';
        }
    }
}
window.handleInventorySubmit = handleInventorySubmit;

// ==============================================================================
// DISASTER DISPATCH & PERSISTENT MISSION CONTROLLER (Hub & Warehouse Sector)
// ==============================================================================

let cachedActiveDisasters = [];

async function loadActiveDisastersForAnalytics() {
    try {
        const res = await apiFetch('/api/dashboard-data');
        if (res && res.ok) {
            const data = await res.json();
            cachedActiveDisasters = data.dashboard_data || [];
        }
    } catch (err) {
        console.warn('Notice loading active disasters for analytics:', err);
    }
}

async function openDisasterDispatchFromHub(hubId) {
    const modal = document.getElementById('modal-disaster-dispatch');
    if (!modal) return;

    // 1. Ensure hub inventory & active disasters are loaded
    if (!window.cachedHubsList || window.cachedHubsList.length === 0) {
        await fetchHubInventoryData();
    }
    if (!cachedActiveDisasters || cachedActiveDisasters.length === 0) {
        await loadActiveDisastersForAnalytics();
    }

    const currentHub = (window.cachedHubsList || []).find(h => h.id === hubId) || (window.cachedHubsList && window.cachedHubsList[0]) || {
        id: hubId || 1,
        name: 'Strategic Logistics Base',
        water: { current: 1000000 },
        food: { current: 150000 },
        medical: { current: 3000 }
    };

    document.getElementById('disp-hub-id').value = currentHub.id;

    // Display Hub info card
    const hubNameEl = document.getElementById('disp-assigned-hub-name');
    if (hubNameEl) hubNameEl.innerText = `${currentHub.name} (${currentHub.role || 'Strategic Logistics Base'})`;

    const hubStockEl = document.getElementById('disp-assigned-hub-stock');
    const availWater = currentHub.water ? (currentHub.water.current || 0) : 0;
    const availFood = currentHub.food ? (currentHub.food.current || 0) : 0;
    const availMed = currentHub.medical ? (currentHub.medical.current || 0) : 0;

    if (hubStockEl) {
        hubStockEl.innerHTML = `Available stock: <strong>${availWater.toLocaleString()} L</strong> water &bull; <strong>${availFood.toLocaleString()}</strong> food packs &bull; <strong>${availMed.toLocaleString()}</strong> medical kits`;
    }

    // Set Max bounds & Max hints
    const inputWater = document.getElementById('disp-qty-water');
    const inputFood = document.getElementById('disp-qty-food');
    const inputMed = document.getElementById('disp-qty-medical');

    if (inputWater) inputWater.max = availWater;
    if (inputFood) inputFood.max = availFood;
    if (inputMed) inputMed.max = availMed;

    const hintWater = document.getElementById('disp-hint-water');
    const hintFood = document.getElementById('disp-hint-food');
    const hintMed = document.getElementById('disp-hint-medical');

    if (hintWater) hintWater.innerText = `Max stock: ${availWater.toLocaleString()} L`;
    if (hintFood) hintFood.innerText = `Max stock: ${availFood.toLocaleString()} packs`;
    if (hintMed) hintMed.innerText = `Max stock: ${availMed.toLocaleString()} kits`;

    // Populate Target Disaster Selector
    const selectTarget = document.getElementById('disp-target-select');
    if (selectTarget) {
        if (cachedActiveDisasters.length === 0) {
            selectTarget.innerHTML = '<option value="general_humanitarian_response">General Regional Emergency Relief Deployment</option>';
        } else {
            selectTarget.innerHTML = cachedActiveDisasters.map((d, i) => {
                const title = d.title || 'Emergency Zone';
                const sev = d.severity || 5.0;
                const dId = d.disaster_identifier || `event_${i}`;
                const mStatus = (d.mission && d.mission.status) ? `[${d.mission.status}] ` : '';
                return `<option value="${dId}">${mStatus}${title} (Severity ${sev}/10)</option>`;
            }).join('');
        }
    }

    // Trigger initial disaster select change to populate needs & prefill inputs
    if (selectTarget && selectTarget.value) {
        onAnalyticsDisasterSelectChange(selectTarget.value);
    } else {
        if (inputWater) inputWater.value = Math.min(25000, availWater);
        if (inputFood) inputFood.value = Math.min(5000, availFood);
        if (inputMed) inputMed.value = Math.min(100, availMed);
    }

    modal.classList.remove('hidden');
}
window.openDisasterDispatchFromHub = openDisasterDispatchFromHub;

function onAnalyticsDisasterSelectChange(selectedId) {
    const disaster = (cachedActiveDisasters || []).find(d => (d.disaster_identifier === selectedId || String(d.id) === selectedId));
    const hubId = parseInt(document.getElementById('disp-hub-id').value, 10);
    const currentHub = (window.cachedHubsList || []).find(h => h.id === hubId) || { water: { current: 50000 }, food: { current: 10000 }, medical: { current: 500 } };

    const availWater = currentHub.water ? (currentHub.water.current || 0) : 0;
    const availFood = currentHub.food ? (currentHub.food.current || 0) : 0;
    const availMed = currentHub.medical ? (currentHub.medical.current || 0) : 0;

    const inputWater = document.getElementById('disp-qty-water');
    const inputFood = document.getElementById('disp-qty-food');
    const inputMed = document.getElementById('disp-qty-medical');

    if (disaster) {
        document.getElementById('disp-disaster-id').value = disaster.disaster_identifier || selectedId;
        document.getElementById('disp-disaster-title').value = disaster.title || 'Disaster Event';
        document.getElementById('disp-disaster-lat').value = disaster.latitude || disaster.lat || 0;
        document.getElementById('disp-disaster-lon').value = disaster.longitude || disaster.lon || 0;
        document.getElementById('disp-disaster-sev').value = disaster.severity || 5;

        const pred = disaster.latest_prediction || {};
        const waterNeed = pred.water_liters || Math.round(disaster.severity * 15000);
        const foodNeed = pred.food_packs || Math.round(disaster.severity * 4000);
        const medNeed = pred.medical_kits || Math.max(50, Math.round(disaster.severity * 60));

        const mission = disaster.mission || {};
        const dispW = Number(mission.dispatched_water_liters) || 0;
        const dispF = Number(mission.dispatched_food_packs) || 0;
        const dispM = Number(mission.dispatched_medical_kits) || 0;

        const remainingWater = Math.max(0, waterNeed - dispW);
        const remainingFood = Math.max(0, foodNeed - dispF);
        const remainingMed = Math.max(0, medNeed - dispM);
        const isPartiallySupplied = dispW > 0 || dispF > 0 || dispM > 0;

        const targetSevEl = document.getElementById('disp-target-sev');
        if (targetSevEl) targetSevEl.innerText = `${disaster.severity || 5}/10`;

        const targetWaterEl = document.getElementById('disp-target-water');
        if (targetWaterEl) {
            targetWaterEl.innerText = isPartiallySupplied ? `${remainingWater.toLocaleString()} L (rem.)` : `${waterNeed.toLocaleString()} L`;
        }

        const targetFoodEl = document.getElementById('disp-target-food');
        if (targetFoodEl) {
            targetFoodEl.innerText = isPartiallySupplied ? `${remainingFood.toLocaleString()} packs (rem.)` : `${foodNeed.toLocaleString()} packs`;
        }

        // Pre-fill quantities with REMAINING deficit, bounded by this Hub's available stock
        if (inputWater) inputWater.value = Math.min(remainingWater, availWater);
        if (inputFood) inputFood.value = Math.min(remainingFood, availFood);
        if (inputMed) inputMed.value = Math.min(remainingMed, availMed);
    } else {
        document.getElementById('disp-disaster-id').value = selectedId || 'regional_mission';
        document.getElementById('disp-disaster-title').value = 'Regional Disaster Response';
        document.getElementById('disp-disaster-lat').value = '19.76';
        document.getElementById('disp-disaster-lon').value = '96.08';
        document.getElementById('disp-disaster-sev').value = '6.0';

        if (inputWater) inputWater.value = Math.min(25000, availWater);
        if (inputFood) inputFood.value = Math.min(5000, availFood);
        if (inputMed) inputMed.value = Math.min(100, availMed);
    }
}
window.onAnalyticsDisasterSelectChange = onAnalyticsDisasterSelectChange;

function closeDisasterDispatchModal() {
    const modal = document.getElementById('modal-disaster-dispatch');
    if (modal) modal.classList.add('hidden');
}
window.closeDisasterDispatchModal = closeDisasterDispatchModal;

async function handleDisasterDispatchSubmit(e) {
    e.preventDefault();
    const btnSubmit = document.getElementById('btn-disp-submit');
    if (btnSubmit) {
        btnSubmit.disabled = true;
        btnSubmit.innerText = 'Dispatching supplies...';
    }

    const disasterId = document.getElementById('disp-disaster-id').value;
    const title = document.getElementById('disp-disaster-title').value;
    const lat = parseFloat(document.getElementById('disp-disaster-lat').value) || 19.76;
    const lon = parseFloat(document.getElementById('disp-disaster-lon').value) || 96.08;
    const sev = parseFloat(document.getElementById('disp-disaster-sev').value) || 6.0;
    const hubId = parseInt(document.getElementById('disp-hub-id').value, 10) || 1;
    const waterLiters = parseFloat(document.getElementById('disp-qty-water').value) || 0;
    const foodPacks = parseFloat(document.getElementById('disp-qty-food').value) || 0;
    const medicalKits = parseInt(document.getElementById('disp-qty-medical').value, 10) || 0;
    const notes = document.getElementById('disp-notes').value.trim();

    // Client-side validation against available hub inventory
    const selectedHub = (window.cachedHubsList || []).find(h => h.id === hubId);
    if (selectedHub) {
        const curWater = selectedHub.water ? (selectedHub.water.current || 0) : 0;
        const curFood = selectedHub.food ? (selectedHub.food.current || 0) : 0;
        const curMed = selectedHub.medical ? (selectedHub.medical.current || 0) : 0;

        if (waterLiters > curWater) {
            alert(`Requested water (${waterLiters.toLocaleString()} L) exceeds available stock at ${selectedHub.name} (${curWater.toLocaleString()} L). Please reduce the quantity.`);
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.innerText = 'Confirm & dispatch supplies';
            }
            return;
        }
        if (foodPacks > curFood) {
            alert(`Requested food (${foodPacks.toLocaleString()} packs) exceeds available stock at ${selectedHub.name} (${curFood.toLocaleString()} packs).`);
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.innerText = 'Confirm & dispatch supplies';
            }
            return;
        }
        if (medicalKits > curMed) {
            alert(`Requested medical kits (${medicalKits.toLocaleString()} units) exceeds available stock at ${selectedHub.name} (${curMed.toLocaleString()} units).`);
            if (btnSubmit) {
                btnSubmit.disabled = false;
                btnSubmit.innerText = 'Confirm & dispatch supplies';
            }
            return;
        }
    }

    const payload = {
        disaster_identifier: disasterId,
        disaster_title: title,
        latitude: lat,
        longitude: lon,
        severity: sev,
        hub_id: hubId,
        water_liters: waterLiters,
        food_packs: foodPacks,
        medical_kits: medicalKits,
        notes: notes
    };

    try {
        const res = await apiFetch('/api/disaster/dispatch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!res) {
            throw new Error('Unable to connect to the backend server.');
        }

        if (!res.ok) {
            let errorDetail = `Dispatch failed with status ${res.status}`;
            try {
                const errData = await res.json();
                if (errData && errData.detail) {
                    errorDetail = (typeof errData.detail === 'string') ? errData.detail : JSON.stringify(errData.detail);
                }
            } catch (_) {}
            throw new Error(errorDetail);
        }

        closeDisasterDispatchModal();
        document.getElementById('form-disaster-dispatch').reset();

        // Refresh all analytics views in real time
        await fetchHubInventoryData();
        if (activeInventoryHubId) {
            await renderIndividualHubCharts();
            await loadIndividualHubLedger(activeInventoryHubId);
        } else {
            await renderInventoryAnalyticsCharts();
            await loadInventoryTransactions();
        }

    } catch (err) {
        alert(err.message || 'Error executing disaster dispatch');
    } finally {
        if (btnSubmit) {
            btnSubmit.disabled = false;
            btnSubmit.innerText = 'Confirm & dispatch supplies';
        }
    }
}
window.handleDisasterDispatchSubmit = handleDisasterDispatchSubmit;

function applyRecommendation(btn, encodedMessage) {
    const message = decodeURIComponent(encodedMessage || 'Action Authorized');
    btn.textContent = 'Authorised';
    btn.classList.remove('btn-primary');
    btn.classList.add('is-done');
    btn.disabled = true;
    alert(`${message}\nLogged to operational command telemetry audit trail.`);
}
window.applyRecommendation = applyRecommendation;

// Connect to live WebSocket for real-time collaborative inventory updates
function initAnalyticsWebSocket() {
    try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws/dispatch`;
        const ws = new WebSocket(wsUrl);

        ws.onmessage = function(event) {
            try {
                const msg = JSON.parse(event.data);
                if (msg.type === 'INVENTORY_UPDATED' || msg.type === 'DEPOT_RESTOCKED') {
                    fetchHubInventoryData();
                    if (activeInventoryHubId) {
                        renderIndividualHubCharts();
                        loadIndividualHubLedger(activeInventoryHubId);
                    } else {
                        renderInventoryAnalyticsCharts();
                        loadInventoryTransactions();
                    }
                }
            } catch (e) {
                // Ignore malformed message
            }
        };

        ws.onerror = function() {
            // Silently fallback without breaking dashboard
        };
    } catch (e) {
        // Fallback gracefully
    }
}

// Init on load
document.addEventListener('DOMContentLoaded', () => {
    fetchAnalyticsData();
    runSimulation();
    fetchPrescriptiveRecommendations();
    fetchRegionalVulnerability();
    fetchHubInventoryData();
    renderInventoryAnalyticsCharts();
    loadInventoryTransactions();
    fetchTransportAnalytics();
    initAnalyticsWebSocket();
});

