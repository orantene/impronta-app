// Phase 3.10 — /client redirect to /client/today
import { redirect } from "next/navigation";

import { legacyClientEntryRedirectFor } from "@/lib/client-account/entry-redirect.server";

type PageParams = Promise<{ tenantSlug: string }>;

export default async function ClientIndexPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  // TUL-64: on the agency's own host, with the flag on, the bare client root is /account.
  // Deep links (/today, /inquiries/<id>, /shortlists, ...) are separate routes and unchanged.
  if ((await legacyClientEntryRedirectFor(tenantSlug)) === "account") redirect("/account");
  redirect(`/${tenantSlug}/client/today`);
}
