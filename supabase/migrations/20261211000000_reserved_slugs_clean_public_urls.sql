-- Clean public URLs — reserved-slug registry, layer 2 of 3.
--
-- Customer-facing builder pages are moving from `/p/<slug>` to `/<slug>`.
-- Inside the `/p` namespace a page slug could only ever collide with another
-- page. At the root it shares a namespace with every platform route, and the
-- surface allow-list resolves those FIRST — so a page slugged "login" is not a
-- conflict the operator can see, it is a page they can create, publish and
-- link, that opens the sign-in screen instead.
--
-- This mirrors the code registry at web/src/lib/site-admin/reserved-routes.ts
-- (layer 1). The two lists are kept honest by
-- reserved-routes.collisions.static.test.ts, which derives the collision set
-- from the real route tree rather than restating it.
--
-- Three families are added:
--   a) root routes that resolve on a tenant host (auth, workspace, storefront,
--      and the host-agnostic surfaces like /checkout and /unsubscribe),
--   b) `p` itself — the legacy namespace still serves and 301s to the clean
--      form, so a page slugged "p" would fight its own redirect,
--   c) every platform locale code: `/es/<slug>` is the Spanish grammar for
--      `/<slug>`, so a page slugged "es" makes the whole locale-prefixed tree
--      ambiguous.
--
-- Also backfills `w`, which layer 1 has had since the /w/<slug> workspace
-- parent shipped but which was never mirrored here.
--
-- Existing rows are untouched. The guard trigger fires only on INSERT and on
-- UPDATE OF slug, so a grandfathered page that already holds one of these
-- words keeps serving; it is blocked only if someone renames it. Platform
-- system-owned rows (is_system_owned) bypass the guard as before.

BEGIN;

INSERT INTO public.platform_reserved_slugs (slug, reason) VALUES
  -- Backfill: shipped in layer 1 with the /w/<slug> workspace parent.
  ('w',                 'path-based workspace parent segment'),

  -- Auth surface.
  ('login',             'auth route'),
  ('register',          'auth route'),
  ('join',              'auth route'),
  ('claim',             'talent profile claim landing'),
  ('forgot-password',   'auth route'),
  ('update-password',   'auth route'),

  -- Workspace surfaces reachable from the tenant own host.
  ('account',           'role-scoped account redirect'),
  ('client',            'client workspace surface'),
  ('talent',            'talent workspace surface'),
  ('invite',            'invite redemption'),
  ('team-invite',       'emailed team-invite redemption'),
  ('template-preview',  'editor template preview'),
  ('platform',          'Tulala HQ console'),
  ('share',             'operator-issued share links'),

  -- Public storefront surfaces.
  ('directory',         'storefront + global talent directory'),
  ('models',            'storefront roster surface'),
  ('posts',             'editorial posts surface'),
  ('p',                 'legacy CMS page namespace, 301s to the clean URL'),
  ('c',                 'guest conversation surface'),

  -- Host-agnostic surfaces that resolve on every host kind.
  ('checkout',          'post-checkout landing'),
  ('embed',             'public embed widget'),
  ('embed.js',          'public embed loader'),
  ('unsubscribe',       'one-click unsubscribe'),
  ('review',            'review-invite landing'),
  ('offline',           'PWA offline fallback'),
  ('prototypes',        'brand/design prototypes'),
  ('opengraph-image',   'metadata file-route'),
  ('twitter-image',     'metadata file-route'),
  ('.well-known',       'deep-link association files'),

  -- Locale prefixes. Mirrors PLATFORM_LOCALE_SLUGS, which is derived from the
  -- i18n registry (STATIC_LOCALES + localeMetadata). A locale added to
  -- app_locales at runtime must be added to BOTH layers.
  ('en',                'locale URL prefix'),
  ('es',                'locale URL prefix'),
  ('fr',                'locale URL prefix'),
  ('pt',                'locale URL prefix'),
  ('pt-br',             'locale URL prefix'),
  ('de',                'locale URL prefix'),
  ('it',                'locale URL prefix'),
  ('ja',                'locale URL prefix')
ON CONFLICT (slug) DO NOTHING;

COMMIT;
