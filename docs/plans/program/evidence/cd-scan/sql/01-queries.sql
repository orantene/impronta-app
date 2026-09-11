-- cd-scan: the rows the two journeys wrote on the QA workspace
-- (Supabase branch fxlankepwnvelxjrahwk, tenant 33333333-3333-4333-8333-333333333333).
-- Read back with the service role after the runs; results in 02-rows-after-runs.json.

-- Customer display journey (run 4): the sale the display followed.
select id, tenant_id, status, source_channel, total_cents, customer_id, receipt_code, version
  from orders where id = 'f52cc410-ecb5-41b3-a39b-aa52a34b8ad9';
select offering_id, label, units, unit_cents, total_cents
  from order_lines where order_id = 'f52cc410-ecb5-41b3-a39b-aa52a34b8ad9';
select status, gross_amount_cents, metadata, requested_at
  from booking_transactions where order_id = 'f52cc410-ecb5-41b3-a39b-aa52a34b8ad9';
-- The address typed on the display's receipt screen, as this workspace's customer,
-- attached to the sale (customer_id above) because the sale had none.
select id, tenant_id, email, display_name, created_at
  from customers where id = '536454d2-afe3-4aeb-a038-c0c18c4bb305';

-- Scanner journey (run 5): two scans, two lines, one write path.
select id, tenant_id, status, source_channel, total_cents, version
  from orders where id = '882b3d28-4686-4223-a50e-4a8f6ccd4737';
select offering_id, label, units, total_cents
  from order_lines where order_id = '882b3d28-4686-4223-a50e-4a8f6ccd4737';
-- The spec's own link fixture (code qa-scan-mtwdubqz, context.offering_id = House pizza),
-- removed by the spec after the run: expected zero rows.
select id from links where id = '2311ee24-71d1-476a-8d15-dc80f511cd55';
