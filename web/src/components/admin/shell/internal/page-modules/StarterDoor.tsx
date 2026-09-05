"use client";

/**
 * StarterDoor.tsx — the offer an operator with an empty site never got.
 *
 * WHAT WAS BROKEN
 * ───────────────
 * `applyStarterComposition` and `loadStarterAvailability` (edit-mode/
 * starter-action.ts) compose a workspace's whole starter set — home, 404,
 * directory — from the same recipes signup uses. They had ZERO callers. Not
 * "surfaced somewhere unhelpful": nothing in the app invoked them. The only
 * other reference was a COMMENT in agency-home-storefront.tsx describing "the
 * admin composer", a caller that did not exist.
 *
 * So a workspace provisioned outside signup (SQL, hand-provisioning, or any
 * path where `onboardStarterContent` never ran) had no route to a starter site
 * from any screen. The operator saw an empty Pages list and no way to fill it.
 * This repo's most-repeated defect, in its purest form: a complete capability
 * with no door.
 *
 * WHERE IT LIVES AND WHY
 * ──────────────────────
 * Website → Overview, above the launchpad grid, and ONLY when the site has zero
 * pages. That is the first screen an operator with an empty site actually looks
 * at, and the launchpad already computes `pages.length === 0` to say "No pages
 * yet" — a sentence that named the problem and offered nothing. Now the same
 * condition offers the fix.
 *
 * It renders nothing at all once any page exists, so an established site never
 * sees it and there is no way to click it by accident.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * ────────────────────────────────
 * No recipe picker. `loadStarterAvailability` returns the allowed slugs and the
 * free starter; this offers exactly the free one, because an operator staring
 * at an empty site is being asked "do you want a website?", not "which of our
 * recipes do you prefer?". Choosing between starters is a decision for someone
 * who already has a site to compare against.
 */

import { useCallback, useEffect, useState, useTransition } from "react";

import {
  applyStarterComposition,
  loadStarterAvailability,
} from "@/lib/site-admin/edit-mode/starter-action";
import { useT } from "@/i18n/use-t";

type Availability =
  | { state: "loading" }
  | { state: "unavailable" }
  | { state: "ready"; slug: string };

export function StarterDoor({ hasPages }: { hasPages: boolean }) {
  const t = useT();
  const [availability, setAvailability] = useState<Availability>({
    state: "loading",
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    // Only ask when the door could possibly be shown. A site with pages must
    // not spend a round trip discovering it has nothing to offer.
    if (hasPages) return;
    let cancelled = false;
    void (async () => {
      try {
        const result = await loadStarterAvailability();
        if (cancelled) return;
        setAvailability(
          result.ok && result.freeStarterSlug
            ? { state: "ready", slug: result.freeStarterSlug }
            : { state: "unavailable" },
        );
      } catch {
        // A workspace that cannot answer is one we do not offer a starter for.
        // Failing to the launchpad's existing empty state is strictly better
        // than showing a button that will not work.
        if (!cancelled) setAvailability({ state: "unavailable" });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [hasPages]);

  const apply = useCallback(() => {
    if (availability.state !== "ready") return;
    setError(null);
    start(async () => {
      const formData = new FormData();
      formData.set("recipeSlug", availability.slug);
      // The action's prev-state parameter is `StarterActionState`, whose first
      // member is `undefined` — this is a plain call, not a useActionState
      // reducer, so there is no previous state to hand it.
      const result = await applyStarterComposition(undefined, formData);
      if (!result || !result.ok) {
        setError(
          result && !result.ok
            ? result.error
            : t("dashboard.adminWebsite.starterDoorFailed"),
        );
        return;
      }
      // The composition writes pages server-side; a reload is what makes them
      // appear in the launchpad's own state rather than a second source of
      // truth maintained here.
      window.location.reload();
    });
  }, [availability, t]);

  if (hasPages || availability.state !== "ready") return null;

  return (
    <section
      data-starter-door=""
      className="mb-4 rounded-[14px] border border-[rgba(24,24,27,0.14)] bg-white p-5"
    >
      <h2 className="text-[15px] font-semibold tracking-[-0.01em] text-stone-900">
        {t("dashboard.adminWebsite.starterDoorTitle")}
      </h2>
      <p className="mt-1 text-[13px] leading-snug text-stone-600">
        {t("dashboard.adminWebsite.starterDoorBody")}
      </p>
      {error ? (
        <p className="mt-2 text-[12.5px] text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <button
        type="button"
        onClick={apply}
        disabled={pending}
        className="mt-3 rounded-[10px] bg-stone-900 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
      >
        {pending
          ? t("dashboard.adminWebsite.starterDoorPending")
          : t("dashboard.adminWebsite.starterDoorCta")}
      </button>
    </section>
  );
}
