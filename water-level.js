(() => {
  const config = window.HatyaiRescueConfig || {};
  const storageKey = "hatyai-water-level-url";
  const localUrl = "http://127.0.0.1:4173/api/yolo/water-level";
  const sameOriginUrl = window.location.port === "4173" ? `${window.location.origin}/api/yolo/water-level` : "";
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
    raw: document.querySelector("#waterRawEvent")
  };

  function savedEndpoint() {
    try { return window.localStorage.getItem(storageKey) || ""; } catch { return ""; }
  }

  function saveEndpoint(value) {
    try { window.localStorage.setItem(storageKey, value); } catch { /* ignore */ }
  }

  function urls() {
    return Array.from(new Set([savedEndpoint(), config.waterLevelUrl, sameOriginUrl, localUrl].map((v) => String(v || "").trim()).filter(Boolean)));
  }

  function num(value) {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function formatCm(value) {
    const n = num(value);
    return n === null ? "-- cm" : `${n.toFixed(1)} cm`;
  }

  function formatPct(value) {
    const n = num(value);
    return n === null ? "--%" : `${n.toFixed(1)}%`;
  }

  function severityFor(event, levelCm) {
    const raw = String(event?.severity || "").toLowerCase();
    if (["normal", "watch", "warning", "critical", "unknown"].includes(raw)) return raw;
    if (levelCm === null) return "unknown";
    const alertCm = num(event?.alert_cm ?? event?.alertCm) ?? 80;
    const criticalCm = num(event?.critical_cm ?? event?.criticalCm) ?? 120;
    if (levelCm >= criticalCm) return "critical";
    if (levelCm >= alertCm) return "warning";
    if (levelCm > 0) return "watch";
    return "normal";
  }

  function severityLabel(severity) {
    return { normal: "ปกติ", watch: "เฝ้าระวัง", warning: "เตือนภัย", critical: "วิกฤต", unknown: "ไม่ทราบ" }[severity] || "ไม่ทราบ";
  }

  function chip(el, text, cls = "") {
    if (!el) return;
    el.className = `status-chip ${cls}`.trim();
    el.textContent = text;
  }

  function renderDetections(detections = []) {
    if (!els.detections) return;
    if (!detections.length) {
      els.detections.innerHTML = `<div class="empty-note">ยังไม่พบกล่อง/หน้ากาก water จาก YOLO</div>`;
      return;
    }
    els.detections.innerHTML = detections.slice(0, 8).map((detection, index) => {
      const name = detection.class_name || detection.label || `water-${index + 1}`;
      const confidence = num(detection.confidence ?? detection.conf);
      const box = detection.bbox || [detection.x, detection.y, detection.width, detection.height].filter((item) => item !== undefined);
      const boxText = Array.isArray(box) ? box.map((item) => Number(item).toFixed(0)).join(", ") : "-";
      return `<div class="water-detection-item"><strong>${name}</strong><span>${confidence === null ? "--" : `${(confidence * 100).toFixed(1)}%`} · bbox ${boxText}</span></div>`;
    }).join("");
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
  }

  function renderEvent(event, sourceUrl = "") {
    const levelCm = num(event.level_cm ?? event.water_level_cm ?? event.levelCm);
    const refHeight = num(event.reference_height_cm ?? event.referenceHeightCm) ?? 200;
    const fallbackPct = levelCm === null ? null : (levelCm / Math.max(1, refHeight)) * 100;
    const levelPct = clamp(num(event.level_percent ?? event.levelPercent) ?? fallbackPct ?? 0, 0, 100);
    const confidence = num(event.confidence ?? event.score ?? event.conf);
    const severity = severityFor(event, levelCm);
    const createdAt = event.created_at || event.createdAt || new Date().toISOString();
    const ageMs = Date.now() - new Date(createdAt).getTime();
    let host = "";
    try { host = sourceUrl.startsWith("demo:") ? "demo" : new URL(sourceUrl).host; } catch { host = ""; }

    chip(els.connection, `${ageMs < 12000 ? "LIVE" : "ข้อมูลเก่า"}${host ? ` · ${host}` : ""}`, ageMs < 12000 ? "good" : "is-warning");
    chip(els.severity, severityLabel(severity).toUpperCase(), `water-severity-${severity}`);
    if (els.updatedAt) els.updatedAt.textContent = `อัปเดตล่าสุด ${new Date(createdAt).toLocaleString("th-TH")}`;
    if (els.levelCm) els.levelCm.textContent = formatCm(levelCm);
    if (els.levelPercent) els.levelPercent.textContent = formatPct(levelPct);
    if (els.confidence) els.confidence.textContent = confidence === null ? "--%" : `${(confidence * 100).toFixed(1)}%`;
    if (els.fill) els.fill.style.height = `${levelPct}%`;
    if (els.line) els.line.style.bottom = `${levelPct}%`;
    if (els.label) els.label.textContent = levelCm === null ? "ไม่พบแนวน้ำ" : `${formatCm(levelCm)} · ${severityLabel(severity)}`;
    renderDetections(Array.isArray(event.detections) ? event.detections : []);
    if (els.raw) els.raw.textContent = JSON.stringify(event, null, 2);
  }

  async function poll() {
    for (const url of urls()) {
      try {
        const response = await fetch(url, { cache: "no-store" });
        if (!response.ok) continue;
        const data = await response.json();
        const event = data.latest || data.event || data;
        if (event && typeof event === "object") {
          renderEvent(event, url);
          return;
        }
      } catch {
        // Try the next endpoint.
      }
    }
    renderNoData("ยังเชื่อมต่อ YOLO ไม่ได้");
  }

  function demoEvent() {
    renderEvent({
      id: `DEMO-${Date.now()}`,
      created_at: new Date().toISOString(),
      device_id: "DEMO-WATER-01",
      method: "ultralytics-yolo-water-level-demo",
      level_cm: 92.4,
      level_percent: 46.2,
      reference_height_cm: 200,
      confidence: 0.87,
      severity: "warning",
      detections: [
        { class_name: "flood-water", confidence: 0.87, bbox: [82, 244, 980, 312] },
        { class_name: "waterline", confidence: 0.81, bbox: [90, 236, 960, 24] }
      ]
    }, "demo://local");
  }

  if (els.endpoint) els.endpoint.value = savedEndpoint() || config.waterLevelUrl || sameOriginUrl || localUrl;
  els.save?.addEventListener("click", () => {
    saveEndpoint(els.endpoint?.value.trim() || "");
    chip(els.connection, "บันทึก endpoint แล้ว", "good");
    poll();
  });
  els.demo?.addEventListener("click", demoEvent);

  renderNoData();
  poll();
  window.setInterval(poll, 1500);
})();
