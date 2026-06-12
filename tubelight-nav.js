(function () {
  const page = document.body?.dataset.page || "home";
  const inDroneSection = window.location.pathname.includes("/drone/");
  const base = inDroneSection ? "../" : "./";

  const items = [
    {
      key: "home",
      label: "หน้าแรก",
      href: `${base}index.html`,
      icon: '<path d="M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3V10.5Z" />'
    },
    {
      key: "search",
      label: "ตรวจรายชื่อ",
      href: `${base}search.html`,
      icon: '<circle cx="11" cy="11" r="7" /><path d="m16 16 5 5" />'
    },
    {
      key: "report",
      label: "แจ้งผู้สูญหาย",
      href: `${base}report.html`,
      icon: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9Z" /><path d="M14 3v6h6M8 13h8M8 17h5" />'
    },
    {
      key: "drone",
      label: "Drone Ops",
      href: `${base}drone/`,
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
    </div>
  `;

  document.body.append(nav);
})();
