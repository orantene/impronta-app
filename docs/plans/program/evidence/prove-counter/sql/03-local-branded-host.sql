-- One non-primary host row, so the journey can be driven end to end against a
-- LOCAL build of this branch in the same host SHAPE the deployed QA host uses.
--
-- WHY IT WAS NEEDED. `orders.receipt_code` resolves at `/r/<code>`, which is a
-- TENANT surface: on the shared app host (`localhost`, `agency_domains.kind =
-- 'app'`, tenant_id NULL) it correctly 404s, so the receipt half of the
-- journey cannot be proven there. `qa-journeys.localhost` resolves to 127.0.0.1
-- without touching /etc/hosts, and with this row the middleware resolves it to
-- the fixture workspace exactly as `staging-qa-journeys.tulala.digital` is
-- resolved.
--
-- is_primary = FALSE on purpose: a tenant may hold only one primary host, and
-- the deployed staging host must keep it.
INSERT INTO agency_domains (id, tenant_id, hostname, kind, is_primary, status, verified_at, tenant_slug)
VALUES ('33330005-0000-4000-8000-0000000000c1'::UUID,
        '33333333-3333-4333-8333-333333333333'::UUID,
        'qa-journeys.localhost', 'subdomain', FALSE, 'active', now(), 'qa-journeys')
ON CONFLICT (hostname) DO UPDATE
   SET tenant_id = EXCLUDED.tenant_id, status = 'active', tenant_slug = EXCLUDED.tenant_slug
RETURNING hostname, tenant_slug, is_primary, status;
-- [{"hostname":"qa-journeys.localhost","tenant_slug":"qa-journeys","is_primary":false,"status":"active"}]
