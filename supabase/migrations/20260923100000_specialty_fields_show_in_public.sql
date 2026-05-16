-- ============================================================================
-- 20260923100000_specialty_fields_show_in_public.sql
--
-- THE missing link. 123 type-specific specialty fields had
-- show_in_public=false (the column default), so everything an agency
-- fills for a talent — hair colour, eye colour, body type, dress/shoe
-- sizes, measurements, social handles, per-discipline specialty fields
-- — was silently INVISIBLE on the public talent profile
-- (/t/<code>). For a modelling/talent agency the physical casting
-- attributes are the single most important thing a client looks at, so
-- the engine was producing data nobody could see → "so much is missing".
--
-- Fix: flip show_in_public=true for the non-sensitive, non-admin
-- TYPE-SPECIFIC fields (the "what this talent does / looks like" set —
-- the entire point of the specialty engine). Sensitive PII stays
-- private: anything is_sensitive / admin_only, plus the
-- identity / travel-docs / serviceArea / emergency / consent /
-- documents namespaces (legal name, DOB, contact, passport, visa,
-- work-eligibility, emergency contact, consent, ID docs).
--
-- Scope is deliberately TYPE-SPECIFIC only (the specialty engine).
-- universal/global tiers are left as-is. show_in_directory (Discover
-- filterability) is intentionally NOT changed here — that's a separate
-- curated decision (too many filters clutters Discover).
--
-- Reversible (set back to false) and idempotent (already-true rows are
-- untouched by the WHERE clause).
-- ============================================================================

UPDATE profile_field_definitions
SET show_in_public = true,
    updated_at = now()
WHERE deprecated_at IS NULL
  AND tier = 'type-specific'
  AND show_in_public = false
  AND COALESCE(is_sensitive, false) = false
  AND COALESCE(admin_only, false) = false
  AND split_part(field_key, '.', 1) NOT IN (
    'identity', 'travel', 'serviceArea', 'emergency', 'consent', 'documents'
  );
