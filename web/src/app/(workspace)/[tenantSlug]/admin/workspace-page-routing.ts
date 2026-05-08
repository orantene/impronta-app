import type { WorkspacePage } from "@/app/prototypes/admin-shell/_state";

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
  "roster",
  "clients",
  "operations",
  "production",
  "website",
  "media",
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
