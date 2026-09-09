"use client";

/**
 * The catalog, rendered for a human.
 *
 * WHAT THIS IS NOT. It is not the authority — `registry.tsx` is, and the axe
 * lane reads that directly rather than this. If the gallery breaks, the guard
 * still guards; if the registry breaks, this page shows less, which is the
 * dependency direction that keeps a catalog honest.
 *
 * EACH ENTRY CARRIES ITS "WHY". A gallery of shapes teaches somebody what the
 * components look like, which they can already see. What nobody can see is
 * which primitive to reach for, and the answer to that is a sentence about the
 * job — so the sentence is a required field on the entry rather than a comment
 * in the component file where a chooser will never read it.
 */

import * as React from "react";

import { UI_CATALOG } from "./registry";

export function UiCatalogGallery() {
  const variantCount = UI_CATALOG.reduce((sum, entry) => sum + entry.variants.length, 0);

  return (
    <main className="mx-auto max-w-4xl px-6 py-12">
      <header className="border-b border-border/60 pb-6">
        <h1 className="font-display text-3xl tracking-wide">Component catalog</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {UI_CATALOG.length} primitives, {variantCount} states. Every state on this
          page is rendered by the axe lane on every CI run; a primitive that is not
          here is a primitive nothing checks.
        </p>
      </header>

      <nav aria-label="Primitives" className="mt-6">
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
          {UI_CATALOG.map((entry) => (
            <li key={entry.id}>
              <a className="text-primary underline-offset-4 hover:underline" href={`#${entry.id}`}>
                {entry.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="mt-10 space-y-14">
        {UI_CATALOG.map((entry) => (
          <section key={entry.id} id={entry.id} aria-labelledby={`${entry.id}-title`}>
            <h2 id={`${entry.id}-title`} className="font-display text-xl tracking-wide">
              {entry.title}
            </h2>
            <p className="mt-1 text-xs text-muted-foreground">
              src/components/ui/{entry.file}
            </p>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{entry.why}</p>
            <div className="mt-5 space-y-6">
              {entry.variants.map((variant) => (
                <div key={variant.id}>
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground/80">
                    {variant.label}
                  </h3>
                  <div className="mt-2 rounded-lg border border-border/60 p-5">
                    {variant.render()}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
