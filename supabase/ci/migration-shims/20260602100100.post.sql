-- Restores what 20260602100100.pre.sql dropped, to the definitions production
-- actually ends up with. See that shim's header for the ordering story.
--
-- Copied verbatim from 20260515184622_d5_2_message_target_owning_party.sql
-- (lines 53-82): the target-aware scope, is_staff_of_tenant over
-- COALESCE(target_owning_party_id, tenant_id) rather than tenant_id alone.
-- 20260602100100 recreated the plain tenant_id form a moment ago; in
-- production 20260515184622 ran last and overwrote it with this.
DROP POLICY IF EXISTS inquiry_messages_tenant_staff ON public.inquiry_messages;
CREATE POLICY inquiry_messages_tenant_staff ON public.inquiry_messages
  FOR ALL
  USING (
    public.is_staff_of_tenant(COALESCE(target_owning_party_id, tenant_id))
  )
  WITH CHECK (
    public.is_staff_of_tenant(COALESCE(target_owning_party_id, tenant_id))
  );

DROP POLICY IF EXISTS inquiry_message_reads_tenant_staff ON public.inquiry_message_reads;
CREATE POLICY inquiry_message_reads_tenant_staff ON public.inquiry_message_reads
  FOR ALL
  USING (
    public.is_staff_of_tenant(COALESCE(target_owning_party_id, tenant_id))
  )
  WITH CHECK (
    public.is_staff_of_tenant(COALESCE(target_owning_party_id, tenant_id))
  );
