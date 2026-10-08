import "server-only";

/**
 * TUL-36 phase 1: after a guest message lands, optionally post a facts-only
 * AI reply or a handoff system_event. No book / pay-link tools.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { assertAiInvocationAllowed } from "@/lib/ai/ai-usage-gate";
import { resolveAnthropicApiKey } from "@/lib/ai/resolve-api-keys";
import { adapterForProvider } from "@/lib/ai/resolve-provider";
import { recordAiGenerationUsage } from "@/lib/ai/record-generation-usage";
import { getPublicHostContext } from "@/lib/saas/scope";
import { loadTalentSiteSwitches } from "@/lib/talent/site-switches-server";
import { loadPublicOfferingsForProfile } from "@/lib/talent/offerings-public";
import type { GuestThreadMessage } from "@/lib/inquiry/guest-chat-contract";
import { catalogTenantForPublicHost } from "./catalog-tenant";
import { decideBookingAssistantTurn } from "./decide";
import {
  bookingAssistantHandoffCopy,
  normalizeBookingAssistantLocale,
  type BookingHandoffReason,
} from "./handoff";
import { sanitizeBookingAssistantOutput } from "./guardrails";

/** PM: Claude Haiku 5.5 through our Anthropic adapter. */
export const BOOKING_ASSISTANT_MODEL = "claude-haiku-5-5";

const SYSTEM_PROMPT = `You are a booking assistant on a talent's public site chat.
Answer ONLY from the SERVICE_CATALOG JSON. Never invent a price, duration, or availability.
If the catalog does not contain the answer, say you are unsure and that a person will follow up.
Do not book, reserve, or mint payment links. Keep answers under 600 characters.
Match the guest locale (en or es). Mexican Spanish (tu), no vos, no em dashes.
Reply with plain text only (no markdown links).`;

export type BookingAssistantOfferingGround = {
  title: string;
  priceLabel?: string | null;
  durationMinutes?: number | null;
};

export type MaybeRunBookingAssistantTurnArgs = {
  inquiryId: string;
  /** Inquiry / credits tenant (hub or seller). Not used to scope the catalog. */
  tenantId: string;
  talentProfileId: string | null | undefined;
  guestMessage: string;
  locale?: string | null;
  offerings?: readonly BookingAssistantOfferingGround[];
  /**
   * Catalog scope matching the public render (`profile-view` / talent-site):
   * agency host → that tenant; talent-site / hub / platform → null (all public).
   * When omitted, resolved from `getPublicHostContext` — never the inquiry tenant.
   */
  catalogTenantId?: string | null;
  /** When true, client already showed an instant-answer bubble for this turn. */
  instantAnswered?: boolean;
};

async function insertSystemEvent(input: {
  inquiryId: string;
  tenantId: string;
  body: string;
  systemEventType: "booking_assistant_reply" | "booking_assistant_handoff";
  reason?: string;
}): Promise<GuestThreadMessage | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data: row, error } = await admin
    .from("inquiry_messages")
    .insert({
      inquiry_id: input.inquiryId,
      tenant_id: input.tenantId,
      thread_type: "private",
      sender_user_id: null,
      body: input.body,
      message_kind: "system_event",
      metadata: {
        system_event_type: input.systemEventType,
        channel: "guest_popup",
        ...(input.reason ? { handoff_reason: input.reason } : {}),
      },
    })
    .select("id, created_at")
    .single();
  if (error || !row) {
    if (error) logServerError("booking-assistant/insert", error);
    return null;
  }
  const r = row as { id: string; created_at: string };
  return {
    id: r.id,
    inquiryId: input.inquiryId,
    authorRole: "system",
    authorLabel: null,
    authorAvatarUrl: null,
    body: input.body,
    kind: "system_event",
    cardPayload: null,
    createdAt: r.created_at,
    editedAt: null,
    isDeleted: false,
    replyToMessageId: null,
  };
}

async function loadPriorAssistantMeta(
  inquiryId: string,
  tenantId: string,
): Promise<Array<{ systemEventType?: string | null }>> {
  const admin = createServiceRoleClient();
  if (!admin) return [];
  // Newest first so the 40-row window includes recent handoffs / replies;
  // reverse to chronological for turn counting.
  const { data, error } = await admin
    .from("inquiry_messages")
    .select("metadata")
    .eq("inquiry_id", inquiryId)
    .eq("tenant_id", tenantId)
    .eq("message_kind", "system_event")
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) {
    logServerError("booking-assistant/prior", error);
    return [];
  }
  const newestFirst = ((data ?? []) as Array<{ metadata: unknown }>).map((row) => {
    const meta =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    const t = typeof meta.system_event_type === "string" ? meta.system_event_type : null;
    return { systemEventType: t };
  });
  return newestFirst.reverse();
}

async function resolveCatalogTenantId(
  override: string | null | undefined,
): Promise<string | null> {
  if (override !== undefined) return override;
  const hostCtx = await getPublicHostContext();
  return catalogTenantForPublicHost(hostCtx.kind, hostCtx.tenantId);
}

function catalogGrounding(offerings: readonly BookingAssistantOfferingGround[]): string {
  return JSON.stringify(
    offerings.slice(0, 40).map((o) => ({
      title: o.title,
      price: o.priceLabel ?? null,
      durationMinutes: o.durationMinutes ?? null,
    })),
  );
}

function offeringPriceLabel(
  amountCents: number | null,
  currency: string,
  visibility: string,
): string | null {
  if (visibility === "on_request") return null;
  if (amountCents == null || !Number.isFinite(amountCents) || amountCents <= 0) return null;
  const amount = amountCents / 100;
  const fig = amount.toLocaleString("en-US", {
    minimumFractionDigits: Number.isInteger(amount) ? 0 : 2,
    maximumFractionDigits: Number.isInteger(amount) ? 0 : 2,
  });
  return `$${fig} ${(currency || "USD").toUpperCase()}`;
}

