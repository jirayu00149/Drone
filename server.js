const http = require("http");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const root = __dirname;
const host = process.env.HOST || "0.0.0.0";
const port = Number(process.env.PORT) || 4173;
const piMatchesPath = path.join(root, "exports", "pi-matches.jsonl");
const yoloDetections = [];
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
    "Access-Control-Allow-Headers": "Content-Type"
  });
  response.end(data);
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        request.destroy();
        reject(new Error("request_body_too_large"));
      }
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
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
      lat: Number(payload.lat) || 7.0086,
      lng: Number(payload.lng) || 100.4747,
      bbox: payload.bbox || null,
      frame_width: Number(payload.frame_width || payload.frameWidth) || null,
      frame_height: Number(payload.frame_height || payload.frameHeight) || null
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
