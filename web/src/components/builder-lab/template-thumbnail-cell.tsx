"use client";

/**
 * TemplateThumbnailCell (A2) — the shared "Set thumbnail" affordance used by BOTH
 * the Starter Kit table (catalog-starter-kit.tsx) and the Template Manager card
 * (template-manager.tsx).
 *
 * Renders the row's resolved thumbnail (or a labelled placeholder when none is
 * set), and opens the existing `MediaPickerDrawer` to choose a `media_assets`
 * row. The chosen asset's id is persisted via `updateTemplateDraft`
 * ({ thumbnail_asset_id }) by the parent's `onPick` callback; its public URL
 * (returned by the picker) is rendered immediately. A "Remove" affordance clears
 * the column.
 *
 * Async state is always explicit (the admin-edit-UX bar): the cell shows a
 * "Saving…" overlay while the parent's persist promise is in flight, and surfaces
 * the resolved/empty state with a persistent label — never a silent wait.
 *
 * The cell is presentational + drawer-owning only; the persist + reload lives in
 * the parent so it shares the parent's pending/toast plumbing.
 */

import { useState } from "react";

import { MediaPickerDrawer } from "@/components/edit-chrome/media-picker-drawer";
import { LAB, RADII } from "./ui";

export interface TemplateThumbnailCellProps {
  /** Tenant scope for the media picker (the Lab's hub tenant). When null the
   *  picker can't open — the affordance renders disabled with a hint. */
  tenantId: string | null;
  /** The currently-resolved public URL for this row's thumbnail, if any. */
  thumbUrl: string | null;
  /** True while the parent's persist promise is in flight (saving overlay). */
  busy?: boolean;
  /** Compact variant for dense table rows (smaller box). */
  size?: "sm" | "md";
  /** Persist the chosen asset. `assetId=null` clears the thumbnail. The picker
   *  also hands back the chosen asset's public URL so the parent can render it
   *  optimistically without a resolve round-trip. */
  onPick: (assetId: string | null, publicUrl: string | null) => void;
}

export function TemplateThumbnailCell({
  tenantId,
  thumbUrl,
  busy,
  size = "md",
  onPick,
}: TemplateThumbnailCellProps) {
  const [open, setOpen] = useState(false);
  const box = size === "sm" ? 40 : 56;

  return (
    <div style={{ display: "inline-flex", flexDirection: "column", gap: 4 }}>
      <button
        type="button"
        data-testid="lab-template-thumbnail-trigger"
        onClick={() => {
          if (tenantId) setOpen(true);
        }}
        disabled={!tenantId || busy}
        title={
          !tenantId
            ? "No media scope available"
            : thumbUrl
              ? "Change thumbnail"
              : "Set a thumbnail image"
        }
        aria-label={thumbUrl ? "Change thumbnail" : "Set thumbnail"}
        style={{
          position: "relative",
          width: box,
          height: Math.round((box * 5) / 4), // 4:5 card preview
          borderRadius: RADII.icon,
          border: `1px solid ${thumbUrl ? LAB.border : LAB.borderSoft}`,
          background: thumbUrl ? LAB.card : LAB.cardSoft,
          backgroundImage: thumbUrl ? `url(${JSON.stringify(thumbUrl)})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
          cursor: tenantId && !busy ? "pointer" : "default",
          padding: 0,
          overflow: "hidden",
          flex: "0 0 auto",
          opacity: busy ? 0.6 : 1,
        }}
      >
        {!thumbUrl ? (
          <span
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: "100%",
              height: "100%",
              fontSize: size === "sm" ? 8.5 : 9.5,
              fontWeight: 600,
              letterSpacing: 0.3,
              lineHeight: 1.25,
              textAlign: "center",
              color: LAB.inkDim,
              padding: 4,
            }}
          >
            Set
            <br />
            thumb
          </span>
        ) : null}
        {busy ? (
          <span
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "rgba(15,15,17,0.55)",
              color: LAB.ink,
              fontSize: 8.5,
              fontWeight: 600,
            }}
          >
            Saving…
          </span>
        ) : null}
      </button>
      {thumbUrl ? (
        <button
          type="button"
          data-testid="lab-template-thumbnail-remove"
          onClick={() => onPick(null, null)}
          disabled={busy}
          style={{
            border: "none",
            background: "transparent",
            color: LAB.inkDim,
            fontSize: 9.5,
            fontWeight: 600,
            cursor: busy ? "default" : "pointer",
            padding: 0,
          }}
        >
          Remove
        </button>
      ) : null}

      {tenantId ? (
        <MediaPickerDrawer
          tenantId={tenantId}
          open={open}
          title="Choose a thumbnail"
          onClose={() => setOpen(false)}
          // The picker fires BOTH onPick (url-only) and onPickItem (id + url) on
          // every pick. We persist the asset id, so we only act on onPickItem;
          // onPick is a required no-op here so the null id never clobbers the
          // real one.
          onPick={() => {}}
          onPickItem={(item) => {
            setOpen(false);
            onPick(item.id, item.publicUrl);
          }}
        />
      ) : null}
    </div>
  );
}
