/* eslint-disable ratchet/no-untenanted-from -- the offering read is scoped by id and, on an agency host, by tenant_id below; a direct talent channel resolves its home workspace from the offering row (same as instant-purchase). */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { isSellable } from "@/lib/offerings/sellable";
import { createPaymentLink, loadPaymentLinkByCode, type CreatePaymentLinkResult } from "@/lib/payments/links";
import { paymentLinkPublicUrl } from "@/lib/payments/pay-link-url";
import { placeInstantPurchase, type InstantPurchaseInput, type InstantPurchaseResult } from "@/lib/scheduling/instant-purchase";
import { logServerError } from "@/lib/server/safe-error";
import { formatMoney } from "@/lib/talent/offerings-money";

import { assistantMoneyGate, type AssistantMoneyGate } from "./money-gate.server";

/**
 * TUL-36 slice 5 [MONEY]: the booking assistant's ONLY money path: create the order and send
 * the pay link, through the EXISTING pipeline (`placeInstantPurchase` -> `createPurchase`, then
 * `createPaymentLink`). No new Stripe call lives here.
 *
 * Guarantees (each pinned by a test with fakes):
 *  - OFF unless the env flag is on AND the provider is a test one (`assistantMoneyGate`);
 *  - the PRICE is never an input: units are clamped, the amount is `collectCents` from the
 *    pipeline's own pricing; there is no amount, price or currency parameter anywhere;
 *  - only a GUEST-CONFIRMED pick (`guestConfirmed: true`, set by the server from the guest's tap,
 *    never by the model) with a start time the guest picked;
 *  - the service must pass the one sellable rule `isSellable(row, "guest")` and, on an agency host,
 *    belong to that workspace; `placeInstantPurchase` re-checks posture, notice, window, readiness;
 *  - IDEMPOTENT: a server-built attempt key is claimed in `ai_assistant_order_attempts` (held
 *    migration; a missing table or a failed claim FAILS CLOSED). A retry or double tap returns the
 *    same open link and never a second order; a half-finished attempt goes to a person;
 *  - tenant-scoped end to end; every refusal is a typed reason the caller turns into a handoff.
 */

export const ASSISTANT_MAX_UNITS = 20;

export type AssistantOfferingRow = {
  id: string;
  tenant_id: string | null;
  talent_profile_id: string | null;
  status: string | null;
  moderation_state: string | null;
  visibility: string | null;
  duration_minutes: number | null;
};

export type AttemptRecord = { orderId: string | null; paymentLinkCode: string | null };

export type AttemptStore = {
  find: (tenantId: string, key: string) => Promise<{ ok: true; record: AttemptRecord | null } | { ok: false }>;
  claim: (tenantId: string, key: string) => Promise<"claimed" | "exists" | "error">;
  setOrder: (tenantId: string, key: string, orderId: string) => Promise<void>;
  setLink: (tenantId: string, key: string, code: string) => Promise<void>;
};

export type OrderPayLinkDeps = {
  gate: () => AssistantMoneyGate;
  loadOffering: (offeringId: string, catalogTenantId: string | null) => Promise<{ ok: true; row: AssistantOfferingRow | null } | { ok: false }>;
  purchase: (input: InstantPurchaseInput) => Promise<InstantPurchaseResult>;
  createLink: (input: Parameters<typeof createPaymentLink>[1]) => Promise<CreatePaymentLinkResult>;
  loadLink: (code: string) => Promise<Awaited<ReturnType<typeof loadPaymentLinkByCode>>>;
  attempts: AttemptStore;
};

export type OrderPayLinkInput = {
  /** The offering id RESOLVED from a grounded service ref. Never a model-typed id. */
  offeringId: string;
  /** Agency host: the host's tenant. null on a talent site / hub / platform host. */
  catalogTenantId: string | null;
  /** The conversation this happens in (server-known). */
  inquiryId: string;
  units?: number | null;
  /** ISO start the GUEST picked from the offered times. */
  startsAt: string;
  /** Set by the server from the guest's tap on the offered-time card. The model cannot set it. */
  guestConfirmed: boolean;
  contact: { email: string | null; phone: string | null; displayName: string };
  guestSessionId?: string | null;
  locale: string;
  /** Server-resolved public origin of the seller host, e.g. https://acme.tulala.digital. */
  publicOrigin: string;
};

