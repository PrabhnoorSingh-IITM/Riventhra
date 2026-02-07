// dashboard.js — initializes Firebase, registers realtime listeners, updates UI, and draws charts
(function(){
  // Utility helpers
  function $(sel){ return document.querySelector(sel) }
  function setText(sel, txt){ const el=$(sel); if(el) el.textContent = txt }

  // Initialize Firebase (compat libs loaded in HTML)
  if(!window.FIREBASE_CONFIG || window.FIREBASE_CONFIG.apiKey === 'REPLACE_ME'){
    console.warn('Firebase config not set in /js/firebase-config.js. Please add your config to connect to Realtime DB.');
  }

  if(typeof firebase !== 'undefined' && firebase && !firebase.apps.length){
    firebase.initializeApp(window.FIREBASE_CONFIG);
  }

  // Chart instances
  let chartTemp, chartPH, chartTurb, healthChart;

  // datasets (simple in-memory arrays)
  const MAX_POINTS = 100;
  const dataTemp = [];
  const dataPH = [];
  const dataTurb = [];
  const labels = [];

  // DOM refs
  const lastUpdatedEl = $('#last-updated');

  function pushPoint(series, label, value){
    labels.push(label);
    series.push(value);
    if(labels.length>MAX_POINTS) labels.shift();
    if(series.length>MAX_POINTS) series.shift();
  }

  function formatTime(ts){
    const d = new Date(ts);
    return d.toLocaleTimeString();
  }

  // Create charts
  function initCharts(){
    const ctxT = document.getElementById('chart-temp').getContext('2d');
    chartTemp = new Chart(ctxT, {
      type: 'line',
      data: { labels: labels, datasets: [{ label:'Temperature (°C)', data: dataTemp, borderColor:'#FF6B6B', backgroundColor:'rgba(255,107,107,0.08)', tension:0.25 }]},
      options: { responsive:true, maintainAspectRatio:false }
    });

    const ctxP = document.getElementById('chart-ph').getContext('2d');
    chartPH = new Chart(ctxP, {
      type: 'line',
      data: { labels: labels, datasets: [{ label:'pH', data: dataPH, borderColor:'#4D7BFF', backgroundColor:'rgba(77,123,255,0.06)', tension:0.25 }]},
      options: { responsive:true, maintainAspectRatio:false }
    });

    const ctxTu = document.getElementById('chart-turb').getContext('2d');
    chartTurb = new Chart(ctxTu, {
      type: 'line',
      data: { labels: labels, datasets: [{ label:'Turbidity (NTU)', data: dataTurb, borderColor:'#FFA630', backgroundColor:'rgba(255,166,48,0.06)', tension:0.25 }]},
      options: { responsive:true, maintainAspectRatio:false }
    });

    // Health doughnut
    const ctxH = document.getElementById('healthChart').getContext('2d');
    healthChart = new Chart(ctxH, {
      type:'doughnut',
      data:{ labels:['Health','Remaining'], datasets:[{ data:[0,100], backgroundColor:['#2E7D32','#ECEFF1'], hoverOffset:4 }]},
      options:{ cutout:'70%', plugins:{legend:{display:false}} }
    });
  }

  // Status classification
  function classifyPH(v){
    if(v === null || v === undefined) return 'unknown';
    if(v < 6) return 'critical';
    if(v <= 8.5) return 'safe';
    return 'warning';
  }
  function classifyTurb(v){
    if(v === null || v === undefined) return 'unknown';
    if(v < 10) return 'safe';
    if(v < 50) return 'warning';
    return 'critical';
  }
  function classifyTemp(v){
    if(v === null || v === undefined) return 'unknown';
    if(v < 10) return 'warning';
    if(v <= 35) return 'safe';
    return 'warning';
  }

  function applyStatus(cardId, status){
    const card = document.getElementById(cardId);
    if(!card) return;
    card.classList.remove('status-safe','status-warning','status-critical');
    if(status==='safe') card.classList.add('status-safe');
    if(status==='warning') card.classList.add('status-warning');
    if(status==='critical') card.classList.add('status-critical');
    const txtEl = card.querySelector('.status');
    if(txtEl) txtEl.textContent = status.charAt(0).toUpperCase()+status.slice(1);
  }

  // Health score calculation (0-100)
  function computeHealth(pH, turb, temp){
    if(pH==null || turb==null || temp==null) return null;
    let score = 100;
    // pH: penalty by deviation from 7
    const pdev = Math.abs(pH-7);
    score -= Math.min(30, pdev * 8);
    // turbidity penalty
    score -= Math.min(40, (turb / 100) * 40);
    // temperature stress: ideal 15-25
    if(temp < 10) score -= 10;
    else if(temp > 35) score -= 20;
    else if(temp < 15 || temp > 30) score -= 5;
    score = Math.round(Math.max(0, Math.min(100, score)));
    return score;
  }

  function updateHealthUI(score){
    const valEl = $('#health-value');
    const textEl = $('#health-text');
    if(score==null){ if(valEl) valEl.textContent='--'; if(textEl) textEl.textContent='Unknown'; return }
    if(valEl) valEl.textContent = score;
    let state='unknown';
    if(score >= 70) state='Good';
    else if(score >=40) state='Moderate'; else state='Poor';
    if(textEl) textEl.textContent = state;
    // update doughnut
    healthChart.data.datasets[0].data[0] = score;
    healthChart.data.datasets[0].data[1] = 100-score;
    healthChart.update();
  }

  // Helpers to extract numeric value from firebase payload
  function extractLatestValue(snap){
    if(snap===null) return null;
    if(typeof snap === 'number' || typeof snap === 'string') return Number(snap);
    if(typeof snap === 'object'){
      // assume object of timestamped entries
      const keys = Object.keys(snap).sort();
      const last = snap[keys[keys.length-1]];
      if(typeof last === 'object' && last.value !== undefined) return Number(last.value);
      return Number(last);
    }
    return null;
  }

  // Update charts with new point
  function pushAndRefresh(ts, tVal, pVal, uVal){
    const label = formatTime(ts);
    pushPoint(dataTemp, label, tVal);
    pushPoint(dataPH, label, pVal);
    pushPoint(dataTurb, label, uVal);
    // set labels array for charts
    chartTemp.data.labels = labels.slice(); chartTemp.data.datasets[0].data = dataTemp.slice(); chartTemp.update();
    chartPH.data.labels = labels.slice(); chartPH.data.datasets[0].data = dataPH.slice(); chartPH.update();
    chartTurb.data.labels = labels.slice(); chartTurb.data.datasets[0].data = dataTurb.slice(); chartTurb.update();
  }

  function listenRealtime(){
    if(typeof firebase === 'undefined') return;
    const db = firebase.database();
    const basePath = '/Riventhra';
    const refs = {
      temp: db.ref(basePath + '/temperature'),
      ph: db.ref(basePath + '/pH'),
      turb: db.ref(basePath + '/turbidity')
    };

    let lastTs = Date.now();

    refs.temp.on('value', snap=>{
      const v = extractLatestValue(snap.val());
      const ts = Date.now();
      setText('#temp-value', isNaN(v)?'--':v.toFixed(2));
      applyStatus('card-temp', classifyTemp(v));
      setText('#last-updated', new Date(ts).toLocaleString());
      // push to series
      pushAndRefresh(ts, v, dataPH.length?dataPH[dataPH.length-1]:null, dataTurb.length?dataTurb[dataTurb.length-1]:null);
      const score = computeHealth(Number(v), Number(dataTurb[dataTurb.length-1]), Number(dataPH[dataPH.length-1]));
      updateHealthUI(score);
    });

    refs.ph.on('value', snap=>{
      const v = extractLatestValue(snap.val());
      const ts = Date.now();
      setText('#ph-value', isNaN(v)?'--':v.toFixed(2));
      applyStatus('card-ph', classifyPH(v));
      setText('#last-updated', new Date(ts).toLocaleString());
      pushAndRefresh(ts, dataTemp.length?dataTemp[dataTemp.length-1]:null, v, dataTurb.length?dataTurb[dataTurb.length-1]:null);
      const score = computeHealth(Number(dataPH[dataPH.length-1]), Number(dataTurb[dataTurb.length-1]), Number(dataTemp[dataTemp.length-1]));
      updateHealthUI(score);
    });

    refs.turb.on('value', snap=>{
      const v = extractLatestValue(snap.val());
      const ts = Date.now();
      setText('#turb-value', isNaN(v)?'--':v.toFixed(2));
      applyStatus('card-turb', classifyTurb(v));
      setText('#last-updated', new Date(ts).toLocaleString());
      pushAndRefresh(ts, dataTemp.length?dataTemp[dataTemp.length-1]:null, dataPH.length?dataPH[dataPH.length-1]:null, v);
      const score = computeHealth(Number(dataPH[dataPH.length-1]), Number(v), Number(dataTemp[dataTemp.length-1]));
      updateHealthUI(score);
    });
  }

  // Initialize UI
  window.addEventListener('DOMContentLoaded', ()=>{
    initCharts();
    listenRealtime();
  });

})();
// Dashboard - Live Sensor Data from Firebase Realtime Database
// Real-time updates with live graphs and sensor cards

