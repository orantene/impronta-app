-- Menu board public orders stamp inquiries with source_channel = 'menu_order'.
-- That value was referenced in code (menu-order-engine) but never added to the
-- enum, so live submits failed with:
--   invalid input value for enum inquiry_source_channel: "menu_order"

ALTER TYPE public.inquiry_source_channel ADD VALUE IF NOT EXISTS 'menu_order';

COMMENT ON TYPE public.inquiry_source_channel IS
  'Where an inquiry originated (directory, agency site, menu board, …).';
