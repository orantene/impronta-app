/**
 * Media action input/result types (pure, no directive). Extracted verbatim
 * from `actions.ts`, which re-exports every name so import paths stay
 * byte-stable.
 */

export type RegisterMediaResult =
  | {
      ok: true;
      data: {
        id: string;
        publicUrl: string;
        sourceMediaAssetId: string | null;
        sortOrder: number;
      };
    }
  | {
      ok: false;
      error: string;
      /**
       * Set when the refusal is a plan quota block rather than a transport
       * failure. The signed-upload client wrapper retries a failed register
       * through the legacy pipeline; a quota refusal must NOT be retried, or
       * the talent sees an unrelated error and we do the work twice.
       */
      quotaBlocked?: boolean;
    };

export type UploadVariant = "gallery" | "card" | "hero" | "lightbox" | "polaroid" | "reel";

export type StagedMediaMeta = {
  width: number | null;
  height: number | null;
  fileSizeBytes: number;
  mimeType: string;
  originalFilename: string;
};

export type BulkAssignAssignment = {
  storagePath: string;
  talentProfileId: string;
  meta?: StagedMediaMeta;
};

export type RegisterUploadedAssetInput = {
  storagePath: string;
  variantKind: UploadVariant;
  talentProfileId: string;
  /** Forwarded to media_assets.metadata. Mirrors the legacy
   *  actionUploadAndAssignMedia parameter. */
  metadata?: Record<string, unknown>;
  /** Set for crop derivatives so the lightbox's "Revert to original"
   *  has a parent to navigate back to. */
  sourceMediaAssetId?: string | null;
  /** Original filename from the user's picker — preserved for audit. */
  originalFilename?: string | null;
};
