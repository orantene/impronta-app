/**
 * agent-chrome.tsx — the frame shared by the conversation and the review screen.
 *
 * Extracted when the review screen was added, because the two are one flow and a
 * second hand-rolled header would have drifted from the first within a week. The
 * visitor should not be able to tell that they crossed a route boundary between
 * being understood and being shown what we understood.
 *
 * The escape hatch in the top right is deliberate and always present. Someone
 * who does not want to talk to an assistant must be one click from the form that
 * has always worked, on every screen, with no explanation demanded of them.
 */

import Link from "next/link";
import type { ReactNode } from "react";

import { pickLocale } from "@/lib/i18n/pick-locale";

export function TulalaAgentChrome(props: {
  locale: "en" | "es";
  children: ReactNode;
  /** Overrides the default "use the short form" escape hatch. */
  escapeHatch?: { href: string; label: string };
}) {
  const escape =
    props.escapeHatch ??
    {
      href: "/get-started",
      label: pickLocale(props.locale, {
        en: "Use the short form",
        es: "Usar el formulario",
      }),
    };

  return (
    <div
      className="site-theme-platform flex min-h-screen flex-col"
      data-platform-surface="marketing"
      style={{ background: "var(--plt-bg)" }}
    >
      <header
        className="sticky top-0 z-30 backdrop-blur-xl"
        style={{
          background: "color-mix(in srgb, var(--plt-bg) 88%, transparent)",
          borderBottom: "1px solid var(--plt-hairline)",
        }}
      >
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-5 lg:px-8">
          <Link
            href="/"
            aria-label="Tulala home"
            className="inline-flex items-baseline leading-none"
            style={{ color: "var(--plt-ink)" }}
          >
            <span
              className="plt-display"
              style={{ fontWeight: 700, letterSpacing: "-0.045em", fontSize: "1.375rem" }}
            >
              tulala
            </span>
            <span style={{ color: "var(--plt-forest)", fontSize: "1.375rem", fontWeight: 700 }}>
              .
            </span>
          </Link>
          <Link
            href={escape.href}
            className="text-[0.8125rem] font-medium leading-none transition-colors hover:text-[var(--plt-ink)]"
            style={{ color: "var(--plt-muted)" }}
          >
            {escape.label}
          </Link>
        </div>
      </header>

      <main className="flex-1">{props.children}</main>
    </div>
  );
}
