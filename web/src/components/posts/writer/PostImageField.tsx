"use client";

/**
 * PostImageField — the writer's one image control.
 *
 * It does NOT add an upload path: it is the existing `MediaField` (library
 * picker + drop-to-upload, talent or workspace scope) mounted inside the same
 * `BuilderMediaScopeProvider` the talent site builder uses. A non-null
 * `talentProfileId` makes the picker read the talent's own library and upload
 * through the talent endpoint; null keeps the workspace library.
 */

import { BuilderMediaScopeProvider } from "@/components/edit-chrome/builder-media-scope";
import {
  MediaField,
  type MediaFieldLayout,
  type MediaFieldValue,
} from "@/components/edit-chrome/inspectors/kit/media-field";

export type PostImageFieldProps = {
  value: MediaFieldValue | null;
  onChange: (next: MediaFieldValue | null) => void;
  /** Workspace the media library belongs to ("" for a talent without one). */
  mediaTenantId: string;
  /** Set on the talent dashboard so the picker shows the talent's own library. */
  mediaTalentProfileId: string | null;
  layout?: MediaFieldLayout;
  aspect?: "16/9" | "4/5" | "1/1" | "21/9";
  emptyLabel: string;
  disabled?: boolean;
};

export function PostImageField({
  value,
  onChange,
  mediaTenantId,
  mediaTalentProfileId,
  layout = "tile",
  aspect = "16/9",
  emptyLabel,
  disabled = false,
}: PostImageFieldProps) {
  return (
    <BuilderMediaScopeProvider talentProfileId={mediaTalentProfileId}>
      <MediaField
        tenantId={mediaTenantId}
        value={value}
        onChange={onChange}
        layout={layout}
        aspect={aspect}
        emptyLabel={emptyLabel}
        allowUrlPaste={false}
        disabled={disabled}
      />
    </BuilderMediaScopeProvider>
  );
}
