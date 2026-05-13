-- B2 — call sheet editor.
--
-- v1 stores the structured payload as JSONB on agency_bookings rather
-- than splitting into separate `call_sheets`/`time_blocks`/`contacts`
-- tables. Rationale: the editor needs to round-trip the whole document
-- atomically, the row is already write-gated through tenant_id RLS,
-- and we don't have any cross-call-sheet queries that would benefit
-- from normalization. We'll split into tables in v2 if multi-cosheet
-- versioning becomes a need.
--
-- Payload shape (validated at the action layer):
--   {
--     "general_call_time": "09:00",
--     "general_wrap_time": "18:00",
--     "venue": "Studio 12, Roma Norte",
--     "venue_address": "Calle Querétaro 234, CDMX",
--     "parking_note": "Free street parking until 10am",
--     "holding_area": "Green Room (basement)",
--     "hmua_call_time": "08:30",
--     "talents": [
--       { "talent_profile_id": "uuid", "call_time": "09:00", "wrap_time": "18:00", "role": "lead", "notes": "Bring nude heels" }
--     ],
--     "contacts": [
--       { "name": "Sara Vega", "role": "Coordinator", "phone": "+52 ...", "email": "..." }
--     ],
--     "transport_note": null,
--     "weather_note": null,
--     "internal_note": null
--   }
--
-- All fields optional. UI degrades gracefully on missing fields.

BEGIN;

ALTER TABLE public.agency_bookings
  ADD COLUMN IF NOT EXISTS call_sheet_payload JSONB,
  ADD COLUMN IF NOT EXISTS call_sheet_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS call_sheet_updated_by_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.agency_bookings.call_sheet_payload IS
  'B2 — structured call sheet document for the booking. v1 stores as JSONB; see migration comment for the shape.';

CREATE INDEX IF NOT EXISTS agency_bookings_call_sheet_updated_idx
  ON public.agency_bookings (call_sheet_updated_at DESC)
  WHERE call_sheet_payload IS NOT NULL;

COMMIT;