// Chart variables
let sensorChart = null;
const maxDataPoints = 30; // Keep last 30 readings for graph
const chartData = {
  labels: [],
  temperature: [],
  ph: [],
  turbidity: [],
  dissolvedOxygen: [],
  salinity: []
};

// Store last values for card updates
const lastValues = {
  temperature: '--',
  ph: '--',
  turbidity: '--',
  dissolvedOxygen: '--',
  salinity: '--'
};

// Firebase reference
let db = null;
let sensorLatestRef = null;
let sensorHistoryRef = null;

// Initialize when document is loaded
window.addEventListener('load', function() {
  // Get Firebase reference from global initialization
  if (typeof firebase === 'undefined') {
    console.error('Firebase SDK not loaded');
    showError('Firebase SDK failed to load. Please refresh the page.');
    return;
  }
  
  // Get the database reference
  try {
    db = firebase.database();
    console.log('Firebase database initialized');
  } catch (error) {
    console.error('Firebase initialization error:', error);
    showError('Failed to connect to Firebase. Please check your connection.');
    return;
  }
  
  // Initialize chart and listeners
  initializeChart();
  initializeDashboard();
});

/**
 * Initialize Chart.js with multi-axis configuration
 */
function initializeChart() {
  const ctx = document.getElementById('sensor-chart');
  if (!ctx) {
    console.error('Chart canvas element not found');
    return;
  }

  sensorChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: chartData.labels,
      datasets: [
        {
          label: 'Temperature (°C)',
          data: chartData.temperature,
          borderColor: 'rgb(255, 99, 71)',
          backgroundColor: 'rgba(255, 99, 71, 0.2)',
          borderWidth: 3,
          pointRadius: 5,
          pointBackgroundColor: 'rgb(255, 99, 71)',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          tension: 0.4,
          yAxisID: 'y',
          fill: false
        },
        {
          label: 'pH Level',
          data: chartData.ph,
          borderColor: 'rgb(0, 255, 127)',
          backgroundColor: 'rgba(0, 255, 127, 0.2)',
          borderWidth: 3,
          pointRadius: 5,
          pointBackgroundColor: 'rgb(0, 255, 127)',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          tension: 0.4,
          yAxisID: 'y1',
          fill: false
        },
        {
          label: 'Turbidity (NTU)',
          data: chartData.turbidity,
          borderColor: 'rgb(0, 191, 255)',
          backgroundColor: 'rgba(0, 191, 255, 0.2)',
          borderWidth: 3,
          pointRadius: 5,
          pointBackgroundColor: 'rgb(0, 191, 255)',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          tension: 0.4,
          yAxisID: 'y2',
          fill: false
        },
        {
          label: 'Dissolved O₂ (mg/L)',
          data: chartData.dissolvedOxygen,
          borderColor: 'rgb(255, 0, 255)',
          backgroundColor: 'rgba(255, 0, 255, 0.2)',
          borderWidth: 3,
          pointRadius: 5,
          pointBackgroundColor: 'rgb(255, 0, 255)',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          tension: 0.4,
          yAxisID: 'y3',
          fill: false
        },
        {
          label: 'Salinity (PSU)',
          data: chartData.salinity,
          borderColor: 'rgb(255, 215, 0)',
          backgroundColor: 'rgba(255, 215, 0, 0.2)',
          borderWidth: 3,
          pointRadius: 5,
          pointBackgroundColor: 'rgb(255, 215, 0)',
          pointBorderColor: '#fff',
          pointBorderWidth: 2,
          tension: 0.4,
          yAxisID: 'y4',
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: '#ffffff',
            font: {
              size: 13,
              weight: '700'
            },
            padding: 20,
            usePointStyle: true,
            pointStyle: 'circle',
            boxWidth: 10,
            boxHeight: 10
          }
        },
        tooltip: {
          enabled: true,
          backgroundColor: 'rgba(0, 0, 0, 0.9)',
          titleColor: '#ffffff',
          bodyColor: '#ffffff',
          borderColor: 'rgba(255, 255, 255, 0.5)',
          borderWidth: 2,
          padding: 15,
          displayColors: true,
          titleFont: {
            size: 14,
            weight: 'bold'
          },
          bodyFont: {
            size: 13
          },
          callbacks: {
            label: function(context) {
              const value = context.parsed.y;
              return context.dataset.label + ': ' + (value !== null ? value.toFixed(2) : 'N/A');
            }
          }
        }
      },
      scales: {
        x: {
          display: true,
          grid: {
            color: 'rgba(255, 255, 255, 0.2)',
            drawBorder: true,
            borderColor: 'rgba(255, 255, 255, 0.3)'
          },
          ticks: {
            color: '#ffffff',
            font: {
              size: 11,
              weight: '600'
            }
          },
          title: {
            display: true,
            text: 'Time',
            color: '#ffffff',
            font: {
              size: 13,
              weight: 'bold'
            }
          }
        },
        y: {
          type: 'linear',
          display: true,
          position: 'left',
          grid: {
            color: 'rgba(255, 99, 71, 0.2)',
            drawBorder: true,
            borderColor: 'rgb(255, 99, 71)'
          },
          ticks: {
            color: 'rgb(255, 99, 71)',
            font: {
              size: 11,
              weight: '700'
            }
          },
          title: {
            display: true,
            text: 'Temperature (°C)',
            color: 'rgb(255, 99, 71)',
            font: {
              size: 12,
              weight: 'bold'
            }
          },
          min: 0,
          max: 50
        },
        y1: {
          type: 'linear',
          display: true,
          position: 'right',
          grid: {
            drawOnChartArea: false,
          },
          ticks: {
            color: 'rgb(0, 255, 127)',
            font: {
              size: 11,
              weight: '700'
            }
          },
          title: {
            display: true,
            text: 'pH',
            color: 'rgb(0, 255, 127)',
            font: {
              size: 12,
              weight: 'bold'
            }
          },
          min: 0,
          max: 14
        },
        y2: {
          type: 'linear',
          display: false,
          position: 'right',
          min: 0,
          max: 5000
        },
        y3: {
          type: 'linear',
          display: false,
          position: 'right',
          min: 0,
          max: 20
        },
        y4: {
          type: 'linear',
          display: false,
          position: 'right',
          min: 25,
          max: 40
        }
      }
    }
  });
  
  console.log('Chart initialized successfully');
}

