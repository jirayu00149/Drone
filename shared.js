(function () {
  const peopleKey = "hatyaiRescue.people.v3";
  const logsKey = "hatyaiRescue.logs.v3";
  const commandsKey = "hatyaiRescue.commands.v3";

  const seedPeople = [
    {
      id: "HY-001",
      name: "นางมาลี ใจดี",
      age: 72,
      priority: "high",
      lastSeen: "ชุมชนคลองเตย ใกล้คลองอู่ตะเภา",
      reporterContact: "ญาติผู้แจ้ง 08x-xxx-1001",
      note: "ผู้สูงอายุ เดินช้า สวมเสื้อสีฟ้า",
      initials: "มล",
      photo: "",
      status: "searching"
    },
    {
      id: "HY-014",
      name: "นายธนากร ศรีสุข",
      age: 41,
      priority: "medium",
      lastSeen: "ย่านตลาดกิมหยง",
      reporterContact: "ศูนย์ชุมชน 08x-xxx-1014",
      note: "ติดต่อไม่ได้หลังน้ำขึ้นช่วงเช้า",
      initials: "ธก",
      photo: "",
      status: "searching"
    },
    {
      id: "HY-022",
      name: "เด็กหญิงอารีนา",
      age: 10,
      priority: "high",
      lastSeen: "ชุมชนริมทางรถไฟหาดใหญ่",
      reporterContact: "ผู้ปกครอง 08x-xxx-1022",
      note: "เด็ก ต้องตรวจสอบกับผู้ปกครองก่อนเผยแพร่รายละเอียด",
      initials: "อร",
      photo: "",
      status: "searching"
    }
  ];

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function normalize(vector) {
    const length = Math.hypot(...vector) || 1;
    return vector.map((value) => value / length);
  }

  function vectorFromText(text) {
    let hash = 2166136261;
    const source = text || "hatyai-rescue";
    const vector = [];
    for (let index = 0; index < 64; index += 1) {
      const code = source.charCodeAt(index % source.length);
      hash ^= code + index * 31;
      hash = Math.imul(hash, 16777619);
      vector.push(((hash >>> 0) % 1000) / 1000);
    }
    return normalize(vector);
  }

  function jitterVector(baseVector, seed, amount) {
    const noise = vectorFromText(seed);
    return normalize(baseVector.map((value, index) => value * (1 - amount) + noise[index] * amount));
  }

  function cosineScore(a, b) {
    const dot = a.reduce((sum, value, index) => sum + value * b[index], 0);
    return clamp(Math.round(((dot - 0.74) / 0.25) * 100), 0, 99);
  }

  function fileToDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function loadImage(src) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = src;
    });
  }

  function vectorFromCanvas(canvas) {
    const sample = document.createElement("canvas");
    sample.width = 8;
    sample.height = 8;
    const ctx = sample.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(canvas, 0, 0, sample.width, sample.height);
    const data = ctx.getImageData(0, 0, sample.width, sample.height).data;
    const vector = [];
    for (let index = 0; index < data.length; index += 4) {
      const r = data[index] / 255;
      const g = data[index + 1] / 255;
      const b = data[index + 2] / 255;
      vector.push(r * 0.35 + g * 0.45 + b * 0.2);
    }
    return normalize(vector);
  }

  async function vectorFromImageSource(src) {
    const image = await loadImage(src);
    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 320;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    const side = Math.min(image.naturalWidth, image.naturalHeight);
    const sx = (image.naturalWidth - side) / 2;
    const sy = (image.naturalHeight - side) / 2;
    ctx.drawImage(image, sx, sy, side, side, 0, 0, canvas.width, canvas.height);
    return vectorFromCanvas(canvas);
  }

  function prepareSeedPeople() {
    return seedPeople.map((person) => ({
      ...person,
      vector: vectorFromText(`${person.id}-${person.name}-${person.lastSeen}`),
      createdAt: new Date().toISOString(),
      foundAt: "",
      foundLat: "",
      foundLng: ""
    }));
  }

  function loadPeople() {
    try {
      const people = JSON.parse(localStorage.getItem(peopleKey));
      if (Array.isArray(people) && people.length) {
        return people.map((person) => ({
          ...person,
          status: person.status || "searching",
          vector: Array.isArray(person.vector) ? person.vector : vectorFromText(`${person.id}-${person.name}`)
        }));
      }
    } catch {
      return prepareSeedPeople();
    }
    return prepareSeedPeople();
  }

  function savePeople(people) {
    localStorage.setItem(peopleKey, JSON.stringify(people));
  }

  function loadLogs() {
    try {
      return JSON.parse(localStorage.getItem(logsKey)) || [];
    } catch {
      return [];
    }
  }

  function saveLogs(logs) {
    localStorage.setItem(logsKey, JSON.stringify(logs));
  }

  function loadCommands() {
    try {
      return JSON.parse(localStorage.getItem(commandsKey)) || [];
    } catch {
      return [];
    }
  }

  function saveCommands(commands) {
    localStorage.setItem(commandsKey, JSON.stringify(commands));
  }

  function resetDemo() {
    savePeople(prepareSeedPeople());
    saveLogs([]);
    saveCommands([]);
  }

  function priorityLabel(priority) {
    if (priority === "high") return "เร่งด่วน";
    if (priority === "medium") return "เฝ้าระวัง";
    return "ปกติ";
  }

  function statusLabel(status) {
    if (status === "found") return "พบแล้ว";
    if (status === "review") return "รอยืนยัน";
    return "กำลังค้นหา";
  }

  function initials(name) {
    return (name || "HY").replace(/\s+/g, "").slice(0, 2).toUpperCase();
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function avatarHtml(person) {
    if (person.photo) {
      return `<span class="avatar"><img alt="" src="${escapeHtml(person.photo)}" /></span>`;
    }
    return `<span class="avatar">${escapeHtml(person.initials || initials(person.name))}</span>`;
  }

  function escapeCsvCell(value) {
    return `"${String(value ?? "").replaceAll('"', '""')}"`;
  }

  function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString("th-TH", {
      dateStyle: "medium",
      timeStyle: "short"
    });
  }

  function syncActiveNavigation() {
    const links = [...document.querySelectorAll(".nav-link")];
    if (!links.length) return;

    const currentPage = document.body?.dataset.page || "home";
    const activeByPage = {
      home: "index.html",
      search: "search.html",
      report: "report.html",
      pilot: "pilot.html"
    };
    const activeFile = activeByPage[currentPage] || "index.html";

    links.forEach((link) => {
      const href = link.getAttribute("href") || "";
      const isActive = href.endsWith(activeFile) || (currentPage === "home" && href === "./");
      link.classList.toggle("active", isActive);
    });
  }

  syncActiveNavigation();

  window.HatyaiRescue = {
    bounds: {
      minLat: 6.95,
      maxLat: 7.08,
      minLng: 100.39,
      maxLng: 100.56
    },
    clamp,
    normalize,
    vectorFromText,
    jitterVector,
    cosineScore,
    fileToDataUrl,
    loadImage,
    vectorFromCanvas,
    vectorFromImageSource,
    loadPeople,
    savePeople,
    loadLogs,
    saveLogs,
    loadCommands,
    saveCommands,
    resetDemo,
    priorityLabel,
    statusLabel,
    initials,
    avatarHtml,
    escapeCsvCell,
    escapeHtml,
    formatDateTime
  };
})();
