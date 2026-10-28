try {
  const saved = localStorage.getItem("pfd-docs-theme");
  document.documentElement.dataset.theme =
    saved === "light" || saved === "midnight"
      ? saved
      : matchMedia("(prefers-color-scheme: dark)").matches
        ? "midnight"
        : "light";
} catch {
  document.documentElement.dataset.theme = matchMedia(
    "(prefers-color-scheme: dark)",
  ).matches
    ? "midnight"
    : "light";
}
