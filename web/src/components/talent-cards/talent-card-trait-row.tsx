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
 * It is passed to <TalentCard traitSlot> and rendered INSIDE the caption,
 * beneath the type/location line — never as a loose line under the card.
 * On the portrait style the caption is an absolute, bottom-anchored block
 * over the photo, so a hover reveal grows the caption upward and the card's
 * outer box never changes: no CSS-grid row can reflow. Hover/focus state
 * comes from an ancestor carrying Tailwind's `group/cardwrap`.
 */

export type TraitRowMode = "reveal" | "static";

export function traitRowMode(args: {
  hasContent: boolean;
  revealOnHover: boolean;
}): TraitRowMode | null {
  if (!args.hasContent) return null;
  return args.revealOnHover ? "reveal" : "static";
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
 * The slot content. `reveal` collapses it at rest (0-fr grid row + faded)
 * and opens it on group-hover / focus-within / touch; `static` keeps it
 * visible. `onScrim` = the portrait caption (white over the photo).
 */
export function TalentCardTraitRow({
  fitChips,
  traitLines,
  mode,
  onScrim,
}: {
  fitChips: DirectoryCardFitLabel[];
  traitLines: DirectoryCardAttribute[];
  mode: TraitRowMode;
  onScrim: boolean;
}) {
  if (mode === "static") {
    return (
      <div className="mt-1.5 flex flex-col gap-1.5" data-card-traits="">
        <TraitRowBody fitChips={fitChips} traitLines={traitLines} onScrim={onScrim} />
      </div>
    );
  }
  return (
    <div
      className="grid grid-rows-[0fr] opacity-0 transition-[grid-template-rows,opacity,margin] duration-200 ease-out group-hover/cardwrap:mt-1.5 group-hover/cardwrap:grid-rows-[1fr] group-hover/cardwrap:opacity-100 group-focus-within/cardwrap:mt-1.5 group-focus-within/cardwrap:grid-rows-[1fr] group-focus-within/cardwrap:opacity-100 [@media(hover:none)]:mt-1.5 [@media(hover:none)]:grid-rows-[1fr] [@media(hover:none)]:opacity-100"
      data-card-traits=""
    >
      <div className="flex min-h-0 flex-col gap-1.5 overflow-hidden">
        <TraitRowBody fitChips={fitChips} traitLines={traitLines} onScrim={onScrim} />
      </div>
    </div>
  );
}

/**
 * The trait-row inner content, single-source for both modes. The
 * `data-card-chip` / `data-card-trait-line` hooks let a card kit restyle it.
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
  // Token-first, like every other caption line: a kit that moves the caption
  // off the photo (magazine) sets dark tokens, a kit that keeps it on the
  // scrim (noir) sets light ones; the fallbacks are the bare portrait scrim.
  const mutedClass = onScrim
    ? "text-[var(--token-card-muted,rgba(255,255,255,0.72))]"
    : "text-[var(--token-card-muted,var(--token-color-muted,#6b7280))]";
  const chipClass = onScrim
    ? "border-[color:var(--token-color-line,rgba(255,255,255,0.22))] text-[var(--token-card-muted,rgba(255,255,255,0.85))]"
    : "border-border text-[var(--token-card-muted,var(--token-color-muted,#6b7280))]";
  const valueClass = onScrim
    ? "text-[var(--token-card-name-color,rgba(255,255,255,0.9))]"
    : "text-foreground/80";

  return (
    <>
      {fitChips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {fitChips.map((chip) => (
            <span
              key={chip.slug}
              data-card-chip
              className={`inline-flex max-w-full items-center truncate rounded-full border px-2 py-0.5 text-[10px] font-medium tracking-wide ${chipClass}`}
            >
              {chip.label}
            </span>
          ))}
        </div>
      ) : null}
      {traitLines.length > 0 ? (
        <dl className="flex flex-wrap gap-x-3 gap-y-0.5">
          {traitLines.map((trait) => (
            <div
              key={trait.key}
              data-card-trait-line=""
              // 11px is under the 12px legibility floor the mobile audit set,
              // and these trait lines ("HEIGHT 164 cm") are exactly the detail
              // a client squints at on a phone. 12px on small screens, the
              // tighter desktop size preserved from sm: up.
              className="flex min-w-0 items-baseline gap-1.5 text-[12px] leading-snug sm:text-[11px]"
            >
              <dt className={`shrink-0 text-[9px] uppercase tracking-[0.14em] ${mutedClass}`}>
                {trait.label}
              </dt>
              <dd className={`min-w-0 truncate tabular-nums ${valueClass}`}>{trait.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </>
  );
}
