"use client";

/**
 * The items picker's engine surface (L5): every server action the picker and
 * the times sheet call, behind one object so the render tests can run the
 * same send plan on a fake. Principle 0: readers are `messaging-items.ts`
 * (catalog, person slots) and `messagingLoadEssentials` (the current lock
 * version); writers are the POS engine's own: `messagingEnsureSharedDraft`,
 * `posAddLine`, `posAddCustomLine`, `rosterAddTalent` (lineup engine) and
 * `messagingSendOptions`. Nothing is inserted from here.
 */

import { posAddCustomLine, posAddLine } from "@/app/(workspace)/[tenantSlug]/admin/pos/actions";
import { rosterAddTalent } from "@/lib/server-actions/admin-inquiry-roster";
import { messagingEnsureSharedDraft, messagingLoadEssentials, messagingSendOptions } from "@/lib/server-actions/messaging-engine";
import { messagingLoadItemsCatalog, messagingLoadPersonSlots, type ItemsCatalogResult, type PersonSlotsResult } from "@/lib/server-actions/messaging-items";
import type { EngineCall, OptionCardKind } from "@/lib/messages-v5/items-picker";
import { isMessagingRefusal } from "@/lib/messaging/refusals";
import type { MessagingRefusal } from "@/lib/messaging/types";

export type Refused = { ok: false; reason: MessagingRefusal };

export type ItemsActions = {
  readonly loadCatalog: (input: { inquiryId: string }) => Promise<ItemsCatalogResult>;
  readonly loadPersonSlots: (input: { talentProfileId: string; offeringId?: string | null; from?: string | null; days?: number }) => Promise<PersonSlotsResult>;
  /** The inquiry's current optimistic-lock version (`Essentials.version`), re-read before each roster add. */
  readonly currentVersion: (input: { inquiryId: string }) => Promise<number | null>;
  readonly ensureSharedDraft: (input: { inquiryId: string }) => Promise<{ ok: true; orderId: string; version: number } | Refused>;
  readonly addLine: (input: { orderId: string; offeringId: string; units: number; sessionId?: string | null; variantId?: string | null; expectedVersion?: number }) => Promise<{ ok: true } | Refused>;
  readonly addCustomLine: (input: { orderId: string; label: string; amountCents: number; expectedVersion?: number; idempotencyKey: string }) => Promise<{ ok: true } | Refused>;
  readonly addTalent: (input: { inquiryId: string; talentProfileId: string; expectedVersion: number }) => Promise<{ ok: true } | Refused>;
  readonly sendOptions: (input: { inquiryId: string; kind: OptionCardKind; payload: Record<string, unknown> }) => Promise<{ ok: true; messageId: string } | Refused>;
};

function toRefusal(raw: unknown): MessagingRefusal {
  return typeof raw === "string" && isMessagingRefusal(raw) ? raw : raw === "not_allowed" ? "not_allowed" : "unavailable";
}

/** `admin-inquiry-roster.ts` answers `ActionResult` codes; the sheet speaks refusal codes. */
function rosterCodeToRefusal(code: string | undefined): MessagingRefusal {
  switch (code) {
    case "permission_denied":
      return "not_allowed";
    case "version_conflict":
      return "conflict";
    case "timeout":
      return "rate_limited";
    case "locked_status":
      return "checkout_locked";
    case "validation_error":
      return "invalid";
    default:
      return "unavailable";
  }
}

export const engineItemsActions: ItemsActions = {
  loadCatalog: (input) => messagingLoadItemsCatalog(input),
  loadPersonSlots: (input) => messagingLoadPersonSlots(input),
  currentVersion: async (input) => {
    const r = await messagingLoadEssentials(input);
    return r.ok ? r.essentials.version : null;
  },
  ensureSharedDraft: async (input) => {
    const r = await messagingEnsureSharedDraft(input);
    return r.ok ? { ok: true, orderId: r.orderId, version: r.version } : { ok: false, reason: r.reason };
  },
  addLine: async (input) => {
    const r = await posAddLine(input);
    if (r.ok) return { ok: true };
    return { ok: false, reason: toRefusal("reason" in r ? r.reason : "error" in r ? r.error : null) };
  },
  addCustomLine: async (input) => {
    const r = await posAddCustomLine(input);
    return r.ok ? { ok: true } : { ok: false, reason: toRefusal(r.reason) };
  },
  addTalent: async (input) => {
    const form = new FormData();
    form.set("inquiry_id", input.inquiryId);
    form.set("talent_profile_id", input.talentProfileId);
    form.set("expected_version", String(input.expectedVersion));
    const r = await rosterAddTalent(form);
    return r.ok ? { ok: true } : { ok: false, reason: rosterCodeToRefusal(r.code) };
  },
  sendOptions: async (input) => {
    const r = await messagingSendOptions(input);
    return r.ok ? { ok: true, messageId: r.messageId } : { ok: false, reason: r.reason };
  },
};

export type SendPlanOutcome = { ok: true; dispatched: "create_offer" | null; sent: number; added: number } | Refused;

/**
 * Runs one send plan (`sendModeToEngineCall`) in order and stops at the
 * first refusal. A `seam` call is skipped here: the view already refuses
 * to build a plan that contains one, so reaching it means a bug, and a
 * silent skip is still safer than a fake write.
 */
export async function runSendPlan(calls: readonly EngineCall[], actions: ItemsActions, ctx: { inquiryId: string; version: number; newKey: () => string }): Promise<SendPlanOutcome> {
  let orderId: string | null = null;
  let orderVersion: number | undefined;
  let dispatched: "create_offer" | null = null;
  let sent = 0;
  let added = 0;
  for (const call of calls) {
    switch (call.action) {
      case "ensure_shared_draft": {
        const r = await actions.ensureSharedDraft({ inquiryId: ctx.inquiryId });
        if (!r.ok) return r;
        orderId = r.orderId;
        orderVersion = r.version;
        break;
      }
      case "add_line": {
        if (!orderId) return { ok: false, reason: "invalid" };
        const r = await actions.addLine({ orderId, offeringId: call.offeringId, units: call.units, sessionId: call.sessionId ?? null, variantId: call.variantId ?? null, expectedVersion: orderVersion });
        if (!r.ok) return r;
        // The line writer answers no new version; later lines on the same draft go unlocked, the counter's own pattern.
        orderVersion = undefined;
        added += 1;
        break;
      }
      case "add_custom_line": {
        if (!orderId) return { ok: false, reason: "invalid" };
        const r = await actions.addCustomLine({ orderId, label: call.label, amountCents: call.amountCents, expectedVersion: orderVersion, idempotencyKey: ctx.newKey() });
        if (!r.ok) return r;
        orderVersion = undefined;
        added += 1;
        break;
      }
      case "add_talent": {
        const version = (await actions.currentVersion({ inquiryId: ctx.inquiryId })) ?? ctx.version;
        const r = await actions.addTalent({ inquiryId: ctx.inquiryId, talentProfileId: call.talentProfileId, expectedVersion: version });
        if (!r.ok) return r;
        added += 1;
        break;
      }
      case "send_options": {
        const r = await actions.sendOptions({ inquiryId: ctx.inquiryId, kind: call.kind, payload: call.payload });
        if (!r.ok) return r;
        sent += 1;
        break;
      }
      case "dispatch":
        dispatched = call.id;
        break;
      case "seam":
        break;
    }
  }
  return { ok: true, dispatched, sent, added };
}
