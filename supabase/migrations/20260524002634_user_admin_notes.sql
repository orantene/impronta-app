-- Create user_admin_notes table for platform super_admin notes on users/profiles
CREATE TABLE public.user_admin_notes (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_user_id          uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  target_talent_profile_id uuid REFERENCES public.talent_profiles(id) ON DELETE CASCADE,
  body                    text NOT NULL,
  author_user_id          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT target_not_both_null CHECK (
    target_user_id IS NOT NULL OR target_talent_profile_id IS NOT NULL
  )
);

-- Enable Row Level Security
ALTER TABLE public.user_admin_notes ENABLE ROW LEVEL SECURITY;

-- Create RLS policies: only super_admin can SELECT, INSERT, UPDATE, DELETE
CREATE POLICY "super_admin_select" ON public.user_admin_notes
  FOR SELECT
  USING (
    auth.uid() IN (
      SELECT id FROM public.profiles
      WHERE app_role = 'super_admin'
    )
  );

CREATE POLICY "super_admin_insert" ON public.user_admin_notes
  FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM public.profiles
      WHERE app_role = 'super_admin'
    )
  );

CREATE POLICY "super_admin_update" ON public.user_admin_notes
  FOR UPDATE
  USING (
    auth.uid() IN (
      SELECT id FROM public.profiles
      WHERE app_role = 'super_admin'
    )
  )
  WITH CHECK (
    auth.uid() IN (
      SELECT id FROM public.profiles
      WHERE app_role = 'super_admin'
    )
  );

CREATE POLICY "super_admin_delete" ON public.user_admin_notes
  FOR DELETE
  USING (
    auth.uid() IN (
      SELECT id FROM public.profiles
      WHERE app_role = 'super_admin'
    )
  );
