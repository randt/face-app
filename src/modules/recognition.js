import {
  loadProfiles,
  saveProfiles,
  addOrUpdateProfile,
  deleteProfile,
  clearProfiles,
  buildFaceMatcher,
} from "../engine/storage.js";

function projectBox(box, width, mirrored) {
  return {
    x: mirrored ? width - box.x - box.width : box.x,
    y: box.y,
    width: box.width,
    height: box.height,
  };
}

function captureThumbnail(sourceEl, box) {
  const thumb = document.createElement("canvas");
  thumb.width = 72;
  thumb.height = 72;
  const tctx = thumb.getContext("2d");
  const pad = Math.min(box.width, box.height) * 0.15;
  const sx = Math.max(0, box.x - pad);
  const sy = Math.max(0, box.y - pad);
  const sw = box.width + pad * 2;
  const sh = box.height + pad * 2;
  tctx.drawImage(sourceEl, sx, sy, sw, sh, 0, 0, 72, 72);
  return thumb.toDataURL("image/jpeg", 0.7);
}

export function createRecognitionModule({ engine, getActiveSource, notify, onProfilesChanged }) {
  let profiles = loadProfiles();
  let matchThreshold = 0.52;
  let matcher = null;

  const enrollForm = document.getElementById("enrollForm");
  const enrollNameInput = document.getElementById("enrollNameInput");
  const enrollPhotoInput = document.getElementById("enrollPhotoInput");
  const embeddingOnlyToggle = document.getElementById("storeEmbeddingOnlyToggle");
  const matchThresholdInput = document.getElementById("matchThresholdInput");
  const matchThresholdVal = document.getElementById("matchThresholdVal");
  const enrolledCountEl = document.getElementById("enrolledCount");
  const enrolledListEl = document.getElementById("enrolledList");
  const exportBtn = document.getElementById("exportProfilesBtn");
  const importInput = document.getElementById("importProfilesInput");
  const clearBtn = document.getElementById("clearProfilesBtn");

  function rebuildMatcher() {
    matcher = buildFaceMatcher(profiles, matchThreshold);
    renderProfileList();
    if (onProfilesChanged) onProfilesChanged(profiles, matcher);
  }

  function renderProfileList() {
    enrolledCountEl.textContent = String(profiles.length);
    if (profiles.length === 0) {
      enrolledListEl.innerHTML =
        '<div class="info-box muted">No faces enrolled yet. Enter a name and click <strong>Enroll Current Face</strong> or upload a photo.</div>';
      return;
    }

    enrolledListEl.innerHTML = "";
    for (const p of profiles) {
      const item = document.createElement("div");
      item.className = "profile-item";

      const meta = document.createElement("div");
      meta.className = "profile-meta";

      if (p.thumbnail) {
        const img = document.createElement("img");
        img.src = p.thumbnail;
        img.alt = p.label;
        img.className = "profile-avatar";
        meta.appendChild(img);
      } else {
        const badge = document.createElement("div");
        badge.className = "profile-avatar mono";
        badge.textContent = p.label.slice(0, 2).toUpperCase();
        meta.appendChild(badge);
      }

      const textWrap = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = p.label;
      title.style.display = "block";
      title.style.fontSize = "0.86rem";

      const sub = document.createElement("small");
      sub.className = "muted";
      sub.textContent = `${p.descriptors.length} sample${p.descriptors.length > 1 ? "s" : ""} · ${
        p.thumbnail ? "with thumb" : "128-D vector only"
      }`;

      textWrap.append(title, sub);
      meta.appendChild(textWrap);

      const delBtn = document.createElement("button");
      delBtn.className = "btn small danger";
      delBtn.textContent = "Remove";
      delBtn.addEventListener("click", () => {
        profiles = deleteProfile(p.id);
        rebuildMatcher();
        notify(`Removed profile "${p.label}".`, "success");
      });

      item.append(meta, delBtn);
      enrolledListEl.appendChild(item);
    }
  }

  async function enrollFromElement(sourceEl, label) {
    if (!engine.modelsLoaded) {
      notify("Please wait for AI models to finish loading.", "error");
      return;
    }
    const result = await engine.extractSingleDescriptor(sourceEl);
    if (!result) {
      notify("No clear face detected to enroll. Ensure good lighting and face the camera.", "error");
      return;
    }
    const thumbnail = embeddingOnlyToggle.checked
      ? null
      : captureThumbnail(sourceEl, result.detection.box);

    profiles = addOrUpdateProfile({
      label,
      descriptor: result.descriptor,
      thumbnail,
    });
    rebuildMatcher();
    notify(`Enrolled "${label}" locally (128-D face embedding stored).`, "success");
  }

  enrollForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const label = enrollNameInput.value.trim();
    if (!label) return;

    const src = getActiveSource();
    if (!src) {
      notify("Start the webcam or upload a photo first before enrolling.", "error");
      return;
    }
    await enrollFromElement(src, label);
    enrollNameInput.value = "";
  });

  enrollPhotoInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const label =
      enrollNameInput.value.trim() || file.name.replace(/\.[^.]+$/, "");

    const img = new Image();
    img.src = URL.createObjectURL(file);
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
    });
    await enrollFromElement(img, label);
    URL.revokeObjectURL(img.src);
    enrollPhotoInput.value = "";
    enrollNameInput.value = "";
  });

  matchThresholdInput.addEventListener("input", () => {
    matchThreshold = Number(matchThresholdInput.value);
    matchThresholdVal.textContent = matchThreshold.toFixed(2);
    rebuildMatcher();
  });

  exportBtn.addEventListener("click", () => {
    if (profiles.length === 0) {
      notify("No enrolled profiles to export.", "error");
      return;
    }
    const blob = new Blob([JSON.stringify(profiles, null, 2)], {
      type: "application/json",
    });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "facevision-profiles.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  importInput.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!Array.isArray(parsed)) throw new Error("Invalid profile JSON format.");
      const valid = parsed.filter(
        (p) => p && typeof p.label === "string" && Array.isArray(p.descriptors)
      );
      profiles = valid;
      saveProfiles(profiles);
      rebuildMatcher();
      notify(`Imported ${profiles.length} enrolled profile(s).`, "success");
    } catch (err) {
      notify(`Import failed: ${err.message}`, "error");
    } finally {
      importInput.value = "";
    }
  });

  clearBtn.addEventListener("click", () => {
    profiles = clearProfiles();
    rebuildMatcher();
    notify("Cleared all local enrolled face profiles.", "success");
  });

  return {
    needsDescriptors: () => true,
    onModelsReady: () => rebuildMatcher(),
    getMatcher: () => matcher,
    getProfiles: () => profiles,
    render({ ctx, width, mirrored, detections }) {
      for (const det of detections) {
        const box = projectBox(det.detection.box, width, mirrored);
        let label = "Unknown";
        let color = "#f59e0b";

        if (matcher && det.descriptor) {
          const match = matcher.findBestMatch(det.descriptor);
          const similarity = Math.max(0, Math.round((1 - match.distance) * 100));
          if (match.label !== "unknown") {
            label = `${match.label} (${similarity}%)`;
            color = "#10b981";
          } else {
            label = `Unknown (dist ${match.distance.toFixed(2)})`;
          }
        }

        // Bounding box
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.strokeRect(box.x, box.y, box.width, box.height);

        // Label banner
        ctx.font = "600 13px Inter, sans-serif";
        const textW = ctx.measureText(label).width;
        const bannerY = Math.max(0, box.y - 24);
        ctx.fillStyle = color;
        ctx.fillRect(box.x, bannerY, textW + 14, 24);
        ctx.fillStyle = "#04131c";
        ctx.fillText(label, box.x + 7, bannerY + 16);
      }
    },
  };
}
