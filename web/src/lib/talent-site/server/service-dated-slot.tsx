import type { ReactNode } from "react";

import { loadDatedPicker, type DatedPicker } from "@/app/(public)/_dated/dated-picker-actions";
import { DatedPlacesMount } from "@/components/public-booking/DatedPlacesMount";
import { logServerError } from "@/lib/server/safe-error";
import { shouldMountDatedStep } from "@/lib/sessions/dated-mount";
import { datedTalentGate, type DatedTalentGate } from "@/lib/sessions/dated-talent-gate";
import { createServiceRoleClient } from "@/lib/supabase/admin";

/** The site's path prefix (may be empty) in front of the locale path, with no doubled slash. */
export function prefixedReturnPath(publicPathPrefix: string | null | undefined, localePath: string): string {
  const prefix = (publicPathPrefix ?? "").replace(/\/+$/, "");
  return `${prefix}${localePath.startsWith("/") ? localePath : `/${localePath}`}`;
}

async function defaultGate(i: { tenantId: string; offeringId: string; expectedTalentProfileId: string }): Promise<DatedTalentGate> {
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "unreadable" };
  return datedTalentGate(admin, i);
}

/**
 * TUL-1472: the dated booking step for a TALENT-SITE service page, mounted the same way the
 * business service page mounts it (TUL-1411). Null when the item has no upcoming date, the
 * service hides its booking button, the talent is not taking instant bookings (paused, or a
 * request / inquiry posture), or anything is unreadable, so a non-dated service keeps its
 * generic booking link and a failure never breaks the page. The purchase action re-checks the
 * same gate server-side; this only keeps the step from being offered.
 */
export async function serviceDatedSlot(
  input: {
    tenantId: string | null;
    offeringId: string;
    /** The talent whose site this is. Required: no talent, no step. */
    talentProfileId: string | null;
    locale: string;
    /** The locale-aware service path (without the site's path prefix). */
    returnPath: string;
    publicPathPrefix?: string | null;
    publicCtaHidden?: boolean;
  },
  loadPicker: (i: { tenantId: string; offeringId: string }) => Promise<DatedPicker> = loadDatedPicker,
  loadGate: (i: { tenantId: string; offeringId: string; expectedTalentProfileId: string }) => Promise<DatedTalentGate> = defaultGate,
): Promise<ReactNode> {
  if (!input.tenantId || !input.talentProfileId || input.publicCtaHidden) return null;
  try {
    const gate = await loadGate({
      tenantId: input.tenantId,
      offeringId: input.offeringId,
      expectedTalentProfileId: input.talentProfileId,
    });
    if (!gate.ok) return null;
    const picker = await loadPicker({ tenantId: input.tenantId, offeringId: input.offeringId });
    if (!picker.ok || !shouldMountDatedStep(picker)) return null;
    return (
      <DatedPlacesMount
        tenantId={input.tenantId}
        offeringId={input.offeringId}
        locale={input.locale}
        picker={picker}
        returnPath={prefixedReturnPath(input.publicPathPrefix, input.returnPath)}
        channel="talent_site"
      />
    );
  } catch (err) {
    logServerError("talent-site.serviceDatedSlot", err);
    return null;
  }
}
