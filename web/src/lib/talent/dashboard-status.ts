/**
 * ONE status source for the plan and publish copy on the Talent dashboard
 * (TUL-579). Every string that mentions "free website" or says a page is
 * live or not published comes from here, keyed on two facts only: the
 * current plan (free or paid) and whether the site is published.
 *
 * Why: a paid account was pitched "Unlock your free website", and a free
 * account's Profile showed "Your website is live" next to "Your public page
 * is not published yet". Both came from surfaces that each decided on their
 * own. Rules enforced by dashboard-status.test.ts:
 *   - a paid plan never gets "free" copy;
 *   - a published site never gets "not published" copy, and a draft site
 *     never gets "live" copy.
 */

export type DashboardPlanKind = "free" | "paid";
export type DashboardPublishKind = "live" | "draft";

/** Talent tiers are "free" | "pro" | "max"; anything not free counts as paid. */
export function dashboardPlanKind(tier: string | null | undefined): DashboardPlanKind {
  return !tier || tier === "free" ? "free" : "paid";
}

/** The site is live when the website flow OR the directory profile is published. */
export function dashboardPublishKind(input: {
  sitePublished: boolean;
  profilePublished?: boolean;
}): DashboardPublishKind {
  return input.sitePublished || input.profilePublished === true ? "live" : "draft";
}

export type DashboardStatusCopy = {
  /** "Unlock your free website" (free) or "Unlock your website" (paid). */
  unlockTitle: string;
  /** Today hero title when the profile is complete and no design is applied. */
  readyTitle: string;
  /** My presence card title in the same state. */
  unlockedCardTitle: string;
  /** The one activate action. */
  activateCta: string;
  /** "{n} things left before your free website" (paid: "...before your website"). */
  leftLine: (count: number) => string;
  /** Profile editor caption on a section that feeds the website score. */
  countsTowardSite: string;
  /** Title of the public page banner on Profile. */
  publicPageTitle: string;
  /** Hint line under that title. */
  publicPageHint: string;
};

export function dashboardStatusCopy(input: {
  plan: DashboardPlanKind;
  publish: DashboardPublishKind;
  es: boolean;
}): DashboardStatusCopy {
  const { plan, publish, es } = input;
  const free = plan === "free";
  const T = (en: string, sp: string) => (es ? sp : en);
  return {
    unlockTitle: free
      ? T("Unlock your free website", "Desbloquea tu sitio gratis")
      : T("Unlock your website", "Desbloquea tu sitio"),
    readyTitle: free
      ? T("Your free website is ready", "Tu sitio gratis está listo")
      : T("Your website is ready", "Tu sitio está listo"),
    unlockedCardTitle: free
      ? T("Free website unlocked", "Sitio gratis desbloqueado")
      : T("Website unlocked", "Sitio desbloqueado"),
    activateCta: free
      ? T("Activate your free website", "Activa tu sitio gratis")
      : T("Activate your website", "Activa tu sitio"),
    countsTowardSite: free
      ? T("Counts toward your free website", "Cuenta para tu sitio gratis")
      : T("Counts toward your website", "Cuenta para tu sitio"),
    leftLine: (count) => {
      const one = count === 1;
      if (free) {
        return es
          ? `${count} ${one ? "cosa falta" : "cosas faltan"} para tu sitio gratis`
          : `${count} ${one ? "thing" : "things"} left before your free website`;
      }
      return es
        ? `${count} ${one ? "cosa falta" : "cosas faltan"} para tu sitio`
        : `${count} ${one ? "thing" : "things"} left before your website`;
    },
    publicPageTitle:
      publish === "live"
        ? T("Your public page is live", "Tu página pública está en línea")
        : T("Your public page is not published yet", "Tu página pública aún no está publicada"),
    publicPageHint:
      publish === "live"
        ? T("Your page is published.", "Tu página está publicada.")
        : T(
            "Publish your profile to get a public address you can share.",
            "Publica tu perfil para tener una dirección pública que puedas compartir.",
          ),
  };
}
