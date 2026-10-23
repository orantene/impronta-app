/**
 * QA bounce (history "#3982", QA-B9): "Pagar ahora" on a visit's detail page
 * built a bare `/pay/<code>` link. This page also renders on the app/hub/
 * agency host (`renderTenantAccountPage`), where `/pay` is not served at all
 * (talent-site-host-routing.ts) — a relative link there always 404s, same
 * class of bug `payLinkTarget` / `resolvePayLinkPublicUrl` already fixed for
 * the Messages "Pagar ahora" card (pay-link-target.ts).
 *
 * `loadVisitDetail` now resolves `payUrl`: an ABSOLUTE checkout URL on a host
 * that actually serves `/pay` (or the `pay.tulala.digital/link/<code>`
 * fallback). The component renders that, never a bare `/pay/${payCode}`.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext, type AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";

import { ClientAccountArea } from "@/components/client-account/ClientAccountArea";

const ROUTER: AppRouterInstance = { back() {}, forward() {}, refresh() {}, push() {}, replace() {}, prefetch() {} };

const VISIT_BASE = {
  inquiryId: "i1",
  bookingId: "11111111-1111-4111-8111-111111111111",
  service: "Haircut",
  status: "confirmed",
  startsAt: "2026-11-10T16:00:00Z",
  eventDate: "2026-11-10",
  place: null,
  amountCents: 5000,
  currency: "USD",
  paymentStatus: "unpaid",
  paidCents: 0,
  policy: { enforceable: false, insideWindow: false, deadlineIso: null, refundIfCancelled: 0 },
  offeringId: null,
  timeZone: null,
  canManage: false,
  canPay: false,
};

const renderVisit = (visit: Record<string, unknown>) =>
  renderToStaticMarkup(
    createElement(AppRouterContext.Provider, { value: ROUTER }, createElement(ClientAccountArea, {
      locale: "en", audience: "client", view: { kind: "visit", id: "00000000-0000-4000-8000-000000000001" }, talentName: "Ana", email: "c@example.com", timeZone: "UTC",
      data: { visit, visitReview: null },
    } as never)),
  );

test("Pagar ahora on a visit's detail page links to the resolved absolute checkout URL, never a bare /pay/<code>", () => {
  const html = renderVisit({ ...VISIT_BASE, payCode: "abc123xyz", payUrl: "https://casarizo.com/pay/abc123xyz" });
  assert.match(html, /href="https:\/\/casarizo\.com\/pay\/abc123xyz"/);
  assert.doesNotMatch(html, /href="\/pay\//, "a bare relative /pay/<code> 404s on the app/hub/agency host");
});

test("platform fallback origin also renders absolute, never the platform host's /pay path", () => {
  const html = renderVisit({ ...VISIT_BASE, payCode: "abc123xyz", payUrl: "https://pay.tulala.digital/link/abc123xyz" });
  assert.match(html, /href="https:\/\/pay\.tulala\.digital\/link\/abc123xyz"/);
});

test("no payUrl (no open link): no Pagar ahora button, and no fallback to a bare payCode path", () => {
  // Defends the fix itself: even if a caller still sets `payCode` without resolving
  // `payUrl` (e.g. a stale caller), the component must not fall back to `/pay/${payCode}`.
  const html = renderVisit({ ...VISIT_BASE, payCode: "abc123xyz", payUrl: null });
  assert.doesNotMatch(html, /href="\/pay\//);
  assert.doesNotMatch(html, /href="https:\/\/casarizo\.com\/pay\//);
});
