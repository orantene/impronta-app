-- Maison setup choices (AUD-023 / W33 / W75): persist palette / screen / content
-- mode server-side so Today can resume across devices. localStorage remains a
-- cache only. ADDITIVE — null means no mid-setup resume.

alter table public.talent_sites
  add column if not exists setup_choices jsonb;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'talent_sites_setup_choices_object_check'
      and conrelid = 'public.talent_sites'::regclass
  ) then
    alter table public.talent_sites
      add constraint talent_sites_setup_choices_object_check
      check (setup_choices is null or jsonb_typeof(setup_choices) = 'object');
  end if;
end
$$;

comment on column public.talent_sites.setup_choices is
  'Maison free-website setup UI choices (screen, palette, content mode, status). Null when the talent has not started or has published.';
