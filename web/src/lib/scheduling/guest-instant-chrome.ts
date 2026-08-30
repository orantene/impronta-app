import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { resolveTenantCaptcha } from "@/lib/integrations/resolve";
import type { GuestCaptchaConfig } from "@/components/public-booking/GuestCaptchaField";

export type GuestInstantChrome = {
  signedIn: boolean;
  captcha: GuestCaptchaConfig;
};

export async function loadGuestInstantChrome(
  tenantId: string | null | undefined,
): Promise<GuestInstantChrome> {
  if (!tenantId) {
    return { signedIn: false, captcha: { provider: "none", siteKey: null } };
  }
  const [captcha, supabase] = await Promise.all([
    resolveTenantCaptcha(tenantId),
    createSupabaseServerClient(),
  ]);
  const user = supabase ? (await supabase.auth.getUser()).data.user : null;
  return {
    signedIn: !!user,
    captcha: { provider: captcha.provider, siteKey: captcha.siteKey },
  };
}
