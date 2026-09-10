-- Refusal 3's recovery: the buyers the counter created from the typed email
-- (run 4 and run 6). Not inserted: `startCollection` -> `ensureCustomer`.
SELECT id, email, tenant_id
  FROM customers
 WHERE id IN ('ccd3b6cb-b585-43f9-8892-3358375d8412', 'e9448056-9bcc-4d8e-bcad-bef48ee18f06');
-- [{"id":"ccd3b6cb-b585-43f9-8892-3358375d8412","email":"qa-counter-1789053914295@impronta.test",
--   "tenant_id":"33333333-3333-4333-8333-333333333333"},
--  {"id":"e9448056-9bcc-4d8e-bcad-bef48ee18f06","email":"qa-counter-1789054223309@impronta.test",
--   "tenant_id":"33333333-3333-4333-8333-333333333333"}]
-- orders 0768d19d (run 4) and c3d538c9 (run 6) carry these ids as customer_id
-- (04-journey-rows.sql); the spec also asserted the email string equality.
