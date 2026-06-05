-- P4-FORMS: add a composite (section_id, status, created_at) index to make the
-- per-form filtered queries on the operator forms inbox fast without a full
-- tenant-scan. The table already has:
--   cms_form_submissions_tenant_created_idx  (tenant_id, created_at desc)
--   cms_form_submissions_section_idx         (section_id)
--   cms_form_submissions_status_idx          (tenant_id, status, created_at desc)
--
-- The forms inbox queries by (tenant_id, section_id, status, created_at) —
-- a four-column covering index lets Postgres skip the separate section_idx
-- scan + merge step.

create index if not exists cms_form_submissions_section_status_idx
  on public.cms_form_submissions (tenant_id, section_id, status, created_at desc);
