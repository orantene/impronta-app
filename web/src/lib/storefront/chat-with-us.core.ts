/**
 * chat_with_us — the engine seam.
 *
 * Availability is the two switches that already exist: the tenant's
 * `inquiries_open` setting and `tenant_guest_chat_settings.enabled`. Nobody
 * has opening hours for messaging, so `hours` is the block's authored
 * sentence and nothing more.
 *
 * Starting a conversation is exactly the guest-chat path: an inquiry through
 * `createInquiryFromIntent` (source `agency_site`, the guest session on it),
 * the first message through the inquiry engine's `sendMessage`, and the
 * customer link from `signThreadToken` → `/c/t/<token>`. The rate limits and
 * the contact policy live in the engine and surface as refusals here.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CreateInquiryFromIntentResult } from "@/lib/inquiry/inquiry-intent-engine";
import type { InquiryIntent, IntentAdapterContext } from "@/lib/inquiry/inquiry-intent";
import type { EngineResult } from "@/lib/inquiry/inquiry-engine.types";
import { publicThreadPath } from "@/lib/messaging/thread-token";

import type { StorefrontAdmin } from "./admin";
import type { ChatWithUsData, ChatWithUsInput, ChatWithUsProps, ChatWithUsResult } from "./chat-with-us.types";
import type { IdempotentRunner } from "./idempotent";
import { mapEngineRefusal } from "./refusals";
import type { StorefrontIdentity } from "./request-context";

export type ChatWithUsDeps = {
  admin: StorefrontAdmin;
  runner: IdempotentRunner;
  identity: StorefrontIdentity;
  /** `guest_sessions.id` for this browser; the inquiry is owned by it. */
  guestSessionRowId: string | null;
  locale: "en" | "es";
  origin: string | null;
  hostname: string | null;
  createInquiry: (admin: SupabaseClient, intent: InquiryIntent, ctx: IntentAdapterContext) => Promise<CreateInquiryFromIntentResult>;
  sendMessage: (
    admin: SupabaseClient,
    ctx: { inquiryId: string; tenantId: string; actorUserId: string | null; guestSessionId?: string | null; threadType: "private" | "group"; body: string },
  ) => Promise<EngineResult<{ messageId: string }>>;
  signThreadToken: (inquiryId: string, tenantId: string) => string | null;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_MESSAGE = 4000;

function asBool(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (v === "true") return true;
  if (v === "false") return false;
  return fallback;
}

function whatsappUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const digits = raw.replace(/[^\d]/g, "");
  return digits.length >= 8 ? `https://wa.me/${digits}` : null;
}

export async function readChatWithUsCore(
  deps: ChatWithUsDeps,
  tenantId: string,
  props: ChatWithUsProps,
): Promise<{ ok: true; data: ChatWithUsData } | { ok: false; reason: string }> {
  if (!UUID.test(tenantId)) return { ok: false, reason: "invalid_request" };
  try {
    const [{ data: settingRows, error: sErr }, { data: chat }] = await Promise.all([
      deps.admin.from("settings").select("key, value").eq("tenant_id", tenantId).in("key", ["inquiries_open", "agency_whatsapp_number"]),
      deps.admin.from("tenant_guest_chat_settings").select("enabled, greeting").eq("tenant_id", tenantId).maybeSingle(),
    ]);
    if (sErr) return { ok: false, reason: "unavailable" };
    const settings = new Map<string, unknown>();
    for (const r of (settingRows ?? []) as Array<{ key: string; value: unknown }>) settings.set(r.key, r.value);
    const inquiriesOpen = asBool(settings.get("inquiries_open"), true);
    const chatEnabled = chat ? asBool(chat.enabled, true) : true;
    const channels = props.channels ?? ["thread", "whatsapp"];

    let existing: ChatWithUsData["existing"] = null;
    if (deps.guestSessionRowId || deps.identity.userId) {
      let q = deps.admin.from("inquiries").select("id, status, created_at, guest_session_id, client_user_id").eq("tenant_id", tenantId);
      q = deps.identity.userId ? q.eq("client_user_id", deps.identity.userId) : q.eq("guest_session_id", deps.guestSessionRowId);
      const { data: rows } = await q.order("created_at", { ascending: false }).limit(1);
      const row = (rows ?? [])[0] as { id: string; status: string; created_at: string } | undefined;
      if (row) {
        const token = deps.signThreadToken(row.id, tenantId);
        existing = {
          inquiryId: row.id,
          status: String(row.status ?? ""),
          threadUrl: token && deps.origin ? `${deps.origin}${publicThreadPath(token)}` : null,
          startedAtIso: new Date(row.created_at).toISOString(),
        };
      }
    }
    const prefill =
      deps.identity.userId && (deps.identity.email || deps.identity.displayName)
        ? { name: deps.identity.displayName, email: deps.identity.email }
        : null;
    return {
      ok: true,
      data: {
        open: inquiriesOpen && chatEnabled,
        greeting: props.greeting?.trim() || (chat && typeof chat.greeting === "string" && chat.greeting.trim() ? chat.greeting.trim() : null),
        hours: props.hours?.trim() || null,
        channels: {
          thread: channels.includes("thread") && inquiriesOpen && chatEnabled,
          whatsappUrl: channels.includes("whatsapp") ? whatsappUrl(settings.get("agency_whatsapp_number")) : null,
        },
        existing,
        prefill,
      },
    };
  } catch {
    return { ok: false, reason: "unavailable" };
  }
}

