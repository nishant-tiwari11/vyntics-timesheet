"use client";

export default function ThemeToggle() {
  function toggle() {
    const root = document.getElementById("ts-root");
    if (!root) return;
    const current =
      root.getAttribute("data-theme") ??
      (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const next = current === "dark" ? "light" : "dark";
    root.setAttribute("data-theme", next);
    try {
      localStorage.setItem("ts-theme", next);
    } catch {}
  }

  return (
    <button
      type="button"
      className="ts-btn ts-btn-ghost ts-icon-btn"
      onClick={toggle}
      aria-label="Toggle light / dark mode"
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
      </svg>
    </button>
  );
}
