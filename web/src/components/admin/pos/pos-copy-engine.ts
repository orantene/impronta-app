/**
 * pos-copy-engine.ts — the sentences of the Package 1 screens (the lock
 * screen, the tip sheet, the payment link, the cash movements) and the
 * engine's refusal vocabulary, read from the catalogue through one
 * translator. Same contract as `pos-copy.ts`: literal keys only, so
 * `message-key-usage.static.test.ts` sees every one.
 */

import type { CashMovementCopy } from "./CashMovementDialog";
import type { LockScreenCopy } from "./LockScreen";
import type { PaymentLinkCopy } from "./PaymentLinkPanel";
import type { TipSheetCopy } from "./TipSheet";
import type { Translator } from "./translator";

const K = "dashboard.pos.counter";
const E = "dashboard.pos.engine";

/** Every code in `docs/plans/program/engine/pos-money.md`, plus the route guard's own. */
export const ENGINE_REFUSAL_CODES = [
  "over_limit",
  "pin_invalid",
  "not_manager",
  "already_approved",
  "conflict",
  "not_found",
  "wrong_tenant",
  "invalid",
  "unavailable",
  "locked",
  "no_session",
  "already_linked",
  "nothing_owed",
  "already_collected",
  "negative",
  "not_draft",
  "exceeds_outstanding",
  "provider_unavailable",
  "expired",
  "not_open",
  "space_occupied",
  "lines_paid",
  "no_place",
  "already_accepted",
  "amount",
  "already_closed",
  "not_allowed",
  "no_customer",
] as const;

export function engineRefusalCopy(t: Translator): Readonly<Record<string, string>> {
  return {
    over_limit: t(`${E}.refusal.over_limit`),
    pin_invalid: t(`${E}.refusal.pin_invalid`),
    not_manager: t(`${E}.refusal.not_manager`),
    already_approved: t(`${E}.refusal.already_approved`),
    conflict: t(`${E}.refusal.conflict`),
    not_found: t(`${E}.refusal.not_found`),
    wrong_tenant: t(`${E}.refusal.wrong_tenant`),
    invalid: t(`${E}.refusal.invalid`),
    unavailable: t(`${E}.refusal.unavailable`),
    locked: t(`${E}.refusal.locked`),
    no_session: t(`${E}.refusal.no_session`),
    already_linked: t(`${E}.refusal.already_linked`),
    nothing_owed: t(`${E}.refusal.nothing_owed`),
    already_collected: t(`${E}.refusal.already_collected`),
    negative: t(`${E}.refusal.negative`),
    not_draft: t(`${E}.refusal.not_draft`),
    exceeds_outstanding: t(`${E}.refusal.exceeds_outstanding`),
    provider_unavailable: t(`${E}.refusal.provider_unavailable`),
    expired: t(`${E}.refusal.expired`),
    not_open: t(`${E}.refusal.not_open`),
    space_occupied: t(`${E}.refusal.space_occupied`),
    lines_paid: t(`${E}.refusal.lines_paid`),
    no_place: t(`${E}.refusal.no_place`),
    already_accepted: t(`${E}.refusal.already_accepted`),
    amount: t(`${E}.refusal.amount`),
    already_closed: t(`${E}.refusal.already_closed`),
    // The version word `closeShift` still uses; the contract maps it to `conflict`.
    version_conflict: t(`${E}.refusal.conflict`),
    not_allowed: t(`${E}.refusal.not_allowed`),
    no_customer: t(`${E}.refusal.no_customer`),
  };
}

export function lockScreenCopy(t: Translator): LockScreenCopy {
  return {
    title: t(`${K}.lock.title`),
    switchTitle: t(`${K}.lock.switchTitle`),
    drawerStays: t(`${K}.lock.drawerStays`),
    drawerNone: t(`${K}.lock.drawerNone`),
    noPins: t(`${K}.lock.noPins`),
    noPinsAction: t(`${K}.lock.noPinsAction`),
    pinPrompt: t(`${K}.lock.pinPrompt`),
    unlock: t(`${K}.lock.unlock`),
    switchAction: t(`${K}.lock.switchAction`),
    unlocking: t(`${K}.lock.unlocking`),
    cancelSwitch: t(`${K}.cancel`),
    back: t(`${K}.collect.keypadBack`),
    role: {
      owner: t("admin.people.role.owner"),
      admin: t("admin.people.role.admin"),
      manager: t("admin.people.role.manager"),
      editor: t("admin.people.role.editor"),
      viewer: t("admin.people.role.viewer"),
    },
  };
}

export function tipSheetCopy(t: Translator): TipSheetCopy {
  return {
    title: t(`${K}.tip.title`),
    subtitle: t(`${K}.tip.subtitle`),
    other: t(`${K}.tip.other`),
    otherHint: t(`${K}.tip.otherHint`),
    noTip: t(`${K}.tip.noTip`),
    totalWouldBe: t(`${K}.tip.totalWouldBe`),
    add: t(`${K}.tip.add`),
    remove: t(`${K}.tip.remove`),
    back: t(`${K}.back`),
    closeLabel: t(`${K}.chrome.close`),
  };
}

export function paymentLinkCopy(t: Translator): PaymentLinkCopy {
  return {
    create: t(`${K}.paymentLink.create`),
    creating: t(`${K}.paymentLink.creating`),
    providerStripe: t(`${K}.paymentLink.providerStripe`),
    providerMock: t(`${K}.paymentLink.providerMock`),
    linkTitle: t(`${K}.paymentLink.linkTitle`),
    copyLink: t(`${K}.paymentLink.copyLink`),
    copied: t(`${K}.paymentLink.copied`),
    whatsapp: t(`${K}.paymentLink.whatsapp`),
    whatsappText: t(`${K}.paymentLink.whatsappText`),
    expires: t(`${K}.paymentLink.expires`),
    statusOpen: t(`${K}.paymentLink.statusOpen`),
    statusPaid: t(`${K}.paymentLink.statusPaid`),
    statusExpired: t(`${K}.paymentLink.statusExpired`),
    statusCancelled: t(`${K}.paymentLink.statusCancelled`),
    nothingOwed: t(`${K}.paymentLink.nothingOwed`),
    resendNote: t(`${K}.paymentLink.resendNote`),
    links: t(`${K}.paymentLink.links`),
  };
}

export function cashMovementCopy(t: Translator): CashMovementCopy {
  return {
    title: {
      paid_in: t(`${K}.movement.title.paid_in`),
      paid_out: t(`${K}.movement.title.paid_out`),
      drop: t(`${K}.movement.title.drop`),
      float_add: t(`${K}.movement.title.float_add`),
    },
    subtitle: {
      paid_in: t(`${K}.movement.subtitle.paid_in`),
      paid_out: t(`${K}.movement.subtitle.paid_out`),
      drop: t(`${K}.movement.subtitle.drop`),
      float_add: t(`${K}.movement.subtitle.float_add`),
    },
    amount: t(`${K}.custom.amount`),
    reason: t(`${K}.movement.reason`),
    reasonHint: t(`${K}.movement.reasonHint`),
    cancel: t(`${K}.cancel`),
    confirm: t(`${K}.movement.confirm`),
    recording: t(`${K}.movement.recording`),
    back: t(`${K}.collect.keypadBack`),
    closeLabel: t(`${K}.chrome.close`),
  };
}
