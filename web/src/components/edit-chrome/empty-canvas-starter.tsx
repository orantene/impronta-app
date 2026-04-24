"use client";

/**
 * EmptyCanvasStarter — first-run canvas surface for tenants with no CMS
 * homepage composed.
 *
 * Shown only in edit mode on tenants whose homepage has zero sections. The
 * edit-chrome (topbar, inspector dock, overlay portal) still mounts around
 * this card so the operator is in "editing" from first click; they just
 * have nothing to target yet. Without this affordance, clicking Edit on a
 * fresh tenant lands them in an ambiguous state — the chrome looks ready,
 * but there's nothing on the canvas to select.
 *
 * The three recipes mirror the admin composer's starter tiles (editorial,
 * classic, minimal), but this surface lives on the live canvas so the
 * operator never has to leave edit mode. `applyStarterComposition` is the
 * same server action the composer uses — same preset + section seeding +
 * audit trail — so the two paths produce identical state.
 */

import { useActionState, useEffect, useState, type ComponentType } from "react";
import { useRouter } from "next/navigation";

import {
  applyStarterComposition,
  type StarterActionState,
} from "@/app/(dashboard)/admin/site-settings/structure/starter-action";
import { InfoTip } from "@/components/ui/info-tip";
import { useEditContext } from "./edit-context";
import {
  WireClassic,
  WireEditorial,
  WireStudioMinimal,
} from "./starter-wireframes";

interface RecipeTile {
  slug: string;
  label: string;
  summary: string;
  info: string;
  sections: number;
  Wire: ComponentType<{ className?: string }>;
}

const TILES: RecipeTile[] = [
  {
    slug: "editorial-bridal",
    label: "Editorial",
    summary:
      "Full 9-section composition — hero, trust band, services, featured roster, process, destinations, gallery, testimonials, CTA.",
    info: "Ivory canvas, italic-serif display, soft radii. Good fit for wedding collectives, editorial agencies, destination teams.",
    sections: 9,
    Wire: WireEditorial,
  },
  {
    slug: "classic",
    label: "Classic",
    summary: "Lean 4-section starter — hero, services, featured roster, final CTA.",
    info: "Platform-neutral defaults. Best when you're migrating from a legacy site and want minimum surface to edit on day one.",
    sections: 4,
    Wire: WireClassic,
  },
  {
    slug: "studio-minimal",
    label: "Studio Minimal",
    summary: "Monochrome, portfolio-forward — hero, services, gallery, CTA.",
    info: "Sharp edges, wide gallery, let the work carry the page. Photography studios, boutique fashion, high-end portfolios.",
    sections: 4,
    Wire: WireStudioMinimal,
  },
];

export function EmptyCanvasStarter() {
  const router = useRouter();
  const { refreshComposition } = useEditContext();
  const [state, dispatch, pending] = useActionState<StarterActionState, FormData>(
    applyStarterComposition,
    undefined,
  );
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);

  useEffect(() => {
    if (state?.ok) {
      // Two things need to re-sync after the starter writes:
      //   1. router.refresh() rebuilds the server-rendered canvas so the
      //      seeded sections mount with their chrome wrappers.
      //   2. refreshComposition() re-reads `cms_page_sections`/`cms_sections`
      //      into the EditContext so `slots` + `pageVersion` reflect the
      //      new draft. Without this, the Publish drawer and inspector
      //      would read their original (empty) snapshot even though the
      //      DOM shows sections.
      router.refresh();
      void refreshComposition();
    }
  }, [state, router, refreshComposition]);

  const error = state && !state.ok ? state.error : null;

  return (
    <div className="mx-auto my-16 w-full max-w-3xl px-6">
      <div className="rounded-2xl border border-zinc-200 bg-white p-8 shadow-[0_20px_60px_-30px_rgba(0,0,0,0.25),0_2px_0_rgba(0,0,0,0.04)]">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-zinc-400">
          Start here
        </div>
        <h2 className="mt-2 text-2xl font-semibold tracking-tight text-zinc-900">
          Your homepage is a blank canvas.
        </h2>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-zinc-600">
          Pick a starter to seed real sections you can rewrite, reorder, and
          restyle inline. Nothing goes live until you click Publish — you&apos;re
          only ever editing a draft.
        </p>

        {error ? (
          <div className="mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
            {error}
          </div>
        ) : null}

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          {TILES.map((tile) => {
            const busy = pending && pendingSlug === tile.slug;
            const Wire = tile.Wire;
            return (
              <form
                key={tile.slug}
                action={dispatch}
                onSubmit={() => setPendingSlug(tile.slug)}
                className="group flex flex-col gap-2 rounded-xl border border-zinc-200 bg-white p-3 text-left transition hover:border-zinc-900 hover:shadow-md"
              >
                <input type="hidden" name="recipeSlug" value={tile.slug} />
                <div className="overflow-hidden rounded-md bg-zinc-50 p-2">
                  <Wire className="h-20 w-full text-zinc-400" />
                </div>
                <div className="flex items-start justify-between gap-2 px-1 pt-1">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-semibold text-zinc-900">
                      {tile.label}
                    </h3>
                    <InfoTip label={tile.info} />
                  </div>
                  <span className="rounded-full border border-zinc-200 bg-zinc-50 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-zinc-500">
                    {tile.sections} sections
                  </span>
                </div>
                <p className="line-clamp-3 px-1 text-xs leading-relaxed text-zinc-500">
                  {tile.summary}
                </p>
                <button
                  type="submit"
                  disabled={pending}
                  className="mt-auto inline-flex items-center justify-center rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
                  title={`Seed ${tile.sections} sections from the ${tile.label} starter into a fresh draft composition.`}
                >
                  {busy ? "Applying…" : "Start with this"}
                </button>
              </form>
            );
          })}
        </div>

        <p className="mt-6 text-[11px] leading-relaxed text-zinc-500">
          Every starter creates a draft composition with real-looking default
          copy. You can change anything — including the starter&apos;s brand
          preset — after it&apos;s applied.
        </p>
      </div>
    </div>
  );
}
