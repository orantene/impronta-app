"use client";

/**
 * TUL-1476 · the owner's terms step inside the "New profile" drawer, the door the People page
 * ("Invite" / "Add person" with the Public profile hat) opens. It is shown BEFORE the profile is
 * created, so the owner sees what is sent. The value lives in a ref the drawer reads when it saves
 * (so typing here never re-renders the whole drawer). Owner or admin only; anyone else
 * sees nothing (the step renders its own "owner only" line).
 */
import { useCallback, useState, type MutableRefObject } from "react";

import { JoinTermsStep } from "@/components/admin/service-hub/JoinTermsStep";
import type { JoinTermsInput } from "@/lib/service-hub/join-terms";

export function CreateJoinTerms({
  tenantSlug,
  locale,
  termsRef,
}: {
  tenantSlug: string;
  locale: string;
  termsRef: MutableRefObject<JoinTermsInput | null>;
}) {
  // Local state drives the controlled step; the ref is what the drawer reads at save time.
  const [value, setValue] = useState<JoinTermsInput | null>(null);
  const onChange = useCallback(
    (next: JoinTermsInput | null) => {
      termsRef.current = next;
      setValue(next);
    },
    [termsRef],
  );
  return (
    <div className="border-b border-admin-border px-[18px] py-3" data-testid="create-join-terms">
      <JoinTermsStep tenantSlug={tenantSlug} locale={locale} value={value} onChange={onChange} />
    </div>
  );
}
