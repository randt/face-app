import { FaceEngine } from "./engine/faceEngine.js";
import { createRecognitionModule } from "./modules/recognition.js";
import { createAnonymizerModule } from "./modules/anonymizer.js";
import { createAnalyticsModule } from "./modules/analytics.js";
import { createLivenessModule } from "./modules/liveness.js";

const engine = new FaceEngine();

const videoEl = document.getElementById("video");
const uploadedImgEl = document.getElementById("uploadedImage");
const stageCanvas = document.getElementById("stageCanvas");
const stageCtx = stageCanvas.getContext("2d");
const placeholderEl = document.getElementById("viewportPlaceholder");

const modelStatusPill = document.getElementById("modelStatusPill");
const fpsPill = document.getElementById("fpsPill");
const faceCountVal = document.getElementById("faceCountVal");
const inferenceMsVal = document.getElementById("inferenceMsVal");
const sourceTypeVal = document.getElementById("sourceTypeVal");
const globalAlert = document.getElementById("globalAlert");

const startWebcamBtn = document.getElementById("startWebcamBtn");
const stopWebcamBtn = document.getElementById("stopWebcamBtn");
const imageUploadInput = document.getElementById("imageUploadInput");
const mirrorToggle = document.getElementById("mirrorToggle");
const snapshotBtn = document.getElementById("snapshotBtn");
const scoreThresholdInput = document.getElementById("scoreThresholdInput");
const scoreThresholdVal = document.getElementById("scoreThresholdVal");

let activeMode = "recognition";
let sourceKind = "idle"; // "idle" | "webcam" | "image"
let loopId = null;
let busy = false;
let lastFpsStamp = performance.now();
let framesThisSecond = 0;

let alertTimer = null;
function notify(message, type = "info") {
  clearTimeout(alertTimer);
  globalAlert.textContent = message;
  globalAlert.className = `alert ${type}`;
  alertTimer = setTimeout(() => {
    globalAlert.className = "alert hidden";
  }, 4500);
}

function getActiveSource() {
  if (sourceKind === "webcam" && videoEl.readyState >= 2) return videoEl;
  if (sourceKind === "image" && uploadedImgEl.complete && uploadedImgEl.naturalWidth > 0) {
    return uploadedImgEl;
  }
  return null;
}

// Initialize the 4 AI studio modules
let livenessModule;
const recognitionModule = createRecognitionModule({
  engine,
  getActiveSource,
  notify,
  onProfilesChanged(profiles) {
    if (livenessModule) livenessModule.syncProfiles(profiles);
    if (sourceKind === "image") processSingleFrame();
  },
});

const anonymizerModule = createAnonymizerModule({
  getMatcher: () => recognitionModule.getMatcher(),
  getStageCanvas: () => stageCanvas,
});

const analyticsModule = createAnalyticsModule();

livenessModule = createLivenessModule({
  getMatcher: () => recognitionModule.getMatcher(),
});
livenessModule.syncProfiles(recognitionModule.getProfiles());

const modules = {
  recognition: recognitionModule,
  anonymizer: anonymizerModule,
  analytics: analyticsModule,
  liveness: livenessModule,
};

function drawSourceToCanvas(source, mirrored) {
  const width =
    source === videoEl ? videoEl.videoWidth || 720 : uploadedImgEl.naturalWidth;
  const height =
    source === videoEl ? videoEl.videoHeight || 540 : uploadedImgEl.naturalHeight;

  if (stageCanvas.width !== width || stageCanvas.height !== height) {
    stageCanvas.width = width;
    stageCanvas.height = height;
  }

  stageCtx.save();
  stageCtx.clearRect(0, 0, width, height);
  if (mirrored) {
    stageCtx.translate(width, 0);
    stageCtx.scale(-1, 1);
  }
  stageCtx.drawImage(source, 0, 0, width, height);
  stageCtx.restore();

  return { width, height };
}

async function processSingleFrame() {
  const source = getActiveSource();
  if (!source || !engine.modelsLoaded || busy) return;
  busy = true;

  try {
    const activeMod = modules[activeMode];
    const mirrored = sourceKind === "webcam" && mirrorToggle.checked;
    const t0 = performance.now();

    const detections = await engine.detect(source, {
      withDescriptors: activeMod.needsDescriptors(),
      withExpressions: true,
    });

    const elapsed = performance.now() - t0;
    const { width, height } = drawSourceToCanvas(source, mirrored);

    activeMod.render({
      ctx: stageCtx,
      canvas: stageCanvas,
      width,
      height,
      mirrored,
      detections,
    });

    faceCountVal.textContent = String(detections.length);
    inferenceMsVal.textContent = `${elapsed.toFixed(0)} ms`;

    framesThisSecond += 1;
    const now = performance.now();
    if (now - lastFpsStamp >= 1000) {
      fpsPill.textContent = `${framesThisSecond} FPS`;
      framesThisSecond = 0;
      lastFpsStamp = now;
    }
  } catch (err) {
    console.error("[FaceVision] Inference error:", err);
  } finally {
    busy = false;
  }
}

