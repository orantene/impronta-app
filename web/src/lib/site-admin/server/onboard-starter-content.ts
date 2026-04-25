/**
 * New-tenant starter content seeding.
 *
 * When a new agency is provisioned (manually via SQL today, or via a future
 * onboarding flow), we want them to land on a working storefront — not a 404.
 * This helper ensures the canonical homepage row exists for the tenant.
 *
 * It is idempotent: re-calling for a tenant that already has a homepage is a
 * no-op (delegates to `ensureHomepageRow`, which is itself idempotent).
 *
 * Wiring (TODO): call from the agency-provisioning code path once that path
 * exists. Today, agencies are inserted via SQL — run this once after, e.g.:
 *
 *   import { onboardStarterContent } from "@/lib/site-admin/server/onboard-starter-content";
 *   await onboardStarterContent({ tenantId: "<new-agency-uuid>" });
 *
 * The starter homepage is created in DRAFT state. The tenant operator
 * publishes it from `/admin/site-settings/structure` once they've added their
 * own sections. We intentionally do NOT auto-publish — a draft homepage is
 * better than a half-empty published one for SEO.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureHomepageRow } from "./homepage";

export interface OnboardStarterContentInput {
  tenantId: string;
  /**
   * Locale to seed the homepage in. Defaults to "en". The tenant can add
   * additional locales later from `/admin/site-settings/identity`.
   */
  locale?: string;
}

export interface OnboardStarterContentResult {
  ok: boolean;
  homepagePageId?: string;
  error?: string;
}

/**
 * Seed the minimum-viable storefront for a brand-new tenant.
 *
 * Currently this is just the homepage row (draft, no sections). As we add
 * starter templates (about page, contact page, default nav) those go here too.
 */
export async function onboardStarterContent(
  client: SupabaseClient,
  input: OnboardStarterContentInput,
): Promise<OnboardStarterContentResult> {
  const locale = (input.locale ?? "en") as Parameters<typeof ensureHomepageRow>[1]["locale"];

  const ensured = await ensureHomepageRow(client, {
    tenantId: input.tenantId,
    locale,
  });

  if (!ensured.ok) {
    return { ok: false, error: ensured.code ?? "ENSURE_FAILED" };
  }

  return { ok: true, homepagePageId: ensured.data.id };
}
