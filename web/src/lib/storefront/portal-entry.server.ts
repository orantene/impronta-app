"use server";

/** portal_entry — the server actions the island imports dynamically. */

import { requestEmailCode } from "@/app/auth/otp-actions";
import { loadMeData } from "@/lib/me/load-me";
import { signAdmissionToken } from "@/lib/sessions/admission-token";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

import { actPortalEntryCore, readPortalEntryCore, type PortalEntryDeps } from "./portal-entry.core";
import type { PortalEntryData, PortalEntryInput, PortalEntryProps, PortalEntryResult } from "./portal-entry.types";
import { mapEngineRefusal } from "./refusals";
import { resolveStorefrontIdentity, storefrontLocale } from "./request-context";

async function bind(locale: string | null | undefined): Promise<PortalEntryDeps | null> {
  const admin = createServiceRoleClient();
  if (!admin) return null;
  const [identity, lang] = await Promise.all([resolveStorefrontIdentity(), storefrontLocale(locale)]);
  return {
    admin,
    identity,
    locale: lang,
    loadMe: loadMeData,
    signAdmissionToken,
    requestCode: (form) => requestEmailCode(undefined, form),
  };
}

export async function readPortalEntry(
  tenantId: string,
  props: PortalEntryProps,
): Promise<{ ok: true; data: PortalEntryData } | { ok: false; reason: string }> {
  try {
    const deps = await bind(props.locale);
    if (!deps) return { ok: false, reason: "unavailable" };
    return await readPortalEntryCore(deps, tenantId, props);
  } catch (error) {
    logServerError("storefront.portalEntry.read", error);
    return { ok: false, reason: "unavailable" };
  }
}

export async function actPortalEntry(input: PortalEntryInput, _expectedVersion?: number): Promise<PortalEntryResult> {
  try {
    const deps = await bind(input.locale);
    if (!deps) return mapEngineRefusal("unavailable", "en");
    return await actPortalEntryCore(deps, input);
  } catch (error) {
    logServerError("storefront.portalEntry.act", error);
    return mapEngineRefusal("engine_error", input.locale === "es" ? "es" : "en");
  }
}
