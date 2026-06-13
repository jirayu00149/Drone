(() => {
  const R = window.HatyaiRescue;
  const state = {
    people: R.loadPeople(),
    logs: R.loadLogs(),
    commands: R.loadCommands(),
    stream: null,
    lastMatches: [],
    lastProbeVector: null,
    lastSnapshot: "",
    autoScanTimer: null,
    lastAutoScanAt: 0,
    faceDetector: null,
    drone: {
      battery: 86,
      signal: 92,
      altitude: 42,
      mode: "Patrol",
      online: true
    }
  };

  const els = {
    scanStatus: document.querySelector("#scanStatus"),
    cameraVideo: document.querySelector("#cameraVideo"),
    frameCanvas: document.querySelector("#frameCanvas"),
    cameraEmpty: document.querySelector("#cameraEmpty"),
    faceBoxes: document.querySelector("#faceBoxes"),
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
    missionCount: document.querySelector("#missionCount"),
    lastSync: document.querySelector("#lastSync")
  };

  function updateScanStatus(text, tone = "") {
    els.scanStatus.textContent = text;
    els.scanStatus.className = `scan-status ${tone}`;
  }

  function clearFaceBoxes() {
    if (els.faceBoxes) els.faceBoxes.innerHTML = "";
  }

  function renderFaceBoxes(boxes, sourceWidth = els.frameCanvas.width, sourceHeight = els.frameCanvas.height) {
    if (!els.faceBoxes) return;
    if (!boxes.length) {
      clearFaceBoxes();
      return;
    }

    const layerWidth = els.faceBoxes.clientWidth || els.frameCanvas.clientWidth || sourceWidth;
    const layerHeight = els.faceBoxes.clientHeight || els.frameCanvas.clientHeight || sourceHeight;
    const scaleX = layerWidth / sourceWidth;
    const scaleY = layerHeight / sourceHeight;

    els.faceBoxes.innerHTML = boxes
      .map((box) => {
        const x = R.clamp(box.x * scaleX, 0, layerWidth - 12);
        const y = R.clamp(box.y * scaleY, 0, layerHeight - 12);
        const width = R.clamp(box.width * scaleX, 24, layerWidth - x);
        const height = R.clamp(box.height * scaleY, 24, layerHeight - y);
        return `<span class="face-box" style="left:${x}px; top:${y}px; width:${width}px; height:${height}px;"></span>`;
      })
      .join("");
  }

  function isSkinPixel(r, g, b) {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const y = 0.299 * r + 0.587 * g + 0.114 * b;
    const cb = 128 - 0.168736 * r - 0.331264 * g + 0.5 * b;
    const cr = 128 + 0.5 * r - 0.418688 * g - 0.081312 * b;
    const chroma = max - min;
    return y > 28 && y < 238 && chroma > 12 && cb > 72 && cb < 145 && cr > 118 && cr < 188 && r > b * 0.82;
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

    const minX = Math.floor(sampleWidth * 0.16);
    const maxX = Math.floor(sampleWidth * 0.84);
    const minY = Math.floor(sampleHeight * 0.10);
    const maxY = Math.floor(sampleHeight * 0.82);

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
    const centerX = sampleWidth * 0.5;
    const centerY = sampleHeight * 0.42;

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

      if (area < 22) continue;
      const componentWidth = right - left + 1;
      const componentHeight = bottom - top + 1;
      if (componentWidth < 4 || componentHeight < 5) continue;

      const cx = sumX / area;
      const cy = sumY / area;
      const distance = Math.hypot((cx - centerX) / sampleWidth, (cy - centerY) / sampleHeight);
      const score = area * (1.4 - Math.min(distance, 1));
      if (!best || score > best.score) {
        best = { area, left, top, right, bottom, cx, cy, score };
      }
    }

    if (best) {
      const skinWidth = Math.max(best.right - best.left + 1, 12);
      const skinHeight = Math.max(best.bottom - best.top + 1, 12);
      const boxWidth = Math.max(skinWidth * 1.8, sampleWidth * 0.13);
      const boxHeight = Math.max(skinHeight * 2.15, sampleHeight * 0.24);
      const x = (best.cx - boxWidth / 2) * (source.width / sampleWidth);
      const y = (best.cy - boxHeight * 0.42) * (source.height / sampleHeight);
      return [
        {
          x: R.clamp(x, 0, source.width - 24),
          y: R.clamp(y, 0, source.height - 24),
          width: R.clamp(boxWidth * (source.width / sampleWidth), 72, source.width),
          height: R.clamp(boxHeight * (source.height / sampleHeight), 92, source.height)
        }
      ];
    }

    const fallbackWidth = source.width * 0.22;
    const fallbackHeight = source.height * 0.38;
    return [
      {
        x: source.width * 0.39,
        y: source.height * 0.18,
        width: fallbackWidth,
        height: fallbackHeight
      }
    ];
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
      renderFaceBoxes(boxes);
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
      renderFaceBoxes(boxes);
      if (boxes.length) return { supported: true, boxes };
      const fallbackBoxes = fallbackFaceBoxes();
      renderFaceBoxes(fallbackBoxes);
      return { supported: false, boxes: fallbackBoxes };
    } catch {
      const boxes = fallbackFaceBoxes();
      renderFaceBoxes(boxes);
      return { supported: false, boxes };
    }
  }

  function readLocation() {
    const lat = Number.parseFloat(els.latInput.value);
    const lng = Number.parseFloat(els.lngInput.value);
    return {
      lat: Number.isFinite(lat) ? lat : 7.0086,
      lng: Number.isFinite(lng) ? lng : 100.4747
    };
  }

  function renderTelemetry() {
    els.batteryValue.textContent = `${Math.round(state.drone.battery)}%`;
    els.signalValue.textContent = `${Math.round(state.drone.signal)}%`;
    els.altitudeValue.textContent = `${Math.round(state.drone.altitude)} m`;
    els.modeValue.textContent = state.drone.mode;
    els.droneOnline.textContent = state.drone.online ? "ออนไลน์" : "ออฟไลน์";
    els.droneOnline.className = `status-chip ${state.drone.online ? "good" : "danger"}`;
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
    state.drone.battery = R.clamp(state.drone.battery - Math.random() * 0.35, 12, 100);
    state.drone.signal = R.clamp(state.drone.signal + (Math.random() - 0.45) * 2.8, 44, 99);
    state.drone.altitude = R.clamp(state.drone.altitude + (Math.random() - 0.5) * 2.2, 18, 70);
    state.drone.online = state.drone.signal > 48 && state.drone.battery > 14;
    renderTelemetry();
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

  function pushCommand(command) {
    state.commands.unshift({
      id: `CMD-${Date.now()}`,
      command,
      status: "ส่งคำสั่งแล้ว",
      createdAt: new Date().toISOString()
    });
    state.drone.mode = command.includes("กลับ")
      ? "Return"
      : command.includes("หยุด")
        ? "Hover"
        : command.includes("ลงจอด")
          ? "Landing"
          : "Patrol";
    if (command.includes("ลงจอด")) {
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

    els.cameraVideo.classList.remove("is-live");
    els.frameCanvas.classList.remove("is-hidden");
    els.cameraEmpty.classList.add("is-hidden");
    renderFaceBoxes([{ x: faceX - 55, y: faceY - 56, width: 110, height: 138 }]);

    state.people = R.loadPeople();
    const target = state.people.find((person) => person.status !== "found") || state.people[0];
    state.lastProbeVector = target ? R.jitterVector(target.vector, "demo-frame-hatyai-flood", 0.04) : R.vectorFromCanvas(canvas);
    state.lastSnapshot = canvasSnapshot();
    runMatch(state.lastProbeVector);
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
    const activePeople = state.people.filter((person) => person.status !== "found");
    state.lastMatches = activePeople
      .map((person) => ({ person, score: R.cosineScore(probeVector, person.vector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);

    renderMatches(state.lastMatches, threshold);
    const top = state.lastMatches[0];
    if (top && top.score >= threshold) {
      updateScanStatus(`พบ candidate ${top.score}% รอยืนยัน`, "is-match");
      if (options.autoConfirm === true) {
        confirmFound(top.person.id, top.score, true);
      }
    } else {
      updateScanStatus("ยังไม่พบ match ที่ถึง threshold", "is-warning");
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

    const now = Date.now();
    if (now - state.lastAutoScanAt < 1100) {
      return;
    }

    state.lastAutoScanAt = now;
    const ctx = els.frameCanvas.getContext("2d");
    ctx.drawImage(els.cameraVideo, 0, 0, els.frameCanvas.width, els.frameCanvas.height);
    const detection = await detectFacesInFrame();
    if (detection.supported && !detection.boxes.length) {
      updateScanStatus("ยังไม่พบใบหน้าในเฟรม", "is-warning");
      return;
    }
    state.lastProbeVector = R.vectorFromCanvas(els.frameCanvas);
    state.lastSnapshot = canvasSnapshot();
    runMatch(state.lastProbeVector);
  }

  function startAutoScan() {
    if (state.autoScanTimer) {
      clearInterval(state.autoScanTimer);
    }
    state.autoScanTimer = setInterval(scanLiveFrame, 500);
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
      state.stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false
      });
      els.cameraVideo.srcObject = state.stream;
      els.cameraVideo.classList.add("is-live");
      els.frameCanvas.classList.add("is-hidden");
      els.cameraEmpty.classList.add("is-hidden");
      clearFaceBoxes();
      startAutoScan();
      updateScanStatus("กล้องพร้อม auto scan", "is-scanning");
    } catch {
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
    if (detection.supported && !detection.boxes.length) {
      updateScanStatus("ยังไม่พบใบหน้าในภาพ", "is-warning");
      return;
    }
    state.lastProbeVector = R.vectorFromCanvas(els.frameCanvas);
    state.lastSnapshot = canvasSnapshot();
    runMatch(state.lastProbeVector);
  }

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    updateScanStatus("กำลังอ่านภาพ", "is-scanning");
    const src = await R.fileToDataUrl(file);
    const image = await R.loadImage(src);
    drawImageToFrame(image);
    const detection = await detectFacesInFrame();
    if (detection.supported && !detection.boxes.length) {
      updateScanStatus("ยังไม่พบใบหน้าในภาพ", "is-warning");
      event.target.value = "";
      return;
    }
    state.lastProbeVector = await R.vectorFromImageSource(src);
    state.lastSnapshot = canvasSnapshot();
    runMatch(state.lastProbeVector);
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

  function bindEvents() {
    els.startCameraBtn.addEventListener("click", startCamera);
    els.captureBtn.addEventListener("click", captureFromVideo);
    els.demoFrameBtn.addEventListener("click", drawDemoFrame);
    els.probeUpload.addEventListener("change", handleUpload);
    els.gpsBtn.addEventListener("click", useDeviceLocation);
    els.exportBtn.addEventListener("click", exportLogs);
    els.thresholdRange.addEventListener("input", () => {
      els.thresholdValue.textContent = `${els.thresholdRange.value}%`;
      if (state.lastProbeVector) runMatch(state.lastProbeVector);
    });
    els.commandButtons.forEach((button) => {
      button.addEventListener("click", () => pushCommand(button.dataset.command));
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
  }

  bindEvents();
  renderMissionMeta();
  renderTelemetry();
  renderCommandLog();
  renderAdminCases();
  renderPins();
  updateScanStatus("พร้อมสแกน", "");
  setInterval(tickTelemetry, 3500);
  setInterval(renderMissionMeta, 15000);
})();
