/**
 * Legacy client inquiry-detail route — consolidated into the canonical
 * client Messages surface (audit #11). The interactive thread + offer /
 * lineup / details / files all live in ClientMessagesShell now, so this
 * route is a thin redirect that keeps existing deep links working:
 * bookmarks, the "View inquiry" / "View offer" links in notification +
 * email templates (which point at /client/inquiries/<id>[?tab=offer]),
 * and any in-flight links still pointing here.
 *
 *   /[tenantSlug]/client/inquiries/[id][?tab=…]
 *     → /[tenantSlug]/client/messages?inquiry=<id>[&tab=…]
 *
 * The old surface (ClientThreadAdapter → ReservationThread + the forked
 * client chat-card renderer) is deleted — see PR for audit #11.
 */

import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string; id: string }>;
type SearchParams = Promise<{ tab?: string }>;

// Mirrors the keeper's tab allow-list (client/messages/page.tsx). An
// unknown ?tab= is dropped so we never forward a bogus tab.
const ALLOWED_TABS = new Set(["chat", "lineup", "offer", "details", "files"]);

export default async function ClientInquiryThreadRedirect({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: SearchParams;
}) {
  const { tenantSlug, id } = await params;
  const sp = await searchParams;

  const qs = new URLSearchParams({ inquiry: id });
  if (sp.tab && ALLOWED_TABS.has(sp.tab)) qs.set("tab", sp.tab);

  redirect(`/${tenantSlug}/client/messages?${qs.toString()}`);
}
