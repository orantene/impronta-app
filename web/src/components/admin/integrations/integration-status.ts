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
  /** English fallback, kept for non-UI consumers (tests, logs). */
  label: string;
  /**
   * Catalog key mirroring `label`. This resolver is called from both server and
   * client code paths, so it stays translator-free: `IntegrationStatusPill`
   * renders `t(labelKey)`.
   */
  labelKey: string;
  fg: string;
  bg: string;
  dot: string;
};

/** Root of the i18n namespace for the pill labels. */
const STATUS_NS = "dashboard.adminIntegrationsCatalog.status";

export function resolveIntegrationStatus(
  integration: Pick<IntegrationView, "status" | "credentialMode" | "inheritable">,
  opts?: { locked?: boolean },
): IntegrationStatusVisual {
  if (opts?.locked) {
    return {
      kind: "locked",
      label: "Upgrade to unlock",
      labelKey: `${STATUS_NS}.locked`,
      fg: COLORS.inkDim,
      bg: "rgba(24,24,27,0.05)",
      dot: COLORS.inkDim,
    };
  }

  if (integration.status === "error") {
    return {
      kind: "error",
      label: "Needs attention",
      labelKey: `${STATUS_NS}.error`,
      fg: COLORS.criticalDeep,
      bg: COLORS.criticalSoft,
      dot: COLORS.critical,
    };
  }

  if (integration.status === "connected") {
    return {
      kind: "connected",
      label: "Connected",
      labelKey: `${STATUS_NS}.connected`,
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
      labelKey: `${STATUS_NS}.inherited`,
      fg: COLORS.indigoDeep,
      bg: COLORS.indigoSoft,
      dot: COLORS.indigo,
    };
  }

  return {
    kind: "action_needed",
    label: "Action needed",
    labelKey: `${STATUS_NS}.actionNeeded`,
    fg: COLORS.coralDeep,
    bg: COLORS.coralSoft,
    dot: COLORS.coral,
  };
}
