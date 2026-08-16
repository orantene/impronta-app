-- Gated media access becomes a platform switch instead of a deploy.
--
-- `MEDIA_PRIVATE_ACCESS_ENABLED` decided whether photos render as raw public
-- storage URLs or through `/api/media/asset/<id>`, the route that re-runs the
-- two-key predicate before it hands over any bytes. Flipping an env var means
-- a redeploy. This column is the same decision, flippable by a super admin
-- from /platform/admin/settings.
--
-- DEFAULT FALSE, deliberately. Production today has neither the env flag nor
-- the signing secret set, so the feature is off by absence. A column that
-- defaulted TRUE would silently turn the feature on the moment it landed,
-- which is exactly the failure this whole area is careful about: a wrong move
-- here blanks every photo on every site.
--
-- THE SIGNING SECRET STAYS IN THE ENVIRONMENT. `MEDIA_URL_SIGNING_SECRET` must
-- never move into this table. It is what makes a gated URL unforgeable, and
-- anyone who could read this row could then mint URLs for any (asset, surface)
-- pair they liked. The switch says "gate the bytes"; the secret says "this URL
-- came from us". Only the first one is safe to hand to the admin UI.
--
-- ENV STILL WINS. `MEDIA_PRIVATE_ACCESS_ENABLED=0` force-disables regardless of
-- this column, so ops can kill the feature without a database write; `=1`
-- force-enables (the pre-existing contract). Unset defers to this column. The
-- precedence table lives in web/src/lib/media/private-access.ts.
--
-- Timestamp note: this repo's migration filenames are a local sequence, not
-- wall clock. A `date -u` stamp (2026-08-16) would sort BEFORE the already
-- applied 2026-11 migrations and push out of order, so this continues the
-- sequence after 20261120000000.
alter table public.platform_settings
  add column if not exists media_private_access_enabled boolean not null default false;

comment on column public.platform_settings.media_private_access_enabled is
  'Serve media through the permission-checked /api/media/asset route instead of raw public storage URLs, so revoking a release actually stops the bytes. Requires MEDIA_URL_SIGNING_SECRET in the environment; without it the app stays on public URLs and warns once. MEDIA_PRIVATE_ACCESS_ENABLED=0/1 in the environment overrides this column in both directions.';
