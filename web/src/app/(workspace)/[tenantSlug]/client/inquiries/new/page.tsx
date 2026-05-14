// Phase B-4 (2026-05-14) — the dedicated "/client/inquiries/new" page
// is now a redirect to /client/messages?new=1. The canonical inquiry
// surface is the drawer (InquiryDrawer) inside the Messages shell.
//
// Spec: web/docs/inquiry-engine-spec-2026-05-14.md §15 — every project /
// inquiry / booking opens in the same Messages shell. New inquiries are
// drawer-only.
//
// The redirect preserves `?talent=<id>` so external links / Discover
// cards that point to /inquiries/new?talent=X still pre-attach the
// talent in the drawer.

import { redirect } from "next/navigation";

type PageParams = Promise<{ tenantSlug: string }>;
type SearchParams = Promise<{ talent?: string }>;

export default async function NewClientInquiryRedirectPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: SearchParams;
}) {
  const { tenantSlug } = await params;
  const { talent } = await searchParams;

  const target = new URL(`/${tenantSlug}/client/messages`, "http://placeholder.local");
  target.searchParams.set("new", "1");
  if (talent) target.searchParams.set("talent", talent);
  redirect(target.pathname + target.search);
}
