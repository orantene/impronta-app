"use client";

/**
 * use-lab-platform-defaults.ts — the two pieces of platform state the Site
 * Starter Kit tab and the Default surfaces panel BOTH need, so neither grows a
 * private copy that can disagree with the other:
 *
 *   useBuiltinStarterDrift()   — is what is PUBLISHED still what the code
 *                                designs say? (`checkBuiltinStarterDriftAction`)
 *   usePlatformDefaultPointer() — which template is the platform default for a
 *                                surface, and one writer to change it
 *                                (`savePlatformDefaultTemplatePointerAction` —
 *                                the SAME action the Default surfaces panel
 *                                uses; there is deliberately no second writer).
 *
 * Extracted into its own module rather than inlined so `catalog-starter-kit.tsx`
 * (773 lines, cap 800) does not need a raised budget.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { checkBuiltinStarterDriftAction } from "@/lib/site-admin/builder-core/templates/import-builtin-starters";
import type { BuiltinStarterDriftReport } from "@/lib/site-admin/builder-core/templates/builtin-starter-hash";
import {
  loadPlatformDefaultTemplatesAction,
  savePlatformDefaultTemplatePointerAction,
} from "@/lib/server-actions/admin-platform-default-templates";
import type { PlatformTemplateSurface } from "@/lib/platform/default-templates";

// ── Drift ────────────────────────────────────────────────────────────────────

export interface BuiltinStarterDriftState {
  report: BuiltinStarterDriftReport | null;
  loading: boolean;
  /** Re-run the check (called after a sync so the banner clears immediately). */
  refresh: () => Promise<void>;
}

export function useBuiltinStarterDrift(): BuiltinStarterDriftState {
  const [report, setReport] = useState<BuiltinStarterDriftReport | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await checkBuiltinStarterDriftAction();
      setReport(res.ok ? res.data : null);
    } catch {
      // A failed drift check must never break the tab it decorates; the banner
      // simply does not render.
      setReport(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { report, loading, refresh };
}

// ── Platform default pointer ─────────────────────────────────────────────────

export interface PlatformDefaultPointerState {
  /** The currently pointed-at template id for this surface, or null if unset. */
  pointerId: string | null;
  loading: boolean;
  /** Id whose "Set as platform default" write is in flight. */
  savingId: string | null;
  /** Last write outcome, kept on screen (no toast-and-vanish). */
  status: { ok: boolean; msg: string } | null;
  setDefault: (templateId: string, label: string) => Promise<boolean>;
  clearStatus: () => void;
}

/** Map the Starter Kit's surface toggle to the platform-default surface key. */
export function surfaceToPlatformSurface(
  surface: "talent" | "workspace",
): PlatformTemplateSurface {
  return surface === "talent" ? "talent" : "storefront";
}

export function usePlatformDefaultPointer(
  surface: PlatformTemplateSurface,
): PlatformDefaultPointerState {
  const [pointerId, setPointerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    void loadPlatformDefaultTemplatesAction(surface)
      .then((r) => {
        if (!alive) return;
        if (r.ok) {
          setPointerId(
            surface === "talent"
              ? r.pointers.talentTemplateId
              : r.pointers.storefrontTemplateId,
          );
        }
      })
      .catch(() => {})
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [surface]);

  const setDefault = useCallback(
    async (templateId: string, label: string) => {
      setSavingId(templateId);
      setStatus(null);
      try {
        const res = await savePlatformDefaultTemplatePointerAction({
          surface,
          templateId,
        });
        if (!res.ok) {
          setStatus({ ok: false, msg: `Could not set the default: ${res.error}` });
          return false;
        }
        setPointerId(templateId);
        setStatus({
          ok: true,
          msg:
            surface === "talent"
              ? `"${label}" is now the platform default talent profile.`
              : `"${label}" is now the platform default storefront. Every workspace without its own published homepage renders it.`,
        });
        return true;
      } catch {
        setStatus({ ok: false, msg: "Could not set the default. Try again." });
        return false;
      } finally {
        setSavingId(null);
      }
    },
    [surface],
  );

  const clearStatus = useCallback(() => setStatus(null), []);

  return { pointerId, loading, savingId, status, setDefault, clearStatus };
}

// ── Combined Starter Kit state ───────────────────────────────────────────────

export interface StarterKitPlatformState {
  drift: BuiltinStarterDriftState;
  pointer: PlatformDefaultPointerState;
  /** Slugs of built-in rows that are published but out of date. */
  staleSlugs: ReadonlySet<string>;
  /** The platform-default surface the Starter Kit's surface toggle maps to. */
  platformSurface: PlatformTemplateSurface;
}

/**
 * One call for everything the Site Starter Kit tab needs about platform
 * defaults + built-in drift, so the view file (773 lines against an 800-line
 * cap) grows by one line instead of a dozen.
 */
export function useStarterKitPlatformState(
  surface: "talent" | "workspace",
): StarterKitPlatformState {
  const platformSurface = surfaceToPlatformSurface(surface);
  const drift = useBuiltinStarterDrift();
  const pointer = usePlatformDefaultPointer(platformSurface);
  const staleSlugs = useMemo(
    () =>
      new Set(
        (drift.report?.entries ?? [])
          .filter((e) => e.state === "stale")
          .map((e) => e.slug),
      ),
    [drift.report],
  );
  return { drift, pointer, staleSlugs, platformSurface };
}
