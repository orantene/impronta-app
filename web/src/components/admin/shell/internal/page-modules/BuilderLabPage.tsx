"use client";

/**
 * BuilderLabPage (WS5) — the platform page-module the PlatformRouter renders for
 * `?platformPage=builder-lab`.
 *
 * super_admin-only (the router re-gates on `isPlatformAdmin` before rendering
 * this). It threads the active platform tenant id from the admin-shell bridge
 * into the `BuilderLabShell`, which owns the Talent Lab / Workspace Lab /
 * Templates tabs + the ephemeral editor mount.
 *
 * Presentational chrome (header / empty state) lives in
 * `@/components/builder-lab/builder-lab-intro` so this file — which sits under
 * the inline-style-frozen `components/admin/shell` tree — carries no inline
 * styles.
 *
 * Reached via:
 *   /platform/admin?platformPage=builder-lab
 */

import { useAdminShell } from "../state";
import { BuilderLabShell } from "@/components/builder-lab/builder-lab-shell";
import {
  BuilderLabHeader,
  BuilderLabNoTenant,
} from "@/components/builder-lab/builder-lab-intro";

export function BuilderLabPage() {
  const { bridgeTenantIdentity, locale } = useAdminShell();
  const tenantId = bridgeTenantIdentity?.tenantId ?? null;
  const workspacePlan = bridgeTenantIdentity?.planTier ?? null;

  return (
    <>
      <BuilderLabHeader />
      {tenantId ? (
        <BuilderLabShell
          tenantId={tenantId}
          workspacePlan={workspacePlan}
          locale={locale}
        />
      ) : (
        <BuilderLabNoTenant />
      )}
    </>
  );
}
