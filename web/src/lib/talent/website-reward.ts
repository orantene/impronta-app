import type { TalentSiteStatus } from "@/lib/talent-site/types";

export type WebsiteRewardState =
  | "profile_unfinished"
  | "unlocked_not_activated"
  | "setup_unfinished"
  | "ready_to_publish"
  | "live";

/**
 * Header / reward state machine (§4.1).
 * Live always wins — a published site must never produce Unlock copy (W23).
 * Unlock requires 100% completion (W19); eligibility is the sole percent source.
 */
export function websiteRewardState(input: {
  completionPercent: number;
  siteStatus: TalentSiteStatus | null;
}): WebsiteRewardState {
  if (input.siteStatus === "published") return "live";
  if (input.completionPercent < 100) return "profile_unfinished";
  if (!input.siteStatus) return "unlocked_not_activated";
  if (input.siteStatus === "draft") return "setup_unfinished";
  if (input.siteStatus === "unpublished") return "ready_to_publish";
  return "setup_unfinished";
}

/** Spec §4.1 header titles — keep EN strings as i18n keys via dashboard-i18n. */
export function websiteRewardCopy(
  state: WebsiteRewardState,
  percent: number,
  locale: string,
): { title: string; detail: string } {
  const es = locale.toLowerCase().startsWith("es");
  switch (state) {
    case "live":
      return {
        title: es ? "Sitio en vivo" : "Website live",
        detail: es ? "Ábrelo o sigue editando." : "Open it or keep editing.",
      };
    case "ready_to_publish":
      return {
        title: es ? "Tu sitio está listo" : "Your website is ready",
        detail: es ? "Míralo y publícalo" : "Have a look, then publish it",
      };
    case "setup_unfinished":
      return {
        title: es ? "Termina la configuración del sitio" : "Finish website setup",
        detail: es ? "Perfil completo · sigue donde lo dejaste" : "Profile complete · pick up where you left off",
      };
    case "unlocked_not_activated":
      return {
        title: es ? "Activa tu sitio" : "Activate your website",
        detail: es ? "Perfil completo" : "Profile complete",
      };
    default:
      return {
        title: es ? "Desbloquea tu sitio gratis" : "Unlock your free website",
        detail: es
          ? `${percent}%`
          : `${percent}%`,
      };
  }
}
