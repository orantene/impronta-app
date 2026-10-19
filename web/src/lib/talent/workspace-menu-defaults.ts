/**
 * The Catalog loader's per-workspace defaults: the primary language the
 * editor edits in, the business family (which create card to preselect) and
 * the country (which currency a new item starts in).
 *
 * B5 (TUL-1271 #12): `loadWorkspaceMenuForEditor` read these one after the
 * other, AFTER the rows and their children: the language, then the agency
 * settings and the business identity, two of those three reads on the same
 * `agency_business_identity` row. None of them depends on the rows. This
 * module reads them in ONE parallel stage (identity once for both columns,
 * agencies beside it) that the loader starts before the row reads and awaits
 * with the children.
 *
 * It never rejects: a failed read logs and falls back to the neutral
 * defaults, exactly as the inline reads did, so a promise started early can
 * never become an unhandled rejection on an early return.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { logServerError } from "@/lib/server/safe-error";
import { normalizeWorkspaceLocale } from "@/lib/talent/workspace-primary-locale";

export type WorkspaceMenuDefaults = {
  /** The workspace's primary language; "en" when unset or unreadable. */
  primaryLocale: string;
  /** `agencies.settings` for the business family; null when unreadable. */
  agencySettings: unknown;
  /** The business identity's country; null when unset or unreadable. */
  addressCountry: string | null;
};

export async function loadWorkspaceMenuDefaults(db: SupabaseClient, tenantId: string): Promise<WorkspaceMenuDefaults> {
  try {
    const [{ data: identity, error: identityErr }, { data: agency, error: agencyErr }] = await Promise.all([
      db
        .from("agency_business_identity")
        .select("default_locale, address_country")
        .eq("tenant_id", tenantId)
        .maybeSingle<{ default_locale: string | null; address_country: string | null }>(),
      db.from("agencies").select("settings").eq("id", tenantId).maybeSingle<{ settings: unknown }>(),
    ]);
    if (identityErr) logServerError("menu.offerings.defaults.identity", identityErr);
    if (agencyErr) logServerError("menu.offerings.defaults.agency", agencyErr);
    return {
      primaryLocale: normalizeWorkspaceLocale(identityErr ? null : identity?.default_locale),
      agencySettings: agencyErr ? null : (agency?.settings ?? null),
      addressCountry: identityErr ? null : (identity?.address_country ?? null),
    };
  } catch (err) {
    logServerError("menu.offerings.defaults", err);
    return { primaryLocale: normalizeWorkspaceLocale(null), agencySettings: null, addressCountry: null };
  }
}
