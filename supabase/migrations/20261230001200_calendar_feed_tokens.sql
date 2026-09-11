-- Calendar subscription tokens — the credential behind the iCal feed URL.
--
-- WHY A STORED HASH AND NOT AN HMAC-SIGNED TOKEN
-- ─────────────────────────────────────────────
-- Every other opaque token in this codebase (guest cookie, share JWT, resume
-- token, media URL) is HMAC-signed and stateless, and that is right for all of
-- them: they are short-lived and their blast radius ends when they expire.
--
-- A calendar subscription URL is the opposite shape. It is pasted into Apple
-- Calendar once and polled for years, it is frequently forwarded, and the one
-- operation an operator will actually need is "that URL got out, kill it".
-- A stateless token cannot be killed without rotating the signing secret, which
-- kills every other operator's subscription at the same time. So the token is a
-- random secret, only its SHA-256 is stored, and revoking is an UPDATE on one
-- row.
--
-- The plaintext is returned exactly once, at mint. There is no read path back
-- to it — an operator who loses the URL rotates and re-subscribes, which is the
-- same thing every other subscription product does and the only thing a hash
-- allows.
--
-- ONE LIVE TOKEN PER (tenant, user). Not per tenant: a feed carries the
-- workspace's bookings, but the URL is a personal credential and revoking one
-- staff member's subscription must not disconnect the rest of the team's
-- phones. Not many-per-user either — an operator with four live URLs cannot
-- answer "which of these is on the laptop I lost", which makes revocation a
-- guess.

create table if not exists public.calendar_feed_tokens (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.agencies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  -- Hex SHA-256 of the plaintext token. UNIQUE so a collision (or a replayed
  -- mint) surfaces as an error rather than as two rows one lookup picks between.
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  -- Advanced by the route, best-effort. Its only job is to let an operator tell
  -- a live subscription from one nothing has polled in a year before they
  -- revoke it.
  last_used_at timestamptz,
  revoked_at timestamptz
);

-- The uniqueness that matters, expressed as a partial index because revoked
-- rows must be allowed to pile up: they are the audit trail of every URL that
-- was ever killed, and deleting them to satisfy a plain UNIQUE would erase it.
create unique index if not exists calendar_feed_tokens_live_per_user
  on public.calendar_feed_tokens (tenant_id, user_id)
  where revoked_at is null;

-- The route's only lookup: hash → row. Already covered by the UNIQUE on
-- token_hash; named here so a future refactor that drops the constraint does
-- not silently turn every calendar poll into a sequential scan.
create index if not exists calendar_feed_tokens_tenant_idx
  on public.calendar_feed_tokens (tenant_id);

alter table public.calendar_feed_tokens enable row level security;

-- NO POLICIES, deliberately, which under RLS means no anon or authenticated
-- access at all.
--
-- The feed route resolves the token with the service role and answers with
-- calendar text; it never hands a client this table. A SELECT policy scoped to
-- `auth.uid()` would look harmless and would hand every signed-in operator a
-- readable list of `token_hash` values — offline-crackable if the mint ever
-- weakened, and in any case a list of live credentials that nothing in the
-- product needs to read.
revoke all on public.calendar_feed_tokens from anon, authenticated;
grant select, insert, update on public.calendar_feed_tokens to service_role;

comment on table public.calendar_feed_tokens is
  'Per-operator credential for the read-only iCal subscription feed at /api/calendar/feed/<token>. Plaintext is shown once at mint; only its SHA-256 is stored. Revoking is an UPDATE of revoked_at, which is why this is a stored hash rather than a signed stateless token.';
