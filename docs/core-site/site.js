const themeButton = document.querySelector("#theme-toggle");
const sidebarButton = document.querySelector("#sidebar-toggle");
let storedTheme;
try {
  storedTheme = localStorage.getItem("pfd-docs-theme");
} catch {}
function setTheme(theme) {
  document.documentElement.dataset.theme = theme;
  themeButton.setAttribute(
    "aria-label",
    theme === "midnight" ? "Switch to light theme" : "Switch to midnight theme",
  );
  themeButton.title = theme === "midnight" ? "Light theme" : "Midnight theme";
}
setTheme(
  storedTheme ||
    (matchMedia("(prefers-color-scheme: dark)").matches ? "midnight" : "light"),
);
themeButton.addEventListener("click", () => {
  const next =
    document.documentElement.dataset.theme === "midnight"
      ? "light"
      : "midnight";
  setTheme(next);
  try {
    localStorage.setItem("pfd-docs-theme", next);
  } catch {}
});
function setSidebar(closed) {
  document.body.classList.toggle("sidebar-closed", closed);
  sidebarButton.setAttribute("aria-expanded", String(!closed));
  sidebarButton.title = closed ? "Open navigation" : "Close navigation";
}
setSidebar(matchMedia("(max-width: 850px)").matches);
sidebarButton.addEventListener("click", () =>
  setSidebar(!document.body.classList.contains("sidebar-closed")),
);
document.querySelector("#sidebar").addEventListener("click", (event) => {
  if (event.target.closest("a") && matchMedia("(max-width: 850px)").matches)
    setSidebar(true);
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setSidebar(true);
    sidebarButton.focus();
  }
});
const button = document.querySelector(".view-toggle");
const main = document.querySelector("main");
const original = main.innerHTML;
button.addEventListener("click", async () => {
  const active = button.getAttribute("aria-pressed") === "true";
  if (active) {
    main.innerHTML = original;
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", "Switch to agent view");
    button.title = "Switch to agent view";
    document.body.classList.remove("agent-view");
  } else {
    try {
      const response = await fetch("agent-guide.md");
      if (!response.ok) throw new Error("Guide unavailable");
      const text = await response.text();
      main.replaceChildren();
      const heading = document.createElement("h1");
      heading.textContent = "Agent view";
      const link = document.createElement("a");
      link.href = "agent-guide.md";
      link.textContent = "Open raw Markdown";
      const pre = document.createElement("pre");
      pre.className = "raw-guide";
      pre.textContent = text;
      main.append(heading, link, pre);
      button.setAttribute("aria-pressed", "true");
      button.setAttribute("aria-label", "Switch to human view");
      button.title = "Switch to human view";
      document.body.classList.add("agent-view");
    } catch {
      window.location.href = "agent-guide.md";
    }
  }
  window.scrollTo({ top: 0, behavior: "auto" });
});
