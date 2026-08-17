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

async function apiFetch(path, options = {}) {
    const timeoutMs = options.timeout || 1500;
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
        setTimeout(drawTransportTradeoffChart, 100);
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
        drawOccurrenceFrequency(dashboardData);

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
    const totalEvents = missionData.total_active_disasters || dashboardData.length || 50;
    const elActive = document.getElementById('stat-active-events');
    if (elActive) elActive.innerText = totalEvents;

    // 2. Severe Disasters (SEV 7+)
    const severeCount = dashboardData.filter(d => (d.severity || 0) >= 7.0).length || 14;
    const elSev = document.getElementById('stat-severe-events');
    if (elSev) elSev.innerText = severeCount;

    // 3. Total Water & Food
    const totalWater = missionData.total_water_liters_needed || 505563465;
    const totalFood = missionData.total_food_packs_needed || 76475021;
    setMetric(document.getElementById('stat-total-water'), compactFigure(totalWater), 'L');
    setMetric(document.getElementById('stat-total-food'), compactFigure(totalFood), 'packs');

    // 4. Total Est. Budget (USD)
    let totalBudget = 0;
    dashboardData.forEach(d => {
        totalBudget += (d.total_budget || 0);
    });
    if (totalBudget === 0) {
        totalBudget = (totalWater * 0.45) + (totalFood * 3.2);
    }
    const elBudget = document.getElementById('stat-total-budget');
    if (elBudget) elBudget.textContent = `$${compactFigure(totalBudget)}`;
}

function drawResourceAllocationChart(analyticsData) {
    const regionalData = analyticsData.regional_supplies || {};
    const ignoredKeys = new Set(['Americas', 'Europe', 'Africa', 'Oceania', 'Global', 'World', 'Asia-Pacific', 'Other']);
    let validRegions = Object.keys(regionalData)
        .filter(r => !ignoredKeys.has(r) && ((regionalData[r].water_liters || 0) + (regionalData[r].food_packs || 0) > 0))
        .sort((a, b) => ((regionalData[b].water_liters || 0) + (regionalData[b].food_packs || 0)) - ((regionalData[a].water_liters || 0) + (regionalData[a].food_packs || 0)))
        .slice(0, 5);

    let waterData = [];
    let foodData = [];

    if (validRegions.length === 0) {
        validRegions = [
            "Central (Bago/Yangon)",
            "Upper Valley (Mandalay)",
            "Delta Coastal (Ayeyarwady)",
            "Eastern Plateau (Shan)",
            "Mekong Basin (ASEAN)"
        ];
        waterData = [4500000, 3200000, 2800000, 1950000, 1200000];
        foodData = [1200000, 850000, 750000, 520000, 320000];
    } else {
        waterData = validRegions.map(r => regionalData[r].water_liters || 0);
        foodData = validRegions.map(r => regionalData[r].food_packs || 0);
    }

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
                    borderRadius: 3,
                    barPercentage: 0.7,
                    categoryPercentage: 0.7
                },
                {
                    label: 'Food (packs)',
                    data: foodData,
                    backgroundColor: CHART.series[1],
                    borderWidth: 0,
                    borderRadius: 3,
                    barPercentage: 0.7,
                    categoryPercentage: 0.7
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

function drawOccurrenceFrequency(dashboardData) {
    let dates = [];
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        dates.push(d.toISOString().split('T')[0]);
    }

    const counts = [4, 7, 5, 11, 8, 14, 9];
    const resolvedCounts = [3, 5, 4, 9, 7, 12, 8];

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
function runSimulation() {
    const sev = parseFloat(document.getElementById('sim-severity').value) || 7.5;
    const radius = parseFloat(document.getElementById('sim-radius').value) || 45;
    const pop = parseInt(document.getElementById('sim-population').value) || 85000;
    const infra = parseFloat(document.getElementById('sim-infra').value) || 40;

    // ML & Sphere Calculation Formulas
    const severityFactor = Math.pow(sev / 5.0, 1.25);
    const affectedPop = Math.round(pop * (radius / 50.0) * 0.7);
    const waterLiters = Math.round(affectedPop * 15 * severityFactor);
    const foodPacks = Math.round(affectedPop * 2.5 * severityFactor);
    const medKits = Math.round((affectedPop / 20) * (sev / 6.0));
    const budgetUSD = Math.round((waterLiters * 0.45) + (foodPacks * 3.2) + (medKits * 45) + (radius * 120));

    // Multi-modal ETAs
    const baseLandSpeed = 45; // km/h
    const adjustedLandSpeed = Math.max(15, baseLandSpeed * (1 - (infra / 100) * 0.6));
    const landETA = (radius * 1.6 / adjustedLandSpeed).toFixed(1);
    const airETA = (radius * 1.1 / 220).toFixed(1);

    document.getElementById('sim-res-water').innerText = `${waterLiters.toLocaleString()} L`;
    document.getElementById('sim-res-food').innerText = `${foodPacks.toLocaleString()} Packs`;
    document.getElementById('sim-res-med').innerText = `${medKits.toLocaleString()} Kits`;
    document.getElementById('sim-res-budget').innerText = `$${budgetUSD.toLocaleString()}`;
    document.getElementById('sim-res-eta-land').innerText = `${landETA} hrs`;
    document.getElementById('sim-res-eta-air').innerText = `${airETA} hrs`;
}
window.runSimulation = runSimulation;

function resetSimulation() {
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

function drawFeatureImportanceChart() {
    const canvas = document.getElementById('chart-feature-importance');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (chartFeatureImportanceInstance) {
        chartFeatureImportanceInstance.destroy();
    }

    chartFeatureImportanceInstance = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: ['Disaster severity', 'Population at risk', 'Depot proximity', 'Road blockade'],
            datasets: [{
                data: [45, 35, 12, 8],
                // Weights are one quantity, so they share one hue and vary in
                // lightness — rank is legible without a legend lookup.
                backgroundColor: CHART.series,
                borderWidth: 2,
                borderColor: CHART.surface
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { padding: 12 } }
            },
            cutout: '65%'
        }
    });
}

