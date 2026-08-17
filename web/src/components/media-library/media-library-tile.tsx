"use client";

/**
 * media-library-tile.tsx — one asset in the grid. AN IMAGE, not a form.
 *
 * 2026-08-16 density pass. This tile used to render, under every thumbnail: an
 * alt-text input, a tag input with its chip row, and a permanent dimensions
 * caption. Three stacked controls per asset, on a grid whose job is to let
 * someone find a photo. They are gone from here — alt + tags + metadata live
 * in the detail rail (`media-library-detail.tsx`), one click away via the ⓘ
 * button, and the capability is unchanged.
 *
 * LOCKED TILES ARE STILL RENDERED. An asset the two-key rule will not let this
 * talent use here stays visible, greyed, with the reason on it. A photo that
 * quietly is not there is the "I save and nothing changes" incident class, and
 * this behaviour was hard-won in media-ownership phase 3 — it is preserved
 * exactly, including the request-release door.
 */

import { Check, Info, Lock } from "lucide-react";

import { CHROME, CHROME_RADII, CHROME_SHADOWS } from "../edit-chrome/kit/tokens";
import { FIELD_KIT } from "../edit-chrome/inspectors/field-kit/tokens";
import type { MediaLibraryWireItem } from "@/lib/media/library-wire";
import {
  KindGlyph,
  LIBRARY_FOCUS_CLASS,
  MediaThumb,
  ThumbBadge,
} from "./media-library-kit";

export type MediaLibraryTileProps = {
  item: MediaLibraryWireItem;
  selected: boolean;
  /** True while this asset is the one open in the detail rail. */
  detailOpen: boolean;
  /** Reason this asset cannot be picked here, already localized. */
  lockNote: string | null;
  /** Talent scope: is this photo on the talent's public profile? */
  portfolioBadge: "portfolio" | "mine" | null;
  /** Roving-focus index; exactly one tile in the grid is tabbable. */
  tabbable: boolean;
  labels: {
    locked: string;
    portfolio: string;
    mine: string;
    pending: string;
    details: string;
  };
  onActivate: () => void;
  /** Open this asset in the detail rail WITHOUT picking it. */
  onOpenDetails: () => void;
  /** Rendered under the lock note (the "ask them to release it" door). */
  lockAction?: React.ReactNode;
  /**
   * Optional top-right chip (the editor's "Used · N" / "Unused" usage badge).
   * Yields to the lock badge and the selected check, which both own that
   * corner and both say something more urgent.
   */
  cornerBadge?: React.ReactNode;
};

export function MediaLibraryTile(props: MediaLibraryTileProps) {
  const { item, selected, lockNote, labels } = props;
  const locked = lockNote !== null;
  const kind = item.assetKind;
  const caption =
    item.originalFilename ??
    item.alt ??
    (item.width && item.height ? `${item.width}×${item.height}` : kind);

  const ring = props.detailOpen
    ? FIELD_KIT.accent
    : selected
      ? FIELD_KIT.accent
      : FIELD_KIT.border;

  return (
    <div className="group relative" data-media-tile={item.id}>
      <button
        type="button"
        disabled={locked}
        title={lockNote ?? caption ?? undefined}
        aria-label={caption ?? item.id}
        aria-pressed={selected}
        tabIndex={props.tabbable ? 0 : -1}
        data-media-tile-button={item.id}
        onClick={() => {
          if (!locked) props.onActivate();
        }}
        className={`relative block aspect-square w-full overflow-hidden border text-left transition-shadow ${LIBRARY_FOCUS_CLASS} ${
          locked ? "cursor-not-allowed opacity-50" : "cursor-pointer"
        }`}
        style={{
          borderColor: ring,
          borderWidth: selected || props.detailOpen ? 2 : 1,
          borderRadius: CHROME_RADII.md,
          background: FIELD_KIT.surfaceRecessed,
          boxShadow: selected ? CHROME_SHADOWS.cardHi : "none",
        }}
        data-asset-kind={kind}
        data-locked={locked ? "true" : undefined}
      >
        <MediaThumb item={item} kind={kind} />

        {kind !== "image" ? (
          <ThumbBadge className="absolute left-1 top-1">
            <KindGlyph kind={kind} />
            {kind}
          </ThumbBadge>
        ) : props.portfolioBadge ? (
          <ThumbBadge
            className="absolute left-1 top-1"
            tone={props.portfolioBadge === "portfolio" ? "accent" : "light"}
          >
            {props.portfolioBadge === "portfolio" ? labels.portfolio : labels.mine}
          </ThumbBadge>
        ) : null}

        {item.approvalState === "pending" ? (
          <ThumbBadge className="absolute bottom-1 left-1" tone="light">
            {labels.pending}
          </ThumbBadge>
        ) : null}

        {locked ? (
          <ThumbBadge className="absolute right-1 top-1">
            <Lock className="size-2.5" />
            {labels.locked}
          </ThumbBadge>
        ) : selected ? (
          <span
            className="absolute right-1 top-1 inline-flex size-5 items-center justify-center rounded-full"
            style={{
              background: FIELD_KIT.accent,
              color: "#ffffff",
              boxShadow: CHROME_SHADOWS.card,
            }}
            aria-hidden
          >
            <Check className="size-3" />
          </span>
        ) : props.cornerBadge ? (
          <span className="absolute right-1 top-1">{props.cornerBadge}</span>
        ) : null}

        {/* The file name, on hover only. It was a permanent caption line under
            every tile; it is context, not content. */}
        <span
          className="pointer-events-none absolute inset-x-0 bottom-0 truncate px-1.5 py-1 opacity-0 transition-opacity group-hover:opacity-100"
          style={{
            background: "linear-gradient(transparent, rgba(36, 41, 66, 0.78))",
            color: "#ffffff",
            fontSize: FIELD_KIT.font.caption,
          }}
          aria-hidden
        >
          {caption}
        </span>
      </button>

      {/* ⓘ — opens the detail rail. A SEPARATE control from the tile because
          activating a tile in single-select mode picks the asset and closes
          the drawer, which would make alt/tag editing unreachable. */}
      <button
        type="button"
        aria-label={labels.details}
        title={labels.details}
        tabIndex={props.tabbable ? 0 : -1}
        data-media-tile-details={item.id}
        onClick={(event) => {
          event.stopPropagation();
          props.onOpenDetails();
        }}
        className={`absolute bottom-1 right-1 inline-flex size-5 items-center justify-center rounded-full opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 ${LIBRARY_FOCUS_CLASS} ${
          props.detailOpen ? "!opacity-100" : ""
        }`}
        style={{
          background: props.detailOpen ? FIELD_KIT.accent : "rgba(255,255,255,0.94)",
          color: props.detailOpen ? "#ffffff" : CHROME.text,
          boxShadow: CHROME_SHADOWS.card,
        }}
      >
        <Info className="size-3" />
      </button>

      {lockNote ? (
        <div className="grid gap-1 pt-1">
          <p
            style={{
              fontSize: FIELD_KIT.font.caption,
              color: CHROME.blue,
              lineHeight: 1.35,
            }}
          >
            {lockNote}
          </p>
          {props.lockAction ?? null}
        </div>
      ) : null}
    </div>
  );
}
