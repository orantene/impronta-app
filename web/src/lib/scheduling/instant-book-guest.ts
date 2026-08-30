/* eslint-disable ratchet/no-untenanted-from -- talent_offerings is keyed by id (tenant_id is nullable on self-roster). agencies is keyed by id. */
/**
 * Guest instant-book gates. Same identity as the request path
 * (ensureGuestClientByEmail + HMAC guest cookie). Abuse uses the existing
 * KV helpers (never an in-process map) plus tenant captcha.
 */

import { headers } from "next/headers";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getAppUrl } from "@/lib/auth-flow";
import { getGuestSessionKey } from "@/lib/guest-session";
import { checkGuestInquiryAbuse } from "@/lib/inquiry/guest-abuse-guard";
import { ensureGuestClientByEmail } from "@/lib/inquiry/guest-client";
import { sendGuestClaimEmail } from "@/lib/inquiry/guest-claim-link";
import { resolveTenantCaptcha } from "@/lib/integrations/resolve";
import { logServerError } from "@/lib/server/safe-error";
import {
  evaluateGuestInstantPolicy,
  type GuestInstantPolicy,
} from "./instant-book-guest-policy";

export { evaluateGuestInstantPolicy, type GuestInstantPolicy };

export type InstantBookActor = {
  kind: "session" | "guest";
  userId: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  useServiceRoleConvert: boolean;
};

export type InstantBookActorFail = {
  kind: "fail";
  reason: "needs_auth" | "captcha_failed" | "captcha_required" | "rate_limited" | "validation";
  error: string;
  needsAuth?: boolean;
};

export async function resolveTrustedClientIp(): Promise<string | null> {
  const h = await headers();
  const real = h.get("x-real-ip")?.trim();
  if (real) return real;
  const xff = h.get("x-forwarded-for");
  if (!xff) return null;
  const hops = xff.split(",").map((s) => s.trim()).filter(Boolean);
  return hops[hops.length - 1] ?? null;
}

async function verifyTenantCaptchaToken(input: {
  tenantId: string;
  token: string | null | undefined;
  ip: string | null;
}): Promise<{ configured: boolean; ok: boolean | null }> {
  const captcha = await resolveTenantCaptcha(input.tenantId);
  if (captcha.provider === "none" || !captcha.siteKey) {
    return { configured: false, ok: true };
  }
  const token = input.token?.trim() || "";
  if (!token) return { configured: true, ok: null };

  const secret = await captcha.getSecret();
  if (!secret) return { configured: true, ok: false };

  try {
    if (captcha.provider === "hcaptcha") {
      const r = await fetch("https://api.hcaptcha.com/siteverify", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ secret, response: token }),
      });
      const j = (await r.json()) as { success?: boolean };
      return { configured: true, ok: j.success === true };
    }
    const params = new URLSearchParams({ secret, response: token });
    if (input.ip) params.set("remoteip", input.ip);
    const r = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params,
    });
    const j = (await r.json()) as { success?: boolean };
    return { configured: true, ok: j.success === true };
  } catch (err) {
    logServerError("instantBook.guestCaptcha", err);
    return { configured: true, ok: false };
  }
}

function fail(
  reason: InstantBookActorFail["reason"],
  error: string,
  needsAuth?: boolean,
): InstantBookActorFail {
  return { kind: "fail", reason, error, needsAuth };
}

export async function loadOfferingRequireAccount(
  offeringId: string | null | undefined,
): Promise<boolean> {
  if (!offeringId) return false;
  const admin = createServiceRoleClient();
  if (!admin) return false;
  // Offering id is the key. tenant_id is nullable on self-roster rows; a
  // tenant filter would miss those and silently skip the account gate.
  const { data } = await admin
    .from("talent_offerings")
    .select("require_account_to_book")
    .eq("id", offeringId)
    .maybeSingle();
  return (data as { require_account_to_book?: boolean } | null)?.require_account_to_book === true;
}

