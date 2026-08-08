"use client";

import { useState, useSyncExternalStore } from "react";

const TOGGLE_COOLDOWN_MS = 400;

function subscribe(onChange: () => void) {
  window.addEventListener("themechange", onChange);
  return () => window.removeEventListener("themechange", onChange);
}

function getSnapshot(): boolean {
  const stored = document.documentElement.dataset.theme;
  return (
    stored === "dark" ||
    (!stored && window.matchMedia("(prefers-color-scheme: dark)").matches)
  );
}

function getServerSnapshot(): boolean {
  return false;
}

export function ThemeToggle() {
  const isDark = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const [cooldown, setCooldown] = useState(false);

  function toggle() {
    if (cooldown) return;
    setCooldown(true);
    const next = isDark ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("theme", next);
    window.dispatchEvent(new Event("themechange"));
    setTimeout(() => setCooldown(false), TOGGLE_COOLDOWN_MS);
  }

  return (
    <button
      onClick={toggle}
      disabled={cooldown}
      className="fixed top-5 right-5 z-50 font-mono text-[13px] px-4 py-2 rounded-lg border border-border bg-surface text-text cursor-pointer hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-70"
    >
      {isDark ? "☾ Dark" : "☀ Light"}
    </button>
  );
}
