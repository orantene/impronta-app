"use client";

/**
 * Tenant captcha widget for guest instant booking. Same providers as the
 * CMS form node: render when the tenant (or platform inherit) has a site key.
 */

import { useEffect, useRef } from "react";
import { hcaptchaLocale, turnstileLocale } from "@/lib/i18n/vendor-locale";

export type GuestCaptchaConfig = {
  provider: "hcaptcha" | "turnstile" | "none";
  siteKey: string | null;
};

const CB = "__tulalaGuestInstantCaptcha";

/** TUL-59: the widget's rendered height, reserved up front so nothing shifts when it paints. */
export const CAPTCHA_MIN_HEIGHT_PX = 78;

type CaptchaApi = { render: (el: HTMLElement, opts: Record<string, unknown>) => unknown };

const SCRIPT_SRC = {
  hcaptcha: "https://js.hcaptcha.com/1/api.js?render=explicit",
  turnstile: "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit",
} as const;

const scriptPromises: Partial<Record<"hcaptcha" | "turnstile", Promise<void>>> = {};

/** Load the vendor script once (explicit render), safe to call early from the sheet open. */
export function preloadGuestCaptchaScript(provider: "hcaptcha" | "turnstile"): Promise<void> {
  if (typeof document === "undefined") return Promise.resolve();
  const hit = scriptPromises[provider];
  if (hit) return hit;
  const p = new Promise<void>((resolve) => {
    const el = document.createElement("script");
    el.src = SCRIPT_SRC[provider];
    el.async = true;
    el.defer = true;
    el.onload = () => resolve();
    el.onerror = () => {
      delete scriptPromises[provider];
      resolve();
    };
    document.head.appendChild(el);
  });
  scriptPromises[provider] = p;
  return p;
}

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

  const widgetRef = useRef<HTMLDivElement>(null);
  const active = provider !== "none" && Boolean(siteKey);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    void preloadGuestCaptchaScript(provider).then(() => {
      const el = widgetRef.current;
      if (cancelled || !el || el.childElementCount > 0) return;
      const w = window as unknown as { hcaptcha?: CaptchaApi; turnstile?: CaptchaApi };
      const api = provider === "hcaptcha" ? w.hcaptcha : w.turnstile;
      api?.render(el, {
        sitekey: siteKey,
        callback: (t: string) => (window as unknown as Record<string, (t: string) => void>)[CB]?.(t),
        ...(provider === "hcaptcha" ? { hl: hcaptchaLocale(locale) } : { language: turnstileLocale(locale) }),
      });
    });
    return () => {
      cancelled = true;
    };
  }, [active, provider, siteKey, locale]);

  if (!active) return null;
  const reserve = { minHeight: CAPTCHA_MIN_HEIGHT_PX } as const;

  if (provider === "hcaptcha") {
    return (
      <div data-guest-instant-captcha="hcaptcha" style={reserve}>
        <div
          ref={widgetRef}
          className="h-captcha"
          data-sitekey={siteKey}
          data-hl={hcaptchaLocale(locale)}
          data-callback={CB}
        />
      </div>
    );
  }

  return (
    <div data-guest-instant-captcha="turnstile" style={reserve}>
      <div
        ref={widgetRef}
        className="cf-turnstile"
        data-sitekey={siteKey}
        data-language={turnstileLocale(locale)}
        data-callback={CB}
      />
    </div>
  );
}
