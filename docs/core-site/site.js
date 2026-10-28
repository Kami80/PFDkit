const themeButton = document.querySelector("#theme-toggle");
const sidebarButton = document.querySelector("#sidebar-toggle");
const sidebar = document.querySelector("#sidebar");
const main = document.querySelector("main");
const modeButton = document.querySelector(".view-toggle");
const original = main.innerHTML;
let rawText;
let busy = false;
let readingPosition = 0;
let sidebarWasClosed = false;
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeButton.setAttribute(
    "aria-label",
    theme === "midnight" ? "Switch to light theme" : "Switch to midnight theme",
  );
  themeButton.title = theme === "midnight" ? "Light theme" : "Midnight theme";
}
let savedTheme;
try {
  savedTheme = localStorage.getItem("pfd-docs-theme");
} catch {}
setTheme(
  savedTheme ||
    (matchMedia("(prefers-color-scheme: dark)").matches ? "midnight" : "light"),
);
themeButton.addEventListener("click", () => {
  const theme =
    document.documentElement.dataset.theme === "midnight"
      ? "light"
      : "midnight";
  setTheme(theme);
  try {
    localStorage.setItem("pfd-docs-theme", theme);
  } catch {}
});
function setSidebar(closed) {
  document.body.classList.toggle("sidebar-closed", closed);
  sidebarButton.setAttribute("aria-expanded", String(!closed));
  sidebarButton.title = closed ? "Open navigation" : "Close navigation";
}
setSidebar(matchMedia("(max-width: 1240px)").matches);
matchMedia("(max-width: 1240px)").addEventListener("change", (event) =>
  setSidebar(event.matches),
);
sidebarButton.addEventListener("click", () =>
  setSidebar(!document.body.classList.contains("sidebar-closed")),
);
sidebar.addEventListener("click", (event) => {
  if (event.target.closest("a") && matchMedia("(max-width: 1240px)").matches)
    setSidebar(true);
});
document.addEventListener("keydown", (event) => {
  if (
    event.key === "Escape" &&
    !document.body.classList.contains("sidebar-closed")
  ) {
    setSidebar(true);
    sidebarButton.focus();
  }
});
const status = document.createElement("div");
status.className = "sr-only";
status.setAttribute("role", "status");
document.body.append(status);
document.addEventListener("click", async (event) => {
  const copy = event.target.closest(".copy-code, .copy-markdown");
  if (!copy) return;
  try {
    await navigator.clipboard.writeText(
      copy.matches(".copy-markdown")
        ? rawText
        : copy.closest(".code-box").querySelector("code").textContent,
    );
    copy.textContent = "Copied";
    status.textContent = "Copied to clipboard";
    setTimeout(() => {
      copy.textContent = copy.matches(".copy-markdown")
        ? "Copy Markdown"
        : "Copy code";
    }, 1500);
  } catch {
    status.textContent =
      "Copy unavailable. Select the text and copy it manually.";
  }
});
modeButton.addEventListener("click", async () => {
  if (busy) return;
  const active = modeButton.getAttribute("aria-pressed") === "true";
  if (active) {
    main.innerHTML = original;
    observeHeadings();
    sidebarButton.hidden = false;
    document.body.classList.remove("agent-view");
    setSidebar(sidebarWasClosed);
    modeButton.setAttribute("aria-pressed", "false");
    modeButton.setAttribute("aria-label", "Switch to agent view");
    modeButton.title = "Switch to agent view";
    window.scrollTo({ top: readingPosition, behavior: "instant" });
    status.textContent = "Human view restored";
    return;
  }
  busy = true;
  modeButton.setAttribute("aria-busy", "true");
  status.textContent = "Loading Markdown";
  try {
    if (!rawText) {
      const response = await fetch("agent-guide.md");
      if (!response.ok) throw new Error("Guide unavailable");
      rawText = await response.text();
    }
    readingPosition = window.scrollY;
    observer.disconnect();
    sidebarButton.hidden = true;
    sidebarWasClosed = document.body.classList.contains("sidebar-closed");
    main.innerHTML =
      '<div class="eyebrow">DOCUMENTATION / MACHINE-READABLE</div><h1>Agent view</h1><p>The complete guide and API reference in plain Markdown. Copy it into your agent context, or open the source directly.</p><div class="agent-toolbar"><button class="copy-markdown">Copy Markdown</button><a href="agent-guide.md" download>Download .md</a><a href="agent-guide.md">Open raw source ↗</a></div><pre class="raw-guide" tabindex="0" aria-label="Complete Markdown documentation"></pre>';
    main.querySelector(".raw-guide").textContent = rawText;
    document.body.classList.add("agent-view");
    setSidebar(true);
    modeButton.setAttribute("aria-pressed", "true");
    modeButton.setAttribute("aria-label", "Switch to human view");
    modeButton.title = "Switch to human view";
    window.scrollTo({ top: 0, behavior: "instant" });
    status.textContent = "Agent view ready";
  } catch {
    status.textContent =
      "Markdown could not load. Try again or open agent-guide.md directly.";
  } finally {
    busy = false;
    modeButton.removeAttribute("aria-busy");
  }
});
const observer = new IntersectionObserver(
  (entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const link = [...sidebar.querySelectorAll("a")].find(
        (a) => a.hash === "#" + entry.target.id,
      );
      if (!link) continue;
      sidebar
        .querySelectorAll("[aria-current]")
        .forEach((a) => a.removeAttribute("aria-current"));
      link.setAttribute("aria-current", "location");
    }
  },
  { rootMargin: "-15% 0px -65% 0px" },
);
function observeHeadings() {
  observer.disconnect();
  main
    .querySelectorAll("h2[id],h3[id]")
    .forEach((heading) => observer.observe(heading));
}
observeHeadings();
