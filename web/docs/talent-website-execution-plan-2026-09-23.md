# Talent free website, theme gallery, "Web Office" upgrade: plan + agent execution + QA

Design brief for the mockup agent: [`talent-website-design-brief-2026-09-23.md`](talent-website-design-brief-2026-09-23.md).

## Context

Every talent already gets a discovery profile at `tulala.digital/t/<code>` and is auto-enrolled on the Tulala hub. A paid multi-page "Max site" engine exists (tables, page builder, five starter templates, custom domains, Stripe, 14-day trials), but only `talent_portfolio` talents can see or render it, it lives at `/t/site/<slug>`, it 404s when the plan lapses, its templates are hard-coded hex (not recolorable), and nothing in the dashboard pulls a talent toward it.

Goal: make that engine the **free** personal website at `<name>.tulala.digital`, chosen from an **extensible theme gallery** (Design, then Look), unlocked by completing the profile, edited in the real page builder with locked controls, so one paid tier ("Web Office") sells itself in context. The site degrades on lapse instead of dying. Talents can also see every place they appear, with links, from a header dropdown.

### Founder decisions (2026-09-22/23)
1. URL: `tulala.digital` = directory + `/t/<code>` profiles; `<name>.tulala.digital` = the talent's own site. Reverses decision L45 for personal sites only.
2. One paid tier: **Web Office** (`talent_portfolio`, $15/mo, 14-day trial, label-only rename). **Pro folds into Web Office**; existing Pro subscribers grandfathered.
3. Unlock gate is strict: all visible profile content plus at least one published service.
4. Free = a real site: pick and switch design, colors and fonts, edit text/images/logo, show/hide/reorder. Builder is the real one with visible locks.
5. The gallery is a foundation: new designs and looks get added over time with no rework.
6. Execution: agents implement, test, QA and **merge when all gates pass**; QA runs on a **hermetic local Supabase in CI**.

### Pre-launch amendments (2026-09-23, no customers and no traffic yet)
7. **Merge gate relaxed:** a phase merges on the structural CI gate + unit tests + Opus code review. Browser journeys are still written per phase but run as a batch once the test database exists; a phase is not re-opened for them, defects become follow-up fixes.
8. **Switch on as each phase lands:** the env switches stay in code as an escape hatch, but are set to `true` in Vercel production as each phase merges, so the founder sees each piece live instead of a big-bang launch. The Launch phase becomes a review checkpoint rather than a flip.
9. **QA needs no credentials and no founder step.** The earlier "founder provides a schema dump" fallback is withdrawn. Agents build the schema from the repo: `supabase/ci/local-postgres.sh` stands up a throwaway Postgres 16 with the Supabase scaffolding, `supabase/ci/apply-migrations.sh` replays all 859 migrations using documented per-migration shims and, where a migration cannot apply from scratch, a `supabase/ci/migration-substitutes/<version>.sql` reproducing production's end state. Fidelity is then proven by `supabase/ci/verify-schema.ts`, which diffs the built schema against `web/src/lib/supabase/database.types.ts` (generated from production: 296 tables plus function signatures) and fails on any missing or mismatched object. The seed, the app and the Playwright journeys all run locally against that database with the pre-installed Chromium. `supabase/ci/RUNBOOK.md` is the offline recipe.
   **The one exception is production itself:** applying a migration to the live database needs credentials only the founder holds. Either the three repo secrets (`SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`) let agents do it via `db-push.yml`, or the founder hands `web/docs/talent-website-db-push-agent-prompt.md` to an agent on their own machine once per migration PR (phases 0, 1, 2 and 4).
10. **Phases run in parallel** in separate worktrees where files allow (0, 2 and 5 concurrently), rebasing onto `main` as each merges.

### Verification of the "already finished" items (answer to the original ask)
- **Profile page on registration: done.** `ensurePlatformHubRoster` (`lib/saas/registration-policy.ts`) makes `/t/<code>` live immediately.
- **Join other free hubs: partial.** Only one hub exists (the platform hub). Joining an agency works through the tenant registration engine. The separate apply flow (L48, `/talent/discover-agencies`) is broken: approval never creates a roster row, the hub list is always empty, it is not linked from the sidebar, and dashboard copy says the opposite ("agencies invite talent"). Tracked as a follow-up, not in this plan.
- **Easy way to see where you are registered, with links: exists but buggy and buried.** `RepresentationDrawer` lists entries, but duplicates the hub, emits the old `/<slug>/t/<code>` URL form for every agency except Impronta, and links to pending/`roster_only` profiles that 404. Phase 5 fixes this and surfaces it in a header dropdown.

---

## What exists (verified in code)

