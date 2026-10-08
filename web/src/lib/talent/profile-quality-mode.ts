/**
 * Which line the Profile page's quality card shows. The website state (live or
 * not) comes from the SAME value as the top bar pill (useWebsiteFlow), so the
 * card can never say "2 things left before your free website" while the pill
 * says "Website live" (QA DS-34).
 */
export type ProfileQualityMode = "live" | "unlocked" | "unknown" | "left";

export function profileQualityMode(input: {
  published: boolean;
  unlocked: boolean;
  percent: number | null;
}): ProfileQualityMode {
  if (input.published) return "live";
  if (input.unlocked) return "unlocked";
  if (input.percent == null) return "unknown";
  return "left";
}
