#!/usr/bin/env node
const TOKEN = process.env.SUPABASE_ACCESS_TOKEN;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const REF = SUPABASE_URL.match(/^https:\/\/([^.]+)\.supabase\.co/)[1];
const API = `https://api.supabase.com/v1/projects/${REF}/database/query`;
async function q(sql) {
  const r = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  const b = await r.json();
  if (!r.ok || b?.message) throw new Error(b?.message ?? r.status);
  return b;
}
console.log("---agency_taxonomy_settings row for Impronta × home-fixer---");
console.log(
  JSON.stringify(
    await q(
      `SELECT s.tenant_id, s.taxonomy_term_id, s.is_enabled, s.show_in_registration, s.show_in_directory,
              s.allow_as_primary, s.allow_as_secondary, s.updated_at, t.slug AS term_slug, a.slug AS tenant_slug
       FROM public.agency_taxonomy_settings s
         JOIN public.agencies a ON a.id = s.tenant_id
         JOIN public.taxonomy_terms t ON t.id = s.taxonomy_term_id
       WHERE a.slug = 'impronta' AND t.slug = 'home-fixer'`,
    ),
    null,
    2,
  ),
);
console.log("---engine_audit_log row for this disable---");
console.log(
  JSON.stringify(
    await q(
      `SELECT eal.operation, eal.surface, eal.subject_kind, eal.subject_key, eal.before_value, eal.after_value, eal.actor_role, eal.created_at
       FROM public.engine_audit_log eal
         JOIN public.agencies a ON a.id = eal.tenant_id
       WHERE a.slug = 'impronta' AND eal.subject_key = 'home-fixer' AND eal.surface = 'taxonomy'
       ORDER BY eal.created_at DESC LIMIT 3`,
    ),
    null,
    2,
  ),
);