- **Site engine:** `talent_sites` (`site_slug` unique, `shell_tree`, `shell_published`, `logo_url`, `site_published_at`), `talent_pages` (`blocks`, `is_home`, `theme.__design`, SEO columns), `talent_site_domains` (custom only; RPC `talent_site_domain_lookup`). RLS is owner-any-tier except domains. One render `renderTalentMaxSite` (`lib/talent-site/server/render-max-site.tsx`); one gate `maxSitePublicGate` (`lib/talent-site/resolve-max-site-core.ts:89`) = published AND `talent_portfolio`. App-layer Max gates: `provision-max-site.ts:109`, `site-action-gate.ts`, `builder-core/adapters/talent-site-shell-actions.ts` `gateOwner`, `app/(workspace)/talent/page-builder/page.tsx`, `TalentPageBuilderScreen.tsx`, `buildTalentPageBuilderConfig` (`lib/site-admin/builder-core/config.ts`).
- **Templates:** `lib/talent-site/max-site-templates/{types,registry,sections}.ts` (default, editorial, minimal, portfolio, bold) = shell tree + home tree from kit builders (`heroSplit`, `heroCentered`, `heroCover`, `aboutBlock`, `servicesBlock`, `galleryBlock`, `contactBlock`, `buildShell`), `{{token}}` content hydrated by `hydrateTalentTree` + `talentProfileTokens`. Hex literals inline; only two `token:` refs; nothing records the applied key.
- **Theme substrate:** token registry `lib/site-admin/tokens/registry.ts` (validators per token); presets `presets/theme-presets.ts`; per-page talent theme `talent_pages.theme.__design` (`edit-mode/talent-design-store.ts`, `talent-design-actions.ts`); platform default `lib/platform/default-theme.ts`; fonts `builder-node/fonts-registry.ts` + Google catalogue + `GoogleFontsLink`; contrast `tokens/contrast-pair.ts`; palette-from-hex `builder-core/site-templates/theme-from-palette.ts`. No site-level theme.
- **Picker/preview:** `components/edit-chrome/template-picker-panel.tsx` (flat grid), `app/template-preview/[key]/page.tsx` (owner or demo hydration). No thumbnail pipeline.
- **Routing:** `lib/saas/host-context.ts` (`agency_domains` first, then talent RPC → `kind: "talent_site"`), proxy rewrite to `/_talent-site`, allow-list `lib/saas/talent-site-host-routing.ts`. `<slug>.tulala.digital` is today the workspace namespace. Bug: shell nav hrefs `/t/site/<slug>/<page>` 404 on talent hosts.
- **Tiers/billing:** `lib/access/talent-membership.ts`, `lib/access/plan-catalog.ts`, `lib/server/talent-self-guard.ts`, `TALENT_TIER_META` / `TALENT_TIER_CATALOG` (`internal/state/fixtures.ts:~2220`), `startTalentUpgrade`, `plan-change.ts`.
- **Shell:** header `internal/page-modules/IdentityBar-1.tsx` (talent branch ~305–413), account menu `AccountMenuTrigger` (~435–703; shows "Workspace settings" to talents; avatar photo hard-coded undefined), chip+popover pattern `WorkspacePlanBadge.tsx`, site state `useTalentSiteDashboardInitialLoad()`, completion `buildTalentChecklist` → `bridgeTalentCompletion`, bio AI `bio-helper-card.tsx`, representation `lib/talent/load-representation.ts` + `talent-drawers/representation.tsx`, URL helper `lib/talent/agency-roster-profile-url.ts`.
- **QA infrastructure:** Playwright configured (`web/playwright.config.ts`, `web/e2e/*`); `builder-e2e.yml` and `admin-boot.yml` are dispatch-only and depend on `E2E_*` secrets (possibly unset). CI gate `ci.yml` runs on every PR (tsc/lint baselines, structural guards, many test lanes). This environment has **no** Supabase, Vercel or Stripe credentials.
- **Repo mechanics:** migrations are future-stamped (newest `20261231277000`): each phase takes the next number after the newest on `main` at phase start. Talent-site tests are listed by file in the `test:builder` lane. Gate: `npm run typecheck && npm run lint` (queue-routed; never bare `tsc`/`eslint`). en + es copy, no em dashes, file size ratchet.

---

## Product

**Loop:** completing the profile fills the site; the site is the reward; the builder shows what Web Office adds while the talent is proud of what they have.

**Free "Website"** (`talent_basic`): home page auto-built from the profile (hero, about, services, gallery, reviews, inquiry CTA, small "Made with Tulala" badge). Free forever: pick and later switch design (confirm: "replaces your edits"), colors and fonts anytime, edit text, swap images from own media, logo, show/hide + reorder sections, republish. Every later profile edit keeps flowing into the site.

**Web Office** (`talent_portfolio`, $15/mo, 14-day trial): add pages, add sections/blocks, custom domain, SEO, analytics, custom CSS/motion, badge removal, plus former Pro perks (embeds, press band, media kit, priority discovery, animated cover), branded invoices, lowest fee, design help from the Tulala team. Sold from builder lock chips, a builder rail card, and the header badge.

**Lapse:** never 404. Home stays live on the subdomain; extra pages hidden, custom domain paused, SEO ignored, badge back; re-upgrade restores instantly (rows never mutated).

**Header badge (top-right), prospective URL always shown underneath:**

