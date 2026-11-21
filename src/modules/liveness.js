function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Eye Aspect Ratio (Soukupová & Čech, 2016) on 6-point eye landmarks.
 */
function eyeAspectRatio(eye) {
  const vertical1 = dist(eye[1], eye[5]);
  const vertical2 = dist(eye[2], eye[4]);
  const horizontal = dist(eye[0], eye[3]);
  return horizontal > 0 ? (vertical1 + vertical2) / (2 * horizontal) : 0;
}

/**
 * Horizontal nose-to-jaw yaw ratio (~0.50 centered, <0.37 or >0.63 turned).
 */
function computeYawRatio(landmarks) {
  const jaw = landmarks.getJawOutline();
  const nose = landmarks.getNose();
  const leftEdge = jaw[0].x;
  const rightEdge = jaw[16].x;
  const noseTip = nose[3].x;
  const span = rightEdge - leftEdge;
  return span > 0 ? (noseTip - leftEdge) / span : 0.5;
}

function projectBox(box, width, mirrored) {
  return {
    x: mirrored ? width - box.x - box.width : box.x,
    y: box.y,
    width: box.width,
    height: box.height,
  };
}

export function createLivenessModule({ getMatcher }) {
  const targetSelect = document.getElementById("livenessTargetSelect");
  const startBtn = document.getElementById("startLivenessBtn");
  const resetBtn = document.getElementById("resetLivenessBtn");
  const banner = document.getElementById("livenessBanner");
  const stepEls = {
    blink: document.querySelector('#livenessSteps li[data-step="blink"]'),
    smile: document.querySelector('#livenessSteps li[data-step="smile"]'),
    turn: document.querySelector('#livenessSteps li[data-step="turn"]'),
    identity: document.querySelector('#livenessSteps li[data-step="identity"]'),
  };
  const earValEl = document.getElementById("earVal");
  const yawValEl = document.getElementById("yawVal");
  const smileValEl = document.getElementById("smileVal");

  let running = false;
  let completed = false;
  let targetLabel = "";
  let stepIndex = 0;
  let steps = ["blink", "smile", "turn"];

  // Blink state machine
  let baselineEar = 0;
  let sawEyeClose = false;
  let smileFrames = 0;
  let turnFrames = 0;

  function updateStepClasses() {
    const activeSteps = targetLabel
      ? ["blink", "smile", "turn", "identity"]
      : ["blink", "smile", "turn"];
    steps = activeSteps;

    stepEls.identity.classList.toggle("hidden", !targetLabel);

    for (const [key, el] of Object.entries(stepEls)) {
      el.classList.remove("active", "passed");
      const idx = steps.indexOf(key);
      if (idx === -1) continue;
      if (completed || (running && idx < stepIndex)) {
        el.classList.add("passed");
      } else if (running && idx === stepIndex) {
        el.classList.add("active");
      }
    }
  }

  function resetState() {
    running = false;
    completed = false;
    stepIndex = 0;
    baselineEar = 0;
    sawEyeClose = false;
    smileFrames = 0;
    turnFrames = 0;
    banner.className = "info-box";
    banner.innerHTML =
      'Start your webcam and click <strong>Start Liveness Challenge</strong>.';
    updateStepClasses();
  }

  function startChallenge() {
    targetLabel = targetSelect.value;
    running = true;
    completed = false;
    stepIndex = 0;
    baselineEar = 0;
    sawEyeClose = false;
    smileFrames = 0;
    turnFrames = 0;
    banner.className = "info-box";
    banner.innerHTML =
      "<strong>Step 1:</strong> Look at the camera and <strong>blink naturally</strong>.";
    updateStepClasses();
  }

  function advanceStep() {
    stepIndex += 1;
    if (stepIndex >= steps.length) {
      running = false;
      completed = true;
      banner.className = "info-box success";
      banner.innerHTML = targetLabel
        ? `<strong>VERIFIED:</strong> Live person confirmed &amp; matched enrolled identity <strong>${targetLabel}</strong>.`
        : "<strong>LIVENESS PASSED:</strong> Active anti-spoofing challenges completed successfully.";
      updateStepClasses();
      return;
    }

    const next = steps[stepIndex];
    if (next === "smile") {
      banner.innerHTML = "<strong>Step 2:</strong> Please <strong>smile</strong> at the camera.";
    } else if (next === "turn") {
      banner.innerHTML =
        "<strong>Step 3:</strong> Gently <strong>turn your head left or right</strong>.";
    } else if (next === "identity") {
      banner.innerHTML = `<strong>Step 4:</strong> Face forward to verify identity against <strong>${targetLabel}</strong>.`;
    }
    updateStepClasses();
  }

  startBtn.addEventListener("click", startChallenge);
  resetBtn.addEventListener("click", resetState);
  targetSelect.addEventListener("change", () => {
    targetLabel = targetSelect.value;
    updateStepClasses();
  });

  return {
    needsDescriptors: () => Boolean(targetSelect.value),
    syncProfiles(profiles) {
      const current = targetSelect.value;
      targetSelect.innerHTML = '<option value="">Liveness Only (Any Person)</option>';
      for (const p of profiles) {
        const opt = document.createElement("option");
        opt.value = p.label;
        opt.textContent = `Verify: ${p.label}`;
        targetSelect.appendChild(opt);
      }
      if ([...targetSelect.options].some((o) => o.value === current)) {
        targetSelect.value = current;
      }
      targetLabel = targetSelect.value;
      updateStepClasses();
    },
    render({ ctx, width, mirrored, detections }) {
      if (detections.length === 0) {
        earValEl.textContent = "—";
        yawValEl.textContent = "—";
        smileValEl.textContent = "—";
        return;
      }

      const det = detections[0];
      const box = projectBox(det.detection.box, width, mirrored);
      const landmarks = det.landmarks;
      const happyScore = det.expressions?.happy || 0;

      const leftEar = eyeAspectRatio(landmarks.getLeftEye());
      const rightEar = eyeAspectRatio(landmarks.getRightEye());
      const avgEar = (leftEar + rightEar) / 2;
      const yaw = computeYawRatio(landmarks);

      earValEl.textContent = avgEar.toFixed(3);
      yawValEl.textContent = yaw.toFixed(2);
      smileValEl.textContent = `${Math.round(happyScore * 100)}%`;

      // Evaluate active challenge step
      if (running) {
        const currentStep = steps[stepIndex];
        if (currentStep === "blink") {
          if (avgEar > baselineEar) {
            baselineEar = baselineEar === 0 ? avgEar : baselineEar * 0.8 + avgEar * 0.2;
          }
          const closeThreshold = Math.min(0.24, baselineEar * 0.8);
          if (baselineEar > 0 && avgEar < closeThreshold) {
            sawEyeClose = true;
          } else if (sawEyeClose && avgEar > closeThreshold * 1.08) {
            advanceStep();
          }
        } else if (currentStep === "smile") {
          if (happyScore >= 0.7) {
            smileFrames += 1;
            if (smileFrames >= 3) advanceStep();
          } else {
            smileFrames = Math.max(0, smileFrames - 1);
          }
        } else if (currentStep === "turn") {
          if (yaw < 0.37 || yaw > 0.63) {
            turnFrames += 1;
            if (turnFrames >= 3) advanceStep();
          }
        } else if (currentStep === "identity") {
          const matcher = getMatcher();
          if (matcher && det.descriptor) {
            const match = matcher.findBestMatch(det.descriptor);
            if (match.label === targetLabel) {
              advanceStep();
            }
          }
        }
      }

      // Draw live HUD ring around face (crisp monochrome)
      const ringColor = completed ? "#ffffff" : running ? "#e4e4e7" : "#a1a1aa";
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = completed ? 3 : 2;
      ctx.strokeRect(box.x, box.y, box.width, box.height);

      const promptText = completed
        ? "LIVENESS VERIFIED"
        : running
        ? `STEP ${stepIndex + 1}/${steps.length}: ${steps[stepIndex].toUpperCase()}`
        : "READY FOR LIVENESS CHECK";

      ctx.font = "700 12px -apple-system, BlinkMacSystemFont, Inter, sans-serif";
      const tw = ctx.measureText(promptText).width;
      const by = Math.max(0, box.y - 26);
      ctx.fillStyle = "#09090b";
      ctx.fillRect(box.x, by, tw + 16, 26);
      ctx.fillStyle = "#ffffff";
      ctx.fillText(promptText, box.x + 8, by + 17);
    },
  };
}
