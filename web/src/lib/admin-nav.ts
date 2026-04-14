/**
 * Admin documentation hub — sidebar order and hrefs mirror {@link ADMIN_PROTOTYPE_NAV} Docs group.
 * Single source for docs IA (prototype shell + in-app docs mini-nav).
 */
export const ADMIN_DOCS_NAV_LINKS = [
  { label: "Overview", href: "/admin/docs" },
  { label: "AI Documentation", href: "/admin/docs/ai" },
  { label: "Search & Ranking", href: "/admin/docs/search" },
  { label: "Talent System", href: "/admin/docs/talent" },
  { label: "Clients & Inquiries", href: "/admin/docs/clients" },
  { label: "Directory & Filters", href: "/admin/docs/directory" },
  { label: "Taxonomy & Attributes", href: "/admin/docs/taxonomy" },
  { label: "Featured & Visibility", href: "/admin/docs/featured" },
  { label: "Analytics", href: "/admin/docs/analytics" },
  { label: "Translations", href: "/admin/docs/translations" },
  { label: "Permissions & Roles", href: "/admin/docs/permissions" },
  { label: "API & Integrations", href: "/admin/docs/api" },
  { label: "Settings & Feature Flags", href: "/admin/docs/settings" },
  { label: "Troubleshooting", href: "/admin/docs/troubleshooting" },
  { label: "Release Notes", href: "/admin/docs/release-notes" },
] as const;

export type AdminDocsNavLink = (typeof ADMIN_DOCS_NAV_LINKS)[number];
