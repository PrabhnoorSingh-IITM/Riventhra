import { db } from "../firebase/config.js";
import { ref, onValue, query, limitToLast } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-database.js";
import { SensorCard } from "../components/sensorCard.js";
import { initCharts, updateChart } from "../charts/dashboardCharts.js";

const sensors = {
  temperature: {
    path: "/Riventhra/temperature",
    unit: "C",
    label: "Temperature"
  },
  ph: {
    path: "/Riventhra/pH",
    unit: "pH",
    label: "pH"
  },
  turbidity: {
    path: "/Riventhra/turbidity",
    unit: "NTU",
    label: "Turbidity"
  }
};

const cardInstances = {
  temperature: new SensorCard(document.querySelector("[data-sensor-card='temperature']")),
  ph: new SensorCard(document.querySelector("[data-sensor-card='ph']")),
  turbidity: new SensorCard(document.querySelector("[data-sensor-card='turbidity']"))
};

const charts = initCharts();
const lastUpdatedEl = document.querySelector("[data-last-updated]");
const healthRing = document.querySelector("[data-health-ring]");
const healthScoreEl = document.querySelector("[data-health-score]");
const healthStatusEl = document.querySelector("[data-health-status]");
const healthMetaEl = document.querySelector("[data-health-meta]");

const toDisplayTime = (ts) => {
  if (!ts) return "--";
  const date = new Date(ts);
  return date.toLocaleString();
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const getStatus = (type, value) => {
  if (value === null || Number.isNaN(value)) return "warning";
  if (type === "ph") {
    if (value < 6) return "critical";
    if (value <= 8.5) return "safe";
    return "warning";
  }
  if (type === "turbidity") {
    if (value < 10) return "safe";
    if (value <= 50) return "warning";
    return "critical";
  }
  if (type === "temperature") {
    if (value < 10) return "warning";
    if (value <= 35) return "safe";
    return "warning";
  }
  return "warning";
};

const parseSnapshot = (snapshotVal) => {
  if (snapshotVal === null || snapshotVal === undefined) {
    return { latest: null, points: [] };
  }

  if (typeof snapshotVal === "number") {
    return { latest: { value: snapshotVal, ts: Date.now() }, points: [] };
  }

  if (typeof snapshotVal === "object" && "value" in snapshotVal) {
    const ts = snapshotVal.ts ?? snapshotVal.timestamp ?? Date.now();
    return { latest: { value: snapshotVal.value, ts }, points: [{ value: snapshotVal.value, ts }] };
  }

  const entries = Object.values(snapshotVal)
    .map((entry) => ({
      value: entry?.value ?? entry?.val ?? entry,
      ts: entry?.ts ?? entry?.timestamp ?? entry?.time
    }))
    .filter((entry) => entry.value !== undefined && entry.value !== null);

  entries.sort((a, b) => (a.ts || 0) - (b.ts || 0));

  const latest = entries.length ? entries[entries.length - 1] : null;
  return { latest, points: entries };
};

const buildChartPoints = (entries) => {
  return entries
    .filter((entry) => entry.value !== undefined)
    .slice(-24)
    .map((entry) => ({
      label: entry.ts ? new Date(entry.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--",
      value: Number(entry.value)
    }));
};

const updateHealthScore = ({ ph, turbidity, temperature }) => {
  if ([ph, turbidity, temperature].some((val) => val === null || Number.isNaN(val))) {
    healthScoreEl.textContent = "--";
    healthStatusEl.textContent = "Awaiting data";
    healthMetaEl.textContent = "Live score updates when all sensors report.";
    healthRing.style.background = `conic-gradient(var(--border) 0deg, var(--border) 360deg)`;
    return;
  }

  const phScore = clamp(100 - Math.abs(ph - 7) * 20, 0, 100);
  const turbScore = clamp(100 - turbidity * 1.2, 0, 100);
  const tempScore = clamp(100 - Math.abs(temperature - 22.5) * 3, 0, 100);

  const score = Math.round(phScore * 0.4 + turbScore * 0.35 + tempScore * 0.25);
  const scoreColor = score >= 80 ? "var(--safe)" : score >= 50 ? "var(--warning)" : "var(--critical)";
  const statusLabel = score >= 80 ? "Healthy" : score >= 50 ? "Watch" : "Critical";

  healthScoreEl.textContent = score;
  healthStatusEl.textContent = `${statusLabel} River`;
  healthMetaEl.textContent = `pH ${ph.toFixed(2)}, Turbidity ${turbidity.toFixed(1)} NTU, Temp ${temperature.toFixed(1)} C`;
  healthRing.style.background = `conic-gradient(${scoreColor} ${score * 3.6}deg, var(--border) 0deg)`;
};

const sensorState = {
  temperature: null,
  ph: null,
  turbidity: null,
  latestTs: null
};

const updateTimestamp = (ts) => {
  if (!ts) return;
  sensorState.latestTs = Math.max(sensorState.latestTs || 0, ts);
  lastUpdatedEl.textContent = `Last updated ${toDisplayTime(sensorState.latestTs)}`;
};

const connectSensor = (key) => {
  const sensor = sensors[key];
  const baseRef = ref(db, sensor.path);
  const historyQuery = query(baseRef, limitToLast(48));

  onValue(historyQuery, (snapshot) => {
    const { latest, points } = parseSnapshot(snapshot.val());
    const value = latest ? Number(latest.value) : null;
    const statusKey = getStatus(key, value);

    cardInstances[key].update({
      value: value === null || Number.isNaN(value) ? "--" : value.toFixed(2),
      unit: sensor.unit,
      statusKey
    });

    sensorState[key] = value;
    updateHealthScore(sensorState);

    if (latest?.ts) updateTimestamp(latest.ts);

    const chartPoints = buildChartPoints(points);
    if (chartPoints.length) {
      updateChart(charts[key], chartPoints);
    }
  });
};

connectSensor("temperature");
connectSensor("ph");
connectSensor("turbidity");
