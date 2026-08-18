-- Operator-assigned named versions for the Revisions drawer.
-- Replaces the client-only `builder_revision_labels_v1` localStorage map so
-- labels survive browsers, machines, and collaborators.
--
-- INTEGRATOR: `npm run db:push` before merging. Code selects `label`; an
-- unapplied migration 500s the revisions list.

ALTER TABLE public.cms_page_revisions
  ADD COLUMN IF NOT EXISTS label text;

COMMENT ON COLUMN public.cms_page_revisions.label IS
  'Operator-assigned named version. Null = unlabeled. Replaces client-only builder_revision_labels_v1.';