function startLoop() {
  stopLoop();
  const tick = async () => {
    if (sourceKind !== "webcam") return;
    await processSingleFrame();
    loopId = requestAnimationFrame(tick);
  };
  loopId = requestAnimationFrame(tick);
}

function stopLoop() {
  if (loopId !== null) {
    cancelAnimationFrame(loopId);
    loopId = null;
  }
}

function setActiveMediaUI(kind) {
  sourceKind = kind;
  const active = kind !== "idle";
  placeholderEl.classList.toggle("hidden", active);
  snapshotBtn.disabled = !active;
  anonymizerModule.setExportEnabled(active);
  startWebcamBtn.classList.toggle("hidden", kind === "webcam");
  stopWebcamBtn.classList.toggle("hidden", kind !== "webcam");
  sourceTypeVal.textContent =
    kind === "webcam" ? "Live Webcam" : kind === "image" ? "Uploaded Photo" : "Idle";
}

// Mode tab switching
document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    activeMode = btn.dataset.mode;
    document.querySelectorAll(".tab-btn").forEach((b) => {
      const selected = b === btn;
      b.classList.toggle("active", selected);
      b.setAttribute("aria-selected", String(selected));
    });
    document.querySelectorAll(".mode-panel").forEach((panel) => {
      panel.classList.toggle("hidden", panel.dataset.panel !== activeMode);
    });
    if (sourceKind === "image") {
      processSingleFrame();
    }
  });
});

// Re-render static photo when anonymizer controls change
document
  .querySelectorAll(
    'input[name="anonStyle"], #anonStrengthInput, #anonWhitelistToggle, #anonShowLabelToggle, #analyticsBoxToggle, #analyticsLandmarksToggle, #analyticsLabelsToggle, #matchThresholdInput'
  )
  .forEach((el) => {
    el.addEventListener("change", () => {
      if (sourceKind === "image") processSingleFrame();
    });
    el.addEventListener("input", () => {
      if (sourceKind === "image") processSingleFrame();
    });
  });

startWebcamBtn.addEventListener("click", async () => {
  if (!engine.modelsLoaded) {
    notify("AI models are still loading—please wait a second.", "error");
    return;
  }
  try {
    await engine.startWebcam(videoEl);
    setActiveMediaUI("webcam");
    startLoop();
  } catch (err) {
    notify(`Could not start webcam: ${err.message}`, "error");
  }
});

stopWebcamBtn.addEventListener("click", () => {
  stopLoop();
  engine.stopWebcam(videoEl);
  stageCtx.clearRect(0, 0, stageCanvas.width, stageCanvas.height);
  fpsPill.textContent = "0 FPS";
  faceCountVal.textContent = "0";
  inferenceMsVal.textContent = "—";
  setActiveMediaUI("idle");
});

imageUploadInput.addEventListener("change", (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  stopLoop();
  engine.stopWebcam(videoEl);

  const url = URL.createObjectURL(file);
  uploadedImgEl.onload = () => {
    setActiveMediaUI("image");
    fpsPill.textContent = "Static";
    processSingleFrame();
    URL.revokeObjectURL(url);
  };
  uploadedImgEl.src = url;
  imageUploadInput.value = "";
});

snapshotBtn.addEventListener("click", () => {
  if (stageCanvas.width === 0) return;
  const link = document.createElement("a");
  link.download = `facevision-${activeMode}-${Date.now()}.png`;
  link.href = stageCanvas.toDataURL("image/png");
  link.click();
});

scoreThresholdInput.addEventListener("input", () => {
  engine.scoreThreshold = Number(scoreThresholdInput.value);
  scoreThresholdVal.textContent = engine.scoreThreshold.toFixed(2);
  if (sourceKind === "image") processSingleFrame();
});

// Boot: load all 4 local TensorFlow.js models
async function boot() {
  try {
    await engine.loadModels("./models");
    modelStatusPill.textContent = "Models ready";
    modelStatusPill.className = "status-tag green";
    recognitionModule.onModelsReady();
  } catch (err) {
    modelStatusPill.textContent = "Model load failed";
    modelStatusPill.className = "status-tag red";
    notify(
      `Failed to load AI models (${err.message}). Make sure the app is served over HTTP/HTTPS (e.g. python3 -m http.server).`,
      "error"
    );
  }
}

window.addEventListener("DOMContentLoaded", boot);
