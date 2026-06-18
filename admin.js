(() => {
  const R = window.HatyaiRescue;
  const config = window.HatyaiRescueConfig || {};
  const AUTO_SCAN_INTERVAL_MS = 450;
  const AUTO_CAPTURE_EVERY_MS = 900;
  const AUTO_CONFIRM_COOLDOWN_MS = 4500;
  const TELEMETRY_RETRY_MS = 3500;
  const TRAINED_AI_POLL_MS = 1800;
  const YOLO_DETECTION_POLL_MS = 650;
  const TRAINED_AI_MATCH_URLS = [
    config.trainedAiMatchesUrl,
    `${window.location.origin}/api/pi/matches`,
    window.location.origin.includes(":4173") ? "" : "http://127.0.0.1:4173/api/pi/matches"
  ].filter(Boolean);
  const YOLO_DETECTION_URLS = [
    config.yoloDetectionsUrl,
    `${window.location.origin}/api/yolo/detections`,
    window.location.origin.includes(":4173") ? "" : "http://127.0.0.1:4173/api/yolo/detections"
  ].filter(Boolean);
  const FACE_SCAN_PASSES = [
    { name: "full", transform: { x: 0, y: 0, w: 1, h: 1 } },
    { name: "center", transform: { x: 0.18, y: 0.08, w: 0.64, h: 0.76 } },
    { name: "distance-center", transform: { x: 0.28, y: 0.16, w: 0.44, h: 0.58 } },
    { name: "upper-body", transform: { x: 0.14, y: 0.02, w: 0.72, h: 0.68 } },
    { name: "left", transform: { x: 0, y: 0.06, w: 0.54, h: 0.78 } },
    { name: "right", transform: { x: 0.46, y: 0.06, w: 0.54, h: 0.78 } }
  ];

  const state = {
    people: R.loadPeople(),
    logs: R.loadLogs(),
    commands: R.loadCommands(),
    stream: null,
    autoConnectStarted: false,
    lastMatches: [],
    lastProbeVector: null,
    lastSnapshot: "",
    autoScanTimer: null,
    lastAutoScanAt: 0,
    lastAutoConfirmAt: 0,
    trainedAiEvents: [],
    processedTrainedAiIds: new Set(),
    lastYoloEventId: "",
    lastYoloAt: 0,
    lastYoloBoxesAt: 0,
    lastYoloSignature: "",
    lastYoloStatusAt: 0,
    faceDetector: null,
    mediaPipeFaceDetector: null,
    mediaPipeLoading: false,
    mediaPipeBusy: false,
    mediaPipeTransform: { x: 0, y: 0, w: 1, h: 1 },
    mediaPipePassName: "full",
    lastMediaPipeBoxes: [],
    lastMediaPipeAt: 0,
    externalTrackingAt: 0,
    droneVideoUrl: "",
    telemetrySocket: null,
    telemetryRetryTimer: null,
    telemetryUrl: "",
    connection: {
      status: "waiting",
      message: "Waiting for Raspberry Pi",
      lastMessageAt: 0
    },
    drone: {
      battery: null,
      signal: null,
      altitude: null,
      voltage: null,
      gps: null,
      heading: null,
      mode: "Disconnected",
      recording: false,
      online: false
    }
  };

  const els = {
    scanStatus: document.querySelector("#scanStatus"),
    cameraVideo: document.querySelector("#cameraVideo"),
    droneVideoImage: document.querySelector("#droneVideoImage"),
    frameCanvas: document.querySelector("#frameCanvas"),
    cameraEmpty: document.querySelector("#cameraEmpty"),
    objectBoxes: document.querySelector("#objectBoxes"),
    faceBoxes: document.querySelector("#faceBoxes"),
    aiDetectionHud: document.querySelector("#aiDetectionHud"),
    aiHudState: document.querySelector("#aiHudState"),
    aiHudMatch: document.querySelector("#aiHudMatch"),
    aiHudConfidence: document.querySelector("#aiHudConfidence"),
    aiHudMode: document.querySelector("#aiHudMode"),
    recordBtn: document.querySelector("#recordBtn"),
    recordLabel: document.querySelector("#recordLabel"),
    startCameraBtn: document.querySelector("#startCameraBtn"),
    captureBtn: document.querySelector("#captureBtn"),
    demoFrameBtn: document.querySelector("#demoFrameBtn"),
    probeUpload: document.querySelector("#probeUpload"),
    thresholdRange: document.querySelector("#thresholdRange"),
    thresholdValue: document.querySelector("#thresholdValue"),
    matchResults: document.querySelector("#matchResults"),
    batteryValue: document.querySelector("#batteryValue"),
    signalValue: document.querySelector("#signalValue"),
    altitudeValue: document.querySelector("#altitudeValue"),
    modeValue: document.querySelector("#modeValue"),
    droneOnline: document.querySelector("#droneOnline"),
    latInput: document.querySelector("#latInput"),
    lngInput: document.querySelector("#lngInput"),
    gpsBtn: document.querySelector("#gpsBtn"),
    commandButtons: document.querySelectorAll("[data-command]"),
    commandLog: document.querySelector("#commandLog"),
    adminCaseList: document.querySelector("#adminCaseList"),
    mapPins: document.querySelector("#mapPins"),
    exportBtn: document.querySelector("#exportBtn"),
    fullscreenBtn: document.querySelector("#fullscreenBtn"),
    droneApp: document.querySelector("[data-drone-app]"),
    missionCount: document.querySelector("#missionCount"),
    lastSync: document.querySelector("#lastSync"),
    flightState: document.querySelector("#flightState"),
    piLinkStatus: document.querySelector("#piLinkStatus"),
    gpsStatus: document.querySelector("#gpsStatus"),
    rcSignalStatus: document.querySelector("#rcSignalStatus"),
    batteryStatus: document.querySelector("#batteryStatus"),
    batteryFill: document.querySelector("#batteryFill"),
    batteryPercent: document.querySelector("#batteryPercent"),
    voltageStatus: document.querySelector("#voltageStatus"),
    droneLinkOverlay: document.querySelector("#droneLinkOverlay"),
    compassNeedle: document.querySelector("#compassNeedle"),
    compassHeading: document.querySelector("#compassHeading"),
    compassLabel: document.querySelector("#compassLabel")
  };
  let pageFullscreenActive = false;
  let nativeFullscreenActive = false;
  const isIOSLike =
    /iP(ad|hone|od)/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

  function appViewport() {
    const visualViewport = window.visualViewport;
    return {
      width: Math.round(visualViewport?.width || window.innerWidth || document.documentElement.clientWidth),
      height: Math.round(visualViewport?.height || window.innerHeight || document.documentElement.clientHeight),
      offsetLeft: Math.round(visualViewport?.offsetLeft || 0),
      offsetTop: Math.round(visualViewport?.offsetTop || 0)
    };
  }

  function syncViewportVars() {
    const viewport = appViewport();
    const root = document.documentElement;
    root.style.setProperty("--drone-viewport-width", `${viewport.width}px`);
    root.style.setProperty("--drone-viewport-height", `${viewport.height}px`);
    root.style.setProperty("--drone-viewport-half-height", `${Math.round(viewport.height / 2)}px`);
    root.style.setProperty("--drone-viewport-left", `${viewport.offsetLeft}px`);
    root.style.setProperty("--drone-viewport-top", `${viewport.offsetTop}px`);
  }

  function nudgeMobileBrowserChrome() {
    if (!pageFullscreenActive) return;
    requestAnimationFrame(() => {
      syncViewportVars();
      window.scrollTo(0, 1);
      requestAnimationFrame(syncViewportVars);
    });
  }

  function updateScanStatus(text, tone = "") {
    if (els.scanStatus.textContent === text && els.scanStatus.className === `scan-status ${tone}`) return;
    els.scanStatus.textContent = text;
    els.scanStatus.className = `scan-status ${tone}`;
  }

  function updateAiHud({ visible = true, stateText = "Detected", matchText = "Scanning database", confidenceText = "Auto capture armed", modeText = "Auto confirm on threshold", tone = "detected" } = {}) {
    if (!els.aiDetectionHud) return;
    els.aiDetectionHud.hidden = !visible;
    els.aiDetectionHud.dataset.tone = tone;
    if (els.aiHudState) els.aiHudState.textContent = stateText;
    if (els.aiHudMatch) els.aiHudMatch.textContent = matchText;
    if (els.aiHudConfidence) els.aiHudConfidence.textContent = confidenceText;
    if (els.aiHudMode) els.aiHudMode.textContent = modeText;
  }

  function clearFaceBoxes() {
    if (els.faceBoxes) els.faceBoxes.innerHTML = "";
    updateAiHud({ visible: false });
  }

  function renderTrackingStandby(message = "รอ face detector จาก Raspberry Pi") {
    if (els.faceBoxes) els.faceBoxes.innerHTML = "";
    updateAiHud({
      visible: true,
      stateText: "Tracking Standby",
      matchText: message,
      confidenceText: "จะวาดกรอบเมื่อจับใบหน้าได้จริง",
      modeText: "ไม่ใช้กรอบ fallback ที่ไม่มั่นใจ",
      tone: "warning"
    });
  }

  function compactFaceBox(box, sourceWidth, sourceHeight) {
    const nextWidth = R.clamp(box.width * 1.04, Math.min(box.width, 42), sourceWidth);
    const nextHeight = R.clamp(box.height * 1.08, Math.min(box.height, 54), sourceHeight);
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;

    return {
      x: R.clamp(centerX - nextWidth / 2, 0, sourceWidth - nextWidth),
      y: R.clamp(centerY - nextHeight / 2, 0, sourceHeight - nextHeight),
      width: nextWidth,
      height: nextHeight
    };
  }

  function objectFitCoverMetrics(sourceWidth, sourceHeight, targetWidth, targetHeight) {
    const scale = Math.max(targetWidth / sourceWidth, targetHeight / sourceHeight);
    const renderedWidth = sourceWidth * scale;
    const renderedHeight = sourceHeight * scale;
    return {
      scale,
      offsetX: (targetWidth - renderedWidth) / 2,
      offsetY: (targetHeight - renderedHeight) / 2
    };
  }

  function clearObjectBoxes() {
    if (!els.objectBoxes?.innerHTML) return;
    if (els.objectBoxes) els.objectBoxes.innerHTML = "";
    state.lastYoloSignature = "";
  }

  function yoloSignature(boxes, sourceWidth, sourceHeight) {
    return JSON.stringify({
      sourceWidth,
      sourceHeight,
      boxes: boxes.map((box) => ({
        c: box.classId,
        l: box.label,
        p: Math.round(box.confidence * 1000),
        x: Math.round(box.x),
        y: Math.round(box.y),
        w: Math.round(box.width),
        h: Math.round(box.height)
      }))
    });
  }

  function boxFromYoloDetection(detection, sourceWidth, sourceHeight) {
    const raw = detection?.bbox || detection?.box || detection;
    const box = Array.isArray(raw)
      ? { x: raw[0], y: raw[1], width: raw[2], height: raw[3] }
      : {
          x: raw?.x ?? raw?.left,
          y: raw?.y ?? raw?.top,
          width: raw?.width ?? raw?.w,
          height: raw?.height ?? raw?.h
        };
    const x = Number(box.x);
    const y = Number(box.y);
    const width = Number(box.width);
    const height = Number(box.height);
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;

    const normalized = x <= 1 && y <= 1 && width <= 1 && height <= 1;
    return {
      x: normalized ? x * sourceWidth : x,
      y: normalized ? y * sourceHeight : y,
      width: normalized ? width * sourceWidth : width,
      height: normalized ? height * sourceHeight : height,
      classId: Number(detection?.class_id ?? detection?.class ?? detection?.cls ?? 0),
      label: String(detection?.label || detection?.class_name || detection?.name || `class ${detection?.class_id ?? detection?.cls ?? 0}`),
      confidence: Number(detection?.confidence ?? detection?.conf ?? detection?.score ?? 0)
    };
  }

  function renderYoloBoxes(detections, sourceWidth = els.frameCanvas.width, sourceHeight = els.frameCanvas.height) {
    if (!els.objectBoxes) return;
    const boxes = (detections || [])
      .map((detection) => boxFromYoloDetection(detection, sourceWidth, sourceHeight))
      .filter(Boolean);

    if (!boxes.length) {
      return;
    }

    const signature = yoloSignature(boxes, sourceWidth, sourceHeight);
    state.lastYoloBoxesAt = Date.now();
    if (signature === state.lastYoloSignature) return;
    state.lastYoloSignature = signature;

    const layerWidth = els.objectBoxes.clientWidth || els.frameCanvas.clientWidth || sourceWidth;
    const layerHeight = els.objectBoxes.clientHeight || els.frameCanvas.clientHeight || sourceHeight;
    const { scale, offsetX, offsetY } = objectFitCoverMetrics(sourceWidth, sourceHeight, layerWidth, layerHeight);

    els.objectBoxes.innerHTML = boxes
      .map((box) => {
        const x = R.clamp(box.x * scale + offsetX, 0, layerWidth - 2);
        const y = R.clamp(box.y * scale + offsetY, 0, layerHeight - 2);
        const width = R.clamp(box.width * scale, 2, layerWidth - x);
        const height = R.clamp(box.height * scale, 2, layerHeight - y);
        const confidence = box.confidence > 1 ? box.confidence : box.confidence * 100;
        const label = `${box.label} ${Math.round(confidence)}%`;
        return `
          <span class="object-box" data-class="${R.escapeHtml(box.classId)}" style="left:${x}px; top:${y}px; width:${width}px; height:${height}px;">
            <span class="object-box-label">${R.escapeHtml(label)}</span>
          </span>
        `;
      })
      .join("");
  }

  function cropFrameSource(transform) {
    if (transform.x === 0 && transform.y === 0 && transform.w === 1 && transform.h === 1) {
      return els.frameCanvas;
    }
    const crop = document.createElement("canvas");
    crop.width = 640;
    crop.height = 640;
    const ctx = crop.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(
      els.frameCanvas,
      transform.x * els.frameCanvas.width,
      transform.y * els.frameCanvas.height,
      transform.w * els.frameCanvas.width,
      transform.h * els.frameCanvas.height,
      0,
      0,
      crop.width,
      crop.height
    );
    return crop;
  }

  function paddedBox(x, y, width, height, sourceWidth, sourceHeight) {
    const padX = Math.max(width * 0.16, 6);
    const padTop = Math.max(height * 0.2, 8);
    const padBottom = Math.max(height * 0.12, 5);
    const nextX = R.clamp(x - padX, 0, sourceWidth - 2);
    const nextY = R.clamp(y - padTop, 0, sourceHeight - 2);
    const nextRight = R.clamp(x + width + padX, nextX + 2, sourceWidth);
    const nextBottom = R.clamp(y + height + padBottom, nextY + 2, sourceHeight);
    return {
      x: nextX,
      y: nextY,
      width: nextRight - nextX,
      height: nextBottom - nextY
    };
  }

  function boxFromMediaPipeDetection(detection, transform, sourceWidth, sourceHeight) {
    const box = detection?.boundingBox || detection?.locationData?.relativeBoundingBox || {};
    let relX;
    let relY;
    let relW;
    let relH;

    if (Number.isFinite(box.xCenter) && Number.isFinite(box.yCenter)) {
      relW = Number(box.width) || 0;
      relH = Number(box.height) || 0;
      relX = Number(box.xCenter) - relW / 2;
      relY = Number(box.yCenter) - relH / 2;
    } else {
      relX = Number(box.xMin ?? box.xmin ?? box.x ?? 0);
      relY = Number(box.yMin ?? box.ymin ?? box.y ?? 0);
      relW = Number(box.width) || 0;
      relH = Number(box.height) || 0;
    }

    if (![relX, relY, relW, relH].every(Number.isFinite) || relW <= 0 || relH <= 0) return null;
    return paddedBox(
      (transform.x + relX * transform.w) * sourceWidth,
      (transform.y + relY * transform.h) * sourceHeight,
      relW * transform.w * sourceWidth,
      relH * transform.h * sourceHeight,
      sourceWidth,
      sourceHeight
    );
  }

  function isPlausibleFaceBox(box, sourceWidth, sourceHeight) {
    if (!box || ![box.x, box.y, box.width, box.height].every(Number.isFinite)) return false;
    if (box.width < sourceWidth * 0.035 || box.height < sourceHeight * 0.055) return false;
    if (box.width > sourceWidth * 0.7 || box.height > sourceHeight * 0.82) return false;

    const ratio = box.height / Math.max(box.width, 1);
    const areaRatio = (box.width * box.height) / Math.max(sourceWidth * sourceHeight, 1);
    if (ratio < 0.82 || ratio > 2.15) return false;
    if (areaRatio < 0.002 || areaRatio > 0.42) return false;

    const touchesSide = box.x <= sourceWidth * 0.01 || box.x + box.width >= sourceWidth * 0.99;
    if (touchesSide && ratio > 1.8) return false;
    return true;
  }

  function filterPlausibleFaceBoxes(boxes, sourceWidth, sourceHeight) {
    return boxes
      .filter((box) => isPlausibleFaceBox(box, sourceWidth, sourceHeight))
      .sort((a, b) => b.width * b.height - a.width * a.height)
      .slice(0, 3);
  }

  function vectorFromDetectedFace(box) {
    if (!box) return R.vectorFromCanvas(els.frameCanvas);
    const source = els.frameCanvas;
    const crop = document.createElement("canvas");
    crop.width = 320;
    crop.height = 320;
    const ctx = crop.getContext("2d", { willReadFrequently: true });
    const centerX = box.x + box.width / 2;
    const centerY = box.y + box.height / 2;
    const side = R.clamp(Math.max(box.width, box.height) * 1.22, 48, Math.min(source.width, source.height));
    const sx = R.clamp(centerX - side / 2, 0, source.width - side);
    const sy = R.clamp(centerY - side / 2, 0, source.height - side);
    ctx.drawImage(source, sx, sy, side, side, 0, 0, crop.width, crop.height);
    return R.vectorFromCanvas(crop);
  }

  function renderFaceBoxes(boxes, sourceWidth = els.frameCanvas.width, sourceHeight = els.frameCanvas.height, options = {}) {
    if (!els.faceBoxes) return;
    const safeBoxes = filterPlausibleFaceBoxes(boxes, sourceWidth, sourceHeight);
    if (!safeBoxes.length) {
      clearFaceBoxes();
      return;
    }

    const layerWidth = els.faceBoxes.clientWidth || els.frameCanvas.clientWidth || sourceWidth;
    const layerHeight = els.faceBoxes.clientHeight || els.frameCanvas.clientHeight || sourceHeight;
    const { scale, offsetX, offsetY } = objectFitCoverMetrics(sourceWidth, sourceHeight, layerWidth, layerHeight);

    els.faceBoxes.innerHTML = safeBoxes
      .map((box) => {
        const faceBox = compactFaceBox(box, sourceWidth, sourceHeight);
        const x = R.clamp(faceBox.x * scale + offsetX, 0, layerWidth - 12);
        const y = R.clamp(faceBox.y * scale + offsetY, 0, layerHeight - 12);
        const width = R.clamp(faceBox.width * scale, 20, layerWidth - x);
        const height = R.clamp(faceBox.height * scale, 24, layerHeight - y);
        return `<span class="face-box" style="left:${x}px; top:${y}px; width:${width}px; height:${height}px;"></span>`;
      })
      .join("");

    updateAiHud({
      visible: true,
      stateText: options.stateText || "Detected",
      matchText: options.matchText || "Face inside frame",
      confidenceText: options.confidenceText || "Capturing face automatically",
      modeText: options.modeText || "Comparing with rescue database",
      tone: options.tone || "detected"
    });
  }

  function isSkinPixel(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    const chroma = max - min;
    return y > 48 && y < 230 && chroma > 18 && cb > 78 && cb < 138 && cr > 132 && cr < 184 && r > g * 1.02 && r > b * 1.12;
  }

  function fallbackFaceBoxes() {
    const source = els.frameCanvas;
    const sample = document.createElement("canvas");
    const sampleWidth = 160;
    const sampleHeight = 90;
    sample.width = sampleWidth;
    sample.height = sampleHeight;

    const ctx = sample.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(source, 0, 0, sampleWidth, sampleHeight);
    const pixels = ctx.getImageData(0, 0, sampleWidth, sampleHeight).data;
    const mask = new Uint8Array(sampleWidth * sampleHeight);

    const minX = Math.floor(sampleWidth * 0.02);
    const maxX = Math.floor(sampleWidth * 0.98);
    const minY = Math.floor(sampleHeight * 0.06);
    const maxY = Math.floor(sampleHeight * 0.92);

    for (let y = minY; y < maxY; y += 1) {
      for (let x = minX; x < maxX; x += 1) {
        const offset = (y * sampleWidth + x) * 4;
        if (isSkinPixel(pixels[offset], pixels[offset + 1], pixels[offset + 2])) {
          mask[y * sampleWidth + x] = 1;
        }
      }
    }

    const visited = new Uint8Array(sampleWidth * sampleHeight);
    let best = null;
    const queue = [];

    for (let start = 0; start < mask.length; start += 1) {
      if (!mask[start] || visited[start]) continue;

      visited[start] = 1;
      queue.length = 0;
      queue.push(start);
      let area = 0;
      let sumX = 0;
      let sumY = 0;
      let left = sampleWidth;
      let top = sampleHeight;
      let right = 0;
      let bottom = 0;

      for (let cursor = 0; cursor < queue.length; cursor += 1) {
        const index = queue[cursor];
        const x = index % sampleWidth;
        const y = Math.floor(index / sampleWidth);

        area += 1;
        sumX += x;
        sumY += y;
        left = Math.min(left, x);
        top = Math.min(top, y);
        right = Math.max(right, x);
        bottom = Math.max(bottom, y);

        const neighbors = [index - 1, index + 1, index - sampleWidth, index + sampleWidth];
        neighbors.forEach((neighbor) => {
          if (neighbor < 0 || neighbor >= mask.length || visited[neighbor] || !mask[neighbor]) return;
          const nx = neighbor % sampleWidth;
          if (Math.abs(nx - x) > 1) return;
          visited[neighbor] = 1;
          queue.push(neighbor);
        });
      }

      if (area < 36 || area > sampleWidth * sampleHeight * 0.12) continue;
      const componentWidth = right - left + 1;
      const componentHeight = bottom - top + 1;
      if (componentWidth < 5 || componentHeight < 6) continue;
      const aspect = componentWidth / componentHeight;
      const density = area / (componentWidth * componentHeight);
      if (aspect < 0.28 || aspect > 1.55 || density < 0.2) continue;

      const cx = sumX / area;
      const cy = sumY / area;
      const edgePenalty = Math.min(cx, sampleWidth - cx) < sampleWidth * 0.04 ? 0.55 : 1;
      const aspectScore = 1 - Math.min(Math.abs(aspect - 0.72), 0.72);
      const score = area * density * Math.max(aspectScore, 0.28) * edgePenalty;
      if (!best || score > best.score) {
        best = { area, left, top, right, bottom, cx, cy, score };
      }
    }

    if (best && best.score > 8) {
      const skinWidth = Math.max(best.right - best.left + 1, 12);
      const skinHeight = Math.max(best.bottom - best.top + 1, 12);
      const boxWidth = Math.max(skinWidth * 1.55, sampleWidth * 0.11);
      const boxHeight = Math.max(skinHeight * 1.85, sampleHeight * 0.2);
      const x = (best.cx - boxWidth / 2) * (source.width / sampleWidth);
      const y = (best.cy - boxHeight * 0.46) * (source.height / sampleHeight);
      return [
        {
          x: R.clamp(x, 0, source.width - 24),
          y: R.clamp(y, 0, source.height - 24),
          width: R.clamp(boxWidth * (source.width / sampleWidth), 58, source.width),
          height: R.clamp(boxHeight * (source.height / sampleHeight), 72, source.height)
        }
      ];
    }

    return [];
  }

  function ensureFaceDetector() {
    if (state.faceDetector) return state.faceDetector;
    if (!("FaceDetector" in window)) return null;
    try {
      state.faceDetector = new window.FaceDetector({ fastMode: true, maxDetectedFaces: 5 });
      return state.faceDetector;
    } catch {
      return null;
    }
  }

  async function detectFacesInFrame() {
    const detector = ensureFaceDetector();
    if (!detector) {
      const boxes = fallbackFaceBoxes();
      if (boxes.length) {
        renderFaceBoxes(boxes, els.frameCanvas.width, els.frameCanvas.height, {
          matchText: "Visual fallback tracker",
          confidenceText: "ตรวจจากสีผิวและรูปทรงใบหน้า"
        });
      } else {
        renderTrackingStandby("รอ native FaceDetector หรือ Raspberry Pi");
      }
      return { supported: false, boxes };
    }

    try {
      const faces = await detector.detect(els.frameCanvas);
      const boxes = faces
        .map((face) => face.boundingBox)
        .filter(Boolean)
        .map((box) => ({
          x: box.x,
          y: box.y,
          width: box.width,
          height: box.height
        }));
      renderFaceBoxes(boxes, els.frameCanvas.width, els.frameCanvas.height, {
        matchText: "Native face detector",
        confidenceText: "Auto capture armed"
      });
      if (boxes.length) return { supported: true, boxes };
      const fallbackBoxes = fallbackFaceBoxes();
      if (fallbackBoxes.length) {
        renderFaceBoxes(fallbackBoxes, els.frameCanvas.width, els.frameCanvas.height, {
          matchText: "Visual fallback tracker",
          confidenceText: "Native detector missed face"
        });
      } else {
        renderTrackingStandby("ยังไม่พบใบหน้าในเฟรม");
      }
      return { supported: false, boxes: fallbackBoxes };
    } catch {
      const boxes = fallbackFaceBoxes();
      if (boxes.length) {
        renderFaceBoxes(boxes, els.frameCanvas.width, els.frameCanvas.height, {
          matchText: "Visual fallback tracker",
          confidenceText: "Native detector unavailable"
        });
      } else {
        renderTrackingStandby("รอ face tracking จาก Raspberry Pi");
      }
      return { supported: false, boxes };
    }
  }

  async function ensureMediaPipeFaceDetector() {
    if (state.mediaPipeFaceDetector || state.mediaPipeLoading) {
      return Boolean(state.mediaPipeFaceDetector);
    }
    if (!window.FaceDetection) return false;

    state.mediaPipeLoading = true;
    try {
      const detector = new window.FaceDetection({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_detection/${file}`
      });
      detector.setOptions({
        model: "full",
        modelSelection: 1,
        minDetectionConfidence: 0.32
      });
      detector.onResults((results) => {
        const boxes = (results.detections || [])
          .map((detection) =>
            boxFromMediaPipeDetection(
              detection,
              state.mediaPipeTransform,
              els.frameCanvas.width,
              els.frameCanvas.height
            )
          )
          .filter(Boolean);
        state.lastMediaPipeBoxes = filterPlausibleFaceBoxes(boxes, els.frameCanvas.width, els.frameCanvas.height);
      });
      state.mediaPipeFaceDetector = detector;
      return true;
    } catch (error) {
      console.warn(error);
      return false;
    } finally {
      state.mediaPipeLoading = false;
    }
  }

  async function detectFacesWithMediaPipe() {
    const ready = await ensureMediaPipeFaceDetector();
    if (!ready || state.mediaPipeBusy) return [];
    if (Date.now() - state.lastMediaPipeAt < 220 && state.lastMediaPipeBoxes.length) {
      return state.lastMediaPipeBoxes;
    }

    state.mediaPipeBusy = true;
    state.lastMediaPipeBoxes = [];
    try {
      for (const pass of FACE_SCAN_PASSES) {
        state.mediaPipeTransform = pass.transform;
        state.mediaPipePassName = pass.name;
        await state.mediaPipeFaceDetector.send({ image: cropFrameSource(pass.transform) });
        if (state.lastMediaPipeBoxes.length) break;
      }
      state.lastMediaPipeAt = Date.now();
      return state.lastMediaPipeBoxes;
    } catch (error) {
      console.warn(error);
      return [];
    } finally {
      state.mediaPipeBusy = false;
    }
  }

  function ensureFaceDetector() {
    if (state.faceDetector) return state.faceDetector;
    if (!("FaceDetector" in window)) return null;
    try {
      state.faceDetector = new window.FaceDetector({ fastMode: false, maxDetectedFaces: 5 });
      return state.faceDetector;
    } catch {
      return null;
    }
  }

  async function detectFacesWithNativeApi() {
    const detector = ensureFaceDetector();
    if (!detector) return [];
    try {
      const faces = await detector.detect(els.frameCanvas);
      return filterPlausibleFaceBoxes(
        faces
          .map((face) => face.boundingBox)
          .filter(Boolean)
          .map((box) => ({
            x: box.x,
            y: box.y,
            width: box.width,
            height: box.height
          })),
        els.frameCanvas.width,
        els.frameCanvas.height
      );
    } catch (error) {
      console.warn(error);
      return [];
    }
  }

  async function detectFacesInFrame() {
    const mediaPipeBoxes = await detectFacesWithMediaPipe();
    if (mediaPipeBoxes.length) {
      renderFaceBoxes(mediaPipeBoxes, els.frameCanvas.width, els.frameCanvas.height, {
        matchText: `MediaPipe AI face detector (${state.mediaPipePassName})`,
        confidenceText: "Face verified before database match",
        modeText: "AI detector active",
        tone: "detected"
      });
      return { supported: true, boxes: mediaPipeBoxes, engine: "mediapipe" };
    }

    const nativeBoxes = await detectFacesWithNativeApi();
    if (nativeBoxes.length) {
      renderFaceBoxes(nativeBoxes, els.frameCanvas.width, els.frameCanvas.height, {
        matchText: "Native AI face detector",
        confidenceText: "Face verified before database match",
        modeText: "Browser face detector active",
        tone: "detected"
      });
      return { supported: true, boxes: nativeBoxes, engine: "native" };
    }

    renderTrackingStandby(
      state.mediaPipeLoading
        ? "Loading MediaPipe AI face detector"
        : "No real face detected; skin-color fallback is disabled"
    );
    return { supported: Boolean(state.mediaPipeFaceDetector || state.faceDetector), boxes: [], engine: "none" };
  }

  function readLocation() {
    const lat = Number.parseFloat(els.latInput.value);
    const lng = Number.parseFloat(els.lngInput.value);
    return {
      lat: Number.isFinite(lat) ? lat : 7.0086,
      lng: Number.isFinite(lng) ? lng : 100.4747
    };
  }

  function formatPercent(value) {
    return Number.isFinite(value) ? `${Math.round(value)}%` : "--";
  }

  function formatMeters(value) {
    return Number.isFinite(value) ? `${Math.round(value)} m` : "-- m";
  }

  function formatVoltage(value) {
    return Number.isFinite(value) ? `${Number(value).toFixed(1)}V` : "--.-V";
  }

  function normalizeHeading(value) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return null;
    return ((numeric % 360) + 360) % 360;
  }

  function headingLabel(value) {
    if (!Number.isFinite(value)) return "Heading";
    const labels = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    return labels[Math.round(value / 45) % labels.length];
  }

  function setDroneConnection(status, message = "") {
    state.connection.status = status;
    state.connection.message = message || (status === "connected" ? "Raspberry Pi linked" : "Waiting for Raspberry Pi");
    state.drone.online = status === "connected";
    document.body.dataset.droneConnection = status;
    if (status !== "connected" && !state.stream) {
      updateScanStatus("AI Standby", "is-warning");
    }
    renderTelemetry();
  }

  function renderTelemetry() {
    const connected = state.connection.status === "connected";
    if (els.batteryValue) els.batteryValue.textContent = formatPercent(state.drone.battery);
    if (els.signalValue) els.signalValue.textContent = formatPercent(state.drone.signal);
    if (els.altitudeValue) els.altitudeValue.textContent = formatMeters(state.drone.altitude);
    if (els.modeValue) els.modeValue.textContent = connected ? state.drone.mode : "Standby";
    if (els.droneOnline) {
      els.droneOnline.textContent = connected ? "ออนไลน์" : "รอ Pi";
      els.droneOnline.className = `status-chip ${connected ? "good" : "danger"}`;
    }
    if (els.flightState) {
      els.flightState.textContent = connected
        ? (state.drone.mode === "Disconnected" ? "In Flight" : state.drone.mode)
        : state.connection.status === "connecting"
          ? "Connecting..."
          : "Aircraft Disconnected";
    }
    if (els.piLinkStatus) els.piLinkStatus.textContent = state.connection.message;
    if (els.gpsStatus) els.gpsStatus.textContent = Number.isFinite(state.drone.gps) ? `GPS ${Math.round(state.drone.gps)}` : "GPS --";
    if (els.rcSignalStatus) els.rcSignalStatus.textContent = `RC ${formatPercent(state.drone.signal)}`;
    const battery = Number.isFinite(state.drone.battery) ? R.clamp(state.drone.battery, 0, 100) : null;
    if (els.batteryPercent) els.batteryPercent.textContent = battery === null ? "--%" : `${Math.round(battery)}%`;
    if (els.batteryFill) {
      els.batteryFill.style.width = `${battery ?? 0}%`;
      els.batteryFill.dataset.level = battery === null ? "unknown" : battery <= 20 ? "low" : battery <= 45 ? "mid" : "ok";
    }
    if (els.batteryStatus) els.batteryStatus.dataset.level = battery === null ? "unknown" : battery <= 20 ? "low" : battery <= 45 ? "mid" : "ok";
    if (els.voltageStatus) els.voltageStatus.textContent = formatVoltage(state.drone.voltage);
    const heading = normalizeHeading(state.drone.heading);
    if (els.compassNeedle) els.compassNeedle.style.transform = `translate(-50%, -100%) rotate(${heading || 0}deg)`;
    if (els.compassHeading) els.compassHeading.textContent = heading === null ? "--°" : `${Math.round(heading).toString().padStart(3, "0")}°`;
    if (els.compassLabel) els.compassLabel.textContent = headingLabel(heading);
    if (els.droneLinkOverlay) els.droneLinkOverlay.hidden = connected;
  }

  function renderRecording() {
    if (!els.recordBtn) return;
    els.recordBtn.classList.toggle("is-recording", state.drone.recording);
    els.recordBtn.setAttribute("aria-pressed", state.drone.recording ? "true" : "false");
    if (els.recordLabel) {
      els.recordLabel.textContent = state.drone.recording ? "LIVE" : "REC";
    }
  }

  function renderMissionMeta() {
    if (els.missionCount) {
      const active = R.loadPeople().filter((person) => person.status !== "found").length;
      els.missionCount.textContent = `${active} เคสที่ต้องติดตาม`;
    }
    if (els.lastSync) {
      els.lastSync.textContent = `อัปเดตล่าสุด ${new Date().toLocaleTimeString("th-TH", {
        hour: "2-digit",
        minute: "2-digit"
      })}`;
    }
  }

  function tickTelemetry() {
    if (state.connection.status === "connected" && state.connection.lastMessageAt && Date.now() - state.connection.lastMessageAt > 8000) {
      setDroneConnection("waiting", "Raspberry Pi signal lost");
    }
    renderTelemetry();
  }

  function readTelemetryUrl() {
    try {
      return config.droneTelemetryWs || config.raspberryPiWs || window.localStorage.getItem("hatyai-drone-telemetry-ws") || "";
    } catch {
      return config.droneTelemetryWs || config.raspberryPiWs || "";
    }
  }

  function numericValue(payload, keys) {
    for (const key of keys) {
      const value = Number(payload?.[key]);
      if (Number.isFinite(value)) return value;
    }
    return null;
  }

  function looksLikeImageStream(url = "") {
    return /\.(mjpg|mjpeg|jpg|jpeg|png|webp)(\?|#|$)/i.test(url) || /mjpeg|snapshot|image/i.test(url);
  }

  function attachDroneVideo(url, kind = "auto") {
    if (!url || state.droneVideoUrl === url) return;
    state.droneVideoUrl = url;
    try {
      if (state.stream) {
        state.stream.getTracks().forEach((track) => track.stop());
        state.stream = null;
      }
      const useImage = kind === "image" || (kind === "auto" && looksLikeImageStream(url));
      if (els.droneVideoImage) {
        els.droneVideoImage.hidden = !useImage;
        els.droneVideoImage.classList.toggle("is-live", useImage);
        els.droneVideoImage.src = useImage ? url : "";
      }
      els.cameraVideo.hidden = useImage;
      els.cameraVideo.classList.toggle("is-live", !useImage);
      els.cameraVideo.srcObject = null;
      els.cameraVideo.src = useImage ? "" : url;
      els.frameCanvas.classList.add("is-hidden");
      els.cameraEmpty.classList.add("is-hidden");
      if (!useImage) els.cameraVideo.play().catch(() => {});
    } catch (error) {
      console.warn(error);
    }
  }

  function renderExternalFaces(payload) {
    const rawFaces = Array.isArray(payload.faces)
      ? payload.faces
      : payload.face
        ? [payload.face]
        : [];
    if (!rawFaces.length) return;

    const sourceWidth = Number(payload.frameWidth || payload.width || els.frameCanvas.width);
    const sourceHeight = Number(payload.frameHeight || payload.height || els.frameCanvas.height);
    const boxes = rawFaces
      .map((face) => {
        const width = Number(face.width ?? face.w);
        const height = Number(face.height ?? face.h);
        const x = Number(face.x ?? face.left);
        const y = Number(face.y ?? face.top);
        if (![x, y, width, height].every(Number.isFinite)) return null;
        const normalized = x <= 1 && y <= 1 && width <= 1 && height <= 1;
        return {
          x: normalized ? x * sourceWidth : x,
          y: normalized ? y * sourceHeight : y,
          width: normalized ? width * sourceWidth : width,
          height: normalized ? height * sourceHeight : height
        };
      })
      .filter(Boolean);

    if (!boxes.length) return;
    state.externalTrackingAt = Date.now();
    renderFaceBoxes(boxes, sourceWidth, sourceHeight, {
      stateText: "Pi Tracking",
      matchText: "Raspberry Pi face tracker",
      confidenceText: payload.confidence ? `Confidence ${payload.confidence}%` : "External detector locked",
      modeText: "Following target from Pi",
      tone: "detected"
    });
  }

  function applyDroneTelemetry(payload = {}) {
    state.connection.lastMessageAt = Date.now();
    setDroneConnection("connected", payload.status || "Raspberry Pi linked");

    const battery = numericValue(payload, ["battery", "batteryPercent", "bat"]);
    const signal = numericValue(payload, ["signal", "rssiPercent", "rcSignal"]);
    const altitude = numericValue(payload, ["altitude", "alt", "relativeAltitude"]);
    const voltage = numericValue(payload, ["voltage", "batteryVoltage"]);
    const gps = numericValue(payload, ["gps", "satellites", "gpsSatellites"]);
    const heading = numericValue(payload, ["heading", "yaw", "course", "compass"]);

    if (battery !== null) state.drone.battery = R.clamp(battery, 0, 100);
    if (signal !== null) state.drone.signal = R.clamp(signal, 0, 100);
    if (altitude !== null) state.drone.altitude = altitude;
    if (voltage !== null) state.drone.voltage = voltage;
    if (gps !== null) state.drone.gps = gps;
    if (heading !== null) state.drone.heading = normalizeHeading(heading);
    if (payload.mode) state.drone.mode = String(payload.mode);
    if (payload.lat !== undefined && Number.isFinite(Number(payload.lat))) els.latInput.value = Number(payload.lat).toFixed(6);
    if (payload.lng !== undefined && Number.isFinite(Number(payload.lng))) els.lngInput.value = Number(payload.lng).toFixed(6);
    attachDroneVideo(payload.videoUrl || payload.imageUrl || payload.mjpegUrl || config.droneVideoUrl, payload.imageUrl || payload.mjpegUrl ? "image" : "auto");
    renderExternalFaces(payload);
    renderTelemetry();
  }

  function scheduleTelemetryReconnect() {
    if (!state.telemetryUrl || state.telemetryRetryTimer) return;
    state.telemetryRetryTimer = window.setTimeout(() => {
      state.telemetryRetryTimer = null;
      connectDroneTelemetry();
    }, TELEMETRY_RETRY_MS);
  }

  function connectDroneTelemetry() {
    state.telemetryUrl = readTelemetryUrl();
    if (!state.telemetryUrl) {
      setDroneConnection("waiting", "Waiting for Raspberry Pi");
      attachDroneVideo(config.droneVideoUrl);
      return;
    }

    try {
      if (state.telemetrySocket) state.telemetrySocket.close();
      setDroneConnection("connecting", "Connecting to Raspberry Pi");
      const socket = new WebSocket(state.telemetryUrl);
      state.telemetrySocket = socket;
      socket.addEventListener("open", () => {
        setDroneConnection("connected", "Raspberry Pi linked");
        socket.send(JSON.stringify({ type: "hello", client: "hatyai-drone-control" }));
      });
      socket.addEventListener("message", (event) => {
        try {
          applyDroneTelemetry(JSON.parse(event.data));
        } catch (error) {
          console.warn(error);
        }
      });
      socket.addEventListener("close", () => {
        if (state.telemetrySocket === socket) state.telemetrySocket = null;
        setDroneConnection("waiting", "Raspberry Pi disconnected");
        scheduleTelemetryReconnect();
      });
      socket.addEventListener("error", () => {
        setDroneConnection("waiting", "Raspberry Pi link error");
      });
    } catch (error) {
      console.warn(error);
      setDroneConnection("waiting", "Waiting for Raspberry Pi");
      scheduleTelemetryReconnect();
    }
  }

  function shouldAutoStartCamera() {
    try {
      if (window.localStorage.getItem("hatyai-drone-auto-camera") === "0") return false;
    } catch {
      // Keep default auto-start behavior if localStorage is blocked.
    }
    return config.autoStartCamera !== false;
  }

  function autoConnectFlightSession() {
    if (state.autoConnectStarted) return;
    state.autoConnectStarted = true;
    connectDroneTelemetry();

    const hasExternalVideo = Boolean(config.droneVideoUrl || readTelemetryUrl());
    if (shouldAutoStartCamera() && !hasExternalVideo) {
      updateScanStatus("กำลังเชื่อมกล้องอัตโนมัติ", "is-scanning");
      startCamera().catch((error) => {
        console.warn(error);
        updateScanStatus("รอสัญญาณภาพจากโดรน", "is-warning");
      });
    }
  }

  function renderCommandLog() {
    if (!state.commands.length) {
      els.commandLog.innerHTML = `<div class="empty-note">ยังไม่มีคำสั่งโดรน</div>`;
      return;
    }

    els.commandLog.innerHTML = state.commands
      .slice(0, 5)
      .map((item) => {
        const time = new Date(item.createdAt).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });
        return `<div class="command-item"><strong>${R.escapeHtml(item.command)}</strong><span>${time} · ${R.escapeHtml(item.status)}</span></div>`;
      })
      .join("");
  }

  function pushCommand(command, explicitMode = "") {
    state.commands.unshift({
      id: `CMD-${Date.now()}`,
      command,
      status: "ส่งคำสั่งแล้ว",
      createdAt: new Date().toISOString()
    });
    state.drone.mode = explicitMode || (command.includes("กลับ")
      ? "Return"
      : command.includes("หยุด")
        ? "Hover"
        : command.includes("ลงจอด")
          ? "Landing"
          : "Patrol");
    if (state.drone.mode === "Landing" || command.includes("ลงจอด")) {
      state.drone.altitude = 8;
    }
    R.saveCommands(state.commands);
    renderTelemetry();
    renderCommandLog();
  }

  function canvasSnapshot() {
    const small = document.createElement("canvas");
    small.width = 240;
    small.height = 135;
    small.getContext("2d").drawImage(els.frameCanvas, 0, 0, small.width, small.height);
    return small.toDataURL("image/jpeg", 0.72);
  }

  function drawImageToFrame(image) {
    const canvas = els.frameCanvas;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#11191d";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    const x = (canvas.width - width) / 2;
    const y = (canvas.height - height) / 2;
    ctx.drawImage(image, x, y, width, height);
    if (els.droneVideoImage) {
      els.droneVideoImage.hidden = true;
      els.droneVideoImage.classList.remove("is-live");
    }
    els.cameraVideo.hidden = false;
    els.cameraVideo.classList.remove("is-live");
    els.frameCanvas.classList.remove("is-hidden");
    els.cameraEmpty.classList.add("is-hidden");
    clearFaceBoxes();
  }

  function drawDemoFrame() {
    const canvas = els.frameCanvas;
    const ctx = canvas.getContext("2d");
    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#9fb9c4";
    ctx.fillRect(0, 0, width, height * 0.34);
    ctx.fillStyle = "#526f67";
    ctx.fillRect(0, height * 0.27, width, height * 0.14);
    ctx.fillStyle = "#8a6d55";
    ctx.fillRect(0, height * 0.4, width, height * 0.6);

    for (let index = 0; index < 7; index += 1) {
      const x = 70 + index * 130;
      const y = 170 + (index % 2) * 18;
      ctx.fillStyle = index % 2 ? "#d7ded9" : "#f3eee2";
      ctx.fillRect(x, y, 88, 78);
      ctx.fillStyle = "#984d39";
      ctx.beginPath();
      ctx.moveTo(x - 8, y);
      ctx.lineTo(x + 44, y - 34);
      ctx.lineTo(x + 96, y);
      ctx.closePath();
      ctx.fill();
    }

    ctx.fillStyle = "rgba(24, 88, 130, 0.42)";
    ctx.fillRect(0, height * 0.52, width, height * 0.48);
    ctx.strokeStyle = "rgba(255,255,255,0.42)";
    ctx.lineWidth = 3;
    for (let y = 310; y < height; y += 52) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(width * 0.26, y + 20, width * 0.5, y - 18, width, y + 12);
      ctx.stroke();
    }

    const faceX = width * 0.55;
    const faceY = height * 0.45;
    ctx.fillStyle = "#f0c7a8";
    ctx.beginPath();
    ctx.arc(faceX, faceY, 38, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#2c2522";
    ctx.fillRect(faceX - 36, faceY - 38, 72, 18);
    ctx.fillStyle = "#1e2a30";
    ctx.fillRect(faceX - 28, faceY + 38, 56, 74);

    ctx.fillStyle = "rgba(0, 0, 0, 0.54)";
    ctx.fillRect(18, 18, 300, 42);
    ctx.fillStyle = "#e9fbf8";
    ctx.font = "22px Segoe UI, sans-serif";
    ctx.fillText("HY-DRONE-01 / U-Taphao", 34, 47);

    if (els.droneVideoImage) {
      els.droneVideoImage.hidden = true;
      els.droneVideoImage.classList.remove("is-live");
    }
    els.cameraVideo.hidden = false;
    els.cameraVideo.classList.remove("is-live");
    els.frameCanvas.classList.remove("is-hidden");
    els.cameraEmpty.classList.add("is-hidden");
    renderFaceBoxes([{ x: faceX - 44, y: faceY - 48, width: 88, height: 112 }]);

    state.people = R.loadPeople();
    const target = state.people.find((person) => person.status !== "found") || state.people[0];
    state.lastProbeVector = target ? R.jitterVector(target.vector, "demo-frame-hatyai-flood", 0.04) : R.vectorFromCanvas(canvas);
    state.lastSnapshot = canvasSnapshot();
    runMatch(state.lastProbeVector, { autoCapture: true, autoConfirm: false });
  }

  function renderMatches(matches, threshold) {
    if (!matches.length) {
      els.matchResults.innerHTML = `<div class="empty-note">ไม่มีเคสที่กำลังค้นหาในฐานข้อมูล</div>`;
      return;
    }

    els.matchResults.innerHTML = matches
      .map((match) => {
        const alert = match.score >= threshold;
        return `
          <article class="match-card ${alert ? "alert" : ""}">
            <div class="case-top">
              ${R.avatarHtml(match.person)}
              <div class="case-main">
                <strong>${R.escapeHtml(match.person.name)}</strong>
                <span>${R.escapeHtml(match.person.lastSeen || "-")} · confidence ${match.score}%</span>
              </div>
              <span class="status-badge ${alert ? "review" : "searching"}">${alert ? "ควรตรวจสอบ" : "ต่ำกว่าเกณฑ์"}</span>
            </div>
            <div class="score-bar" style="--score:${match.score}%"><span></span></div>
            <div class="match-actions">
              <button class="small-button" type="button" data-confirm="${R.escapeHtml(match.person.id)}" data-score="${match.score}">ยืนยันพบแล้ว</button>
              <button class="small-button" type="button" data-mark="${R.escapeHtml(match.person.id)}" data-score="${match.score}">บันทึก candidate</button>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function runMatch(probeVector, options = {}) {
    state.people = R.loadPeople();
    const threshold = Number(els.thresholdRange.value);
    const isAutoCapture = options.autoCapture === true;
    const activePeople = state.people.filter((person) => person.status !== "found");
    state.lastMatches = activePeople
      .map((person) => ({ person, score: R.cosineScore(probeVector, person.vector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);

    renderMatches(state.lastMatches, threshold);
    const top = state.lastMatches[0];
    if (top && top.score >= threshold) {
      updateScanStatus(`พบ candidate ${top.score}% ${options.autoConfirm === true ? "ยืนยันอัตโนมัติ" : "รอยืนยัน"}`, "is-match");
      updateAiHud({
        visible: true,
        stateText: "Detected",
        matchText: `${top.person.id} ${top.person.name}`,
        confidenceText: `Match confidence ${top.score}%`,
        modeText: options.autoConfirm === true ? "Auto confirm ready" : "Manual confirmation ready",
        tone: "match"
      });
      if (options.autoConfirm === true) {
        const now = Date.now();
        if (now - state.lastAutoConfirmAt > AUTO_CONFIRM_COOLDOWN_MS) {
          state.lastAutoConfirmAt = now;
          confirmFound(top.person.id, top.score, true);
          updateAiHud({
            visible: true,
            stateText: "Detected",
            matchText: `${top.person.id} auto confirmed`,
            confidenceText: `Match confidence ${top.score}%`,
            modeText: "Status sent to rescue database",
            tone: "confirmed"
          });
        }
      }
    } else {
      const confidenceText = top ? `Best candidate ${top.score}% / threshold ${threshold}%` : "No active rescue case";
      updateScanStatus(isAutoCapture ? "จับภาพแล้ว กำลังเทียบฐานข้อมูล" : "ยังไม่พบ match ที่ถึง threshold", "is-warning");
      updateAiHud({
        visible: true,
        stateText: "Detected",
        matchText: top ? `Comparing ${top.person.id}` : "No active case",
        confidenceText,
        modeText: "Auto capture continues",
        tone: "detected"
      });
    }
  }

  function createLog(person, score, status) {
    const { lat, lng } = readLocation();
    const log = {
      id: `LOG-${Date.now()}`,
      personId: person.id,
      personName: person.name,
      score,
      lat,
      lng,
      source: "HY-DRONE-01",
      status,
      snapshot: state.lastSnapshot,
      createdAt: new Date().toISOString()
    };
    state.logs.unshift(log);
    R.saveLogs(state.logs);
    return log;
  }

  function updatePersonStatus(personId, status, log) {
    state.people = R.loadPeople().map((person) => {
      if (person.id !== personId) return person;
      return {
        ...person,
        status,
        foundAt: status === "found" ? new Date().toISOString() : person.foundAt,
        foundLat: log?.lat ?? person.foundLat,
        foundLng: log?.lng ?? person.foundLng
      };
    });
    R.savePeople(state.people);
  }

  function ensureTrainedAiPerson(event) {
    const personId = String(event.person_id || "UNKNOWN");
    const existing = R.loadPeople().find((person) => person.id === personId);
    if (existing) return existing;

    const person = {
      id: personId,
      name: `Trained AI case ${personId}`,
      age: "",
      priority: "high",
      lastSeen: "Detected by Raspberry Pi SFace scanner",
      reporterContact: "Raspberry Pi edge AI",
      note: "Created from trained AI match event.",
      initials: personId.slice(0, 2).toUpperCase(),
      photo: "",
      vector: R.vectorFromText(personId),
      status: "searching",
      createdAt: new Date().toISOString(),
      foundAt: "",
      foundLat: "",
      foundLng: ""
    };
    state.people = [person, ...R.loadPeople()];
    R.savePeople(state.people);
    return person;
  }

  function createTrainedAiLog(event, person, status) {
    const log = {
      id: event.id || `SFACE-${Date.now()}`,
      personId: person.id,
      personName: person.name,
      score: Number(event.score) || 0,
      lat: Number(event.lat) || 7.0086,
      lng: Number(event.lng) || 100.4747,
      source: event.device_id || "HY-PI-DRONE-01",
      status,
      snapshot: state.lastSnapshot,
      createdAt: event.created_at || new Date().toISOString()
    };

    state.logs = R.loadLogs();
    if (!state.logs.some((item) => item.id === log.id)) {
      state.logs.unshift(log);
      R.saveLogs(state.logs);
    }
    return log;
  }

  function eventBoxFromTrainedAi(event) {
    const raw = event.bbox;
    if (!raw) return null;
    const values = Array.isArray(raw)
      ? { x: raw[0], y: raw[1], width: raw[2], height: raw[3] }
      : {
          x: raw.x ?? raw.left,
          y: raw.y ?? raw.top,
          width: raw.width ?? raw.w,
          height: raw.height ?? raw.h
        };
    const x = Number(values.x);
    const y = Number(values.y);
    const width = Number(values.width);
    const height = Number(values.height);
    if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) return null;
    return { x, y, width, height };
  }

  function renderTrainedAiResult(event, person, isMatch) {
    if (!els.matchResults) return;
    const score = Number(event.score) || 0;
    const threshold = Number(event.threshold || els.thresholdRange.value || 60);
    const time = event.created_at ? new Date(event.created_at).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }) : "--:--";
    els.matchResults.innerHTML = `
      <article class="match-card ${isMatch ? "alert" : ""}">
        <div class="case-top">
          ${R.avatarHtml(person)}
          <div class="case-main">
            <strong>${R.escapeHtml(person.name)}</strong>
            <span>OpenCV SFace trained AI · ${R.escapeHtml(event.detector || "YuNet")} · ${time}</span>
          </div>
          <span class="status-badge ${isMatch ? "found" : "review"}">${isMatch ? "พบแล้ว" : "รอตรวจสอบ"}</span>
        </div>
        <div class="score-bar" style="--score:${score}%"><span></span></div>
        <div class="match-actions">
          <button class="small-button" type="button" data-confirm="${R.escapeHtml(person.id)}" data-score="${score}">ยืนยันพบแล้ว</button>
          <button class="small-button" type="button" data-mark="${R.escapeHtml(person.id)}" data-score="${score}">บันทึก candidate</button>
        </div>
        <div class="empty-note">score ${score}% / threshold ${threshold}% · ${R.escapeHtml(event.device_id || "Raspberry Pi")}</div>
      </article>
    `;
  }

  function processTrainedAiEvent(event) {
    const eventId = event.id || `${event.device_id}-${event.created_at}-${event.person_id}-${event.score}`;
    if (state.processedTrainedAiIds.has(eventId)) return;
    state.processedTrainedAiIds.add(eventId);

    const threshold = Number(event.threshold || els.thresholdRange.value || 60);
    const score = Number(event.score) || 0;
    const isMatch = Boolean(event.is_match) || score >= threshold;
    const person = ensureTrainedAiPerson(event);
    const box = eventBoxFromTrainedAi(event);
    const sourceWidth = Number(event.frame_width || event.frameWidth) || els.frameCanvas.width;
    const sourceHeight = Number(event.frame_height || event.frameHeight) || els.frameCanvas.height;

    if (box) {
      renderFaceBoxes([box], sourceWidth, sourceHeight, {
        matchText: "OpenCV SFace trained AI",
        confidenceText: `Match confidence ${score}%`,
        modeText: isMatch ? "Status sent to rescue database" : "Waiting for threshold",
        tone: isMatch ? "match" : "detected"
      });
    }

    const log = createTrainedAiLog(
      event,
      person,
      isMatch ? `OpenCV SFace trained AI match >= ${threshold}%` : "OpenCV SFace candidate below threshold"
    );
    els.latInput.value = Number(log.lat).toFixed(6);
    els.lngInput.value = Number(log.lng).toFixed(6);

    if (isMatch && person.status !== "found") {
      updatePersonStatus(person.id, "found", log);
    } else if (!isMatch && person.status === "searching") {
      updatePersonStatus(person.id, "review", log);
    }

    renderTrainedAiResult(event, person, isMatch);
    setDroneConnection("connected", "OpenCV SFace trained AI linked");
    updateScanStatus(isMatch ? `SFace trained AI found ${person.id} ${score}%` : `SFace candidate ${person.id} ${score}%`, isMatch ? "is-match" : "is-warning");
    renderMissionMeta();
    renderAdminCases();
    renderPins();
  }

  async function pollTrainedAiMatches() {
    for (const url of TRAINED_AI_MATCH_URLS) {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) continue;
        const data = await response.json();
        const matches = Array.isArray(data.matches) ? data.matches : [];
        state.trainedAiEvents = matches;
        matches.forEach(processTrainedAiEvent);
        return true;
      } catch {
        continue;
      }
    }
    return false;
  }

  async function pollYoloDetections() {
    for (const url of YOLO_DETECTION_URLS) {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) continue;
        const data = await response.json();
        const event = data.latest || (Array.isArray(data.events) ? data.events.at(-1) : null);
        const now = Date.now();
        if (!event) {
          if (now - state.lastYoloBoxesAt > 1500) clearObjectBoxes();
          return true;
        }

        const eventTime = Date.parse(event.created_at || "");
        if (Number.isFinite(eventTime) && now - eventTime > 5000) {
          clearObjectBoxes();
          return true;
        }

        const detections = Array.isArray(event.detections) ? event.detections : [];
        const sourceWidth = Number(event.frame_width || event.frameWidth) || els.frameCanvas.width;
        const sourceHeight = Number(event.frame_height || event.frameHeight) || els.frameCanvas.height;
        if (detections.length) {
          renderYoloBoxes(detections, sourceWidth, sourceHeight);
        } else if (now - state.lastYoloBoxesAt > 1500) {
          clearObjectBoxes();
        }

        if (event.id !== state.lastYoloEventId) {
          state.lastYoloEventId = event.id;
          state.lastYoloAt = now;
          if (now - state.lastYoloStatusAt > 2500) {
            state.lastYoloStatusAt = now;
            setDroneConnection("connected", "YOLO VisDrone person detector linked");
            updateScanStatus(
              detections.length ? `YOLO detected ${detections.length} target(s)` : "YOLO scanning: no target",
              detections.length ? "is-scanning" : "is-warning"
            );
          }
        }
        return true;
      } catch {
        continue;
      }
    }
    return false;
  }

  function confirmFound(personId, score, isAuto = false) {
    const person = R.loadPeople().find((item) => item.id === personId);
    if (!person || person.status === "found") return;
    const log = createLog(person, score, isAuto ? "auto match พบแล้ว" : "ยืนยันพบแล้วโดยคนขับโดรน");
    updatePersonStatus(personId, "found", log);
    updateScanStatus(isAuto ? `พบอัตโนมัติ ${score}%` : "อัปเดตสถานะเป็นพบแล้ว", "is-match");
    renderMissionMeta();
    renderAdminCases();
    renderPins();
  }

  async function scanLiveFrame() {
    if (!state.stream || !els.cameraVideo.videoWidth || !els.cameraVideo.videoHeight) {
      return;
    }
    if (Date.now() - state.externalTrackingAt < 1200) {
      return;
    }

    const now = Date.now();
    if (now - state.lastAutoScanAt < AUTO_CAPTURE_EVERY_MS) {
      return;
    }

    state.lastAutoScanAt = now;
    const ctx = els.frameCanvas.getContext("2d");
    ctx.drawImage(els.cameraVideo, 0, 0, els.frameCanvas.width, els.frameCanvas.height);
    const detection = await detectFacesInFrame();
    if (!detection.boxes.length) {
      updateScanStatus("ยังไม่พบใบหน้าในเฟรม", "is-warning");
      return;
    }
    state.lastProbeVector = vectorFromDetectedFace(detection.boxes[0]);
    state.lastSnapshot = canvasSnapshot();
    runMatch(state.lastProbeVector, { autoCapture: true, autoConfirm: false });
  }

  function startAutoScan() {
    if (state.autoScanTimer) {
      clearInterval(state.autoScanTimer);
    }
    state.autoScanTimer = setInterval(scanLiveFrame, AUTO_SCAN_INTERVAL_MS);
  }

  function markCandidate(personId, score) {
    const person = R.loadPeople().find((item) => item.id === personId);
    if (!person) return;
    const log = createLog(person, score, "candidate รอตรวจสอบ");
    updatePersonStatus(personId, "review", log);
    updateScanStatus("บันทึก candidate แล้ว", "is-scanning");
    renderMissionMeta();
    renderAdminCases();
    renderPins();
  }

  function renderPins() {
    state.logs = R.loadLogs();
    const bounds = R.bounds;
    els.mapPins.innerHTML = state.logs
      .map((log, index) => {
        const x = R.clamp(((log.lng - bounds.minLng) / (bounds.maxLng - bounds.minLng)) * 100, 4, 96);
        const y = R.clamp(((bounds.maxLat - log.lat) / (bounds.maxLat - bounds.minLat)) * 100, 5, 95);
        return `<span class="pin" title="${R.escapeHtml(log.personName)} ${R.escapeHtml(log.score)}%" style="left:${x}%; top:${y}%; z-index:${30 - index};"></span>`;
      })
      .join("");
  }

  function renderAdminCases() {
    state.people = R.loadPeople();
    state.logs = R.loadLogs();
    const rows = state.people.slice(0, 8);
    if (!rows.length) {
      els.adminCaseList.innerHTML = `<div class="empty-note">ยังไม่มีประกาศจากฝั่งประชาชน</div>`;
      return;
    }

    els.adminCaseList.innerHTML = rows
      .map((person) => `
        <article class="case-card compact-card">
          <div class="case-top">
            ${R.avatarHtml(person)}
            <div class="case-main">
              <strong>${R.escapeHtml(person.name)}</strong>
              <span>${R.escapeHtml(person.lastSeen || "-")} · ${R.escapeHtml(person.reporterContact || "ไม่มีเบอร์ติดต่อ")}</span>
            </div>
            <span class="status-badge ${R.escapeHtml(person.status)}">${R.statusLabel(person.status)}</span>
          </div>
        </article>
      `)
      .join("");
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      updateScanStatus("เบราว์เซอร์ไม่รองรับกล้อง", "is-warning");
      return;
    }

    try {
      if (state.stream) {
        state.stream.getTracks().forEach((track) => track.stop());
      }

      const cameraProfiles = [
        { video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
        { video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
        { video: true, audio: false }
      ];
      let lastError = null;
      for (const constraints of cameraProfiles) {
        try {
          state.stream = await navigator.mediaDevices.getUserMedia(constraints);
          break;
        } catch (error) {
          lastError = error;
        }
      }
      if (!state.stream) throw lastError || new Error("Camera unavailable");

      if (els.droneVideoImage) {
        els.droneVideoImage.hidden = true;
        els.droneVideoImage.classList.remove("is-live");
        els.droneVideoImage.src = "";
      }
      els.cameraVideo.hidden = false;
      els.cameraVideo.srcObject = state.stream;
      await els.cameraVideo.play().catch(() => {});
      els.cameraVideo.classList.add("is-live");
      els.frameCanvas.classList.add("is-hidden");
      els.cameraEmpty.classList.add("is-hidden");
      clearFaceBoxes();
      startAutoScan();
      updateScanStatus("กล้องพร้อม auto scan", "is-scanning");
    } catch (error) {
      console.warn(error);
      updateScanStatus("เปิดกล้องไม่สำเร็จ", "is-warning");
    }
  }

  async function captureFromVideo() {
    if (!els.cameraVideo.videoWidth || !els.cameraVideo.videoHeight) {
      updateScanStatus("ยังไม่มีภาพจากกล้อง", "is-warning");
      return;
    }
    const ctx = els.frameCanvas.getContext("2d");
    ctx.drawImage(els.cameraVideo, 0, 0, els.frameCanvas.width, els.frameCanvas.height);
    els.cameraVideo.classList.remove("is-live");
    els.frameCanvas.classList.remove("is-hidden");
    const detection = await detectFacesInFrame();
    if (!detection.boxes.length) {
      updateScanStatus("ยังไม่พบใบหน้าในภาพ", "is-warning");
      return;
    }
    state.lastProbeVector = vectorFromDetectedFace(detection.boxes[0]);
    state.lastSnapshot = canvasSnapshot();
    runMatch(state.lastProbeVector, { autoCapture: true, autoConfirm: false });
  }

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    updateScanStatus("กำลังอ่านภาพ", "is-scanning");
    const src = await R.fileToDataUrl(file);
    const image = await R.loadImage(src);
    drawImageToFrame(image);
    const detection = await detectFacesInFrame();
    if (!detection.boxes.length) {
      updateScanStatus("ยังไม่พบใบหน้าในภาพ", "is-warning");
      event.target.value = "";
      return;
    }
    state.lastProbeVector = vectorFromDetectedFace(detection.boxes[0]);
    state.lastSnapshot = canvasSnapshot();
    runMatch(state.lastProbeVector, { autoCapture: true, autoConfirm: false });
    event.target.value = "";
  }

  function useDeviceLocation() {
    if (!navigator.geolocation) {
      updateScanStatus("ไม่รองรับ GPS", "is-warning");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        els.latInput.value = position.coords.latitude.toFixed(6);
        els.lngInput.value = position.coords.longitude.toFixed(6);
        updateScanStatus("อัปเดตพิกัดแล้ว", "");
      },
      () => updateScanStatus("ดึงพิกัดไม่สำเร็จ", "is-warning"),
      { enableHighAccuracy: true, timeout: 7000 }
    );
  }

  function toggleRecording() {
    state.drone.recording = !state.drone.recording;
    renderRecording();
    pushCommand(state.drone.recording ? "เริ่มบันทึกวิดีโอ" : "หยุดบันทึกวิดีโอ", state.drone.mode);
    updateScanStatus(state.drone.recording ? "กำลังบันทึกวิดีโอ" : "หยุดบันทึกวิดีโอแล้ว", state.drone.recording ? "is-scanning" : "");
  }

  function exportLogs() {
    state.logs = R.loadLogs();
    const header = ["created_at", "case_id", "name", "confidence", "lat", "lng", "source", "status"];
    const rows = state.logs.map((log) => [
      log.createdAt,
      log.personId,
      log.personName,
      log.score,
      log.lat,
      log.lng,
      log.source,
      log.status
    ]);
    const csv = [header, ...rows].map((row) => row.map(R.escapeCsvCell).join(",")).join("\n");
    const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `hatyai-rescue-log-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function setFullscreenState(active) {
    pageFullscreenActive = active;
    syncViewportVars();
    document.documentElement.classList.toggle("is-fullscreen-view", active);
    document.body.classList.toggle("is-fullscreen-view", active);
    document.body.classList.toggle("is-mobile-fullscreen-fallback", active && !getFullscreenElement());
    if (active) {
      nudgeMobileBrowserChrome();
    } else {
      window.scrollTo(0, 0);
    }
    if (!els.fullscreenBtn) return;
    els.fullscreenBtn.classList.toggle("is-active", active);
    els.fullscreenBtn.setAttribute("aria-pressed", active ? "true" : "false");
    els.fullscreenBtn.setAttribute("title", active ? "ออกจากเต็มจอ" : "เต็มจอ");
    els.fullscreenBtn.setAttribute("aria-label", active ? "ออกจากเต็มจอ" : "เต็มจอ");
    const label = els.fullscreenBtn.querySelector("span");
    if (label) label.textContent = active ? "EXIT" : "FULL";
  }

  function getFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement || null;
  }

  async function requestNativeFullscreen(target) {
    if (isIOSLike) return;
    if (target.requestFullscreen) {
      try {
        await target.requestFullscreen({ navigationUI: "hide" });
        return;
      } catch {
        await target.requestFullscreen();
        return;
      }
    }

    const prefixedRequest = target.webkitRequestFullscreen || target.msRequestFullscreen;
    if (prefixedRequest) {
      await prefixedRequest.call(target);
    }
  }

  async function exitNativeFullscreen() {
    const exitFullscreen =
      document.exitFullscreen || document.webkitExitFullscreen || document.msExitFullscreen;
    if (exitFullscreen) {
      await exitFullscreen.call(document);
    }
  }

  function syncFullscreenState() {
    if (getFullscreenElement()) {
      nativeFullscreenActive = true;
      setFullscreenState(true);
      return;
    }

    if (nativeFullscreenActive) {
      nativeFullscreenActive = false;
      setFullscreenState(false);
      return;
    }

    setFullscreenState(pageFullscreenActive);
  }

  async function toggleFullscreen() {
    const target = document.documentElement || els.droneApp;
    const entering = !pageFullscreenActive && !getFullscreenElement();

    if (!entering) {
      setFullscreenState(false);
      nativeFullscreenActive = false;
      if (getFullscreenElement()) {
        try {
          await exitNativeFullscreen();
        } catch (error) {
          console.warn(error);
        }
      }
      return;
    }

    setFullscreenState(true);
    try {
      if (!getFullscreenElement()) {
        await requestNativeFullscreen(target);
        nativeFullscreenActive = Boolean(getFullscreenElement());
      }
      if (nativeFullscreenActive && screen.orientation?.lock) {
        try {
          await screen.orientation.lock("landscape");
        } catch {
          // Browser may reject orientation lock unless installed as an app.
        }
      }
    } catch (error) {
      console.warn(error);
    }
    syncFullscreenState();
  }

  function bindEvents() {
    els.startCameraBtn.addEventListener("click", startCamera);
    els.captureBtn.addEventListener("click", captureFromVideo);
    els.recordBtn?.addEventListener("click", toggleRecording);
    els.demoFrameBtn.addEventListener("click", drawDemoFrame);
    els.probeUpload.addEventListener("change", handleUpload);
    els.gpsBtn.addEventListener("click", useDeviceLocation);
    els.exportBtn.addEventListener("click", exportLogs);
    els.fullscreenBtn?.addEventListener("click", toggleFullscreen);
    window.addEventListener("resize", syncViewportVars);
    window.addEventListener("orientationchange", () => {
      setTimeout(nudgeMobileBrowserChrome, 250);
      setTimeout(nudgeMobileBrowserChrome, 700);
    });
    window.visualViewport?.addEventListener("resize", syncViewportVars);
    window.visualViewport?.addEventListener("scroll", syncViewportVars);
    document.addEventListener("fullscreenchange", syncFullscreenState);
    document.addEventListener("webkitfullscreenchange", syncFullscreenState);
    document.addEventListener("MSFullscreenChange", syncFullscreenState);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && pageFullscreenActive && !getFullscreenElement()) {
        setFullscreenState(false);
      }
    });
    els.thresholdRange.addEventListener("input", () => {
      els.thresholdValue.textContent = `${els.thresholdRange.value}%`;
      if (state.lastProbeVector) runMatch(state.lastProbeVector);
    });
    els.commandButtons.forEach((button) => {
      button.addEventListener("click", () => pushCommand(button.dataset.command, button.dataset.mode));
    });
    els.matchResults.addEventListener("click", (event) => {
      const confirmButton = event.target.closest("[data-confirm]");
      const markButton = event.target.closest("[data-mark]");
      if (confirmButton) {
        confirmFound(confirmButton.dataset.confirm, Number(confirmButton.dataset.score));
      }
      if (markButton) {
        markCandidate(markButton.dataset.mark, Number(markButton.dataset.score));
      }
    });
    window.addEventListener("storage", () => {
      renderMissionMeta();
      renderAdminCases();
      renderPins();
    });
    document.addEventListener("drone:access-unlocked", autoConnectFlightSession);
  }

  syncViewportVars();
  bindEvents();
  renderMissionMeta();
  renderTelemetry();
  renderRecording();
  renderCommandLog();
  renderAdminCases();
  renderPins();
  pollTrainedAiMatches();
  pollYoloDetections();
  updateScanStatus("พร้อมสแกน", "");
  if (!document.body.classList.contains("is-access-locked")) {
    window.setTimeout(autoConnectFlightSession, 0);
  }
  setInterval(tickTelemetry, 3500);
  setInterval(renderMissionMeta, 15000);
  setInterval(pollTrainedAiMatches, TRAINED_AI_POLL_MS);
  setInterval(pollYoloDetections, YOLO_DETECTION_POLL_MS);
})();
