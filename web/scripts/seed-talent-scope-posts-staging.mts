/**
 * Post-cut reseed: talent-scope posts for QA talent TAL-93900 (never TAL-93938). STAGING ONLY (fxlankepwnvelxjrahwk).
 *
 * Needs migration 20261231400700 on staging (cms_posts.tenant_id nullable, cms_posts_scope_present,
 * unique index cms_posts_talent_locale_slug_key). Writes ONLY public.cms_posts rows with tenant_id NULL and
 * talent_profile_id = the TAL-93900 profile, deterministic ids (qa-fixture-g6 stableId "tpost:*"), so a re-run is a no-op.
 *
 * Modes:
 *   (none)     read-only plan: target check, schema check (nullable tenant_id, scope constraint, talent unique index),
 *              TAL-93900 resolve, which fixture rows already exist. Writes nothing.
 *   --apply    insert the missing rows in one transaction (ON CONFLICT DO NOTHING), COMMIT.
 *   --cleanup  with --apply: delete only the rows with these ids and tenant_id IS NULL.
 *
 * Refuses unless DATABASE_URL logs in as postgres.fxlankepwnvelxjrahwk (pooler) or db.fxlankepwnvelxjrahwk.supabase.co,
 * and refuses if the resolved profile_code is not TAL-93900. Never prints a password or URL.
 *
 * Run from web/: npx tsx scripts/seed-talent-scope-posts-staging.mts --env-file <tmp> [--apply [--cleanup]]
 */
import { readFileSync } from "node:fs";

import { PREFIX, checkDbTarget, parseEnvText, stableId } from "./lib/group6-fixtures.mjs";

// QA test talent. TAL-93938 is a REAL talent: never touched. TAL-96001 (T1, this seed family's own fixture talent) is
// allowed only through an explicit --talent-code TAL-96001, because TAL-93900 has no talent_sites row on staging (2026-10-18).
const ALLOWED_CODES = ["TAL-93900", "TAL-96001"];
const FORBIDDEN_CODE = "TAL-93938";

type Row = Record<string, unknown>;
type PgClient = {
  connect(): Promise<void>;
  query(text: string, params?: unknown[]): Promise<{ rows: Row[]; rowCount: number | null }>;
  end(): Promise<void>;
};
const PG_MODULE = "pg"; // no @types/pg in this repo
const pgMod = (await import(PG_MODULE)) as { default: { Client: new (cfg: { connectionString?: string; ssl?: unknown }) => PgClient } };

function die(msg: string, code = 1): never {
  console.error(`[talent-posts] ${msg}`);
  process.exit(code);
}

const argv = process.argv.slice(2);
const apply = argv.includes("--apply");
const cleanup = argv.includes("--cleanup");
const unknown = argv.filter((a, i) => !["--apply", "--cleanup", "--env-file", "--talent-code"].includes(a) && argv[i - 1] !== "--env-file" && argv[i - 1] !== "--talent-code");
const codeAt = argv.indexOf("--talent-code");
const QA_TALENT_CODE = codeAt > -1 ? (argv[codeAt + 1] ?? "") : "TAL-93900";
if (!ALLOWED_CODES.includes(QA_TALENT_CODE)) die(`--talent-code must be one of ${ALLOWED_CODES.join(", ")}`, 2);
if (unknown.length) die(`unknown argument(s): ${unknown.join(" ")}`, 2);
if (cleanup && !apply) die("--cleanup deletes rows; add --apply (without it nothing is written)", 2);
const envFileAt = argv.indexOf("--env-file");
const env: Record<string, string | undefined> = { ...process.env };
if (envFileAt > -1) {
  if (!argv[envFileAt + 1]) die("--env-file needs a path", 2);
  Object.assign(env, parseEnvText(readFileSync(argv[envFileAt + 1], "utf8")));
}

const verdict = checkDbTarget(env);
if (!verdict.ok) die(`refusing to run:\n  - ${verdict.reasons.join("\n  - ")}`, 2);
const dbUser = decodeURIComponent(new URL(String(env.DATABASE_URL)).username);
if (!dbUser.includes("postgres.fxlankepwnvelxjrahwk") && dbUser !== "postgres") die("DATABASE_URL user must contain postgres.fxlankepwnvelxjrahwk", 2);

const id = (k: string) => stableId(`tpost:${k}`);
const POST_IDS = ["es", "en", "expired", "takedown"].map(id);

