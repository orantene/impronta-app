-- 20260609223834_profile_editor_section_layout.sql
--
-- B0: DB-back the talent profile-editor sidebar structure.
--
-- Two soft-archive tables capture the hardcoded RAIL_GROUPS (the rail's
-- group headers + their order) and the per-section metadata (label + emoji)
-- that today lives in two TS literals:
--   - TalentProfileShellDrawer.tsx  RAIL_GROUPS
--   - profile-state.tsx             SECTION_META
--
-- This migration ONLY adds the tables + the parity seed. No code reads them
-- yet (the loader falls back to the hardcoded copy), so applying this is a
-- zero-behavior-change step. RLS: SELECT for authenticated; writes are
-- service-role only (service role bypasses RLS, so no write policy exists).

-- ── Groups (rail section headers) ────────────────────────────────────────────
create table if not exists public.profile_editor_section_groups (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  label_en      text not null,
  label_es      text,
  label_en_alt  text,
  label_es_alt  text,
  sort_order    int  not null default 100,
  is_active     boolean not null default true,
  is_system     boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ── Sections (individual editor sections) ────────────────────────────────────
create table if not exists public.profile_editor_sections (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique,
  label_en          text not null,
  label_es          text,
  emoji             text not null default '',
  section_group_id  uuid references public.profile_editor_section_groups(id),
  sort_order        int  not null default 100,
  is_active         boolean not null default true,
  is_system         boolean not null default true,
  archived_at       timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists ix_profile_editor_sections_group_sort
  on public.profile_editor_sections (section_group_id, sort_order);

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.profile_editor_section_groups enable row level security;
alter table public.profile_editor_sections        enable row level security;

-- SELECT to authenticated. No write policy → only the service role (which
-- bypasses RLS) can mutate these tables.
drop policy if exists profile_editor_section_groups_select on public.profile_editor_section_groups;
create policy profile_editor_section_groups_select
  on public.profile_editor_section_groups
  for select
  to authenticated
  using (true);

drop policy if exists profile_editor_sections_select on public.profile_editor_sections;
create policy profile_editor_sections_select
  on public.profile_editor_sections
  for select
  to authenticated
  using (true);

-- ── Seed: 7 groups (parity with RAIL_GROUPS order) ───────────────────────────
insert into public.profile_editor_section_groups
  (slug, label_en, label_en_alt, sort_order, is_system)
values
  ('profile',    'Profile',     null,                    10, true),
  ('craft',      'Craft',       null,                    20, true),
  ('logistics',  'Logistics',   null,                    30, true),
  ('portfolio',  'Portfolio',   'Photos of work / venue', 40, true),
  ('terms',      'Terms',       null,                    50, true),
  ('proof',      'Proof',       null,                    60, true),
  ('back_office','Back office', null,                    70, true)
on conflict (slug) do nothing;

-- ── Seed: sections (parity with RAIL_GROUPS ids + SECTION_META label/emoji) ───
-- Emoji literals are copied verbatim (UTF-8) from SECTION_META in
-- profile-state.tsx so deriveLayoutFromHardcoded() and the DB agree byte-for-byte.
insert into public.profile_editor_sections
  (slug, label_en, emoji, section_group_id, sort_order, is_system)
values
  -- profile
  ('identity',      'Identity',      '👤', (select id from public.profile_editor_section_groups where slug = 'profile'),     10, true),
  ('location',      'Location',      '📍', (select id from public.profile_editor_section_groups where slug = 'profile'),     20, true),
  ('about',         'About',         '✏️', (select id from public.profile_editor_section_groups where slug = 'profile'),     30, true),
  ('services',      'Services',      '🎯', (select id from public.profile_editor_section_groups where slug = 'profile'),     40, true),
  -- craft
  ('physical',      'Physical',      '📐', (select id from public.profile_editor_section_groups where slug = 'craft'),       10, true),
  ('wardrobe',      'Wardrobe',      '👗', (select id from public.profile_editor_section_groups where slug = 'craft'),       20, true),
  ('details',       'Details',       '📋', (select id from public.profile_editor_section_groups where slug = 'craft'),       30, true),
  -- logistics
  ('logistics',     'Logistics',     '🧳', (select id from public.profile_editor_section_groups where slug = 'logistics'),   10, true),
  ('availability',  'Availability',  '📅', (select id from public.profile_editor_section_groups where slug = 'logistics'),   20, true),
  -- portfolio
  ('media',         'Media',         '📷', (select id from public.profile_editor_section_groups where slug = 'portfolio'),   10, true),
  ('albums',        'Albums',        '🗂', (select id from public.profile_editor_section_groups where slug = 'portfolio'),    20, true),
  ('polaroids',     'Polaroids',     '🪪', (select id from public.profile_editor_section_groups where slug = 'portfolio'),   30, true),
  -- terms
  ('rates',         'Rates',         '💶', (select id from public.profile_editor_section_groups where slug = 'terms'),        10, true),
  ('limits',        'Restrictions',  '⊘', (select id from public.profile_editor_section_groups where slug = 'terms'),         20, true),
  -- proof
  ('credits',       'Credits',       '🏆', (select id from public.profile_editor_section_groups where slug = 'proof'),        10, true),
  ('social_proof',  'Past clients',  '⭐', (select id from public.profile_editor_section_groups where slug = 'proof'),         20, true),
  ('verifications', 'Trust',         '🛡', (select id from public.profile_editor_section_groups where slug = 'proof'),         30, true),
  -- back office
  ('files',         'Files',         '📎', (select id from public.profile_editor_section_groups where slug = 'back_office'),  10, true),
  ('agency_fields', 'Agency Fields', '🧬', (select id from public.profile_editor_section_groups where slug = 'back_office'),  20, true),
  ('admin',         'Admin',         '🔒', (select id from public.profile_editor_section_groups where slug = 'back_office'),  30, true)
on conflict (slug) do nothing;