/**
 * Initialize Firebase listeners for real-time data
 */
function initializeDashboard() {
  try {
    // Reference to BlueSentinel data (ESP32 uploads here)
    sensorLatestRef = db.ref('BlueSentinel');
    
    // Listen for real-time updates on sensor data
    sensorLatestRef.on('value', handleLatestData, handleError);
    
    console.log('Firebase listeners initialized');
  } catch (error) {
    console.error('Error initializing dashboard:', error);
    showError('Failed to initialize dashboard. Check Firebase connection.');
  }
}

/**
 * Handle latest sensor data update (updates cards and graph)
 */
function handleLatestData(snapshot) {
  const data = snapshot.val();
  
  if (data) {
    console.log('Latest data received:', data);
    
    // Add simulated data for Turbidity, Dissolved O2, and Salinity
    const enrichedData = {
      temperature: data.temperature,
      pH: data.pH,
      turbidity: generateSimulatedTurbidity(),
      dissolvedOxygen: generateSimulatedDO(),
      salinity: generateSimulatedSalinity(),
      timestamp: Date.now()
    };
    
    updateSensorCards(enrichedData);
    
    // Add to chart
    if (sensorChart) {
      addDataPointToChart(enrichedData);
    }
  } else {
    console.log('No sensor data available yet');
  }
}

