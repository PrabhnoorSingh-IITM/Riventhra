const statusMap = {
  safe: { label: "Safe", className: "status-safe" },
  warning: { label: "Warning", className: "status-warning" },
  critical: { label: "Critical", className: "status-critical" }
};

export class SensorCard {
  constructor(root) {
    this.root = root;
    this.valueEl = root.querySelector("[data-sensor-value]");
    this.unitEl = root.querySelector("[data-sensor-unit]");
    this.statusEl = root.querySelector("[data-sensor-status]");
  }

  update({ value, unit, statusKey }) {
    const status = statusMap[statusKey] || statusMap.warning;
    this.valueEl.textContent = value ?? "--";
    this.unitEl.textContent = unit;
    this.statusEl.textContent = status.label;
    this.root.classList.remove("status-safe", "status-warning", "status-critical");
    this.root.classList.add(status.className);
  }
}
