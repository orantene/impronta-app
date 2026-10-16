import {
  EMERGENCIES_TODAY_LABEL,
  NO_EMERGENCIES_TODAY_LABEL,
} from "@/lib/talent-site/theme-catalog/seed-i18n";

import type { BuilderUtilityBarNode, BuilderAlertBandNode } from "./types";

/** Default props for a freshly inserted `utility_bar` (shell header). */
export const UTILITY_BAR_DEFAULT_PROPS: BuilderUtilityBarNode["props"] = {
  name: "{{displayName}}",
  subtitle: "",
  homeHref: "/",
  showStatus: true,
  statusOnLabel: EMERGENCIES_TODAY_LABEL.en,
  statusOffLabel: NO_EMERGENCIES_TODAY_LABEL.en,
  showCall: true,
  callLabel: "Call",
  ctaLabel: "",
  ctaHref: "/contact",
};

export function cloneUtilityBarDefaultProps(): BuilderUtilityBarNode["props"] {
  return { ...UTILITY_BAR_DEFAULT_PROPS };
}

/** Default props for a freshly inserted `alert_band`. */
export const ALERT_BAND_DEFAULT_PROPS: BuilderAlertBandNode["props"] = {
  title: "Same-day emergency",
  body: "",
  safetyLabel: "Meanwhile:",
  safetyNote: "",
  ctaLabel: "Request now",
  ctaHref: "/contact",
};

export function cloneAlertBandDefaultProps(): BuilderAlertBandNode["props"] {
  return { ...ALERT_BAND_DEFAULT_PROPS };
}
