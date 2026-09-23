/**
 * Phase 1 — the talent free-site LOCK BROADCAST.
 *
 * When the builder refuses a structural edit because the talent's plan does
 * not include `personalSiteSections`, the refusal still flows back through
 * `reportMutationError` exactly as it did before. This additionally announces
 * it on `window`, so the Web Office upgrade dialog (Phase 4), a rail card, or
 * a Playwright journey can react to a lock hit without reaching into builder
 * internals or threading a handler through four different mount points.
 *
 * A window CustomEvent rather than a prop: `EditProvider` is mounted by the
 * homepage, workspace, Lab and talent surfaces, and only the talent ones would
 * ever pass a handler. It lives in its own module so `edit-context.tsx` (a file
 * on the size ratchet) grows by a call, not by a closure.
 */
import type { BuilderLockedUpsell } from "@/lib/site-admin/builder-core/config";
import type { BuilderNodeOperationKind } from "@/lib/site-admin/builder-node";

/** The event name a listener subscribes to. */
export const TALENT_LOCKED_OPERATION_EVENT = "talent-site:locked-operation";

/** `event.detail` for {@link TALENT_LOCKED_OPERATION_EVENT}. */
export interface TalentLockedOperationDetail {
  /** Which paid capability was hit. Today only the sections lock exists. */
  feature: "site_sections";
  operation: BuilderNodeOperationKind;
  /** The refusal copy already shown to the talent, en or es. */
  message: string;
  /** The plan that would unlock it, or null on a surface with no upsell. */
  planKey: string | null;
  /** That plan's label, e.g. "Web Office". */
  label: string | null;
}

/** Announce a plan-refused structural edit. A no-op during SSR. */
export function broadcastTalentLockedOperation(
  denial: { operation: BuilderNodeOperationKind; message: string },
  upsell: BuilderLockedUpsell | null,
): void {
  if (typeof window === "undefined") return;
  const detail: TalentLockedOperationDetail = {
    feature: "site_sections",
    operation: denial.operation,
    message: denial.message,
    planKey: upsell?.planKey ?? null,
    label: upsell?.label ?? null,
  };
  window.dispatchEvent(new CustomEvent(TALENT_LOCKED_OPERATION_EVENT, { detail }));
}
