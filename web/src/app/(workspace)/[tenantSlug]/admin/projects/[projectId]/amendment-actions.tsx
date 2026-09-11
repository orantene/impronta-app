"use client";

/**
 * W46's live half: `Send vN` and `Discard proposal` on a DRAFT amendment.
 *
 * Both carry the offer's version and the conversation's version as the
 * optimistic lock (`amendmentSend` / `amendmentDiscardAction`, Package 2).
 * A sent proposal is withdrawn on the conversation, which stays a link; the
 * engine refuses `not_draft` for anything else and that sentence is what a
 * stale click reads.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { amendmentDiscardAction, amendmentSend } from "@/lib/server-actions/scheduling-engine";
import { schedulingEngineSentence, type SchedulingEngineSentences } from "@/lib/scheduling/engine-refusals";
import { BTN_PRIMARY, BTN_ROW, BTN_SECONDARY } from "../_shared";

export function AmendmentActions({
  inquiryId,
  offerId,
  expectedVersion,
  inquiryExpectedVersion,
  copy,
}: {
  inquiryId: string;
  offerId: string;
  expectedVersion: number;
  inquiryExpectedVersion: number | null;
  copy: { send: string; discard: string; noLock: string; engine: SchedulingEngineSentences };
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  const lock = inquiryExpectedVersion;

  function run(fn: (lockVersion: number) => Promise<{ ok: true } | { ok: false; reason: string }>) {
    if (lock === null) {
      setNote(copy.noLock);
      return;
    }
    setNote(null);
    startTransition(async () => {
      const result = await fn(lock);
      if (result.ok) {
        router.refresh();
        return;
      }
      setNote(schedulingEngineSentence(result.reason, copy.engine));
    });
  }

  return (
    <div className="flex flex-col gap-1.5" data-project-amendment={offerId}>
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={pending}
          className={cn(BTN_PRIMARY, BTN_ROW)}
          data-amendment-send
          onClick={() => run((v) => amendmentSend({ inquiryId, offerId, expectedVersion, inquiryExpectedVersion: v }))}
        >
          {copy.send}
        </button>
        <button
          type="button"
          disabled={pending}
          className={cn(BTN_SECONDARY, BTN_ROW)}
          data-amendment-discard
          onClick={() => run((v) => amendmentDiscardAction({ offerId, expectedVersion, inquiryExpectedVersion: v }))}
        >
          {copy.discard}
        </button>
      </div>
      {note ? (
        <span role="status" className="text-[12px] text-admin-red">
          {note}
        </span>
      ) : null}
    </div>
  );
}
