"use client";

/**
 * roster-card-category-block.tsx — the roster GRID card's category block,
 * split out of TalentPage-2 so that file stays under its max-lines budget.
 *
 * Two presentational pieces, because the block has two possible DOM homes:
 *
 *   - `<RosterCardCategoryStrip>` — the full-width band between photo and
 *     body. Renders ONLY in `expanded` mode (the historical admin anchor);
 *     the parent-anchored modes deliberately have no band — owner feedback:
 *     the gray accordion strip read as clutter.
 *   - `<RosterCardTypeLines>` — everything inside the white body.
 *
 * Layout follows the tenant's `rosterCardBadges.typeDisplay`:
 *   - `expanded`     — parent strip, primary type line, first 3 secondary
 *                      chips + a `+N` overflow chip (unchanged).
 *   - `parent_first` — each parent category the talent spans is its OWN
 *                      accordion row in the body (✨ PERFORMERS ▸). Tapping a
 *                      row opens just that parent's types. Per-card, local,
 *                      collapsed at rest.
 *   - `parent_only`  — the same parent rows, static — no expander, no types.
 *
 * THREE THINGS THE BLOCK IS CAREFUL ABOUT
 * ───────────────────────────────────────
 *   1. EVERY parent, not one. A talent routinely holds types across several
 *      parents (Models AND Performers AND Influencers). Anchoring on the
 *      primary type's parent alone silently hid the rest, so every parent
 *      gets a row and its types group underneath it.
 *   2. The primary type wears a star, so "what are they mainly" survives the
 *      flattening into chips.
 *   3. A type this workspace has DISABLED still renders — dimmed, dashed, and
 *      tooltipped. The talent really holds it; the workspace just doesn't
 *      offer it. Hiding it would make the card lie about the talent.
 */

import { useState } from "react";

import type {
  RosterCardTaxonomyView,
  RosterTypeEntry,
  RosterTypeGroup,
} from "./roster-card-taxonomy";

const STRIP_CLASS =
  "border-b border-admin-border-soft bg-[rgba(11,11,13,0.045)] px-[8px] py-[4px] text-[10px] font-bold uppercase tracking-[1px] text-admin-ink-muted";

const CHIP_CLASS =
  "inline-flex max-w-full items-center gap-[3px] overflow-hidden text-ellipsis whitespace-nowrap rounded-full px-[7px] py-[2px] text-[10px] font-semibold leading-[1.3]";

const MUTED_CHIP_CLASS = `${CHIP_CLASS} bg-[rgba(11,11,13,0.05)] text-admin-ink-muted`;
const PRIMARY_CHIP_CLASS = `${CHIP_CLASS} bg-admin-accent-soft text-admin-accent-deep`;
/** Unsupported: readable but visibly not on offer, and never mistakable for a
 *  bookable type. Dashed + dimmed, with the reason on hover. */
const UNSUPPORTED_CHIP_CLASS = `${CHIP_CLASS} border border-dashed border-admin-border bg-transparent text-admin-ink-muted opacity-[0.55]`;

/** Parent-row label: quiet, uppercase, reads as a section eyebrow. */
const GROUP_LABEL_CLASS =
  "min-w-0 overflow-hidden text-ellipsis whitespace-nowrap text-[9.5px] font-bold uppercase tracking-[0.9px] text-admin-ink-dim";

