/**
 * Core Face AI inference & media engine built around bundled face-api.js models.
 * Runs 100% locally in the browser using relative ./models paths (GitHub Pages compatible).
 */
export class FaceEngine {
  constructor() {
    this.modelsLoaded = false;
    this.stream = null;
    this.scoreThreshold = 0.5;
    this.inputSize = 320;
  }

  async loadModels(modelPath = "./models") {
    if (this.modelsLoaded) return;
    if (typeof faceapi === "undefined") {
      throw new Error("face-api.js failed to load.");
    }

    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(modelPath),
      faceapi.nets.faceLandmark68Net.loadFromUri(modelPath),
      faceapi.nets.faceRecognitionNet.loadFromUri(modelPath),
      faceapi.nets.faceExpressionNet.loadFromUri(modelPath),
    ]);

    this.modelsLoaded = true;
  }

  async startWebcam(videoEl) {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      throw new Error(
        "Webcam access requires a modern browser over HTTPS or localhost."
      );
    }

    this.stopWebcam(videoEl);
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        width: { ideal: 960 },
        height: { ideal: 720 },
        facingMode: "user",
      },
      audio: false,
    });

    this.stream = stream;
    videoEl.srcObject = stream;

    await new Promise((resolve) => {
      videoEl.onloadedmetadata = () => {
        videoEl.play().then(resolve).catch(resolve);
      };
    });

    return {
      width: videoEl.videoWidth || 720,
      height: videoEl.videoHeight || 540,
    };
  }

  stopWebcam(videoEl) {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (videoEl) {
      videoEl.srcObject = null;
    }
  }

  getDetectorOptions() {
    return new faceapi.TinyFaceDetectorOptions({
      inputSize: this.inputSize,
      scoreThreshold: this.scoreThreshold,
    });
  }

  async detect(mediaEl, { withDescriptors = false, withExpressions = true } = {}) {
    if (!this.modelsLoaded) return [];

    const options = this.getDetectorOptions();
    let task = faceapi.detectAllFaces(mediaEl, options).withFaceLandmarks();

    if (withExpressions) {
      task = task.withFaceExpressions();
    }
    if (withDescriptors) {
      task = task.withFaceDescriptors();
    }

    return task;
  }

  async extractSingleDescriptor(mediaEl) {
    if (!this.modelsLoaded) {
      throw new Error("Models are still loading.");
    }
    const result = await faceapi
      .detectSingleFace(mediaEl, this.getDetectorOptions())
      .withFaceLandmarks()
      .withFaceDescriptor();

    return result || null;
  }
}