export async function resolveInstantBookActor(input: {
  user: { id: string; email?: string | null } | null;
  tenantId: string;
  requireAccount: boolean;
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  captchaToken?: string | null;
  honeypot?: string | null;
}): Promise<InstantBookActor | InstantBookActorFail> {
  if (input.user) {
    return {
      kind: "session",
      userId: input.user.id,
      contactName: (input.contactName || input.user.email || "Client").toString(),
      contactEmail: (input.contactEmail || input.user.email || "").toString(),
      contactPhone: input.contactPhone ?? null,
      useServiceRoleConvert: false,
    };
  }

  if (input.requireAccount) {
    return fail("needs_auth", "Please sign in to book instantly.", true);
  }

  const email = input.contactEmail?.trim().toLowerCase() ?? "";
  const name = input.contactName?.trim() || "";
  const ip = await resolveTrustedClientIp();
  const guestSessionId = await getGuestSessionKey();

  const abuse = await checkGuestInquiryAbuse({
    honeypot: input.honeypot,
    email,
    guestSessionId,
    ip,
    tenantId: input.tenantId,
    captchaToken: input.captchaToken,
  });
  const captcha = await verifyTenantCaptchaToken({
    tenantId: input.tenantId,
    token: input.captchaToken,
    ip,
  });

  const policy = evaluateGuestInstantPolicy({
    signedIn: false,
    requireAccount: input.requireAccount,
    hasEmail: email.includes("@"),
    captchaConfigured: captcha.configured,
    captchaOk: captcha.ok,
    rateLimited: !abuse.ok && abuse.code === "rate_limited",
  });

  if (!policy.ok) {
    if (policy.reason === "needs_auth") {
      return fail("needs_auth", "Please sign in to book instantly.", true);
    }
    if (policy.reason === "captcha_failed" || policy.reason === "captcha_required") {
      return fail(policy.reason, "Please complete the challenge to continue.");
    }
    if (policy.reason === "rate_limited") {
      return fail("rate_limited", "Too many bookings from this device. Please wait and try again.");
    }
    return fail("validation", "Add your name and email to book.");
  }

  if (!abuse.ok && abuse.code !== "rate_limited") {
    if (abuse.code === "disposable_email") {
      return fail("validation", "Please use a non-disposable email address.");
    }
    return fail("validation", "Unable to complete this booking.");
  }

  const provisioned = await ensureGuestClientByEmail({
    email,
    name,
    company: "",
    phone: input.contactPhone?.trim() ?? "",
  });
  if (!provisioned.clientUserId) {
    return fail("validation", "Add your name and email to book.");
  }

  return {
    kind: "guest",
    userId: provisioned.clientUserId,
    contactName: name || email,
    contactEmail: email,
    contactPhone: input.contactPhone ?? null,
    useServiceRoleConvert: true,
  };
}

export function convertClientForActor(
  sessionClient: SupabaseClient,
  actor: InstantBookActor,
): SupabaseClient {
  if (!actor.useServiceRoleConvert) return sessionClient;
  const admin = createServiceRoleClient();
  return admin ?? sessionClient;
}

export async function notifyGuestInstantBooking(input: {
  kind: "session" | "guest";
  email: string;
  tenantId: string;
  talentName?: string | null;
}): Promise<void> {
  if (input.kind !== "guest" || !input.email.includes("@")) return;
  try {
    const admin = createServiceRoleClient();
    if (!admin) return;
    // agencies is keyed by id (the tenant). Same exception as appointments-settings-tenant.
    // eslint-disable-next-line ratchet/no-untenanted-from
    const { data } = await admin
      .from("agencies")
      .select("slug")
      .eq("id", input.tenantId)
      .maybeSingle();
    const slug = (data as { slug?: string | null } | null)?.slug?.trim();
    if (!slug) return;
    await sendGuestClaimEmail({
      email: input.email,
      tenantSlug: slug,
      talentName: input.talentName?.trim() || "the studio",
      appUrl: getAppUrl(),
      tenantId: input.tenantId,
    });
  } catch (err) {
    logServerError("instantBook.guestNotify", err);
  }
}
