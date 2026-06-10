-- Profile-field-engine unification — P0, Migration B.
--
-- Depends on 20260610090000 (render_mode/storage_mode columns + widened
-- `section` CHECK). This migration is the DATA half of P0:
--
--   A. RE-TAG existing rows so each field's `section` matches the REAL
--      profile-editor section slug it renders under (ground truth =
--      PROFILE_SECTIONS / SECTION_META in profile-state.tsx). Complex/coded
--      fields are flipped to render_mode='bespoke', storage_mode='dedicated'.
--
--   B. REGISTER the bespoke + simple profile fields that exist in the editor
--      but were never in the catalog, so the platform-admin "Section Fields"
--      tab mirrors the editor 1:1. New rows are additive and idempotent.
--
-- ZERO user-facing behavior change: in P0 the talent editor + client still
-- read the static code catalog. This only makes the DB catalog complete +
-- correctly-sectioned so the admin mirror is accurate.
--
-- Everything is idempotent:
--   • re-tags use plain UPDATEs (re-running re-asserts the same values).
--   • registrations use INSERT … ON CONFLICT (field_key) DO UPDATE SET
--     section / render_mode / storage_mode / label (label kept via COALESCE
--     so a hand-edited label is never clobbered with NULL).
--
-- Valid `kind` values only: text, number, select, multiselect, chips, date,
-- toggle, textarea (per the 20260901120000 CHECK).
--
-- DOWN (manual): not provided — re-tags are descriptive metadata; deleting
-- the newly-registered rows would orphan nothing (no values reference them
-- in P0).

BEGIN;

-- ════════════════════════════════════════════════════════════════════════
-- A. RE-TAG existing rows → real editor section, flip coded ones to bespoke
-- ════════════════════════════════════════════════════════════════════════
-- The reverse lookup in SECTION_FIELD_SECTIONS maps each DB `section` value to
-- exactly ONE editor slug. Two re-tag strategies are used:
--
--   (1) BY KEY — for a "split" section: a legacy section value that maps to
--       editor slug X but contains a few keys that belong under a DIFFERENT
--       editor slug. Only those keys are re-tagged out.
--
--   (2) BY SECTION — for a "homogeneous" legacy section value whose entire
--       contents belong under one editor slug. Re-tagging by section is
--       DRIFT-PROOF: the live DB has evolved its field_keys away from the
--       stale seed (20260901120400) — e.g. the social-links field is
--       `media.social_links` live but `links` in the seed — so matching by
--       section catches every row regardless of key naming.
--
-- Legacy section values that already equal their editor slug, or are aliased
-- in SECTION_FIELD_SECTIONS (measurements→physical, type-specific→details),
-- are left untouched.

-- (1) SPLIT: bios + languages live in the `identity` section (→ Identity slug)
--     but render under About → re-tag them out by key.
UPDATE public.profile_field_definitions
   SET section = 'about', render_mode = 'bespoke', storage_mode = 'dedicated'
 WHERE field_key IN ('bios', 'languages');

-- (1) SPLIT: `media.polaroids` lives in the `media` section (→ Media slug) but
--     the editor has a dedicated Polaroids section → re-tag it out by key.
UPDATE public.profile_field_definitions
   SET section = 'polaroids', render_mode = 'bespoke', storage_mode = 'dedicated'
 WHERE field_key IN ('media.polaroids');

-- (2) BY SECTION: whole legacy sections → their editor slug. Coded/structured
--     stores are flipped to bespoke; the simpler travel/refinement fields keep
--     their render_mode (default 'catalog') but become storage_mode='dedicated'.
UPDATE public.profile_field_definitions
   SET section = 'admin', render_mode = 'bespoke', storage_mode = 'dedicated'
 WHERE section = 'emergency';

UPDATE public.profile_field_definitions
   SET section = 'social_proof', render_mode = 'bespoke', storage_mode = 'dedicated'
 WHERE section = 'social';

UPDATE public.profile_field_definitions
   SET section = 'files', render_mode = 'bespoke', storage_mode = 'dedicated'
 WHERE section = 'documents';

UPDATE public.profile_field_definitions
   SET section = 'logistics', storage_mode = 'dedicated'
 WHERE section = 'travel';

UPDATE public.profile_field_definitions
   SET section = 'refinement', storage_mode = 'dedicated'
 WHERE section = 'skills';

-- The remaining media.* photo/reel uploaders are hand-coded controls → bespoke
-- in place (still section='media'; polaroids already moved out above).
UPDATE public.profile_field_definitions
   SET render_mode = 'bespoke', storage_mode = 'dedicated'
 WHERE section = 'media';

-- identity.* core fields stay in identity (no change needed) — they were
-- already section='identity' and render via the generic catalog renderer.
-- `consent.terms` also stays in identity (consent gate).

-- ════════════════════════════════════════════════════════════════════════
-- B. REGISTER editor fields missing from the catalog
-- ════════════════════════════════════════════════════════════════════════
-- Compact column list — every other column has a table default. label kept
-- via COALESCE so a hand-edited label survives a re-apply.

