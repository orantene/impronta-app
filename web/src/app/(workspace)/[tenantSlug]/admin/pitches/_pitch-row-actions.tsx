"use client";

/**
 * Phase E — per-row pitch actions.
 *
 * For active pitches (draft / sent / viewed / edited): "Cancel" button with
 * inline confirm. Cancel rotates share_token_id, immediately invalidating
 * any outstanding tokens, and stamps cancelled_at + audit event.
 *
 * For terminal pitches: nothing rendered. The list page renders the
 * "View inquiry →" link separately for converted pitches.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { cancelPitchAction } from "./actions";
import type { PitchStatus } from "@/lib/pitch/pitch-types";

type Props = {
  tenantSlug: string;
  pitchId: string;
  status: PitchStatus;
  isCancellable: boolean;
};

export function PitchRowActions({ tenantSlug, pitchId, isCancellable }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isCancellable) return null;

  function handleCancel() {
    setError(null);
    startTransition(async () => {
      const result = await cancelPitchAction(tenantSlug, pitchId);
      if (!result.ok) {
        setError(result.message ?? cancelReasonCopy(result.reason));
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  }

  if (confirming) {
    return (
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "0 8px",
          height: 28,
          borderRadius: 6,
          border: "1px solid rgba(24,24,27,0.12)",
          background: "#fff",
        }}
      >
        <span style={{ fontSize: 11.5, color: "rgba(11,11,13,0.65)", fontWeight: 500 }}>
          Cancel pitch?
        </span>
        <button
          type="button"
          onClick={handleCancel}
          disabled={isPending}
          style={{
            border: "none",
            background: "transparent",
            padding: "2px 8px",
            cursor: isPending ? "default" : "pointer",
            fontSize: 12,
            fontWeight: 600,
            color: "#b91c1c",
            opacity: isPending ? 0.5 : 1,
          }}
        >
          {isPending ? "…" : "Yes"}
        </button>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            setError(null);
          }}
          disabled={isPending}
          style={{
            border: "none",
            background: "transparent",
            padding: "2px 8px",
            cursor: isPending ? "default" : "pointer",
            fontSize: 12,
            fontWeight: 600,
            color: "rgba(11,11,13,0.55)",
          }}
        >
          No
        </button>
        {error && (
          <span style={{ fontSize: 11, color: "#b91c1c", marginLeft: 4 }}>{error}</span>
        )}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      style={{
        display: "inline-flex",
        alignItems: "center",
        height: 28,
        padding: "0 10px",
        borderRadius: 6,
        background: "#fff",
        border: "1px solid rgba(24,24,27,0.08)",
        color: "rgba(11,11,13,0.65)",
        fontSize: 12,
        fontWeight: 600,
        cursor: "pointer",
      }}
    >
      Cancel
    </button>
  );
}

function cancelReasonCopy(reason: string): string {
  switch (reason) {
    case "forbidden":
      return "You don't have permission.";
    case "not_authenticated":
      return "Sign in again.";
    case "already_converted":
      return "Already converted — can't cancel.";
    case "pitch_not_found":
      return "Pitch not found.";
    default:
      return "Could not cancel.";
  }
}
