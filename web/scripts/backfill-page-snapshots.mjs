#!/usr/bin/env node
/**
 * Phase 3.4 — page snapshot backfill (tenant-scoped).
 *
 * Purpose:
 *   Backfill missing published snapshot payloads for already-published pages
 *   so public rendering can converge on snapshot-first behavior.
 *
 * Safety model:
 *   - Dry run by default (no writes).
 *   - Requires --tenant.
 *   - Optional --locale narrows scope.
 *   - Use --apply to perform writes.
 *
 * Usage:
 *   node --env-file=.env.local scripts/backfill-page-snapshots.mjs \
 *     --tenant <tenant-uuid>
 *
 *   node --env-file=.env.local scripts/backfill-page-snapshots.mjs \
 *     --tenant <tenant-uuid> --locale en --apply
 */

import { createClient } from "@supabase/supabase-js";

function parseArgs(argv) {
  const out = {
    tenant: null,
    locale: null,
    apply: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--tenant") {
      out.tenant = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (a === "--locale") {
      out.locale = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (a === "--apply") {
      out.apply = true;
      continue;
    }
  }
  return out;
}

function inferKind(row) {
  if (row.system_template_key === "homepage") return "homepage";
  if (row.system_template_key === "site_shell") return "site_shell";
  return "standard_page";
}

function needsBackfill(row) {
  const kind = inferKind(row);
  if (kind === "homepage") return row.published_homepage_snapshot == null;
  return row.published_page_snapshot == null;
}

function introTaglineFromHero(hero) {
  if (!hero || typeof hero !== "object") return null;
  const value = hero.introTagline;
  return typeof value === "string" ? value : null;
}

function buildSnapshot({ row, sourceRows, sectionFacts, nowIso }) {
  const slots = [];
  for (const ref of sourceRows) {
    const facts = sectionFacts.get(ref.section_id);
    if (!facts) continue;
    if (facts.status === "archived") continue;
    slots.push({
      slotKey: ref.slot_key,
      sortOrder: ref.sort_order,
      sectionId: ref.section_id,
      sectionTypeKey: facts.section_type_key,
      schemaVersion: facts.schema_version,
      name: facts.name,
      props: facts.props_jsonb ?? {},
    });
  }
  if (slots.length === 0) {
    return { ok: false, reason: "all_sections_archived_or_missing" };
  }

  const publishedAt = row.published_at ?? nowIso;
  const kind = inferKind(row);

  return {
    ok: true,
    snapshot: {
      version: 1,
      publishedAt,
      pageVersion: row.version + 1,
      locale: row.locale,
      fields: {
        title: row.title,
        metaDescription: row.meta_description ?? null,
        introTagline: kind === "homepage" ? introTaglineFromHero(row.hero) : null,
      },
      templateSchemaVersion: row.template_schema_version ?? 1,
      slots,
    },
  };
}

async function loadSourceRows(supabase, tenantId, pageId) {
  const select = "section_id, slot_key, sort_order";
  const { data: liveRows, error: liveErr } = await supabase
    .from("cms_page_sections")
    .select(select)
    .eq("tenant_id", tenantId)
    .eq("page_id", pageId)
    .eq("is_draft", false)
    .order("slot_key", { ascending: true })
    .order("sort_order", { ascending: true });
  if (liveErr) return { ok: false, error: liveErr.message };

  if ((liveRows ?? []).length > 0) {
    return { ok: true, rows: liveRows, sourceMode: "live" };
  }

  const { data: draftRows, error: draftErr } = await supabase
    .from("cms_page_sections")
    .select(select)
    .eq("tenant_id", tenantId)
    .eq("page_id", pageId)
    .eq("is_draft", true)
    .order("slot_key", { ascending: true })
    .order("sort_order", { ascending: true });
  if (draftErr) return { ok: false, error: draftErr.message };

  return { ok: true, rows: draftRows ?? [], sourceMode: "draft" };
}

async function loadSectionFacts(supabase, tenantId, sectionIds) {
  if (sectionIds.length === 0) return { ok: true, map: new Map() };
  const { data, error } = await supabase
    .from("cms_sections")
    .select("id, section_type_key, schema_version, name, props_jsonb, status")
    .eq("tenant_id", tenantId)
    .in("id", sectionIds);
  if (error) return { ok: false, error: error.message };

  const map = new Map();
  for (const row of data ?? []) {
    map.set(row.id, row);
  }
  return { ok: true, map };
}

async function syncLiveRows(supabase, tenantId, pageId, sourceRows) {
  const { error: delErr } = await supabase
    .from("cms_page_sections")
    .delete()
    .eq("tenant_id", tenantId)
    .eq("page_id", pageId)
    .eq("is_draft", false);
  if (delErr) return { ok: false, error: delErr.message };

  if (sourceRows.length === 0) return { ok: true };
  const inserts = sourceRows.map((r) => ({
    tenant_id: tenantId,
    page_id: pageId,
    section_id: r.section_id,
    slot_key: r.slot_key,
    sort_order: r.sort_order,
    is_draft: false,
  }));
  const { error: insErr } = await supabase.from("cms_page_sections").insert(inserts);
  if (insErr) return { ok: false, error: insErr.message };
  return { ok: true };
}

async function writeAuditRow(supabase, payload) {
  const { error } = await supabase.from("platform_audit_log").insert(payload);
  if (error) {
    console.warn("[backfill-page-snapshots] audit insert failed", error.message);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.tenant) {
    console.error("Usage: --tenant <tenant-uuid> [--locale <locale>] [--apply]");
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const pagesQ = supabase
    .from("cms_pages")
    .select(
      "id, tenant_id, locale, slug, title, status, system_template_key, template_schema_version, version, published_at, meta_description, hero, published_homepage_snapshot, published_page_snapshot",
    )
    .eq("tenant_id", args.tenant)
    .eq("status", "published")
    .order("locale", { ascending: true })
    .order("title", { ascending: true });
  if (args.locale) pagesQ.eq("locale", args.locale);

  const { data: allRows, error: loadErr } = await pagesQ;
  if (loadErr) {
    console.error(loadErr.message);
    process.exit(1);
  }

  const candidates = (allRows ?? []).filter(needsBackfill);
  const nowIso = new Date().toISOString();

  const results = [];
  let applied = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of candidates) {
    const kind = inferKind(row);
    const source = await loadSourceRows(supabase, args.tenant, row.id);
    if (!source.ok) {
      failed += 1;
      results.push({
        pageId: row.id,
        locale: row.locale,
        slug: row.slug,
        kind,
        status: "failed",
        error: source.error,
      });
      continue;
    }

    const sourceRows = source.rows ?? [];
    if (sourceRows.length === 0) {
      skipped += 1;
      results.push({
        pageId: row.id,
        locale: row.locale,
        slug: row.slug,
        kind,
        status: "skipped",
        reason: "no_page_sections",
      });
      continue;
    }

    const sectionIds = [...new Set(sourceRows.map((r) => r.section_id))];
    const factsRes = await loadSectionFacts(supabase, args.tenant, sectionIds);
    if (!factsRes.ok) {
      failed += 1;
      results.push({
        pageId: row.id,
        locale: row.locale,
        slug: row.slug,
        kind,
        status: "failed",
        error: factsRes.error,
      });
      continue;
    }

    const built = buildSnapshot({
      row,
      sourceRows,
      sectionFacts: factsRes.map,
      nowIso,
    });
    if (!built.ok) {
      skipped += 1;
      results.push({
        pageId: row.id,
        locale: row.locale,
        slug: row.slug,
        kind,
        status: "skipped",
        reason: built.reason,
      });
      continue;
    }

    const nextVersion = row.version + 1;
    const writeColumn =
      kind === "homepage" ? "published_homepage_snapshot" : "published_page_snapshot";

    if (!args.apply) {
      results.push({
        pageId: row.id,
        locale: row.locale,
        slug: row.slug,
        kind,
        status: "would_apply",
        sourceMode: source.sourceMode,
        sectionCount: built.snapshot.slots.length,
        writeColumn,
        nextVersion,
      });
      continue;
    }

    const updatePatch = {
      version: nextVersion,
      published_at: built.snapshot.publishedAt,
      updated_at: nowIso,
      [writeColumn]: built.snapshot,
    };

    const { error: updErr } = await supabase
      .from("cms_pages")
      .update(updatePatch)
      .eq("id", row.id)
      .eq("tenant_id", args.tenant)
      .eq("version", row.version);
    if (updErr) {
      failed += 1;
      results.push({
        pageId: row.id,
        locale: row.locale,
        slug: row.slug,
        kind,
        status: "failed",
        error: updErr.message,
      });
      continue;
    }

    const liveSync = await syncLiveRows(supabase, args.tenant, row.id, sourceRows);
    if (!liveSync.ok) {
      failed += 1;
      results.push({
        pageId: row.id,
        locale: row.locale,
        slug: row.slug,
        kind,
        status: "failed",
        error: `snapshot written but live-sync failed: ${liveSync.error}`,
      });
      continue;
    }

    await writeAuditRow(supabase, {
      tenant_id: args.tenant,
      actor_profile_id: null,
      actor_role: "system",
      action: `agency.site_admin.snapshot_backfill.${kind}`,
      target_type: "cms_pages",
      target_id: row.id,
      severity: "info",
      reason: "published_snapshot_backfill",
      metadata: {
        source_mode: source.sourceMode,
        section_count: built.snapshot.slots.length,
        previous_version: row.version,
        next_version: nextVersion,
        write_column: writeColumn,
      },
      created_at: nowIso,
    });

    applied += 1;
    results.push({
      pageId: row.id,
      locale: row.locale,
      slug: row.slug,
      kind,
      status: "applied",
      sourceMode: source.sourceMode,
      sectionCount: built.snapshot.slots.length,
      writeColumn,
      nextVersion,
    });
  }

  const summary = {
    tenantId: args.tenant,
    locale: args.locale ?? null,
    dryRun: !args.apply,
    scannedPublishedRows: (allRows ?? []).length,
    candidates: candidates.length,
    applied,
    skipped,
    failed,
    results,
  };

  console.log(JSON.stringify(summary, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
