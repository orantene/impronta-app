"use server";

/** chat_with_us — the server actions the island imports dynamically. */

import { headers } from "next/headers";

import { resolveGuestSessionId } from "@/lib/guest/guest-session";
import { sendMessage } from "@/lib/inquiry/inquiry-engine-messages";
import { createInquiryFromIntent } from "@/lib/inquiry/inquiry-intent-engine";
import { signThreadToken } from "@/lib/messaging/thread-token";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

import { actChatWithUsCore, readChatWithUsCore, type ChatWithUsDeps } from "./chat-with-us.core";
import type { ChatWithUsData, ChatWithUsInput, ChatWithUsProps, ChatWithUsResult } from "./chat-with-us.types";
import { commandIdempotentRunner } from "./idempotent";
import { mapEngineRefusal } from "./refusals";
import { publicOrigin, resolveStorefrontIdentity, storefrontLocale } from "./request-context";

async function bind(locale: string | null | undefined): Promise<ChatWithUsDeps | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const [identity, guestSessionRowId, origin, lang, h] = await Promise.all([
    resolveStorefrontIdentity(),
    resolveGuestSessionId(),
    publicOrigin(),
    storefrontLocale(locale),
    headers(),
  ]);
  return {
    admin,
    runner: commandIdempotentRunner(admin),
    identity,
    guestSessionRowId,
    locale: lang,
    origin,
    hostname: h.get("x-forwarded-host") ?? h.get("host"),
    createInquiry: createInquiryFromIntent,
    sendMessage,
    signThreadToken: (inquiryId, tenantId) => signThreadToken(inquiryId, tenantId),
  };
}

export async function readChatWithUs(
  tenantId: string,
  props: ChatWithUsProps,
): Promise<{ ok: true; data: ChatWithUsData } | { ok: false; reason: string }> {
  try {
    const deps = await bind(props.locale);
    if (!deps) return { ok: false, reason: "unavailable" };
    return await readChatWithUsCore(deps, tenantId, props);
  } catch (error) {
    logServerError("storefront.chatWithUs.read", error);
    return { ok: false, reason: "unavailable" };
  }
}

export async function actChatWithUs(input: ChatWithUsInput, _expectedVersion?: number): Promise<ChatWithUsResult> {
  try {
    const deps = await bind(input.locale);
    if (!deps) return mapEngineRefusal("unavailable", "en");
    return await actChatWithUsCore(deps, input);
  } catch (error) {
    logServerError("storefront.chatWithUs.act", error);
    return mapEngineRefusal("engine_error", input.locale === "es" ? "es" : "en");
  }
}
