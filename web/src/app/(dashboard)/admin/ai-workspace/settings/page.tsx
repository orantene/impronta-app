import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * Phase 17 — AI workspace consolidation.
 *
 * The standalone /admin/ai-workspace/settings page was a duplicate of the
 * AI workspace index — same data, same forms, just laid out vertically
 * instead of as cards-with-drawers. The forms are now rendered inside
 * drawers off /admin/ai-workspace itself, so this route redirects to
 * keep inbound links alive.
 */
export default function AiWorkspaceSettingsPage() {
  redirect("/admin/ai-workspace");
}
