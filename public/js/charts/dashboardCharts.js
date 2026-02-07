const buildChart = (ctx, label, color) => {
  const gradient = ctx.createLinearGradient(0, 0, 0, 220);
  gradient.addColorStop(0, "rgba(49, 51, 133, 0.35)");
  gradient.addColorStop(1, "rgba(49, 51, 133, 0)");

  return new Chart(ctx, {
    type: "line",
    data: {
      labels: [],
      datasets: [
        {
          label,
          data: [],
          borderColor: color,
          backgroundColor: gradient,
          fill: true,
          tension: 0.35,
          pointRadius: 2,
          pointBackgroundColor: color
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false }
      },
      scales: {
        x: {
          ticks: { color: "#5F6770" },
          grid: { display: false }
        },
        y: {
          ticks: { color: "#5F6770" },
          grid: { color: "rgba(194, 203, 212, 0.4)" }
        }
      }
    }
  });
};

export const initCharts = () => {
  const tempCtx = document.getElementById("tempChart").getContext("2d");
  const phCtx = document.getElementById("phChart").getContext("2d");
  const turbCtx = document.getElementById("turbChart").getContext("2d");

  return {
    temperature: buildChart(tempCtx, "Temperature", "#191970"),
    ph: buildChart(phCtx, "pH", "#313385"),
    turbidity: buildChart(turbCtx, "Turbidity", "#191970")
  };
};

export const updateChart = (chart, points) => {
  chart.data.labels = points.map((point) => point.label);
  chart.data.datasets[0].data = points.map((point) => point.value);
  chart.update();
};
