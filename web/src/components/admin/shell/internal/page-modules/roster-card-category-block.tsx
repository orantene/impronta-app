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
 *   - `parent_first` — ONLY the parent talent type, in a strip that toggles
 *                      the child types open in the body.
 *   - `parent_only`  — parent talent type, nothing else.
 */

import type { RosterCardTaxonomyView } from "./roster-card-taxonomy";

/** Shared band styling, so the static strip and the toggle read identically. */
const STRIP_CLASS =
  "border-b border-admin-border-soft bg-[rgba(11,11,13,0.045)] px-[8px] py-[4px] text-[10px] font-bold uppercase tracking-[1px] text-admin-ink-muted";

const CHIP_CLASS =
  "inline-flex max-w-full items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-full px-[7px] py-[2px] text-[10px] font-semibold leading-[1.3]";

const MUTED_CHIP_CLASS = `${CHIP_CLASS} bg-[rgba(11,11,13,0.05)] text-admin-ink-muted`;

/**
 * Everything the two halves need, derived once on the card. `anchorLabel` and
 * `childLabels` already account for a talent whose parent category could not
 * be resolved (the primary type stands in as the anchor there).
 */
export type RosterCardCategoryModel = {
  taxonomyView: RosterCardTaxonomyView;
  /** `categories` badge is on AND the mode is parent-anchored. */
  parentAnchored: boolean;
  /** Parent-anchored AND `parent_first` AND there is something to reveal. */
  canExpandTypes: boolean;
  /** Label shown on the strip in the parent-anchored modes. */
  anchorLabel: string | null;
  /** Labels hidden behind the `+` in `parent_first`. */
  childLabels: string[];
};

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
  const { taxonomyView, parentAnchored, canExpandTypes, anchorLabel } = model;

  // `expanded`: the historical static parent band.
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

  if (!anchorLabel) return null;

  // `parent_first`: the strip IS the control. The card root is itself a click
  // target, so the toggle stops propagation and never opens the profile drawer.
  if (canExpandTypes) {
    return (
      <button
        type="button"
        data-roster-parent-category
        aria-expanded={open}
        aria-label={toggleLabel}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className={`flex w-full items-center justify-center gap-[5px] transition-colors hover:bg-[rgba(11,11,13,0.075)] ${STRIP_CLASS}`}
      >
        <span className="min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
          {anchorLabel}
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
      className={`overflow-hidden text-ellipsis whitespace-nowrap text-center ${STRIP_CLASS}`}
    >
      {anchorLabel}
    </div>
  );
}

export function RosterCardTypeLines({
  model,
  categoriesOn,
  open,
  noTypeLabel,
}: {
  model: RosterCardCategoryModel;
  categoriesOn: boolean;
  open: boolean;
  /** Localized "No type set" fallback. */
  noTypeLabel: string;
}) {
  const { taxonomyView, parentAnchored, childLabels } = model;

  if (parentAnchored) {
    // Child types revealed by the `+` strip. Nothing is truncated here — the
    // admin asked to see them, so the full set renders.
    if (!open || childLabels.length === 0) return null;
    return (
      <div data-roster-secondary-types className="mt-[4px] flex flex-wrap gap-[3px]">
        {childLabels.map((label, idx) => (
          <span
            key={label}
            className={
              idx === 0 && taxonomyView.parentLabel
                ? `${CHIP_CLASS} bg-admin-accent-soft text-admin-accent-deep`
                : MUTED_CHIP_CLASS
            }
          >
            {label}
          </span>
        ))}
      </div>
    );
  }

  if (!categoriesOn) return null;

  const typeLabel = taxonomyView.primaryLabel ?? null;
  const visibleSecondaries = taxonomyView.secondaryLabels.slice(0, 3);
  const extraSecondaryCount =
    taxonomyView.secondaryLabels.length - visibleSecondaries.length;

  return (
    <>
      <div
        data-roster-primary-type
        className={`mt-[2px] flex items-center gap-[4px] overflow-hidden whitespace-nowrap text-[11.5px] ${
          typeLabel
            ? "font-semibold text-admin-accent-deep"
            : "font-medium text-admin-ink-muted"
        }`}
      >
        {taxonomyView.parentEmoji && (
          <span aria-hidden className="shrink-0 text-[12px] opacity-[0.85]">
            {taxonomyView.parentEmoji}
          </span>
        )}
        <span className="min-w-0 overflow-hidden text-ellipsis">
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
          {visibleSecondaries.map((label) => (
            <span key={label} className={MUTED_CHIP_CLASS}>
              {label}
            </span>
          ))}
          {extraSecondaryCount > 0 && (
            <span
              title={taxonomyView.secondaryLabels.slice(3).join(" · ")}
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
  // A talent whose parent category can't be resolved (fixture data, or a term
  // with no parent) would render an empty band, so the primary type stands in
  // as the anchor and only the secondaries hide behind the `+`.
  const anchorLabel =
    taxonomyView.parentLabel ?? taxonomyView.primaryLabel ?? null;
  const childLabels = taxonomyView.parentLabel
    ? [taxonomyView.primaryLabel, ...taxonomyView.secondaryLabels].filter(
        (label): label is string => Boolean(label),
      )
    : [...taxonomyView.secondaryLabels];
  return {
    taxonomyView,
    parentAnchored,
    canExpandTypes:
      parentAnchored && typeDisplay === "parent_first" && childLabels.length > 0,
    anchorLabel,
    childLabels,
  };
}