const client = new pgMod.default.Client({ connectionString: env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
await client.connect();
const q = (text: string, params: unknown[] = []) => client.query(text, params);

try {
  // ---- read-only schema check
  const nullable = await q("select is_nullable from information_schema.columns where table_schema='public' and table_name='cms_posts' and column_name='tenant_id'");
  const scope = await q("select 1 from pg_constraint where conname='cms_posts_scope_present' and conrelid='public.cms_posts'::regclass");
  const uniq = await q("select 1 from pg_indexes where schemaname='public' and tablename='cms_posts' and indexname='cms_posts_talent_locale_slug_key'");
  const schemaOk = nullable.rows[0]?.is_nullable === "YES" && scope.rowCount === 1 && uniq.rowCount === 1;
  console.log(`[talent-posts] schema: tenant_id nullable=${nullable.rows[0]?.is_nullable ?? "?"}, cms_posts_scope_present=${scope.rowCount === 1}, cms_posts_talent_locale_slug_key=${uniq.rowCount === 1}`);
  if (!schemaOk) die("staging schema is missing the Posts v1 talent-scope delta (migration 20261231400700). Nothing written.");

  // ---- resolve the QA talent (exactly TAL-93900)
  const t = await q("select id, profile_code, user_id from public.talent_profiles where profile_code = $1", [QA_TALENT_CODE]);
  if (t.rowCount !== 1) die(`${QA_TALENT_CODE} resolved to ${t.rowCount} profiles, expected exactly 1. Nothing written.`);
  const talent = t.rows[0] as { id: string; profile_code: string; user_id: string | null };
  if (talent.profile_code === FORBIDDEN_CODE) die("refusing: resolved the real talent");
  const site = await q("select site_slug, status from public.talent_sites where talent_profile_id = $1", [talent.id]);
  const siteSlug = (site.rows[0]?.site_slug as string | null | undefined) ?? null;
  console.log(`[talent-posts] talent ${QA_TALENT_CODE} -> ${talent.id}; site status=${site.rows[0]?.status ?? "none"}; host=${siteSlug ? `${siteSlug}.staging.tulala.digital` : "NO site_slug (posts cannot be reached on a talent host)"}`);

  const existing = await q("select id from public.cms_posts where id = any($1::uuid[])", [POST_IDS]);
  console.log(`[talent-posts] fixture post rows already present: ${existing.rowCount}/${POST_IDS.length}`);

  const now = Date.now();
  const ago = (d: number) => new Date(now - d * 86400000).toISOString();
  const rows: Row[] = [
    { id: id("es"), locale: "es", slug: `${PREFIX}-t-guia-limpieza`, title: "Guia rapida para mantener tu casa limpia", excerpt: "Tres habitos sencillos para que la limpieza semanal sea mas facil.", body: "Ventila a diario, ordena antes de limpiar y deja la limpieza profunda para una visita mensual.", status: "published", published_at: ago(2) },
    { id: id("en"), locale: "en", slug: `${PREFIX}-t-cleaning-guide`, title: "A quick guide to keeping your home clean", excerpt: "Three simple habits that make weekly cleaning easier.", body: "Air the house daily, tidy before you clean, and keep deep cleaning for a monthly visit.", status: "published", published_at: ago(2), translation_of: id("es") },
    { id: id("expired"), locale: "es", slug: `${PREFIX}-t-oferta-vencida`, title: "Oferta de temporada (vencida)", excerpt: "Este articulo ya vencio.", body: "Contenido de un articulo con fecha de vencimiento pasada.", status: "published", published_at: ago(30), expires_at: ago(1) },
    { id: id("takedown"), locale: "es", slug: `${PREFIX}-t-articulo-oculto`, title: "Articulo oculto por Tulala", excerpt: "Este articulo fue retirado.", body: "Contenido retirado.", status: "published", published_at: ago(10), taken_down_at: ago(1), taken_down_reason: `${PREFIX} takedown state` },
  ];
  const base = { tenant_id: null, talent_profile_id: talent.id, created_by: talent.user_id, updated_by: talent.user_id, author_profile_id: talent.user_id, include_in_sitemap: true, noindex: false, is_unlisted: false, is_featured: false };

  if (apply && !cleanup && !siteSlug) die(`${QA_TALENT_CODE} has no talent_sites.site_slug, so /blog is unreachable on any talent host. Nothing written.`);

  if (!apply) {
    console.log(`[talent-posts] DRY RUN. --apply would insert up to ${rows.length - (existing.rowCount ?? 0)} cms_posts row(s) (tenant_id NULL, talent_profile_id ${talent.id}). Slugs:`);
    for (const r of rows) console.log(`  /blog/${r.slug}  [${r.status}${r.expires_at ? ", expired" : ""}${r.taken_down_at ? ", taken down" : ""}]`);
    process.exit(0);
  }

  await q("begin");
  try {
    if (cleanup) {
      const del = await q("delete from public.cms_posts where id = any($1::uuid[]) and tenant_id is null and talent_profile_id = $2", [POST_IDS, talent.id]);
      console.log(`[talent-posts] cleanup: deleted ${del.rowCount} row(s)`);
    } else {
      let inserted = 0;
      for (const r of rows) {
        const rec = { ...base, ...r };
        const cols = Object.keys(rec);
        const res = await q(
          `insert into public.cms_posts (${cols.join(",")}) values (${cols.map((_, i) => `$${i + 1}`).join(",")}) on conflict do nothing`,
          cols.map((c) => rec[c as keyof typeof rec]),
        );
        inserted += res.rowCount ?? 0;
      }
      console.log(`[talent-posts] inserted ${inserted} new row(s), ${rows.length - inserted} already present`);
    }
    await q("commit");
  } catch (e) {
    await q("rollback");
    die(`rolled back: ${(e as Error).message}`);
  }
} finally {
  await client.end();
}
