"use client";

/**
 * W47's interactive half: the milestone rows with `Request changes` and
 * `Approve (client)`, and the banner's `Record approval given verbally`.
 *
 * EVERY REFUSAL IS A SENTENCE. The server action returns a reason code and
 * this component maps it to copy the page already translated. What it must
 * never do is render the code itself, or nothing at all: a button that does
 * nothing when the revision limit is spent is the exact "silent dead end"
 * this surface is being reviewed for.
 *
 * THE LIMIT IS ALSO SHOWN BEFORE THE CLICK. `revisionVerdict` is asked here so
 * the control is disabled and the reason is on screen in advance; the server
 * asks the engine again, because a disabled button is a courtesy and not a
 * guard.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { cn } from "@/lib/utils";
import { revisionVerdict, type MilestoneKind, type MilestoneStatus } from "@/lib/projects/project-record";
import { BTN_ROW, BTN_SECONDARY, ListRow, Pill, type PillTone } from "../_shared";
import {
  approveProjectDeliverable,
  requestProjectDeliverableRevision,
  type MilestoneDecisionResult,
} from "./actions";
import { MilestoneAmount, MilestoneFile, type MilestoneMoneyFileCopy } from "./milestone-money-file";

export type MilestoneView = {
  id: string;
  title: string;
  kind: MilestoneKind;
  status: MilestoneStatus;
  revision: number;
  revisionLimit: number;
  /** `On delivery · 26 Sep`, already in the record's zone and language. */
  whenLabel: string;
  statusLabel: string;
  statusTone: PillTone;
  revisionsLabel: string;
  amountCents: number;
  filePath: string | null;
};

export type MilestoneRefusalCopy = {
  limitReached: string;
  notSubmitted: string;
  notFound: string;
  unavailable: string;
  notAllowed: string;
  invalid: string;
};

export type MilestoneCopy = MilestoneRefusalCopy & {
  caption: string;
  approve: string;
  requestRevision: string;
  passthrough: string;
  moneyFile: MilestoneMoneyFileCopy;
};

function sentenceFor(result: Extract<MilestoneDecisionResult, { ok: false }>, copy: MilestoneRefusalCopy): string {
  switch (result.reason) {
    case "limit_reached":
      return copy.limitReached;
    case "not_found":
      return copy.notFound;
    case "not_allowed":
      return copy.notAllowed;
    case "invalid":
      return copy.invalid;
    default:
      return copy.unavailable;
  }
}

const COLS = "grid-cols-[1.3fr_1.2fr_80px_190px_1.4fr]";

export function MilestoneDecisions({
  milestones,
  currency,
  inquiryId,
  copy,
}: {
  milestones: MilestoneView[];
  currency: string;
  inquiryId: string | null;
  copy: MilestoneCopy;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ id: string; text: string } | null>(null);

  function run(id: string, fn: () => Promise<MilestoneDecisionResult>) {
    setMessage(null);
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        router.refresh();
        return;
      }
      setMessage({ id, text: sentenceFor(result, copy) });
    });
  }

  return (
    <ul className="m-0 list-none p-0" aria-label={copy.caption} data-project-milestones>
      {milestones.map((m) => {
        const verdict = revisionVerdict({
          id: m.id,
          title: m.title,
          kind: m.kind,
          status: m.status,
          revision: m.revision,
          revisionLimit: m.revisionLimit,
          dueAt: null,
          amountCents: m.amountCents,
          filePath: m.filePath,
        });
        const decidable = m.status === "submitted";
        const note = message?.id === m.id ? message.text : null;
        return (
          <li key={m.id} data-project-milestone={m.id}>
            <ListRow cols={COLS} className="border-t">
              <span>
                <b>{m.title}</b>
                {m.kind === "passthrough_budget" ? <span className="block text-[12px] text-admin-ink-muted">{copy.passthrough}</span> : null}
                <span className="block text-[12px] text-admin-ink-muted">{m.revisionsLabel}</span>
                {note ? (
                  <span role="status" className="mt-1 block text-[12px] text-admin-red">
                    {note}
                  </span>
                ) : null}
              </span>
              <span className="text-admin-ink-muted">{m.whenLabel}</span>
              <MilestoneAmount
                deliverableId={m.id}
                amountCents={m.amountCents}
                currency={currency}
                editable={m.status !== "approved" && m.status !== "cancelled"}
                copy={copy.moneyFile}
              />
              <span>
                <Pill tone={m.statusTone}>{m.statusLabel}</Pill>
              </span>
              <span className="flex flex-wrap items-center justify-end gap-1.5">
                {decidable ? (
                  <>
                    <button
                      type="button"
                      disabled={pending || !verdict.ok}
                      title={!verdict.ok ? (verdict.reason === "limit_reached" ? copy.limitReached : copy.notSubmitted) : undefined}
                      onClick={() => run(m.id, () => requestProjectDeliverableRevision(m.id))}
                      className={cn(BTN_SECONDARY, BTN_ROW)}
                      data-milestone-revise
                    >
                      {copy.requestRevision}
                    </button>
                    <button
                      type="button"
                      disabled={pending}
                      onClick={() => run(m.id, () => approveProjectDeliverable(m.id))}
                      className={cn(BTN_SECONDARY, BTN_ROW)}
                      data-milestone-approve
                    >
                      {copy.approve}
                    </button>
                    {!verdict.ok ? (
                      <span className="basis-full text-right text-[11.5px] text-admin-ink-muted">
                        {verdict.reason === "limit_reached" ? copy.limitReached : copy.notSubmitted}
                      </span>
                    ) : null}
                  </>
                ) : null}
                {m.status === "cancelled" ? null : (
                  <MilestoneFile deliverableId={m.id} inquiryId={inquiryId} filePath={m.filePath} copy={copy.moneyFile} />
                )}
              </span>
            </ListRow>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * The banner's `Record approval given verbally`: the same engine call as
 * `Approve (client)`, offered where the operator reads that the client
 * approved by phone or in person.
 */
export function ApproveVerballyButton({
  milestoneId,
  label,
  className,
  refusals,
}: {
  milestoneId: string;
  label: string;
  className: string;
  refusals: MilestoneRefusalCopy;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [note, setNote] = useState<string | null>(null);
  return (
    <span className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={pending}
        className={className}
        data-project-approve-verbal
        onClick={() => {
          setNote(null);
          startTransition(async () => {
            const result = await approveProjectDeliverable(milestoneId);
            if (result.ok) {
              router.refresh();
              return;
            }
            setNote(sentenceFor(result, refusals));
          });
        }}
      >
        {label}
      </button>
      {note ? (
        <span role="status" className="text-[12px] text-admin-red">
          {note}
        </span>
      ) : null}
    </span>
  );
}
