"use server";

import { revalidatePath } from "next/cache";
import { bustTalentSiteCache } from "@/lib/talent-site/cache-tags";
import { authorizeForTalent } from "@/lib/talent/offerings-auth.server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { replaceOfferingChildren } from "@/lib/talent/offerings-children";
import type { OfferingVariant } from "@/lib/talent/offerings-types";
import type { LocalizedMap } from "@/lib/i18n/resolve-localized";
import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";

/**
 * Replace ONLY an offering's OPTIONS (variants), leaving its own extras alone.
 * The product editor saves its size/version rows through this: they used to be
 * edited on screen and never written (Services Phase 0 item 5a).
 */
export async function setOfferingVariants(
  talentProfileId: string,
  offeringId: string,
  variants: { label: string; amountCents: number | null; labelI18n?: LocalizedMap }[],
): Promise<{ ok: true; variants: OfferingVariant[] } | { ok: false; error: string }> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  try {
    const auth = await authorizeForTalent(talentProfileId);
    if (!auth.ok) return { ok: false, error: auth.error };
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Server configuration error." };
    const { data: own } = await admin.from("talent_offerings")
      .select("id")
      .eq("id", offeringId)
      .eq("talent_profile_id", talentProfileId)
      .maybeSingle();
    if (!own) return { ok: false, error: "Not found." };
    const saved = await replaceOfferingChildren(
      admin,
      offeringId,
      { variants, addOns: [] },
      "talent.offerings",
      auth.primaryLocale,
      { only: "variants" },
    );
    if (!saved.ok) return saved;
    revalidatePath("/talent/services");
    bustTalentSiteCache(talentProfileId, null);
    return { ok: true, variants: saved.variants };
  } catch (err) {
    logServerError("talent.offerings.setVariants", err);
    return { ok: false, error: "Unexpected error." };
  }
}
