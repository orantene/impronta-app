/**
 * Helper for e2e/onboarding/run5-evidence.spec.ts (TUL-108, TUL-136, TUL-67).
 *
 * Renders the real `booking.day_of_reminder.*` catalog entries (subject + HTML) with the same code the email
 * channel uses, and prints ONE JSON document on stdout. No network, no database, no secrets: it is run by the
 * spec as
 *   NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' tsx e2e/onboarding/_run5-render.mts
 * (the same hook `npm run test:notifications` uses so `server-only` modules load outside Next).
 */
import React from "react";

import { renderEmailHtml } from "../../src/lib/email/render";
import { findCatalogEntryById } from "../../src/lib/notifications/catalog";

type Locale = "es" | "en";

const TENANT_BRAND = (locale: Locale) => ({
  wordmark: "RUN5 STUDIO",
  accountName: "Run5 Studio",
  footerDomain: "run5-studio.example",
  homeHref: "https://run5-studio.example",
  logoUrl: "https://cdn.example/run5/logo.png",
  accent: "#d21a28",
  accentOn: "#ffffff",
  locale,
});

const PLATFORM_BRAND = (locale: Locale) => ({
  wordmark: "TULALA",
  accountName: "Tulala",
  footerDomain: "tulala.digital",
  homeHref: "https://tulala.digital",
  locale,
});

function recipient(role: "client" | "talent", locale: Locale) {
  return {
    userId: "run5-user",
    email: "run5@impronta.test",
    displayName: "Invitada QA",
    locale,
    isPlatformAdmin: false,
    role,
    dedupeId: "run5-user",
  };
}

const TALENT_SITE_PAYLOAD = {
  talentBookingId: "run5-talent-booking",
  appointmentStartsAt: "2026-10-09T14:45:00Z",
  appointmentTimezone: "America/Cancun",
  appointmentTitle: "Limpieza profunda",
  appointmentLocation: "Centro",
};
const AGENCY_EVENT_PAYLOAD = { eventDate: "2026-10-09", eventLocation: "Cancun" };

async function variant(name: string, entryId: string, role: "client" | "talent", locale: Locale, payload: Record<string, unknown>, brand: Record<string, unknown>) {
  const entry = findCatalogEntryById(entryId);
  if (!entry?.email) return { name, error: `catalog entry ${entryId} has no email config` };
  const event = { type: "booking.day_of_reminder", tenantId: "run5-tenant", inquiryId: "run5-inquiry", eventId: `run5:${name}`, payload };
  const rcpt = recipient(role, locale);
  const args = { event, recipient: rcpt, brand, unsubscribeUrl: "https://example.com/unsubscribe" } as never;
  const subjectFn = entry.email.subject as unknown as (e: unknown, a?: unknown) => string;
  const subject = typeof entry.email.subject === "function" ? subjectFn(event, args) : String(entry.email.subject);
  const html = await renderEmailHtml(entry.email.render(args) as React.ReactElement);
  return { name, entryId, locale, subject, html };
}

async function main() {
  const out = [];
  for (const locale of ["es", "en"] as Locale[]) {
    out.push(await variant(`client-talent-site-${locale}`, "booking.day_of_reminder.client", "client", locale, TALENT_SITE_PAYLOAD, TENANT_BRAND(locale)));
    out.push(await variant(`talent-talent-site-${locale}`, "booking.day_of_reminder.talent", "talent", locale, TALENT_SITE_PAYLOAD, TENANT_BRAND(locale)));
  }
  out.push(await variant("client-agency-event-en", "booking.day_of_reminder.client", "client", "en", AGENCY_EVENT_PAYLOAD, TENANT_BRAND("en")));
  out.push(await variant("client-platform-brand-es", "booking.day_of_reminder.client", "client", "es", TALENT_SITE_PAYLOAD, PLATFORM_BRAND("es")));
  process.stdout.write(JSON.stringify({ variants: out }));
}

main().catch((err) => {
  process.stdout.write(JSON.stringify({ fatal: String((err as Error).message ?? err) }));
  process.exit(0);
});