export type OrderPayLinkResult =
  | { ok: true; orderId: string | null; url: string; amountCents: number; currency: string | null; expiresAt: string; already: boolean; reply: string }
  | {
      ok: false;
      reason:
        | "money_off"
        | "not_confirmed"
        | "bad_input"
        | "unknown_service"
        | "not_sellable"
        | "needs_person"
        | "slot_taken"
        | "in_progress"
        | "nothing_to_collect"
        | "link_failed"
        | "unavailable";
    };

export function clampAssistantUnits(units: number | null | undefined): number {
  if (typeof units !== "number" || !Number.isFinite(units)) return 1;
  return Math.min(ASSISTANT_MAX_UNITS, Math.max(1, Math.floor(units)));
}

/** The server-built idempotency key. Nothing in it is model text. */
export function assistantAttemptKey(input: { inquiryId: string; offeringId: string; startsAt: string; units: number }): string {
  return `ai-order:${input.inquiryId}:${input.offeringId}:${input.startsAt}:${input.units}`.slice(0, 300);
}

const isEs = (locale: string) => locale.toLowerCase().startsWith("es");

function replyText(locale: string, label: string | null): string {
  const es = isEs(locale);
  const what = label ?? (es ? "tu reserva" : "your booking");
  return es
    ? `Listo. Aquí está tu enlace de pago por ${what}. Tu horario queda apartado unos minutos.`
    : `Done. Here is your payment link for ${what}. Your time is held for a few minutes.`;
}

export async function bookAndSendPayLink(input: OrderPayLinkInput, deps: OrderPayLinkDeps): Promise<OrderPayLinkResult> {
  if (!deps.gate().ok) return { ok: false, reason: "money_off" };
  if (input.guestConfirmed !== true) return { ok: false, reason: "not_confirmed" };
  const startMs = Date.parse(input.startsAt);
  if (!Number.isFinite(startMs) || !input.offeringId || !input.inquiryId || !/^https:\/\//.test(input.publicOrigin)) {
    return { ok: false, reason: "bad_input" };
  }
  const units = clampAssistantUnits(input.units);
  const startsAt = new Date(startMs).toISOString();

  const loaded = await deps.loadOffering(input.offeringId, input.catalogTenantId);
  if (!loaded.ok) return { ok: false, reason: "unavailable" };
  const row = loaded.row;
  if (!row) return { ok: false, reason: "unknown_service" };
  if (input.catalogTenantId && row.tenant_id !== input.catalogTenantId) return { ok: false, reason: "unknown_service" };
  const tenantId = input.catalogTenantId ?? row.tenant_id;
  if (!tenantId || !row.talent_profile_id) return { ok: false, reason: "needs_person" };
  // The ONE sellable rule: published + approved + public. Request-only / hidden never books here.
  if (!isSellable(row, "guest")) return { ok: false, reason: "not_sellable" };
  if (!(typeof row.duration_minutes === "number" && row.duration_minutes > 0)) return { ok: false, reason: "needs_person" };

  // Idempotency: claim the attempt BEFORE any money-side effect.
  const key = assistantAttemptKey({ inquiryId: input.inquiryId, offeringId: input.offeringId, startsAt, units });
  const found = await deps.attempts.find(tenantId, key);
  if (!found.ok) return { ok: false, reason: "unavailable" };
  if (found.record) {
    if (!found.record.paymentLinkCode) return { ok: false, reason: "in_progress" };
    const link = await deps.loadLink(found.record.paymentLinkCode);
    if (link.ok && link.status === "open" && link.tenantId === tenantId) {
      return {
        ok: true,
        orderId: found.record.orderId,
        url: paymentLinkPublicUrl(input.publicOrigin, found.record.paymentLinkCode),
        amountCents: link.amountCents,
        currency: null,
        expiresAt: link.expiresAt,
        already: true,
        reply: replyText(input.locale, null),
      };
    }
    // Expired, paid or cancelled: a person decides; the assistant never re-mints on its own.
    return { ok: false, reason: "in_progress" };
  }
  const claimed = await deps.attempts.claim(tenantId, key);
  if (claimed === "error") return { ok: false, reason: "unavailable" };
  if (claimed === "exists") return { ok: false, reason: "in_progress" };

  const endsAt = new Date(startMs + row.duration_minutes * 60_000).toISOString();
  const purchase = await deps.purchase({
    tenantId,
    offeringId: input.offeringId,
    talentProfileId: row.talent_profile_id,
    actorUserId: null,
    contact: input.contact,
    quantity: units,
    variantId: null,
    addOnIds: [],
    reservation: { startsAt, endsAt },
    payInPerson: false,
    sourceChannel: "ai_assistant",
    sourcePage: null,
    clientOrderKey: key,
    openThread: false,
    guestSessionId: input.guestSessionId ?? null,
    locale: input.locale,
    agencyRouted: input.catalogTenantId != null,
  });
  if (!purchase.ok) {
    if (purchase.reason === "slot_taken") return { ok: false, reason: "slot_taken" };
    return { ok: false, reason: "needs_person" };
  }
  await deps.attempts.setOrder(tenantId, key, purchase.orderId);
  // Nothing to charge online (free, pay in person, no transaction): a person confirms.
  if (purchase.payInPerson || !purchase.transactionId || !(purchase.collectCents > 0)) {
    return { ok: false, reason: "nothing_to_collect" };
  }

  const link = await deps.createLink({
    tenantId,
    orderId: purchase.orderId,
    // The amount is the pipeline's own collect figure. It is the only amount in this file.
    amountCents: purchase.collectCents,
    idempotencyKey: `ai-paylink:${key}`.slice(0, 200),
    actorUserId: null,
    publicOrigin: input.publicOrigin,
    inquiryId: input.inquiryId,
  });
  if (!link.ok) return { ok: false, reason: "link_failed" };
  await deps.attempts.setLink(tenantId, key, link.code);
  return {
    ok: true,
    orderId: purchase.orderId,
    url: link.url,
    amountCents: link.amountCents,
    currency: purchase.currency,
    expiresAt: link.expiresAt,
    already: link.already === true,
    reply: replyText(input.locale, formatMoney(link.amountCents, purchase.currency, input.locale)),
  };
}

