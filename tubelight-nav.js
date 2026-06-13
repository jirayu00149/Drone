(function () {
  const page = document.body?.dataset.page || "home";
  const inDroneSection = window.location.pathname.includes("/drone/");
  const base = inDroneSection ? "../" : "./";
  const siteConfig = window.HatyaiRescueConfig || {};
  const publicBase = siteConfig.publicBaseUrl || base;
  const themeStorageKey = "hatyai-rescue-theme";

  function joinUrl(baseUrl, path) {
    if (/^https?:\/\//i.test(baseUrl)) {
      return `${baseUrl.replace(/\/$/, "")}/${path.replace(/^\.\//, "")}`;
    }
    return `${baseUrl}${path}`;
  }

  function storedTheme() {
    try {
      return window.localStorage.getItem(themeStorageKey);
    } catch {
      return "";
    }
  }

  function saveTheme(theme) {
    try {
      window.localStorage.setItem(themeStorageKey, theme);
    } catch {
      // Theme persistence is optional; the toggle still works for this page.
    }
  }

  function preferredTheme() {
    const savedTheme = storedTheme();
    if (savedTheme === "dark" || savedTheme === "light") return savedTheme;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.querySelectorAll("[data-theme-toggle]").forEach((toggle) => {
      toggle.setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
      toggle.setAttribute("title", theme === "dark" ? "Light theme" : "Dark theme");
      toggle.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
    });
  }

  function bindThemeToggles(root = document) {
    root.querySelectorAll("[data-theme-toggle]").forEach((toggle) => {
      if (toggle.dataset.themeBound === "true") return;
      toggle.dataset.themeBound = "true";
      toggle.addEventListener("click", () => {
        const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
        saveTheme(nextTheme);
        applyTheme(nextTheme);
      });
    });
  }

  function icon(name) {
    const icons = {
      home: '<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3V10.5Z" />',
      search: '<circle cx="11" cy="11" r="7" /><path d="m16 16 5 5" />',
      report: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" /><path d="M14 3v6h6M8 13h8M8 17h5" />',
      sun: '<circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />',
      moon: '<path d="M21 14.6A8.7 8.7 0 0 1 9.4 3a7 7 0 1 0 11.6 11.6Z" />'
    };
    return icons[name] || "";
  }

  function themeToggleHtml() {
    return `
      <button class="theme-switch" type="button" data-theme-toggle>
        <span class="theme-switch-stage" aria-hidden="true">
          <span class="theme-switch-thumb"></span>
          <span class="theme-switch-slot theme-switch-moon">
            <svg viewBox="0 0 24 24">${icon("moon")}</svg>
          </span>
          <span class="theme-switch-slot theme-switch-sun">
            <svg viewBox="0 0 24 24">${icon("sun")}</svg>
          </span>
        </span>
      </button>
    `;
  }

  applyTheme(preferredTheme());

  if (!inDroneSection && page !== "drone" && page !== "redirect") {
    const items = [
      {
        key: "home",
        label: "หน้าแรก",
        href: joinUrl(publicBase, "index.html"),
        icon: icon("home")
      },
      {
        key: "search",
        label: "ตรวจรายชื่อ",
        href: joinUrl(publicBase, "search.html"),
        icon: icon("search")
      },
      {
        key: "report",
        label: "แจ้งผู้สูญหาย",
        href: joinUrl(publicBase, "report.html"),
        icon: icon("report")
      }
    ];

    const nav = document.createElement("nav");
    nav.className = "tubelight-nav";
    nav.setAttribute("aria-label", "เมนูลัด");
    nav.innerHTML = `
      <div class="tubelight-nav-inner">
        ${items
          .map((item) => {
            const active = item.key === page;
            return `
              <a class="tubelight-nav-link ${active ? "active" : ""}" href="${item.href}" aria-current="${active ? "page" : "false"}">
                <span class="tubelight-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24">${item.icon}</svg>
                </span>
                <span class="tubelight-label">${item.label}</span>
                ${active ? '<span class="tubelight-lamp" aria-hidden="true"><i></i><b></b><em></em></span>' : ""}
              </a>
            `;
          })
          .join("")}
      </div>
    `;

    document.body.append(nav);
    bindThemeToggles(nav);
  }

  if (page !== "redirect") {
    const floatingTheme = document.createElement("div");
    floatingTheme.className = "floating-theme-control";
    floatingTheme.innerHTML = themeToggleHtml();
    document.body.append(floatingTheme);
    bindThemeToggles(floatingTheme);
  }

  bindThemeToggles(document);
  applyTheme(document.documentElement.dataset.theme || preferredTheme());
})();
