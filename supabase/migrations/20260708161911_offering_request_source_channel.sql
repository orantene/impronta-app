-- New inquiry provenance channel for storefront-driven requests.
-- (Separate file: ALTER TYPE ... ADD VALUE must not share a txn that uses it.)
ALTER TYPE public.inquiry_source_channel ADD VALUE IF NOT EXISTS 'offering_request';
