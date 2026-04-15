-- Phase 2: inquiry_messages, inquiry_message_reads + RLS

BEGIN;

DO $$ BEGIN
  CREATE TYPE public.inquiry_thread_type AS ENUM ('private', 'group');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.inquiry_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  inquiry_id UUID NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE,
  thread_type public.inquiry_thread_type NOT NULL,
  sender_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inquiry_messages_thread
  ON public.inquiry_messages (inquiry_id, thread_type, created_at DESC);

CREATE TABLE IF NOT EXISTS public.inquiry_message_reads (
  inquiry_id UUID NOT NULL REFERENCES public.inquiries(id) ON DELETE CASCADE,
  thread_type public.inquiry_thread_type NOT NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_read_message_id UUID REFERENCES public.inquiry_messages(id) ON DELETE SET NULL,
  PRIMARY KEY (inquiry_id, thread_type, user_id)
);

ALTER TABLE public.inquiry_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inquiry_message_reads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inquiry_messages_staff ON public.inquiry_messages;
CREATE POLICY inquiry_messages_staff ON public.inquiry_messages
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());

DROP POLICY IF EXISTS inquiry_message_reads_staff ON public.inquiry_message_reads;
CREATE POLICY inquiry_message_reads_staff ON public.inquiry_message_reads
  FOR ALL USING (public.is_agency_staff()) WITH CHECK (public.is_agency_staff());

COMMIT;
