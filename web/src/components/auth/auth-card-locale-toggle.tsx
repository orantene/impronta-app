"use client";

/**
 * Compact EN | ES switch at the top of the login and register cards.
 *
 * Writes a DELIBERATE `locale` cookie (and clears the `locale_auto` marker, per
 * the contract in `@/i18n/locale-cookies`) through the same writer the
 * dashboard toggles use, then reloads so the server renders the new language.
 * This is a cookie switch, not a URL switch, so `?next=` and every other query
 * param survive. It exists because the platform host hides the footer's
 * path-based toggle, leaving a Spanish speaker no way to change language here.
 */

import { setLocaleCookie } from "@/components/dashboard-locale-toggle";

const CODES = ["en", "es"] as const;

export function AuthCardLocaleToggle({
  locale,
  label,
}: {
  locale: string;
  /** Localized accessible group name. */
  label: string;
}) {
  return (
    <div className="mb-4 flex justify-end">
      <div
        className="inline-flex items-center gap-0.5 rounded-full p-0.5"
        style={{ border: "1px solid var(--plt-hairline-strong)" }}
        role="group"
        aria-label={label}
      >
        {CODES.map((code) => {
          const active = locale === code;
          return (
            <button
              key={code}
              type="button"
              onClick={() => {
                if (active) return;
                setLocaleCookie(code);
                // An explicit `/es/...` URL outranks the cookie on the server,
                // so drop the prefix; otherwise a plain reload applies it.
                const { pathname, search } = window.location;
                if (/^\/es(\/|$)/.test(pathname)) {
                  window.location.assign(`${pathname.replace(/^\/es/, "") || "/"}${search}`);
                } else {
                  window.location.reload();
                }
              }}
              className="rounded-full px-2.5 py-1 text-[0.6875rem] font-semibold uppercase tracking-[0.1em] transition-colors"
              style={
                active
                  ? { background: "var(--plt-forest)", color: "var(--plt-forest-on)" }
                  : { color: "var(--plt-muted)" }
              }
              aria-pressed={active}
            >
              {code}
            </button>
          );
        })}
      </div>
    </div>
  );
}
