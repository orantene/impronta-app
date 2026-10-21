import type { ReactNode } from "react";

import { loadDatedPicker, type DatedPicker } from "@/app/(public)/_dated/dated-picker-actions";
import { DatedPlacesMount } from "@/components/public-booking/DatedPlacesMount";
import { logServerError } from "@/lib/server/safe-error";
import { shouldMountDatedStep } from "@/lib/sessions/dated-mount";

/**
 * TUL-1472: the dated booking step for a TALENT-SITE service page, mounted the same way the
 * business service page mounts it (TUL-1411). Null when the item has no upcoming date, the
 * service hides its booking button, or anything is unreadable, so a non-dated service keeps its
 * generic booking link and a failure never breaks the page.
 */
export async function serviceDatedSlot(
  input: { tenantId: string | null; offeringId: string; locale: string; returnPath: string; publicCtaHidden?: boolean },
  loadPicker: (i: { tenantId: string; offeringId: string }) => Promise<DatedPicker> = loadDatedPicker,
): Promise<ReactNode> {
  if (!input.tenantId || input.publicCtaHidden) return null;
  try {
    const picker = await loadPicker({ tenantId: input.tenantId, offeringId: input.offeringId });
    if (!picker.ok || !shouldMountDatedStep(picker)) return null;
    return (
      <DatedPlacesMount
        tenantId={input.tenantId}
        offeringId={input.offeringId}
        locale={input.locale}
        picker={picker}
        returnPath={input.returnPath}
      />
    );
  } catch (err) {
    logServerError("talent-site.serviceDatedSlot", err);
    return null;
  }
}
