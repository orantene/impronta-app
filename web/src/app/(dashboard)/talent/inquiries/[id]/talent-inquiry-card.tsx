"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { handleActionResult } from "@/lib/inquiry/inquiry-action-result";
import { actionTalentInquiryApproval } from "@/app/(dashboard)/talent/inquiries/[id]/talent-inquiry-approval-actions";
import { LUXURY_GOLD_BUTTON_CLASS } from "@/lib/dashboard-shell-classes";
import { CheckCircle2, Clock, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export function TalentInquiryCard({
  inquiryId,
  inquiryVersion,
  offerId,
  participantId,
  participationStatus,
  approvalStatus,
  contactName,
  eventLocation,
  eventDate,
  messagePreview,
  ownLineCount,
  canApprove,
}: {
  inquiryId: string;
  inquiryVersion: number;
  offerId: string | null;
  participantId: string;
  participationStatus: string;
  approvalStatus: string | null;
  contactName: string | null;
  eventLocation: string | null;
  eventDate: string | null;
  messagePreview: string | null;
  ownLineCount: number;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  const canRespond =
    Boolean(offerId) && approvalStatus === "pending" && participationStatus === "active" && canApprove;

  async function submit(decision: "accepted" | "rejected") {
    if (!offerId || busy) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("inquiry_id", inquiryId);
      fd.set("offer_id", offerId);
      fd.set("participant_id", participantId);
      fd.set("expected_version", String(inquiryVersion));
      fd.set("decision", decision);
      const result = await actionTalentInquiryApproval(fd);
      handleActionResult(result, {
        onToast: (m) => toast.message(m),
        onRefresh: () => router.refresh(),
        onInlineError: (m) => toast.error(m),
        onBlockerBanner: (m) => toast.error(m),
      });
    } finally {
      setBusy(false);
    }
  }

  // Derive a clear contextual headline so talent always knows their state
  const stateHeadline = (() => {
    if (approvalStatus === "accepted") return { text: "You accepted this offer", icon: CheckCircle2, color: "text-emerald-600 dark:text-emerald-400", bg: "border-emerald-500/25 bg-emerald-500/[0.06]" };
    if (approvalStatus === "rejected") return { text: "You declined this offer", icon: XCircle, color: "text-destructive", bg: "border-destructive/25 bg-destructive/[0.04]" };
    if (canRespond) return { text: "Your response is needed", icon: Clock, color: "text-[var(--impronta-gold)]", bg: "border-[var(--impronta-gold)]/35 bg-[var(--impronta-gold)]/[0.06]" };
    if (!offerId) return { text: "Waiting for an offer", icon: Clock, color: "text-muted-foreground", bg: "border-border/50 bg-muted/10" };
    if (ownLineCount === 0) return { text: "Not on the current offer", icon: Clock, color: "text-muted-foreground", bg: "border-border/50 bg-muted/10" };
    return { text: "Offer is active", icon: Clock, color: "text-muted-foreground", bg: "border-border/50 bg-muted/10" };
  })();

  const Icon = stateHeadline.icon;

  return (
    <div id="talent-approval" className={cn("rounded-2xl border p-5 shadow-sm", stateHeadline.bg)}>
      {/* State headline — the first thing talent sees */}
      <div className="flex items-center gap-2">
        <Icon className={cn("size-4 shrink-0", stateHeadline.color)} aria-hidden />
        <p className={cn("text-sm font-semibold", stateHeadline.color)}>{stateHeadline.text}</p>
      </div>

      {canRespond ? (
        <>
          <p className="mt-2 text-sm text-muted-foreground">
            The agency has sent an offer that includes you. Review and confirm your participation.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              type="button"
              disabled={busy}
              className={cn(LUXURY_GOLD_BUTTON_CLASS, "rounded-full")}
              onClick={() => void submit("accepted")}
            >
              {busy ? "Submitting…" : "Accept"}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              className="rounded-full text-destructive hover:text-destructive"
              onClick={() => void submit("rejected")}
            >
              Decline
            </Button>
          </div>
        </>
      ) : approvalStatus === "accepted" ? (
        <p className="mt-2 text-sm text-muted-foreground">
          Your confirmation has been recorded. The agency will finalize the booking once all parties confirm.
        </p>
      ) : approvalStatus === "rejected" ? (
        <p className="mt-2 text-sm text-muted-foreground">
          You declined this offer. The agency may revise and resend — you will be notified if a new offer is prepared.
        </p>
      ) : !offerId ? (
        <p className="mt-2 text-sm text-muted-foreground">
          The agency hasn&apos;t sent an offer yet. Check the group thread for updates.
        </p>
      ) : ownLineCount === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">
          You are on the roster but not included in the current offer. The agency may update the offer lineup.
        </p>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">
          An offer is active. Your approval status: <span className="font-medium capitalize text-foreground">{approvalStatus ?? "pending"}</span>.
        </p>
      )}

      {/* Secondary detail strip */}
      <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 border-t border-border/30 pt-3 text-xs text-muted-foreground">
        <span>Slot: <span className="font-medium capitalize text-foreground/80">{participationStatus}</span></span>
        <span>Offer line: <span className="font-medium text-foreground/80">{ownLineCount > 0 ? "Included" : "Not included"}</span></span>
      </div>
    </div>
  );
}
