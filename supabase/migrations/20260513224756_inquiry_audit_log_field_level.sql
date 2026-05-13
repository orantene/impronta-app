BEGIN;
alter table public.inquiry_audit_log
  add column if not exists field_group text,
  add column if not exists field_key text,
  add column if not exists old_value jsonb,
  add column if not exists new_value jsonb,
  add column if not exists visibility_scope text
    check (visibility_scope is null or visibility_scope in ('client_visible','talent_visible','coord_visible','admin_only'));
create index if not exists inquiry_audit_log_field_idx
  on public.inquiry_audit_log (inquiry_id, field_group, created_at desc)
  where field_group is not null;

create or replace function public.inquiry_audit_emit_field(
  p_inquiry_id uuid,
  p_field_group text,
  p_field_key text,
  p_old_value jsonb default null,
  p_new_value jsonb default null,
  p_visibility_scope text default null,
  p_actor_role text default null
)
  returns uuid
  language plpgsql
  security definer
as $$
declare
  v_tenant uuid;
  v_actor uuid := auth.uid();
  v_id uuid;
begin
  select tenant_id into v_tenant
    from public.inquiries where id = p_inquiry_id;
  if v_tenant is null then
    raise exception 'inquiry not found';
  end if;

  insert into public.inquiry_audit_log (
    tenant_id, inquiry_id, actor_user_id, kind, payload,
    field_group, field_key, old_value, new_value, visibility_scope
  ) values (
    v_tenant, p_inquiry_id, v_actor, 'field_changed',
    jsonb_build_object(
      'field_group', p_field_group,
      'field_key', p_field_key,
      'actor_role', p_actor_role
    ),
    p_field_group, p_field_key, p_old_value, p_new_value, p_visibility_scope
  )
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.inquiry_audit_emit_field(uuid, text, text, jsonb, jsonb, text, text)
  to authenticated;

comment on function public.inquiry_audit_emit_field is
  'Field-level audit emit (SECURITY DEFINER). Records before/after diffs for structured field changes on an inquiry. Companion to inquiry_audit_emit(). Plan v2 §4.3.';

COMMIT;