/** Everything the two halves need, derived once on the card. */
export type RosterCardCategoryModel = {
  taxonomyView: RosterCardTaxonomyView;
  /** `categories` badge is on AND the mode is parent-anchored. */
  parentAnchored: boolean;
  /** Parent-anchored AND `parent_first` — rows carry expanders. */
  expandable: boolean;
  /** Every parent category the talent spans, in display order. */
  groups: RosterTypeGroup[];
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

/**
 * The band between photo and body — `expanded` mode only. The parent-anchored
 * modes render their parents as body rows instead, so they return null here.
 */
export function RosterCardCategoryStrip({
  model,
  categoriesOn,
}: {
  model: RosterCardCategoryModel;
  categoriesOn: boolean;
}) {
  const { taxonomyView, parentAnchored } = model;
  if (parentAnchored || !categoriesOn || !taxonomyView.parentLabel) return null;
  return (
    <div
      data-roster-parent-category
      className={`overflow-hidden text-ellipsis whitespace-nowrap text-center ${STRIP_CLASS}`}
    >
      {taxonomyView.parentLabel}
    </div>
  );
}

/**
 * One parent's accordion row + its types. The chevron rotates open; the row
 * stops propagation because the card root is itself a click target (it would
 * otherwise open the profile drawer).
 */
function ParentGroupRow({
  group,
  expandable,
  toggleAria,
  unsupportedTooltip,
}: {
  group: RosterTypeGroup;
  expandable: boolean;
  /** Localized aria-label for this row's expander. */
  toggleAria: string;
  unsupportedTooltip: string;
}) {
  const [open, setOpen] = useState(false);

  // A group whose parent could not be resolved has no row label to offer, so
  // its chips render directly (always visible) — a type the talent holds must
  // never be unreachable because the tree walk came up empty.
  if (!group.parentLabel) {
    return (
      <div data-roster-parent-group className="flex flex-wrap gap-[3px] py-[3px]">
        {group.types.map((type) => (
          <TypeChip key={type.key} type={type} unsupportedTooltip={unsupportedTooltip} />
        ))}
      </div>
    );
  }

  const labelBody = (
    <>
      {group.parentEmoji && (
        <span aria-hidden className="shrink-0 text-[11px] leading-none opacity-[0.8]">
          {group.parentEmoji}
        </span>
      )}
      <span className={GROUP_LABEL_CLASS}>{group.parentLabel}</span>
    </>
  );

  // `parent_only`: a static eyebrow row, nothing to open.
  if (!expandable) {
    return (
      <div
        data-roster-parent-group
        className="flex items-center gap-[5px] py-[3px]"
      >
        {labelBody}
      </div>
    );
  }

  return (
    <div data-roster-parent-group>
      <button
        type="button"
        aria-expanded={open}
        aria-label={toggleAria}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="-mx-[5px] flex w-[calc(100%+10px)] items-center gap-[5px] rounded-[6px] px-[5px] py-[4px] transition-colors hover:bg-[rgba(11,11,13,0.04)]"
      >
        {labelBody}
        <span
          aria-hidden
          className="ml-auto shrink-0 text-[9px] tabular-nums text-admin-ink-dim opacity-[0.75]"
        >
          {group.types.length}
        </span>
        <svg
          aria-hidden
          width="9"
          height="9"
          viewBox="0 0 10 10"
          className={`shrink-0 text-admin-ink-dim transition-transform duration-150 ${
            open ? "rotate-90" : ""
          }`}
        >
          <path
            d="M3 1.5 6.5 5 3 8.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {open && (
        <div
          data-roster-secondary-types
          className="flex flex-wrap gap-[3px] pb-[5px] pt-[1px]"
        >
          {group.types.map((type) => (
            <TypeChip key={type.key} type={type} unsupportedTooltip={unsupportedTooltip} />
          ))}
        </div>
      )}
    </div>
  );
}

export function RosterCardTypeLines({
  model,
  categoriesOn,
  noTypeLabel,
  unsupportedTooltip,
  getToggleAria,
}: {
  model: RosterCardCategoryModel;
  categoriesOn: boolean;
  /** Localized "No type set" fallback. */
  noTypeLabel: string;
  /** Localized tooltip for a type this workspace does not offer. */
  unsupportedTooltip: string;
  /** Localized aria-label for a parent row's expander, given its label. */
  getToggleAria: (parentLabel: string) => string;
}) {
  const { taxonomyView, parentAnchored, expandable, groups } = model;

  if (parentAnchored) {
    if (groups.length === 0) return null;
    return (
      <div
        data-roster-parent-groups
        className="mt-[5px] flex flex-col divide-y divide-admin-border-soft"
      >
        {groups.map((group) => (
          <ParentGroupRow
            key={group.parentId ?? "ungrouped"}
            group={group}
            expandable={expandable}
            toggleAria={getToggleAria(group.parentLabel ?? "")}
            unsupportedTooltip={unsupportedTooltip}
          />
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
  return {
    taxonomyView,
    parentAnchored,
    expandable: parentAnchored && typeDisplay === "parent_first",
    groups: taxonomyView.groups,
  };
}
