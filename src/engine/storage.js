const STORAGE_KEY = "facevision_enrolled_profiles_v1";

/**
 * Loads enrolled face profiles from browser localStorage.
 * Each profile stores: { id, label, descriptors: number[][], thumbnail?: string, createdAt }
 */
export function loadProfiles() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p) => p && typeof p.label === "string" && Array.isArray(p.descriptors) && p.descriptors.length > 0
    );
  } catch {
    return [];
  }
}

export function saveProfiles(profiles) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(profiles));
}

export function addOrUpdateProfile({ label, descriptor, thumbnail = null }) {
  const profiles = loadProfiles();
  const cleanLabel = label.trim();
  const vector = Array.from(descriptor);
  const existing = profiles.find(
    (p) => p.label.toLowerCase() === cleanLabel.toLowerCase()
  );

  if (existing) {
    existing.descriptors.push(vector);
    if (thumbnail) existing.thumbnail = thumbnail;
    existing.updatedAt = new Date().toISOString();
  } else {
    profiles.unshift({
      id: `prof_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      label: cleanLabel,
      descriptors: [vector],
      thumbnail: thumbnail || null,
      createdAt: new Date().toISOString(),
    });
  }

  saveProfiles(profiles);
  return profiles;
}

export function deleteProfile(id) {
  const next = loadProfiles().filter((p) => p.id !== id);
  saveProfiles(next);
  return next;
}

export function clearProfiles() {
  localStorage.removeItem(STORAGE_KEY);
  return [];
}

export function buildFaceMatcher(profiles, maxDistance = 0.52) {
  if (!profiles || profiles.length === 0 || typeof faceapi === "undefined") {
    return null;
  }
  const labeled = profiles.map(
    (p) =>
      new faceapi.LabeledFaceDescriptors(
        p.label,
        p.descriptors.map((d) => new Float32Array(d))
      )
  );
  return new faceapi.FaceMatcher(labeled, maxDistance);
}
