-- 20260408110100_inquiry_client_flow_completion re-declares
-- guest_submit_inquiry(14 args) WITHOUT the parameter defaults that
-- 20260408110000 gave it; CREATE OR REPLACE cannot remove defaults
-- (SQLSTATE 42P13). Drop the old signature so the migration's own
-- CREATE + GRANT produce the intended end state.
DROP FUNCTION IF EXISTS public.guest_submit_inquiry(TEXT, TEXT, TEXT, TEXT, TEXT, UUID, DATE, TEXT, INT, TEXT, TEXT, JSONB, TEXT, UUID[]);
