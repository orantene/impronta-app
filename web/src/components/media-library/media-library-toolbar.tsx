"use client";

/**
 * media-library-toolbar.tsx — ONE row above the grid.
 *
 * WHAT IT REPLACES (owner feedback, 2026-08-16: "it looks like shit")
 * The library shipped with FOUR stacked strips before a single image: a search
 * row, a kind chip row, an ownership chip row, and a folder chip row, plus a
 * fifth line for "Showing 60 of 1883". On the drawer that is ~200px of chrome
 * spent on filters that are used rarely, above a grid that is the actual
 * product. Everything except search, the talent select and Upload now lives
 * behind one "Filters" button, and the count is inline.
 *
 * The chips inside the popover are the SAME `LibraryChip` as before — this is
 * a relocation, not a rewrite of the filter model, and no filter was dropped.
 */

import { useState } from "react";
import { Loader2, Search, SlidersHorizontal, Upload, X } from "lucide-react";

import { FIELD_KIT } from "../edit-chrome/inspectors/field-kit/tokens";
import { Button } from "../edit-chrome/kit/button";
import type { MediaLibraryWireFolder, MediaLibraryWireTalent } from "@/lib/media/library-wire";
import type {
  MediaLibraryKindFilter,
  MediaLibraryOwnershipFilter,
} from "@/lib/media/library-item";
import {
  KindGlyph,
  LIBRARY_FOCUS_CLASS,
  LibraryChip,
  LibraryPopover,
  LibraryPopoverGroup,
} from "./media-library-kit";
import {
  MediaLibraryTalentSelect,
  type TalentSelectLabels,
} from "./media-library-talent-select";
import type { MediaLibraryFilters } from "./use-media-library";

const KIND_LANES = ["all", "image", "video", "document"] as const;
const OWNERSHIP_LANES = ["all", "workspace", "talent", "platform"] as const;

export type ToolbarLabels = {
  searchPlaceholder: string;
  searchLabel: string;
  clearSearch: string;
  filters: string;
  clearFilters: string;
  showing: string;
  upload: string;
  uploading: string;
  kindLane: string;
  ownershipLane: string;
  folderLane: string;
  allFolders: string;
  privateFolder: string;
  kindOf: (lane: MediaLibraryKindFilter) => string;
  ownershipOf: (lane: MediaLibraryOwnershipFilter) => string;
  talent: TalentSelectLabels;
};

