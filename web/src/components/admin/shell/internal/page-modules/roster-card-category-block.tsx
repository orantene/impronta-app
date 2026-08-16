"use client";

/**
 * roster-card-category-block.tsx — the roster GRID card's category block,
 * split out of TalentPage-2 so that file stays under its max-lines budget.
 *
 * The block has two DOM homes on the card, so it ships as two presentational
 * pieces rather than one component:
 *
 *   - `<RosterCardCategoryStrip>` — the full-width band between the photo and
 *     the body (the admin scanning anchor).
 *   - `<RosterCardTypeLines>` — the type line + type chips inside the body.
 *
 * Both are pure and prop-driven; the open/closed state of the `parent_first`
 * expander lives on the card so the two halves stay in sync.
 *
 * Layout follows the tenant's `rosterCardBadges.typeDisplay`:
 *   - `expanded`     — parent strip, primary type line, first 3 secondary
 *                      chips + a `+N` overflow chip.
 *   - `parent_first` — ONLY the parent talent types, in a strip that toggles
 *                      the child types open in the body, grouped by parent.
 *   - `parent_only`  — parent talent types, nothing else.
 *
 * THREE THINGS THE BLOCK IS CAREFUL ABOUT
 * ───────────────────────────────────────
 *   1. EVERY parent, not one. A talent routinely holds types across several
 *      parents (Models AND Performers AND Influencers). Anchoring on the
 *      primary type's parent alone silently hid the rest, so the strip lists
 *      all of them and the expansion groups the types underneath each.
 *   2. The primary type wears a star, so "what are they mainly" survives the
 *      flattening into chips.
 *   3. A type this workspace has DISABLED still renders — dimmed, dashed, and
 *      tooltipped. The talent really holds it; the workspace just doesn't
 *      offer it. Hiding it would make the card lie about the talent.
 */

import type {
  RosterCardTaxonomyView,
  RosterTypeEntry,
  RosterTypeGroup,
} from "./roster-card-taxonomy";

/** Shared band styling, so the static strip and the toggle read identically. */
const STRIP_CLASS =
  "border-b border-admin-border-soft bg-[rgba(11,11,13,0.045)] px-[8px] py-[4px] text-[10px] font-bold uppercase tracking-[1px] text-admin-ink-muted";

const CHIP_CLASS =
  "inline-flex max-w-full items-center gap-[3px] overflow-hidden text-ellipsis whitespace-nowrap rounded-full px-[7px] py-[2px] text-[10px] font-semibold leading-[1.3]";

const MUTED_CHIP_CLASS = `${CHIP_CLASS} bg-[rgba(11,11,13,0.05)] text-admin-ink-muted`;
const PRIMARY_CHIP_CLASS = `${CHIP_CLASS} bg-admin-accent-soft text-admin-accent-deep`;
/** Unsupported: readable but visibly not on offer, and never mistakable for a
 *  bookable type. Dashed + dimmed, with the reason on hover. */
const UNSUPPORTED_CHIP_CLASS = `${CHIP_CLASS} border border-dashed border-admin-border bg-transparent text-admin-ink-muted opacity-[0.55]`;

/**
 * Everything the two halves need, derived once on the card. `parentLabels`
 * already accounts for a talent whose parent category could not be resolved
 * (their type labels stand in, so the band is never empty).
 */
export type RosterCardCategoryModel = {
  taxonomyView: RosterCardTaxonomyView;
  /** `categories` badge is on AND the mode is parent-anchored. */
  parentAnchored: boolean;
  /** Parent-anchored AND `parent_first` AND there is something to reveal. */
  canExpandTypes: boolean;
  /** Every parent category the talent spans, in display order. */
  groups: RosterTypeGroup[];
  /** Strip text in the parent-anchored modes — one entry per parent. */
  parentLabels: string[];
  /** How many types hide behind the `+`. */
  hiddenTypeCount: number;
};

