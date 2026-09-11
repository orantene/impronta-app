-- The rows the proven journey wrote, read back AFTER the browser run
-- (run 4, 2026-09-10 15:22 to 15:25 UTC, local build of work/prove-counter on
-- qa-journeys.local:3111 against Supabase branch fxlankepwnvelxjrahwk).
-- Nothing here was inserted; every row came from the counter's own commands.
SELECT o.id, o.created_at, o.status, o.total_cents, o.version, o.source_channel,
       o.receipt_code, o.customer_id,
       (SELECT string_agg(l.label || ' x' || l.units || ' = ' || l.total_cents, '; '
                          ORDER BY l.sort_order)
          FROM order_lines l WHERE l.order_id = o.id) AS lines,
       (SELECT json_agg(json_build_object(
                 'status', t.status, 'gross', t.gross_amount_cents,
                 'paid_via', t.metadata->>'paid_via',
                 'tendered', t.metadata->>'tendered_cents',
                 'change', t.metadata->>'change_cents',
                 'shift', t.metadata->>'shift_id'))
          FROM booking_transactions t WHERE t.order_id = o.id) AS txns
  FROM orders o
 WHERE o.tenant_id = '33333333-3333-4333-8333-333333333333'
   AND o.source_channel = 'pos'
   AND o.created_at > '2026-09-10 15:22:00+00'
 ORDER BY o.created_at;

-- Output (run 4; the four orders of the four tests, in order):
--
-- THE SALE. Two pizzas + one garlic bread = 4250; cash tendered 5000, change
-- 750; ONE paid money row; stamped with the shift this run opened (a0df8241).
-- Its receipt_code is the one the paid screen linked and the anonymous browser
-- opened at /r/rej1c4dqt4gnup3ue5gq.
-- {"id":"3b6ed989-53a4-49db-99fa-3aadd67613f9","created_at":"2026-09-10 15:22:52.111198+00",
--  "status":"paid","total_cents":4250,"version":6,"source_channel":"pos",
--  "receipt_code":"rej1c4dqt4gnup3ue5gq","customer_id":null,
--  "lines":"House pizza x2.000 = 3600; Garlic bread x1.000 = 650",
--  "txns":[{"status":"paid","gross":4250,"paid_via":"cash","tendered":"5000","change":"750",
--           "shift":"a0df8241-1208-4111-aaad-d212b262c595"}]}
--
-- REFUSAL 1 (already collected against). The second till took 1800; the first
-- till's charge was refused; exactly ONE paid row, gross 1800. Not twice.
-- {"id":"b6b18505-9f96-485b-b322-f2cc47da7a5a","created_at":"2026-09-10 15:23:34.876233+00",
--  "status":"paid","total_cents":1800,"version":4,"source_channel":"pos",
--  "receipt_code":"hjigg173ymikemxmegt9","customer_id":null,
--  "lines":"House pizza x1.000 = 1800",
--  "txns":[{"status":"paid","gross":1800,"paid_via":"cash","tendered":"1800","change":"0",
--           "shift":"a0df8241-1208-4111-aaad-d212b262c595"}]}
--
-- REFUSAL 2 (changed underneath). The second till added garlic bread (version
-- moved to 3, total 2450); the first till charged its stale 1800 and was
-- refused; NO money row at all, sale still draft at the second till's total.
-- {"id":"3529f14c-aea8-4ae4-a912-42474ead3e74","created_at":"2026-09-10 15:24:16.893125+00",
--  "status":"draft","total_cents":2450,"version":3,"source_channel":"pos",
--  "receipt_code":"uwbk1nbqpact1vej2dxy","customer_id":null,
--  "lines":"House pizza x1.000 = 1800; Garlic bread x1.000 = 650","txns":null}
--
-- REFUSAL 3 (needs the buyer's name). First charge with no name: refused,
-- nothing taken. Then the email typed on the same sale: paid 1200, ONE money
-- row, and customer_id now points at the buyer the email created.
-- {"id":"0768d19d-09f2-49a0-a672-a06d37d3bbf5","created_at":"2026-09-10 15:25:03.701773+00",
--  "status":"paid","total_cents":1200,"version":4,"source_channel":"pos",
--  "receipt_code":"xrij1cd2ppmkv5h8mdge","customer_id":"ccd3b6cb-b585-43f9-8892-3358375d8412",
--  "lines":"QA gala ticket x1.000 = 1200",
--  "txns":[{"status":"paid","gross":1200,"paid_via":"cash","tendered":"1200","change":"0",
--           "shift":"a0df8241-1208-4111-aaad-d212b262c595"}]}
--
-- Runs 5 and 6 (the refusals re-run after the two sentences were reworded)
-- wrote 03991034 (paid 1800 once), 08513cd7 (draft 2450, no txn) and
-- c3d538c9 (paid 1200, customer e9448056) with the same shapes.
