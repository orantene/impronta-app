"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import {
  completeOwnAgendaBooking,
  releaseOwnTalentHold,
} from "@/lib/talent-agenda/attention-actions";
import {
  resolveAttentionCta,
  whoLabel,
  type AttentionCta,
} from "@/lib/talent-agenda/attention-cta";
import type { TalentAgendaItem } from "@/lib/talent-agenda/types";
import { setAgendaAttentionConfirm } from "./attention-confirm";

export type AgendaCtaNav = {
  onOpenBooking?: (id: string) => void;
  onOpenMessages?: () => void;
};

function targetId(item: TalentAgendaItem): string {
  return item.ref?.id || item.id;
}

/**
 * Shared CTA runner for Attention rows and Calendar peek.
 * Mutating kinds call server actions then refresh; others navigate.
 */
export function useAgendaCta(nav: AgendaCtaNav) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { onOpenBooking, onOpenMessages } = nav;

  const runCta = useCallback(
    async (item: TalentAgendaItem, cta?: AttentionCta) => {
      const resolved = cta ?? resolveAttentionCta(item);
      const id = targetId(item);
      setError(null);

      if (resolved.kind === "reply") {
        onOpenMessages?.();
        return;
      }
      if (resolved.kind === "collect" || resolved.kind === "open") {
        onOpenBooking?.(item.id);
        return;
      }

      if (!resolved.mutates) {
        onOpenBooking?.(item.id);
        return;
      }

      setBusyId(item.id);
      try {
        const result =
          resolved.kind === "release_hold"
            ? await releaseOwnTalentHold(id)
            : resolved.kind === "complete"
              ? await completeOwnAgendaBooking(id)
              : { ok: false as const, reason: "unsupported" };

        if (!result.ok) {
          setError(
            result.reason === "unauthorized"
              ? "You cannot change this item."
              : result.reason === "not_found"
                ? "That item is gone. Refresh and try again."
                : "Could not update. Try again.",
          );
          return;
        }
        setAgendaAttentionConfirm(whoLabel(item));
        router.refresh();
      } catch {
        setError("Could not update. Try again.");
      } finally {
        setBusyId(null);
      }
    },
    [onOpenBooking, onOpenMessages, router],
  );

  /** Peek secondary buttons by label (EN). */
  const runPeekLabel = useCallback(
    async (item: TalentAgendaItem, label: string) => {
      const primary = resolveAttentionCta(item);
      if (label === primary.label) {
        await runCta(item, primary);
        return;
      }
      if (label === "Message" || label === "Reply") {
        onOpenMessages?.();
        return;
      }
      if (label === "Open booking" || label === "Open hold" || label === "Collect") {
        onOpenBooking?.(item.id);
        return;
      }
      if (label === "Release hold") {
        await runCta(item, { kind: "release_hold", label: "Release hold", mutates: true });
        return;
      }
      if (label === "Mark finished" || label === "Mark complete") {
        await runCta(item, { kind: "complete", label: "Mark finished", mutates: true });
        return;
      }
      // Reschedule / Decline later → open the record for now.
      onOpenBooking?.(item.id);
    },
    [onOpenBooking, onOpenMessages, runCta],
  );

  return { runCta, runPeekLabel, busyId, error, setError };
}
