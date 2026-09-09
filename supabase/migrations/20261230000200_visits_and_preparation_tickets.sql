-- P5 — visits (occupancy) and preparation tickets.
--
-- L52: the existing `orders` row stays the commercial record. There is no
-- parallel "check" entity. A visit owns table state, reset, and the QR
-- identity a guest holds. `orders.space_id` stays the physical table
-- (`spaces.id`). Occupancy is `orders.visit_id`. Stuffing a visit UUID into
-- `space_id` would collide with the space identity that column was reserved
-- for.
--
-- One open visit per space. One order per visit until bill-splitting proves
-- a multi-order visit is required.
--
-- Preparation is a separate lifecycle from payment. Amendments bump a
-- revision on the same ticket; they do not insert a second ticket.
--
-- APPLY WITH `node web/scripts/apply-migration.mjs --apply-pending`.
-- This file is not applied from this environment (no credentials).

BEGIN;

CREATE TABLE IF NOT EXISTS public.visits (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  space_id      uuid NOT NULL REFERENCES public.spaces(id) ON DELETE RESTRICT,
  public_token  text NOT NULL,
  status        text NOT NULL CHECK (status IN ('open', 'closed')),
  version       integer NOT NULL DEFAULT 1,
  opened_at     timestamptz NOT NULL DEFAULT now(),
  closed_at     timestamptz,
  opened_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT visits_public_token_unique UNIQUE (public_token),
  CONSTRAINT visits_closed_when_closed CHECK (
    (status = 'open' AND closed_at IS NULL)
    OR (status = 'closed' AND closed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS visits_one_open_per_space
  ON public.visits (space_id)
  WHERE status = 'open';

CREATE INDEX IF NOT EXISTS visits_tenant_status_idx
  ON public.visits (tenant_id, status, opened_at DESC);

COMMENT ON TABLE public.visits IS
  'Occupancy of a space for one seating. Owns table state, reset, and the opaque QR token. Not a commercial record — that is orders.';
COMMENT ON COLUMN public.visits.public_token IS
  'Opaque visit identity printed only as a redirect target. The table tent stays /q/<readable-code>; this token changes every seating so last night''s check is not reachable from the sticker.';
COMMENT ON COLUMN public.visits.version IS
  'Optimistic concurrency for open-check mutations. Updates use WHERE version = :expected.';

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS visit_id uuid REFERENCES public.visits(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS orders_one_per_visit
  ON public.orders (visit_id)
  WHERE visit_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS orders_visit_id_idx
  ON public.orders (visit_id)
  WHERE visit_id IS NOT NULL;

COMMENT ON COLUMN public.orders.visit_id IS
  'L52 occupancy link. The visit owns table state and QR identity. space_id remains the physical table.';
COMMENT ON COLUMN public.orders.space_id IS
  'Physical space (table, booth, cabana). Occupancy and QR identity live on visits via visit_id.';

CREATE TABLE IF NOT EXISTS public.preparation_tickets (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid NOT NULL REFERENCES public.agencies(id) ON DELETE CASCADE,
  order_id        uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  visit_id        uuid REFERENCES public.visits(id) ON DELETE SET NULL,
  station         text NOT NULL DEFAULT 'kitchen',
  destination     text NOT NULL CHECK (destination IN ('table', 'pickup', 'counter')),
  status          text NOT NULL CHECK (status IN ('queued', 'acknowledged', 'ready', 'cancelled')),
  revision        integer NOT NULL DEFAULT 1,
  promised_at     timestamptz,
  submitted_at    timestamptz NOT NULL DEFAULT now(),
  acknowledged_at timestamptz,
  ready_at        timestamptz,
  handed_off_at   timestamptz,
  cancelled_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS preparation_tickets_one_active_per_order
  ON public.preparation_tickets (order_id)
  WHERE status <> 'cancelled';

CREATE INDEX IF NOT EXISTS preparation_tickets_board_idx
  ON public.preparation_tickets (tenant_id, status, submitted_at)
  WHERE status <> 'cancelled';

COMMENT ON TABLE public.preparation_tickets IS
  'What a station was instructed to prepare. Separate from payment. Amendments bump revision; they do not create a second ticket.';

CREATE TABLE IF NOT EXISTS public.preparation_ticket_revisions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id  uuid NOT NULL REFERENCES public.preparation_tickets(id) ON DELETE CASCADE,
  revision   integer NOT NULL,
  snapshot   jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ticket_id, revision)
);

COMMENT ON TABLE public.preparation_ticket_revisions IS
  'Each fire and each amendment. Two burgers then one no-onion is revision 2 of the same ticket, not a duplicate ticket.';

ALTER TABLE public.visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.visits FORCE ROW LEVEL SECURITY;
ALTER TABLE public.preparation_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preparation_tickets FORCE ROW LEVEL SECURITY;
ALTER TABLE public.preparation_ticket_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.preparation_ticket_revisions FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS visits_select_staff ON public.visits;
CREATE POLICY visits_select_staff ON public.visits
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_platform_admin());

DROP POLICY IF EXISTS preparation_tickets_select_staff ON public.preparation_tickets;
CREATE POLICY preparation_tickets_select_staff ON public.preparation_tickets
  FOR SELECT TO authenticated
  USING (public.is_staff_of_tenant(tenant_id) OR public.is_platform_admin());

DROP POLICY IF EXISTS preparation_ticket_revisions_select_staff ON public.preparation_ticket_revisions;
CREATE POLICY preparation_ticket_revisions_select_staff ON public.preparation_ticket_revisions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.preparation_tickets t
     WHERE t.id = preparation_ticket_revisions.ticket_id
       AND (public.is_staff_of_tenant(t.tenant_id) OR public.is_platform_admin())
  ));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.visits FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.preparation_tickets FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.preparation_ticket_revisions FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON public.visits FROM anon;
REVOKE SELECT ON public.preparation_tickets FROM anon;
REVOKE SELECT ON public.preparation_ticket_revisions FROM anon;

GRANT SELECT ON TABLE public.visits TO authenticated;
GRANT SELECT ON TABLE public.preparation_tickets TO authenticated;
GRANT SELECT ON TABLE public.preparation_ticket_revisions TO authenticated;

GRANT ALL ON TABLE public.visits TO service_role;
GRANT ALL ON TABLE public.preparation_tickets TO service_role;
GRANT ALL ON TABLE public.preparation_ticket_revisions TO service_role;

COMMIT;
