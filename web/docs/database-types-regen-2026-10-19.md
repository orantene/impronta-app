# database.types.ts regeneration (2026-10-19)

Regenerated `web/src/lib/supabase/database.types.ts` with the Supabase MCP
`generate_typescript_types` (production project `pluhdapdnuiulvxmyspd`, read-only; no data read).
No local docker/supabase CLI was available. Typecheck was NOT run locally (CI `full-ci` is the gate).

Production `supabase_migrations.schema_migrations` (986 rows) is a subset of the repo files on
`origin/main` plus four versions that live in open PRs: 20261231414500 (#4018), 20261231414600 (#4019),
20261231415100 (#4022), 20261231415300 (#4024). So production schema equals repo migrations plus those PRs.

Result: about 220 new tables/functions/views (the committed file was stale) plus these deliberate edits:

- The MCP only emits the `public` schema, so the `graphql_public` block (header and `Constants`) was
  carried over from the previous file unchanged.
- `tenant_promo_codes.Insert.offer_kind` stays optional. The database fills it from `kind` through the
  `tenant_promo_codes_default_offer_kind` trigger (20261231381500), and `admin/discounts/actions.ts` inserts
  without it. The generator marks it required because the column is NOT NULL.

Column types that became nullable (they follow migration 20261231299900, account deletion, and friends).
If CI reports errors, they are most likely here: `client_balance_ledger.user_id`,
`inquiry_action_log.actor_user_id` (+ new `actor_kind`), `inquiry_attachments.uploaded_by`,
`inquiry_coordinators.user_id` (+ surrogate `id`), `talent_representation_requests.requested_by`,
`profiles.app_role`, `cms_posts.tenant_id`, `cms_redirects.tenant_id`,
`resend_inbound_emails.provider_payload` (`Json`, was `Record<string, unknown>`).
