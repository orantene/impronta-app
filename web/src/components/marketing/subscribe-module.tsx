"use client";

import { type FormEvent, useId, useState, useTransition } from "react";
import { trackEvent } from "@/lib/marketing/ga-events";
import { subscribeToNewsletter } from "@/lib/marketing/subscribe/actions";
import type { SubscribeStatus } from "@/lib/marketing/subscribe/types";
import { MarketingContainer, MarketingSection } from "./container";

type Copy = {
  heading: string;
  promise: string;
  placeholder: string;
  cta: string;
  sending: string;
  success: string;
  already: string;
  invalid: string;
  rateLimited: string;
  error: string;
  aria: string;
};

function getCopy(locale: string): Copy {
  if (locale === "es") {
    return {
      heading: "Consigue más reservas",
      promise: "Una guía práctica cada semana sobre cómo te contratan y cómo cobras.",
      placeholder: "tu@correo.com",
      cta: "Suscribirme",
      sending: "Enviando...",
      success: "Listo. Revisa tu correo para la primera guía.",
      already: "Ya estás en la lista. Gracias por seguir aquí.",
      invalid: "Escribe un correo válido.",
      rateLimited: "Demasiados intentos. Espera un momento y vuelve a probar.",
      error: "Algo falló de nuestro lado. Intenta de nuevo en un momento.",
      aria: "Suscríbete al boletín",
    };
  }
  return {
    heading: "Get booked more",
    promise: "One practical guide a week on getting booked and getting paid.",
    placeholder: "you@email.com",
    cta: "Subscribe",
    sending: "Sending...",
    success: "Done. Check your inbox for the first guide.",
    already: "You're already on the list. Thanks for sticking around.",
    invalid: "Enter a valid email.",
    rateLimited: "Too many attempts. Wait a moment and try again.",
    error: "Something broke on our end. Try again in a moment.",
    aria: "Subscribe to the newsletter",
  };
}

function messageFor(copy: Copy, status: SubscribeStatus): string {
  switch (status) {
    case "ok":
      return copy.success;
    case "already":
      return copy.already;
    case "invalid":
      return copy.invalid;
    case "rate_limited":
      return copy.rateLimited;
    case "error":
    default:
      return copy.error;
  }
}

/**
 * Quiet inline newsletter capture (Wave 2). No popup, no fake counts. Renders
 * on the /resources hub and at the foot of each resource article.
 *
 * On a successful new signup it fires GA4 `generate_lead` (via the thin
 * `window.gtag` wrapper) and shows a done state. The honeypot `company` field
 * is visually hidden + aria-hidden; a bot that fills it gets a silent success.
 */
export function SubscribeModule({
  locale,
  source = "resources",
}: {
  locale: string;
  source?: string;
}) {
  const copy = getCopy(locale);
  const emailId = useId();
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [status, setStatus] = useState<SubscribeStatus | null>(null);
  const [pending, startTransition] = useTransition();

  const done = status === "ok" || status === "already";

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (pending || done) return;
    startTransition(async () => {
      const result = await subscribeToNewsletter({ email, source, locale, company });
      setStatus(result.status);
      if (result.status === "ok") {
        trackEvent("generate_lead", { method: "newsletter" });
      }
    });
  }

  return (
    <MarketingSection style={{ background: "var(--plt-bg)" }}>
      <MarketingContainer>
        <div
          className="rounded-[22px] p-6 sm:p-8"
          style={{
            background: "var(--plt-bg-elevated)",
            border: "1px solid var(--plt-hairline)",
          }}
        >
          <h2
            className="text-[1.375rem] font-semibold leading-snug sm:text-[1.5rem]"
            style={{ color: "var(--plt-ink-strong)" }}
          >
            {copy.heading}
          </h2>
          <p
            className="mt-2 max-w-xl text-[0.9375rem] leading-[1.6]"
            style={{ color: "var(--plt-muted)" }}
          >
            {copy.promise}
          </p>

          {done ? (
            <p
              className="mt-5 text-[0.9375rem] font-medium leading-[1.6]"
              style={{ color: "var(--plt-ink-strong)" }}
              role="status"
            >
              {messageFor(copy, status)}
            </p>
          ) : (
            <form onSubmit={onSubmit} className="mt-5" aria-label={copy.aria} noValidate>
              <div className="flex flex-col gap-3 sm:flex-row">
                <label htmlFor={emailId} className="sr-only">
                  {copy.aria}
                </label>
                <input
                  id={emailId}
                  type="email"
                  name="email"
                  autoComplete="email"
                  inputMode="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder={copy.placeholder}
                  disabled={pending}
                  className="min-h-12 flex-1 rounded-full px-5 text-[0.9375rem] leading-none outline-none transition-shadow focus:ring-2"
                  style={{
                    background: "var(--plt-bg)",
                    border: "1px solid var(--plt-hairline)",
                    color: "var(--plt-ink-strong)",
                  }}
                />
                {/* Honeypot — hidden from real users, catches naive bots. */}
                <div aria-hidden className="absolute left-[-9999px] top-[-9999px] h-0 w-0 overflow-hidden">
                  <label htmlFor={`${emailId}-company`}>Company</label>
                  <input
                    id={`${emailId}-company`}
                    type="text"
                    name="company"
                    tabIndex={-1}
                    autoComplete="off"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                  />
                </div>
                <button
                  type="submit"
                  disabled={pending}
                  className="inline-flex min-h-12 items-center justify-center rounded-full px-6 text-[0.9375rem] font-medium leading-none transition-[background,transform] duration-200 hover:-translate-y-[1px] disabled:cursor-not-allowed disabled:opacity-70"
                  style={{ background: "var(--plt-forest)", color: "var(--plt-on-inverse)" }}
                >
                  {pending ? copy.sending : copy.cta}
                </button>
              </div>
              {status && !done ? (
                <p
                  className="mt-3 text-[0.875rem] leading-[1.5]"
                  style={{ color: "var(--plt-muted)" }}
                  role="alert"
                >
                  {messageFor(copy, status)}
                </p>
              ) : null}
            </form>
          )}
        </div>
      </MarketingContainer>
    </MarketingSection>
  );
}
