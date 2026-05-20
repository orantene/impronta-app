-- profile_workflow_status: add 'invited' value.
--
-- The Add Talent drawer's "Send claim invite" path (and the /roster/new page
-- in `invited` mode) both attempt to insert `workflow_status = 'invited'`,
-- but the enum was never extended to include that value. The DB would reject
-- those inserts with an "invalid input value for enum" error — silently for
-- admins because the error was wrapped in a generic "Could not create the
-- talent profile" toast.
--
-- This migration adds the missing value. Idempotent (`IF NOT EXISTS`) and
-- additive — no downstream rows need to change because no rows can have
-- carried the invalid value.

BEGIN;

ALTER TYPE public.profile_workflow_status ADD VALUE IF NOT EXISTS 'invited' AFTER 'draft';

COMMIT;
