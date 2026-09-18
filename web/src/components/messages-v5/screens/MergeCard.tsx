"use client";

/**
 * MergeCard (D14): the "Same person?" card in the stream, shown when the
 * shell has a `duplicateOf` match (from `messagingMatchCustomers` on the
 * inbound identity). Three options, each an immediate action, never a
 * persisted selection:
 *   - Merge into "<name>"          -> onMerge()          (messagingMerge)
 *   - Keep separate, link the client -> onKeepSeparate()  (messagingCaptureIdentity, link only)
 *   - Not the same person          -> onDismiss()
 *
 * `onKeepSeparate` is an L4 contract extension (contracts.ts, decisions.md
 * D-MSG-100) — the middle row is not drawn if the shell has not wired it.
 * A `not_allowed` refusal (D-MSG-5: either side has a paid/confirmed record)
 * renders through `RefusalLine`, never free text.
 */

import { Card } from "../kit/Card";
import { OptionRow } from "../kit/OptionRow";
import { fill } from "../kit/copy";
import { RefusalLine } from "../kit/RefusalLine";
import type { MergeCardProps } from "./contracts";

export function MergeCard({ duplicate, into, busy, refusal, onMerge, onKeepSeparate, onDismiss, copy, variant }: MergeCardProps) {
  const c = copy.merge;
  return (
    <Card
      category="id"
      label={copy.card.cat.identity}
      title={c.title}
      mine
      busy={busy}
      wide
      variant={variant}
      testId="merge"
      foot={fill(c.body, { name: into.name })}
    >
      {refusal ? <RefusalLine code={refusal} copy={copy} variant={variant} /> : null}
      <OptionRow
        control="radio"
        selected={false}
        title={fill(c.mergeInto, { name: into.name })}
        sub={c.mergeIntoSub}
        disabled={busy}
        onSelect={onMerge}
        variant={variant}
      />
      {onKeepSeparate ? (
        <OptionRow
          control="radio"
          selected={false}
          title={c.keepSeparate}
          sub={c.keepSeparateSub}
          disabled={busy}
          onSelect={onKeepSeparate}
          variant={variant}
        />
      ) : null}
      <OptionRow
        control="radio"
        selected={false}
        title={c.notSame}
        sub={c.notSameSub}
        disabled={busy}
        onSelect={onDismiss}
        variant={variant}
      />
      <span aria-hidden="true" data-merge-duplicate={duplicate.inquiryId} data-merge-into={into.inquiryId} data-merge-into-version={into.version} />
    </Card>
  );
}
