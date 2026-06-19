const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const root = __dirname;
const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT) || 4173;
const piMatchesPath = path.join(root, "exports", "pi-matches.jsonl");
const yoloDetections = [];
const waterLevelEvents = [];
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".md": "text/markdown; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function sendJson(response, status, payload) {
  const data = Buffer.from(JSON.stringify(payload), "utf8");
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": data.length,
    "Cache-Control": "no-store",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Water-Ingest-Token"
  });
  response.end(data);
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 5_000_000) {
        request.destroy();
        reject(new Error("request_body_too_large"));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}

function numberOrNull(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function waterSeverity(levelCm, alertCm = 80, criticalCm = 120) {
  if (!Number.isFinite(Number(levelCm))) return "unknown";
  if (levelCm >= criticalCm) return "critical";
  if (levelCm >= alertCm) return "warning";
  if (levelCm > 0) return "watch";
  return "normal";
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

function waterGeofence() {
  return {
    name: process.env.WATER_GEOFENCE_NAME || "พื้นที่ภารกิจหาดใหญ่",
    centerLat: numberOrNull(process.env.WATER_GEOFENCE_CENTER_LAT, 7.0086),
    centerLng: numberOrNull(process.env.WATER_GEOFENCE_CENTER_LNG, 100.4747),
    radiusM: numberOrNull(process.env.WATER_GEOFENCE_RADIUS_M, 30000)
  };
}

function safeWaterEvent(event) {
  const { photo_data_url, reporter_contact, payload, ...safe } = event;
  return safe;
}


function readPiMatches() {
  if (!fs.existsSync(piMatchesPath)) return [];
  return fs
    .readFileSync(piMatchesPath, "utf8")
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function handlePiMatches(request, response) {
  if (request.method === "OPTIONS") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET") {
    sendJson(response, 200, { matches: readPiMatches().slice(-100) });
    return;
  }

  if (request.method !== "POST") {
    sendJson(response, 405, { error: "method_not_allowed" });
    return;
  }

  try {
    const payload = JSON.parse((await readRequestBody(request)) || "{}");
    const event = {
      id: payload.id || `PI-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      created_at: payload.created_at || new Date().toISOString(),
      device_id: payload.device_id || "HY-PI-DRONE-01",
      person_id: String(payload.person_id || ""),
      score: Number(payload.score) || 0,
      threshold: Number(payload.threshold) || 60,
      is_match: Boolean(payload.is_match),
      method: payload.method || "opencv-sface-trained",
      detector: payload.detector || "YuNet",
      cosine: payload.cosine,
      similarity: payload.similarity,
      lat: Number(payload.lat) || 7.0086,
      lng: Number(payload.lng) || 100.4747,
      bbox: payload.bbox || null,
      frame_width: Number(payload.frame_width || payload.frameWidth) || null,
      frame_height: Number(payload.frame_height || payload.frameHeight) || null,
      faces: Array.isArray(payload.faces) ? payload.faces : []
    };

    fs.mkdirSync(path.dirname(piMatchesPath), { recursive: true });
    fs.appendFileSync(piMatchesPath, `${JSON.stringify(event)}\n`, "utf8");
    sendJson(response, 200, { ok: true, event });
  } catch (error) {
    sendJson(response, 400, { error: "invalid_match_event", detail: String(error.message || error) });
  }
}

async function handleYoloDetections(request, response) {
  if (request.method === "OPTIONS") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET") {
    const events = yoloDetections.slice(-80);
    sendJson(response, 200, { events, latest: events.at(-1) || null });
    return;
  }

  if (request.method !== "POST") {
    sendJson(response, 405, { error: "method_not_allowed" });
    return;
  }

  try {
    const payload = JSON.parse((await readRequestBody(request)) || "{}");
    const event = {
      id: payload.id || `YOLO-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      created_at: payload.created_at || new Date().toISOString(),
      device_id: payload.device_id || "HY-PI-DRONE-01",
      method: payload.method || "ultralytics-yolo-visdrone",
      model_path: payload.model_path || "",
      conf: Number(payload.conf) || 0.25,
      imgsz: Number(payload.imgsz) || 640,
      classes: Array.isArray(payload.classes) ? payload.classes : [0, 1],
      frame_width: Number(payload.frame_width || payload.frameWidth) || null,
      frame_height: Number(payload.frame_height || payload.frameHeight) || null,
      detections: Array.isArray(payload.detections) ? payload.detections : []
    };

    yoloDetections.push(event);
    if (yoloDetections.length > 120) {
      yoloDetections.splice(0, yoloDetections.length - 120);
    }
    sendJson(response, 200, { ok: true, event });
  } catch (error) {
    sendJson(response, 400, { error: "invalid_yolo_event", detail: String(error.message || error) });
  }
}

async function handleYoloWaterLevel(request, response) {
  if (request.method === "OPTIONS") {
    sendJson(response, 200, { ok: true });
    return;
  }

  if (request.method === "GET") {
    const events = waterLevelEvents.slice(-120).map(safeWaterEvent);
    sendJson(response, 200, { events, latest: events.at(-1) || null });
    return;
  }

  if (request.method !== "POST") {
    sendJson(response, 405, { error: "method_not_allowed" });
    return;
  }

  try {
    const payload = JSON.parse((await readRequestBody(request)) || "{}");
    const sourceType = String(payload.source_type || (payload.photo_data_url ? "mobile_photo" : "yolo"));
    if (process.env.WATER_INGEST_TOKEN && sourceType === "yolo" && request.headers["x-water-ingest-token"] !== process.env.WATER_INGEST_TOKEN) {
      sendJson(response, 401, { error: "invalid_ingest_token" });
      return;
    }

    const levelCm = numberOrNull(payload.level_cm ?? payload.water_level_cm ?? payload.levelCm);
    const referenceHeight = numberOrNull(payload.reference_height_cm ?? payload.referenceHeightCm, 200);
    const levelPercent = numberOrNull(payload.level_percent ?? payload.levelPercent, levelCm === null ? null : Math.max(0, Math.min(100, (levelCm / Math.max(1, referenceHeight)) * 100)));
    const alertCm = numberOrNull(payload.alert_cm ?? payload.alertCm, 80);
    const criticalCm = numberOrNull(payload.critical_cm ?? payload.criticalCm, 120);
    const latitude = numberOrNull(payload.latitude ?? payload.lat);
    const longitude = numberOrNull(payload.longitude ?? payload.lng);
    const fence = waterGeofence();
    const distance = latitude === null || longitude === null ? null : Math.round(distanceMeters(latitude, longitude, fence.centerLat, fence.centerLng));
    const photoDataUrl = typeof payload.photo_data_url === "string" && payload.photo_data_url.startsWith("data:image/") ? payload.photo_data_url : null;
    const photoSize = numberOrNull(payload.photo_size_bytes, photoDataUrl ? Math.round((photoDataUrl.length * 3) / 4) : 0);
    const event = {
      event_id: String(payload.event_id || payload.id || `WATER-${Date.now()}-${Math.random().toString(16).slice(2)}`),
      created_at: payload.created_at || new Date().toISOString(),
      device_id: payload.device_id || "HY-WATER-01",
      source_type: sourceType,
      method: payload.method || "ultralytics-yolo-water-level",
      model_path: payload.model_path || "",
      conf: numberOrNull(payload.conf, 0.25),
      imgsz: numberOrNull(payload.imgsz, 640),
      frame_width: numberOrNull(payload.frame_width || payload.frameWidth),
      frame_height: numberOrNull(payload.frame_height || payload.frameHeight),
      waterline_y: numberOrNull(payload.waterline_y ?? payload.waterlineY),
      level_cm: levelCm,
      level_percent: levelPercent,
      reference_height_cm: referenceHeight,
      alert_cm: alertCm,
      critical_cm: criticalCm,
      severity: String(payload.severity || waterSeverity(levelCm, alertCm, criticalCm)),
      confidence: numberOrNull(payload.confidence ?? payload.score),
      latitude,
      longitude,
      location_accuracy_m: numberOrNull(payload.location_accuracy_m ?? payload.accuracy),
      geofence_name: payload.geofence_name || fence.name,
      geofence_center_lat: fence.centerLat,
      geofence_center_lng: fence.centerLng,
      geofence_radius_m: fence.radiusM,
      geofence_distance_m: distance,
      geofence_valid: distance === null ? null : distance <= fence.radiusM,
      location_label: payload.location_label || "",
      reporter_contact: payload.reporter_contact || "",
      note: payload.note || "",
      photo_data_url: photoSize > 950000 ? null : photoDataUrl,
      photo_mime: payload.photo_mime || (photoDataUrl ? "image/jpeg" : null),
      photo_size_bytes: photoSize || 0,
      detections: Array.isArray(payload.detections) ? payload.detections : [],
      payload: payload.payload && typeof payload.payload === "object" ? payload.payload : {}
    };

    waterLevelEvents.push(event);
    if (waterLevelEvents.length > 240) {
      waterLevelEvents.splice(0, waterLevelEvents.length - 240);
    }
    sendJson(response, 200, { ok: true, event: safeWaterEvent(event) });
  } catch (error) {
    sendJson(response, 400, { error: "invalid_water_level_event", detail: String(error.message || error) });
  }
}

function createServer() {
  return http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url, `http://${request.headers.host || "127.0.0.1"}`);
    if (requestUrl.pathname === "/api/pi/matches") {
      await handlePiMatches(request, response);
      return;
    }

    if (requestUrl.pathname === "/api/yolo/detections") {
      await handleYoloDetections(request, response);
      return;
    }

    if (requestUrl.pathname === "/api/yolo/water-level") {
      await handleYoloWaterLevel(request, response);
      return;
    }

    const requestedPath =
      requestUrl.pathname === "/"
        ? "/index.html"
        : requestUrl.pathname.endsWith("/")
          ? `${requestUrl.pathname}index.html`
          : requestUrl.pathname;
    const resolvedPath = path.normalize(path.join(root, decodeURIComponent(requestedPath)));

    if (!resolvedPath.startsWith(root)) {
      response.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Forbidden");
      return;
    }

    fs.readFile(resolvedPath, (error, data) => {
      if (error) {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }

      response.writeHead(200, {
        "Content-Type": mimeTypes[path.extname(resolvedPath).toLowerCase()] || "application/octet-stream",
        "Cache-Control": "no-store"
      });
      response.end(data);
    });
  });
}

function listen(port) {
  const server = createServer();
  server.on("error", (error) => {
    if (error.code === "EADDRINUSE" && !process.env.PORT) {
      listen(port + 1);
      return;
    }
    throw error;
  });
  server.listen(port, host, () => {
    const displayHost = host === "0.0.0.0" ? "127.0.0.1" : host;
    console.log(`โดรนพิทักษ์น้ำท่วม running at http://${displayHost}:${port}`);
  });
}

listen(port);
