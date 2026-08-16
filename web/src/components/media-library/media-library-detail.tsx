"use client";

/**
 * media-library-detail.tsx — the per-asset detail rail.
 *
 * THE POINT OF THIS FILE
 * Every tile in the grid used to carry two always-visible text inputs — an alt
 * field and an "Add tag + Enter" field — stacked under the thumbnail. They
 * roughly doubled tile height and turned a media browser into a page of forms.
 * The capability is not removed: it MOVED here, to one rail that shows the
 * asset the operator opened (the ⓘ button on a tile, one click, no selection
 * side effect).
 *
 * SAVE BEHAVIOUR IS UNCHANGED and that is deliberate — same `onSaveAlt` /
 * `onSaveTags` props, same PATCH, same commit-on-blur and Enter-to-add. What
 * changed is where the inputs live. The decisions themselves are in
 * `asset-edits.ts` so a test can prove them without a DOM.
 *
 * Metadata (dimensions, file name, owner, kind) lives here too. It was a
 * permanent third line under every tile and it is not primary information.
 */

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";

import { CHROME_RADII } from "../edit-chrome/kit/tokens";
import { FIELD_KIT } from "../edit-chrome/inspectors/field-kit/tokens";
import type { MediaLibraryWireItem } from "@/lib/media/library-wire";
import {
  altNeedsSave,
  altPayload,
  tagsAfterAdd,
  tagsAfterRemove,
} from "./asset-edits";
import { LIBRARY_FOCUS_CLASS, MediaThumb } from "./media-library-kit";

export type DetailLabels = {
  title: string;
  close: string;
  altLabel: string;
  altPlaceholder: string;
  tagsLabel: string;
  tagPlaceholder: string;
  removeTag: (tag: string) => string;
  dimensions: string;
  fileName: string;
  owner: string;
  saving: string;
  readOnlyHint: string;
};

