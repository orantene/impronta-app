import type { TalentSiteStatus } from "@/lib/talent-site/types";

export type WebsiteRewardState =
  | "profile_unfinished"
  | "unlocked_not_activated"
  | "setup_unfinished"
  | "ready_to_publish"
  | "live";

export function websiteRewardState(input: {
  completionPercent: number;
  siteStatus: TalentSiteStatus | null;
}): WebsiteRewardState {
  if (input.siteStatus === "published") return "live";
  if (input.completionPercent < 80) return "profile_unfinished";
  if (!input.siteStatus) return "unlocked_not_activated";
  if (input.siteStatus === "draft") return "setup_unfinished";
  if (input.siteStatus === "unpublished") return "ready_to_publish";
  return "setup_unfinished";
}

export function websiteRewardCopy(
  state: WebsiteRewardState,
  percent: number,
  locale: string,
): { title: string; detail: string } {
  const es = locale.toLowerCase().startsWith("es");
  switch (state) {
    case "live":
      return {
        title: es ? "Tu sitio está en vivo" : "Your website is live",
        detail: es ? "Ábrelo o sigue editando." : "Open it or keep editing.",
      };
    case "ready_to_publish":
      return {
        title: es ? "Tu sitio está listo" : "Your website is ready",
        detail: es ? "Míralo y publícalo" : "Have a look, then publish it",
      };
    case "setup_unfinished":
      return {
        title: es ? "Termina tu sitio" : "Finish setting up your website",
        detail: es ? "Elegiste tu dirección y te detuviste ahí" : "You chose your address and stopped there",
      };
    case "unlocked_not_activated":
      return {
        title: es ? "Sitio gratis desbloqueado" : "Free website unlocked",
        detail: es ? "Actívalo y lo armamos con tu perfil" : "Activate it and we build it from your profile",
      };
    default:
      return {
        title: es ? "Desbloquea tu sitio gratis" : "Unlock your free website",
        detail: es
          ? `Tu perfil está al ${percent}%`
          : `Your profile is ${percent}% complete`,
      };
  }
}
