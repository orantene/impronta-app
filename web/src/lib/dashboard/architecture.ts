export type DashboardRole = "guest" | "talent" | "client" | "admin";

export type DashboardNavIconKey =
  | "overview"
  | "profile"
  | "portfolio"
  | "preview"
  | "status"
  | "account"
  | "talent"
  | "media"
  | "mediaLibrary"
  | "mediaQueue"
  | "clients"
  | "accounts"
  | "inquiries"
  | "taxonomy"
  | "fields"
  | "directoryFilters"
  | "locations"
  | "settings"
  | "saved"
  | "requests"
  | "search"
  | "admins"
  | "translations";

export type DashboardNavItem = {
  /** Stable key for React lists (defaults to href). */
  id?: string;
  href: string;
  label: string;
  match?: "exact" | "prefix";
  icon: DashboardNavIconKey;
  /**
   * Optional query-param rules for highlighting the active item.
   * - `string`: param must equal this value
   * - `null`: param must be absent (or empty)
   * - `undefined`: ignore this key
   */
  activeQuery?: Record<string, string | null | undefined>;
};

export type DashboardNavGroup = {
  id: string;
  /** Section title; ignored when singleLink is true (see items[0].label). */
  label: string;
  items: DashboardNavItem[];
  collapsible?: boolean;
  /**
   * When true and there is exactly one item, render a single top-level nav link (no section header).
   * Used for talent Preview / My Profile.
   */
  singleLink?: boolean;
};

export type DashboardOwnershipRule = {
  owner: DashboardRole;
  resources: string[];
  notes: string;
};

/**
 * Talent sidebar order: Preview → Status → My profile → Profile (field groups only) → Media → Account.
 * Profile group items are merged in the dashboard layout from {@link fetchTalentNavProfileGroupItems}.
 */
export const TALENT_DASHBOARD_GROUPS: DashboardNavGroup[] = [
  {
    id: "talent-nav-preview",
    label: "Preview",
    singleLink: true,
    collapsible: false,
    items: [
      {
        id: "talent-preview-link",
        href: "/talent/preview",
        label: "Preview",
        match: "exact",
        icon: "preview",
      },
    ],
  },
  {
    id: "talent-nav-status",
    label: "Status",
    singleLink: true,
    collapsible: false,
    items: [
      {
        id: "talent-status-link",
        href: "/talent/status",
        label: "Status",
        match: "exact",
        icon: "status",
      },
    ],
  },
  {
    id: "talent-nav-my-profile",
    label: "My profile",
    singleLink: true,
    collapsible: false,
    items: [
      {
        id: "talent-my-profile-root",
        href: "/talent/my-profile",
        label: "My profile",
        match: "exact",
        icon: "profile",
        activeQuery: { group: null },
      },
    ],
  },
  {
    id: "profile",
    label: "Profile",
    collapsible: true,
    items: [],
  },
  {
    id: "media",
    label: "Media",
    collapsible: true,
    items: [
      {
        id: "talent-media-manager",
        href: "/talent/portfolio",
        label: "All Media",
        match: "exact",
        icon: "media",
        activeQuery: { tab: null },
      },
      {
        id: "talent-media-profile-photo",
        href: "/talent/portfolio?tab=profile-photo",
        label: "Profile Photo",
        match: "exact",
        icon: "media",
        activeQuery: { tab: "profile-photo" },
      },
      {
        id: "talent-media-cover",
        href: "/talent/portfolio?tab=cover",
        label: "Cover Photo",
        match: "exact",
        icon: "media",
        activeQuery: { tab: "cover" },
      },
      {
        id: "talent-media-portfolio",
        href: "/talent/portfolio?tab=portfolio",
        label: "Portfolio",
        match: "exact",
        icon: "media",
        activeQuery: { tab: "portfolio" },
      },
    ],
  },
  {
    id: "account",
    label: "Account",
    collapsible: true,
    items: [{ href: "/talent/account", label: "Account", match: "exact", icon: "account" }],
  },
];

export const CLIENT_DASHBOARD_GROUPS: DashboardNavGroup[] = [
  {
    id: "workspace",
    label: "Workspace",
    collapsible: false,
    items: [
      { href: "/client/overview", label: "Overview", match: "exact", icon: "overview" },
      { href: "/client/saved", label: "Saved Talent", match: "exact", icon: "saved" },
      { href: "/client/requests", label: "Requests", match: "prefix", icon: "requests" },
    ],
  },
  {
    id: "account",
    label: "Account",
    collapsible: true,
    items: [{ href: "/client/account", label: "Account", match: "exact", icon: "account" }],
  },
];

/**
 * Admin nav follows the agency workflow: People → Bookings → Media → directory data → System.
 * Future sections (not shown): Dashboard activity/notifications; People managers/favorites;
 * Bookings calendar/pricing/payments; Media galleries/bulk upload; Automation; Reporting;
 * System permissions/audit. See {@link ADMIN_NAV_FUTURE_ITEMS} for a structured checklist.
 */
