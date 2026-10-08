/**
 * Save core for a talent's photo caption (TUL-229), with injected deps so the
 * auth/ownership gate is testable without a database. The server action in
 * `photo-caption-actions.ts` supplies the real deps.
 *
 * Gate order: signed in as the owner of `talentProfileId` (`requireSelf`),
 * then the language must be one the talent has enabled, then the photo must
 * belong to that profile (`readMetadata` is scoped by owner, so another
 * talent's asset id reads as "not found" and nothing is written).
 */
import { applyCaptionEdit, type PhotoMetadata } from "./photo-caption-edit";

export type PhotoCaptionLocales = { primary: string; secondary: readonly string[] };

export type PhotoCaptionDeps = {
  /** Talent-self guard for this profile id. */
  requireSelf: (
    talentProfileId: string,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
  loadLocales: (talentProfileId: string) => Promise<PhotoCaptionLocales>;
  /** Owner-scoped read: null when the asset is not this talent's (or deleted). */
  readMetadata: (
    talentProfileId: string,
    assetId: string,
  ) => Promise<{ metadata: PhotoMetadata | null } | null>;
  /** Owner-scoped write; false when no row matched or the write failed. */
  writeMetadata: (
    talentProfileId: string,
    assetId: string,
    metadata: PhotoMetadata,
  ) => Promise<boolean>;
};

export type PhotoCaptionResult =
  | { ok: true; metadata: PhotoMetadata }
  | { ok: false; error: string };

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function key(locale: string): string {
  return locale.trim().toLowerCase().slice(0, 2);
}

export async function savePhotoCaption(
  deps: PhotoCaptionDeps,
  input: { talentProfileId: string; assetId: string; locale: string; text: string },
): Promise<PhotoCaptionResult> {
  if (!UUID_RE.test(input.talentProfileId) || !UUID_RE.test(input.assetId)) {
    return { ok: false, error: "Missing photo." };
  }
  const self = await deps.requireSelf(input.talentProfileId);
  if (!self.ok) return { ok: false, error: self.error };

  const locales = await deps.loadLocales(input.talentProfileId);
  const allowed = [locales.primary, ...locales.secondary].map(key);
  if (!allowed.includes(key(input.locale))) {
    return { ok: false, error: "That language is not enabled for your site." };
  }

  const row = await deps.readMetadata(input.talentProfileId, input.assetId);
  if (!row) return { ok: false, error: "Photo not found for this profile." };

  const metadata = applyCaptionEdit(row.metadata, input.locale, locales.primary, input.text);
  const wrote = await deps.writeMetadata(input.talentProfileId, input.assetId, metadata);
  if (!wrote) return { ok: false, error: "Could not save the caption." };
  return { ok: true, metadata };
}
