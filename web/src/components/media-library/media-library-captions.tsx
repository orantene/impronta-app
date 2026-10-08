"use client";

/**
 * media-library-captions.tsx — the per-language photo caption fields in the
 * detail rail (TUL-229). Talent scope only: the host passes `editor` when the
 * viewer is the talent. One text field per enabled language (primary first),
 * saved on blur. The section is a collapsed <details> so the rail stays calm.
 */

import { useEffect, useState } from "react";

import { FIELD_KIT } from "../edit-chrome/inspectors/field-kit/tokens";
import type { MediaLibraryWireItem } from "@/lib/media/library-wire";
import {
  PHOTO_CAPTION_MAX_CHARS,
  captionNeedsSave,
  readCaptionDrafts,
} from "@/lib/site-admin/media/photo-caption-edit";
import { LIBRARY_FOCUS_CLASS } from "./media-library-kit";

export type CaptionEditor = {
  /** Primary language first, then the enabled second languages. */
  locales: ReadonlyArray<string>;
  primary: string;
  onSave: (item: MediaLibraryWireItem, locale: string, text: string) => Promise<void>;
};

export type CaptionLabels = {
  section: string;
  hint: string;
  placeholder: string;
  /** "{language}" is replaced with the language name. */
  fieldLabel: string;
};

function languageName(code: string): string {
  try {
    const name = new Intl.DisplayNames([code], { type: "language" }).of(code);
    if (name) return name.charAt(0).toUpperCase() + name.slice(1);
  } catch {
    // fall through to the bare code
  }
  return code.toUpperCase();
}

function storedMetadata(item: MediaLibraryWireItem): Record<string, unknown> {
  return { caption: item.caption ?? "", caption_i18n: item.captionI18n ?? {} };
}

export function MediaLibraryCaptions({
  item,
  editor,
  labels,
}: {
  item: MediaLibraryWireItem;
  editor: CaptionEditor;
  labels: CaptionLabels;
}) {
  const stored = readCaptionDrafts(storedMetadata(item), editor.locales, editor.primary);
  const [drafts, setDrafts] = useState<Record<string, string>>(stored);
  const storedKey = JSON.stringify(stored);

  // A new asset (or a saved value) resets the drafts to the SERVER's text.
  useEffect(() => {
    setDrafts(JSON.parse(storedKey) as Record<string, string>);
  }, [item.id, storedKey]);

  const commit = (locale: string) => {
    const key = locale.slice(0, 2).toLowerCase();
    if (!captionNeedsSave(stored[key], drafts[key] ?? "")) return;
    void editor.onSave(item, locale, drafts[key] ?? "");
  };

  return (
    <details className="grid gap-1" data-media-detail-captions>
      <summary
        className={`cursor-pointer uppercase tracking-wide ${LIBRARY_FOCUS_CLASS}`}
        style={{
          fontSize: FIELD_KIT.font.caption,
          fontWeight: FIELD_KIT.weight.label,
          color: FIELD_KIT.mutedSoft,
        }}
      >
        {labels.section}
      </summary>
      <div className="grid gap-2 pt-1">
        <p style={{ fontSize: FIELD_KIT.font.caption, color: FIELD_KIT.muted }}>
          {labels.hint}
        </p>
        {editor.locales.map((locale) => {
          const key = locale.slice(0, 2).toLowerCase();
          // Another language's caption shows as the placeholder hint.
          const hintFromOther = Object.entries(drafts).find(
            ([k, v]) => k !== key && v.trim(),
          )?.[1];
          const label = labels.fieldLabel.replace("{language}", languageName(key));
          return (
            <label key={key} className="grid gap-0.5">
              <span style={{ fontSize: FIELD_KIT.font.caption, color: FIELD_KIT.muted }}>
                {label}
              </span>
              <input
                value={drafts[key] ?? ""}
                maxLength={PHOTO_CAPTION_MAX_CHARS}
                lang={key}
                placeholder={hintFromOther ?? labels.placeholder}
                aria-label={label}
                data-media-detail-caption={key}
                onChange={(event) => {
                  const next = event.currentTarget.value;
                  setDrafts((prev) => ({ ...prev, [key]: next }));
                }}
                onBlur={() => commit(locale)}
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
            </label>
          );
        })}
      </div>
    </details>
  );
}