/** One type chip: star for primary, dimmed + tooltipped when unsupported. */
function TypeChip({
  type,
  unsupportedTooltip,
}: {
  type: RosterTypeEntry;
  unsupportedTooltip: string;
}) {
  const className = !type.supported
    ? UNSUPPORTED_CHIP_CLASS
    : type.isPrimary
      ? PRIMARY_CHIP_CLASS
      : MUTED_CHIP_CLASS;
  return (
    <span
      data-roster-type-chip
      data-roster-type-unsupported={type.supported ? undefined : ""}
      title={type.supported ? undefined : unsupportedTooltip}
      className={className}
    >
      {type.isPrimary && (
        <span aria-hidden className="text-[9px] leading-none">
          ★
        </span>
      )}
      {type.label}
    </span>
  );
}

export function RosterCardCategoryStrip({
  model,
  categoriesOn,
  open,
  onToggle,
  toggleLabel,
}: {
  model: RosterCardCategoryModel;
  categoriesOn: boolean;
  open: boolean;
  onToggle: () => void;
  /** Localized aria-label for the expander. */
  toggleLabel: string;
}) {
  const { taxonomyView, parentAnchored, canExpandTypes, parentLabels } = model;

  // `expanded`: the historical static parent band (primary's parent only —
  // the full set is what the parent-anchored modes are for).
  if (!parentAnchored) {
    if (!categoriesOn || !taxonomyView.parentLabel) return null;
    return (
      <div
        data-roster-parent-category
        className={`overflow-hidden text-ellipsis whitespace-nowrap text-center ${STRIP_CLASS}`}
      >
        {taxonomyView.parentLabel}
      </div>
    );
  }

  if (parentLabels.length === 0) return null;
  const bandText = parentLabels.join(" · ");

  // `parent_first`: the strip IS the control. The card root is itself a click
  // target, so the toggle stops propagation and never opens the profile drawer.
  if (canExpandTypes) {
    return (
      <button
        type="button"
        data-roster-parent-category
        aria-expanded={open}
        aria-label={toggleLabel}
        title={bandText}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={`flex w-full items-center justify-center gap-[5px] transition-colors hover:bg-[rgba(11,11,13,0.075)] ${STRIP_CLASS}`}
      >
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
          {bandText}
        </span>
        <span
          aria-hidden
          className="inline-flex h-[13px] w-[13px] shrink-0 items-center justify-center rounded-full bg-[rgba(11,11,13,0.10)] text-[11px] font-bold leading-none"
        >
          {open ? "−" : "+"}
        </span>
      </button>
    );
  }

  // `parent_only` (or `parent_first` with nothing to reveal).
  return (
    <div
      data-roster-parent-category
      title={bandText}
      className={`overflow-hidden text-ellipsis whitespace-nowrap text-center ${STRIP_CLASS}`}
    >
      {bandText}
    </div>
  );
}

