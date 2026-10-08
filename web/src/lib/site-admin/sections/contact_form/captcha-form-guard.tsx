"use client";

/**
 * Companion to the server-rendered Turnstile div in native HTML forms (TUL-123).
 *
 * Defines the global handlers the widget's data-attributes name, keeps the
 * form's submit buttons disabled until a token exists, and when the widget
 * errors or never loads shows a clear inline message with a retry button
 * (re-renders the widget). Never a dead end.
 */

import { useEffect, useReducer, useRef } from "react";
import {
  captchaRetryCopy,
  captchaSubmitAllowed,
  nextCaptchaUiState,
  type CaptchaUiEvent,
  type CaptchaUiState,
} from "@/lib/captcha/widget-options";

type W = Window & {
  __tulalaCaptchaDone?: (t: string) => void;
  __tulalaCaptchaError?: () => void;
  __tulalaCaptchaExpired?: () => void;
  turnstile?: {
    reset?: (el?: Element) => void;
    render?: (el: Element, o: Record<string, unknown>) => unknown;
  };
};

export function CaptchaFormGuard({ locale }: { locale: string | null | undefined }) {
  const marker = useRef<HTMLSpanElement>(null);
  const [state, dispatch] = useReducer(
    (st: CaptchaUiState, ev: CaptchaUiEvent) => nextCaptchaUiState(st, ev),
    "loading" as CaptchaUiState,
  );

  useEffect(() => {
    const w = window as W;
    w.__tulalaCaptchaDone = () => dispatch("token");
    w.__tulalaCaptchaError = () => dispatch("error");
    w.__tulalaCaptchaExpired = () => dispatch("expired");
    // Vendor script that never arrives: surface the retry instead of a dead form.
    const t = window.setTimeout(() => {
      if (!(window as W).turnstile?.render) dispatch("script_failed");
    }, 10000);
    return () => window.clearTimeout(t);
  }, []);

  useEffect(() => {
    const form = marker.current?.closest("form");
    if (!form) return;
    const allowed = captchaSubmitAllowed(state);
    form
      .querySelectorAll<HTMLButtonElement | HTMLInputElement>(
        'button[type="submit"], input[type="submit"]',
      )
      .forEach((b) => {
        b.disabled = !allowed;
      });
  }, [state]);

  const retry = () => {
    const w = window as W;
    dispatch("retry");
    const el = marker.current?.closest("form")?.querySelector(".cf-turnstile") ?? undefined;
    try {
      w.turnstile?.reset?.(el);
    } catch {
      // vendor not ready: the auto-retry / next click re-attempts
    }
    if (!w.turnstile?.render) {
      const s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
      s.async = true;
      document.head.appendChild(s);
    }
  };

  const copy = captchaRetryCopy(locale);
  return (
    <>
      <span ref={marker} hidden data-captcha-form-guard="" />
      {state === "failed" ? (
        <div role="alert" data-captcha-error="">
          <p>{copy.message}</p>
          <button type="button" onClick={retry}>
            {copy.retry}
          </button>
        </div>
      ) : null}
    </>
  );
}
