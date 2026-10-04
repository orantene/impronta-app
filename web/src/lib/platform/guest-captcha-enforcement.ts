import "server-only";

/**
 * guest-captcha-enforcement.ts — reads/writes
 * `platform_settings.guest_captcha_enforced`.
 *
 * Default TRUE (captcha ON). HQ may flip it off temporarily for production
 * testing from /platform/admin/settings. Server-side only: guest clients never
 * see a public flag they can toggle.
 *
 * Cache mirrors gated-media.ts: short in-process memo, invalidated on write,
 * never persisted across restarts.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  GUEST_CAPTCHA_ENFORCED_DEFAULT,
  resolveGuestCaptchaEnforced,
} from "./guest-captcha-enforcement-resolve";

export {
  GUEST_CAPTCHA_ENFORCED_DEFAULT,
  resolveGuestCaptchaEnforced,
} from "./guest-captcha-enforcement-resolve";

/** How long one server instance may reuse a read of the setting. */
export const GUEST_CAPTCHA_ENFORCEMENT_TTL_MS = 30_000;

let memo: { readAt: number; value: Promise<boolean> } | null = null;

/** Drop the memo (write path + tests). */
export function invalidateGuestCaptchaEnforcement(): void {
  memo = null;
}

async function readSetting(): Promise<boolean> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return GUEST_CAPTCHA_ENFORCED_DEFAULT;
    const { data, error } = await admin
      .from("platform_settings")
      .select("guest_captcha_enforced")
      .eq("id", true)
      .maybeSingle();
    if (error) {
      logServerError("platform.loadGuestCaptchaEnforced", error);
      return GUEST_CAPTCHA_ENFORCED_DEFAULT;
    }
    return resolveGuestCaptchaEnforced(data?.guest_captcha_enforced);
  } catch (err) {
    logServerError("platform.loadGuestCaptchaEnforced", err);
    return GUEST_CAPTCHA_ENFORCED_DEFAULT;
  }
}

/** Memoised column value. */
export function loadGuestCaptchaEnforced(): Promise<boolean> {
  const now = Date.now();
  if (memo && now - memo.readAt < GUEST_CAPTCHA_ENFORCEMENT_TTL_MS) return memo.value;
  const value = readSetting();
  memo = { readAt: now, value };
  return value;
}

/** Is guest booking captcha currently enforced? Fail closed → true. */
export async function isGuestCaptchaEnforced(): Promise<boolean> {
  return loadGuestCaptchaEnforced();
}

/**
 * Persist the switch. Called by the super-admin action after access checks.
 */
export async function writeGuestCaptchaEnforced(
  updatedBy: string,
  enforced: boolean,
): Promise<{ ok: true } | { ok: false }> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false };
    const { error } = await admin
      .from("platform_settings")
      .update({
        guest_captcha_enforced: enforced,
        updated_at: new Date().toISOString(),
        updated_by: updatedBy,
      })
      .eq("id", true);
    if (error) {
      logServerError("platform.writeGuestCaptchaEnforced", error);
      return { ok: false };
    }
    invalidateGuestCaptchaEnforcement();
    return { ok: true };
  } catch (err) {
    logServerError("platform.writeGuestCaptchaEnforced", err);
    return { ok: false };
  }
}
