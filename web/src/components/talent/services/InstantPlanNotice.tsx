"use client";

/**
 * TUL-1270 #12: tells a talent whose plan has no instant booking that this
 * service will show as Request to book. Display only; the entitlement is read
 * from the same loader the public page uses, and the server refuses a NEW
 * instant choice on such a plan (offering-save-gate.server.ts).
 */
import Link from "next/link";
import { useEffect, useState } from "react";

import { useDashboardText } from "@/components/admin/shell/internal/dashboard-i18n";
import { instantPlanNoticeCopy, showInstantPlanNotice } from "@/lib/talent/instant-plan-gate";
import { loadInstantPlanEntitlement } from "@/lib/talent/instant-plan-entitlement-action";

export function InstantPlanNotice({
  talentId,
  effectiveMode,
  quote,
}: {
  talentId: string;
  effectiveMode: string | null | undefined;
  quote: boolean;
}) {
  const copy = useDashboardText();
  const [planAllowsInstant, setPlanAllowsInstant] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let live = true;
    void loadInstantPlanEntitlement(talentId).then((res) => {
      if (live && res.ok) setPlanAllowsInstant(res.planAllowsInstant);
    });
    return () => {
      live = false;
    };
  }, [talentId]);

  if (!showInstantPlanNotice({ effectiveMode, quote, planAllowsInstant })) return null;
  const t = instantPlanNoticeCopy(copy.isSpanish);
  return (
    <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-950" data-instant-plan-notice>
      {t.body}{" "}
      <Link href="/talent/plan" className="font-semibold underline">
        {t.cta}
      </Link>
    </p>
  );
}
