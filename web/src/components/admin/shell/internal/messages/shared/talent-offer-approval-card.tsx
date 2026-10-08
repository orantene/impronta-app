"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { respondToInquiryOffer } from "@/lib/server-actions/talent-pipeline";
import { fmtMoney } from "./machinery-10";
import { useAdminShell, COLORS } from "../../state";
import { primaryBtn, ghostBtn } from "./machinery-13";
import type { TalentOfferViewState } from "./talent-offer-view";

/** Approve / reject (or approved / declined badge) for a sent offer, in the Oferta tab. */
export function TalentOfferApprovalCard({
  inquiryId,
  view,
  takeHome,
}: {
  inquiryId: string;
  view: Exclude<TalentOfferViewState, "draft_cta">;
  takeHome: { takeHomeCents: number; currency: string } | null;
}) {
  const t = useT();
  const router = useRouter();
  const { toast } = useAdminShell();
  const [pending, start] = useTransition();
  const respond = (decision: "accepted" | "rejected") =>
    start(async () => {
      const r = await respondToInquiryOffer(inquiryId, decision);
      if (!r.ok) {
        toast(interpolate(t(decision === "accepted" ? "dashboard.talentThread.toastApproveFailed" : "dashboard.talentThread.toastDeclineFailed"), { error: r.error }));
        return;
      }
      toast(t(decision === "accepted" ? "dashboard.talentThread.toastOfferApproved" : "dashboard.talentThread.toastOfferDeclined"));
      router.refresh();
    });
  const heading =
    view === "approved" ? t("dashboard.talentThread.offerCardApprovedTitle")
    : view === "rejected" ? t("dashboard.talentThread.offerCardDeclinedTitle")
    : t("dashboard.talentThread.offerCardPendingTitle");
  const body =
    view === "approved" ? t("dashboard.talentThread.actionApprovedAwaitingHint")
    : view === "rejected" ? t("dashboard.talentThread.offerCardDeclinedBody")
    : t("dashboard.talentThread.actionOfferReceivedHint");
  return (
    <div
      data-testid="talent-offer-approval-card"
      data-view={view}
      className="flex flex-col gap-2.5 rounded-admin-md border border-admin-border-soft bg-white p-4 font-body"
    >
      <div className="text-admin-ink text-admin-13h font-bold">{heading}</div>
      <div className="text-[12.5px] leading-[1.5] text-admin-ink-muted">{body}</div>
      {takeHome && (
        <div className="text-admin-ink-muted text-admin-13h">
          {t("dashboard.talentThread.offerCardTakeHome")}{" "}
          <strong className="text-admin-ink">{fmtMoney(takeHome.takeHomeCents / 100, takeHome.currency)}</strong>
        </div>
      )}
      {view === "approve_pending" && (
        <div className="flex gap-2">
          <button type="button" disabled={pending} onClick={() => respond("accepted")} style={primaryBtn(COLORS.accent)}>
            {t("dashboard.talentThread.actionApproveOffer")}
          </button>
          <button type="button" disabled={pending} onClick={() => respond("rejected")} style={ghostBtn()}>
            {t("dashboard.talentThread.actionDecline")}
          </button>
        </div>
      )}
    </div>
  );
}