| Stage | Rule | Chip | Click |
|---|---|---|---|
| locked | not ready | "Unlock your free website: 4 of 8" + progress, `sofia-mendez.tulala.digital` muted | popover: missing items as links, "Write my bio with AI", guided setup |
| unlocked | ready, no published site | "Your free website is unlocked" (accent, gentle pulse) | Create dialog |
| live | site published | `sofia-mendez.tulala.digital` | View, Edit, Change look, Copy link, Web Office row |
| web_office | plan = `talent_portfolio` | "Web Office" (+ trial days left) | same, no upsell |

**Unlock gate (`TALENT_SITE_READINESS`):** checklist keys `display_name, media, location, taxonomy, short_bio, phone` complete, 3+ photos, 1+ published offering (8 items in the counter).

**Instrumentation** (feeds the future usage-based tier): `site_badge_opened`, `site_unlocked`, `site_created`, `site_published`, `design_applied`, `look_applied`, `lock_hit{feature}`, `upgrade_dialog_opened{source}`, `trial_started`, `site_scope_reduced`, via the existing analytics tracker used by `trackWorkspaceActivated`.

---

## Theme gallery model (foundation)

**Two picks: Design, then Look.** Designs reference tokens only, so any Design works with any Look; each new Look multiplies combinations.

| Layer | Holds | Payload | Publish-time validation |
|---|---|---|---|
| **Design** | shell variant + ordered home composition from the talent section kit | `{ shellTree, homeTree }`, `{{token}}` content + `token:` style refs only; every section has `slotKey` + `originRole` | `validateBuilderNodeTree`; no literal colors/fonts; kit sections only; hero + contact present; no raw html; passes the free tree guard |
| **Look** | colors + fonts (radius/shadow later) | token map + `previewSwatch` | keys in `TOKEN_REGISTRY`, validators pass; contrast ink/bg >= 4.5:1, primary/bg >= 3:1; families in font registry or Google catalogue |

`kind` column lets Look split into `palette` + `typography` (+ `finish`) later with no migration.

