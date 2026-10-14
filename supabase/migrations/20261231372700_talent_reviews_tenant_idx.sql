-- TUL-732: the Reviews moderation queue filters talent_reviews by tenant_id
-- (reported rows newest first, and every row for the integrity panel). The
-- table had no tenant_id index, so each read was a sequential scan. Additive
-- and idempotent; NOT applied by the author (db:push is the owner's step).
create index if not exists talent_reviews_tenant_reported_idx
  on public.talent_reviews (tenant_id, reported_at desc)
  where reported_at is not null;

create index if not exists talent_reviews_tenant_talent_idx
  on public.talent_reviews (tenant_id, talent_profile_id);
