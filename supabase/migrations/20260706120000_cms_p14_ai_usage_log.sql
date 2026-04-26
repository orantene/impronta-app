-- Phase 14 — AI usage log per workspace.
--
-- Captures one row per AI invocation initiated from the page-builder
-- (rewrite, translate, generate-section, alt-text, critique). Lets the
-- admin show usage / cost trends in the dashboard and lets future
-- billing logic key off the same table.
--
-- This is descriptive (not gating) — the per-tenant rate limit lives
-- in-memory and bounds bursts. This table is the durable record.

create table if not exists public.cms_ai_usage_log (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.agencies(id) on delete cascade,
  /** Which page-builder action was invoked. */
  action text not null
    check (action in (
      'rewrite_field',
      'translate_section',
      'translate_site',
      'generate_section',
      'generate_alt_text',
      'critique_page'
    )),
  /** Which AI provider served the call. */
  provider text not null check (provider in ('openai', 'anthropic', 'custom', 'none')),
  /** Token / character counts (best-effort — providers report these). */
  input_tokens integer null,
  output_tokens integer null,
  /** Model name as reported by the adapter (e.g. claude-3-5-sonnet). */
  model text null,
  /** Latency from request to response in ms. */
  latency_ms integer null,
  /** TRUE if the provider returned a successful completion. */
  ok boolean not null default true,
  /** Optional context — section type / field / brief hash, etc. */
  context_jsonb jsonb null,
  actor_profile_id uuid null references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists cms_ai_usage_log_tenant_created_idx
  on public.cms_ai_usage_log (tenant_id, created_at desc);
create index if not exists cms_ai_usage_log_tenant_action_idx
  on public.cms_ai_usage_log (tenant_id, action, created_at desc);

alter table public.cms_ai_usage_log enable row level security;

create policy cms_ai_usage_log_staff_read on public.cms_ai_usage_log
  for select to authenticated
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid()
        and p.role in ('super_admin', 'agency_staff')
        and (p.role = 'super_admin' or p.tenant_id = cms_ai_usage_log.tenant_id)
    )
  );

comment on table public.cms_ai_usage_log is
  'Phase 14 — durable record of AI invocations per workspace. Inserted by service-role when an AI action runs; read by admins via tenant scope.';