export const ADMIN_DASHBOARD_GROUPS: DashboardNavGroup[] = [
  {
    id: "admin-dashboard",
    label: "Dashboard",
    collapsible: true,
    items: [{ href: "/admin", label: "Overview", match: "exact", icon: "overview" }],
  },
  {
    id: "admin-people",
    label: "People",
    collapsible: true,
    items: [
      {
        id: "admin-user-search",
        href: "/admin/users/search",
        label: "Search",
        match: "prefix",
        icon: "search",
      },
      { href: "/admin/talent", label: "Talents", match: "prefix", icon: "talent" },
      { href: "/admin/clients", label: "Clients", match: "prefix", icon: "clients" },
      {
        id: "admin-staff",
        href: "/admin/users/admins",
        label: "Admins",
        match: "prefix",
        icon: "admins",
      },
    ],
  },
  {
    id: "admin-bookings",
    label: "Bookings",
    collapsible: true,
    items: [
      { href: "/admin/inquiries", label: "Inquiries", match: "prefix", icon: "inquiries" },
      { href: "/admin/bookings", label: "Bookings", match: "prefix", icon: "requests" },
      {
        id: "admin-client-accounts",
        href: "/admin/accounts",
        label: "Client Locations",
        match: "prefix",
        icon: "locations",
      },
    ],
  },
  {
    id: "admin-media",
    label: "Media",
    collapsible: true,
    items: [
      {
        id: "admin-media-library",
        href: "/admin/media?tab=library",
        label: "Media Library",
        match: "exact",
        icon: "mediaLibrary",
        activeQuery: { tab: "library" },
      },
      {
        id: "admin-media-pending",
        href: "/admin/media",
        label: "Pending Approvals",
        match: "exact",
        icon: "mediaQueue",
        activeQuery: { tab: null },
      },
    ],
  },
  {
    id: "admin-directory",
    label: "Directory / Talent Data",
    collapsible: true,
    items: [
      { href: "/admin/fields", label: "Fields", match: "prefix", icon: "fields" },
      {
        id: "admin-directory-filters",
        href: "/admin/directory/filters",
        label: "Directory filters",
        match: "exact",
        icon: "directoryFilters",
      },
      { href: "/admin/taxonomy", label: "Taxonomy", match: "prefix", icon: "taxonomy" },
      { href: "/admin/locations", label: "Locations", match: "prefix", icon: "locations" },
    ],
  },
  {
    id: "admin-system",
    label: "System",
    collapsible: true,
    items: [
      {
        id: "admin-translations",
        href: "/admin/translations",
        label: "Translations",
        match: "prefix",
        icon: "translations",
      },
      { href: "/admin/settings", label: "Settings", match: "prefix", icon: "settings" },
      { href: "/admin/account", label: "Account", match: "prefix", icon: "account" },
    ],
  },
];

/** Documented future nav entries — keep in sync with product; do not merge until shipped. */
export const ADMIN_NAV_FUTURE_ITEMS = {
  dashboard: ["Activity feed", "Notifications"],
  people: ["Managers (booking assignment)", "Favorites (saved talent collections)"],
  bookings: [
    "Calendar",
    "Availability",
    "Pricing / Rates",
    "Payments",
    "Invoices",
    "Booking Templates",
    "Booking Activity",
    "Contracts",
  ],
  media: ["Talent Galleries", "Bulk Upload"],
  directory: ["Filters Manager (taxonomy UI)"],
  automation: ["AI Assistant", "Auto Matching", "Email Automation", "WhatsApp Automation"],
  reporting: [
    "Revenue Reports",
    "Talent Earnings",
    "Client Reports",
    "Booking Analytics",
    "Conversion Funnel",
  ],
  system: ["Permissions / Roles", "Notifications Settings", "Logs / Audit Trail"],
} as const;

export const TALENT_DASHBOARD_ROUTES = TALENT_DASHBOARD_GROUPS.flatMap((group) => group.items);
export const CLIENT_DASHBOARD_ROUTES = CLIENT_DASHBOARD_GROUPS.flatMap((group) => group.items);
export const ADMIN_DASHBOARD_ROUTES = ADMIN_DASHBOARD_GROUPS.flatMap((group) => group.items);

export function dashboardGroupsForRole(role: DashboardRole): DashboardNavGroup[] {
  if (role === "admin") return ADMIN_DASHBOARD_GROUPS;
  if (role === "talent") return TALENT_DASHBOARD_GROUPS;
  if (role === "client") return CLIENT_DASHBOARD_GROUPS;
  return [];
}

export const DASHBOARD_OWNERSHIP_RULES: DashboardOwnershipRule[] = [
  {
    owner: "guest",
    resources: ["guest_session_id", "saved_talent", "inquiries"],
    notes: "Guest activity is temporary and can merge into the eventual client account.",
  },
  {
    owner: "talent",
    resources: [
      "talent_profiles",
      "field_values",
      "media_assets",
      "talent_submission_consents",
      "talent_submission_history",
    ],
    notes: "Talent owns draft profile content and uploads, while staff controls publication and review.",
  },
  {
    owner: "client",
    resources: ["client_profiles", "saved_talent", "inquiries"],
    notes: "Clients manage saved talent, inquiry history, and reusable business details.",
  },
  {
    owner: "admin",
    resources: [
      "workflow_status",
      "visibility",
      "featured placement",
      "taxonomy_terms",
      "field_definitions",
      "locations",
      "submission review",
      "terms version governance",
    ],
    notes: "Agency staff governs approvals, merchandising, taxonomy, fields, operations, and workflow decisions.",
  },
];
