-- Adds 'published' to profile_workflow_status enum.
-- Must run in its own migration (separate commit) so the value is visible
-- to the index recreation in 20260513035000.
ALTER TYPE public.profile_workflow_status ADD VALUE IF NOT EXISTS 'published' AFTER 'approved';
