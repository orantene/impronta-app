-- Phase 2 · E4 — reserve the `events` slug in the DATABASE mirror too.
--
-- THE FIFTH REGISTRATION. I shipped `/events` believing a new root path needed
-- four: the route file, the allow-list prefix, the gate branch, and both
-- reserved-prefix sets. It needs five, and the fifth is split across a
-- TypeScript constant and a database table that must agree.
--
-- `reserved-routes.collisions.static.test.ts` caught it and named both halves:
-- "these root routes resolve on a tenant host but are not reserved, so a CMS
-- page with the same slug would be unreachable: events. Add them to
-- PLATFORM_RESERVED_SLUGS and mirror them into public.platform_reserved_slugs."
--
-- THE FAILURE IT PREVENTS IS SILENT AND PERMANENT. Nothing errors. A tenant
-- author creates a CMS page slugged "events", the builder accepts it, the page
-- saves, and the route wins on every request — so the page they published can
-- never be opened by anyone, and no message anywhere says why. Reserving the
-- slug makes the builder refuse it up front, which is a sentence at the moment
-- of authoring instead of a mystery afterwards.
--
-- WHY BOTH HALVES. The TypeScript list is what the builder validates against;
-- the table is what the database enforces. A slug reserved in one and not the
-- other is reserved nowhere in practice — either the author is refused a slug
-- the platform would have allowed, or allowed one the routes will shadow.
--
-- `/r` is NOT reserved here, deliberately: it has no route file yet, so no
-- segment resolves and nothing is shadowed. It is reserved in the allow-list's
-- prefix sets, which is what stops a tenant SLUG from claiming it. This entry
-- follows the receipt route when it exists.

BEGIN;

-- `reason` is NOT NULL and has no default, on purpose: a reserved slug with no
-- stated reason is one nobody can ever safely un-reserve, because the next
-- reader cannot tell whether the route still exists.
-- THE TUPLE MUST START A LINE. `reserved-routes.collisions.static.test.ts:139`
-- reads layer 2 out of the migration FILES with `/^\s*\('([^']+)',/gm`, because
-- nothing else in CI can see the SQL. A tuple sharing a line with `VALUES` is
-- semantically identical and invisible to that regex — so a correct migration
-- fails the guard, and the DB and the guard disagree about a database that is
-- actually right. Formatting is load-bearing here; that is worth knowing before
-- someone "tidies" it back.
INSERT INTO public.platform_reserved_slugs (slug, reason)
VALUES
  ('events', 'Events & Ticketing: /events and /events/<slug> resolve on every tenant host, so a CMS page at this slug could never open.')
ON CONFLICT (slug) DO NOTHING;

COMMIT;
