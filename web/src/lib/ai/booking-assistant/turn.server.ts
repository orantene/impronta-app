import "server-only";

/**
 * TUL-36 phase 1: after a guest message lands, optionally post a facts-only
 * AI reply or a handoff system_event. No book / pay-link tools.
 *
 * Guest send actions MUST schedule this via `scheduleBookingAssistantTurn`
 * (Next `after()`), never await it inline — the LLM path can take seconds.
 */

import { after } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { resolveAnthropicApiKey } from "@/lib/ai/resolve-api-keys";
import { adapterForProvider } from "@/lib/ai/resolve-provider";
import { recordAiGenerationUsage } from "@/lib/ai/record-generation-usage";
import { getAiFeatureFlags } from "@/lib/settings/ai-feature-flags";
import { getPublicHostContext } from "@/lib/saas/scope";
import { loadTalentSiteSwitches } from "@/lib/talent/site-switches-server";
import { loadPublicOfferingsForProfile } from "@/lib/talent/offerings-public";
import type { GuestThreadMessage } from "@/lib/inquiry/guest-chat-contract";
import { catalogTenantForPublicHost } from "./catalog-tenant";
import { decideBookingAssistantTurn } from "./decide";
import {
  bookingAssistantDisclosureLabel,
  bookingAssistantHandoffCopy,
  normalizeBookingAssistantLocale,
  type BookingHandoffReason,
} from "./handoff";
import { sanitizeBookingAssistantOutput } from "./guardrails";
import { BOOKING_ASSISTANT_MODEL } from "./model";
import { offeringPriceLabel } from "./price-label";
import {
  bookingAssistantMonthlyCapCents,
  bookingAssistantMonthlyCapReached,
} from "./credits";
import { improntaLog } from "@/lib/server/structured-log";

export { BOOKING_ASSISTANT_MODEL } from "./model";

/** Hard cut for deferred LLM work (guest already got their send response). */
const LLM_TIMEOUT_MS = 5_000;

/**
 * Live QA / ops: every silent skip must leave a greppable line.
 * Event name: booking_assistant_skip | booking_assistant_run | booking_assistant_schedule.
 */
function logBookingAssistant(
  event: "booking_assistant_skip" | "booking_assistant_run" | "booking_assistant_schedule",
  fields: Record<string, string | number | boolean | null | undefined>,
): void {
  void improntaLog(event, fields);
}

const SYSTEM_PROMPT = `You are a booking assistant on a talent's public site chat.
Answer ONLY from the SERVICE_CATALOG JSON. Never invent a price, duration, or availability.
If the catalog does not contain the answer, say you are unsure and that a person will follow up.
Do not book, reserve, or mint payment links. Keep answers under 600 characters.
Match the guest locale (en or es). Mexican Spanish tú form only (never voseo), never em dashes.
Reply with plain text only (no markdown links).`;

export type BookingAssistantOfferingGround = {
  title: string;
  priceLabel?: string | null;
  durationMinutes?: number | null;
};

