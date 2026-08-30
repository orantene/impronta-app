"use client";

/**
 * Tenant captcha widget for guest instant booking. Same providers as the
 * CMS form node: render when the tenant (or platform inherit) has a site key.
 */

import { useEffect } from "react";
import { hcaptchaLocale, turnstileLocale } from "@/lib/i18n/vendor-locale";

export type GuestCaptchaConfig = {
  provider: "hcaptcha" | "turnstile" | "none";
  siteKey: string | null;
};

const CB = "__tulalaGuestInstantCaptcha";

export function GuestCaptchaField({
  captcha,
  locale,
  onToken,
}: {
  captcha?: GuestCaptchaConfig | null;
  locale: string;
  onToken: (token: string) => void;
}) {
  const provider = captcha?.provider ?? "none";
  const siteKey = captcha?.siteKey;

  useEffect(() => {
    const prev = (window as unknown as Record<string, unknown>)[CB];
    (window as unknown as Record<string, unknown>)[CB] = (token: string) => {
      if (typeof token === "string" && token.trim()) onToken(token.trim());
    };
    return () => {
      (window as unknown as Record<string, unknown>)[CB] = prev;
    };
  }, [onToken]);

  if (provider === "none" || !siteKey) return null;

  if (provider === "hcaptcha") {
    return (
      <div data-guest-instant-captcha="hcaptcha">
        <div
          className="h-captcha"
          data-sitekey={siteKey}
          data-hl={hcaptchaLocale(locale)}
          data-callback={CB}
        />
        <script src="https://js.hcaptcha.com/1/api.js" async defer />
      </div>
    );
  }

  return (
    <div data-guest-instant-captcha="turnstile">
      <div
        className="cf-turnstile"
        data-sitekey={siteKey}
        data-language={turnstileLocale(locale)}
        data-callback={CB}
      />
      <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer />
    </div>
  );
}
