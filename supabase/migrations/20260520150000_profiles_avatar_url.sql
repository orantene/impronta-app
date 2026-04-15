-- Add avatar_url column to profiles table for client (and staff) profile images
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS avatar_url TEXT;

COMMENT ON COLUMN public.profiles.avatar_url IS 'Optional profile photo URL for display in dashboards and inquiry workspaces.';
