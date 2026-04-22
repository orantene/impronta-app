"use client";

/**
 * Empty-state starter tiles.
 *
 * Rendered inside the composer's welcome card when a tenant has zero
 * sections. Each tile wraps a form that POSTs to the
 * `applyStarterComposition` action with a recipe slug. On success the
 * composer re-renders (via router.refresh) populated with a draft.
 */

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

import {
  applyStarterComposition,
  type StarterActionState,
} from "./starter-action";

interface RecipeTile {
  slug: string;
  label: string;
  summary: string;
  idealFor: string;
  sectionsCount: number;
}

const TILES: RecipeTile[] = [
  {
    slug: "editorial-bridal",
    label: "Editorial Bridal",
    summary:
      "9-section composition with warm ivory canvas, italic-serif accents, and pillowy radii.",
    idealFor: "Wedding collectives, editorial agencies, destination events.",
    sectionsCount: 9,
  },
  {
    slug: "classic",
    label: "Classic",
    summary:
      "Lean 4-section starter — hero, services, featured pros, conversion CTA.",
    idealFor: "General agencies, rosters, platforms migrating from legacy.",
    sectionsCount: 4,
  },
  {
    slug: "studio-minimal",
    label: "Studio Minimal",
    summary:
      "Sharp-edged, monochrome, wide gallery — let the work speak.",
    idealFor: "Photography studios, boutique fashion, high-end portfolios.",
    sectionsCount: 4,
  },
];

export function StarterTiles() {
  const router = useRouter();
  const [state, dispatch, pending] = useActionState<
    StarterActionState,
    FormData
  >(applyStarterComposition, undefined);
  const [pendingSlug, setPendingSlug] = useState<string | null>(null);

  useEffect(() => {
    if (state?.ok) {
      // Router refresh pulls the freshly-seeded draft into the composer;
      // the welcome card will disappear on the next render because
      // isEmptyTenant becomes false.
      router.refresh();
    }
  }, [state, router]);

  return (
    <div className="space-y-3">
      {state && !state.ok ? (
        <p className="rounded border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
      {state?.ok ? (
        <p className="rounded border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">
          Starter applied — {state.createdSections} sections created. Review +
          publish when ready.
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-3">
        {TILES.map((tile) => {
          const busy = pending && pendingSlug === tile.slug;
          return (
            <form
              key={tile.slug}
              action={dispatch}
              onSubmit={() => setPendingSlug(tile.slug)}
              className="flex flex-col gap-2 rounded-lg border border-border/60 bg-muted/10 p-4"
            >
              <input type="hidden" name="recipeSlug" value={tile.slug} />
              <div className="flex items-start justify-between gap-2">
                <h3 className="text-sm font-semibold">{tile.label}</h3>
                <span className="rounded-full border border-border/60 bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {tile.sectionsCount} sections
                </span>
              </div>
              <p className="text-xs text-muted-foreground">{tile.summary}</p>
              <p className="text-[11px] text-muted-foreground/80">
                {tile.idealFor}
              </p>
              <Button
                type="submit"
                size="sm"
                disabled={pending}
                className="mt-auto"
                title={`Apply the ${tile.label} preset + seed ${tile.sectionsCount} sections into the homepage draft.`}
              >
                {busy ? "Applying…" : "Start from this preset"}
              </Button>
            </form>
          );
        })}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Every starter creates a <em>draft</em> composition with real-looking
        default copy. Nothing is published until you hit Review + publish from
        the composer.
      </p>
    </div>
  );
}