export function MediaLibraryDetail({
  item,
  labels,
  editable,
  onClose,
  onSaveAlt,
  onSaveTags,
}: {
  item: MediaLibraryWireItem;
  labels: DetailLabels;
  /** False on talent surfaces: the PATCH endpoint is staff-only (would 401). */
  editable: boolean;
  onClose: () => void;
  onSaveAlt?: (item: MediaLibraryWireItem, alt: string) => Promise<void>;
  onSaveTags?: (item: MediaLibraryWireItem, tags: string[]) => Promise<void>;
}) {
  const [altDraft, setAltDraft] = useState(item.alt ?? "");
  const [tagDraft, setTagDraft] = useState("");
  const [busy, setBusy] = useState(false);

  // A new asset opens with the SERVER's alt, never the previous asset's draft.
  useEffect(() => {
    setAltDraft(item.alt ?? "");
    setTagDraft("");
  }, [item.id, item.alt]);

  const run = async (work: Promise<void> | undefined) => {
    if (!work) return;
    setBusy(true);
    try {
      await work;
    } finally {
      setBusy(false);
    }
  };

  const commitAlt = () => {
    if (!onSaveAlt) return;
    if (!altNeedsSave(item.alt, altDraft)) return;
    void run(onSaveAlt(item, altPayload(altDraft)));
  };

  const addTag = () => {
    const next = tagsAfterAdd(item.tags, tagDraft);
    setTagDraft("");
    if (!next || !onSaveTags) return;
    void run(onSaveTags(item, next));
  };

  const removeTag = (tag: string) => {
    const next = tagsAfterRemove(item.tags, tag);
    if (!next || !onSaveTags) return;
    void run(onSaveTags(item, next));
  };

  const dimensions =
    item.width && item.height ? `${item.width}×${item.height}` : item.assetKind;

  return (
    <aside
      className="flex w-[264px] shrink-0 flex-col gap-2 overflow-y-auto border p-2"
      style={{
        borderColor: FIELD_KIT.border,
        borderRadius: CHROME_RADII.md,
        background: FIELD_KIT.surface,
      }}
      aria-label={labels.title}
      data-testid="media-library-detail"
    >
      <div className="flex items-center justify-between gap-2">
        <span
          style={{
            fontSize: FIELD_KIT.font.label,
            fontWeight: FIELD_KIT.weight.label,
            color: FIELD_KIT.ink,
          }}
        >
          {labels.title}
        </span>
        <span className="flex items-center gap-1.5">
          {busy ? (
            <span
              className="inline-flex items-center gap-1"
              style={{ fontSize: FIELD_KIT.font.caption, color: FIELD_KIT.muted }}
              role="status"
            >
              <Loader2 className="size-3 animate-spin" />
              {labels.saving}
            </span>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            aria-label={labels.close}
            className={LIBRARY_FOCUS_CLASS}
            style={{ color: FIELD_KIT.muted }}
          >
            <X className="size-3.5" />
          </button>
        </span>
      </div>

      <span
        className="relative block aspect-[4/5] w-full overflow-hidden"
        style={{
          borderRadius: CHROME_RADII.md,
          background: FIELD_KIT.surfaceRecessed,
        }}
      >
        <MediaThumb item={item} kind={item.assetKind} />
      </span>

      <DetailRow label={labels.fileName} value={item.originalFilename ?? item.storagePath} />
      <DetailRow label={labels.dimensions} value={dimensions} />
      <DetailRow label={labels.owner} value={item.talentName} />

      <div className="grid gap-1">
        <FieldLabel>{labels.altLabel}</FieldLabel>
        {editable && onSaveAlt ? (
          <input
            value={altDraft}
            placeholder={labels.altPlaceholder}
            aria-label={labels.altLabel}
            data-media-detail-alt
            onChange={(event) => setAltDraft(event.currentTarget.value)}
            onBlur={commitAlt}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              event.currentTarget.blur();
            }}
            className={`w-full border px-2 ${LIBRARY_FOCUS_CLASS}`}
            style={{
              height: FIELD_KIT.size.control,
              borderRadius: FIELD_KIT.radius.chip,
              borderColor: FIELD_KIT.border,
              background: FIELD_KIT.surface,
              color: FIELD_KIT.ink,
              fontSize: FIELD_KIT.font.value,
            }}
          />
        ) : (
          <p style={{ fontSize: FIELD_KIT.font.value, color: FIELD_KIT.muted }}>
            {item.alt || labels.readOnlyHint}
          </p>
        )}
      </div>

      <div className="grid gap-1">
        <FieldLabel>{labels.tagsLabel}</FieldLabel>
        {item.tags.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {item.tags.map((tag) => (
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
                {editable && onSaveTags ? (
                  <button
                    type="button"
                    aria-label={labels.removeTag(tag)}
                    disabled={busy}
                    onClick={() => removeTag(tag)}
                    className={LIBRARY_FOCUS_CLASS}
                    style={{ color: FIELD_KIT.accent, lineHeight: 1 }}
                  >
                    ×
                  </button>
                ) : null}
              </span>
            ))}
          </div>
        ) : null}
        {editable && onSaveTags ? (
          <input
            value={tagDraft}
            placeholder={labels.tagPlaceholder}
            aria-label={labels.tagsLabel}
            disabled={busy}
            data-media-detail-tag
            onChange={(event) => setTagDraft(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              event.preventDefault();
              addTag();
            }}
            className={`w-full border px-2 ${LIBRARY_FOCUS_CLASS}`}
            style={{
              height: FIELD_KIT.size.control,
              borderRadius: FIELD_KIT.radius.chip,
              borderColor: FIELD_KIT.border,
              background: FIELD_KIT.surface,
              color: FIELD_KIT.ink,
              fontSize: FIELD_KIT.font.value,
            }}
          />
        ) : null}
      </div>
    </aside>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="uppercase tracking-wide"
      style={{
        fontSize: FIELD_KIT.font.caption,
        fontWeight: FIELD_KIT.weight.label,
        color: FIELD_KIT.mutedSoft,
      }}
    >
      {children}
    </span>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[72px_minmax(0,1fr)] items-baseline gap-2">
      <FieldLabel>{label}</FieldLabel>
      <span
        className="truncate"
        style={{ fontSize: FIELD_KIT.font.caption, color: FIELD_KIT.muted }}
        title={value}
      >
        {value}
      </span>
    </div>
  );
}
