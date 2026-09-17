import type {
  DirectoryCardAttribute,
  DirectoryCardFitLabel,
} from "@/lib/site-admin/sections/directory/card-data";

/**
 * The talent card's trait row (fit chips + catalog attribute lines, e.g.
 * "HEIGHT 178 cm"). Pure and prop-driven so the SAME markup renders on the
 * live directory (DirectoryCardAdapter) and inside the admin Card Design
 * preview — the preview used to render the bare <TalentCard>, which never
 * carried this row, so the "Attributes" switch and every hover mode were
 * invisible there.
 *
 * Placement is decided by `traitRowPlacement`: the row either floats over
 * the photo (portrait + reveal-on-hover, so a hover never changes the card's
 * box height and can't reflow a CSS-grid row), reveals in flow beneath the
 * photo (editorial), or sits statically beneath it (every other hover mode).
 * Hover/focus state comes from an ancestor carrying Tailwind's `group/cardwrap`.
 */

export type TraitRowStyle = "portrait" | "editorial";
export type TraitRowPlacement = "overlay" | "below-reveal" | "below-static";

export function traitRowPlacement(args: {
  hasContent: boolean;
  revealOnHover: boolean;
  style: TraitRowStyle;
}): TraitRowPlacement | null {
  if (!args.hasContent) return null;
  if (!args.revealOnHover) return "below-static";
  return args.style === "portrait" ? "overlay" : "below-reveal";
}

/** At most two fit chips — a restrained, editorial trait row. */
export function pickFitLabels(
  fitLabels: readonly DirectoryCardFitLabel[] | undefined,
): DirectoryCardFitLabel[] {
  if (!fitLabels || fitLabels.length === 0) return [];
  return fitLabels.filter((f) => f.label.trim().length > 0).slice(0, 2);
}

/**
 * At most two catalog trait lines, ordered + filtered by the section's
 * `cardFieldKeys` allow-list when set, else the DTO's catalog order. The
 * 2-line ceiling is intersected with the operator's `maxFieldLines` knob.
 */
export function pickAttributeLines(
  attributes: readonly DirectoryCardAttribute[] | undefined,
  cardFieldKeys: readonly string[],
  maxFieldLines: number,
): DirectoryCardAttribute[] {
  if (!attributes || attributes.length === 0) return [];
  const usable = attributes.filter((a) => a.value.trim().length > 0);

  let ordered: DirectoryCardAttribute[];
  if (cardFieldKeys.length > 0) {
    const byKey = new Map(usable.map((a) => [a.key, a] as const));
    ordered = cardFieldKeys
      .map((key) => byKey.get(key))
      .filter((a): a is DirectoryCardAttribute => Boolean(a));
  } else {
    ordered = usable;
  }

  const cap = Math.max(0, Math.min(2, maxFieldLines));
  return ordered.slice(0, cap);
}

/**
 * Floats over the photo's bottom edge. Must be a child of the `relative`
 * box that wraps <TalentCard>, and a descendant of a `group/cardwrap`.
 * `pointer-events-none` keeps the card's own <Link> clickable underneath,
 * matching the scrim/name overlay TalentCard renders the same way.
 */
export function TalentCardTraitOverlay({
  fitChips,
  traitLines,
}: {
  fitChips: DirectoryCardFitLabel[];
  traitLines: DirectoryCardAttribute[];
}) {
  return (
    <div
      className="pointer-events-none absolute inset-x-0 bottom-0 z-[1] translate-y-1.5 rounded-b-2xl bg-gradient-to-t from-[rgba(6,6,8,0.94)] via-[rgba(6,6,8,0.72)] to-transparent px-3.5 pb-3.5 pt-9 opacity-0 transition-[opacity,transform] duration-200 group-hover/cardwrap:translate-y-0 group-hover/cardwrap:opacity-100 group-focus-within/cardwrap:translate-y-0 group-focus-within/cardwrap:opacity-100 [@media(hover:none)]:translate-y-0 [@media(hover:none)]:opacity-100"
      data-card-traits=""
    >
      <TraitRowBody fitChips={fitChips} traitLines={traitLines} onScrim />
    </div>
  );
}

