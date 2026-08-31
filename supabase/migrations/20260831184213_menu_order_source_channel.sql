-- Workspace Menu orders (house-owned catalogue) need their own provenance
-- channel. Until this lands they stamped offering_request + source_context.menu_order.
-- Separate file: ALTER TYPE ... ADD VALUE must not share a txn that uses the value.
ALTER TYPE public.inquiry_source_channel ADD VALUE IF NOT EXISTS 'menu_order';
