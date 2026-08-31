/**
 * tulala-agent-invite.tsx — the entry point to the conversational intake.
 *
 * Sits ABOVE the classic form rather than replacing it. Two reasons, and the
 * second is the load-bearing one:
 *
 *   - The form converts today. Removing a working funnel to launch a new one is
 *     a bet nobody needs to take when both can run.
 *   - The Agent needs a model, a KV limiter and a flag to be on. When any of
 *     those is missing this component is simply not rendered, and the page still
 *     works. A hard swap would make an AI outage a signup outage.
 *
 * Own file so the 1500-line page does not grow, per the size ratchet.
 */

import Link from "next/link";

import { withLocaleHref } from "@/i18n/pathnames";

export function TulalaAgentInvite({
  locale,
}: {
  locale: "en" | "es";
}) {
  const copy =
    locale === "es"
      ? {
          eyebrow: "Nuevo",
          title: "Deja que el Agente Tulala lo prepare por ti",
          body: "Cuéntale a qué te dedicas, en tus palabras. Te hace unas preguntas, entiende cómo trabajas y te dice qué necesitas y por qué. Puedes hablar o escribir.",
          cta: "Hablar con el Agente",
          aside: "Dos minutos. Sin cuenta, sin tarjeta.",
          or: "o rellena el formulario corto",
        }
      : {
          eyebrow: "New",
          title: "Let the Tulala Agent set this up for you",
          body: "Tell it what you do, in your own words. It asks a few questions, works out how you actually operate, and tells you what you need and why. Talk or type.",
          cta: "Talk to the Agent",
          aside: "Two minutes. No account, no card.",
          or: "or fill in the short form",
        };

  return (
    <div
      className="mb-8 overflow-hidden rounded-2xl"
      style={{
        background: "var(--plt-bg-raised)",
        border: "1px solid color-mix(in srgb, var(--plt-forest) 26%, transparent)",
      }}
    >
      <div className="p-5 sm:p-6">
        <p
          className="plt-mono mb-2.5 text-[0.625rem] uppercase tracking-[0.14em]"
          style={{ color: "var(--plt-forest)" }}
        >
          {copy.eyebrow}
        </p>
        <h3
          className="plt-display mb-2 text-[1.25rem] leading-[1.25] sm:text-[1.4375rem]"
          style={{ color: "var(--plt-ink)", letterSpacing: "-0.02em", fontWeight: 600 }}
        >
          {copy.title}
        </h3>
        <p
          className="mb-5 text-[0.9375rem] leading-[1.6]"
          style={{ color: "var(--plt-muted)" }}
        >
          {copy.body}
        </p>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link
            href={withLocaleHref("/get-started/agent", locale)}
            className="inline-flex h-11 items-center gap-2 rounded-full px-5 text-[0.875rem] font-semibold transition-opacity hover:opacity-90"
            style={{ background: "var(--plt-forest)", color: "#fff" }}
          >
            <ChatGlyph />
            {copy.cta}
          </Link>
          <span className="text-[0.8125rem]" style={{ color: "var(--plt-muted-soft)" }}>
            {copy.aside}
          </span>
        </div>
      </div>
      <div
        className="px-5 py-2.5 text-center text-[0.75rem] sm:px-6"
        style={{
          borderTop: "1px solid var(--plt-hairline)",
          color: "var(--plt-muted-soft)",
        }}
      >
        {copy.or}
      </div>
    </div>
  );
}

function ChatGlyph() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