/**
 * Sits beneath the photo box as flowing content. `reveal` collapses it at
 * rest (0-fr grid row + faded) and opens it on group-hover / focus-within /
 * touch; otherwise it is statically visible.
 */
export function TalentCardTraitBelow({
  fitChips,
  traitLines,
  reveal,
}: {
  fitChips: DirectoryCardFitLabel[];
  traitLines: DirectoryCardAttribute[];
  reveal: boolean;
}) {
  if (!reveal) {
    return (
      <div className="mt-2 flex flex-col gap-1.5" data-card-traits="">
        <TraitRowBody fitChips={fitChips} traitLines={traitLines} />
      </div>
    );
  }
  return (
    <div
      className="grid grid-rows-[0fr] opacity-0 transition-[grid-template-rows,opacity,margin] duration-200 group-hover/cardwrap:mt-2 group-hover/cardwrap:grid-rows-[1fr] group-hover/cardwrap:opacity-100 group-focus-within/cardwrap:mt-2 group-focus-within/cardwrap:grid-rows-[1fr] group-focus-within/cardwrap:opacity-100 [@media(hover:none)]:mt-2 [@media(hover:none)]:grid-rows-[1fr] [@media(hover:none)]:opacity-100"
      data-card-traits=""
    >
      <div className="flex min-h-0 flex-col gap-1.5 overflow-hidden">
        <TraitRowBody fitChips={fitChips} traitLines={traitLines} />
      </div>
    </div>
  );
}

/**
 * The trait-row inner content, shared by every placement so the markup stays
 * single-source. The `data-card-chip` / `data-card-trait-line` hooks let a
 * card kit restyle it.
 *
 * `onScrim` swaps the muted/value colors for the portrait style's
 * white-over-photo caption (matches `StandingChip`'s own `onScrim` prop in
 * TalentCard.tsx) — the plain-surface colors would be low-contrast or
 * invisible painted directly on a photo.
 */
export function TraitRowBody({
  fitChips,
  traitLines,
  onScrim = false,
}: {
  fitChips: DirectoryCardFitLabel[];
  traitLines: DirectoryCardAttribute[];
  onScrim?: boolean;
}) {
  const mutedClass = onScrim
    ? "text-[var(--token-card-muted,rgba(255,255,255,0.75))]"
    : "text-[var(--token-card-muted,var(--token-color-muted,#6b7280))]";
  const chipBorderClass = onScrim ? "border-white/25" : "border-border";
  const valueClass = onScrim ? "text-white/90" : "text-foreground/80";

  return (
    <>
      {fitChips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {fitChips.map((chip) => (
            <span
              key={chip.slug}
              data-card-chip
              className={`inline-flex max-w-full items-center truncate rounded-full border ${chipBorderClass} px-2 py-0.5 text-[10px] font-medium tracking-wide ${mutedClass}`}
            >
              {chip.label}
            </span>
          ))}
        </div>
      ) : null}
      {traitLines.length > 0 ? (
        <dl className="flex flex-col gap-0.5">
          {traitLines.map((trait) => (
            <div
              key={trait.key}
              data-card-trait-line=""
              // 11px is under the 12px legibility floor the mobile audit set,
              // and these trait lines ("HEIGHT 164 cm") are exactly the detail
              // a client squints at on a phone. 12px on small screens, the
              // tighter desktop size preserved from sm: up.
              className="flex items-baseline gap-1.5 text-[12px] leading-snug sm:text-[11px]"
            >
              <dt className={`shrink-0 uppercase tracking-[0.12em] ${mutedClass}`}>
                {trait.label}
              </dt>
              <dd className={`min-w-0 truncate ${valueClass}`}>{trait.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </>
  );
}
