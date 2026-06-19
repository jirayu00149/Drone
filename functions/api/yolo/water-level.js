const memoryEvents = [];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, X-Water-Ingest-Token",
  "Cache-Control": "no-store"
};

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json; charset=utf-8"
    }
  });
}

function numberOrNull(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
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

function geofence(env) {
  return {
    name: env.WATER_GEOFENCE_NAME || "พื้นที่ภารกิจหาดใหญ่",
    centerLat: numberOrNull(env.WATER_GEOFENCE_CENTER_LAT, 7.0086),
    centerLng: numberOrNull(env.WATER_GEOFENCE_CENTER_LNG, 100.4747),
    radiusM: numberOrNull(env.WATER_GEOFENCE_RADIUS_M, 30000)
  };
}

function severity(levelCm, alertCm = 80, criticalCm = 120) {
  if (!Number.isFinite(Number(levelCm))) return "unknown";
  if (levelCm >= criticalCm) return "critical";
  if (levelCm >= alertCm) return "warning";
  if (levelCm > 0) return "watch";
  return "normal";
}

function safePhoto(payload) {
  const photoDataUrl = typeof payload.photo_data_url === "string" ? payload.photo_data_url : "";
  const photoSize = numberOrNull(payload.photo_size_bytes, photoDataUrl ? Math.round((photoDataUrl.length * 3) / 4) : 0);
  if (!photoDataUrl || photoSize > 950000 || !photoDataUrl.startsWith("data:image/")) {
    return { photo_data_url: null, photo_mime: payload.photo_mime || null, photo_size_bytes: photoSize || 0 };
  }
  return {
    photo_data_url: photoDataUrl,
    photo_mime: payload.photo_mime || "image/jpeg",
    photo_size_bytes: photoSize
  };
}

function buildEvent(payload, env) {
  const levelCm = numberOrNull(payload.level_cm ?? payload.water_level_cm ?? payload.levelCm);
  const referenceHeight = numberOrNull(payload.reference_height_cm ?? payload.referenceHeightCm, 200);
  const levelPercent = numberOrNull(payload.level_percent ?? payload.levelPercent, levelCm === null ? null : Math.max(0, Math.min(100, (levelCm / Math.max(1, referenceHeight)) * 100)));
  const alertCm = numberOrNull(payload.alert_cm ?? payload.alertCm, 80);
  const criticalCm = numberOrNull(payload.critical_cm ?? payload.criticalCm, 120);
  const latitude = numberOrNull(payload.latitude ?? payload.lat);
  const longitude = numberOrNull(payload.longitude ?? payload.lng);
  const fence = geofence(env);
  const distance = latitude === null || longitude === null ? null : Math.round(distanceMeters(latitude, longitude, fence.centerLat, fence.centerLng));
  return {
    event_id: String(payload.event_id || payload.id || `WATER-${Date.now()}-${Math.random().toString(16).slice(2)}`),
    created_at: payload.created_at || new Date().toISOString(),
    device_id: String(payload.device_id || "HY-WATER-01"),
    source_type: String(payload.source_type || (payload.photo_data_url ? "mobile_photo" : "yolo")),
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
    severity: String(payload.severity || severity(levelCm, alertCm, criticalCm)),
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
    detections: Array.isArray(payload.detections) ? payload.detections : [],
    payload: payload.payload && typeof payload.payload === "object" ? payload.payload : {},
    ...safePhoto(payload)
  };
}

function publicEvent(event) {
  const { photo_data_url, reporter_contact, payload, ...safe } = event;
  return safe;
}

function supabaseEnv(env) {
  const supabaseUrl = String(env.SUPABASE_URL || "").replace(/\/+$/, "");
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_PUBLISHABLE_KEY || "";
  return { supabaseUrl, key };
}

async function insertSupabase(event, env) {
  const { supabaseUrl, key } = supabaseEnv(env);
  if (!supabaseUrl || !key) return null;
  const response = await fetch(`${supabaseUrl}/rest/v1/water_level_events`, {
    method: "POST",
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      Prefer: "return=representation"
    },
    body: JSON.stringify(event)
  });
  if (!response.ok) throw new Error(`supabase_insert_${response.status}`);
  return response.json();
}

async function readSupabase(env) {
  const { supabaseUrl, key } = supabaseEnv(env);
  if (!supabaseUrl || !key) return [];
  const select = "event_id,created_at,device_id,source_type,method,level_cm,level_percent,confidence,severity,latitude,longitude,location_accuracy_m,geofence_name,geofence_distance_m,geofence_valid,location_label,note";
  const response = await fetch(`${supabaseUrl}/rest/v1/water_level_events?select=${select}&order=created_at.desc&limit=120`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: "application/json"
    }
  });
  if (!response.ok) return [];
  return response.json();
}

export async function onRequest(context) {
  const { request, env } = context;
  if (request.method === "OPTIONS") return json({ ok: true });

  if (request.method === "GET") {
    const supabaseEvents = await readSupabase(env).catch(() => []);
    const events = [...supabaseEvents, ...memoryEvents.map(publicEvent)]
      .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
      .slice(-120);
    return json({ events, latest: events.at(-1) || null });
  }

  if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const payload = await request.json();
    const sourceType = String(payload.source_type || (payload.photo_data_url ? "mobile_photo" : "yolo"));
    if (env.WATER_INGEST_TOKEN && sourceType === "yolo" && request.headers.get("X-Water-Ingest-Token") !== env.WATER_INGEST_TOKEN) {
      return json({ error: "invalid_ingest_token" }, 401);
    }
    const event = buildEvent(payload, env);
    memoryEvents.push(event);
    if (memoryEvents.length > 240) memoryEvents.splice(0, memoryEvents.length - 240);
    let persisted = false;
    try {
      await insertSupabase(event, env);
      persisted = true;
    } catch (error) {
      event.persist_error = String(error.message || error);
    }
    return json({ ok: true, persisted, event: publicEvent(event) });
  } catch (error) {
    return json({ error: "invalid_water_level_event", detail: String(error.message || error) }, 400);
  }
}