- **Catalog table** `talent_theme_catalog`: `id, kind ('design'|'look'), slug, title, summary, category, tags text[], audience_category_groups text[], payload jsonb, preview jsonb, required_talent_tier, status ('draft'|'published'|'archived'), source ('builtin'|'authored'), version, schema_version, sort_order, is_new_until, created_by, updated_by, timestamps`; unique `(kind, slug)`; RLS: published rows readable by anon/authenticated, writes service role. Built-ins in code (`lib/talent-site/theme-catalog/builtins/{designs,looks}/*`), synced by `syncBuiltinTalentThemes()` (pattern `syncBuiltinLooks`).
- **Site-level theme** (on `talent_sites`): `theme_design_slug`, `theme_design_version`, `theme_look_slug`, `design_tokens`, `design_tokens_draft`, `theme_version`, `site_created_via`, `site_created_at`. Render order: registry defaults → platform default → site tokens → page `__design` (Web Office per-page override).
- **Apply core** `lib/talent-site/server/theme-apply-core.ts`: `applyDesign` (hydrate + write trees, pin slug + version), `applyLook` (merge into draft tokens, content untouched), `publishSiteTheme` (draft → published, bump version, bust cache). The five Max templates become built-in designs (hex → `token:` refs); `applyMaxSiteTemplateAction` becomes a wrapper.
- **Builder compatibility:** designs are kit sections bound to profile + theme tokens; Free edits are prop patches, hide toggles and reorders; a Look is a CSS-variable token write. Validator for authored designs, static test for built-ins.
- **Gallery UI** `components/talent/site/theme-gallery/`: Designs grid (category chips, "New" badge, enforced tier pill, live preview iframes of `template-preview?kind=talent-theme&design=&look=` hydrated with the talent's data, static fallback) → Look row (swatches + font pairs, instant CSS-variable swap in the same preview, "Let Tulala pick" = headshot colors → `candidatePalettesFromHexes` → nearest catalog look). Reused in wizard, builder rail, badge popover. `UnifiedTemplateDef` gains `category`, `tags`, `isNew`, `kind`; filter bar in `template-picker-panel.tsx`.
- **Adding a theme:** add `builtins/designs/<slug>.ts` or `builtins/looks/<slug>.ts`, export, run `test:builder` (validators run on every built-in), deploy syncs, set `is_new_until`. No-deploy admin authoring is a follow-up.

---

## Phases (sequential PRs, dark-launched)

All new behavior sits behind switches that default **off in production** and **on in CI/dev**: `TALENT_THEME_GALLERY_ENABLED`, `TALENT_FREE_WEBSITE_ENABLED`, `TALENT_SITE_SUBDOMAINS_ENABLED`. Merges are therefore invisible to users until launch.

| # | Ships | Migration |
|---|---|---|
| Q | Agent QA infrastructure: hermetic e2e workflow, seed fixtures, db-push workflow | none |
| 0 | Theme gallery foundation (Max talents only) | catalog + site theme columns |
| 1 | Free sites render with read-time scoping; locked builder; Pro fold; Web Office rename | custom-domain RPC requires Max |
| 2 | `<slug>.tulala.digital` routing + shared slug namespace + nav href fix | subdomain RPCs + namespace triggers |
| 3 | Readiness gate, header badge, create wizard | none |
| 4 | Web Office dialog + trial, lapse reconciliation, look/design switching from rail + badge | scope columns |
| 5 | "Where I appear" profile dropdown + representation URL fixes | none |
| L | Launch: switches on in production | none |

Follow-ups outside this plan: Builder Lab "Talent themes" authoring tab (draft/publish, revisions, rollout, portable JSON), apply-to-hub flow completion, Today tile, talent-host sitemap, usage-based second tier.

### Phase Q: agent QA infrastructure
- **Q.1 Feasibility spike (Opus):** in CI, `supabase start` + apply all `supabase/migrations/*.sql` from scratch. Fix or document blockers (extensions, storage buckets, cron, `_pending_stripe` folder, ordering). Time-box one working session; if the chain cannot apply cleanly, fall back to a schema snapshot generated once by the founder (`supabase db dump --schema-only` into `supabase/e2e-baseline.sql`), which is the only extra human step.
- **Q.2 Workflow (Sonnet):** `.github/workflows/talent-website-e2e.yml`, triggers `pull_request` (paths: talent-site, theme-catalog, site-admin builder-core, host-context, proxy, talent shell) + `workflow_dispatch`; steps: supabase start → migrations → `web/e2e/talent-website/seed.ts` → `next build && next start` with the three switches on and local Supabase keys → Playwright chromium, desktop 1440 + mobile 390, en + es → upload screenshots/traces as artifacts → write `qa-evidence/talent-website/<phase>/run-<sha>.json`.
- **Q.3 Seed fixtures (Sonnet):** service-role script creating: `t_incomplete` (basic, 3 of 8 ready), `t_ready` (basic, all ready, one published offering, no site), `t_free_site` (basic, published site with 1 extra page row + an active custom domain row), `t_max` (portfolio, published multi-page site + custom domain), `t_pro_legacy` (talent_pro), `t_multi_roster` (hub + 3 agencies with mixed visibility, one pending), agency `acme` (slug `acme`, subdomain row) for collision tests; hosts seeded in `agency_domains` for `localhost` / `*.lvh.me`.
- **Q.4 Prod migrations workflow (Sonnet):** `.github/workflows/db-push.yml` (`workflow_dispatch`, runs `supabase db push` against the linked production project, prints the applied list). Requires the one-time repo secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`. Until they exist, the orchestrator asks the founder to run `cd web && npm run db:push` for migration PRs (the only recurring human step).
- **Acceptance:** a PR touching `lib/talent-site` triggers the workflow; a trivial smoke journey (existing Max site renders on localhost) passes; artifacts downloadable; `db-push.yml` dry-run lists pending migrations.

### Phase 0: theme gallery foundation
- **0.A Model + migration + apply core + render (Opus):** migration `talent_theme_catalog` + `talent_sites` theme columns; `theme-catalog/{types,validate,section-kit}.ts`; `server/theme-apply-core.ts` + `theme-actions.ts` (`personalSiteEdit` for design, `personalSiteDesignPresets` for look; until Phase 1 lands, both resolve to the current Max gate); site-token resolution in `render-max-site.tsx`; convert the five templates to kit + `token:` refs.
- **0.B Built-ins + sync + loader (Sonnet):** five designs from the converted builders, six looks seeded from `theme-presets.ts`, `sync-builtins.server.ts` wired into the deploy hook used by `syncBuiltinLooks`, `load-catalog.server.ts` (published, tier-filtered, cache tag `talent-theme-catalog`).
- **0.C Gallery UI + preview (Sonnet):** `theme-gallery/{ThemeGallery,DesignCard,LookRow,useThemePreview}.tsx`, `template-preview` `kind=talent-theme` + `postMessage` token swap, picker filter bar, mount in `TalentMaxSiteManager.tsx` behind `TALENT_THEME_GALLERY_ENABLED` (old `TemplateGallery` otherwise).
- **Unit/static tests:** every built-in validates; hex literal, non-kit section, missing hero, low-contrast look each rejected; look apply leaves content untouched and fonts untouched by a color-only look; version pinning; section-kit output has no literal colors/fonts; sync idempotent. Appended to `test:builder`.
- **E2E journeys:** J0 flags-off parity (`t_max` site DOM/screenshot unchanged vs `main`); J1 gallery (`t_max`: filter, live preview swap, apply design + look, publish, public site restyled, second look keeps content).

### Phase 1: free renders, locked builder, Pro fold, rename
- **1.A Capabilities + gates + scoping (Opus):** `talent-membership.ts` keys (`personalSiteDesignPresets` all tiers; `personalSiteSections`, `personalSitePages`, `personalSiteSeo`, `personalSiteAnalytics` Web Office; `personalSiteCustomBuilder` aliases `personalSiteSections`), `buildTalentSiteCapabilities`; guards in `talent-self-guard.ts`; `site-action-gate.ts` `gate(capability?)`; `free-site-tree-guard.ts` at page + shell draft-save chokepoints; SEO strip on save and ignore at render; `maxSitePublicGate` → published AND `personalSitePublish`; `scopeMaxSitePagesToPlan`; migration: `talent_site_domain_lookup` requires `talent_profile_has_max`; footer badge via `talentPlanRemovesPlatformBadge`.
- **1.B Builder locks (Opus design, Sonnet UI):** `page-builder/page.tsx` site-exists + `canEdit`; `buildTalentPageBuilderConfig` capability mapping + `structuralEdits` + `lockedUpsell`; edit-chrome chokepoint (`assertAdvancedLibraryAllowsOperation`) consults `structuralEdits` and calls `onLockedOperation`; lock chips on Gallery Add, SEO tab, page switcher, manager, domain panel; static test keeps `canInsertRawHtmlElements: false`.
- **1.C Pro fold + rename sweep (Sonnet):** `talent_pro` → `isVisible: false`, `isSelfServe: false` (key/prices kept); `talent_portfolio` capabilities ⊇ `talent_pro`; `TALENT_TIER_CATALOG` collapses pro into max; compare drawer + `TalentPlanCard` two columns; `TIER_PLAN_KEY` drops pro; label rename in `TALENT_TIER_META`, `plan-catalog.ts`, `DISPLAY_NAME`, guard messages, `en.json`/`es.json`, `dashboard-i18n.ts`, `talent-site-i18n.ts`, and components (`premium-pages.tsx`, `TalentSubscriptionShell.tsx`, `TalentSiteLockedCard.tsx`, `TalentMaxSiteManager.tsx`, `TalentSiteDomainPanel.tsx`, `TalentSiteAppearancesPanel.tsx`, `TalentPageBuilderScreen.tsx`); never plan keys, tier values, Stripe ids, file names; update `docs/decision-log.md` (L45 reversal, Pro fold) and `docs/talent-monetization.md`.
- **Unit/static tests:** capability matrix incl. grandfathered `talent_pro`; gate + scoping per plan and switch off; tree guard allow/deny table; SEO strip; i18n parity; grep test that no user-facing "Portfolio"/"Pro" tier label remains.
- **E2E journeys:** J2 locked builder (`t_free_site`: edit text, hide, reorder, change look, publish succeed; insert shows lock and opens upgrade; forged insert via server action rejected; SEO fields stripped); J3 read-time scoping (`t_free_site`: `/about` 404, nav home-only, custom-domain host 404; `t_max` unaffected); J7 compare drawer shows Free vs Web Office only; `t_pro_legacy` keeps embeds/press.

### Phase 2: subdomain routing + slug namespace (Opus, tests by Sonnet)
- Migration: `platform_subdomain_label_taken(...)` (agencies.slug, subdomain `agency_domains` labels, unexpired reservations, `talent_sites.site_slug`, reserved slugs), `talent_site_subdomain_lookup(p_slug)` (grant anon; documented beside the existing public RPC in the lock-migration list), DNS-label check on `site_slug` (`NOT VALID` until `web/scripts/audit-talent-site-slug-collisions.ts` is clean), BEFORE triggers on `talent_sites.site_slug`, subdomain `agency_domains`, `agencies.slug`.
- `lib/talent-site/site-public-url.ts` (roots `tulala.digital`, `lvh.me`); `host-context.ts` `resolveTalentSubdomainContext` after the custom-domain miss; `hrefMode: "path" | "host-root"` (fixes the nav bug); `/t/site/*` 308 to subdomain in production; `derive-site-slug.ts` `isDnsLabel` + `isTaken`; slug setter, provisioning and workspace slug checks consult the RPC; `siteUrl()`/dashboard state emit the subdomain.
- **Security review (Opus):** cookie scope `.tulala.digital`; `talent_site` proxy branch returns before any session refresh; `_talent-site` never calls `getCachedActorSession` except `?preview=draft` (static test); href/form neutralizers unchanged.
- **E2E journeys:** J4 (`Host: <slug>.lvh.me:3000` renders `t_max` and `t_free_site`; inner nav works on subdomain and custom domain; creating workspace `acme`-colliding slug refused; setting a talent slug to `acme` refused; direct SQL insert refused by trigger).
- Pre-merge check: `*.tulala.digital` attached to the Vercel project (Vercel connector read).

### Phase 3: readiness gate, header badge, create wizard
- **3.A Readiness + wizard server (Opus):** `site-unlock-stage.ts` (`TALENT_SITE_READINESS`, `resolveSiteReadiness`, `resolveSiteUnlockStage`), `server/site-readiness-loader.ts`, `TalentSiteDashboardState` additions, `site-wizard-actions.ts` (`checkTalentSiteSlugAvailabilityAction`, `createTalentSiteFromWizardAction({ slug, designSlug, lookSlug })` = gate → ready unless Web Office → provision(preferredSlug) → applyDesign + applyLook → publish; `decideWizardRun` idempotency), instrumentation events.
- **3.B Badge + dialog UI (Sonnet):** `TalentSiteBadge.tsx` (new file, pattern `WorkspacePlanBadge.tsx`, prospective URL underneath, collapses into account menu under 720px), `CreateTalentSiteDialog.tsx` (Address → Design → Look → Create, loading/error/retry, success with View/Edit/Copy), mount beside `StartFreeWorkspaceDialog`, locked popover with `BioHelperCard` entry, en + es.
- **E2E journeys:** J5 (`t_incomplete`: badge locked with 3 of 8, links open the right sections, direct wizard call refused `not_ready`; `t_ready`: badge unlocked → wizard → site live at `<slug>.lvh.me` with chosen design + look → badge live; rerun returns `alreadyLive`; taken slug shows "taken"); axe checks on badge popover and dialog; 390px screenshots.

### Phase 4: Web Office dialog, lapse, switching
- **4.A Lapse reconciliation (Opus):** migration `scope_reduced_at`, `scope_reduced_from`; `onTalentPlanChanged` sets/clears them, never mutates page/domain rows, enqueues the notification; verify `api/cron/reconcile-plan-overrides` calls it; pure `planChangeScopeDecision` + tests.
- **4.B Upgrade + rail UI (Sonnet):** `WebOfficeUpgradeDialog.tsx` (benefit list, 14-day trial, `startTalentUpgrade("talent_portfolio", …, { returnPath: "/talent/page-builder" })`), wired to lock chips, rail card, badge; builder rail "Look" panel and "Design" panel (confirm-before-replace); manager "Hidden until Web Office" / "Paused"; badge "Restore Web Office".
- **E2E journeys:** J6 (Stripe cannot run hermetically: plan changes simulated with the admin override action; lock → dialog shows trial + correct checkout params (asserted on the request, not completed); simulate expiry on `t_max`: home live, `/about` 404, custom domain 404, notification row, paused states; restore: everything back without republish; `t_free_site` changes look from the rail and the public site restyles).

### Phase 5: "Where I appear" dropdown (Sonnet, Opus review)
- Fix `agencyRosterProfileUrl` to read `agency_domains` (custom → subdomain → `/w/<slug>/t/<code>`), dedupe the hub row in `loadRepresentation`, and never link pending or `roster_only` entries (show status instead).
- Account menu talent branch (`IdentityBar-1.tsx` via a new `TalentAccountMenuSection.tsx`): headshot avatar, "My website" (URL + badge stage), "My Tulala profile", "Where I appear" rows (name, kind, visibility dot, View link, Manage → `RepresentationDrawer`); hide "Workspace settings" for talents.
- **E2E journey:** J8 (`t_multi_roster`: rows match seeded memberships, links resolve 200, pending/roster_only show status without link).

### Launch (L)
Orchestrator posts a launch report (all journeys green, screenshots, flags-off parity, open risks) and asks the founder one question. On yes: set the three switches to `true` in Vercel production via the Vercel connector, redeploy through the normal pipeline, run production checks (existing Max site 200, a test talent subdomain 200, badge renders), and watch errors for 24 hours via runtime logs.

---

## Theme intake: approved mockup to live gallery theme (recurring)

Founder decision (2026-09-23): the founder works with a design agent on Web Office mockups. Each approved design becomes a gallery theme, then the next vertical, **private chef**, starts.

**Targeting.** The catalog gets `audience_category_groups text[]` (taxonomy `category_group` slugs such as `private-chefs`; empty = everyone). The gallery loader ranks matching themes first for a talent whose primary talent type belongs to that group ("Recommended for chefs"), and still shows the rest. The column is added to the Phase 0 migration before it merges.

**Runbook per approved design** (trigger: founder says "design `<slug>` approved"; input: `web/docs/talent-website-mockups/<slug>/` + `HANDOFF.md`, per the design brief):
1. **Map (Opus):** map each mockup section to a kit section. List gaps (new sections, new props, new tokens), map the colors and fonts to Look tokens, and check contrast. Output a short intake spec in the mockup folder.
2. **Kit extension (Opus, only when there are gaps):** new kit sections bound to profile tokens (extend `talentProfileTokens` for any new profile fields), and add them to the validator allow-list. Free-builder compatible by construction.
3. **Build (Sonnet):** `builtins/designs/<slug>.ts` + `builtins/looks/<slug>-*.ts`, with `audience_category_groups`, `is_new_until` = two weeks out, and `required_talent_tier` (`talent_basic` if it should be in the free gallery, else `talent_portfolio`).
4. **Visual QA (Sonnet runs, Opus judges):** hermetic e2e renders the theme with a fixture talent of the target category at 1440 and 390. The screenshots are compared side by side with the mockup frames and the differences listed, then fixed until the Opus judge signs off. The comparison sheet goes back to the founder and design agent.
5. **Ship:** PR through the normal merge gate; the deploy sync publishes it to the gallery.

**Going live before the full launch.** Phase 0 exposes the gallery to Web Office talents only. After Phase 0 merges, the first approved design can go live by switching `TALENT_THEME_GALLERY_ENABLED` on in production, which affects only Web Office talents' Public page, ahead of the free-website launch. The founder confirms that switch.

### Vertical 2: private chef
- **Data already exists:** taxonomy `chefs-culinary` / `private-chefs` (villa-chef, yacht-chef, family-chef, ...), industry pack `chef` (`chef.cuisine`, `chef.group_size`, `chef.dietary`, `chef.event_types`, `chef.travel`, `chef.private_chef_day_rate`).
- **Kit additions (Opus design, Sonnet build):**
  - cuisine and dietary chip row
  - experiences as services (reuses offerings)
  - sample menus / signature dishes (from offerings with menu details or a gallery subset)
  - area served
  - inquiry CTA carrying date and guest count
- **Token projection:** `talentProfileTokens` gains the chef fields when present (empty for other talents, so existing designs are unaffected).
- **QA:** fixture `t_chef` (talent_basic, `villa-chef`, chef fields filled, three experiences, eight food photos), a chef demo persona for anonymous previews, and journey J9: the chef sees chef themes first, applies one, and the site renders the chef sections.
- **Readiness:** the unlock gate is unchanged. Chef-specific fields are recommended, not required.

## Agent execution model

**Roles and models**

| Role | Model | Why |
|---|---|---|
| Orchestrator (this session) | Opus | sequencing, integration, merge decisions, founder communication |
| Architect/implementer for data model, gates, routing, migrations, lapse (0.A, 1.A, 1.B design, 2, 3.A, 4.A) | Opus | security- and correctness-critical; small blast radius mistakes are expensive |
| Implementer for UI, built-ins, sweeps, workflows, seeds (Q.2–Q.4, 0.B, 0.C, 1.B UI, 1.C, 3.B, 4.B, 5) | Sonnet | well-specified, pattern-following, high volume |
| Test author (unit + Playwright), writes from the acceptance list before seeing the diff | Sonnet | independent from the implementer |
| QA runner (triggers workflow, reads artifacts, files defects) | Sonnet | mechanical, repeatable |
| Reviewer: `/code-review high` every PR, `/security-review` on 1, 2 | Opus | adversarial depth |
| Visual/acceptance sign-off (screenshots vs mockups + acceptance list) | Opus | judgment |
| Root-cause escalation when a fix loop fails twice | Opus | debugging depth |

**Per-phase loop** (run as one Workflow per phase, under 10 agents, sub-agents in isolated worktrees; only the orchestrator pushes, to `claude/talent-workspace-pricing-qg52xw`, reset onto `main` after each merge):
1. Orchestrator re-reads the phase section, picks the next migration number, fans out implementers per workstream (parallel where files do not overlap).
2. Test author writes unit tests + Playwright journeys from the acceptance list, in parallel with implementation.
3. Implementers run local gates: `npm run typecheck`, `npm run lint`, affected test lanes (`test:builder`, `test:access`, `test:size-ratchet`, `test:phase1-i18n`), and fix until clean.
4. Orchestrator integrates, runs the same gates on the merged tree, opens the PR (repo PR template), subscribes to PR activity.
5. CI: `ci.yml` structural gate + `talent-website-e2e.yml` hermetic journeys (all journeys to date, as regression).
6. Opus reviewer runs `/code-review high` (+ `/security-review` for 1 and 2); findings go back to the owning implementer.
7. QA runner reads e2e artifacts; failures filed as defects with trace links; implementer fixes; after two failed rounds on the same defect, Opus root-causes.
8. Opus sign-off writes `qa-evidence/talent-website/<phase>/REPORT.md` (journeys, screenshots desktop/mobile/en/es, flags-off parity, review findings resolved).
9. Migration phases: `db-push.yml` (or founder runs `npm run db:push` when secrets are absent), then confirm with the drift check.
10. Merge when all green; watch main CI and the production pointer; if main goes red, fix forward or revert immediately (CLAUDE.md), then continue.

**Merge gate (amended 2026-09-23, pre-launch):** CI structural gate green; unit and static tests green; code review with no unresolved findings; security review clean (1, 2); migration applied to production. Browser journeys are written per phase and run as a batch once the test database exists. After merge, the phase's switch is set to `true` in Vercel production.

**Founder touchpoints (only these):** one-time repo secrets for `db-push.yml` (or run `npm run db:push` per migration PR: phases 0, 1, 2, 4); schema snapshot only if Q.1 fails; launch yes/no; renaming the Stripe product display name to "Web Office" in the Stripe dashboard; design review of mockups with the design agent.

---

## Brief for the design/mockup agent

Saved as [`talent-website-design-brief-2026-09-23.md`](talent-website-design-brief-2026-09-23.md). Summary:

> **Context.** Engineering is building the talent free-website flow. Several decisions changed since the current mockups; please update them so they can serve as the visual acceptance reference for QA (agents compare implementation screenshots against your frames).
>
> **Decisions that change the mockups (the gaps to fix):**
> 1. Framing is "Unlock your free website", not "Upgrade to a custom page". Paid is introduced later, inside the builder.
> 2. Theme choice is an **extensible gallery**, not three fixed starters: step "Design" (grid with category chips, "New" badge, live preview cards rendered with the talent's own photo, name and services) then step "Look" (color swatches + font pairings restyling the same preview instantly, plus "Let Tulala pick"). Design for 5 cards today and 40+ later (scroll, filtering, empty filter state).
> 3. One paid tier named **Web Office** ($15/mo, 14-day free trial). "Pro", "Portfolio" and "Max" disappear from every screen. The compare view has two columns: Free and Web Office.
> 4. The prospective URL `sofia-mendez.tulala.digital` is shown under the header badge in every stage.
> 5. The editor is the **real page builder** with lock chips, not a simplified editor.
> 6. Lapsed Web Office sites stay live: design the paused states.
>
> **Screens and states to deliver (desktop 1440 + mobile 390, English and Spanish copy length check, no em dashes):**
> - Header badge: locked (progress 4 of 8), unlocked (accent, gentle pulse), live (URL), Web Office (trial days left); mobile placement inside the account menu.
> - Locked popover: 8-item checklist with done/missing states, each item a link; "Write my bio with AI" entry; guided setup link; one line on why ("Your website builds itself from your profile").
> - Create dialog: Address (checking / available / taken / invalid), Design gallery, Look row + "Let Tulala pick", Creating progress, Success (URL, View, Edit, Copy), Error with retry.
> - Builder for Free: lock chips on Add section, Add page, SEO tab, Custom domain, Custom CSS/motion; right rail with "Look" panel, "Design" panel (confirm "replaces your edits"), Web Office card.
> - Web Office upgrade dialog: benefits list (pages, sections, custom domain, SEO, analytics, embeds and press, media kit, priority discovery, lowest fee, design help from the Tulala team), $15/mo, "Start 14-day free trial".
> - Compare drawer: Free vs Web Office.
> - Public site footer "Made with Tulala" badge (Free).
> - Lapse: manager rows "Hidden until Web Office", domain "Paused", badge "Restore Web Office", notification copy.
> - Account menu "Where I appear": avatar with headshot, My website, My Tulala profile, rows per agency/hub with visibility dot (Live / Agency is not showing you / Pending), View and Manage.
>
> **Output:** PNG frames named `<screen>--<state>--<viewport>.png` in `web/docs/talent-website-mockups/` (or a shared link), plus a short list of any copy changes. Reuse the dashboard design tokens (`COLORS`, `FONTS` in the admin shell) so frames match the implementation.

---

## Risks
- Hermetic migration chain may not apply from scratch (mitigation: Q.1 spike, schema-snapshot fallback).
- Cookie scope on `*.tulala.digital` (mitigations in Phase 2 security review).
- Host cache 60s per worker: renames and lapses propagate within a minute (documented in UI copy).
- Stripe is not exercised end to end in QA (checkout params asserted; webhook path covered by existing tests; first real trial verified at launch).
- Agent-merged PRs deploy to production: mitigated by dark switches, flags-off parity journey, and fix-forward/revert rule.

## Critical files
- `web/src/lib/talent-site/theme-catalog/*`, `web/src/lib/talent-site/server/theme-apply-core.ts` (new)
- `web/src/lib/talent-site/max-site-templates/{registry,sections}.ts`
- `web/src/lib/talent-site/resolve-max-site-core.ts`, `web/src/lib/talent-site/server/render-max-site.tsx`
- `web/src/lib/access/talent-membership.ts`, `web/src/lib/access/plan-catalog.ts`
- `web/src/lib/site-admin/builder-core/config.ts`
- `web/src/lib/saas/host-context.ts`
- `web/src/components/admin/shell/internal/page-modules/IdentityBar-1.tsx`
- `web/src/lib/talent/agency-roster-profile-url.ts`, `web/src/lib/talent/load-representation.ts`
- `.github/workflows/talent-website-e2e.yml`, `.github/workflows/db-push.yml`, `web/e2e/talent-website/*` (new)

## Known blocker: two orphan rows in the remote migration ledger (found 2026-09-23)

A read-only check of production (`pluhdapdnuiulvxmyspd`, ACTIVE_HEALTHY) found 861 recorded versions against 859 local files. All 859 local files are applied, so nothing is pending. The two extras are:

| Remote version | Matching file in the repo |
|---|---|
| `20260911232448 channel_connections_outbox` | `20261231231006_channel_connections_outbox.sql` |
| `20260918215445 auto_ack_no_emdash` | `20261231277000_auto_ack_no_emdash.sql` |

Neither version ever existed as a file: `git log --all --diff-filter=A` finds nothing under those names. They were applied straight to the database (an `apply_migration` call stamps its own timestamp) while the repo kept the future-dated names the convention requires.

**Why it blocks us.** `npm run db:push` refuses with `LegacyDbPushMissingLocalError` when the remote knows a version the tree does not (`web/docs/migrations-and-remote-history.md`). Rebasing, the documented fix, cannot help here because no such file exists to rebase onto. Phases 0, 1, 2 and 4 all carry migrations and would each hit this.

**The fix** is the ledger realignment the same doc prescribes, using the supported CLI path rather than a raw delete, and only after confirming the renamed files are recorded:

```
supabase migration repair --status reverted 20260911232448 20260918215445
supabase migration list        # expect local and remote to agree
```

This removes two stale ledger rows. It applies no SQL and changes no schema or data. It needs production credentials, so it is done either by the `db-push.yml` workflow once the repo secrets exist, or by an agent on the founder's machine.

**Prevention:** never apply a migration with `apply_migration` or by hand. Applying through `npm run db:push` records the version under the file's own name, which is what keeps the ledger and the repo in step.