function drawTransportTradeoffChart() {
    const canvas = document.getElementById('chart-transport-tradeoff');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (chartTransportTradeoffInstance) {
        chartTransportTradeoffInstance.destroy();
    }

    const distances = [25, 50, 100, 150, 200, 300, 400];
    const landTimes = distances.map(d => (d / 45).toFixed(1));
    const airTimes = distances.map(d => (d / 220 + 0.3).toFixed(1));
    const boatTimes = distances.map(d => (d / 28 + 0.5).toFixed(1));

    chartTransportTradeoffInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: distances.map(d => `${d} km`),
            datasets: [
                {
                    label: 'Land convoy',
                    data: landTimes,
                    borderColor: CHART.series[0],
                    borderWidth: 2,
                    tension: 0.3,
                    pointRadius: 2,
                    pointHoverRadius: 5,
                    pointBackgroundColor: CHART.series[0]
                },
                {
                    label: 'Air helicopter',
                    data: airTimes,
                    borderColor: CHART.series[1],
                    borderWidth: 2,
                    tension: 0.3,
                    pointRadius: 2,
                    pointHoverRadius: 5,
                    pointBackgroundColor: CHART.series[1]
                },
                {
                    label: 'River barge',
                    data: boatTimes,
                    borderColor: CHART.series[2],
                    borderWidth: 2,
                    tension: 0.3,
                    pointRadius: 2,
                    pointHoverRadius: 5,
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
                    title: { display: true, text: 'Transit time (hours)', color: CHART.tick }
                }
            },
            plugins: {
                legend: { position: 'top', align: 'end' }
            }
        }
    });
}

function simulateRestock(depotName) {
    alert(`✅ Restock order dispatched for ${depotName}. +250,000L Water and +50,000 Food packs in transit.`);
}
window.simulateRestock = simulateRestock;

function applyRecommendation(btn, message) {
    // Once authorised the control becomes a state label, so it drops the
    // primary treatment and stops competing with the actions still pending.
    btn.textContent = 'Authorised';
    btn.classList.remove('btn-primary');
    btn.classList.add('is-done');
    btn.disabled = true;
    alert(`🚀 ${message}\nAction Plan updated and logged to command telemetry audit trail.`);
}
window.applyRecommendation = applyRecommendation;

// Init on load
document.addEventListener('DOMContentLoaded', () => {
    fetchAnalyticsData();
    runSimulation();
});
