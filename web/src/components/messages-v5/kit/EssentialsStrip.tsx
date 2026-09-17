/**
 * EssentialsStrip (mobile only): three chips under the thread header, the
 * opportunity, the main record, the amount, plus a Details door to the
 * one-scroll Details sheet (board M02, M04).
 */

import type { InquiryMessagingState, RecordChip } from "@/lib/messaging/types";

import type { KitCopy } from "./copy";
import { Btn, Pill } from "./primitives";
import { RecordPill, opportunityTone } from "./StateTags";

export type EssentialsStripProps = {
  readonly state: InquiryMessagingState;
  readonly chips: readonly RecordChip[];
  /** "$3,800 · $0 paid", or null when nothing is owed. */
  readonly amountLabel: string | null;
  readonly copy: KitCopy;
  readonly onDetails: () => void;
};

export function EssentialsStrip({ state, chips, amountLabel, copy, onDetails }: EssentialsStripProps) {
  const main = chips[0];
  return (
    <div className="mx-ess" data-essentials-strip>
      {state.opportunity ? <Pill tone={opportunityTone(state.opportunity)}>{copy.state.opportunity[state.opportunity]}</Pill> : null}
      {main ? <RecordPill chip={main} copy={copy} /> : null}
      <Pill tone={amountLabel ? "money" : "ch"}>{amountLabel ?? copy.thread.nothingOwed}</Pill>
      <Btn size="sm" onClick={onDetails} icon="chev">
        {copy.thread.details}
      </Btn>
    </div>
  );
}
