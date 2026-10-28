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
