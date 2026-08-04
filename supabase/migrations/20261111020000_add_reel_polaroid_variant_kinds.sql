-- Add 'reel' + 'polaroid' to media_variant_kind.
--
-- The application's UploadVariant type has offered both for months
-- (hello-reel editor, polaroid set editor) but the enum never gained the
-- values, so EVERY reel/polaroid upload died at the media_assets insert
-- with "invalid input value for enum media_variant_kind" — surfaced to
-- the user as "Could not save. Try again." regardless of file size.
-- Discovered while porting the reel editor to the signed-upload pipeline
-- (the 4 MB Server Action body cap was the reel's *other* fatal layer).
--
-- ADD VALUE IF NOT EXISTS is idempotent and, since PG 12, legal inside
-- the migration transaction.

alter type media_variant_kind add value if not exists 'reel';
alter type media_variant_kind add value if not exists 'polaroid';
