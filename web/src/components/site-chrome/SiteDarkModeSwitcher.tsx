"use client";

/**
 * Phase 13 (S-14) — public-storefront dark-mode switcher.
 *
 * Floating pill bottom-right. Toggles `<html data-theme>` between unset
 * and `"dark"`, persists choice in localStorage, and respects an explicit
 * `?theme=dark|light|system` URL hint (one-shot — clears the param after
 * applying so deep links work but the URL stays clean).
 *
 * The CSS half lives in `app/token-presets.css` under the
 * `html[data-theme="dark"]` rule. This component only flips the
 * attribute — every visual change is token-driven.
 *
 * Mount once per public storefront layout. Stays out of the way in admin
 * (admin chrome has its own light-only design language).
 */

import { useEffect, useState, type ReactElement } from "react";

type Theme = "system" | "light" | "dark";

const STORAGE_KEY = "tulala.site.theme";

function readPreferredTheme(): Theme {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(STORAGE_KEY) as Theme | null;
  if (stored === "light" || stored === "dark" || stored === "system") {
    return stored;
  }
  return "system";
}

function applyTheme(t: Theme) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  if (t === "dark") {
    root.dataset.theme = "dark";
  } else if (t === "light") {
    root.dataset.theme = "light";
  } else {
    delete root.dataset.theme;
  }
}

export function SiteDarkModeSwitcher(): ReactElement | null {
  const [theme, setTheme] = useState<Theme>("system");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // 1. URL hint takes precedence on first load — operators can deep-link
    //    a tenant page in dark mode without touching the switcher.
    const url = new URL(window.location.href);
    const hint = url.searchParams.get("theme");
    let initial: Theme;
    if (hint === "dark" || hint === "light" || hint === "system") {
      initial = hint;
      window.localStorage.setItem(STORAGE_KEY, hint);
      // Strip the param so reload doesn't re-pin.
      url.searchParams.delete("theme");
      window.history.replaceState(null, "", url.toString());
    } else {
      initial = readPreferredTheme();
    }
    setTheme(initial);
    applyTheme(initial);
    setMounted(true);
  }, []);

  function cycle() {
    const next: Theme = theme === "dark" ? "light" : theme === "light" ? "system" : "dark";
    setTheme(next);
    applyTheme(next);
    if (next === "system") {
      window.localStorage.removeItem(STORAGE_KEY);
    } else {
      window.localStorage.setItem(STORAGE_KEY, next);
    }
  }

  if (!mounted) return null;
  return (
    <button
      type="button"
      className="site-dark-switch"
      onClick={cycle}
      aria-label="Toggle dark mode"
      title={`Theme: ${theme} (click to change)`}
    >
      {theme === "dark" ? "Dark" : theme === "light" ? "Light" : "Auto"}
    </button>
  );
}
