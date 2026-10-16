import "server-only";

/**
 * TUL-36: after a guest message lands, optionally post a facts-only AI reply,
 * a guest-confirmed times card (phase 2, flow A), or a handoff system_event.
 * The AI never places a hold, books, or touches payment; the guest's tap on
 * the card runs the existing `messagingClientPickTime` path.
 *
 * Guest send actions MUST schedule this via `scheduleBookingAssistantTurn`
 * (Next `after()`), never await it inline — the LLM path can take seconds.
 */

import { resolveEffectiveTalentPlanKey } from "@/lib/billing/effective-talent-plan";
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
import { loadPublicOpenTimes } from "@/lib/scheduling/public-open-times";
import { resolveTalentBookingMode } from "@/lib/scheduling/booking-surface";
import { insertMessage } from "@/lib/messaging/insert-message";
import { renderCard } from "@/lib/messaging/cards";
import { timesPayload } from "@/lib/messages-v5/items-picker";
import type { GuestThreadMessage } from "@/lib/inquiry/guest-chat-contract";
import { catalogTenantForPublicHost } from "./catalog-tenant";
import { decideBookingAssistantTurn } from "./decide";
import {
  BOOKING_ASSISTANT_JSON_SCHEMA,
  OFFER_TIMES_WINDOW_DAYS,
  offerTimesFrom,
  classifyAssistantOutput,
  pickOfferStarts,
  resolveAssistantAction,
} from "./structured";
import {
  bookingAssistantDisclosureLabel,
  bookingAssistantHandoffCopy,
  bookingAssistantNoTimesCopy,
  resolveBookingAssistantReplyLocale,
  type BookingHandoffReason,
} from "./handoff";
import { sanitizeBookingAssistantOutput } from "./guardrails";
import { BOOKING_ASSISTANT_MODEL } from "./model";
import { BOOKING_ASSISTANT_EVENT_TYPES } from "./turns";
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
You never confirm, book, or reserve anything yourself, never quote a price that is not in the catalog, and never create payment links.
When the guest wants to book a service in the catalog, you may offer real open times: set action "offer_times", offering_id to that service's id from the catalog, and date (YYYY-MM-DD) only if the guest named a day. The server then shows the guest real open times and the guest picks one; your reply must not name any time or day itself.
Otherwise use action "answer" for catalog facts, or "handoff" when you are unsure or the guest needs a person.
Reply with a JSON object only: {"reply": string, "action": "answer"|"offer_times"|"handoff", "offering_id"?: string, "date"?: string}. Keep reply under 600 characters.
Reply in the language of the guest's message (en or es); the locale line is only a fallback. Mexican Spanish tú form only (never voseo), never em dashes.
The reply field is plain text only (no markdown links).`;

export type BookingAssistantOfferingGround = {
  /** talent_offerings.id; lets the model propose times for exactly this service. */
  id?: string;
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
): Promise<Array<{ systemEventType?: string | null; humanTookOver?: boolean }>> {
  const admin = createServiceRoleClient();
  if (!admin) return [];
  // Newest first so the 40-row window includes recent handoffs / replies;
  // reverse to chronological for turn counting.
  const { data, error } = await admin
    .from("inquiry_messages")
    .select("metadata, created_at")
    .eq("inquiry_id", inquiryId)
    .eq("tenant_id", tenantId)
    .eq("message_kind", "system_event")
    // TUL-320 (#3746): only assistant rows count toward the 40-row window.
    .in("metadata->>system_event_type", [...BOOKING_ASSISTANT_EVENT_TYPES])
    .order("created_at", { ascending: false })
    .limit(40);
  if (error) {
    logServerError("booking-assistant/prior", error);
    return [];
  }
  const rows = (data ?? []) as Array<{ metadata: unknown; created_at: string }>;
  const newestFirst = rows.map((row) => {
    const meta =
      row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
        ? (row.metadata as Record<string, unknown>)
        : {};
    const t = typeof meta.system_event_type === "string" ? meta.system_event_type : null;
    return { systemEventType: t, createdAt: row.created_at };
  });
  // TUL-320: the newest-40 window can miss an older handoff on a long thread,
  // which re-posted the handoff copy. Look the latest handoff up on its own.
  const lastHandoffAt =
    newestFirst.find((m) => m.systemEventType === "booking_assistant_handoff")?.createdAt ??
    (await latestHandoffAt(admin, inquiryId, tenantId));
  const prior: Array<{ systemEventType?: string | null; humanTookOver?: boolean }> = newestFirst
    .reverse()
    .map((m) => ({ systemEventType: m.systemEventType }));
  if (lastHandoffAt && !prior.some((m) => m.systemEventType === "booking_assistant_handoff")) {
    prior.unshift({ systemEventType: "booking_assistant_handoff" });
  }
  if (lastHandoffAt && (await teamRepliedSince(admin, inquiryId, tenantId, lastHandoffAt))) {
    prior.push({ humanTookOver: true });
  }
  return prior;
}

async function latestHandoffAt(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  inquiryId: string,
  tenantId: string,
): Promise<string | null> {
  const { data, error } = await admin
    .from("inquiry_messages")
    .select("created_at")
    .eq("inquiry_id", inquiryId)
    .eq("tenant_id", tenantId)
    .eq("message_kind", "system_event")
    .eq("metadata->>system_event_type", "booking_assistant_handoff")
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) {
    logServerError("booking-assistant/lastHandoff", error);
    return null;
  }
  return ((data ?? []) as Array<{ created_at: string }>)[0]?.created_at ?? null;
}

/**
 * TUL-1155: a person on the team (any non-client participant) wrote in the
 * thread after the handoff, so they own the conversation now.
 */
async function teamRepliedSince(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  inquiryId: string,
  tenantId: string,
  sinceIso: string,
): Promise<boolean> {
  const { data: team, error: teamErr } = await admin
    .from("inquiry_participants")
    .select("user_id")
    .eq("inquiry_id", inquiryId)
    .neq("role", "client")
    .not("user_id", "is", null);
  if (teamErr) {
    logServerError("booking-assistant/team", teamErr);
    return false;
  }
  const ids = ((team ?? []) as Array<{ user_id: string | null }>)
    .map((r) => r.user_id)
    .filter((id): id is string => !!id);
  if (ids.length === 0) return false;
  const { data, error } = await admin
    .from("inquiry_messages")
    .select("id")
    .eq("inquiry_id", inquiryId)
    .eq("tenant_id", tenantId)
    .in("sender_user_id", ids)
    .gt("created_at", sinceIso)
    .limit(1);
  if (error) {
    logServerError("booking-assistant/teamReply", error);
    return false;
  }
  return (data ?? []).length > 0;
}

async function resolveCatalogTenantId(
  override: string | null | undefined,
): Promise<string | null> {
  if (override !== undefined) return override;
  const hostCtx = await getPublicHostContext();
  return catalogTenantForPublicHost(hostCtx.kind, hostCtx.tenantId);
}

export async function loadTalentPlanKey(talentProfileId: string): Promise<string | null> {
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
  const stored = typeof key === "string" && key ? key : null;
  return resolveEffectiveTalentPlanKey(admin, talentProfileId, stored);
}

/** Sum successful booking-assistant spend for this talent in the UTC month. */
export async function loadTalentBookingAssistantSpendCentsThisMonth(
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
  const publicRows = await loadPublicOfferingsForProfile(
    talentProfileId,
    locale,
    catalogTenantId,
  );
  const fromPublic = publicRows.map((o) => ({
    id: o.id,
    title: o.title,
    priceLabel: offeringPriceLabel(o.amountCents, o.currency, o.visibility, locale),
    durationMinutes: o.durationMinutes,
  }));
  if (provided && provided.length > 0) {
    // Callers pass title/price only; attach the public id by title so the
    // model can name a service. No match = no id = that row can't get times.
    const idByTitle = new Map(fromPublic.map((o) => [o.title, o.id]));
    return provided.map((o) => ({ ...o, id: o.id ?? idByTitle.get(o.title) }));
  }
  return fromPublic;
}

function catalogGrounding(offerings: readonly BookingAssistantOfferingGround[]): string {
  return JSON.stringify(
    offerings.slice(0, 40).map((o) => ({
      id: o.id ?? null,
      title: o.title,
      price: o.priceLabel ?? null,
      durationMinutes: o.durationMinutes ?? null,
    })),
  );
}

/** The talent's effective booking mode on this host; any failure reads as inquiry (phase-1 behaviour). */
async function resolveAssistantBookingMode(
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>,
  talentProfileId: string,
): Promise<"instant" | "request" | "inquiry"> {
  try {
    const host = await getPublicHostContext();
    const mode = await resolveTalentBookingMode(admin, {
      talentProfileId,
      host: { kind: host.kind, tenantId: host.tenantId },
    });
    return mode === "instant" || mode === "request" ? mode : "inquiry";
  } catch (err) {
    logServerError("booking-assistant/mode", err);
    return "inquiry";
  }
}

type OfferTimesOutcome = "posted" | "no_times" | "unavailable";

/**
 * Flow A: real open times as the SAME `professional_times` card staff send
 * (`timesPayload` + `renderCard`, inserted with `insertMessage`). The guest's
 * tap runs `messagingClientPickTime`, which is the only place a hold is placed.
 */
async function postOfferTimesCard(input: {
  admin: NonNullable<ReturnType<typeof createServiceRoleClient>>;
  inquiryId: string;
  tenantId: string;
  talentProfileId: string;
  offering: BookingAssistantOfferingGround & { id: string };
  date: string | null;
  /** Runs right before the card insert so the thread reads reply, then card. */
  postReply: () => Promise<void>;
}): Promise<OfferTimesOutcome> {
  const host = await getPublicHostContext();
  const now = new Date();
  const result = await loadPublicOpenTimes(input.admin, {
    host: {
      kind: host.kind,
      tenantId: host.kind === "agency" || host.kind === "hub" ? host.tenantId : null,
      talentSiteId: host.kind === "talent_site" ? input.talentProfileId : null,
    },
    offeringId: input.offering.id,
    from: offerTimesFrom(input.date, now),
    days: OFFER_TIMES_WINDOW_DAYS,
    parseDuration: (offeringMinutes) => offeringMinutes,
    now,
  });
  if (!result.ok || result.mode === "inquire") return "unavailable";
  const starts = pickOfferStarts(result.slots, now);
  if (starts.length === 0) return "no_times";
  const payload = {
    ...timesPayload({
      starts,
      professionalName: null,
      talentProfileId: input.talentProfileId,
      offeringId: input.offering.id,
      timezone: result.timezone ?? "UTC",
      // Marks the card as assistant-offered (TUL-36 flow B keys its sandbox pay link on it).
      source: "booking_assistant",
    }),
    title: input.offering.title,
    state: "sent",
  };
  const card = renderCard("professional_times", payload, "operator");
  await input.postReply();
  const inserted = await insertMessage(input.admin, {
    tenantId: input.tenantId,
    inquiryId: input.inquiryId,
    kind: "professional_times",
    body: card.summary || card.title,
    payload,
    senderUserId: null,
  });
  return inserted.ok ? "posted" : "unavailable";
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
    // Phase 2: only read the mode when the assistant is on; failure = inquiry.
    const bookingMode = enabled
      ? await resolveAssistantBookingMode(admin, args.talentProfileId)
      : "inquiry";
    const decision = decideBookingAssistantTurn({
      enabled,
      bookingMode,
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

    const locale = resolveBookingAssistantReplyLocale(args.guestMessage, args.locale);
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
        jsonSchema: BOOKING_ASSISTANT_JSON_SCHEMA,
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
        maxTokens: 700,
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

    // TUL-1155: after a handoff the canned copy is never posted twice.
    const handedOffBefore = prior.some((m) => m.systemEventType === "booking_assistant_handoff");
    if (!completion.ok) {
      if (handedOffBefore) return null;
      return insertSystemEvent({
        inquiryId: args.inquiryId,
        tenantId: args.tenantId,
        body: bookingAssistantHandoffCopy("unsure", locale),
        systemEventType: "booking_assistant_handoff",
        reason: "unsure",
        locale,
      });
    }

    // Structured reply first; any parse failure keeps the phase-1 text path.
    // Bare, fenced or prose-wrapped JSON is used; broken JSON never reaches the guest.
    const output = classifyAssistantOutput(completion.text);
    const parsed = output.kind === "structured" ? output.value : null;
    const handoffNow = (reason: BookingHandoffReason) =>
      handedOffBefore
        ? null
        : insertSystemEvent({
            inquiryId: args.inquiryId,
            tenantId: args.tenantId,
            body: bookingAssistantHandoffCopy(reason, locale),
            systemEventType: "booking_assistant_handoff",
            reason,
            locale,
          });
    // Unparseable JSON-looking text must never be posted to the guest verbatim.
    if (output.kind === "broken") return handoffNow("unsure");

    const catalogIds = new Set(
      offerings.map((o) => o.id).filter((id): id is string => typeof id === "string" && id !== ""),
    );
    const resolved = parsed
      ? resolveAssistantAction(parsed, { catalogIds, canOfferTimes: bookingMode !== "inquiry" })
      : ({ kind: "answer", reply: output.kind === "text" ? output.text : "" } as const);

    if (resolved.kind === "handoff") return handoffNow("unsure");

    const sanitized = sanitizeBookingAssistantOutput(resolved.reply, grounding);
    if (sanitized.escalate || !sanitized.text.trim()) return handoffNow("unsure");

    if (resolved.kind === "offer_times") {
      const offering = offerings.find((o) => o.id === resolved.offeringId);
      if (!offering || !offering.id) return handoffNow("unsure");
      const replyBody = sanitized.text.trim();
      let replyPosted: GuestThreadMessage | null = null;
      const outcome = await postOfferTimesCard({
        admin,
        inquiryId: args.inquiryId,
        tenantId: args.tenantId,
        talentProfileId: args.talentProfileId,
        offering: { ...offering, id: offering.id },
        date: resolved.date,
        postReply: async () => {
          replyPosted = await insertSystemEvent({
            inquiryId: args.inquiryId,
            tenantId: args.tenantId,
            body: replyBody,
            systemEventType: "booking_assistant_reply",
            locale,
          });
        },
      });
      if (outcome === "posted") return replyPosted;
      if (outcome === "unavailable") return handoffNow("unsure");
      if (outcome === "no_times") {
        // The model's reply promised times; say none are open instead, then hand off.
        if (handedOffBefore) return null;
        return insertSystemEvent({
          inquiryId: args.inquiryId,
          tenantId: args.tenantId,
          body: bookingAssistantNoTimesCopy(locale),
          systemEventType: "booking_assistant_handoff",
          reason: "no_times",
          locale,
        });
      }
    }

    // The reply row is the counted assistant turn for this answer (and for
    // the card posted just above it).
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
