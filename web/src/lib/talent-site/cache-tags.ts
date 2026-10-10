import { revalidatePath, revalidateTag } from "next/cache";

export type TalentSiteCacheKind = "site" | "site-list";

export function tagForTalentSite(
  talentProfileId: string,
  kind: TalentSiteCacheKind,
): string {
  return `talent:${talentProfileId}:${kind}`;
}

export function bustTalentSiteCache(
  talentProfileId: string,
  profileCode: string | null,
): void {
  revalidateTag(tagForTalentSite(talentProfileId, "site"), "default");
  revalidateTag(tagForTalentSite(talentProfileId, "site-list"), "default");
  // Vanity host rewrite target (TUL-445 CDN / short s-maxage).
  revalidatePath("/_talent-site");
  if (profileCode) {
    revalidatePath(`/t/${profileCode}`);
  }
}
