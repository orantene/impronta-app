/**
 * Local QA entry for Support Desk — redirects into the real `/desk` product
 * surface so agents are not trapped inside Platform Admin chrome.
 */

import { notFound, redirect } from "next/navigation";

import { isSupportDeskEnabled } from "@/lib/support/desk-flag";
import { SUPPORT_DESK_HOST_PATH } from "@/lib/support/desk/desk-url";

export const dynamic = "force-dynamic";

export default async function SupportDeskLocalQaPage({
  searchParams,
}: {
  searchParams: Promise<{ ticket?: string; view?: string }>;
}) {
  if (!isSupportDeskEnabled()) notFound();

  const sp = await searchParams;
  const params = new URLSearchParams();
  if (sp.ticket) params.set("ticket", sp.ticket);
  if (sp.view) params.set("view", sp.view);
  const qs = params.toString();
  redirect(qs ? `${SUPPORT_DESK_HOST_PATH}?${qs}` : SUPPORT_DESK_HOST_PATH);
}