export function MediaLibraryToolbar(props: {
  /** Staff surfaces get kind / ownership / talent; a talent surface does not. */
  isStaff: boolean;
  filters: MediaLibraryFilters;
  setFilters: (
    update: (prev: MediaLibraryFilters) => MediaLibraryFilters,
  ) => void;
  searchDraft: string;
  setSearchDraft: (value: string) => void;
  folders: ReadonlyArray<MediaLibraryWireFolder>;
  talents: ReadonlyArray<MediaLibraryWireTalent>;
  shown: number;
  total: number;
  hasFilters: boolean;
  onClearFilters: () => void;
  labels: ToolbarLabels;
  uploading?: boolean;
  /** Whole-batch percent (0–100) while uploading; null hides the number. */
  uploadProgressPct?: number | null;
  onUploadClick?: () => void;
}) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { filters, labels, setFilters } = props;

  /** How many filter LANES are narrowed, shown as a badge on the button. */
  const activeLaneCount =
    (filters.kind !== "all" ? 1 : 0) +
    (filters.ownership !== "all" ? 1 : 0) +
    (filters.folderId ? 1 : 0);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative min-w-[180px] flex-1">
        <Search
          className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2"
          style={{ color: FIELD_KIT.mutedSoft }}
          aria-hidden
        />
        <input
          type="search"
          value={props.searchDraft}
          onChange={(event) => props.setSearchDraft(event.currentTarget.value)}
          placeholder={labels.searchPlaceholder}
          aria-label={labels.searchLabel}
          className={`w-full border pl-8 pr-8 ${LIBRARY_FOCUS_CLASS}`}
          style={{
            height: FIELD_KIT.size.control,
            borderRadius: FIELD_KIT.radius.chip,
            borderColor: FIELD_KIT.border,
            background: FIELD_KIT.surface,
            color: FIELD_KIT.ink,
            fontSize: FIELD_KIT.font.value,
          }}
        />
        {props.searchDraft ? (
          <button
            type="button"
            onClick={() => props.setSearchDraft("")}
            aria-label={labels.clearSearch}
            className={`absolute right-2 top-1/2 -translate-y-1/2 ${LIBRARY_FOCUS_CLASS}`}
            style={{ color: FIELD_KIT.muted }}
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>

      {props.isStaff ? (
        <MediaLibraryTalentSelect
          talents={props.talents}
          value={filters.talentProfileId}
          labels={labels.talent}
          onChange={(talentProfileId) =>
            setFilters((prev) => ({ ...prev, talentProfileId }))
          }
        />
      ) : null}

      <div className="relative">
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((prev) => !prev)}
          className={`inline-flex shrink-0 items-center gap-1.5 border transition-colors ${LIBRARY_FOCUS_CLASS}`}
          style={{
            background: activeLaneCount > 0 ? FIELD_KIT.accentFill : FIELD_KIT.surface,
            borderColor: activeLaneCount > 0 ? FIELD_KIT.accent : FIELD_KIT.border,
            color: activeLaneCount > 0 ? FIELD_KIT.accent : FIELD_KIT.muted,
            borderRadius: FIELD_KIT.radius.chip,
            fontSize: FIELD_KIT.font.label,
            fontWeight: FIELD_KIT.weight.label,
            height: FIELD_KIT.size.control,
            padding: "0 10px",
          }}
          data-media-filters-button
        >
          <SlidersHorizontal className="size-3.5" aria-hidden />
          {labels.filters}
          {activeLaneCount > 0 ? <span>{activeLaneCount}</span> : null}
        </button>

        <LibraryPopover
          open={filtersOpen}
          onClose={() => setFiltersOpen(false)}
          label={labels.filters}
          align="right"
        >
          {props.isStaff ? (
            <div data-media-kind-filter>
              <LibraryPopoverGroup title={labels.kindLane}>
                {KIND_LANES.map((lane) => (
                  <LibraryChip
                    key={lane}
                    active={filters.kind === lane}
                    label={labels.kindOf(lane)}
                    icon={lane === "all" ? undefined : <KindGlyph kind={lane} />}
                    onClick={() => setFilters((prev) => ({ ...prev, kind: lane }))}
                  />
                ))}
              </LibraryPopoverGroup>
            </div>
          ) : null}

          {props.isStaff ? (
            <div data-media-ownership-filter>
              <LibraryPopoverGroup title={labels.ownershipLane}>
                {OWNERSHIP_LANES.map((lane) => (
                  <LibraryChip
                    key={lane}
                    active={filters.ownership === lane}
                    label={labels.ownershipOf(lane)}
                    onClick={() =>
                      setFilters((prev) => ({ ...prev, ownership: lane }))
                    }
                  />
                ))}
              </LibraryPopoverGroup>
            </div>
          ) : null}

          {props.folders.length > 0 ? (
            <div data-media-folder-filter>
              <LibraryPopoverGroup title={labels.folderLane}>
                <LibraryChip
                  active={!filters.folderId}
                  label={labels.allFolders}
                  onClick={() => setFilters((prev) => ({ ...prev, folderId: null }))}
                />
                {props.folders.map((folder) => (
                  <LibraryChip
                    key={folder.id}
                    active={filters.folderId === folder.id}
                    label={folder.name}
                    swatch={folder.color}
                    count={folder.assetCount}
                    hint={folder.isPrivate ? labels.privateFolder : undefined}
                    onClick={() =>
                      setFilters((prev) => ({
                        ...prev,
                        folderId: prev.folderId === folder.id ? null : folder.id,
                      }))
                    }
                  />
                ))}
              </LibraryPopoverGroup>
            </div>
          ) : null}
        </LibraryPopover>
      </div>

      {/* The count is a fact about the grid, not a row of its own. */}
      <span
        data-testid="media-library-count"
        style={{ fontSize: FIELD_KIT.font.caption, color: FIELD_KIT.muted }}
      >
        {labels.showing
          .replace("{shown}", String(props.shown))
          .replace("{total}", String(props.total))}
      </span>

      {props.hasFilters ? (
        <button
          type="button"
          className={LIBRARY_FOCUS_CLASS}
          style={{
            color: FIELD_KIT.accent,
            fontSize: FIELD_KIT.font.label,
            fontWeight: FIELD_KIT.weight.label,
          }}
          onClick={props.onClearFilters}
        >
          {labels.clearFilters}
        </button>
      ) : null}

      {props.onUploadClick ? (
        <Button
          type="button"
          size="sm"
          disabled={props.uploading}
          onClick={props.onUploadClick}
        >
          {props.uploading ? (
            <Loader2 className="mr-1.5 size-3.5 animate-spin" />
          ) : (
            <Upload className="mr-1.5 size-3.5" />
          )}
          {props.uploading
            ? props.uploadProgressPct != null
              ? `${labels.uploading} ${props.uploadProgressPct}%`
              : labels.uploading
            : labels.upload}
        </Button>
      ) : null}

      {/* Byte-real batch progress. The spinner alone reads as "maybe hung" on
          a 20 MB video over hotel wifi; the bar is the difference between an
          operator waiting and an operator re-clicking Upload. */}
      {props.uploading && props.uploadProgressPct != null ? (
        <div
          className="h-1 w-full overflow-hidden rounded-full"
          style={{ background: FIELD_KIT.border }}
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={props.uploadProgressPct}
          aria-label={labels.uploading}
        >
          <div
            className="h-full rounded-full [transition:width_200ms]"
            style={{
              width: `${props.uploadProgressPct}%`,
              background: FIELD_KIT.accent,
            }}
          />
        </div>
      ) : null}
    </div>
  );
}
