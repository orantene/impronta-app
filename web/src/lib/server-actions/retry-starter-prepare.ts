"use server";

/**
 * TUL-441 — load + retry starter prepare for a workspace whose provision
 * left `site_compose.outcome === "failed"` or `starter_prepare.status ===
 * "failed"`. Re-runs compose (or seed) only — never full workspace provision.
 */

import { revalidatePath } from "next/cache";

import { assertNotImpersonating } from "@/lib/impersonation/readonly-guard";
import { isVisualDirection, LOOK_BY_DIRECTION } from "@/lib/onboarding/module-state";
import {
  agencyNeedsStarterPrepareRetry,
  clearStarterPrepareFlag,
  readAgencySettings,
} from "@/lib/onboarding/starter-prepare.server";
import { needsStarterPrepareRetry, planStarterPrepareRetry } from "@/lib/onboarding/starter-prepare";
import { requireWorkspaceStaffAction } from "@/lib/saas/admin-scope";
import { getRequestLocale } from "@/i18n/request-locale";
import { logServerError } from "@/lib/server/safe-error";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { composeSiteFromBrief } from "@/lib/site-admin/builder-core/site-templates/compose-site-from-brief.server";
import { onboardStarterContent } from "@/lib/site-admin/server/onboard-starter-content";
import { loadBriefForTenant } from "@/lib/tulala/brief-store-tenant.server";

export type LoadStarterPrepareStateResult =
  | { ok: true; needsRetry: boolean }
  | { ok: false; error: string };

export type RetryStarterPrepareResult =
  | { ok: true }
  | { ok: false; error: string };

export async function loadStarterPrepareStateAction(): Promise<LoadStarterPrepareStateResult> {
  try {
    const auth = await requireWorkspaceStaffAction();
    if (!auth.ok) return { ok: false, error: auth.error };
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Service unavailable." };
    const needsRetry = await agencyNeedsStarterPrepareRetry(admin, auth.tenantId);
    return { ok: true, needsRetry };
  } catch (err) {
    logServerError("starter-prepare.load", err);
    return { ok: false, error: "Could not load site prepare state." };
  }
}

export async function retryStarterPrepareAction(): Promise<RetryStarterPrepareResult> {
  const readOnly = await assertNotImpersonating();
  if (!readOnly.ok) return readOnly;
  try {
    const auth = await requireWorkspaceStaffAction();
    if (!auth.ok) return { ok: false, error: auth.error };
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Service unavailable." };

    const settings = await readAgencySettings(admin, auth.tenantId);
    if (settings == null) return { ok: false, error: "Could not load workspace settings." };

    const brief = await loadBriefForTenant({ tenantId: auth.tenantId });
    const plan = planStarterPrepareRetry({
      settings,
      briefId: brief?.id ?? null,
    });

    if (plan.kind === "noop") {
      return { ok: true };
    }

    const locale = (await getRequestLocale()) === "en" ? "en" : "es";

    if (plan.kind === "compose") {
      const direction = brief?.facts.find(
        (f) => f.factKey === "brand.style" && f.status !== "rejected",
      )?.value;
      const composed = await composeSiteFromBrief({
        tenantId: auth.tenantId,
        briefId: plan.briefId,
        lookId: isVisualDirection(direction) ? LOOK_BY_DIRECTION[direction] : null,
        locale,
        actorProfileId: auth.user.id,
        publish: true,
        overwrite: true,
      });
      if (composed.outcome === "failed") {
        logServerError(
          "starter-prepare.retry.compose",
          new Error(composed.notes.join(" | ") || "compose failed"),
        );
        return { ok: false, error: "retry_failed" };
      }
      await clearStarterPrepareFlag(admin, auth.tenantId);
      revalidatePath(`/${auth.tenantSlug}/admin/website`);
      return { ok: true };
    }

    // No brief: re-run seed path only (idempotent).
    const starter = await onboardStarterContent(admin, {
      tenantId: auth.tenantId,
      actorProfileId: auth.user.id,
      seedFreeStarter: true,
      locale,
    });
    if (!starter.ok) {
      return { ok: false, error: "retry_failed" };
    }

    // Seed may have skipped compose when pages already exist; if a brief
    // appeared mid-flight or compose stamp is still failed, compose now.
    const after = await readAgencySettings(admin, auth.tenantId);
    if (after && needsStarterPrepareRetry(after)) {
      const briefAgain = await loadBriefForTenant({ tenantId: auth.tenantId });
      if (briefAgain) {
        const direction = briefAgain.facts.find(
          (f) => f.factKey === "brand.style" && f.status !== "rejected",
        )?.value;
        const composed = await composeSiteFromBrief({
          tenantId: auth.tenantId,
          briefId: briefAgain.id,
          lookId: isVisualDirection(direction) ? LOOK_BY_DIRECTION[direction] : null,
          locale,
          actorProfileId: auth.user.id,
          publish: true,
          overwrite: true,
        });
        if (composed.outcome === "failed") {
          return { ok: false, error: "retry_failed" };
        }
      } else {
        return { ok: false, error: "retry_failed" };
      }
    }

    await clearStarterPrepareFlag(admin, auth.tenantId);
    revalidatePath(`/${auth.tenantSlug}/admin/website`);
    return { ok: true };
  } catch (err) {
    logServerError("starter-prepare.retry", err);
    return { ok: false, error: "retry_failed" };
  }
}
