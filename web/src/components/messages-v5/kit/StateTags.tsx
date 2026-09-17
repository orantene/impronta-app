/**
 * StateTags: the three state families of a thread (conversation, opportunity,
 * records), drawn as three separate chip groups and never merged into one
 * word (contract seam 4, board D01). Each family carries `data-family` so a
 * test, or a screen, can find it without reading the copy.
 */

import type { IdentityLevel, InquiryMessagingState, RecordChip } from "@/lib/messaging/types";

import type { KitCopy } from "./copy";
import { Icon, Pill, RECORD_ICON, type PillTone } from "./primitives";

const CONVERSATION_TONE: Record<InquiryMessagingState["conversation"], PillTone> = {
  needs_reply: "needs",
  awaiting_customer: "wait",
  resolved: "done",
};

export function opportunityTone(state: NonNullable<InquiryMessagingState["opportunity"]>): PillTone {
  if (state === "won") return "won";
  if (state === "lost") return "lost";
  return "opp";
}

/** The record chip's one-line state: payment first, then fulfilment, through the catalogue when the word is known. */
export function recordStateLabel(chip: Pick<RecordChip, "paymentState" | "fulfilmentState">, copy: KitCopy): string | null {
  const parts: string[] = [];
  const pay = chip.paymentState;
  if (pay && pay !== "none") parts.push((copy.payment as Record<string, string>)[pay] ?? pay);
  const ful = chip.fulfilmentState;
  if (ful && ful !== "none") parts.push((copy.fulfilment as Record<string, string>)[ful] ?? ful);
  return parts.length ? parts.join(" · ") : null;
}

export function RecordPill({ chip, copy }: { chip: RecordChip; copy: KitCopy }) {
  const state = recordStateLabel(chip, copy);
  return (
    <Pill tone="rec" title={copy.record[chip.kind]}>
      <Icon name={RECORD_ICON[chip.kind]} size={12} />
      <b>{chip.label}</b>
      {state ? ` · ${state}` : null}
    </Pill>
  );
}

export type StateTagsProps = {
  readonly state: InquiryMessagingState;
  readonly chips: readonly RecordChip[];
  readonly copy: KitCopy;
  /** Inbox rows show one record (the one that matters); the header shows all. */
  readonly maxRecords?: number;
  /** When there is no record, a visitor with no identity gets the dashed "no identity" pill. */
  readonly identityLevel?: IdentityLevel;
  readonly hideConversation?: boolean;
};

export function StateTags({ state, chips, copy, maxRecords, identityLevel, hideConversation }: StateTagsProps) {
  const shown = typeof maxRecords === "number" ? chips.slice(0, maxRecords) : chips;
  return (
    <>
      {hideConversation ? null : (
        <span data-family="conversation" className="pill-fam">
          <Pill tone={CONVERSATION_TONE[state.conversation]}>{copy.state.conversation[state.conversation]}</Pill>
        </span>
      )}
      {state.opportunity ? (
        <span data-family="opportunity" className="pill-fam">
          <Pill tone={opportunityTone(state.opportunity)}>{copy.state.opportunity[state.opportunity]}</Pill>
        </span>
      ) : null}
      {shown.length ? (
        <span data-family="record" className="pill-fam">
          {shown.map((chip) => (
            <RecordPill key={`${chip.kind}:${chip.recordId}`} chip={chip} copy={copy} />
          ))}
        </span>
      ) : identityLevel === "none" ? (
        <span data-family="record" className="pill-fam">
          <Pill tone="off">{copy.state.noIdentity}</Pill>
        </span>
      ) : null}
    </>
  );
}

export function IdentityPill({ level, copy }: { level: IdentityLevel; copy: KitCopy }) {
  if (level === "confirmed" || level === "granted") {
    return (
      <Pill tone="done" light>
        <Icon name="check" size={11} />
        {copy.identity[level]}
      </Pill>
    );
  }
  if (level === "linked") return <Pill tone="ch">{copy.identity.linked}</Pill>;
  return <Pill tone="off">{copy.identity.none}</Pill>;
}
