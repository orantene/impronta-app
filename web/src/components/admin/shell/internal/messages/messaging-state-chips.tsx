"use client";

/**
 * MessagingStateChips — the Messages engine's three state families on a
 * workspace inbox row (`docs/plans/program/engine/messaging.md`, seam 4).
 *
 * Three chip groups, drawn separately and never folded into one word: the
 * conversation (needs reply / awaiting customer / resolved), the
 * opportunity (gathering ... won / lost, absent when the thread is not a
 * deal) and one chip per linked record. A resolved thread with a linked
 * order therefore still shows the order, and a paid order never turns the
 * conversation chip into "resolved". Same sentences as the POS inbox
 * (`dashboard.pos.messages.state.*`, `.record.*`), so the two surfaces never
 * disagree about what a state is called.
 */

import { useT } from "@/i18n/use-t";
import type { RichInquiry } from "../state";

const CHIP = "inline-flex h-[18px] items-center rounded-full px-[7px] text-[10px] font-semibold leading-none";

const CONVERSATION_KEY = {
  needs_reply: "dashboard.pos.messages.state.needsReply",
  awaiting_customer: "dashboard.pos.messages.state.awaitingCustomer",
  resolved: "dashboard.pos.messages.state.resolved",
} as const;

const OPPORTUNITY_KEY = {
  gathering: "dashboard.pos.messages.state.gathering",
  offer_sent: "dashboard.pos.messages.state.offerSent",
  awaiting_acceptance: "dashboard.pos.messages.state.awaitingAcceptance",
  accepted_awaiting_deposit: "dashboard.pos.messages.state.acceptedAwaitingDeposit",
  won: "dashboard.pos.messages.state.won",
  lost: "dashboard.pos.messages.state.lost",
} as const;

export function MessagingStateChips({ messaging }: { messaging: NonNullable<RichInquiry["messaging"]> }) {
  const t = useT();
  return (
    <span data-tulala-messaging-chips className="mt-[3px] flex flex-wrap items-center gap-1">
      <span
        data-messaging-conversation={messaging.conversation}
        className={`${CHIP} ${messaging.conversation === "needs_reply" ? "bg-admin-coral-soft text-admin-coral-deep" : "bg-admin-surface-alt text-admin-ink-muted"}`}
      >
        {t(CONVERSATION_KEY[messaging.conversation])}
      </span>
      {messaging.opportunity ? (
        <span data-messaging-opportunity={messaging.opportunity} className={`${CHIP} bg-admin-brand-soft text-admin-brand`}>
          {t(OPPORTUNITY_KEY[messaging.opportunity])}
        </span>
      ) : null}
      {messaging.records.map((record) => (
        <span
          key={`${record.kind}-${record.recordId}`}
          data-messaging-record={record.kind}
          className={`${CHIP} bg-admin-success-soft text-admin-success-deep`}
        >
          {t(`dashboard.pos.messages.record.${record.kind}`)}
        </span>
      ))}
    </span>
  );
}
