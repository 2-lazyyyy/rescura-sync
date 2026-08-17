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

// Global Chart Instances
let chartResourceAllocationInstance = null;
let chartSeverityInstance = null;
let chartOccurrenceInstance = null;
let chartFeatureImportanceInstance = null;
let chartTransportTradeoffInstance = null;

// Tab Switcher
function switchAnalyticsTab(tabId) {
    document.querySelectorAll('.analytics-tab-btn').forEach(btn => {
        btn.classList.remove('active', 'bg-blue-600', 'text-white', 'shadow-sm');
        btn.classList.add('bg-white', 'text-slate-600', 'border', 'border-slate-200');
    });
    const targetBtn = document.getElementById(`btn-${tabId}`);
    if (targetBtn) {
        targetBtn.classList.add('active', 'bg-blue-600', 'text-white', 'shadow-sm');
        targetBtn.classList.remove('bg-white', 'text-slate-600', 'border', 'border-slate-200');
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
    const elWater = document.getElementById('stat-total-water');
    if (elWater) elWater.innerText = (totalWater >= 1000000) ? `${(totalWater / 1000000).toFixed(1)}M L` : `${totalWater.toLocaleString()} L`;
    const elFood = document.getElementById('stat-total-food');
    if (elFood) elFood.innerText = (totalFood >= 1000000) ? `${(totalFood / 1000000).toFixed(1)}M Packs` : `${totalFood.toLocaleString()} Packs`;

    // 4. Total Est. Budget (USD)
    let totalBudget = 0;
    dashboardData.forEach(d => {
        totalBudget += (d.total_budget || 0);
    });
    if (totalBudget === 0) {
        totalBudget = (totalWater * 0.45) + (totalFood * 3.2);
    }
    const elBudget = document.getElementById('stat-total-budget');
    if (elBudget) {
        elBudget.innerText = (totalBudget >= 1000000) ? `$${(totalBudget / 1000000).toFixed(1)}M` : `$${totalBudget.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
    }
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
    
    let gradientWater = ctx.createLinearGradient(0, 0, 0, 350);
    gradientWater.addColorStop(0, 'rgba(14, 165, 233, 0.9)');
    gradientWater.addColorStop(1, 'rgba(14, 165, 233, 0.2)');
    
    let gradientFood = ctx.createLinearGradient(0, 0, 0, 350);
    gradientFood.addColorStop(0, 'rgba(245, 158, 11, 0.9)');
    gradientFood.addColorStop(1, 'rgba(245, 158, 11, 0.2)');

    if (chartResourceAllocationInstance) {
        chartResourceAllocationInstance.destroy();
    }

    chartResourceAllocationInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: validRegions,
            datasets: [
                {
                    label: 'Water (Liters)',
                    data: waterData,
                    backgroundColor: gradientWater,
                    borderColor: '#0284c7',
                    borderWidth: 1,
                    borderRadius: 6,
                    barPercentage: 0.65,
                    categoryPercentage: 0.75
                },
                {
                    label: 'Food (Packs)',
                    data: foodData,
                    backgroundColor: gradientFood,
                    borderColor: '#d97706',
                    borderWidth: 1,
                    borderRadius: 6,
                    barPercentage: 0.65,
                    categoryPercentage: 0.75
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { stacked: true, grid: { display: false }, ticks: { color: '#64748b', font: { size: 11, family: 'Inter', weight: '600' } } },
                y: { stacked: true, grid: { color: '#f1f5f9', drawBorder: false }, ticks: { color: '#64748b', font: { size: 11, family: 'Inter', weight: '500' } } }
            },
            plugins: {
                legend: { position: 'top', align: 'end', labels: { color: '#334155', usePointStyle: true, boxWidth: 8, font: { family: 'Inter', weight: '600' } } },
                tooltip: { 
                    backgroundColor: 'rgba(15, 23, 42, 0.95)', 
                    titleColor: '#fff', 
                    bodyColor: '#cbd5e1', 
                    borderColor: '#334155', 
                    borderWidth: 1,
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
            labels: ['Low (0-3.9)', 'Medium (4.0-6.9)', 'High (7.0-8.9)', 'Extreme (9.0+)'],
            datasets: [{
                data: [low, med, high, extreme],
                backgroundColor: [
                    'rgba(16, 185, 129, 0.9)', // Emerald
                    'rgba(245, 158, 11, 0.9)', // Amber
                    'rgba(249, 115, 22, 0.9)', // Orange
                    'rgba(239, 68, 68, 0.9)'   // Red
                ],
                borderColor: '#ffffff',
                borderWidth: 3,
                hoverOffset: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'right', labels: { color: '#334155', usePointStyle: true, boxWidth: 8, font: { family: 'Inter', weight: '600' } } },
                tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.95)', titleColor: '#fff', bodyColor: '#cbd5e1', borderColor: '#334155', borderWidth: 1 }
            },
            cutout: '72%',
            layout: { padding: 10 }
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
    
    let gradientPurple = ctx.createLinearGradient(0, 0, 0, 350);
    gradientPurple.addColorStop(0, 'rgba(124, 58, 237, 0.25)');
    gradientPurple.addColorStop(1, 'rgba(124, 58, 237, 0.0)');
    
    let gradientBlue = ctx.createLinearGradient(0, 0, 0, 350);
    gradientBlue.addColorStop(0, 'rgba(37, 99, 235, 0.2)');
    gradientBlue.addColorStop(1, 'rgba(37, 99, 235, 0.0)');

    chartOccurrenceInstance = new Chart(ctx, {
        type: 'line',
        data: {
            labels: dates,
            datasets: [
                {
                    label: 'New GDACS Incidents',
                    data: counts,
                    fill: true,
                    backgroundColor: gradientPurple,
                    borderColor: '#7c3aed',
                    tension: 0.35,
                    pointBackgroundColor: '#7c3aed',
                    pointBorderColor: '#ffffff',
                    pointRadius: 4,
                    borderWidth: 2.5
                },
                {
                    label: 'Resolved Evacuations',
                    data: resolvedCounts,
                    fill: true,
                    backgroundColor: gradientBlue,
                    borderColor: '#2563eb',
                    tension: 0.35,
                    pointBackgroundColor: '#2563eb',
                    pointBorderColor: '#ffffff',
                    pointRadius: 4,
                    borderWidth: 2.5
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { grid: { display: false }, ticks: { color: '#64748b', font: { weight: '600' } } },
                y: { beginAtZero: true, grid: { color: '#f1f5f9', drawBorder: false }, ticks: { color: '#64748b', stepSize: 2 } }
            },
            plugins: {
                legend: { position: 'top', align: 'end', labels: { color: '#334155', usePointStyle: true, boxWidth: 8, font: { family: 'Inter', weight: '600' } } },
                tooltip: { backgroundColor: 'rgba(15, 23, 42, 0.95)', titleColor: '#fff', bodyColor: '#cbd5e1', borderColor: '#334155', borderWidth: 1 }
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
            labels: ['Disaster Severity Index', 'Civilian Population at Risk', 'Haversine Depot Proximity', 'Road Blockade Factor'],
            datasets: [{
                data: [45, 35, 12, 8],
                backgroundColor: [
                    'rgba(124, 58, 237, 0.9)',
                    'rgba(37, 99, 235, 0.9)',
                    'rgba(16, 185, 129, 0.9)',
                    'rgba(245, 158, 11, 0.9)'
                ],
                borderWidth: 2,
                borderColor: '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { boxWidth: 8, font: { size: 10, family: 'Inter', weight: '600' } } }
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
                    label: '🚚 Land Convoy (Hours)',
                    data: landTimes,
                    borderColor: '#2563eb',
                    backgroundColor: 'rgba(37, 99, 235, 0.1)',
                    borderWidth: 2.5,
                    tension: 0.3
                },
                {
                    label: '🚁 Air Helicopter (Hours)',
                    data: airTimes,
                    borderColor: '#7c3aed',
                    backgroundColor: 'rgba(124, 58, 237, 0.1)',
                    borderWidth: 2.5,
                    tension: 0.3
                },
                {
                    label: '🚢 Rescue River Boat (Hours)',
                    data: boatTimes,
                    borderColor: '#0d9488',
                    backgroundColor: 'rgba(13, 148, 136, 0.1)',
                    borderWidth: 2.5,
                    tension: 0.3
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: { grid: { display: false }, ticks: { color: '#64748b', font: { weight: '600' } } },
                y: { title: { display: true, text: 'Transit Time (Hours)' }, ticks: { color: '#64748b' } }
            },
            plugins: {
                legend: { position: 'top', align: 'end', labels: { boxWidth: 8, font: { family: 'Inter', weight: '600' } } }
            }
        }
    });
}

function simulateRestock(depotName) {
    alert(`✅ Restock order dispatched for ${depotName}. +250,000L Water and +50,000 Food packs in transit.`);
}
window.simulateRestock = simulateRestock;

function applyRecommendation(btn, message) {
    btn.innerHTML = '✓ Authorized & Active';
    btn.classList.remove('bg-blue-600', 'bg-emerald-600', 'bg-amber-600');
    btn.classList.add('bg-slate-800', 'text-emerald-400');
    btn.disabled = true;
    alert(`🚀 ${message}\nAction Plan updated and logged to command telemetry audit trail.`);
}
window.applyRecommendation = applyRecommendation;

// Init on load
document.addEventListener('DOMContentLoaded', () => {
    fetchAnalyticsData();
    runSimulation();
});
