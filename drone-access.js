(function () {
  const config = window.HatyaiRescueConfig || {};
  const accessHash = config.droneAccessHash || "";
  const storageKey = "hatyai-rescue-drone-access";

  const body = document.body;
  const gate = document.querySelector("[data-access-gate]");
  const app = document.querySelector("[data-drone-app]");
  const form = document.querySelector("#accessForm");
  const input = document.querySelector("#accessCode");
  const message = document.querySelector("#accessMessage");
  const logoutButtons = document.querySelectorAll("[data-access-logout]");

  function setMessage(text) {
    if (!message) return;
    message.textContent = text;
    message.classList.toggle("is-visible", Boolean(text));
  }

  function unlock() {
    body.classList.remove("is-access-locked");
    if (gate) gate.hidden = true;
    if (app) {
      app.hidden = false;
      app.removeAttribute("aria-hidden");
    }
  }

  function lock() {
    try {
      window.sessionStorage.removeItem(storageKey);
    } catch {
      // Session persistence is optional.
    }
    body.classList.add("is-access-locked");
    if (gate) gate.hidden = false;
    if (app) {
      app.hidden = true;
      app.setAttribute("aria-hidden", "true");
    }
    window.setTimeout(() => input?.focus(), 0);
  }

  async function sha256(value) {
    if (!window.crypto?.subtle) return "";
    const data = new TextEncoder().encode(value);
    const digest = await window.crypto.subtle.digest("SHA-256", data);
    return [...new Uint8Array(digest)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }

  try {
    if (accessHash && window.sessionStorage.getItem(storageKey) === accessHash) {
      unlock();
    }
  } catch {
    // If sessionStorage is blocked, the passcode form still works for the page.
  }

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    setMessage("");

    if (!accessHash) {
      unlock();
      return;
    }

    const enteredCode = input?.value || "";
    const enteredHash = await sha256(enteredCode);
    if (enteredHash === accessHash) {
      try {
        window.sessionStorage.setItem(storageKey, accessHash);
      } catch {
        // Keep the page unlocked even if the browser blocks sessionStorage.
      }
      if (input) input.value = "";
      unlock();
      return;
    }

    setMessage("รหัสไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง");
    input?.select();
  });

  logoutButtons.forEach((button) => {
    button.addEventListener("click", lock);
  });
})();