export type MaybeRunBookingAssistantTurnArgs = {
  inquiryId: string;
  /** Inquiry tenant (hub or seller). Used for message insert + log association only — never for AI spend. */
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

/**
 * Schedule the assistant after the guest send response flushes. Prefer this
 * from server actions so the guest never waits on the model. Falls back to a
 * floating promise only when `after()` is unavailable (non-request contexts).
 */
export function scheduleBookingAssistantTurn(args: MaybeRunBookingAssistantTurnArgs): void {
  const run = () => {
    void maybeRunBookingAssistantTurn(args).catch((err) => {
      logServerError("booking-assistant/schedule", err);
    });
  };
  try {
    after(run);
    logBookingAssistant("booking_assistant_schedule", {
      mode: "after",
      inquiry_id: args.inquiryId,
      tenant_id: args.tenantId,
      talent_profile_id: args.talentProfileId ?? null,
      instant_answered: args.instantAnswered === true,
      guest_len: args.guestMessage.trim().length,
    });
  } catch {
    logBookingAssistant("booking_assistant_schedule", {
      mode: "fallback",
      inquiry_id: args.inquiryId,
      tenant_id: args.tenantId,
      talent_profile_id: args.talentProfileId ?? null,
      instant_answered: args.instantAnswered === true,
      guest_len: args.guestMessage.trim().length,
    });
    void run();
  }
}

async function insertSystemEvent(input: {
  inquiryId: string;
  tenantId: string;
  body: string;
  systemEventType: "booking_assistant_reply" | "booking_assistant_handoff";
  reason?: string;
  locale: "en" | "es";
}): Promise<GuestThreadMessage | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const disclosure = bookingAssistantDisclosureLabel(input.locale);
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
        from_ai: true,
        author_kind: "booking_assistant",
        disclosure_label: disclosure,
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
    authorLabel: disclosure,
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

async function loadTalentPlanKey(talentProfileId: string): Promise<string | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const { data, error } = await admin
    .from("talent_profiles")
    .select("talent_plan_key")
    .eq("id", talentProfileId)
    .maybeSingle();
  if (error) {
    logServerError("booking-assistant/plan", error);
    return null;
  }
  const key = (data as { talent_plan_key?: string | null } | null)?.talent_plan_key;
  return typeof key === "string" && key ? key : null;
}

