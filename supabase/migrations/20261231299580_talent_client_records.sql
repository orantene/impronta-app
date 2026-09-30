-- Talent Clients: the writer behind Add client, Edit details, private Note and
-- Archive. The Clients list is DERIVED from bookings and inquiries; this table
-- holds what the talent typed on top of that.
--   client_key = the derived row id ("inquiry:<uuid>" or a booking uuid) when
--                the record overlays a derived client, or "record:<uuid>" when
--                the talent added the person by hand.
--   name/email/phone NULL = no override of the derived value.
-- Additive only. Service-role writes behind an owner check in the server
-- action; no direct anon/authenticated access (the note is private).

CREATE TABLE IF NOT EXISTS public.talent_client_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  talent_profile_id uuid NOT NULL REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  client_key text NOT NULL CHECK (length(client_key) BETWEEN 1 AND 120),
  name text CHECK (name IS NULL OR length(btrim(name)) BETWEEN 1 AND 200),
  email text CHECK (email IS NULL OR length(email) <= 320),
  phone text CHECK (phone IS NULL OR length(phone) <= 40),
  note text CHECK (note IS NULL OR length(note) <= 4000),
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT talent_client_records_key_unique UNIQUE (talent_profile_id, client_key),
  CONSTRAINT talent_client_records_manual_has_name
    CHECK (client_key NOT LIKE 'record:%' OR name IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS talent_client_records_talent_idx
  ON public.talent_client_records (talent_profile_id);

ALTER TABLE public.talent_client_records ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.talent_client_records FROM anon;
REVOKE ALL ON public.talent_client_records FROM authenticated;
