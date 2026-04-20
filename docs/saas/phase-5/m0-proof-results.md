# M0 proof results — local harness run

Produced by `web/scripts/m0-proof-harness.mjs` against an embedded
Postgres 17 instance (no Docker, no hosted DB touched).

- Applied **155/161** migrations.
- Skipped (known-broken, non-foundational): 2
- Failed (non-foundational — unrelated to Phase 5 / M0): 4
- Required-for-proof migrations present: **all 10**

## Proof 1 — abstraction (hub + domains + surface set)

**hub-agency** — 1 row(s)
```json
{"id":"00000000-0000-0000-0000-000000000002","slug":"hub","kind":"hub","display_name":"Impronta Hub","status":"active","supported_locales":["en","es"]}
```

**hub-domains** — 2 row(s)
```json
{"hostname":"hub.local","kind":"hub","tenant_id":"00000000-0000-0000-0000-000000000002"}
{"hostname":"pitiriasisversicolor.com","kind":"hub","tenant_id":"00000000-0000-0000-0000-000000000002"}
```

**hub-surface-set** — 1 row(s)
```json
{"identity_public_name":"Impronta Hub","branding_theme_kind":"object","hub_homepage_count":1,"hub_sections_count":1,"hub_menus":["footer/en","header/en"]}
```

## Proof 2 — per-migration validation

**m1-hub-count** — 1 row(s)
```json
{"n":1}
```

**m1-null-kind** — 1 row(s)
```json
{"n":0}
```

**m1-hub-homepage** — 1 row(s)
```json
{"n":1}
```

**m2-orphaned-hub** — 1 row(s)
```json
{"n":0}
```

**m2-wrong-tenant** — 1 row(s)
```json
{"n":0}
```

**m3-role-check-def** — 1 row(s)
```json
{"def":"CHECK ((role = ANY (ARRAY['owner'::text, 'admin'::text, 'coordinator'::text, 'editor'::text, 'viewer'::text, 'hub_moderator'::text, 'platform_reviewer'::text])))"}
```

**m3-new-role-use** — 1 row(s)
```json
{"n":0}
```

**m4-phone-e164-column** — 1 row(s)
```json
{"is_nullable":"YES"}
```

**m4-phone-e164-index** — 1 row(s)
```json
{"indexdef":"CREATE UNIQUE INDEX talent_profiles_phone_e164_uk ON public.talent_profiles USING btree (phone_e164) WHERE ((phone_e164 IS NOT NULL) AND (deleted_at IS NULL))"}
```

**m4-collisions-empty** — 1 row(s)
```json
{"n":0}
```

**m4-partial-unique-sanity** — 1 row(s)
```json
{"n":0}
```

## Migration apply tail (last 15 applied)

- applied: `20260607100000_saas_p1b_tenant_id_autofill_triggers.sql`
- applied: `20260608100000_saas_p4_cms_unique_indexes_tenant_scoped.sql`
- applied: `20260608110000_saas_p4_cms_public_read_tenant_scoped.sql`
- applied: `20260620100000_saas_p5_m0_site_admin_foundations.sql`
- applied: `20260620110000_saas_p5_m1_identity_extensions.sql`
- applied: `20260620120000_saas_p5_m2_navigation.sql`
- applied: `20260620130000_saas_p5_m3_pages.sql`
- applied: `20260620140000_saas_p5_m4_sections.sql`
- applied: `20260620150000_saas_p5_m6_design_controls.sql`
- applied: `20260620160000_saas_p5_m0_fix_media_ref_cast.sql`
- applied: `20260620170000_saas_p5_m0_fix_homepage_slug_constraint.sql`
- applied: `20260625100000_saas_p56_m0_org_kind_and_hub_seed.sql`
- applied: `20260625110000_saas_p56_m0_agency_domains_hub_rebind.sql`
- applied: `20260625120000_saas_p56_m0_membership_role_check.sql`
- applied: `20260625130000_saas_p56_m0_talent_phone_e164.sql`

## Skipped migrations

- skipped: `20260409093000_locations_taxonomy_sync.sql` — known-broken on fresh DB, not required by Phase 5 / M0
- skipped: `20260409160000_field_group_duplicate_prevention.sql` — known-broken on fresh DB, not required by Phase 5 / M0

## Non-foundational failures

- failed: `20260409193000_field_groups_active_visible_name_uniqueness.sql` — could not create unique index "idx_field_groups_active_name_en_unique" (detail: Key (lower(btrim(name_en)))=(basic information) is duplicated.)
- failed: `20260413150100_field_definitions_gender_phone_ai_flags.sql` — relation "public.talent_embeddings" does not exist
- failed: `20260415103000_search_queries_ai_embeddings.sql` — extension "vector" is not available (detail: Could not open extension control file "/Users/oranpersonal/Desktop/impronta-app/web/node_modules/@embedded-postgres/darwin-arm64/native/share/postgresql/extension/vector.control": No such file or directory.) (hint: The extension must first be installed on the system where PostgreSQL is running.)
- failed: `20260416140000_match_talent_embeddings.sql` — relation "public.talent_embeddings" does not exist
