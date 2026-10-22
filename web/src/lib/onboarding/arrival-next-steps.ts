/**
 * onb1-19 — arrival "Next steps" checklist.
 * Only mark a row done when the product has evidence (e.g. siteLive).
 * Never pre-tick the first row by index — that made "Visit your website"
 * look finished before the person opened the site.
 */

export type ArrivalNextStep = { label: string; done: boolean; /** Where the row goes, when it is a link. */ href?: string };

/**
 * G4: the Services screen for this arrival, from the panel link it already has.
 * A talent panel ends in /talent/today (Services is /talent/services); a business
 * workspace admin root has Services at <admin>/catalog. Null when neither fits,
 * so the row is simply not shown rather than pointing nowhere.
 */
export function servicesHrefFor(panelHref: string | null | undefined, business: boolean): string | null {
  const p = (panelHref ?? "").trim();
  if (!p) return null;
  const clean = p.split(/[?#]/)[0].replace(/\/+$/, "");
  if (/\/talent\/today$/.test(clean)) return clean.replace(/\/today$/, "/services");
  if (business && /^https?:\/\/|^\//.test(clean)) return `${clean}/catalog`;
  return null;
}

export function buildArrivalNextSteps(
  opts: { siteLive: boolean; business: boolean; servicesHref?: string | null; /** The "Set up {business}" block is shown, so it owns services and photos (no duplicate rows). */ setupBlock?: boolean },
  t: (key: string) => string,
): ArrivalNextStep[] {
  const services: ArrivalNextStep[] = opts.servicesHref && !(opts.business && opts.setupBlock)
    ? [{ label: t("public.onboarding.arrival.nextServices"), done: false, href: opts.servicesHref }]
    : [];
  if (opts.siteLive) {
    return [
      { label: t("public.onboarding.arrival.nextTalentLive"), done: true },
      ...services,
      { label: t("public.onboarding.arrival.nextTalentPhotos"), done: false },
      { label: t("public.onboarding.arrival.nextTalentBio"), done: false },
    ];
  }
  if (opts.business) {
    return [
      { label: t("public.onboarding.arrival.nextVisit"), done: false },
      ...services,
      { label: t("public.onboarding.arrival.nextCustomize"), done: false },
      ...(opts.setupBlock ? [] : [{ label: t("public.onboarding.arrival.nextPhotos"), done: false }]),
      { label: t("public.onboarding.arrival.nextDomain"), done: false },
      { label: t("public.onboarding.arrival.nextPremium"), done: false },
    ];
  }
  return [
    { label: t("public.onboarding.arrival.nextTalentPhotos"), done: false },
    ...services,
    { label: t("public.onboarding.arrival.nextTalentBio"), done: false },
    { label: t("public.onboarding.arrival.nextTalentShare"), done: false },
  ];
}
