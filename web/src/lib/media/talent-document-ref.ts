/**
 * talent-document-ref.ts — is this (bucket, path) actually one of this
 * talent's documents?
 *
 * Both document upload paths (legacy Server Action + signed PUT) only ever
 * write to `media-originals` under `${talentProfileId}/documents/`, and the
 * read/delete actions replay entries stored at upload time — so anything
 * outside that shape is a crafted request, not a legitimate document.
 *
 * The roster guard those actions also run is NOT sufficient on its own:
 * without this check, staff of any workspace with at least one rostered
 * talent could name an arbitrary bucket + path and sign (or delete) another
 * tenant's objects. Found 2026-08-15 during the media-ownership phase 4
 * build; the write side (`actionFinalizeDocumentUpload`) always enforced the
 * prefix — this brings the read/delete side to parity.
 */

/** The only bucket talent documents have ever been written to. */
export const TALENT_DOCUMENT_BUCKET = "media-originals";

export function isTalentDocumentRef(
  bucketId: string,
  storagePath: string,
  talentProfileId: string,
): boolean {
  return (
    bucketId === TALENT_DOCUMENT_BUCKET &&
    talentProfileId.length > 0 &&
    storagePath.startsWith(`${talentProfileId}/documents/`) &&
    !storagePath.includes("..")
  );
}
