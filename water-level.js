(() => {
  const config = window.HatyaiRescueConfig || {};
  const endpointStorageKey = "hatyai-water-level-url";
  const calibrationStorageKey = "hatyai-water-calibration";
  const geofenceStorageKey = "hatyai-water-geofence";
  const sameOriginUrl = `${window.location.origin}/api/yolo/water-level`;
  const localUrl = "http://127.0.0.1:4173/api/yolo/water-level";
  const defaultGeofence = {
    name: config.waterGeofenceName || "พื้นที่ภารกิจหาดใหญ่",
    centerLat: Number(config.waterGeofenceCenterLat || 7.0086),
    centerLng: Number(config.waterGeofenceCenterLng || 100.4747),
    radiusM: Number(config.waterGeofenceRadiusM || 30000)
  };
  const state = {
    history: [],
    latest: null,
    photoDataUrl: "",
    photoMime: "image/jpeg",
    photoSize: 0,
    location: null,
    stream: null,
    calibration: loadJson(calibrationStorageKey, {
      reference_height_cm: 200,
      reference_top_y: 80,
      reference_bottom_y: 460,
      alert_cm: 80,
      critical_cm: 120
    }),
    geofence: loadJson(geofenceStorageKey, defaultGeofence)
  };
  const els = {
    connection: document.querySelector("#waterConnectionStatus"),
    updatedAt: document.querySelector("#waterUpdatedAt"),
    severity: document.querySelector("#waterSeverity"),
    levelCm: document.querySelector("#waterLevelCm"),
    levelPercent: document.querySelector("#waterLevelPercent"),
    confidence: document.querySelector("#waterConfidence"),
    fill: document.querySelector("#waterGaugeFill"),
    line: document.querySelector("#waterGaugeLine"),
    label: document.querySelector("#waterGaugeLabel"),
    endpoint: document.querySelector("#waterEndpointInput"),
    save: document.querySelector("#saveWaterEndpointBtn"),
    demo: document.querySelector("#demoWaterEventBtn"),
    detections: document.querySelector("#waterDetectionList"),
    chart: document.querySelector("#waterHistoryChart"),
    history: document.querySelector("#waterHistoryList"),
    raw: document.querySelector("#waterRawEvent"),
    calibrationHeight: document.querySelector("#calibrationHeightCm"),
    calibrationTop: document.querySelector("#calibrationTopY"),
    calibrationBottom: document.querySelector("#calibrationBottomY"),
    calibrationAlert: document.querySelector("#calibrationAlertCm"),
    calibrationCritical: document.querySelector("#calibrationCriticalCm"),
    calibrationSave: document.querySelector("#saveCalibrationBtn"),
    calibrationJson: document.querySelector("#waterCalibrationJson"),
    cameraVideo: document.querySelector("#mobileCameraVideo"),
    photoPreview: document.querySelector("#mobilePhotoPreview"),
    photoEmpty: document.querySelector("#mobilePhotoEmpty"),
    photoCanvas: document.querySelector("#mobilePhotoCanvas"),
    startCamera: document.querySelector("#startMobileCameraBtn"),
    capturePhoto: document.querySelector("#captureMobilePhotoBtn"),
    photoInput: document.querySelector("#mobilePhotoInput"),
    captureLocation: document.querySelector("#captureMobileLocationBtn"),
    locationStatus: document.querySelector("#mobileLocationStatus"),
    geofenceStatus: document.querySelector("#mobileGeofenceStatus"),
    locationLabel: document.querySelector("#mobileLocationLabel"),
    manualLevel: document.querySelector("#mobileManualLevelCm"),
    reporterContact: document.querySelector("#mobileReporterContact"),
    note: document.querySelector("#mobileNote"),
    submitMobile: document.querySelector("#submitMobileReportBtn")
  };

  function loadJson(key, fallback) {
    try {
      const value = JSON.parse(window.localStorage.getItem(key));
      return value && typeof value === "object" ? { ...fallback, ...value } : fallback;
    } catch {
      return fallback;
    }
  }

  function saveJson(key, value) {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore localStorage failures.
    }
  }

  function savedEndpoint() {
    try {
      return window.localStorage.getItem(endpointStorageKey) || "";
    } catch {
      return "";
    }
  }

  function saveEndpoint(value) {
    try {
      window.localStorage.setItem(endpointStorageKey, value);
    } catch {
      // Ignore localStorage failures.
    }
  }

  function urls() {
    return Array.from(new Set([savedEndpoint(), config.waterLevelUrl, sameOriginUrl, localUrl].map((value) => String(value || "").trim()).filter(Boolean)));
  }

  function num(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function formatCm(value) {
    const number = num(value);
    return number === null ? "-- cm" : `${number.toFixed(1)} cm`;
  }

  function formatPct(value) {
    const number = num(value);
    return number === null ? "--%" : `${number.toFixed(1)}%`;
  }

  function severityFor(event, levelCm) {
    const raw = String(event?.severity || "").toLowerCase();
    if (["normal", "watch", "warning", "critical", "unknown"].includes(raw)) return raw;
    if (levelCm === null) return "unknown";
    const alertCm = num(event?.alert_cm ?? event?.alertCm) ?? state.calibration.alert_cm;
    const criticalCm = num(event?.critical_cm ?? event?.criticalCm) ?? state.calibration.critical_cm;
    if (levelCm >= criticalCm) return "critical";
    if (levelCm >= alertCm) return "warning";
    if (levelCm > 0) return "watch";
    return "normal";
  }

  function severityLabel(severity) {
    return { normal: "ปกติ", watch: "เฝ้าระวัง", warning: "เตือนภัย", critical: "วิกฤต", unknown: "ไม่ทราบ" }[severity] || "ไม่ทราบ";
  }

  function chip(element, text, className = "") {
    if (!element) return;
    element.className = `status-chip ${className}`.trim();
    element.textContent = text;
  }

  function supabaseConfig() {
    const localUrlValue = window.localStorage.getItem("hatyai-supabase-url") || "";
    const localKey = window.localStorage.getItem("hatyai-supabase-publishable-key") || "";
    const supabaseUrl = String(config.supabaseUrl || localUrlValue).replace(/\/+$/, "");
    const key = String(config.supabasePublishableKey || localKey);
    return { supabaseUrl, key };
  }

  async function supabaseFetch(path, options = {}) {
    const { supabaseUrl, key } = supabaseConfig();
    if (!supabaseUrl || !key) return null;
    const response = await fetch(`${supabaseUrl}${path}`, {
      ...options,
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        Accept: "application/json",
        ...(options.headers || {})
      }
    });
    if (!response.ok) throw new Error(`supabase_water_${response.status}`);
    return response.status === 204 ? null : response.json();
  }

  function distanceMeters(aLat, aLng, bLat, bLng) {
    const radius = 6371000;
    const toRad = (value) => (value * Math.PI) / 180;
    const dLat = toRad(bLat - aLat);
    const dLng = toRad(bLng - aLng);
    const lat1 = toRad(aLat);
    const lat2 = toRad(bLat);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
    return 2 * radius * Math.asin(Math.min(1, Math.sqrt(h)));
  }

  function geofenceResult(latitude, longitude, accuracy = null) {
    const distance = distanceMeters(latitude, longitude, state.geofence.centerLat, state.geofence.centerLng);
    return {
      geofence_name: state.geofence.name,
      geofence_center_lat: state.geofence.centerLat,
      geofence_center_lng: state.geofence.centerLng,
      geofence_radius_m: state.geofence.radiusM,
      geofence_distance_m: Math.round(distance),
      geofence_valid: distance <= state.geofence.radiusM,
      location_accuracy_m: accuracy === null ? null : Math.round(accuracy)
    };
  }

  function normalizeEvent(event) {
    const createdAt = event.created_at || event.createdAt || new Date().toISOString();
    const levelCm = num(event.level_cm ?? event.water_level_cm ?? event.levelCm);
    const refHeight = num(event.reference_height_cm ?? event.referenceHeightCm) ?? state.calibration.reference_height_cm;
    const fallbackPct = levelCm === null ? null : (levelCm / Math.max(1, refHeight)) * 100;
    const levelPercent = clamp(num(event.level_percent ?? event.levelPercent) ?? fallbackPct ?? 0, 0, 100);
    const confidence = num(event.confidence ?? event.score ?? event.conf);
    const severity = severityFor(event, levelCm);
    return { ...event, created_at: createdAt, level_cm: levelCm, level_percent: levelPercent, confidence, severity };
  }

  function mergeHistory(events) {
    const map = new Map(state.history.map((event) => [event.event_id || event.id || event.created_at, event]));
    events.map(normalizeEvent).forEach((event) => map.set(event.event_id || event.id || event.created_at, event));
    state.history = Array.from(map.values()).sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 60);
  }

  function renderDetections(detections = []) {
    if (!els.detections) return;
    if (!detections.length) {
      els.detections.innerHTML = `<div class="empty-note">ยังไม่พบกล่อง/หน้ากาก water จาก YOLO</div>`;
      return;
    }
    els.detections.innerHTML = detections
      .slice(0, 8)
      .map((detection, index) => {
        const name = detection.class_name || detection.label || `water-${index + 1}`;
        const confidence = num(detection.confidence ?? detection.conf);
        const box = detection.bbox || [detection.x, detection.y, detection.width, detection.height].filter((item) => item !== undefined);
        const boxText = Array.isArray(box) ? box.map((item) => Number(item).toFixed(0)).join(", ") : "-";
        return `<div class="water-detection-item"><strong>${name}</strong><span>${confidence === null ? "--" : `${(confidence * 100).toFixed(1)}%`} · bbox ${boxText}</span></div>`;
      })
      .join("");
  }

  function renderHistory() {
    if (els.chart) {
      const bars = state.history.slice(0, 16).reverse();
      els.chart.innerHTML = bars.length
        ? bars
            .map((event) => {
              const height = clamp(num(event.level_percent) ?? 0, 4, 100);
              return `<span class="water-history-bar water-severity-${event.severity}" style="height:${height}%" title="${formatCm(event.level_cm)}"></span>`;
            })
            .join("")
        : `<div class="empty-note">ยังไม่มีประวัติระดับน้ำ</div>`;
    }
    if (els.history) {
      els.history.innerHTML = state.history.length
        ? state.history
            .slice(0, 8)
            .map((event) => {
              const source = event.source_type || event.method || "yolo";
              const geo = event.geofence_valid === true ? "อยู่ในพื้นที่" : event.geofence_valid === false ? "นอกพื้นที่" : "ไม่ทราบพื้นที่";
              return `<div class="water-history-item"><strong>${formatCm(event.level_cm)} · ${severityLabel(event.severity)}</strong><span>${new Date(event.created_at).toLocaleString("th-TH")} · ${source} · ${geo}</span></div>`;
            })
            .join("")
        : `<div class="empty-note">ยังไม่มีข้อมูลประวัติ</div>`;
    }
  }

  function renderEvent(rawEvent, sourceUrl = "") {
    const event = normalizeEvent(rawEvent);
    state.latest = event;
    mergeHistory([event]);
    const createdAt = event.created_at;
    const ageMs = Date.now() - new Date(createdAt).getTime();
    let host = "";
    try {
      host = sourceUrl.startsWith("demo:") ? "demo" : new URL(sourceUrl).host;
    } catch {
      host = "";
    }
    chip(els.connection, `${ageMs < 12000 ? "LIVE" : "ข้อมูลเก่า"}${host ? ` · ${host}` : ""}`, ageMs < 12000 ? "good" : "is-warning");
    chip(els.severity, severityLabel(event.severity).toUpperCase(), `water-severity-${event.severity}`);
    if (els.updatedAt) els.updatedAt.textContent = `อัปเดตล่าสุด ${new Date(createdAt).toLocaleString("th-TH")}`;
    if (els.levelCm) els.levelCm.textContent = formatCm(event.level_cm);
    if (els.levelPercent) els.levelPercent.textContent = formatPct(event.level_percent);
    if (els.confidence) els.confidence.textContent = event.confidence === null ? "--%" : `${(event.confidence * 100).toFixed(1)}%`;
    if (els.fill) els.fill.style.height = `${event.level_percent}%`;
    if (els.line) els.line.style.bottom = `${event.level_percent}%`;
    if (els.label) els.label.textContent = event.level_cm === null ? "ไม่พบแนวน้ำ" : `${formatCm(event.level_cm)} · ${severityLabel(event.severity)}`;
    renderDetections(Array.isArray(event.detections) ? event.detections : []);
    renderHistory();
    if (els.raw) els.raw.textContent = JSON.stringify(event, null, 2);
  }

  function renderNoData(message = "รอข้อมูล YOLO") {
    chip(els.connection, message, "is-scanning");
    chip(els.severity, "UNKNOWN", "water-severity-unknown");
    if (els.updatedAt) els.updatedAt.textContent = "ยังไม่มีข้อมูลจากภาคสนาม";
    if (els.levelCm) els.levelCm.textContent = "-- cm";
    if (els.levelPercent) els.levelPercent.textContent = "--%";
    if (els.confidence) els.confidence.textContent = "--%";
    if (els.fill) els.fill.style.height = "0%";
    if (els.line) els.line.style.bottom = "0%";
    if (els.label) els.label.textContent = "รอ YOLO";
    renderDetections([]);
    renderHistory();
  }

  async function loadSupabaseHistory() {
    const query = "/rest/v1/water_level_events?select=event_id,created_at,device_id,source_type,method,level_cm,level_percent,confidence,severity,latitude,longitude,location_accuracy_m,geofence_name,geofence_distance_m,geofence_valid,location_label,note&order=created_at.desc&limit=60";
    const rows = await supabaseFetch(query, { cache: "no-store" });
    if (Array.isArray(rows)) {
      mergeHistory(rows);
      if (rows[0] && !state.latest) renderEvent(rows[0], "supabase://history");
      renderHistory();
    }
  }

  async function insertSupabaseEvent(event) {
    await supabaseFetch("/rest/v1/water_level_events", {
      method: "POST",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify(event)
    });
  }

  async function poll() {
    for (const url of urls()) {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) continue;
        const data = await response.json();
        const events = Array.isArray(data.events) ? data.events : [];
        if (events.length) mergeHistory(events);
        const event = data.latest || data.event || events[0];
        if (event) {
          renderEvent(event, url);
          try {
            await loadSupabaseHistory();
          } catch {
            // History is optional.
          }
          return;
        }
      } catch {
        // Try next endpoint.
      }
    }
    try {
      await loadSupabaseHistory();
    } catch {
      // History is optional.
    }
    if (state.latest) renderEvent(state.latest, "cache://latest");
    else renderNoData("ยังเชื่อมต่อ YOLO ไม่ได้");
  }

  async function postEvent(event) {
    let posted = false;
    for (const url of urls()) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(event)
        });
        if (!response.ok) continue;
        const data = await response.json();
        renderEvent(data.event || event, url);
        posted = true;
        break;
      } catch {
        // Try next endpoint.
      }
    }
    if (!posted) {
      try {
        await insertSupabaseEvent(event);
        renderEvent(event, "supabase://insert");
        posted = true;
      } catch {
        renderEvent(event, "local://offline");
      }
    }
    return posted;
  }

  function renderCalibration() {
    if (els.calibrationHeight) els.calibrationHeight.value = state.calibration.reference_height_cm;
    if (els.calibrationTop) els.calibrationTop.value = state.calibration.reference_top_y;
    if (els.calibrationBottom) els.calibrationBottom.value = state.calibration.reference_bottom_y;
    if (els.calibrationAlert) els.calibrationAlert.value = state.calibration.alert_cm;
    if (els.calibrationCritical) els.calibrationCritical.value = state.calibration.critical_cm;
    if (els.calibrationJson) {
      els.calibrationJson.textContent = JSON.stringify(
        {
          water_reference_height_cm: state.calibration.reference_height_cm,
          water_reference_top_y: state.calibration.reference_top_y,
          water_reference_bottom_y: state.calibration.reference_bottom_y,
          water_alert_cm: state.calibration.alert_cm,
          water_critical_cm: state.calibration.critical_cm,
          geofence_name: state.geofence.name,
          geofence_center_lat: state.geofence.centerLat,
          geofence_center_lng: state.geofence.centerLng,
          geofence_radius_m: state.geofence.radiusM
        },
        null,
        2
      );
    }
  }

  function saveCalibration() {
    state.calibration = {
      reference_height_cm: num(els.calibrationHeight?.value) || 200,
      reference_top_y: num(els.calibrationTop?.value) || 80,
      reference_bottom_y: num(els.calibrationBottom?.value) || 460,
      alert_cm: num(els.calibrationAlert?.value) || 80,
      critical_cm: num(els.calibrationCritical?.value) || 120
    };
    saveJson(calibrationStorageKey, state.calibration);
    renderCalibration();
    chip(els.connection, "บันทึกคาลิเบรตแล้ว", "good");
  }

  function updateLocationUI() {
    if (!state.location) {
      if (els.locationStatus) els.locationStatus.textContent = "ยังไม่ได้รับพิกัด";
      chip(els.geofenceStatus, "ยังไม่เช็กพิกัด", "water-severity-unknown");
      return;
    }
    const geo = geofenceResult(state.location.latitude, state.location.longitude, state.location.accuracy);
    if (els.locationStatus) {
      els.locationStatus.textContent = `พิกัด ${state.location.latitude.toFixed(6)}, ${state.location.longitude.toFixed(6)} · ห่างศูนย์ ${geo.geofence_distance_m.toLocaleString("th-TH")} ม. · ความแม่นยำ ~${geo.location_accuracy_m || "-"} ม.`;
    }
    chip(els.geofenceStatus, geo.geofence_valid ? "อยู่ในพื้นที่จริง" : "อยู่นอกพื้นที่", geo.geofence_valid ? "good" : "is-warning");
  }

  function readImageToCanvas(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => {
        const maxSide = 960;
        const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
        const width = Math.max(1, Math.round(image.width * scale));
        const height = Math.max(1, Math.round(image.height * scale));
        const canvas = els.photoCanvas || document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        canvas.getContext("2d").drawImage(image, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.72);
        resolve({ dataUrl, mime: "image/jpeg", size: Math.round((dataUrl.length * 3) / 4) });
      };
      image.onerror = reject;
      image.src = source;
    });
  }

  function setPhoto(dataUrl, mime, size) {
    state.photoDataUrl = dataUrl;
    state.photoMime = mime;
    state.photoSize = size;
    if (els.photoPreview) {
      els.photoPreview.src = dataUrl;
      els.photoPreview.hidden = false;
    }
    if (els.photoEmpty) els.photoEmpty.classList.add("is-hidden");
  }

  async function startCamera() {
    if (!navigator.mediaDevices?.getUserMedia) {
      chip(els.geofenceStatus, "เบราว์เซอร์ไม่รองรับกล้อง", "is-warning");
      return;
    }
    state.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: false });
    if (els.cameraVideo) {
      els.cameraVideo.srcObject = state.stream;
      els.cameraVideo.hidden = false;
      await els.cameraVideo.play();
    }
    if (els.photoEmpty) els.photoEmpty.classList.add("is-hidden");
  }

  async function captureCameraPhoto() {
    if (!els.cameraVideo || !els.cameraVideo.videoWidth) return;
    const canvas = els.photoCanvas || document.createElement("canvas");
    canvas.width = els.cameraVideo.videoWidth;
    canvas.height = els.cameraVideo.videoHeight;
    canvas.getContext("2d").drawImage(els.cameraVideo, 0, 0);
    const compressed = await readImageToCanvas(canvas.toDataURL("image/jpeg", 0.85));
    setPhoto(compressed.dataUrl, compressed.mime, compressed.size);
  }

  function getLocation() {
    if (!navigator.geolocation) {
      chip(els.geofenceStatus, "เบราว์เซอร์ไม่รองรับ GPS", "is-warning");
      return;
    }
    if (els.locationStatus) els.locationStatus.textContent = "กำลังจับ GPS...";
    navigator.geolocation.getCurrentPosition(
      (position) => {
        state.location = {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          captured_at: new Date().toISOString()
        };
        updateLocationUI();
      },
      (error) => {
        if (els.locationStatus) els.locationStatus.textContent = `จับ GPS ไม่สำเร็จ: ${error.message}`;
        chip(els.geofenceStatus, "GPS ไม่สำเร็จ", "is-warning");
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 30000 }
    );
  }

  async function submitMobileReport() {
    if (!state.location) {
      getLocation();
      chip(els.geofenceStatus, "กรุณาจับ GPS ก่อนส่ง", "is-warning");
      return;
    }
    if (!state.photoDataUrl) {
      chip(els.geofenceStatus, "กรุณาถ่ายหรือเลือกรูปก่อน", "is-warning");
      return;
    }
    if (state.photoSize > 950000) {
      chip(els.geofenceStatus, "รูปใหญ่เกินไป กรุณาถ่ายใหม่", "is-warning");
      return;
    }
    const geo = geofenceResult(state.location.latitude, state.location.longitude, state.location.accuracy);
    const levelCm = num(els.manualLevel?.value);
    const event = {
      event_id: `MOBILE-${Date.now().toString(36).toUpperCase()}`,
      created_at: new Date().toISOString(),
      device_id: "MOBILE-WATER",
      source_type: "mobile_photo",
      method: "mobile-geotagged-photo",
      level_cm: levelCm,
      level_percent: levelCm === null ? null : clamp((levelCm / Math.max(1, state.calibration.reference_height_cm)) * 100, 0, 100),
      reference_height_cm: state.calibration.reference_height_cm,
      alert_cm: state.calibration.alert_cm,
      critical_cm: state.calibration.critical_cm,
      confidence: null,
      severity: severityFor({}, levelCm),
      latitude: state.location.latitude,
      longitude: state.location.longitude,
      location_label: els.locationLabel?.value.trim() || "",
      reporter_contact: els.reporterContact?.value.trim() || "",
      note: els.note?.value.trim() || "",
      photo_data_url: state.photoDataUrl,
      photo_mime: state.photoMime,
      photo_size_bytes: state.photoSize,
      ...geo
    };
    await postEvent(event);
    chip(els.geofenceStatus, geo.geofence_valid ? "ส่งแล้ว · อยู่ในพื้นที่" : "ส่งแล้ว · นอกพื้นที่", geo.geofence_valid ? "good" : "is-warning");
  }

  function demoEvent() {
    renderEvent(
      {
        event_id: `DEMO-${Date.now().toString(36).toUpperCase()}`,
        created_at: new Date().toISOString(),
        device_id: "DEMO-WATER-01",
        source_type: "demo",
        method: "ultralytics-yolo-water-level-demo",
        level_cm: 92.4,
        level_percent: 46.2,
        reference_height_cm: 200,
        confidence: 0.87,
        severity: "warning",
        geofence_valid: true,
        detections: [
          { class_name: "flood-water", confidence: 0.87, bbox: [82, 244, 980, 312] },
          { class_name: "waterline", confidence: 0.81, bbox: [90, 236, 960, 24] }
        ]
      },
      "demo://local"
    );
  }

  if (els.endpoint) els.endpoint.value = savedEndpoint() || config.waterLevelUrl || sameOriginUrl;
  els.save?.addEventListener("click", () => {
    saveEndpoint(els.endpoint?.value.trim() || "");
    chip(els.connection, "บันทึก endpoint แล้ว", "good");
    poll();
  });
  els.demo?.addEventListener("click", demoEvent);
  els.calibrationSave?.addEventListener("click", saveCalibration);
  els.startCamera?.addEventListener("click", () => startCamera().catch((error) => chip(els.geofenceStatus, `เปิดกล้องไม่ได้: ${error.message}`, "is-warning")));
  els.capturePhoto?.addEventListener("click", () => captureCameraPhoto().catch((error) => chip(els.geofenceStatus, `ถ่ายรูปไม่ได้: ${error.message}`, "is-warning")));
  els.captureLocation?.addEventListener("click", getLocation);
  els.submitMobile?.addEventListener("click", () => submitMobileReport().catch((error) => chip(els.geofenceStatus, `ส่งไม่สำเร็จ: ${error.message}`, "is-warning")));
  els.photoInput?.addEventListener("change", async () => {
    const file = els.photoInput.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      const compressed = await readImageToCanvas(String(reader.result));
      setPhoto(compressed.dataUrl, compressed.mime, compressed.size);
    };
    reader.readAsDataURL(file);
  });

  renderCalibration();
  updateLocationUI();
  renderNoData();
  poll();
  window.setInterval(poll, 3000);
})();
