-- Offer state for "staff sent it, the talent(s) have not all approved yet".
--
-- Step A of the hold-the-send design (docs/plans/hold-offer-send-until-talent-approves-2026-10-09.md):
-- the enum value ONLY. Nothing writes it yet, so no reader changes behaviour: the engine
-- (engine_send_offer / engine_submit_approval) and the pair trigger change in Step B, which ships
-- after the UI that renders the state. Every existing client reader keys on status = 'sent',
-- so an 'awaiting_talent' offer is invisible to the client by construction.
--
-- Kept alone in its own file: a new enum value cannot be USED in the transaction that adds it.
-- ADD VALUE IF NOT EXISTS is idempotent.

ALTER TYPE public.inquiry_offer_status ADD VALUE IF NOT EXISTS 'awaiting_talent';
