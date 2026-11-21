function projectBox(box, width, mirrored) {
  return {
    x: mirrored ? width - box.x - box.width : box.x,
    y: box.y,
    width: box.width,
    height: box.height,
  };
}

function projectPoint(pt, width, mirrored) {
  return {
    x: mirrored ? width - pt.x : pt.x,
    y: pt.y,
  };
}

export function createAnonymizerModule({ getMatcher, getStageCanvas }) {
  let style = "blur";
  let strength = 24;
  let whitelistEnrolled = false;
  let showLabels = true;

  const tempCanvas = document.createElement("canvas");
  const tempCtx = tempCanvas.getContext("2d");

  const strengthInput = document.getElementById("anonStrengthInput");
  const strengthVal = document.getElementById("anonStrengthVal");
  const whitelistToggle = document.getElementById("anonWhitelistToggle");
  const showLabelToggle = document.getElementById("anonShowLabelToggle");
  const downloadBtn = document.getElementById("downloadAnonBtn");
  const statsText = document.getElementById("anonStatsText");

  document.querySelectorAll('input[name="anonStyle"]').forEach((radio) => {
    radio.addEventListener("change", () => {
      if (radio.checked) style = radio.value;
    });
  });

  strengthInput.addEventListener("input", () => {
    strength = Number(strengthInput.value);
    strengthVal.textContent = `${strength}px`;
  });

  whitelistToggle.addEventListener("change", () => {
    whitelistEnrolled = whitelistToggle.checked;
  });

  showLabelToggle.addEventListener("change", () => {
    showLabels = showLabelToggle.checked;
  });

  downloadBtn.addEventListener("click", () => {
    const canvas = getStageCanvas();
    if (!canvas || canvas.width === 0) return;
    const link = document.createElement("a");
    link.download = `anonymized-${Date.now()}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  });

  function applyBlur(ctx, canvas, box) {
    const padX = box.width * 0.14;
    const padY = box.height * 0.18;
    const rx = Math.max(0, box.x - padX);
    const ry = Math.max(0, box.y - padY);
    const rw = Math.min(canvas.width - rx, box.width + padX * 2);
    const rh = Math.min(canvas.height - ry, box.height + padY * 2);

    ctx.save();
    ctx.beginPath();
    ctx.ellipse(
      rx + rw / 2,
      ry + rh / 2,
      rw / 2,
      rh / 2,
      0,
      0,
      Math.PI * 2
    );
    ctx.clip();
    ctx.filter = `blur(${strength}px)`;
    ctx.drawImage(canvas, rx, ry, rw, rh, rx, ry, rw, rh);
    ctx.restore();
  }

  function applyPixelate(ctx, canvas, box) {
    const padX = box.width * 0.1;
    const padY = box.height * 0.12;
    const rx = Math.max(0, Math.floor(box.x - padX));
    const ry = Math.max(0, Math.floor(box.y - padY));
    const rw = Math.max(8, Math.min(canvas.width - rx, Math.ceil(box.width + padX * 2)));
    const rh = Math.max(8, Math.min(canvas.height - ry, Math.ceil(box.height + padY * 2)));

    const blockSize = Math.max(6, Math.round(strength * 0.65));
    const smallW = Math.max(2, Math.floor(rw / blockSize));
    const smallH = Math.max(2, Math.floor(rh / blockSize));

    tempCanvas.width = smallW;
    tempCanvas.height = smallH;
    tempCtx.imageSmoothingEnabled = true;
    tempCtx.drawImage(canvas, rx, ry, rw, rh, 0, 0, smallW, smallH);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(tempCanvas, 0, 0, smallW, smallH, rx, ry, rw, rh);
    ctx.restore();
  }

  function applySolidMask(ctx, box) {
    const padX = box.width * 0.08;
    const padY = box.height * 0.1;
    ctx.save();
    ctx.fillStyle = "#040812";
    ctx.fillRect(
      box.x - padX,
      box.y - padY,
      box.width + padX * 2,
      box.height + padY * 2
    );
    ctx.strokeStyle = "#14b8a6";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(
      box.x - padX,
      box.y - padY,
      box.width + padX * 2,
      box.height + padY * 2
    );
    ctx.restore();
  }

  function applyPrivacyMesh(ctx, box, landmarks, width, mirrored) {
    const padX = box.width * 0.1;
    const padY = box.height * 0.14;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(
      box.x + box.width / 2,
      box.y + box.height / 2,
      box.width / 2 + padX,
      box.height / 2 + padY,
      0,
      0,
      Math.PI * 2
    );
    ctx.fillStyle = "#091326";
    ctx.fill();
    ctx.strokeStyle = "rgba(20, 184, 166, 0.7)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    if (landmarks) {
      const pts = landmarks.positions.map((p) => projectPoint(p, width, mirrored));
      ctx.fillStyle = "#5eead4";
      for (const p of pts) {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 1.8, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }

  return {
    needsDescriptors: () => whitelistEnrolled,
    setExportEnabled(enabled) {
      downloadBtn.disabled = !enabled;
    },
    render({ ctx, canvas, width, mirrored, detections }) {
      const matcher = whitelistEnrolled ? getMatcher() : null;
      let redactedCount = 0;
      let whitelistedCount = 0;

      for (const det of detections) {
        const box = projectBox(det.detection.box, width, mirrored);
        let exemptLabel = null;

        if (matcher && det.descriptor) {
          const match = matcher.findBestMatch(det.descriptor);
          if (match.label !== "unknown") {
            exemptLabel = match.label;
          }
        }

        if (exemptLabel) {
          whitelistedCount += 1;
          if (showLabels) {
            ctx.strokeStyle = "#10b981";
            ctx.lineWidth = 2;
            ctx.strokeRect(box.x, box.y, box.width, box.height);
            ctx.font = "600 12px Inter, sans-serif";
            const badge = `WHITELISTED: ${exemptLabel}`;
            const tw = ctx.measureText(badge).width;
            ctx.fillStyle = "#10b981";
            ctx.fillRect(box.x, Math.max(0, box.y - 22), tw + 12, 22);
            ctx.fillStyle = "#04131c";
            ctx.fillText(badge, box.x + 6, Math.max(15, box.y - 7));
          }
          continue;
        }

        redactedCount += 1;
        if (style === "blur") applyBlur(ctx, canvas, box);
        else if (style === "pixelate") applyPixelate(ctx, canvas, box);
        else if (style === "solid") applySolidMask(ctx, box);
        else applyPrivacyMesh(ctx, box, det.landmarks, width, mirrored);

        if (showLabels) {
          ctx.font = "700 11px ui-monospace, monospace";
          const tag = `REDACTED (${style.toUpperCase()})`;
          const tw = ctx.measureText(tag).width;
          ctx.fillStyle = "rgba(15, 23, 42, 0.85)";
          ctx.fillRect(box.x, Math.max(0, box.y - 20), tw + 10, 20);
          ctx.fillStyle = "#5eead4";
          ctx.fillText(tag, box.x + 5, Math.max(14, box.y - 6));
        }
      }

      statsText.textContent =
        detections.length === 0
          ? "No faces currently in frame."
          : `${redactedCount} face(s) redacted · ${whitelistedCount} whitelisted · Mode: ${style}`;
    },
  };
}
