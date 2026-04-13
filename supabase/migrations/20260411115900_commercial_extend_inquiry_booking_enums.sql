-- New enum labels must exist in a prior migration before UPDATE uses them (PostgreSQL 55P04).

-- inquiry_status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'inquiry_status' AND e.enumlabel = 'qualified'
  ) THEN
    ALTER TYPE public.inquiry_status ADD VALUE 'qualified';
  END IF;
END
$$;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'inquiry_status' AND e.enumlabel = 'converted'
  ) THEN
    ALTER TYPE public.inquiry_status ADD VALUE 'converted';
  END IF;
END
$$;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'inquiry_status' AND e.enumlabel = 'closed_lost'
  ) THEN
    ALTER TYPE public.inquiry_status ADD VALUE 'closed_lost';
  END IF;
END
$$;
-- booking_status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'booking_status' AND e.enumlabel = 'draft'
  ) THEN
    ALTER TYPE public.booking_status ADD VALUE 'draft';
  END IF;
END
$$;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'booking_status' AND e.enumlabel = 'in_progress'
  ) THEN
    ALTER TYPE public.booking_status ADD VALUE 'in_progress';
  END IF;
END
$$;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public' AND t.typname = 'booking_status' AND e.enumlabel = 'archived'
  ) THEN
    ALTER TYPE public.booking_status ADD VALUE 'archived';
  END IF;
END
$$;
