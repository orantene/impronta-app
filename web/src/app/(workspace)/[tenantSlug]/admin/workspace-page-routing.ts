import type { WorkspacePage } from "@/components/admin/shell/internal/state";

const WORKSPACE_PAGE_ALIASES: Partial<Record<string, WorkspacePage>> = {
  inbox: "messages",
  work: "messages",
  talent: "roster",
  site: "website",
  billing: "settings",
  workspace: "settings",
};

const WORKSPACE_PAGE_SEGMENTS = new Set<string>([
  "overview",
  "messages",
  "calendar",
  "menu",
  "roster",     // also covers /roster/applications (layout strips to first segment)
  "clients",
  "reviews",    // WP1 — reputation surface (moderation queue + review photos)
  "analytics",  // WP1 — funnel / money / website / reviews
  "website",
  "media",
  "pitches",
  "financials", // L46 — canonical server route; not a SPA tab
  "orders",     // 0.10 — canonical server route; not a SPA tab
  "events",     // Events & Ticketing — SPA tab (menu shape); reachable by URL now, rail door deferred (events-on gate)
  "payouts",    // Stripe Connect payout onboarding + base reservation fee (in-shell SPA section)
  "settings",
]);

export function resolveWorkspaceAdminPage(raw: string): WorkspacePage {
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return "overview";
  const alias = WORKSPACE_PAGE_ALIASES[normalized];
  if (alias) return alias;
  if (WORKSPACE_PAGE_SEGMENTS.has(normalized)) {
    return normalized as WorkspacePage;
  }
  return "overview";
}
