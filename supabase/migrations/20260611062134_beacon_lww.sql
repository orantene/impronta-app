-- WS1-D — beacon last-write-wins lane for the page builder draft save.
--
-- Problem: on tab-close the builder fires a keepalive `pagehide` beacon that
-- POSTs a final draft save carrying `expectedVersion`. If a normal in-flight
-- save (or a co-editor write) bumps `cms_pages.version` first, the beacon
-- CAS-conflicts (409) and the operator's LAST edit is silently dropped.
--
-- Fix: give the beacon a last-write-wins lane keyed on a per-tab edit-session
-- token. Every draft save stamps `cms_pages.edit_session_id` (the operator's
-- tab session) + a monotonically-incrementing `draft_seq`. The dedicated beacon
-- write path applies its tree IFF `edit_session_id` matches the stored one AND
-- `draft_seq > stored draft_seq` — last-write-wins WITHIN the operator's own
-- session — instead of the brittle version CAS. Cross-session / co-editor
-- conflicts (a different `edit_session_id`) still hard-fail.
--
-- Both columns are ADDITIVE + NULLABLE so existing rows are untouched: a row
-- whose `edit_session_id` is NULL (or whose stored session differs) never
-- matches a beacon, so the beacon falls back to refusing — never clobbers.

alter table public.cms_pages
  add column if not exists edit_session_id uuid,
  add column if not exists draft_seq bigint;

comment on column public.cms_pages.edit_session_id is
  'WS1-D — per-tab edit-session token of the writer of the latest draft save. The pagehide beacon may bypass the version CAS only when its edit_session_id matches this value (last-write-wins within one operator session).';

comment on column public.cms_pages.draft_seq is
  'WS1-D — monotonic per-session draft sequence number of the latest draft save. A beacon applies only when its draft_seq is strictly greater than this stored value AND its edit_session_id matches edit_session_id.';
