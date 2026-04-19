"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import type { RepresentationRequestStatus } from "@/lib/saas";
import {
  approveRepresentationRequestAction,
  pickUpRepresentationRequestAction,
  rejectRepresentationRequestAction,
  withdrawRepresentationRequestAction,
  type RepresentationReviewActionState,
} from "./actions";

export function RepresentationRequestRowActions({
  requestId,
  status,
}: {
  requestId: string;
  status: RepresentationRequestStatus;
}) {
  const [pickUpState, pickUp, pickUpPending] = useActionState<
    RepresentationReviewActionState,
    FormData
  >(pickUpRepresentationRequestAction, undefined);
  const [approveState, approve, approvePending] = useActionState<
    RepresentationReviewActionState,
    FormData
  >(approveRepresentationRequestAction, undefined);
  const [rejectState, reject, rejectPending] = useActionState<
    RepresentationReviewActionState,
    FormData
  >(rejectRepresentationRequestAction, undefined);
  const [withdrawState, withdraw, withdrawPending] = useActionState<
    RepresentationReviewActionState,
    FormData
  >(withdrawRepresentationRequestAction, undefined);

  const [showReject, setShowReject] = useState(false);
  const [reason, setReason] = useState("");

  const latestError =
    (pickUpState && !pickUpState.ok ? pickUpState.error : null)
    ?? (approveState && !approveState.ok ? approveState.error : null)
    ?? (rejectState && !rejectState.ok ? rejectState.error : null)
    ?? (withdrawState && !withdrawState.ok ? withdrawState.error : null);

  const pending = pickUpPending || approvePending || rejectPending || withdrawPending;

  return (
    <div className="flex w-full min-w-0 flex-col items-end gap-2 sm:w-auto">
      <div className="flex flex-wrap items-center gap-2">
        {status === "requested" ? (
          <form action={pickUp}>
            <input type="hidden" name="request_id" value={requestId} />
            <Button type="submit" size="sm" variant="outline" disabled={pending}>
              {pickUpPending ? "Picking up…" : "Pick up"}
            </Button>
          </form>
        ) : null}

        {status === "under_review" ? (
          <>
            <form action={approve}>
              <input type="hidden" name="request_id" value={requestId} />
              <Button type="submit" size="sm" disabled={pending}>
                {approvePending ? "Approving…" : "Approve"}
              </Button>
            </form>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setShowReject((v) => !v)}
              disabled={pending}
            >
              {showReject ? "Cancel" : "Reject"}
            </Button>
          </>
        ) : null}

        {(status === "requested" || status === "under_review") ? (
          <form action={withdraw}>
            <input type="hidden" name="request_id" value={requestId} />
            <Button
              type="submit"
              size="sm"
              variant="ghost"
              disabled={pending}
              className="text-muted-foreground"
            >
              {withdrawPending ? "Withdrawing…" : "Withdraw"}
            </Button>
          </form>
        ) : null}
      </div>

      {showReject && status === "under_review" ? (
        <form
          action={(formData: FormData) => {
            formData.set("reason", reason);
            reject(formData);
          }}
          className="flex w-full flex-col gap-2 sm:w-80"
        >
          <input type="hidden" name="request_id" value={requestId} />
          <textarea
            name="reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            placeholder="Reason surfaced to requester (optional)"
            className="w-full rounded-md border border-border/60 bg-background/80 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <Button type="submit" size="sm" variant="destructive" disabled={pending}>
            {rejectPending ? "Rejecting…" : "Confirm reject"}
          </Button>
        </form>
      ) : null}

      {latestError ? (
        <p className="text-xs text-destructive">{latestError}</p>
      ) : null}
    </div>
  );
}