/**
 * Generate simulated turbidity (0-10 NTU)
 */
function generateSimulatedTurbidity() {
  return (2.0 + Math.random() * 8).toFixed(2);
}

/**
 * Generate simulated Dissolved Oxygen (6-10 mg/L)
 */
function generateSimulatedDO() {
  return (6.0 + Math.random() * 4).toFixed(2);
}

/**
 * Generate simulated Salinity (30-37 PSU)
 */
function generateSimulatedSalinity() {
  return (30.0 + Math.random() * 7).toFixed(2);
}

/**
 * Handle historical data (for initial graph load)
 */
function handleHistoryData(snapshot) {
  const data = snapshot.val();
  
  if (data && sensorChart) {
    // Check if we already have this data point
    const timestamp = data.timestamp || Date.now();
    const timeLabel = formatTime(timestamp);
    
    if (!chartData.labels.includes(timeLabel)) {
      addDataPointToChart(data);
    }
  }
}

/**
 * Handle Firebase errors
 */
function handleError(error) {
  console.error('Firebase error:', error.code, error.message);
  showError('Firebase connection error: ' + error.message);
}

/**
 * Update sensor data cards with latest values
 */
function updateSensorCards(data) {
  // Update Temperature Card
  const tempElement = document.getElementById('temp-value');
  if (tempElement && data.temperature !== undefined) {
    const tempValue = parseFloat(data.temperature).toFixed(1);
    tempElement.textContent = tempValue;
    lastValues.temperature = tempValue;
  }
  
  // Update pH Card (ESP32 sends "pH" not "ph")
  const phElement = document.getElementById('ph-value');
  if (phElement && (data.pH !== undefined || data.ph !== undefined)) {
    const phValue = parseFloat(data.pH || data.ph).toFixed(2);
    phElement.textContent = phValue;
    lastValues.ph = phValue;
  }
  
  // Update Turbidity Card
  const turbidityElement = document.getElementById('turbidity-value');
  if (turbidityElement && data.turbidity !== undefined) {
    const turbidityValue = parseFloat(data.turbidity).toFixed(1);
    turbidityElement.textContent = turbidityValue;
    lastValues.turbidity = turbidityValue;
  }
  
  // Update Dissolved O2 Card
  const doElement = document.getElementById('do-value');
  if (doElement && data.dissolvedOxygen !== undefined) {
    const doValue = parseFloat(data.dissolvedOxygen).toFixed(2);
    doElement.textContent = doValue;
    lastValues.dissolvedOxygen = doValue;
  }
  
  // Update Salinity Card
  const salinityElement = document.getElementById('salinity-value');
  if (salinityElement && data.salinity !== undefined) {
    const salinityValue = parseFloat(data.salinity).toFixed(2);
    salinityElement.textContent = salinityValue;
    lastValues.salinity = salinityValue;
  }
  
  // Update last update time
  const timestamp = data.timestamp || Date.now();
  console.log('Cards updated at:', formatTime(timestamp));
}

