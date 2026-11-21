# FaceVision Studio — Privacy-First On-Device Face AI

A unified, zero-backend browser application powered by `face-api.js` (TensorFlow.js) that runs **100% locally on your device**—no images, video frames, or biometric descriptors ever leave the browser.

## 4 Interactive AI Modes

1. **Face Recognition & Enrollment**
   * Enroll faces from live webcam or uploaded photos into browser `localStorage`.
   * **Privacy Mode (default):** Stores only 128-dimensional numerical embeddings without saving raw face thumbnails.
   * Real-time Euclidean distance matching (`FaceMatcher`), tunable similarity threshold, and JSON vault export/import.
2. **On-Device Privacy Anonymizer**
   * Automatic face redaction for live video or uploaded photos with 4 styles: **Gaussian Blur**, **Pixelate (Mosaic)**, **Solid Mask**, and **Privacy Mesh** (68-point biometric wireframe only).
   * **Smart Whitelist:** Optionally keep enrolled/consented faces visible while automatically redacting bystanders.
   * One-click **Download Anonymized PNG** export.
3. **Emotion & Facial Analytics Studio**
   * Real-time 7-class facial expression probabilities (`happy`, `neutral`, `surprised`, `sad`, `angry`, `fearful`, `disgusted`), live rolling timeline chart, 68-point landmark overlay, and eye-line head roll angle estimation.
4. **Biometric Liveness & Verification (Anti-Spoofing MFA Demo)**
   * Active multi-step liveness check using **Eye Aspect Ratio (EAR)** blink detection, natural smile verification, nose-to-jaw **head-turn yaw** verification, and optional 128-D face identity verification against an enrolled profile.

## Running Locally

Because browsers require HTTP/HTTPS to load ES Modules, AI model weights, and webcam streams, serve the folder with any static server:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploying Free on GitHub Pages

All asset and model paths use relative URLs (`./models`), so the repository works out-of-the-box on GitHub Pages:

1. Open your repository on GitHub → **Settings** → **Pages**.
2. Under **Build and deployment**, select **Deploy from a branch** → `main` → `/ (root)` → **Save**.
3. Your live studio will be available at `https://randt.github.io/face-app/`.

## License

MIT License — see [LICENSE](LICENSE).
