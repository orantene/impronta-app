/**
 * onb1-19 — arrival "Next steps" checklist.
 * Only mark a row done when the product has evidence (e.g. siteLive).
 * Never pre-tick the first row by index — that made "Visit your website"
 * look finished before the person opened the site.
 */

export type ArrivalNextStep = { label: string; done: boolean };

export function buildArrivalNextSteps(
  opts: { siteLive: boolean; business: boolean },
  t: (key: string) => string,
): ArrivalNextStep[] {
  if (opts.siteLive) {
    return [
      { label: t("public.onboarding.arrival.nextTalentLive"), done: true },
      { label: t("public.onboarding.arrival.nextTalentPhotos"), done: false },
      { label: t("public.onboarding.arrival.nextTalentBio"), done: false },
    ];
  }
  if (opts.business) {
    return [
      { label: t("public.onboarding.arrival.nextVisit"), done: false },
      { label: t("public.onboarding.arrival.nextCustomize"), done: false },
      { label: t("public.onboarding.arrival.nextPhotos"), done: false },
      { label: t("public.onboarding.arrival.nextDomain"), done: false },
      { label: t("public.onboarding.arrival.nextPremium"), done: false },
    ];
  }
  return [
    { label: t("public.onboarding.arrival.nextTalentPhotos"), done: false },
    { label: t("public.onboarding.arrival.nextTalentBio"), done: false },
    { label: t("public.onboarding.arrival.nextTalentShare"), done: false },
  ];
}
