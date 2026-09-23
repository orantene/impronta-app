-- 20260413150100 updates field_definitions.ai_visible, which fires
-- trg_field_definitions_ai_visible_invalidate_embeddings (20260413150000).
-- That trigger deletes from public.talent_embeddings, a table created later by
-- 20260415103000: production received 20260413150000 after 20260415103000
-- (out-of-order push), so the table already existed there. The table would be
-- empty anyway on a fresh database, so suspend the trigger for this one file.
ALTER TABLE public.field_definitions DISABLE TRIGGER trg_field_definitions_ai_visible_invalidate_embeddings;