export function RosterCardTypeLines({
  model,
  categoriesOn,
  open,
  noTypeLabel,
  unsupportedTooltip,
}: {
  model: RosterCardCategoryModel;
  categoriesOn: boolean;
  open: boolean;
  /** Localized "No type set" fallback. */
  noTypeLabel: string;
  /** Localized tooltip for a type this workspace does not offer. */
  unsupportedTooltip: string;
}) {
  const { taxonomyView, parentAnchored, groups } = model;

  if (parentAnchored) {
    // Types revealed by the `+` strip, grouped under their parent. Nothing is
    // truncated here — the admin asked to see them, so the full set renders.
    if (!open || groups.length === 0) return null;
    // With a single group the strip already names the parent, so repeating it
    // as a heading would be pure noise.
    const showHeadings = groups.length > 1;
    return (
      <div data-roster-secondary-types className="mt-[5px] flex flex-col gap-[5px]">
        {groups.map((group) => (
          <div key={group.parentId ?? "ungrouped"} className="flex flex-col gap-[3px]">
            {showHeadings && group.parentLabel ? (
              <div className="flex items-center gap-[3px] text-[9px] font-bold uppercase tracking-[0.8px] text-admin-ink-dim">
                {group.parentEmoji && (
                  <span aria-hidden className="text-[10px] opacity-[0.85]">
                    {group.parentEmoji}
                  </span>
                )}
                {group.parentLabel}
              </div>
            ) : null}
            <div className="flex flex-wrap gap-[3px]">
              {group.types.map((type) => (
                <TypeChip
                  key={type.key}
                  type={type}
                  unsupportedTooltip={unsupportedTooltip}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!categoriesOn) return null;

  const typeLabel = taxonomyView.primaryLabel ?? null;
  const primaryEntry = groups
    .flatMap((group) => group.types)
    .find((type) => type.isPrimary);
  const primaryUnsupported = primaryEntry ? !primaryEntry.supported : false;
  const secondaryEntries = groups
    .flatMap((group) => group.types)
    .filter((type) => !type.isPrimary);
  const visibleSecondaries = secondaryEntries.slice(0, 3);
  const extraSecondaryCount = secondaryEntries.length - visibleSecondaries.length;

  return (
    <>
      <div
        data-roster-primary-type
        data-roster-type-unsupported={primaryUnsupported ? "" : undefined}
        title={primaryUnsupported ? unsupportedTooltip : undefined}
        className={`mt-[2px] flex items-center gap-[4px] overflow-hidden whitespace-nowrap text-[11.5px] ${
          typeLabel
            ? "font-semibold text-admin-accent-deep"
            : "font-medium text-admin-ink-muted"
        } ${primaryUnsupported ? "opacity-[0.55]" : ""}`}
      >
        {taxonomyView.parentEmoji && (
          <span aria-hidden className="shrink-0 text-[12px] opacity-[0.85]">
            {taxonomyView.parentEmoji}
          </span>
        )}
        <span className="min-w-0 overflow-hidden text-ellipsis">
          {typeLabel ? (
            <span aria-hidden className="mr-[3px] text-[9px]">
              ★
            </span>
          ) : null}
          {typeLabel ?? noTypeLabel}
          {taxonomyView.specialty && visibleSecondaries.length === 0 && (
            <span className="font-medium text-admin-ink-muted">
              {" · "}
              {taxonomyView.specialty}
            </span>
          )}
        </span>
      </div>
      {visibleSecondaries.length > 0 && (
        <div data-roster-secondary-types className="mt-[4px] flex flex-wrap gap-[3px]">
          {visibleSecondaries.map((type) => (
            <TypeChip key={type.key} type={type} unsupportedTooltip={unsupportedTooltip} />
          ))}
          {extraSecondaryCount > 0 && (
            <span
              title={secondaryEntries
                .slice(3)
                .map((type) => type.label)
                .join(" · ")}
              className={MUTED_CHIP_CLASS}
            >
              +{extraSecondaryCount}
            </span>
          )}
        </div>
      )}
    </>
  );
}

/** Derive the whole category model from a resolved taxonomy view + prefs. */
export function buildRosterCardCategoryModel(
  taxonomyView: RosterCardTaxonomyView,
  categoriesOn: boolean,
  typeDisplay: string,
): RosterCardCategoryModel {
  const parentAnchored = categoriesOn && typeDisplay !== "expanded";
  const groups = taxonomyView.groups;
  // A talent whose parent category can't be resolved would render an empty
  // band, so that group's own type labels stand in as the anchor text.
  const parentLabels = groups.map(
    (group) => group.parentLabel ?? group.types.map((type) => type.label).join(" · "),
  );
  const hiddenTypeCount = groups.reduce((sum, group) => sum + group.types.length, 0);
  return {
    taxonomyView,
    parentAnchored,
    canExpandTypes:
      parentAnchored && typeDisplay === "parent_first" && hiddenTypeCount > 0,
    groups,
    parentLabels: parentLabels.filter((label) => label.length > 0),
    hiddenTypeCount,
  };
}
