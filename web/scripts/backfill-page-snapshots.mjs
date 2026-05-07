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
 *
 *   node --env-file=.env.local scripts/backfill-page-snapshots.mjs \
 *     --all-active --apply
 */

import { createClient } from "@supabase/supabase-js";

function parseArgs(argv) {
  const out = {
    tenant: null,
    locale: null,
    apply: false,
    allActive: false,
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
    if (a === "--all-active") {
      out.allActive = true;
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

function snapshotColumnForKind(kind) {
  return kind === "homepage"
    ? "published_homepage_snapshot"
    : "published_page_snapshot";
}

function snapshotFromRow(row) {
  return inferKind(row) === "homepage"
    ? row.published_homepage_snapshot
    : row.published_page_snapshot;
}

function needsBuilderTreeBackfill(row) {
  const snapshot = snapshotFromRow(row);
  if (!snapshot || typeof snapshot !== "object") return false;
  const slots = Array.isArray(snapshot.slots) ? snapshot.slots : [];
  if (slots.length === 0) return false;
  return snapshot.builderTree == null;
}

function introTaglineFromHero(hero) {
  if (!hero || typeof hero !== "object") return null;
  const value = hero.introTagline;
  return typeof value === "string" ? value : null;
}

function buildLegacySectionBuilderTree(slots) {
  return slots.map((slot) => ({
    id: `legacy:${slot.slotKey}:${slot.sortOrder}:${slot.sectionId}`,
    kind: "section",
    props: {
      sectionId: slot.sectionId,
      sectionTypeKey: slot.sectionTypeKey,
      label: slot.name,
      slotKey: slot.slotKey,
      sortOrder: slot.sortOrder,
    },
  }));
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
      builderTree: buildLegacySectionBuilderTree(slots),
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

async function loadTargetTenants(supabase, args) {
  if (args.tenant) return [args.tenant];

  if (!args.allActive) {
    console.error(
      "Usage: --tenant <tenant-uuid> [--locale <locale>] [--apply] OR --all-active [--locale <locale>] [--apply]",
    );
    process.exit(1);
  }

  const { data, error } = await supabase
    .from("agencies")
    .select("id, slug, status")
    .not("status", "in", "(cancelled,archived)");
  if (error) {
    console.error(`Couldn't load active tenants: ${error.message}`);
    process.exit(1);
  }
  return (data ?? []).map((row) => row.id);
}

async function backfillTenant(supabase, tenantId, args) {
  const nowIso = new Date().toISOString();

  const pagesQ = supabase
    .from("cms_pages")
    .select(
      "id, tenant_id, locale, slug, title, body, status, system_template_key, template_schema_version, version, published_at, meta_description, hero, published_homepage_snapshot, published_page_snapshot",
    )
    .eq("tenant_id", tenantId)
    .eq("status", "published")
    .order("locale", { ascending: true })
    .order("title", { ascending: true });
  if (args.locale) pagesQ.eq("locale", args.locale);

  const { data: allRows, error: loadErr } = await pagesQ;
  if (loadErr) {
    console.error(loadErr.message);
    process.exit(1);
  }

  const candidates = (allRows ?? []).filter(
    (row) => needsBackfill(row) || needsBuilderTreeBackfill(row),
  );

  const results = [];
  let applied = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of candidates) {
    const kind = inferKind(row);
    const snapshotMissing = needsBackfill(row);
    const snapshotColumn = snapshotColumnForKind(kind);

    if (!snapshotMissing && needsBuilderTreeBackfill(row)) {
      const existingSnapshot = snapshotFromRow(row);
      const slots = Array.isArray(existingSnapshot?.slots)
        ? existingSnapshot.slots
        : [];
      const enrichedSnapshot = {
        ...existingSnapshot,
        builderTree: buildLegacySectionBuilderTree(slots),
      };
      if (!args.apply) {
        results.push({
          pageId: row.id,
          locale: row.locale,
          slug: row.slug,
          kind,
          status: "would_apply",
          sourceMode: "enrich_builder_tree",
          convertedLegacyBody: false,
          sectionCount: slots.length,
          writeColumn: snapshotColumn,
          nextVersion: row.version + 1,
        });
        continue;
      }

      const { error: updateErr } = await supabase
        .from("cms_pages")
        .update({
          [snapshotColumn]: enrichedSnapshot,
          version: row.version + 1,
          updated_at: nowIso,
        })
        .eq("id", row.id)
        .eq("tenant_id", tenantId)
        .eq("version", row.version);
      if (updateErr) {
        failed += 1;
        results.push({
          pageId: row.id,
          locale: row.locale,
          slug: row.slug,
          kind,
          status: "failed",
          error: updateErr.message,
        });
        continue;
      }

      await writeAuditRow(supabase, {
        tenant_id: tenantId,
        actor_profile_id: null,
        actor_role: "system",
        action: `agency.site_admin.snapshot_backfill.${kind}`,
        target_type: "cms_pages",
        target_id: row.id,
        severity: "info",
        reason: "builder_tree_enrichment",
        metadata: {
          source_mode: "enrich_builder_tree",
          section_count: slots.length,
          previous_version: row.version,
          next_version: row.version + 1,
          write_column: snapshotColumn,
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
        sourceMode: "enrich_builder_tree",
        convertedLegacyBody: false,
        sectionCount: slots.length,
        writeColumn: snapshotColumn,
        nextVersion: row.version + 1,
      });
      continue;
    }

    const source = await loadSourceRows(supabase, tenantId, row.id);
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

    let sourceRows = source.rows ?? [];
    let convertedLegacyBody = false;
    let convertedSourceMode = null;
    let convertedSectionId = null;
    if (sourceRows.length === 0 && (kind === "standard_page" || kind === "homepage")) {
      if (!args.apply) {
        const canConvertStandard =
          kind === "standard_page" &&
          typeof row.body === "string" &&
          row.body.trim().length > 0;
        const canConvertStandardTitle =
          kind === "standard_page" &&
          !canConvertStandard &&
          typeof row.title === "string" &&
          row.title.trim().length > 0;
        const canConvertHomepage =
          kind === "homepage" &&
          typeof row.title === "string" &&
          row.title.trim().length > 0;
        if (canConvertStandard || canConvertStandardTitle || canConvertHomepage) {
          const sourceMode = canConvertHomepage
            ? "convert_legacy_homepage"
            : canConvertStandard
              ? "convert_legacy_body"
              : "convert_legacy_standard_title";
          results.push({
            pageId: row.id,
            locale: row.locale,
            slug: row.slug,
            kind,
            status: "would_apply",
            sourceMode,
            convertedLegacyBody: true,
            sectionCount: 1,
            writeColumn:
              kind === "homepage"
                ? "published_homepage_snapshot"
                : "published_page_snapshot",
            nextVersion: row.version + 1,
          });
          continue;
        }
      }
      let conversion;
      if (kind === "homepage") {
        conversion = await tryConvertLegacyHomepageToSection(supabase, tenantId, row);
      } else {
        const fromBody = await tryConvertLegacyBodyToSection(supabase, tenantId, row);
        if (fromBody.ok || fromBody.reason !== "no_body_to_convert") {
          conversion = fromBody;
        } else {
          conversion = await tryConvertLegacyStandardTitleToSection(supabase, tenantId, row);
        }
      }
      if (conversion.ok) {
        sourceRows = conversion.rows;
        convertedLegacyBody = true;
        convertedSourceMode = conversion.sourceMode;
        convertedSectionId = conversion.createdSectionId;
      } else if (
        conversion.reason !== "no_body_to_convert" &&
        conversion.reason !== "no_homepage_title_to_convert" &&
        conversion.reason !== "no_standard_title_to_convert"
      ) {
        failed += 1;
        results.push({
          pageId: row.id,
          locale: row.locale,
          slug: row.slug,
          kind,
          status: "failed",
          error: conversion.reason,
        });
        continue;
      }
    }
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
    const factsRes = await loadSectionFacts(supabase, tenantId, sectionIds);
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
    const writeColumn = snapshotColumn;

    if (!args.apply) {
      results.push({
        pageId: row.id,
        locale: row.locale,
        slug: row.slug,
        kind,
        status: "would_apply",
        sourceMode: convertedLegacyBody && convertedSourceMode
          ? convertedSourceMode
          : source.sourceMode,
        convertedLegacyBody,
        convertedSectionId,
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
      .eq("tenant_id", tenantId)
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

    const liveSync = await syncLiveRows(supabase, tenantId, row.id, sourceRows);
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

    const effectiveSourceMode =
      convertedLegacyBody && convertedSourceMode
        ? convertedSourceMode
        : source.sourceMode;

    await writeAuditRow(supabase, {
      tenant_id: tenantId,
      actor_profile_id: null,
      actor_role: "system",
      action: `agency.site_admin.snapshot_backfill.${kind}`,
      target_type: "cms_pages",
      target_id: row.id,
      severity: "info",
      reason: "published_snapshot_backfill",
      metadata: {
        source_mode: effectiveSourceMode,
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
      sourceMode: effectiveSourceMode,
      convertedLegacyBody,
      convertedSectionId,
      sectionCount: built.snapshot.slots.length,
      writeColumn,
      nextVersion,
    });
  }

  return {
    tenantId,
    locale: args.locale ?? null,
    dryRun: !args.apply,
    scannedPublishedRows: (allRows ?? []).length,
    candidates: candidates.length,
    applied,
    skipped,
    failed,
    results,
  };
}

async function tryConvertLegacyBodyToSection(supabase, tenantId, pageRow) {
  const rawBody = typeof pageRow.body === "string" ? pageRow.body : "";
  const body = rawBody.trim();
  if (!body) return { ok: false, reason: "no_body_to_convert" };

  const sectionName = `${pageRow.title} — migrated body`;
  const blogProps = {
    category: undefined,
    date: undefined,
    title: pageRow.title,
    byline: undefined,
    heroImageUrl: undefined,
    heroImageAlt: undefined,
    body,
    pullQuote: undefined,
    presentation: {},
  };

  const { data: section, error: secErr } = await supabase
    .from("cms_sections")
    .insert({
      tenant_id: tenantId,
      section_type_key: "blog_detail",
      name: sectionName,
      props_jsonb: blogProps,
      status: "published",
      schema_version: 1,
      version: 1,
      created_by: null,
      updated_by: null,
    })
    .select("id")
    .single();
  if (secErr || !section) {
    return { ok: false, reason: `section_create_failed:${secErr?.message ?? "unknown"}` };
  }

  const inserted = {
    section_id: section.id,
    slot_key: "body",
    sort_order: 0,
  };
  return {
    ok: true,
    rows: [inserted],
    createdSectionId: section.id,
    sourceMode: "converted_legacy_body",
  };
}

async function tryConvertLegacyStandardTitleToSection(supabase, tenantId, pageRow) {
  const headline =
    typeof pageRow.title === "string" ? pageRow.title.trim() : "";
  if (!headline) return { ok: false, reason: "no_standard_title_to_convert" };

  const subheadline =
    typeof pageRow.meta_description === "string" &&
    pageRow.meta_description.trim().length > 0
      ? pageRow.meta_description.trim().slice(0, 240)
      : undefined;

  const heroProps = {
    headline,
    subheadline,
    primaryCta: undefined,
    secondaryCta: undefined,
    backgroundMediaAssetId: undefined,
    overlay: "gradient-scrim",
    mood: "editorial",
    slides: undefined,
    autoplayMs: undefined,
    presentation: {},
  };

  const sectionName = `${headline} — migrated page hero`;
  const { data: section, error: secErr } = await supabase
    .from("cms_sections")
    .insert({
      tenant_id: tenantId,
      section_type_key: "hero",
      name: sectionName,
      props_jsonb: heroProps,
      status: "published",
      schema_version: 1,
      version: 1,
      created_by: null,
      updated_by: null,
    })
    .select("id")
    .single();
  if (secErr || !section) {
    return {
      ok: false,
      reason: `standard_title_section_create_failed:${secErr?.message ?? "unknown"}`,
    };
  }

  return {
    ok: true,
    rows: [
      {
        section_id: section.id,
        slot_key: "hero",
        sort_order: 0,
      },
    ],
    createdSectionId: section.id,
    sourceMode: "converted_legacy_standard_title",
  };
}

async function tryConvertLegacyHomepageToSection(supabase, tenantId, pageRow) {
  const headline =
    typeof pageRow.title === "string" ? pageRow.title.trim() : "";
  if (!headline) return { ok: false, reason: "no_homepage_title_to_convert" };

  const subheadline =
    typeof pageRow.meta_description === "string" &&
    pageRow.meta_description.trim().length > 0
      ? pageRow.meta_description.trim().slice(0, 240)
      : undefined;

  const heroProps = {
    headline,
    subheadline,
    primaryCta: undefined,
    secondaryCta: undefined,
    backgroundMediaAssetId: undefined,
    overlay: "gradient-scrim",
    mood: "editorial",
    slides: undefined,
    autoplayMs: undefined,
    presentation: {},
  };

  const sectionName = `${headline} — migrated homepage hero`;
  const { data: section, error: secErr } = await supabase
    .from("cms_sections")
    .insert({
      tenant_id: tenantId,
      section_type_key: "hero",
      name: sectionName,
      props_jsonb: heroProps,
      status: "published",
      schema_version: 1,
      version: 1,
      created_by: null,
      updated_by: null,
    })
    .select("id")
    .single();
  if (secErr || !section) {
    return {
      ok: false,
      reason: `homepage_section_create_failed:${secErr?.message ?? "unknown"}`,
    };
  }

  return {
    ok: true,
    rows: [
      {
        section_id: section.id,
        slot_key: "hero",
        sort_order: 0,
      },
    ],
    createdSectionId: section.id,
    sourceMode: "converted_legacy_homepage",
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in env.");
    process.exit(1);
  }

  const supabase = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const targetTenants = await loadTargetTenants(supabase, args);
  const summaries = [];
  let totals = {
    scannedPublishedRows: 0,
    candidates: 0,
    applied: 0,
    skipped: 0,
    failed: 0,
  };

  for (const tenantId of targetTenants) {
    summaries.push(await backfillTenant(supabase, tenantId, args));
  }

  for (const summary of summaries) {
    totals.scannedPublishedRows += summary.scannedPublishedRows;
    totals.candidates += summary.candidates;
    totals.applied += summary.applied;
    totals.skipped += summary.skipped;
    totals.failed += summary.failed;
  }

  const output = {
    mode: args.allActive ? "all-active" : "single-tenant",
    tenantCount: targetTenants.length,
    locale: args.locale ?? null,
    dryRun: !args.apply,
    totals,
    summaries,
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
