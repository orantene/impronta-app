-- =============================================================================
-- Talent Pro/Portfolio — SOCIAL & VIDEO EMBEDS + PRESS BAND
-- =============================================================================
-- The Talent Pro ($9/mo) plan is marketed as including "social and video
-- embeds" and a "press band", and /pricing advertises both publicly. Until now
-- there was NO per-talent store for either: the admin drawers rendered a demo
-- fixture and nothing a talent typed was ever persisted. This migration adds
-- the two missing stores so the marketed value is real.
--
-- TWO TABLES, both keyed on talent_profiles(id):
--   * talent_profile_embeds — one row per embedded social/video item. We store
--     the PROVIDER + the CANONICAL EXTERNAL ID (never raw HTML, never an
--     arbitrary iframe src). The public renderer rebuilds the iframe `src` from
--     { provider, external_id } through a fixed per-provider allow-list
--     (web/src/lib/talent/profile-embeds/embed-url.ts), so a hostile URL can
--     never reach the DOM. `url` keeps the normalized canonical link and is
--     likewise rebuilt at write time, never echoed back from raw input.
--   * talent_press_items — one row per press clipping (outlet, headline, link,
--     optional date + pull-quote).
--
-- HELPERS REUSED (defined by 20261001000000_talent_sites.sql):
--   * is_talent_profile_owner(uuid) — owner = talent_profiles.user_id = auth.uid()
-- NEW HELPER:
--   * talent_profile_has_pro_or_max(uuid) — plan is talent_pro OR
--     talent_portfolio. Mirrors talent_profile_has_max(uuid) exactly; both
--     embeds and press are a Pro-and-up entitlement, so the Max-only helper
--     would have been the wrong gate.
--
-- RLS SHAPE (mirrors talent_site_domains):
--   * owner SELECT — the talent always reads their own rows, at any plan, so a
--     downgrade never destroys content, it only stops publishing it.
--   * owner AND pro/max for INSERT / UPDATE / DELETE — airtight: a free talent
--     cannot create or mutate a row even with a forged request.
--   * public SELECT of rows belonging to a NOT-hidden, pro/max talent — the
--     anon read the public profile needs, and nothing more.
--
-- Idempotent throughout (create table/index if not exists, drop policy if
-- exists before create), and additive/reversible: dropping the two tables and
-- the helper restores the prior schema exactly.
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Tier helper — Pro OR Portfolio (Max).
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.talent_profile_has_pro_or_max(profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.talent_profiles tp
    where tp.id = profile_id
      and tp.talent_plan_key in ('talent_pro', 'talent_portfolio')
  );
$$;

