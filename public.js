(() => {
  const R = window.HatyaiRescue;
  const state = {
    people: R.loadPeople(),
    logs: R.loadLogs(),
    filter: "all",
    query: ""
  };

  const els = {
    form: document.querySelector("#missingForm"),
    personName: document.querySelector("#personName"),
    personAge: document.querySelector("#personAge"),
    personPriority: document.querySelector("#personPriority"),
    personLastSeen: document.querySelector("#personLastSeen"),
    reporterContact: document.querySelector("#reporterContact"),
    personNote: document.querySelector("#personNote"),
    personPhoto: document.querySelector("#personPhoto"),
    formMessage: document.querySelector("#formMessage"),
    caseList: document.querySelector("#caseList"),
    filterButtons: document.querySelectorAll("[data-filter]"),
    caseSearch: document.querySelector("#caseSearch"),
    resetDemoBtn: document.querySelector("#resetDemoBtn"),
    publicStats: document.querySelector("#publicStats")
  };

  function bindAnimatedHero() {
    const title = document.querySelector(".public-home .hero-content h1");
    if (!title) return;

    const words = ["ข้อมูลประชาชน", "ทีมโดรน", "พิกัดล่าสุด", "การยืนยันจากเจ้าหน้าที่"];
    const wordNode = document.createElement("span");
    wordNode.className = "hero-rotating-word";
    wordNode.setAttribute("aria-live", "polite");
    wordNode.textContent = words[0];
    title.append(" ", wordNode);

    let activeIndex = 0;
    window.requestAnimationFrame(() => wordNode.classList.add("is-visible"));
    window.setInterval(() => {
      activeIndex = (activeIndex + 1) % words.length;
      wordNode.classList.remove("is-visible");
      window.setTimeout(() => {
        wordNode.textContent = words[activeIndex];
        wordNode.classList.add("is-visible");
      }, 160);
    }, 2400);
  }

  function saveAndRender() {
    R.savePeople(state.people);
    renderStats();
    renderCases();
  }

  function statusClass(status) {
    if (status === "found") return "found";
    if (status === "review") return "review";
    return "searching";
  }

  function latestLogFor(personId) {
    return state.logs.find((log) => log.personId === personId);
  }

  function matchesQuery(person) {
    if (!state.query) return true;
    const query = state.query.toLowerCase();
    return [person.id, person.name, person.lastSeen, person.note]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(query));
  }

  function filteredPeople() {
    let people = [...state.people];
    if (state.filter !== "all") {
      people = people.filter((person) => person.status === state.filter);
    }
    return people
      .filter(matchesQuery)
      .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  }

  function renderStats() {
    if (!els.publicStats) return;
    state.people = R.loadPeople();
    state.logs = R.loadLogs();
    const searching = state.people.filter((person) => person.status === "searching").length;
    const review = state.people.filter((person) => person.status === "review").length;
    const found = state.people.filter((person) => person.status === "found").length;
    els.publicStats.innerHTML = `
      <div><strong>${state.people.length}</strong><span>เคสทั้งหมด</span></div>
      <div><strong>${searching}</strong><span>กำลังค้นหา</span></div>
      <div><strong>${review}</strong><span>รอยืนยัน</span></div>
      <div><strong>${found}</strong><span>พบแล้ว</span></div>
    `;
  }

  function renderCases() {
    if (!els.caseList) return;
    state.people = R.loadPeople();
    state.logs = R.loadLogs();
    const people = filteredPeople();

    if (!people.length) {
      els.caseList.innerHTML = `<div class="empty-note">ยังไม่พบเคสที่ตรงกับเงื่อนไขนี้</div>`;
      return;
    }

    els.caseList.innerHTML = people
      .map((person) => {
        const log = latestLogFor(person.id);
        const foundText = log
          ? `<div class="found-detail">พิกัดล่าสุด ${Number(log.lat).toFixed(5)}, ${Number(log.lng).toFixed(5)} · confidence ${R.escapeHtml(log.score)}%</div>`
          : "";
        return `
          <article class="case-card">
            <div class="case-top">
              ${R.avatarHtml(person)}
              <div class="case-main">
                <strong>${R.escapeHtml(person.name)}</strong>
                <span>${R.escapeHtml(person.id)} · อายุ ${R.escapeHtml(person.age || "-")} ปี · พบล่าสุด: ${R.escapeHtml(person.lastSeen || "-")}</span>
              </div>
              <span class="status-badge ${statusClass(person.status)}">${R.statusLabel(person.status)}</span>
            </div>
            <div class="case-body">
              <span class="priority ${R.escapeHtml(person.priority)}">${R.priorityLabel(person.priority)}</span>
              <p>${R.escapeHtml(person.note || "ไม่มีรายละเอียดเพิ่มเติม")}</p>
              ${foundText}
            </div>
          </article>
        `;
      })
      .join("");
  }

  async function handleSubmit(event) {
    event.preventDefault();
    const name = els.personName.value.trim();
    if (!name) return;

    const file = els.personPhoto.files?.[0];
    let photo = "";
    let vector = R.vectorFromText(`${name}-${els.personLastSeen.value}-${Date.now()}`);

    if (file) {
      photo = await R.fileToDataUrl(file);
      vector = await R.vectorFromImageSource(photo);
    }

    const person = {
      id: `HY-${String(Date.now()).slice(-6)}`,
      name,
      age: Number.parseInt(els.personAge.value, 10) || "",
      priority: els.personPriority.value,
      lastSeen: els.personLastSeen.value.trim(),
      reporterContact: els.reporterContact.value.trim(),
      note: els.personNote.value.trim(),
      initials: R.initials(name),
      photo,
      vector,
      status: "searching",
      createdAt: new Date().toISOString(),
      foundAt: "",
      foundLat: "",
      foundLng: ""
    };

    state.people.unshift(person);
    els.form.reset();
    saveAndRender();

    if (els.formMessage) {
      els.formMessage.classList.add("is-visible");
      els.formMessage.innerHTML = `<strong>รับข้อมูลแล้ว</strong><span>รหัสเคส ${R.escapeHtml(person.id)} ถูกส่งเข้าคิวค้นหาและหน้าโดรนแล้ว</span>`;
    }
  }

  function bindEvents() {
    if (els.form) {
      els.form.addEventListener("submit", handleSubmit);
    }

    els.filterButtons.forEach((button) => {
      button.addEventListener("click", () => {
        els.filterButtons.forEach((item) => item.classList.remove("active"));
        button.classList.add("active");
        state.filter = button.dataset.filter;
        renderCases();
      });
    });

    if (els.caseSearch) {
      els.caseSearch.addEventListener("input", () => {
        state.query = els.caseSearch.value.trim();
        renderCases();
      });
    }

    if (els.resetDemoBtn) {
      els.resetDemoBtn.addEventListener("click", () => {
        if (!window.confirm("รีเซ็ตข้อมูลตัวอย่างทั้งหมด?")) return;
        R.resetDemo();
        state.people = R.loadPeople();
        state.logs = R.loadLogs();
        renderStats();
        renderCases();
      });
    }

    window.addEventListener("storage", () => {
      state.people = R.loadPeople();
      state.logs = R.loadLogs();
      renderStats();
      renderCases();
    });
  }

  bindAnimatedHero();
  bindEvents();
  renderStats();
  renderCases();
})();
