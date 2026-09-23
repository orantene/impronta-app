import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getRequestLocale } from "@/i18n/request-locale";
import { logServerError } from "@/lib/server/safe-error";

import { subdomainNamespaceCopy, type SubdomainNamespaceCopy } from "./subdomain-namespace-copy";

/**
 * The application-side read of `platform_subdomain_label_taken` — the one
 * predicate that knows whether a subdomain label is free across agency slugs,
 * agency subdomain hosts, unexpired signup reservations, talent site slugs and
 * the reserved platform words.
 *
 * ADVISORY, NOT AUTHORITATIVE. The database triggers added in
 * `20261231280000_talent_site_subdomains.sql` are what actually guarantee the
 * namespace; this call exists so a person gets "that name is taken" in a form
 * instead of a raw unique violation after a multi-step flow. That is why the
 * return type is tri-state:
 *
 *   true  — taken, tell the person
 *   false — free as far as the database knows
 *   null  — could not be determined (RPC missing on an un-migrated database, or
 *           a transient error). Callers CONTINUE on null and let the trigger be
 *           the backstop, because failing closed here would block every signup
 *           on any database where this migration has not landed yet.
 */
export async function isPlatformSubdomainLabelTaken(
  label: string,
  opts: {
    excludeTalentProfileId?: string | null;
    excludeTenantId?: string | null;
  } = {},
): Promise<boolean | null> {
  const candidate = (label ?? "").trim().toLowerCase();
  if (!candidate) return null;

  const admin = createServiceRoleClient();
  if (!admin) return null;

  try {
    const { data, error } = await admin.rpc("platform_subdomain_label_taken", {
      p_label: candidate,
      p_exclude_talent_profile_id: opts.excludeTalentProfileId ?? null,
      p_exclude_tenant_id: opts.excludeTenantId ?? null,
    });
    if (error) {
      // An un-migrated database has no such function. That is not an incident;
      // every other database error is, so it is logged and still non-fatal.
      const code = (error as { code?: string }).code;
      if (code !== "42883" && code !== "PGRST202") {
        logServerError("platformSubdomainNamespace.rpc", error);
      }
      return null;
    }
    return data === true;
  } catch (err) {
    logServerError("platformSubdomainNamespace.rpc", err);
    return null;
  }
}

/**
 * The namespace copy for the CURRENT request's locale, degrading to English when
 * the locale cannot be resolved (a server action outside a localized request).
 */
export async function requestSubdomainNamespaceCopy(): Promise<SubdomainNamespaceCopy> {
  try {
    return subdomainNamespaceCopy(await getRequestLocale());
  } catch {
    return subdomainNamespaceCopy("en");
  }
}
