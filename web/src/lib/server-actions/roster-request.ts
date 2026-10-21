"use server";

/**
 * TUL-1415 / TUL-1587 · the front-door chat builds ONE request across roster services.
 * A neutral server-action path (not under /t/[profileCode]): it serves the agency workspace
 * host's own chat, and the decision logic lives in `service-hub/roster-request-core`.
 */

import { headers } from "next/headers";

import { resolveBookingAssistantReplyLocale } from "@/lib/ai/booking-assistant/handoff";
import { checkPublicCatalog } from "@/lib/rate-limit-kv";
import { getPublicHostContext } from "@/lib/saas/scope";
import { logServerError } from "@/lib/server/safe-error";
import { resolvePublicClientIp } from "@/lib/server/public-client-ip";
import { buildRosterRequestWith, type BuildRosterRequestResult } from "@/lib/service-hub/roster-request-core";
import { loadRosterServicesWithHub } from "@/lib/service-hub/hub-roster.server";
import { createServiceRoleClient } from "@/lib/supabase/admin";

export async function buildRosterRequestFromSentence(raw: { sentence: string; locale?: string | null }): Promise<BuildRosterRequestResult> {
  try {
    return await buildRosterRequestWith(
      {
        rateLimitOk: async () => (await checkPublicCatalog(resolvePublicClientIp(await headers()))).ok,
        host: async () => {
          const host = await getPublicHostContext();
          return { kind: host.kind, tenantId: host.tenantId ?? null };
        },
        loadItems: async (tenantId) => {
          const admin = createServiceRoleClient();
          return admin ? loadRosterServicesWithHub(admin, tenantId) : null;
        },
        replyLocale: (sentence, hint) => resolveBookingAssistantReplyLocale(sentence, hint),
      },
      raw,
    );
  } catch (err) {
    logServerError("roster-request.buildRosterRequestFromSentence", err);
    return { ok: false, error: "unavailable" };
  }
}
