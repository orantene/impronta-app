"use client";

/**
 * media-library-tile.tsx — one asset in the grid.
 *
 * LOCKED TILES ARE STILL RENDERED. An asset the two-key rule will not let this
 * talent use here stays visible, greyed, with the reason on it. A photo that
 * quietly is not there is the "I save and nothing changes" incident class, and
 * this behaviour was hard-won in media-ownership phase 3 — it is preserved
 * exactly, including the request-release door.
 */

import { Check, Lock } from "lucide-react";

import { CHROME, CHROME_RADII, CHROME_SHADOWS } from "../edit-chrome/kit/tokens";
import { FIELD_KIT } from "../edit-chrome/inspectors/field-kit/tokens";
import { KIT } from "../edit-chrome/inspectors/kit/tokens";
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
  /** Reason this asset cannot be picked here, already localized. */
  lockNote: string | null;
  /** Talent scope: is this photo on the talent's public profile? */
  portfolioBadge: "portfolio" | "mine" | null;
  /** Staff scope only — alt + tags are editable through a staff-gated PATCH. */
  editable: boolean;
  savingTags: boolean;
  altDraft: string;
  tagDraft: string;
  /** Roving-focus index; exactly one tile in the grid is tabbable. */
  tabbable: boolean;
  labels: {
    locked: string;
    portfolio: string;
    mine: string;
    altPlaceholder: string;
    tagPlaceholder: string;
    removeTag: (tag: string) => string;
    pending: string;
  };
  onActivate: () => void;
  onAltChange: (value: string) => void;
  onAltCommit: () => void;
  onTagDraftChange: (value: string) => void;
  onTagAdd: () => void;
  onTagRemove: (tag: string) => void;
  /** Rendered under the lock note (the "ask them to release it" door). */
  lockAction?: React.ReactNode;
};

export function MediaLibraryTile(props: MediaLibraryTileProps) {
  const { item, selected, lockNote, labels } = props;
  const locked = lockNote !== null;
  const kind = item.assetKind;
  const dimensions =
    kind === "image" && item.width && item.height
      ? `${item.width}×${item.height}`
      : kind;
  const caption = item.originalFilename ?? item.alt ?? dimensions;

  return (
    <div
      className="overflow-hidden border transition-shadow"
      style={{
        borderColor: selected ? FIELD_KIT.accent : FIELD_KIT.border,
        borderRadius: CHROME_RADII.lg,
        background: FIELD_KIT.surface,
        boxShadow: selected ? CHROME_SHADOWS.cardHi : CHROME_SHADOWS.card,
      }}
      data-media-tile={item.id}
    >
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
        className={`relative block w-full text-left ${LIBRARY_FOCUS_CLASS} ${
          locked ? "cursor-not-allowed opacity-50" : "cursor-pointer"
        }`}
        style={{ background: FIELD_KIT.surfaceRecessed }}
        data-asset-kind={kind}
        data-locked={locked ? "true" : undefined}
      >
        <MediaThumb item={item} kind={kind} />

        {kind !== "image" ? (
          <ThumbBadge className="absolute left-2 top-2">
            <KindGlyph kind={kind} />
            {kind}
          </ThumbBadge>
        ) : props.portfolioBadge ? (
          <ThumbBadge
            className="absolute left-2 top-2"
            tone={props.portfolioBadge === "portfolio" ? "accent" : "light"}
          >
            {props.portfolioBadge === "portfolio" ? labels.portfolio : labels.mine}
          </ThumbBadge>
        ) : null}

        {item.approvalState === "pending" ? (
          <ThumbBadge className="absolute bottom-2 left-2" tone="light">
            {labels.pending}
          </ThumbBadge>
        ) : null}

        {locked ? (
          <ThumbBadge className="absolute right-2 top-2">
            <Lock className="size-2.5" />
            {labels.locked}
          </ThumbBadge>
        ) : selected ? (
          <span
            className="absolute right-2 top-2 inline-flex size-6 items-center justify-center rounded-full"
            style={{
              background: FIELD_KIT.accent,
              color: "#ffffff",
              boxShadow: CHROME_SHADOWS.card,
            }}
            aria-hidden
          >
            <Check className="size-3.5" />
          </span>
        ) : null}
      </button>

      <div className="grid gap-2 p-2">
        {lockNote ? (
          <p
            style={{
              fontSize: FIELD_KIT.font.caption,
              color: CHROME.blue,
              lineHeight: 1.4,
            }}
          >
            {lockNote}
          </p>
        ) : null}
        {lockNote ? props.lockAction ?? null : null}

        {props.editable ? (
          <>
            <input
              className={KIT.input}
              value={props.altDraft}
              placeholder={labels.altPlaceholder}
              onClick={(event) => event.stopPropagation()}
              onChange={(event) => props.onAltChange(event.currentTarget.value)}
              onBlur={props.onAltCommit}
              onKeyDown={(event) => {
                // Arrow keys belong to the grid's roving focus; inside a text
                // field they belong to the caret. Stop them here or typing an
                // alt text jumps the selection to another tile.
                event.stopPropagation();
                if (event.key !== "Enter") return;
                event.preventDefault();
                event.currentTarget.blur();
              }}
            />
            <TagRow
              tags={item.tags}
              value={props.tagDraft}
              saving={props.savingTags}
              placeholder={labels.tagPlaceholder}
              removeLabel={labels.removeTag}
              onChange={props.onTagDraftChange}
              onAdd={props.onTagAdd}
              onRemove={props.onTagRemove}
            />
          </>
        ) : item.alt ? (
          <p
            className="truncate"
            style={{ fontSize: FIELD_KIT.font.caption, color: FIELD_KIT.muted }}
            title={item.alt}
          >
            {item.alt}
          </p>
        ) : null}

        <p
          className="truncate"
          style={{ fontSize: FIELD_KIT.font.caption, color: FIELD_KIT.mutedSoft }}
        >
          {dimensions}
        </p>
      </div>
    </div>
  );
}

function TagRow({
  tags,
  value,
  saving,
  placeholder,
  removeLabel,
  onChange,
  onAdd,
  onRemove,
}: {
  tags: string[];
  value: string;
  saving: boolean;
  placeholder: string;
  removeLabel: (tag: string) => string;
  onChange: (value: string) => void;
  onAdd: () => void;
  onRemove: (tag: string) => void;
}) {
  return (
    <div className="grid gap-1" onClick={(event) => event.stopPropagation()}>
      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 px-2 py-0.5"
              style={{
                background: FIELD_KIT.accentFill,
                color: FIELD_KIT.accent,
                borderRadius: CHROME_RADII.xl,
                fontSize: FIELD_KIT.font.caption,
                fontWeight: FIELD_KIT.weight.caption,
              }}
            >
              {tag}
              <button
                type="button"
                aria-label={removeLabel(tag)}
                disabled={saving}
                onClick={() => onRemove(tag)}
                className={LIBRARY_FOCUS_CLASS}
                style={{ color: FIELD_KIT.accent, lineHeight: 1 }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <input
        className={KIT.input}
        value={value}
        placeholder={placeholder}
        disabled={saving}
        onChange={(event) => onChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key !== "Enter") return;
          event.preventDefault();
          onAdd();
        }}
      />
    </div>
  );
}
