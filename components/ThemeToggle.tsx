"use client";

import { useEffect, useState } from "react";

// Subtle, animated light/dark switch. The icon morphs sun <-> moon and the
// whole palette cross-fades during the toggle (see .theme-animating in CSS).
export function ThemeToggle() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  function toggle() {
    const el = document.documentElement;
    el.classList.add("theme-animating");
    const next = el.classList.toggle("dark");
    try {
      localStorage.setItem("theme", next ? "dark" : "light");
    } catch {}
    setDark(next);
    window.setTimeout(() => el.classList.remove("theme-animating"), 600);
  }

  return (
    <button
      onClick={toggle}
      title={dark ? "Switch to light" : "Switch to dark"}
      aria-label="Toggle dark mode"
      aria-pressed={dark}
      className="group relative flex h-8 w-8 items-center justify-center rounded-lg text-ink-soft hover:bg-paper"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* sun rays — fade/scale out in dark mode */}
        <g
          className="origin-center transition-all duration-500"
          style={{
            opacity: dark ? 0 : 1,
            transform: dark ? "scale(0.4) rotate(-90deg)" : "scale(1) rotate(0deg)",
          }}
        >
          <line x1="12" y1="2" x2="12" y2="4" />
          <line x1="12" y1="20" x2="12" y2="22" />
          <line x1="2" y1="12" x2="4" y2="12" />
          <line x1="20" y1="12" x2="22" y2="12" />
          <line x1="4.9" y1="4.9" x2="6.3" y2="6.3" />
          <line x1="17.7" y1="17.7" x2="19.1" y2="19.1" />
          <line x1="4.9" y1="19.1" x2="6.3" y2="17.7" />
          <line x1="17.7" y1="6.3" x2="19.1" y2="4.9" />
        </g>
        {/* the disc morphs: full circle (sun) -> crescent (moon) via the mask */}
        <circle
          cx="12"
          cy="12"
          r={dark ? 9 : 4.5}
          className="transition-all duration-500"
          fill={dark ? "currentColor" : "none"}
          stroke="currentColor"
        />
        {/* crescent cut-out, only visible in dark */}
        <circle
          cx={16}
          cy={9}
          r={8}
          className="transition-all duration-500"
          style={{ opacity: dark ? 1 : 0 }}
          fill="var(--color-surface)"
          stroke="none"
        />
      </svg>
    </button>
  );
}
