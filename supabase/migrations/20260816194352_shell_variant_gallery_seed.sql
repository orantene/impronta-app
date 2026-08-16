-- Shell header / footer VARIANT GALLERY — the six platform-authored templates.
--
-- GENERATED FILE. Do not hand-edit.
--   Source: web/src/lib/site-admin/builder-core/templates/shell-variant-seeds.ts
--   Regenerate: node scripts/gen-shell-variant-seed.mjs <this-file>
--
-- WHAT THIS SHIPS
-- ============================================================================
-- 1. `builder_templates.preview_image_url` — a card thumbnail served straight
--    from the app (`/builder-previews/*.svg`).
--
--    The table already had `thumbnail_asset_id` / `hero_asset_id`, both FKs to
--    `media_assets`. Those work for a template DONATED from a workspace, which
--    owns its media. A PLATFORM-authored template belongs to no tenant, so it
--    can own no media asset and those two columns have nothing to point at —
--    which is why all six would otherwise render the generic SVG wireframe.
--    Nullable and additive: every existing row is unaffected, and the resolver
--    still falls back to the asset ids when this is null.
--
-- 2. Six published shell templates: three `shell_header`, three `shell_footer`.
--    Payload is a freeform `builder_tree`; applying one REPLACES the target
--    landmark's children via `applyShellTemplateToTree` and preserves the other
--    landmark. Every colour in every tree is a theme token with a literal
--    fallback, so a variant adopts the tenant's brand rather than carrying one.
--
-- IDEMPOTENT: `ON CONFLICT (kind, slug) DO UPDATE` refreshes the design in
-- place, so a later revision is a re-run rather than a second row.
--
-- REQUIRED PLAN: the rows are `free` — plan gating for a shell REPLACE is
-- enforced in the action (`isShellVariantApplyAllowedForPlan`, agency+), not by
-- hiding the cards. Free/studio operators can see what the tier buys.

BEGIN;

-- ── 1. preview_image_url ─────────────────────────────────────────────────────

ALTER TABLE public.builder_templates
  ADD COLUMN IF NOT EXISTS preview_image_url text;

COMMENT ON COLUMN public.builder_templates.preview_image_url
  IS 'Gallery-card thumbnail served by the app (/builder-previews/…) or an https URL. Takes priority over thumbnail_asset_id / hero_asset_id. Used by platform-authored templates, which own no media_assets row.';

-- ── 2. the six variants ──────────────────────────────────────────────────────