async function loadGroundingOfferings(
  talentProfileId: string,
  catalogTenantId: string | null,
  locale: string,
  provided?: readonly BookingAssistantOfferingGround[],
): Promise<BookingAssistantOfferingGround[]> {
  if (provided && provided.length > 0) return [...provided];
  const publicRows = await loadPublicOfferingsForProfile(
    talentProfileId,
    locale,
    catalogTenantId,
  );
  return publicRows.map((o) => ({
    title: o.title,
    priceLabel: offeringPriceLabel(o.amountCents, o.currency, o.visibility),
    durationMinutes: o.durationMinutes,
  }));
}

/**
 * Best-effort: never throws to the guest send path. Returns the system message
 * when one was posted so the opener can merge it immediately.
 */
export async function maybeRunBookingAssistantTurn(
  args: MaybeRunBookingAssistantTurnArgs,
): Promise<GuestThreadMessage | null> {
  try {
    if (!args.talentProfileId) return null;
    const admin = createServiceRoleClient();
    if (!admin) return null;

    const switches = await loadTalentSiteSwitches(admin, args.talentProfileId);
    const enabled = switches.chatConfig.aiBookingAssistantEnabled === true;
    const prior = await loadPriorAssistantMeta(args.inquiryId, args.tenantId);
    const decision = decideBookingAssistantTurn({
      enabled,
      guestMessage: args.guestMessage,
      priorMessages: prior,
      instantAnswered: args.instantAnswered === true,
    });

    if (decision.action === "skip") return null;

    const locale = normalizeBookingAssistantLocale(args.locale);

    if (decision.action === "handoff") {
      return insertSystemEvent({
        inquiryId: args.inquiryId,
        tenantId: args.tenantId,
        body: bookingAssistantHandoffCopy(decision.reason, locale),
        systemEventType: "booking_assistant_handoff",
        reason: decision.reason,
      });
    }

    // llm_facts — PM: Claude Haiku 5.5 via our Anthropic provider layer + credits gate.
    const anthropicKey = (await resolveAnthropicApiKey())?.trim() || null;
    if (!anthropicKey) {
      return insertSystemEvent({
        inquiryId: args.inquiryId,
        tenantId: args.tenantId,
        body: bookingAssistantHandoffCopy("gated", locale),
        systemEventType: "booking_assistant_handoff",
        reason: "gated",
      });
    }

    const gate = await assertAiInvocationAllowed(args.tenantId);
    if (!gate.ok) {
      return insertSystemEvent({
        inquiryId: args.inquiryId,
        tenantId: args.tenantId,
        body: bookingAssistantHandoffCopy("gated", locale),
        systemEventType: "booking_assistant_handoff",
        reason: "gated",
      });
    }

    const catalogTenantId = await resolveCatalogTenantId(args.catalogTenantId);
    const offerings = await loadGroundingOfferings(
      args.talentProfileId,
      catalogTenantId,
      locale,
      args.offerings,
    );
    const grounding = catalogGrounding(offerings);
    const adapter = adapterForProvider("anthropic", anthropicKey);
    const started = Date.now();
    const completion = await Promise.race([
      adapter.chatCompletion({
        systemPrompt: SYSTEM_PROMPT,
        userMessage: [
          "SERVICE_CATALOG_BEGIN",
          grounding,
          "SERVICE_CATALOG_END",
          `locale=${locale}`,
          "UNTRUSTED_GUEST_MESSAGE_BEGIN",
          args.guestMessage.slice(0, 800),
          "UNTRUSTED_GUEST_MESSAGE_END",
        ].join("\n"),
        temperature: 0.2,
        maxTokens: 500,
        thinking: false,
        model: BOOKING_ASSISTANT_MODEL,
      }),
      new Promise<{ ok: false; code: string; message: string }>((resolve) => {
        setTimeout(() => resolve({ ok: false, code: "timeout", message: "timeout" }), 15_000);
      }),
    ]);

    await recordAiGenerationUsage({
      provider: adapter.id,
      model: completion.ok ? (completion.model ?? BOOKING_ASSISTANT_MODEL) : BOOKING_ASSISTANT_MODEL,
      usage: completion.ok ? completion.usage : undefined,
      actorProfileId: null,
      ok: completion.ok,
      scope: "booking_assistant",
      latencyMs: Date.now() - started,
      tenantId: args.tenantId,
      context: { feature: "booking_assistant", inquiry_id: args.inquiryId },
    });

    if (!completion.ok) {
      return insertSystemEvent({
        inquiryId: args.inquiryId,
        tenantId: args.tenantId,
        body: bookingAssistantHandoffCopy("unsure", locale),
        systemEventType: "booking_assistant_handoff",
        reason: "unsure",
      });
    }

    const sanitized = sanitizeBookingAssistantOutput(completion.text, grounding);
    if (sanitized.escalate || !sanitized.text.trim()) {
      const reason: BookingHandoffReason = "unsure";
      return insertSystemEvent({
        inquiryId: args.inquiryId,
        tenantId: args.tenantId,
        body: bookingAssistantHandoffCopy(reason, locale),
        systemEventType: "booking_assistant_handoff",
        reason,
      });
    }

    return insertSystemEvent({
      inquiryId: args.inquiryId,
      tenantId: args.tenantId,
      body: sanitized.text.trim(),
      systemEventType: "booking_assistant_reply",
    });
  } catch (err) {
    logServerError("booking-assistant/maybeRun", err);
    return null;
  }
}
