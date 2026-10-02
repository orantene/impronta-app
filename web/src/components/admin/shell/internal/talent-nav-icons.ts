import type { AdminShellIconName } from "./primitives/icons";

/** Talent dashboard nav icons, one per page. Shared by the dashboard rail and
 *  the talent builder's identity menu so both read one source of truth. */
export const TALENT_SIDEBAR_ICON: Record<string, AdminShellIconName> = {
  today: "home",
  messages: "mail",
  calendar: "calendar",
  clients: "team",
  money: "credit",
  profile: "user",
  "public-page": "globe",
  services: "briefcase",
  reviews: "star",
  settings: "settings",
};