INSERT INTO public.builder_templates (
  kind,
  status,
  target_context,
  title,
  slug,
  description,
  category,
  gallery_tab,
  tags,
  preview_image_url,
  required_plan,
  builder_tree,
  updated_at
)
VALUES
  (
    'shell_header'::public.builder_template_kind,
    'published'::public.builder_template_status,
    'workspace'::public.builder_template_target,
    'Minimal, centre logo',
    'shell-header-minimal-centre',
    'Centred wordmark with the navigation on the line below. Quiet, symmetrical, gets out of the way of the page.',
    'navigation',
    'shell',
    ARRAY['header', 'minimal', 'centered', 'shell']::text[],
    '/builder-previews/shell-header-minimal-centre.svg',
    'free',
    '[{"id":"header-minimal-centre-c-3","kind":"container","props":{"layerLabel":"Header — Minimal Centre","layout":"stack","align":"center","gap":"s","style":{"paddingLeft":"clamp(20px, 5vw, 56px)","paddingRight":"clamp(20px, 5vw, 56px)","paddingTop":"26px","paddingBottom":"20px","backgroundColor":"var(--token-color-surface-raised, #ffffff)","boxShadow":"inset 0 -1px 0 var(--token-color-line, #e7e5e4)"}},"children":[{"id":"header-minimal-centre-h-1","kind":"heading","props":{"text":"Studio Name","level":2,"layerLabel":"Wordmark","style":{"align":"center","textColor":"var(--token-color-ink, #1c1917)","fontFamily":"var(--token-typography-heading-font-family, ui-serif, Georgia, serif)","fontSize":"clamp(1.15rem, 2.2vw, 1.55rem)","letterSpacing":"0.16em","textTransform":"uppercase","lineHeight":"1"}}},{"id":"header-minimal-centre-nav-2","kind":"nav","props":{"ariaLabel":"Primary","style":{"justifyContent":"center","gap":"28px","fontSize":"0.78rem","letterSpacing":"0.13em","textTransform":"uppercase","textColor":"var(--token-color-muted, #78716c)"},"links":[{"id":"nav-2-l0","label":"Roster","href":"/directory"},{"id":"nav-2-l1","label":"Studio","href":"/about"},{"id":"nav-2-l2","label":"Journal","href":"/posts"},{"id":"nav-2-l3","label":"Contact","href":"/contact"}]}}]}]'::jsonb,
    -- Stepped so the gallery's default `ORDER BY updated_at DESC` presents the
    -- six in the authored order (headers first, then footers) rather than in
    -- whatever order the INSERT happened to commit.
    now() - interval '0 seconds'
  ),
  (
    'shell_header'::public.builder_template_kind,
    'published'::public.builder_template_status,
    'workspace'::public.builder_template_target,
    'Split nav and action',
    'shell-header-split',
    'Navigation on the left, wordmark centred, one call to action on the right. The workhorse three-column bar.',
    'navigation',
    'shell',
    ARRAY['header', 'split', 'cta', 'shell']::text[],
    '/builder-previews/shell-header-split.svg',
    'free',
    '[{"id":"header-split-c-5","kind":"container","props":{"layerLabel":"Header — Split","layout":"grid","columns":3,"align":"center","gap":"m","responsive":{"mobile":{"layout":"stack","columns":1}},"style":{"paddingLeft":"clamp(20px, 5vw, 56px)","paddingRight":"clamp(20px, 5vw, 56px)","paddingTop":"18px","paddingBottom":"18px","backgroundColor":"var(--token-color-surface-raised, #ffffff)","boxShadow":"inset 0 -1px 0 var(--token-color-line, #e7e5e4)","alignItems":"center"}},"children":[{"id":"header-split-nav-1","kind":"nav","props":{"ariaLabel":"Primary","style":{"justifyContent":"flex-start","gap":"22px","fontSize":"0.8rem","letterSpacing":"0.08em","textColor":"var(--token-color-muted, #78716c)"},"links":[{"id":"nav-1-l0","label":"Roster","href":"/directory"},{"id":"nav-1-l1","label":"Studio","href":"/about"},{"id":"nav-1-l2","label":"Journal","href":"/posts"}]}},{"id":"header-split-h-2","kind":"heading","props":{"text":"Studio Name","level":2,"layerLabel":"Wordmark","style":{"align":"center","textColor":"var(--token-color-ink, #1c1917)","fontFamily":"var(--token-typography-heading-font-family, ui-serif, Georgia, serif)","fontSize":"clamp(1.05rem, 1.9vw, 1.35rem)","letterSpacing":"0.18em","textTransform":"uppercase","lineHeight":"1"}}},{"id":"header-split-c-4","kind":"container","props":{"layerLabel":"Actions","layout":"row","align":"center","gap":"s","style":{"justifyContent":"flex-end"}},"children":[{"id":"header-split-btn-3","kind":"button","props":{"label":"Start an inquiry","href":"/directory","tone":"primary","layerLabel":"Call to action"}}]}]}]'::jsonb,
    -- Stepped so the gallery's default `ORDER BY updated_at DESC` presents the
    -- six in the authored order (headers first, then footers) rather than in
    -- whatever order the INSERT happened to commit.
    now() - interval '1 seconds'
  ),
  (
    'shell_header'::public.builder_template_kind,
    'published'::public.builder_template_status,
    'workspace'::public.builder_template_target,
    'Editorial with tagline',
    'shell-header-editorial',
    'Large wordmark and a tagline stacked over a hairline rule, with the navigation beneath. Reads like a masthead.',
    'navigation',
    'shell',
    ARRAY['header', 'editorial', 'masthead', 'shell']::text[],
    '/builder-previews/shell-header-editorial.svg',
    'free',
    '[{"id":"header-editorial-c-6","kind":"container","props":{"layerLabel":"Header — Editorial","layout":"stack","align":"stretch","gap":"m","style":{"paddingLeft":"clamp(20px, 5vw, 56px)","paddingRight":"clamp(20px, 5vw, 56px)","paddingTop":"30px","paddingBottom":"16px","backgroundColor":"var(--token-color-surface-raised, #ffffff)","boxShadow":"inset 0 -1px 0 var(--token-color-line, #e7e5e4)"}},"children":[{"id":"header-editorial-c-3","kind":"container","props":{"layerLabel":"Brand Block","layout":"stack","align":"start","gap":"s"},"children":[{"id":"header-editorial-h-1","kind":"heading","props":{"text":"Studio Name","level":2,"layerLabel":"Wordmark","style":{"align":"left","textColor":"var(--token-color-ink, #1c1917)","fontFamily":"var(--token-typography-heading-font-family, ui-serif, Georgia, serif)","fontSize":"clamp(1.6rem, 4vw, 2.6rem)","lineHeight":"1","letterSpacing":"-0.01em"}}},{"id":"header-editorial-p-2","kind":"paragraph","props":{"text":"Casting and talent management","layerLabel":"Tagline","style":{"align":"left","textColor":"var(--token-color-muted, #78716c)","fontSize":"0.72rem","letterSpacing":"0.22em","textTransform":"uppercase"}}}]},{"id":"header-editorial-rule-4","kind":"divider","props":{"tone":"muted"}},{"id":"header-editorial-nav-5","kind":"nav","props":{"ariaLabel":"Primary","style":{"justifyContent":"flex-start","gap":"30px","fontSize":"0.78rem","letterSpacing":"0.12em","textTransform":"uppercase","textColor":"var(--token-color-ink, #1c1917)"},"links":[{"id":"nav-5-l0","label":"Roster","href":"/directory"},{"id":"nav-5-l1","label":"Studio","href":"/about"},{"id":"nav-5-l2","label":"Journal","href":"/posts"},{"id":"nav-5-l3","label":"Contact","href":"/contact"}]}}]}]'::jsonb,
    -- Stepped so the gallery's default `ORDER BY updated_at DESC` presents the
    -- six in the authored order (headers first, then footers) rather than in
    -- whatever order the INSERT happened to commit.
    now() - interval '2 seconds'
  ),
  (
    'shell_footer'::public.builder_template_kind,
    'published'::public.builder_template_status,
    'workspace'::public.builder_template_target,
    'Slim one-line',
    'shell-footer-slim',
    'Copyright, a short link row and social icons on a single line. For pages that already end on a strong call to action.',
    'navigation',
    'shell',
    ARRAY['footer', 'slim', 'minimal', 'shell']::text[],
    '/builder-previews/shell-footer-slim.svg',
    'free',
    '[{"id":"footer-slim-c-7","kind":"container","props":{"layerLabel":"Footer — Slim Line","layout":"grid","columns":3,"align":"center","gap":"m","responsive":{"mobile":{"layout":"stack","columns":1}},"style":{"paddingLeft":"clamp(20px, 5vw, 56px)","paddingRight":"clamp(20px, 5vw, 56px)","paddingTop":"20px","paddingBottom":"20px","backgroundColor":"var(--token-color-surface-raised, #ffffff)","boxShadow":"inset 0 1px 0 var(--token-color-line, #e7e5e4)","alignItems":"center"}},"children":[{"id":"footer-slim-p-1","kind":"paragraph","props":{"text":"© Studio Name","layerLabel":"Copyright","style":{"align":"left","textColor":"var(--token-color-muted, #78716c)","fontSize":"0.78rem","letterSpacing":"0.04em"}}},{"id":"footer-slim-c-5","kind":"container","props":{"layerLabel":"Footer Links","layout":"row","align":"center","gap":"m","style":{"justifyContent":"center"}},"children":[{"id":"footer-slim-link-2","kind":"button","props":{"label":"Privacy","href":"/privacy","tone":"secondary","layerLabel":"Link","style":{"backgroundColor":"transparent","borderWidth":"0px","borderRadius":"0px","paddingTop":"0px","paddingBottom":"0px","paddingLeft":"0px","paddingRight":"0px","textColor":"var(--token-color-muted, #78716c)","fontSize":"0.78rem","align":"left"}}},{"id":"footer-slim-link-3","kind":"button","props":{"label":"Terms","href":"/terms","tone":"secondary","layerLabel":"Link","style":{"backgroundColor":"transparent","borderWidth":"0px","borderRadius":"0px","paddingTop":"0px","paddingBottom":"0px","paddingLeft":"0px","paddingRight":"0px","textColor":"var(--token-color-muted, #78716c)","fontSize":"0.78rem","align":"left"}}},{"id":"footer-slim-link-4","kind":"button","props":{"label":"Contact","href":"/contact","tone":"secondary","layerLabel":"Link","style":{"backgroundColor":"transparent","borderWidth":"0px","borderRadius":"0px","paddingTop":"0px","paddingBottom":"0px","paddingLeft":"0px","paddingRight":"0px","textColor":"var(--token-color-muted, #78716c)","fontSize":"0.78rem","align":"left"}}}]},{"id":"footer-slim-social-6","kind":"social_links","props":{"ariaLabel":"Social links","size":"sm","shape":"bare","layerLabel":"Social Links","style":{"justifyContent":"flex-end"},"links":[{"id":"social-6-s0","platform":"instagram","href":"https://instagram.com/"},{"id":"social-6-s1","platform":"tiktok","href":"https://tiktok.com/"},{"id":"social-6-s2","platform":"email","href":"mailto:hello@example.com"}]}}]}]'::jsonb,
    -- Stepped so the gallery's default `ORDER BY updated_at DESC` presents the
    -- six in the authored order (headers first, then footers) rather than in
    -- whatever order the INSERT happened to commit.
    now() - interval '3 seconds'
  ),
  (
    'shell_footer'::public.builder_template_kind,
    'published'::public.builder_template_status,
    'workspace'::public.builder_template_target,
    'Columns and newsletter',
    'shell-footer-columns-newsletter',
    'Three link columns plus a newsletter block, over a legal row with social. The footer doing real navigation work.',
    'navigation',
    'shell',
    ARRAY['footer', 'columns', 'newsletter', 'shell']::text[],
    '/builder-previews/shell-footer-columns-newsletter.svg',
    'free',
    '[{"id":"footer-columns-newsletter-c-25","kind":"container","props":{"layerLabel":"Footer — Columns and Newsletter","layout":"stack","align":"stretch","gap":"l","style":{"paddingLeft":"clamp(20px, 5vw, 56px)","paddingRight":"clamp(20px, 5vw, 56px)","paddingTop":"52px","paddingBottom":"28px","backgroundColor":"var(--token-color-surface-raised, #ffffff)","boxShadow":"inset 0 1px 0 var(--token-color-line, #e7e5e4)"}},"children":[{"id":"footer-columns-newsletter-c-20","kind":"container","props":{"layerLabel":"Footer Columns","layout":"grid","columns":4,"gap":"l","align":"start","responsive":{"tablet":{"layout":"grid","columns":2},"mobile":{"layout":"stack","columns":1}}},"children":[{"id":"footer-columns-newsletter-c-5","kind":"container","props":{"layerLabel":"Studio Column","layout":"stack","align":"start","gap":"s"},"children":[{"id":"footer-columns-newsletter-p-1","kind":"paragraph","props":{"text":"Studio","layerLabel":"Column Heading","style":{"align":"left","textColor":"var(--token-color-ink, #1c1917)","fontSize":"0.7rem","letterSpacing":"0.19em","textTransform":"uppercase"}}},{"id":"footer-columns-newsletter-link-2","kind":"button","props":{"label":"About","href":"/about","tone":"secondary","layerLabel":"Link","style":{"backgroundColor":"transparent","borderWidth":"0px","borderRadius":"0px","paddingTop":"0px","paddingBottom":"0px","paddingLeft":"0px","paddingRight":"0px","textColor":"var(--token-color-muted, #78716c)","fontSize":"0.84rem","align":"left"}}},{"id":"footer-columns-newsletter-link-3","kind":"button","props":{"label":"Journal","href":"/posts","tone":"secondary","layerLabel":"Link","style":{"backgroundColor":"transparent","borderWidth":"0px","borderRadius":"0px","paddingTop":"0px","paddingBottom":"0px","paddingLeft":"0px","paddingRight":"0px","textColor":"var(--token-color-muted, #78716c)","fontSize":"0.84rem","align":"left"}}},{"id":"footer-columns-newsletter-link-4","kind":"button","props":{"label":"Careers","href":"/careers","tone":"secondary","layerLabel":"Link","style":{"backgroundColor":"transparent","borderWidth":"0px","borderRadius":"0px","paddingTop":"0px","paddingBottom":"0px","paddingLeft":"0px","paddingRight":"0px","textColor":"var(--token-color-muted, #78716c)","fontSize":"0.84rem","align":"left"}}}]},{"id":"footer-columns-newsletter-c-10","kind":"container","props":{"layerLabel":"Roster Column","layout":"stack","align":"start","gap":"s"},"children":[{"id":"footer-columns-newsletter-p-6","kind":"paragraph","props":{"text":"Roster","layerLabel":"Column Heading","style":{"align":"left","textColor":"var(--token-color-ink, #1c1917)","fontSize":"0.7rem","letterSpacing":"0.19em","textTransform":"uppercase"}}},{"id":"footer-columns-newsletter-link-7","kind":"button","props":{"label":"All talent","href":"/directory","tone":"secondary","layerLabel":"Link","style":{"backgroundColor":"transparent","borderWidth":"0px","borderRadius":"0px","paddingTop":"0px","paddingBottom":"0px","paddingLeft":"0px","paddingRight":"0px","textColor":"var(--token-color-muted, #78716c)","fontSize":"0.84rem","align":"left"}}},{"id":"footer-columns-newsletter-link-8","kind":"button","props":{"label":"Models","href":"/directory?type=model","tone":"secondary","layerLabel":"Link","style":{"backgroundColor":"transparent","borderWidth":"0px","borderRadius":"0px","paddingTop":"0px","paddingBottom":"0px","paddingLeft":"0px","paddingRight":"0px","textColor":"var(--token-color-muted, #78716c)","fontSize":"0.84rem","align":"left"}}},{"id":"footer-columns-newsletter-link-9","kind":"button","props":{"label":"Creatives","href":"/directory?type=creative","tone":"secondary","layerLabel":"Link","style":{"backgroundColor":"transparent","borderWidth":"0px","borderRadius":"0px","paddingTop":"0px","paddingBottom":"0px","paddingLeft":"0px","paddingRight":"0px","textColor":"var(--token-color-muted, #78716c)","fontSize":"0.84rem","align":"left"}}}]},{"id":"footer-columns-newsletter-c-15","kind":"container","props":{"layerLabel":"Work with us Column","layout":"stack","align":"start","gap":"s"},"children":[{"id":"footer-columns-newsletter-p-11","kind":"paragraph","props":{"text":"Work with us","layerLabel":"Column Heading","style":{"align":"left","textColor":"var(--token-color-ink, #1c1917)","fontSize":"0.7rem","letterSpacing":"0.19em","textTransform":"uppercase"}}},{"id":"footer-columns-newsletter-link-12","kind":"button","props":{"label":"Start an inquiry","href":"/directory","tone":"secondary","layerLabel":"Link","style":{"backgroundColor":"transparent","borderWidth":"0px","borderRadius":"0px","paddingTop":"0px","paddingBottom":"0px","paddingLeft":"0px","paddingRight":"0px","textColor":"var(--token-color-muted, #78716c)","fontSize":"0.84rem","align":"left"}}},{"id":"footer-columns-newsletter-link-13","kind":"button","props":{"label":"Contact","href":"/contact","tone":"secondary","layerLabel":"Link","style":{"backgroundColor":"transparent","borderWidth":"0px","borderRadius":"0px","paddingTop":"0px","paddingBottom":"0px","paddingLeft":"0px","paddingRight":"0px","textColor":"var(--token-color-muted, #78716c)","fontSize":"0.84rem","align":"left"}}},{"id":"footer-columns-newsletter-link-14","kind":"button","props":{"label":"Join the roster","href":"/register","tone":"secondary","layerLabel":"Link","style":{"backgroundColor":"transparent","borderWidth":"0px","borderRadius":"0px","paddingTop":"0px","paddingBottom":"0px","paddingLeft":"0px","paddingRight":"0px","textColor":"var(--token-color-muted, #78716c)","fontSize":"0.84rem","align":"left"}}}]},{"id":"footer-columns-newsletter-c-19","kind":"container","props":{"layerLabel":"Newsletter Column","layout":"stack","align":"start","gap":"s"},"children":[{"id":"footer-columns-newsletter-p-16","kind":"paragraph","props":{"text":"Newsletter","layerLabel":"Column Heading","style":{"align":"left","textColor":"var(--token-color-ink, #1c1917)","fontSize":"0.7rem","letterSpacing":"0.19em","textTransform":"uppercase"}}},{"id":"footer-columns-newsletter-p-17","kind":"paragraph","props":{"text":"Casting calls and new faces, once a month.","layerLabel":"Newsletter Copy","style":{"align":"left","textColor":"var(--token-color-muted, #78716c)","fontSize":"0.84rem","lineHeight":"1.5"}}},{"id":"footer-columns-newsletter-btn-18","kind":"button","props":{"label":"Subscribe","href":"/contact","tone":"primary","layerLabel":"Call to action"}}]}]},{"id":"footer-columns-newsletter-rule-21","kind":"divider","props":{"tone":"muted"}},{"id":"footer-columns-newsletter-c-24","kind":"container","props":{"layerLabel":"Legal Row","layout":"row","align":"center","gap":"m","responsive":{"mobile":{"layout":"stack"}},"style":{"justifyContent":"space-between","alignItems":"center"}},"children":[{"id":"footer-columns-newsletter-p-22","kind":"paragraph","props":{"text":"© Studio Name. All rights reserved.","layerLabel":"Copyright","style":{"align":"left","textColor":"var(--token-color-muted, #78716c)","fontSize":"0.74rem"}}},{"id":"footer-columns-newsletter-social-23","kind":"social_links","props":{"ariaLabel":"Social links","size":"sm","shape":"bare","layerLabel":"Social Links","style":{"justifyContent":"flex-end"},"links":[{"id":"social-23-s0","platform":"instagram","href":"https://instagram.com/"},{"id":"social-23-s1","platform":"tiktok","href":"https://tiktok.com/"},{"id":"social-23-s2","platform":"linkedin","href":"https://linkedin.com/"}]}}]}]}]'::jsonb,
    -- Stepped so the gallery's default `ORDER BY updated_at DESC` presents the
    -- six in the authored order (headers first, then footers) rather than in
    -- whatever order the INSERT happened to commit.
    now() - interval '4 seconds'
  ),
  (
    'shell_footer'::public.builder_template_kind,
    'published'::public.builder_template_status,
    'workspace'::public.builder_template_target,
    'Editorial wordmark',
    'shell-footer-editorial',
    'An oversized wordmark on the left with the link columns tucked to the right. The most magazine-like of the three.',
    'navigation',
    'shell',
    ARRAY['footer', 'editorial', 'wordmark', 'shell']::text[],
    '/builder-previews/shell-footer-editorial.svg',
    'free',
    '[{"id":"footer-editorial-c-21","kind":"container","props":{"layerLabel":"Footer — Editorial Wordmark","layout":"stack","align":"stretch","gap":"l","style":{"paddingLeft":"clamp(20px, 5vw, 56px)","paddingRight":"clamp(20px, 5vw, 56px)","paddingTop":"64px","paddingBottom":"28px","backgroundColor":"var(--token-color-surface-raised, #ffffff)","boxShadow":"inset 0 1px 0 var(--token-color-line, #e7e5e4)"}},"children":[{"id":"footer-editorial-c-14","kind":"container","props":{"layerLabel":"Footer Body","layout":"grid","columns":2,"gap":"l","align":"start","responsive":{"mobile":{"layout":"stack","columns":1}},"style":{"gridTemplateColumns":"1.6fr 1fr"}},"children":[{"id":"footer-editorial-c-4","kind":"container","props":{"layerLabel":"Brand Block","layout":"stack","align":"start","gap":"m"},"children":[{"id":"footer-editorial-h-1","kind":"heading","props":{"text":"Studio Name","level":2,"layerLabel":"Wordmark","style":{"align":"left","textColor":"var(--token-color-ink, #1c1917)","fontFamily":"var(--token-typography-heading-font-family, ui-serif, Georgia, serif)","fontSize":"clamp(2.4rem, 7vw, 4.5rem)","lineHeight":"0.92","letterSpacing":"-0.02em"}}},{"id":"footer-editorial-p-2","kind":"paragraph","props":{"text":"Representation, casting and production support.","layerLabel":"Tagline","style":{"align":"left","textColor":"var(--token-color-muted, #78716c)","fontSize":"0.88rem","lineHeight":"1.55","maxWidthFree":"34ch"}}},{"id":"footer-editorial-social-3","kind":"social_links","props":{"ariaLabel":"Social links","size":"sm","shape":"bare","layerLabel":"Social Links","style":{"justifyContent":"flex-start"},"links":[{"id":"social-3-s0","platform":"instagram","href":"https://instagram.com/"},{"id":"social-3-s1","platform":"tiktok","href":"https://tiktok.com/"},{"id":"social-3-s2","platform":"email","href":"mailto:hello@example.com"}]}}]},{"id":"footer-editorial-c-13","kind":"container","props":{"layerLabel":"Link Columns","layout":"grid","columns":2,"gap":"l","align":"start","responsive":{"mobile":{"layout":"stack","columns":1}}},"children":[{"id":"footer-editorial-c-8","kind":"container","props":{"layerLabel":"Studio Column","layout":"stack","align":"start","gap":"s"},"children":[{"id":"footer-editorial-p-5","kind":"paragraph","props":{"text":"Studio","layerLabel":"Column Heading","style":{"align":"left","textColor":"var(--token-color-ink, #1c1917)","fontSize":"0.7rem","letterSpacing":"0.19em","textTransform":"uppercase"}}},{"id":"footer-editorial-link-6","kind":"button","props":{"label":"About","href":"/about","tone":"secondary","layerLabel":"Link","style":{"backgroundColor":"transparent","borderWidth":"0px","borderRadius":"0px","paddingTop":"0px","paddingBottom":"0px","paddingLeft":"0px","paddingRight":"0px","textColor":"var(--token-color-muted, #78716c)","fontSize":"0.82rem","align":"left"}}},{"id":"footer-editorial-link-7","kind":"button","props":{"label":"Journal","href":"/posts","tone":"secondary","layerLabel":"Link","style":{"backgroundColor":"transparent","borderWidth":"0px","borderRadius":"0px","paddingTop":"0px","paddingBottom":"0px","paddingLeft":"0px","paddingRight":"0px","textColor":"var(--token-color-muted, #78716c)","fontSize":"0.82rem","align":"left"}}}]},{"id":"footer-editorial-c-12","kind":"container","props":{"layerLabel":"Roster Column","layout":"stack","align":"start","gap":"s"},"children":[{"id":"footer-editorial-p-9","kind":"paragraph","props":{"text":"Roster","layerLabel":"Column Heading","style":{"align":"left","textColor":"var(--token-color-ink, #1c1917)","fontSize":"0.7rem","letterSpacing":"0.19em","textTransform":"uppercase"}}},{"id":"footer-editorial-link-10","kind":"button","props":{"label":"All talent","href":"/directory","tone":"secondary","layerLabel":"Link","style":{"backgroundColor":"transparent","borderWidth":"0px","borderRadius":"0px","paddingTop":"0px","paddingBottom":"0px","paddingLeft":"0px","paddingRight":"0px","textColor":"var(--token-color-muted, #78716c)","fontSize":"0.82rem","align":"left"}}},{"id":"footer-editorial-link-11","kind":"button","props":{"label":"Contact","href":"/contact","tone":"secondary","layerLabel":"Link","style":{"backgroundColor":"transparent","borderWidth":"0px","borderRadius":"0px","paddingTop":"0px","paddingBottom":"0px","paddingLeft":"0px","paddingRight":"0px","textColor":"var(--token-color-muted, #78716c)","fontSize":"0.82rem","align":"left"}}}]}]}]},{"id":"footer-editorial-rule-15","kind":"divider","props":{"tone":"muted"}},{"id":"footer-editorial-c-20","kind":"container","props":{"layerLabel":"Legal Row","layout":"row","align":"center","gap":"m","responsive":{"mobile":{"layout":"stack"}},"style":{"justifyContent":"space-between","alignItems":"center"}},"children":[{"id":"footer-editorial-p-16","kind":"paragraph","props":{"text":"© Studio Name","layerLabel":"Copyright","style":{"align":"left","textColor":"var(--token-color-muted, #78716c)","fontSize":"0.72rem"}}},{"id":"footer-editorial-c-19","kind":"container","props":{"layerLabel":"Legal Links","layout":"row","align":"center","gap":"m","style":{"justifyContent":"flex-end"}},"children":[{"id":"footer-editorial-link-17","kind":"button","props":{"label":"Privacy","href":"/privacy","tone":"secondary","layerLabel":"Link","style":{"backgroundColor":"transparent","borderWidth":"0px","borderRadius":"0px","paddingTop":"0px","paddingBottom":"0px","paddingLeft":"0px","paddingRight":"0px","textColor":"var(--token-color-muted, #78716c)","fontSize":"0.72rem","align":"left"}}},{"id":"footer-editorial-link-18","kind":"button","props":{"label":"Terms","href":"/terms","tone":"secondary","layerLabel":"Link","style":{"backgroundColor":"transparent","borderWidth":"0px","borderRadius":"0px","paddingTop":"0px","paddingBottom":"0px","paddingLeft":"0px","paddingRight":"0px","textColor":"var(--token-color-muted, #78716c)","fontSize":"0.72rem","align":"left"}}}]}]}]}]'::jsonb,
    -- Stepped so the gallery's default `ORDER BY updated_at DESC` presents the
    -- six in the authored order (headers first, then footers) rather than in
    -- whatever order the INSERT happened to commit.
    now() - interval '5 seconds'
  )
ON CONFLICT (kind, slug) DO UPDATE SET
  status            = EXCLUDED.status,
  target_context    = EXCLUDED.target_context,
  title             = EXCLUDED.title,
  description       = EXCLUDED.description,
  category          = EXCLUDED.category,
  gallery_tab       = EXCLUDED.gallery_tab,
  tags              = EXCLUDED.tags,
  preview_image_url = EXCLUDED.preview_image_url,
  required_plan     = EXCLUDED.required_plan,
  builder_tree      = EXCLUDED.builder_tree,
  -- Bump the version so any cache keyed on it invalidates; `published_at` is
  -- set on first publish only, so a design revision does not rewrite history.
  version           = public.builder_templates.version + 1,
  updated_at        = EXCLUDED.updated_at;

UPDATE public.builder_templates
   SET published_at = COALESCE(published_at, now())
 WHERE gallery_tab = 'shell'
   AND status = 'published'
   AND published_at IS NULL;

COMMIT;
