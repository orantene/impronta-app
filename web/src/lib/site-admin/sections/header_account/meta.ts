import type { SectionMeta } from "../types";

/**
 * WS-A A5 — header ACCOUNT widget embed. Wraps the live header's auth area
 * (account menu when signed in, login affordance otherwise) via the EXACT same
 * `HeaderAuthArea` widget the legacy header mounts. Shell-only (not in the page
 * section picker).
 */
export const headerAccountMeta: SectionMeta = {
  key: "header_account",
  label: "Header account",
  description:
    "The header's account menu / sign-in affordance. Live on the published shell; a placeholder chip in the editor.",
  businessPurpose: "feature",
  visibleToAgency: false,
  category: "navigation",
  inDefault: false,
  // Async Component (reads the actor session + tenant locale settings).
  hasLiveData: true,
};
