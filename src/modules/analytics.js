const EMOTIONS = [
  { key: "happy", label: "Happy", color: "#10b981" },
  { key: "neutral", label: "Neutral", color: "#38bdf8" },
  { key: "surprised", label: "Surprised", color: "#f59e0b" },
  { key: "sad", label: "Sad", color: "#818cf8" },
  { key: "angry", label: "Angry", color: "#f43f5e" },
  { key: "fearful", label: "Fearful", color: "#c084fc" },
  { key: "disgusted", label: "Disgusted", color: "#84cc16" },
];

function projectPoint(pt, width, mirrored) {
  return { x: mirrored ? width - pt.x : pt.x, y: pt.y };
}

function projectBox(box, width, mirrored) {
  return {
    x: mirrored ? width - box.x - box.width : box.x,
    y: box.y,
    width: box.width,
    height: box.height,
  };
}

function meanPoint(pts) {
  const sum = pts.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
  return { x: sum.x / pts.length, y: sum.y / pts.length };
}

export function createAnalyticsModule() {
  const boxToggle = document.getElementById("analyticsBoxToggle");
  const landmarksToggle = document.getElementById("analyticsLandmarksToggle");
  const labelsToggle = document.getElementById("analyticsLabelsToggle");
  const dominantEl = document.getElementById("dominantEmotionVal");
  const headRollEl = document.getElementById("headRollVal");
  const barsContainer = document.getElementById("emotionBars");
  const chartCanvas = document.getElementById("emotionChart");
  const chartCtx = chartCanvas.getContext("2d");

  const history = [];
  const MAX_HISTORY = 60;

  // Build emotion bar DOM once
  const barRefs = new Map();
  barsContainer.innerHTML = "";
  for (const em of EMOTIONS) {
    const row = document.createElement("div");
    row.className = "emotion-row";

    const name = document.createElement("span");
    name.textContent = em.label;

    const track = document.createElement("div");
    track.className = "emotion-track";
    const fill = document.createElement("div");
    fill.className = "emotion-fill";
    fill.style.background = em.color;
    fill.style.width = "0%";
    track.appendChild(fill);

    const pct = document.createElement("span");
    pct.className = "mono";
    pct.style.textAlign = "right";
    pct.textContent = "0%";

    row.append(name, track, pct);
    barsContainer.appendChild(row);
    barRefs.set(em.key, { fill, pct });
  }

  function drawTimeline() {
    const w = chartCanvas.width;
    const h = chartCanvas.height;
    chartCtx.clearRect(0, 0, w, h);

    // Subtle horizontal grid
    chartCtx.strokeStyle = "rgba(148, 163, 184, 0.14)";
    chartCtx.lineWidth = 1;
    for (let i = 1; i <= 3; i++) {
      const y = (h / 4) * i;
      chartCtx.beginPath();
      chartCtx.moveTo(0, y);
      chartCtx.lineTo(w, y);
      chartCtx.stroke();
    }

    if (history.length < 2) return;

    const tracked = EMOTIONS.slice(0, 4); // Happy, Neutral, Surprised, Sad
    for (const em of tracked) {
      chartCtx.beginPath();
      chartCtx.strokeStyle = em.color;
      chartCtx.lineWidth = 2;

      history.forEach((sample, idx) => {
        const x = (idx / (MAX_HISTORY - 1)) * w;
        const val = sample[em.key] || 0;
        const y = h - 8 - val * (h - 16);
        if (idx === 0) chartCtx.moveTo(x, y);
        else chartCtx.lineTo(x, y);
      });
      chartCtx.stroke();
    }
  }

  return {
    needsDescriptors: () => false,
    render({ ctx, width, mirrored, detections }) {
      if (detections.length === 0) {
        dominantEl.textContent = "—";
        headRollEl.textContent = "—";
        return;
      }

      // Draw overlays for every detected face
      for (const det of detections) {
        const box = projectBox(det.detection.box, width, mirrored);
        const expr = det.expressions || {};
        const sorted = Object.entries(expr).sort((a, b) => b[1] - a[1]);
        const [topName, topScore] = sorted[0] || ["neutral", 0];

        if (boxToggle.checked) {
          ctx.strokeStyle = "#14b8a6";
          ctx.lineWidth = 2;
          ctx.strokeRect(box.x, box.y, box.width, box.height);
        }

        if (landmarksToggle.checked && det.landmarks) {
          const pts = det.landmarks.positions.map((p) =>
            projectPoint(p, width, mirrored)
          );
          ctx.fillStyle = "#38bdf8";
          for (const p of pts) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
            ctx.fill();
          }
        }

        if (labelsToggle.checked) {
          const text = `${topName} ${(topScore * 100).toFixed(0)}%`;
          ctx.font = "600 13px Inter, sans-serif";
          const tw = ctx.measureText(text).width;
          const by = Math.max(0, box.y - 24);
          ctx.fillStyle = "#14b8a6";
          ctx.fillRect(box.x, by, tw + 14, 24);
          ctx.fillStyle = "#04131c";
          ctx.fillText(text, box.x + 7, by + 16);
        }
      }

      // Update sidebar metrics from primary (largest) face
      const primary = [...detections].sort(
        (a, b) =>
          b.detection.box.width * b.detection.box.height -
          a.detection.box.width * a.detection.box.height
      )[0];

      const expr = primary.expressions || {};
      const sorted = Object.entries(expr).sort((a, b) => b[1] - a[1]);
      if (sorted[0]) {
        dominantEl.textContent = `${sorted[0][0]} (${Math.round(sorted[0][1] * 100)}%)`;
      }

      // Estimate head roll angle from eye centers
      if (primary.landmarks) {
        const leftEye = meanPoint(primary.landmarks.getLeftEye());
        const rightEye = meanPoint(primary.landmarks.getRightEye());
        const angleDeg =
          (Math.atan2(rightEye.y - leftEye.y, rightEye.x - leftEye.x) * 180) /
          Math.PI;
        headRollEl.textContent = `${angleDeg >= 0 ? "+" : ""}${angleDeg.toFixed(1)}°`;
      }

      for (const em of EMOTIONS) {
        const val = expr[em.key] || 0;
        const ref = barRefs.get(em.key);
        if (ref) {
          ref.fill.style.width = `${(val * 100).toFixed(1)}%`;
          ref.pct.textContent = `${Math.round(val * 100)}%`;
        }
      }

      history.push({ ...expr });
      if (history.length > MAX_HISTORY) history.shift();
      drawTimeline();
    },
  };
}
