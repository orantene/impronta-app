import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveTenantCaptcha } from "@/lib/integrations/resolve";
import { isGuestCaptchaEnforced } from "@/lib/platform/guest-captcha-enforcement";
import type { GuestCaptchaConfig } from "@/components/public-booking/GuestCaptchaField";

export type GuestInstantChrome = {
  signedIn: boolean;
  captcha: GuestCaptchaConfig;
};

const CAPTCHA_OFF: GuestCaptchaConfig = { provider: "none", siteKey: null };

/**
 * Captcha config for guest booking / catalog sheets / vanity sites.
 * Honors HQ `platform_settings.guest_captcha_enforced` so Continuar al pago
 * is not blocked by a widget the server will skip.
 */
export async function loadGuestBookingCaptcha(
  tenantId: string | null | undefined,
): Promise<GuestCaptchaConfig> {
  if (!tenantId) return CAPTCHA_OFF;
  const [captcha, captchaEnforced] = await Promise.all([
    resolveTenantCaptcha(tenantId),
    isGuestCaptchaEnforced(),
  ]);
  return captchaEnforced
    ? { provider: captcha.provider, siteKey: captcha.siteKey }
    : CAPTCHA_OFF;
}

export async function loadGuestInstantChrome(
  tenantId: string | null | undefined,
): Promise<GuestInstantChrome> {
  if (!tenantId) {
    return { signedIn: false, captcha: CAPTCHA_OFF };
  }
  const [captcha, supabase] = await Promise.all([
    loadGuestBookingCaptcha(tenantId),
    createSupabaseServerClient(),
  ]);
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  // Keep widget + server gate in sync: when HQ turns enforcement off, do not
  // render a challenge the server will ignore (or worse, require a token the
  // sheet still blocks on).
  return {
    signedIn: !!user,
    captcha,
  };
}
