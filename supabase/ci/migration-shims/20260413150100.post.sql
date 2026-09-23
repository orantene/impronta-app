-- Re-enable the trigger suspended by 20260413150100.pre.sql.
ALTER TABLE public.field_definitions ENABLE TRIGGER trg_field_definitions_ai_visible_invalidate_embeddings;
