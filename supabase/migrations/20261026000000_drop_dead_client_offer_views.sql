-- Drop the dead, RLS-bypassing client offer views.
--
-- public.inquiry_offers_client_view and public.inquiry_offer_line_items_client_view
-- were plain pass-through SELECTs over inquiry_offers / inquiry_offer_line_items
-- with NO status filter and NOT defined `security_invoker` — so they ran as the
-- view OWNER and BYPASSED the inquiry_offers_client_select RLS policy (which
-- restricts clients to status IN ('sent','accepted')). A draft offer's amounts
-- could leak through them.
--
-- Their ONLY consumer was web/src/lib/client-inquiry-details.ts ::
-- loadClientInquiryDetail, which was dead code (zero callers) and is deleted in
-- the same change. Verified there is no other reference: grep across web/src
-- (*.ts/*.tsx) + supabase/migrations (*.sql) finds none, and pg_depend shows no
-- DB object (view/rule/function) depends on either view. Safe to drop.
--
-- (Live client offer reads go through the user-scoped, RLS-honoring loader in
-- (workspace)/[tenantSlug]/_data-bridge/client-inquiry-details.ts, gated to
-- status IN ('sent','accepted') — these views are not part of any live path.)

DROP VIEW IF EXISTS public.inquiry_offer_line_items_client_view;
DROP VIEW IF EXISTS public.inquiry_offers_client_view;
