"use client";

/**
 * Free-plan structure lock tip for builder chrome (navigator / layers /
 * selection). Shows ⓘ "Disponible en Oficina Web" / "Available on Web Office"
 * with a "Ver planes" / "See plans" link. Pure presentational; callers decide
 * when to mount (structuralEdits === false).
 */

import { galleryLockedHint, GALLERY_LOCKED_UPGRADE_HREF } from "@/lib/site-admin/add-gallery/structural-lock";
import { CHROME } from "./kit";

export function StructureEditLockTip({
  locale,
  compact = false,
}: {
  locale?: string | null;
  /** Smaller chip for inline row headers. */
  compact?: boolean;
}) {
  const hint = galleryLockedHint(locale);
  return (
    <span
      role="note"
      data-structure-edit-lock-tip=""
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: compact ? 6 : 8,
        flexWrap: "wrap",
        fontSize: compact ? 11 : 12,
        lineHeight: 1.3,
        color: CHROME.muted,
      }}
    >
      <span aria-hidden style={{ fontWeight: 700, color: CHROME.ink2 }}>
        ⓘ
      </span>
      <span style={{ color: CHROME.ink2, fontWeight: 600 }}>{hint.title}</span>
      <a
        href={GALLERY_LOCKED_UPGRADE_HREF}
        data-structure-edit-lock-cta=""
        style={{
          color: CHROME.ink,
          fontWeight: 700,
          textDecoration: "underline",
          textUnderlineOffset: 2,
        }}
      >
        {hint.cta}
      </a>
    </span>
  );
}
