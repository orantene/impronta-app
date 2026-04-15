-- Optional defaults for Phase 2 inquiry settings (safe no-ops if already present)

INSERT INTO public.settings (key, value, updated_at)
VALUES
  ('inquiry_engine_v2_enabled', to_jsonb(false), now()),
  ('coordinator_timeout_hours', to_jsonb(24), now()),
  ('inquiry_expiry_hours', to_jsonb(72), now())
ON CONFLICT (key) DO NOTHING;