INSERT INTO public.profile_field_definitions (
  field_key, label, tier, section, kind, options,
  is_optional, admin_only, talent_editable,
  render_mode, storage_mode, display_order
) VALUES
  -- ── identity (simple → catalog, dedicated) ──────────────────────────────
  ('identity.whatsapp',       'WhatsApp',      'global', 'identity', 'text',   NULL, TRUE, FALSE, TRUE, 'catalog', 'dedicated', 140),
  ('identity.businessLine',   'Business line', 'global', 'identity', 'text',   NULL, TRUE, FALSE, TRUE, 'catalog', 'dedicated', 150),

  -- ── about ───────────────────────────────────────────────────────────────
  ('about.personality',       'Personality — loves / avoids', 'global', 'about', 'chips',  NULL, TRUE, FALSE, TRUE, 'bespoke', 'dedicated', 200),
  ('about.bioTone',           'Bio tone',      'global', 'about', 'select',
     '["professional","warm","playful","bold","minimal"]'::jsonb,
     TRUE, FALSE, TRUE, 'bespoke', 'dedicated', 210),

  -- ── commercial_terms ─────────────────────────────────────────────────────
  ('commercial.rateCardVisibility', 'Rate card visibility', 'global', 'commercial_terms', 'select',
     '["public","agency-only","on-request"]'::jsonb,
     TRUE, FALSE, TRUE, 'catalog', 'dedicated', 300),
  ('commercial.askForQuote',     'Ask for quote',      'global', 'commercial_terms', 'toggle', NULL, TRUE, FALSE, TRUE, 'catalog', 'dedicated', 310),
  ('commercial.travelIncluded',  'Travel included',    'global', 'commercial_terms', 'toggle', NULL, TRUE, FALSE, TRUE, 'catalog', 'dedicated', 320),
  ('commercial.lodgingIncluded', 'Lodging included',   'global', 'commercial_terms', 'toggle', NULL, TRUE, FALSE, TRUE, 'catalog', 'dedicated', 330),
  ('commercial.packageRates',    'Package rates',      'global', 'commercial_terms', 'textarea', NULL, TRUE, FALSE, TRUE, 'bespoke', 'dedicated', 340),
  ('commercial.rateTiers',       'Channel rate tiers', 'global', 'commercial_terms', 'textarea', NULL, TRUE, FALSE, TRUE, 'bespoke', 'dedicated', 350),

  -- ── rates ─────────────────────────────────────────────────────────────────
  ('rates.cards',             'Rate cards',    'global', 'rates', 'textarea', NULL, TRUE, FALSE, TRUE, 'bespoke', 'dedicated', 400),

  -- ── availability ──────────────────────────────────────────────────────────
  ('availability.calendar',   'Availability calendar', 'global', 'availability', 'textarea', NULL, TRUE, FALSE, TRUE, 'bespoke', 'dedicated', 500),
  ('availability.recurring',  'Recurring pattern',     'global', 'availability', 'textarea', NULL, TRUE, FALSE, TRUE, 'bespoke', 'dedicated', 510),
  ('availability.vacation',   'Vacation windows',      'global', 'availability', 'textarea', NULL, TRUE, FALSE, TRUE, 'bespoke', 'dedicated', 520),

  -- ── media (new bespoke fields; existing media.* re-tagged in section A) ──
  ('media.helloReel',         'Hello reel',    'global', 'media', 'textarea', NULL, TRUE, FALSE, TRUE, 'bespoke', 'dedicated', 600),
  ('media.videoLinks',        'Video links',   'global', 'media', 'textarea', NULL, TRUE, FALSE, TRUE, 'bespoke', 'dedicated', 610),

  -- ── albums ────────────────────────────────────────────────────────────────
  ('albums.list',             'Albums',        'global', 'albums', 'textarea', NULL, TRUE, FALSE, TRUE, 'bespoke', 'dedicated', 700),

  -- ── social_proof ──────────────────────────────────────────────────────────
  ('social_proof.pastClients', 'Past clients', 'global', 'social_proof', 'textarea', NULL, TRUE, FALSE, TRUE, 'bespoke', 'dedicated', 800),

  -- ── verifications (talent cannot self-edit) ──────────────────────────────
  ('verifications.idVerified', 'ID verified',  'global', 'verifications', 'toggle', NULL, TRUE, FALSE, FALSE, 'bespoke', 'dedicated', 900),
  ('verifications.badges',     'Trust badges', 'global', 'verifications', 'multiselect', NULL, TRUE, FALSE, FALSE, 'bespoke', 'dedicated', 910),

  -- ── logistics (simple chips → catalog) ────────────────────────────────────
  ('logistics.workEligibility', 'Work-eligible countries', 'global', 'logistics', 'chips', NULL, TRUE, FALSE, TRUE, 'catalog', 'dedicated', 1000),
  ('logistics.visas',           'Visas held',              'global', 'logistics', 'chips', NULL, TRUE, FALSE, TRUE, 'catalog', 'dedicated', 1010),

  -- ── admin (admin-only) ────────────────────────────────────────────────────
  ('admin.featureInDirectory', 'Feature in directory', 'global', 'admin', 'toggle',   NULL, TRUE, TRUE,  FALSE, 'catalog', 'dedicated', 1100),
  ('admin.internalNotes',      'Internal notes',       'global', 'admin', 'textarea', NULL, TRUE, TRUE,  FALSE, 'bespoke', 'dedicated', 1110),
  ('admin.fieldLocks',         'Field locks',          'global', 'admin', 'textarea', NULL, TRUE, TRUE,  FALSE, 'bespoke', 'dedicated', 1120),

  -- ── agency_fields (placeholder so the section appears in the admin tab) ──
  ('agency_fields.placeholder', 'Agency custom fields', 'global', 'agency_fields', 'textarea', NULL, TRUE, TRUE, FALSE, 'bespoke', 'dedicated', 1200)
ON CONFLICT (field_key) DO UPDATE SET
  section      = EXCLUDED.section,
  render_mode  = EXCLUDED.render_mode,
  storage_mode = EXCLUDED.storage_mode,
  label        = COALESCE(EXCLUDED.label, profile_field_definitions.label);

COMMIT;
