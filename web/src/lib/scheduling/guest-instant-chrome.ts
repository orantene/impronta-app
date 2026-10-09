import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveTenantCaptcha } from "@/lib/integrations/resolve";
import { isGuestCaptchaEnforced } from "@/lib/platform/guest-captcha-enforcement";
import type { GuestCaptchaConfig } from "@/components/public-booking/GuestCaptchaField";

/** Prefill for the booking / request form when a real session is present (TUL-62). */
export type GuestInstantClient = {
  displayName: string | null;
  email: string | null;
  phone: string | null;
};

export type GuestInstantChrome = {
  signedIn: boolean;
  captcha: GuestCaptchaConfig;
  /** Null when signed out; name/email/phone when we can read them. */
  client: GuestInstantClient | null;
};

const CAPTCHA_OFF: GuestCaptchaConfig = { provider: "none", siteKey: null };

export async function loadGuestInstantChrome(
  tenantId: string | null | undefined,
): Promise<GuestInstantChrome> {
  if (!tenantId) {
    return { signedIn: false, captcha: CAPTCHA_OFF, client: null };
  }
  const [captcha, supabase, captchaEnforced] = await Promise.all([
    resolveTenantCaptcha(tenantId),
    createSupabaseServerClient(),
    isGuestCaptchaEnforced(),
  ]);
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  // Keep widget + server gate in sync: when HQ turns enforcement off, do not
  // render a challenge the server will ignore (or worse, require a token the
  // sheet still blocks on).
  const captchaConfig: GuestCaptchaConfig = captchaEnforced
    ? { provider: captcha.provider, siteKey: captcha.siteKey }
    : CAPTCHA_OFF;

  if (!user || !supabase) {
    return { signedIn: false, captcha: captchaConfig, client: null };
  }

  const [{ data: profile }, { data: clientProfile }] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    supabase.from("client_profiles").select("phone").eq("user_id", user.id).maybeSingle(),
  ]);

  const displayName =
    (profile as { display_name?: string | null } | null)?.display_name?.trim() ||
    (typeof user.user_metadata?.full_name === "string" ? user.user_metadata.full_name.trim() : "") ||
    (typeof user.user_metadata?.name === "string" ? user.user_metadata.name.trim() : "") ||
    null;

  return {
    signedIn: true,
    captcha: captchaConfig,
    client: {
      displayName,
      email: user.email?.trim() || null,
      phone: (clientProfile as { phone?: string | null } | null)?.phone?.trim() || null,
    },
  };
}
