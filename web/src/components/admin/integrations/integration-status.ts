import { COLORS } from "@/components/admin/shell/internal/state";
import type { IntegrationView } from "@/app/(workspace)/[tenantSlug]/admin/settings/integration-actions";

/**
 * Resolve the single status pill shown on an integration card / drawer.
 *
 * The states the hub surfaces:
 *   - Connected            → row status 'connected'
 *   - Using platform default → inherit mode on an inheritable integration ('inherited')
 *   - Action needed        → not configured (and not inheriting a default)
 *   - Error                → last test/verify failed ('error')
 *   - Locked               → entitlement-gated (no v1 entry uses this, but the
 *                            hub renders it generically so a future plan-gate
 *                            just sets `locked`).
 */
export type IntegrationStatusKind =
  | "connected"
  | "inherited"
  | "action_needed"
  | "error"
  | "locked";

export type IntegrationStatusVisual = {
  kind: IntegrationStatusKind;
  label: string;
  fg: string;
  bg: string;
  dot: string;
};

export function resolveIntegrationStatus(
  integration: Pick<IntegrationView, "status" | "credentialMode" | "inheritable">,
  opts?: { locked?: boolean },
): IntegrationStatusVisual {
  if (opts?.locked) {
    return {
      kind: "locked",
      label: "Upgrade to unlock",
      fg: COLORS.inkDim,
      bg: "rgba(24,24,27,0.05)",
      dot: COLORS.inkDim,
    };
  }

  if (integration.status === "error") {
    return {
      kind: "error",
      label: "Needs attention",
      fg: COLORS.criticalDeep,
      bg: COLORS.criticalSoft,
      dot: COLORS.critical,
    };
  }

  if (integration.status === "connected") {
    return {
      kind: "connected",
      label: "Connected",
      fg: COLORS.successDeep,
      bg: COLORS.successSoft,
      dot: COLORS.success,
    };
  }

  // Inherit mode on an inheritable integration → using the platform default.
  if (
    integration.inheritable &&
    (integration.credentialMode === "inherit" || integration.status === "inherited")
  ) {
    return {
      kind: "inherited",
      label: "Using platform default",
      fg: COLORS.indigoDeep,
      bg: COLORS.indigoSoft,
      dot: COLORS.indigo,
    };
  }

  return {
    kind: "action_needed",
    label: "Action needed",
    fg: COLORS.coralDeep,
    bg: COLORS.coralSoft,
    dot: COLORS.coral,
  };
}