export async function actChatWithUsCore(deps: ChatWithUsDeps, input: ChatWithUsInput): Promise<ChatWithUsResult> {
  if (!input || !UUID.test(input.tenantId ?? "")) return mapEngineRefusal("invalid_request", deps.locale);
  if (typeof input.clientKey !== "string" || input.clientKey.trim().length < 8) return mapEngineRefusal("invalid_request", deps.locale);
  const message = (input.message ?? "").trim();
  if (!message || message.length > MAX_MESSAGE) return mapEngineRefusal("invalid_request", deps.locale);
  const c = input.contact ?? { name: "" };
  const name = (c.name ?? "").trim();
  const email = (c.email ?? "").trim().toLowerCase() || null;
  const phone = (c.phone ?? "").trim() || null;
  // A conversation needs someone to answer to. The engine demands the same
  // (`requester.email_or_phone`); refusing first keeps the reason honest.
  if (!name || (!email && !phone)) return mapEngineRefusal("identity_required", deps.locale);
  if (!deps.guestSessionRowId && !deps.identity.userId) return mapEngineRefusal("identity_required", deps.locale);

  const outcome = await deps.runner<ChatWithUsResult>({
    command: "storefront.chat.start",
    tenantId: input.tenantId,
    actorUserId: deps.identity.userId,
    key: input.clientKey.trim(),
    args: { email, phone, message },
    run: async () => {
      const intent: InquiryIntent = {
        source: "agency_site",
        source_context: { referrer_page: input.sourcePage ?? null, tenant_id: input.tenantId, storefront_widget: "chat_with_us" },
        requester: { name, email: email ?? undefined, phone: phone ?? undefined, trust_level: "basic" },
        talent: { selection_mode: "agency_recommends" },
        location: { status: "not_sure" },
        date: { status: "not_sure" },
        brief: { summary: message },
      };
      const created = await deps.createInquiry(deps.admin as SupabaseClient, intent, {
        tenant_id: input.tenantId,
        actor_user_id: deps.identity.userId,
        client_user_id: deps.identity.userId,
        guest_session_id: deps.identity.userId ? null : deps.guestSessionRowId,
        source_workspace_id: input.tenantId,
        origin_domain: deps.hostname,
        host_kind: "agency",
        host_tenant_id: input.tenantId,
      });
      if (!created.ok) {
        // The engine's `forbidden` here is the contact policy or a blocked
        // recipient; to the person it is "not allowed", not a fault.
        return mapEngineRefusal(created.reason, deps.locale);
      }
      const sent = await deps.sendMessage(deps.admin as SupabaseClient, {
        inquiryId: created.inquiryId,
        tenantId: input.tenantId,
        actorUserId: deps.identity.userId,
        guestSessionId: deps.identity.userId ? null : deps.guestSessionRowId,
        threadType: "private",
        body: message,
      });
      const messageId = sent.success && sent.data ? sent.data.messageId : null;
      const token = deps.signThreadToken(created.inquiryId, input.tenantId);
      const threadPath = token ? publicThreadPath(token) : null;
      return {
        ok: true,
        inquiryId: created.inquiryId,
        messageId,
        threadPath,
        threadUrl: threadPath && deps.origin ? `${deps.origin}${threadPath}` : null,
        replayed: false,
      };
    },
  });
  switch (outcome.status) {
    case "ok":
      return outcome.result.ok ? { ...outcome.result, replayed: outcome.replayed } : outcome.result;
    case "refused":
      return outcome.result;
    case "conflict":
      return mapEngineRefusal(outcome.code, deps.locale);
    case "error":
      return mapEngineRefusal("engine_error", deps.locale);
  }
}
