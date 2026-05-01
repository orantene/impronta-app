"use client";

/**
 * First-time admin tour — 4-step orientation overlay.
 *
 * Thin wrapper around the reusable `<GuidedTour>` primitive (WS-9.7).
 * To add a tour for another surface (talent first-run, client first-run,
 * etc.) — define a steps array + storage key and mount the same primitive.
 *
 * Triggers ONCE per admin session: when surface=workspace + role≥editor +
 * localStorage flag missing. Each step pins a tooltip to a real DOM
 * element via `position: absolute` after a `getBoundingClientRect()` measurement
 * (preferred over `position: anchor()` for browser support).
 *
 * Steps:
 *   1. Bottom FAB           "+ New lives here · works on every page"
 *   2. Search ⌘K chip        "Find anything · talents, inquiries, settings"
 *   3. Workspace settings    "Permissions · branding · taxonomy"
 *   4. Help bell             "Notifications + AI assistant + shortcuts"
 *
 * After step 4 (or Skip) we set `tulala_admin_tour_done=1` so this never
 * shows again. The settings cog has a "Show tour again" entry that
 * clears the flag and re-fires the tour.
 */

import { GuidedTour, resetGuidedTour, type TourStep } from "./_guided-tour";

const ADMIN_STEPS: TourStep[] = [
  {
    selector: "[data-tulala-bottom-fab]",
    title: "This is your + everything",
    body: "Tap to create inquiries, add talent, ask the AI — all in one place. Works on every page.",
    position: "left",
  },
  {
    selector: "[aria-label='Search anything (⌘K)']",
    title: "Search across the whole app",
    body: "Talents, inquiries, settings, recent things — ⌘K opens it from anywhere.",
    position: "bottom",
  },
  {
    selector: "[aria-label='Workspace settings']",
    title: "Workspace settings live here",
    body: "Permissions, branding, taxonomy, talent types. The cog is your control panel.",
    position: "bottom",
  },
  {
    selector: "[aria-label*='Notifications']",
    title: "Notifications + Help",
    body: "Bell shows what needs attention. ? key from anywhere opens the keyboard shortcuts list.",
    position: "bottom",
  },
];

const STORAGE_KEY = "tulala_admin_tour_done";
const SESSION_STARTED_KEY = "tulala_admin_tour_session_active";

export function AdminTour() {
  return (
    <GuidedTour
      steps={ADMIN_STEPS}
      storageKey={STORAGE_KEY}
      sessionKey={SESSION_STARTED_KEY}
      durationLabel="30s tour"
    />
  );
}

/** Helper used by the settings cog "Show tour again" entry. */
export function resetAdminTour() {
  resetGuidedTour(STORAGE_KEY);
}
