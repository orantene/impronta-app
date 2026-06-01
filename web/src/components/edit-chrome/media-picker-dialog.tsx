"use client";

/**
 * Back-compat controlled picker used by canvas image replacement.
 * The UI is now the canonical media picker drawer.
 */

import { MediaPickerDrawer } from "./media-picker-drawer";

interface Props {
  tenantId: string;
  open: boolean;
  onPick: (publicUrl: string) => void;
  onClose: () => void;
}

export function MediaPickerDialog({ tenantId, open, onPick, onClose }: Props) {
  return (
    <MediaPickerDrawer
      tenantId={tenantId}
      open={open}
      title="Replace image"
      onPick={onPick}
      onClose={onClose}
    />
  );
}
