-- Catalog field-engine cleanup (2026-06-15) — schema + data-integrity fixes.
--
-- 1. options_es: an ADDITIVE per-option Spanish map for select/multiselect/chips
--    fields. `options` stays a plain English string[] (value == English label);
--    options_es maps each English option string → its Spanish label:
--        { "Plated": "Emplatado", "Buffet": "Buffet", ... }
--    Render layers look up options_es[value] when locale=es and fall back to the
--    English string. Chosen over migrating `options` to an object array because
--    it touches zero existing readers (every current reader still sees string[]).
--
-- 2. models.height risk fix: it was is_sensitive=true + show_in_public=true (the
--    lone "sensitive-but-public" risk). Its sibling physical.height_cm is
--    is_sensitive=false + public and is the correct precedent — height is
--    standard public casting data. Clear the sensitive flag; keep it public.

alter table public.profile_field_definitions
  add column if not exists options_es jsonb;

comment on column public.profile_field_definitions.options_es is
  'Additive per-option ES label map { "<english option string>": "<es label>" } for select/multiselect/chips. Lookup by the stored English value; null/missing falls back to English.';

update public.profile_field_definitions
  set is_sensitive = false,
      updated_at = now()
  where field_key = 'models.height'
    and is_sensitive = true;
