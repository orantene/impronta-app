-- The real problems in the inbox: paid ticket lines whose seat was gone before
-- the payment landed. Not inserted for this run; produced by the ticket
-- purchase journeys of 2026-09-08/09 (order_updated_at).
select s.order_line_id, s.order_id, s.session_id, s.order_updated_at,
  (select string_agg(ca.state, ',') from public.capacity_allocations ca where ca.order_line_id = s.order_line_id) as alloc_states,
  exists(select 1 from public.ticket_refund_intents ri where ri.order_line_id = s.order_line_id) as has_refund_intent
from public.admissions_mint_shortfall s order by s.order_updated_at;
-- OUTPUT before this run's press (7 lines, every allocation `released`):
--   6c296e60 order 59da3895 session ...0001 2026-09-08 19:36Z released  has_refund_intent=true  (previous run's press)
--   ae0150ef order 652bc69b session ...0001 2026-09-08 19:57Z released  false   <- this run pressed this one
--   184b062c order 7a183ab5 ...0001 20:02Z released false
--   865916a5 order a2be6b19 ...0003 21:50Z released false
--   36234e01 order a0d793fc ...0003 21:51Z released false
--   ce46b06c order 14799323 ...0003 2026-09-09 08:19Z released false
--   fe11e50f order 2d39c196 ...0003 08:36Z released false
