-- Phase 2 · E4b — reserve the `r` slug (the ticket receipt, /r/<code>) in the
-- DATABASE mirror.
--
-- `…375_reserve_events_slug.sql` said: "`/r` is NOT reserved here,
-- deliberately: it has no route file yet ... This entry follows the receipt
-- route when it exists." The route file now exists (`(public)/r/[code]`), and
-- `reserved-routes.collisions.static.test.ts` named the gap the moment it did:
-- "these root routes resolve on a tenant host but are not reserved ... : r".
--
-- Same failure prevented, same two halves: `PLATFORM_RESERVED_SLUGS` is what
-- the builder validates against, this table is what the database enforces,
-- and a slug in one and not the other is reserved nowhere in practice.
--
-- THE TUPLE MUST START A LINE — the static guard reads this file with
-- `/^\s*\('([^']+)',/gm`. Formatting is load-bearing.

BEGIN;

INSERT INTO public.platform_reserved_slugs (slug, reason)
VALUES
  ('r', 'Events & Ticketing: /r/<code> is the ticket receipt and resolves on every tenant host, so a CMS page at this slug could never open.')
ON CONFLICT (slug) DO NOTHING;

COMMIT;