/**
 * Add data point to chart (with max limit)
 */
function addDataPointToChart(data) {
  if (!sensorChart || !data.temperature) {
    return;
  }
  
  // Generate time label
  const timestamp = data.timestamp || Date.now();
  const timeLabel = formatTime(timestamp);
  
  // Check for duplicate
  if (chartData.labels.includes(timeLabel)) {
    return;
  }
  
  // Add new data point (ESP32 sends "pH" not "ph")
  chartData.labels.push(timeLabel);
  chartData.temperature.push(parseFloat(data.temperature) || 0);
  chartData.ph.push(parseFloat(data.pH || data.ph) || 0);
  chartData.turbidity.push(parseFloat(data.turbidity) || 0);
  chartData.dissolvedOxygen.push(parseFloat(data.dissolvedOxygen) || 0);
  chartData.salinity.push(parseFloat(data.salinity) || 0);
  
  // Limit data to maxDataPoints
  if (chartData.labels.length > maxDataPoints) {
    chartData.labels.shift();
    chartData.temperature.shift();
    chartData.ph.shift();
    chartData.turbidity.shift();
    chartData.dissolvedOxygen.shift();
    chartData.salinity.shift();
  }
  
  // Update chart without animation
  sensorChart.update('none');
  
  console.log('Graph point added:', timeLabel);
}

