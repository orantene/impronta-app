import "server-only";

/**
 * Tenant Registration Engine — settings reader.
 *
 * One row per tenant in `tenant_registration_settings` governs the public-site
 * "Open for registration" policy. This is the single read path shared by:
 *   - the workspace admin Registration panel (S1),
 *   - the join-policy resolver applied at registration time (S2),
 *   - the storefront auto-CTA + tenant modal entry-path logic (S3/S4).
 *
 * Reads run under the service role so the resolver and storefront loaders work
 * regardless of session (public visitors, cron, fire-and-forget). Returns
 * sane closed/disabled defaults when no row exists yet, so callers never have
 * to special-case "not configured".
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import type { RegistrationMode } from "@/lib/access/registration-modes";

export type RosterVisibility = "roster_only" | "site_visible";

export type RegistrationSettings = {
  tenantId: string;
  enabled: boolean;
  mode: RegistrationMode;
  defaultRosterVisibility: RosterVisibility;
  ctaLabel: string;
};

export function defaultRegistrationSettings(tenantId: string): RegistrationSettings {
  return {
    tenantId,
    enabled: false,
    mode: "closed",
    defaultRosterVisibility: "roster_only",
    ctaLabel: "Join the team",
  };
}

function coerceMode(value: unknown): RegistrationMode {
  return value === "open" || value === "approval" || value === "exclusive"
    ? value
    : "closed";
}

function coerceVisibility(value: unknown): RosterVisibility {
  return value === "site_visible" ? "site_visible" : "roster_only";
}

/**
 * Load a tenant's registration settings, or closed/disabled defaults if the
 * row is absent or unreadable. Never throws.
 */
export async function loadRegistrationSettings(
  tenantId: string,
): Promise<RegistrationSettings> {
  const admin = createServiceRoleClient();
  if (!admin) return defaultRegistrationSettings(tenantId);

  const { data, error } = await admin
    .from("tenant_registration_settings")
    .select("tenant_id, enabled, mode, default_roster_visibility, cta_label")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    logServerError("registration-settings/load", error);
    return defaultRegistrationSettings(tenantId);
  }
  if (!data) return defaultRegistrationSettings(tenantId);

  const label = typeof data.cta_label === "string" && data.cta_label.trim()
    ? data.cta_label
    : "Join the team";

  return {
    tenantId,
    enabled: Boolean(data.enabled),
    mode: coerceMode(data.mode),
    defaultRosterVisibility: coerceVisibility(data.default_roster_visibility),
    ctaLabel: label,
  };
}

/**
 * True when the public storefront should show the join CTA / accept the
 * registration modal — enabled AND not closed.
 */
export function registrationIsLive(settings: RegistrationSettings): boolean {
  return settings.enabled && settings.mode !== "closed";
}
