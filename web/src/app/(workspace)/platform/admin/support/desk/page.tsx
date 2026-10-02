/**
 * Local QA entry for Support Desk (Phase 1a).
 *
 * Production Desk UI waits on Phase 0.5 mockup OK (1b/1c). This route only
 * proves the `SUPPORT_DESK_ENABLED` gate on the app/localhost surface.
 * Dedicated host: `support.tulala.digital` (404 while flag off).
 */

import { notFound } from "next/navigation";

import { isSupportDeskEnabled } from "@/lib/support/desk-flag";

export const dynamic = "force-dynamic";

export default function SupportDeskLocalQaPage() {
  if (!isSupportDeskEnabled()) notFound();

  return (
    <main className="mx-auto max-w-xl p-8">
      <h1 className="text-lg font-medium">Support Desk</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Local QA gate is on (<code>SUPPORT_DESK_ENABLED</code>). Production Desk UI
        ships after Phase 0.5 mockup approval. Mockups:{" "}
        <code>web/design-references/support-desk/</code> on port 3099.
      </p>
    </main>
  );
}
