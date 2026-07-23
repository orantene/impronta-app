-- Marketing email list (Wave 2 — Email/CRM from zero).
--
-- The cheapest owned channel. A visitor opts in from the /resources capture
-- module (double opt-in is future work; consent is recorded at signup time).
-- Writes go exclusively through the service-role client in the subscribe
-- server action — there is intentionally NO anon policy, so a leaked anon key
-- can neither read the list nor enumerate emails.

BEGIN;

-- Case-insensitive email so "Ada@x.com" and "ada@x.com" collapse to one row
-- via the UNIQUE constraint (no duplicate welcome sends, no split list).
create extension if not exists citext;

create table if not exists public.marketing_subscribers (
  id uuid primary key default gen_random_uuid(),
  email citext unique not null,
  -- 'en' | 'es' — drives which welcome email + future campaign copy is sent.
  locale text not null default 'en',
  -- Where the signup came from (e.g. 'resources-hub', 'resources-article').
  source text not null,
  consented_at timestamptz not null default now(),
  -- Null until the subscriber unsubscribes; set from the /resources/unsubscribe
  -- page keyed by unsubscribe_token below.
  unsubscribed_at timestamptz,
  -- Unguessable per-row credential embedded in the unsubscribe link. The email
  -- is never placed in the URL (privacy) — the token is the only handle.
  unsubscribe_token uuid not null default gen_random_uuid()
);

-- Unsubscribe links resolve a row by token alone.
create unique index if not exists marketing_subscribers_unsub_token_idx
  on public.marketing_subscribers (unsubscribe_token);

-- RLS on, no policies: every read/write is service-role only (which bypasses
-- RLS). anon/authenticated get nothing — no self-serve read path exists yet.
alter table public.marketing_subscribers enable row level security;

comment on table public.marketing_subscribers is
  'Marketing newsletter opt-ins captured on /resources. Service-role-only access; welcome + campaign sends run through the subscribe server action.';

COMMIT;
