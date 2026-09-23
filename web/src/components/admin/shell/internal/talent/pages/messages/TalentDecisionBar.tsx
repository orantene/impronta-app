"use client";

import { useEffect, useState } from "react";

import { Btn } from "@/components/messages-v5/kit/primitives";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { messagingTalentDecide, messagingTalentInvitation } from "@/lib/server-actions/messaging-talent";
import { talentDecisionCopy } from "@/lib/messaging/talent-pov";

/**
 * Her own approve or decline. Shown only while she is invited. The buttons
 * call the same participant update the talent inbox already uses, and the
 * tenant is resolved on the server.
 */
export function TalentDecisionBar({ inquiryId }: { inquiryId: string | null }) {
  const locale = useDashboardLocale();
  const copy = talentDecisionCopy(locale);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!inquiryId) {
      setStatus(null);
      return;
    }
    let cancelled = false;
    void messagingTalentInvitation({ inquiryId }).then((result) => {
      if (cancelled) return;
      setStatus(result.ok ? result.status : null);
    });
    return () => {
      cancelled = true;
    };
  }, [inquiryId]);

  if (!inquiryId || status !== "invited") return null;

  const decide = (decision: "accept" | "decline") => {
    setBusy(true);
    void messagingTalentDecide({ inquiryId, decision }).then((result) => {
      setBusy(false);
      if (result.ok) setStatus(decision === "accept" ? "active" : "declined");
    });
  };

  return (
    <div data-talent-decision className="flex gap-2 px-3 py-2">
      <Btn size="sm" variant="primary" busy={busy} onClick={() => decide("accept")} data-talent-approve>
        {copy.approve}
      </Btn>
      <Btn size="sm" busy={busy} onClick={() => decide("decline")} data-talent-decline>
        {copy.decline}
      </Btn>
    </div>
  );
}
