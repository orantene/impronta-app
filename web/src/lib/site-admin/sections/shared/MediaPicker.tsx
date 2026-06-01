"use client";

/**
 * Shared tenant media picker for section editors.
 *
 * This wrapper keeps the existing trigger-button API while delegating the
 * actual library, upload, alt editing, and selection UI to the editor chrome
 * drawer. Server routes verify tenant scope on every list/upload/update call.
 */

import { useState } from "react";
import { ImageIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  MediaPickerDrawer,
  type MediaPickedItem,
} from "@/components/edit-chrome/media-picker-drawer";

export type { MediaPickedItem };

export interface MediaPickerProps {
  tenantId: string;
  onPick: (publicUrl: string) => void;
  onPickItem?: (item: MediaPickedItem) => void;
  label?: string;
  disabled?: boolean;
  multi?: boolean;
  onMultiPick?: (publicUrls: string[]) => void;
}

export function MediaPicker({
  tenantId,
  onPick,
  onPickItem,
  label = "Browse library",
  disabled,
  multi = false,
  onMultiPick,
}: MediaPickerProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="outline"
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <ImageIcon className="mr-1.5 size-3.5" />
        {label}
      </Button>

      <MediaPickerDrawer
        tenantId={tenantId}
        open={open}
        multi={multi}
        onPick={onPick}
        onPickItem={onPickItem}
        onMultiPick={onMultiPick}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