/** Sum successful booking-assistant spend for this talent in the UTC month. */
async function loadTalentBookingAssistantSpendCentsThisMonth(
  talentProfileId: string,
): Promise<number> {
  const admin = createServiceRoleClient();
  if (!admin) return 0;
  const now = new Date();
  const since = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01T00:00:00.000Z`;
  const { data, error } = await admin
    .from("cms_ai_usage_log")
    .select("context_jsonb, ok")
    .eq("ok", true)
    .gte("created_at", since)
    .contains("context_jsonb", {
      feature: "booking_assistant",
      talent_profile_id: talentProfileId,
    })
    .limit(5000);
  if (error) {
    logServerError("booking-assistant/talent-spend", error);
    return 0;
  }
  let cents = 0;
  for (const row of data ?? []) {
    const ctx = (row as { context_jsonb?: { cost_usd?: unknown } | null }).context_jsonb;
    const usd = typeof ctx?.cost_usd === "number" ? ctx.cost_usd : 0;
    if (usd > 0) cents += Math.max(1, Math.round(usd * 100));
  }
  return cents;
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
    priceLabel: offeringPriceLabel(o.amountCents, o.currency, o.visibility, locale),
    durationMinutes: o.durationMinutes,
  }));
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

/**
 * Best-effort: never throws to the guest send path. Returns the system message
 * when one was posted (callers that schedule via `after()` ignore the return).
 */
export async function maybeRunBookingAssistantTurn(
  args: MaybeRunBookingAssistantTurnArgs,
): Promise<GuestThreadMessage | null> {
  const base = {
    inquiry_id: args.inquiryId,
    tenant_id: args.tenantId,
    talent_profile_id: args.talentProfileId ?? null,
    guest_len: args.guestMessage.trim().length,
    instant_answered: args.instantAnswered === true,
  };
  try {
    if (!args.talentProfileId) {
      logBookingAssistant("booking_assistant_skip", { ...base, reason: "no_talent_profile_id" });
      return null;
    }
    const admin = createServiceRoleClient();
    if (!admin) {
      logBookingAssistant("booking_assistant_skip", { ...base, reason: "no_service_role_client" });
      return null;
    }

    // Design §5: platform kill switch — master off means the assistant never runs.
    // Distinct from per-talent monthly credits (below): master off is silent skip.
    const flags = await getAiFeatureFlags();
    if (!flags.ai_master_enabled) {
      logBookingAssistant("booking_assistant_skip", { ...base, reason: "ai_master_disabled" });
      return null;
    }

    const switches = await loadTalentSiteSwitches(admin, args.talentProfileId);
    const enabled = switches.chatConfig.aiBookingAssistantEnabled === true;
    const prior = await loadPriorAssistantMeta(args.inquiryId, args.tenantId);
    const decision = decideBookingAssistantTurn({
      enabled,
      guestMessage: args.guestMessage,
      priorMessages: prior,
      instantAnswered: args.instantAnswered === true,
    });

    if (decision.action === "skip") {
      logBookingAssistant("booking_assistant_skip", {
        ...base,
        reason: decision.reason,
        enabled,
        prior_count: prior.length,
      });
      return null;
    }

    const locale = normalizeBookingAssistantLocale(args.locale);
    logBookingAssistant("booking_assistant_run", {
      ...base,
      action: decision.action,
      decision_reason: decision.action === "handoff" ? decision.reason : "llm_facts",
      locale,
      enabled,
    });

    if (decision.action === "handoff") {
      return insertSystemEvent({
        inquiryId: args.inquiryId,
        tenantId: args.tenantId,
        body: bookingAssistantHandoffCopy(decision.reason, locale),
        systemEventType: "booking_assistant_handoff",
        reason: decision.reason,
        locale,
      });
    }

    // llm_facts — PM: Claude Haiku 5.5; bill the TALENT monthly cap, never hub.
    const anthropicKey = (await resolveAnthropicApiKey())?.trim() || null;
    if (!anthropicKey) {
      return insertSystemEvent({
        inquiryId: args.inquiryId,
        tenantId: args.tenantId,
        body: bookingAssistantHandoffCopy("gated", locale),
        systemEventType: "booking_assistant_handoff",
        reason: "gated",
        locale,
      });
    }

    const planKey = await loadTalentPlanKey(args.talentProfileId);
    const usedCents = await loadTalentBookingAssistantSpendCentsThisMonth(args.talentProfileId);
    if (bookingAssistantMonthlyCapReached(usedCents, planKey)) {
      return insertSystemEvent({
        inquiryId: args.inquiryId,
        tenantId: args.tenantId,
        body: bookingAssistantHandoffCopy("gated", locale),
        systemEventType: "booking_assistant_handoff",
        reason: "gated",
        locale,
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
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), LLM_TIMEOUT_MS);
    let completion: Awaited<ReturnType<typeof adapter.chatCompletion>>;
    try {
      completion = await adapter.chatCompletion({
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
        signal: controller.signal,
      });
    } catch (err) {
      const aborted =
        controller.signal.aborted ||
        (err instanceof Error && (err.name === "AbortError" || /aborted/i.test(err.message)));
      completion = {
        ok: false,
        code: aborted ? "timeout" : "api_error",
        message: aborted ? "timeout" : err instanceof Error ? err.message : "error",
      };
    } finally {
      clearTimeout(timer);
    }

    await recordAiGenerationUsage({
      provider: adapter.id,
      model: completion.ok ? (completion.model ?? BOOKING_ASSISTANT_MODEL) : BOOKING_ASSISTANT_MODEL,
      usage: completion.ok ? completion.usage : undefined,
      actorProfileId: null,
      ok: completion.ok,
      scope: "booking_assistant",
      latencyMs: Date.now() - started,
      tenantId: args.tenantId,
      // Per-talent monthly gate above; never roll into tenant/hub ai_usage_monthly.
      rollupMonthlyTenantSpend: false,
      context: {
        feature: "booking_assistant",
        inquiry_id: args.inquiryId,
        talent_profile_id: args.talentProfileId,
        plan_key: planKey,
        monthly_cap_cents: bookingAssistantMonthlyCapCents(planKey),
      },
    });

    if (!completion.ok) {
      return insertSystemEvent({
        inquiryId: args.inquiryId,
        tenantId: args.tenantId,
        body: bookingAssistantHandoffCopy("unsure", locale),
        systemEventType: "booking_assistant_handoff",
        reason: "unsure",
        locale,
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
        locale,
      });
    }

    return insertSystemEvent({
      inquiryId: args.inquiryId,
      tenantId: args.tenantId,
      body: sanitized.text.trim(),
      systemEventType: "booking_assistant_reply",
      locale,
    });
  } catch (err) {
    logServerError("booking-assistant/maybeRun", err);
    return null;
  }
}