/** Real dependencies: the existing pipeline, tenant-scoped reads, the claim table via the service role. */
export function realOrderPayLinkDeps(admin: SupabaseClient, env: Readonly<Record<string, string | undefined>> = process.env): OrderPayLinkDeps {
  return {
    gate: () => assistantMoneyGate(env),
    loadOffering: async (offeringId, catalogTenantId) => {
      let q = admin
        .from("talent_offerings")
        .select("id, tenant_id, talent_profile_id, status, moderation_state, visibility, duration_minutes")
        .eq("id", offeringId);
      if (catalogTenantId) q = q.eq("tenant_id", catalogTenantId);
      const { data, error } = await q.maybeSingle();
      if (error) {
        logServerError("booking-assistant.orderPayLink.offering", error);
        return { ok: false };
      }
      return { ok: true, row: (data as AssistantOfferingRow | null) ?? null };
    },
    purchase: (input) => placeInstantPurchase(admin, input),
    createLink: (input) => createPaymentLink(admin, { ...input, env }),
    loadLink: (code) => loadPaymentLinkByCode(admin, code),
    attempts: {
      find: async (tenantId, key) => {
        const { data, error } = await admin
          .from("ai_assistant_order_attempts")
          .select("order_id, payment_link_code")
          .eq("tenant_id", tenantId)
          .eq("attempt_key", key)
          .maybeSingle();
        if (error) {
          logServerError("booking-assistant.orderPayLink.attemptFind", error);
          return { ok: false };
        }
        const r = data as { order_id: string | null; payment_link_code: string | null } | null;
        return { ok: true, record: r ? { orderId: r.order_id, paymentLinkCode: r.payment_link_code } : null };
      },
      claim: async (tenantId, key) => {
        const { error } = await admin.from("ai_assistant_order_attempts").insert({ tenant_id: tenantId, attempt_key: key });
        if (!error) return "claimed";
        if ((error as { code?: string }).code === "23505") return "exists";
        logServerError("booking-assistant.orderPayLink.attemptClaim", error);
        return "error";
      },
      setOrder: async (tenantId, key, orderId) => {
        const { error } = await admin.from("ai_assistant_order_attempts").update({ order_id: orderId }).eq("tenant_id", tenantId).eq("attempt_key", key);
        if (error) logServerError("booking-assistant.orderPayLink.attemptOrder", error);
      },
      setLink: async (tenantId, key, code) => {
        const { error } = await admin.from("ai_assistant_order_attempts").update({ payment_link_code: code }).eq("tenant_id", tenantId).eq("attempt_key", key);
        if (error) logServerError("booking-assistant.orderPayLink.attemptLink", error);
      },
    },
  };
}
