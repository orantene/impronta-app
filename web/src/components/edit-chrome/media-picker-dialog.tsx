"use client";

/**
 * Back-compat controlled picker used by canvas image replacement.
 * The UI is now the canonical media picker drawer.
 */

import { MediaPickerDrawer, type MediaPickedItem } from "./media-picker-drawer";

export type { MediaPickedItem };

interface Props {
  tenantId: string;
  open: boolean;
  onPick: (publicUrl: string) => void;
  /**
   * Fired alongside `onPick` with the full picked asset (id + publicUrl).
   * Callers that need to persist the media-library id (so the published
   * renderer can resolve `mediaId` → asset, not just a raw `src` string)
   * should use this instead of `onPick`.
   */
  onPickItem?: (item: MediaPickedItem) => void;
  onClose: () => void;
}

export function MediaPickerDialog({
  tenantId,
  open,
  onPick,
  onPickItem,
  onClose,
}: Props) {
  return (
    <MediaPickerDrawer
      tenantId={tenantId}
      open={open}
      title="Replace image"
      onPick={onPick}
      onPickItem={onPickItem}
      onClose={onClose}
    />
  );
}
