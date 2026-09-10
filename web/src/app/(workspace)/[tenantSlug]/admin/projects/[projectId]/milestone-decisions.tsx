"use client";

/**
 * W47's interactive half: approve, or ask for a revision.
 *
 * EVERY REFUSAL IS A SENTENCE. The server action returns a reason code and
 * this component maps it to copy the page already translated. What it must
 * never do is render the code itself, or nothing at all: a button that does
 * nothing when the revision limit is spent is the exact "silent dead end" this
 * surface is being reviewed for.
 *
 * THE LIMIT IS ALSO SHOWN BEFORE THE CLICK. `revisionVerdict` is asked here so
 * the control is disabled and the reason is on screen in advance; the server
 * asks the engine again, because a disabled button is a courtesy and not a
 * guard.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  revisionVerdict,
  type MilestoneKind,
  type MilestoneStatus,
} from "@/lib/projects/project-record";
import {
  approveProjectDeliverable,
  requestProjectDeliverableRevision,
  type MilestoneDecisionResult,
} from "./actions";

export type MilestoneView = {
  id: string;
  title: string;
  kind: MilestoneKind;
  status: MilestoneStatus;
  revision: number;
  revisionLimit: number;
  dueAt: string;
  statusLabel: string;
  revisionsLabel: string;
};

export type MilestoneCopy = {
  colItem: string;
  colStatus: string;
  colDue: string;
  colRevisions: string;
  caption: string;
  approve: string;
  requestRevision: string;
  passthrough: string;
  limitReached: string;
  notSubmitted: string;
  notFound: string;
  unavailable: string;
  notAllowed: string;
  invalid: string;
};

function sentenceFor(
  result: Extract<MilestoneDecisionResult, { ok: false }>,
  copy: MilestoneCopy,
): string {
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

export function MilestoneDecisions({
  milestones,
  copy,
}: {
  milestones: MilestoneView[];
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
    <div className="w-full overflow-x-auto">
      <table className="w-full caption-bottom border-collapse text-sm">
        <caption className="sr-only">{copy.caption}</caption>
        <thead className="[&_th]:border-b [&_th]:border-border [&_th]:py-2 [&_th]:pr-4 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:uppercase [&_th]:tracking-wide [&_th]:text-muted-foreground">
          <tr>
            <th scope="col">{copy.colItem}</th>
            <th scope="col">{copy.colStatus}</th>
            <th scope="col">{copy.colDue}</th>
            <th scope="col">{copy.colRevisions}</th>
            <th scope="col" />
          </tr>
        </thead>
        <tbody className="[&_td]:border-b [&_td]:border-border/60 [&_td]:py-3 [&_td]:pr-4 [&_tr:last-child_td]:border-0">
          {milestones.map((m) => {
            const verdict = revisionVerdict({
              id: m.id,
              title: m.title,
              kind: m.kind,
              status: m.status,
              revision: m.revision,
              revisionLimit: m.revisionLimit,
              dueAt: null,
            });
            const decidable = m.status === "submitted";
            const note = message?.id === m.id ? message.text : null;
            return (
              <tr key={m.id}>
                <th scope="row" className="py-3 pr-4 text-left font-normal text-foreground">
                  {m.title}
                  {m.kind === "passthrough_budget" ? (
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {copy.passthrough}
                    </span>
                  ) : null}
                  {note ? (
                    <span
                      role="status"
                      className="mt-2 block text-xs text-destructive"
                    >
                      {note}
                    </span>
                  ) : null}
                </th>
                <td className="text-muted-foreground">{m.statusLabel}</td>
                <td className="text-muted-foreground">{m.dueAt}</td>
                <td className="text-muted-foreground">{m.revisionsLabel}</td>
                <td>
                  {decidable ? (
                    <span className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(m.id, () => approveProjectDeliverable(m.id))}
                        className="min-h-11 rounded-lg border border-border px-3 py-1.5 text-sm text-foreground disabled:opacity-60"
                      >
                        {copy.approve}
                      </button>
                      <button
                        type="button"
                        disabled={pending || !verdict.ok}
                        onClick={() =>
                          run(m.id, () => requestProjectDeliverableRevision(m.id))
                        }
                        className="min-h-11 rounded-lg border border-border px-3 py-1.5 text-sm text-foreground disabled:opacity-60"
                        aria-describedby={!verdict.ok ? `revision-refusal-${m.id}` : undefined}
                      >
                        {copy.requestRevision}
                      </button>
                      {!verdict.ok ? (
                        <span
                          id={`revision-refusal-${m.id}`}
                          className="basis-full text-xs text-muted-foreground"
                        >
                          {verdict.reason === "limit_reached" ? copy.limitReached : copy.notSubmitted}
                        </span>
                      ) : null}
                    </span>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