-- SECURITY DEFINER helpers are granted to PUBLIC by default; revoke and grant
-- narrowly (a `revoke ... from anon` alone is a NO-OP — only FROM PUBLIC works).
revoke all on function public.talent_profile_has_pro_or_max(uuid) from public;
grant execute on function public.talent_profile_has_pro_or_max(uuid) to anon, authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. talent_profile_embeds
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.talent_profile_embeds (
  id uuid primary key default gen_random_uuid(),
  talent_profile_id uuid not null
    references public.talent_profiles (id) on delete cascade,
  -- Fixed allow-list. Adding a provider here REQUIRES adding a parser + a
  -- safe iframe-src builder in lib/talent/profile-embeds/embed-url.ts and a
  -- frame-src host in next.config.ts, or the embed renders blank.
  provider text not null
    check (provider in (
      'instagram',
      'tiktok',
      'youtube',
      'spotify',
      'soundcloud',
      'vimeo'
    )),
  -- Provider-native canonical id (YouTube video id, Spotify "kind/id",
  -- Instagram shortcode, TikTok numeric video id, …). NEVER an iframe src.
  external_id text not null,
  -- Canonical public URL, REBUILT from the allow-list at write time.
  url text not null,
  title text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The same item twice on one profile is always a mistake.
create unique index if not exists talent_profile_embeds_unique_item
  on public.talent_profile_embeds (talent_profile_id, provider, external_id);

-- Ordered read for one profile (the public render path).
create index if not exists idx_talent_profile_embeds_profile_sort
  on public.talent_profile_embeds (talent_profile_id, sort_order, created_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. talent_press_items
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.talent_press_items (
  id uuid primary key default gen_random_uuid(),
  talent_profile_id uuid not null
    references public.talent_profiles (id) on delete cascade,
  outlet text not null,
  title text not null,
  -- http(s) only; enforced again in the action layer and rel/target-hardened
  -- at render. A stored non-http scheme could otherwise become a javascript:
  -- link in an <a href>.
  url text not null check (url ~* '^https?://'),
  published_on date,
  quote text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_talent_press_items_profile_sort
  on public.talent_press_items (talent_profile_id, sort_order, created_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. updated_at triggers. There is no shared public.set_updated_at() in this
--    schema (each table brings its own tg_* function), so follow that
--    convention rather than introducing a global helper.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function public.tg_talent_profile_extras_set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists talent_profile_embeds_set_updated_at on public.talent_profile_embeds;
create trigger talent_profile_embeds_set_updated_at
  before update on public.talent_profile_embeds
  for each row execute function public.tg_talent_profile_extras_set_updated_at();

drop trigger if exists talent_press_items_set_updated_at on public.talent_press_items;
create trigger talent_press_items_set_updated_at
  before update on public.talent_press_items
  for each row execute function public.tg_talent_profile_extras_set_updated_at();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. RLS
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.talent_profile_embeds enable row level security;
alter table public.talent_press_items    enable row level security;

-- ── embeds ──────────────────────────────────────────────────────────────────

drop policy if exists talent_profile_embeds_owner_select on public.talent_profile_embeds;
create policy talent_profile_embeds_owner_select
  on public.talent_profile_embeds
  for select
  using (public.is_talent_profile_owner(talent_profile_id));

drop policy if exists talent_profile_embeds_public_select on public.talent_profile_embeds;
create policy talent_profile_embeds_public_select
  on public.talent_profile_embeds
  for select
  using (
    public.talent_profile_has_pro_or_max(talent_profile_id)
    and exists (
      select 1 from public.talent_profiles tp
      where tp.id = talent_profile_id
        and tp.is_publicly_hidden = false
    )
  );

drop policy if exists talent_profile_embeds_owner_pro_insert on public.talent_profile_embeds;
create policy talent_profile_embeds_owner_pro_insert
  on public.talent_profile_embeds
  for insert
  with check (
    public.is_talent_profile_owner(talent_profile_id)
    and public.talent_profile_has_pro_or_max(talent_profile_id)
  );

drop policy if exists talent_profile_embeds_owner_pro_update on public.talent_profile_embeds;
create policy talent_profile_embeds_owner_pro_update
  on public.talent_profile_embeds
  for update
  using (
    public.is_talent_profile_owner(talent_profile_id)
    and public.talent_profile_has_pro_or_max(talent_profile_id)
  )
  with check (
    public.is_talent_profile_owner(talent_profile_id)
    and public.talent_profile_has_pro_or_max(talent_profile_id)
  );

drop policy if exists talent_profile_embeds_owner_pro_delete on public.talent_profile_embeds;
create policy talent_profile_embeds_owner_pro_delete
  on public.talent_profile_embeds
  for delete
  using (
    public.is_talent_profile_owner(talent_profile_id)
    and public.talent_profile_has_pro_or_max(talent_profile_id)
  );

-- ── press ───────────────────────────────────────────────────────────────────

drop policy if exists talent_press_items_owner_select on public.talent_press_items;
create policy talent_press_items_owner_select
  on public.talent_press_items
  for select
  using (public.is_talent_profile_owner(talent_profile_id));

drop policy if exists talent_press_items_public_select on public.talent_press_items;
create policy talent_press_items_public_select
  on public.talent_press_items
  for select
  using (
    public.talent_profile_has_pro_or_max(talent_profile_id)
    and exists (
      select 1 from public.talent_profiles tp
      where tp.id = talent_profile_id
        and tp.is_publicly_hidden = false
    )
  );

drop policy if exists talent_press_items_owner_pro_insert on public.talent_press_items;
create policy talent_press_items_owner_pro_insert
  on public.talent_press_items
  for insert
  with check (
    public.is_talent_profile_owner(talent_profile_id)
    and public.talent_profile_has_pro_or_max(talent_profile_id)
  );

drop policy if exists talent_press_items_owner_pro_update on public.talent_press_items;
create policy talent_press_items_owner_pro_update
  on public.talent_press_items
  for update
  using (
    public.is_talent_profile_owner(talent_profile_id)
    and public.talent_profile_has_pro_or_max(talent_profile_id)
  )
  with check (
    public.is_talent_profile_owner(talent_profile_id)
    and public.talent_profile_has_pro_or_max(talent_profile_id)
  );

drop policy if exists talent_press_items_owner_pro_delete on public.talent_press_items;
create policy talent_press_items_owner_pro_delete
  on public.talent_press_items
  for delete
  using (
    public.is_talent_profile_owner(talent_profile_id)
    and public.talent_profile_has_pro_or_max(talent_profile_id)
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Grants — anon reads published rows through the public SELECT policy above.
-- ─────────────────────────────────────────────────────────────────────────────

grant select on public.talent_profile_embeds to anon, authenticated;
grant select on public.talent_press_items    to anon, authenticated;
grant insert, update, delete on public.talent_profile_embeds to authenticated;
grant insert, update, delete on public.talent_press_items    to authenticated;