/**
 * Format timestamp to readable time string
 */
function formatTime(timestamp) {
  if (!timestamp) return new Date().toLocaleTimeString();
  
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

/**
 * Show error message on page
 */
function showError(message) {
  console.error(message);
  
  // Create or update error notification
  let errorDiv = document.getElementById('error-notification');
  if (!errorDiv) {
    errorDiv = document.createElement('div');
    errorDiv.id = 'error-notification';
    errorDiv.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: rgba(255, 59, 48, 0.9);
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      backdrop-filter: blur(10px);
      z-index: 1000;
      max-width: 300px;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    document.body.appendChild(errorDiv);
  }
  
  errorDiv.textContent = message;
  errorDiv.style.display = 'block';
  
  // Auto-hide after 5 seconds
  setTimeout(() => {
    if (errorDiv) {
      errorDiv.style.display = 'none';
    }
  }, 5000);
}

/**
 * Get live data summary
 */
function getLiveDataSummary() {
  return {
    temperature: lastValues.temperature,
    ph: lastValues.ph,
    turbidity: lastValues.turbidity,
    dissolvedOxygen: lastValues.dissolvedOxygen,
    lastUpdate: new Date().toLocaleString()
  };
}

/**
 * Export data (for future CSV/download feature)
 */
function exportChartData() {
  const dataPoints = [];
  
  for (let i = 0; i < chartData.labels.length; i++) {
    dataPoints.push({
      time: chartData.labels[i],
      temperature: chartData.temperature[i],
      ph: chartData.ph[i],
      turbidity: chartData.turbidity[i],
      dissolvedOxygen: chartData.dissolvedOxygen[i]
    });
  }
  
  return dataPoints;
}

// ========== EXPECTED FIREBASE DATABASE STRUCTURE ==========
/*
{
  "sensors": {
    "latest": {
      "temperature": 25.5,
      "ph": 7.2,
      "turbidity": 5.3,
      "dissolvedOxygen": 8.5,
      "timestamp": 1738454400000,
      "deviceId": "ESP32-001"
    },
    "history": {
      "-N1234567890": {
        "temperature": 25.0,
        "ph": 7.1,
        "turbidity": 5.0,
        "dissolvedOxygen": 8.3,
        "timestamp": 1738454300000,
        "deviceId": "ESP32-001"
      },
      "-N1234567891": {
        "temperature": 25.2,
        "ph": 7.15,
        "turbidity": 5.1,
        "dissolvedOxygen": 8.4,
        "timestamp": 1738454350000,
        "deviceId": "ESP32-001"
      }
      // ... more historical readings
    }
  }
}

FIREBASE RULES (copy to database.rules.json):
{
  "rules": {
    "sensors": {
      ".read": true,
      ".write": true,
      "latest": {
        ".indexOn": ["timestamp"]
      },
      "history": {
        ".indexOn": ["timestamp"]
      }
    }
  }
}
*/
