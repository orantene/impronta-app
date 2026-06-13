-- Wave 4.1 — make agency cms_pages support TRUE freeform (BuilderNode[]) editing,
-- like talent_pages / workspace_pages, while keeping the existing dashboard
-- "Pages" list + front-end ?edit=1 editing UX.
--
-- ADDITIVE + SAFE: both columns are nullable-with-default, so every existing row
-- (homepage, __site_shell__, __directory__, /contact, /studio, … all slot-composed)
-- keeps rendering + editing through the legacy cms_page_sections path untouched.
-- Only pages explicitly flagged is_freeform=true read/write the new blocks tree.
--
--   blocks      — the freeform BuilderNode[] tree (mirrors talent_pages.blocks /
--                 workspace_pages.blocks). Empty array until the page is built.
--   is_freeform — opt-in flag. NEW custom pages (createDraftPageAction) set TRUE
--                 so they edit/render as freeform; homepage + system pages +
--                 every pre-existing page stay FALSE (slot-composed). This is the
--                 guardrail that protects the live homepage from this change.

alter table public.cms_pages
  add column if not exists blocks jsonb not null default '[]'::jsonb,
  add column if not exists is_freeform boolean not null default false;

comment on column public.cms_pages.blocks is
  'Freeform BuilderNode[] tree for is_freeform pages (Wave 4.1). Slot-composed pages ignore this and use cms_page_sections.';
comment on column public.cms_pages.is_freeform is
  'When true, this page renders + edits as a freeform BuilderNode[] tree (blocks) instead of cms_page_sections slots. Homepage + system pages stay false.';
