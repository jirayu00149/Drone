(function () {
  const page = document.body?.dataset.page || "home";
  const inDroneSection = window.location.pathname.includes("/drone/");
  const base = inDroneSection ? "../" : "./";
  const siteConfig = window.HatyaiRescueConfig || {};
  const publicBase = siteConfig.publicBaseUrl || base;
  const droneBase = siteConfig.droneBaseUrl || (inDroneSection ? "./" : `${base}drone/`);
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
    } catch (error) {
      return "";
    }
  }

  function saveTheme(theme) {
    try {
      window.localStorage.setItem(themeStorageKey, theme);
    } catch (error) {
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
    const toggle = document.querySelector("[data-theme-toggle]");
    if (!toggle) return;
    toggle.setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
    toggle.setAttribute("title", theme === "dark" ? "Light theme" : "Dark theme");
  }

  applyTheme(preferredTheme());

  const items = [
    {
      key: "home",
      label: "หน้าแรก",
      href: joinUrl(publicBase, "index.html"),
      icon: '<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3V10.5Z" />'
    },
    {
      key: "search",
      label: "ตรวจรายชื่อ",
      href: joinUrl(publicBase, "search.html"),
      icon: '<circle cx="11" cy="11" r="7" /><path d="m16 16 5 5" />'
    },
    {
      key: "report",
      label: "แจ้งผู้สูญหาย",
      href: joinUrl(publicBase, "report.html"),
      icon: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" /><path d="M14 3v6h6M8 13h8M8 17h5" />'
    },
    {
      key: "drone",
      label: "Drone Ops",
      href: droneBase,
      icon: '<path d="M10 10h4v4h-4z" /><path d="M4 4h4v4H4zM16 4h4v4h-4zM4 16h4v4H4zM16 16h4v4h-4zM8 6h8M8 18h8M6 8v8M18 8v8" />'
    }
  ];

  const nav = document.createElement("nav");
  nav.className = "tubelight-nav";
  nav.setAttribute("aria-label", "เมนูลัด");
  nav.innerHTML = `
    <div class="tubelight-nav-inner">
      ${items
        .map((item) => {
          const active = item.key === page || (page === "pilot" && item.key === "drone");
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
      <button class="tubelight-nav-link theme-toggle-button" type="button" data-theme-toggle>
        <span class="tubelight-icon theme-icon" aria-hidden="true">
          <svg class="theme-icon-sun" viewBox="0 0 24 24"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" /></svg>
          <svg class="theme-icon-moon" viewBox="0 0 24 24"><path d="M21 14.6A8.7 8.7 0 0 1 9.4 3a7 7 0 1 0 11.6 11.6Z" /></svg>
        </span>
        <span class="tubelight-label">Theme</span>
      </button>
    </div>
  `;

  document.body.append(nav);
  applyTheme(document.documentElement.dataset.theme || preferredTheme());

  const themeToggle = nav.querySelector("[data-theme-toggle]");
  themeToggle?.addEventListener("click", () => {
    const nextTheme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    saveTheme(nextTheme);
    applyTheme(nextTheme);
  });
})();
