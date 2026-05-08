#!/usr/bin/env -S tsx
/**
 * Phase 3.5 — hard verification gate for published snapshot coverage.
 *
 * Reports any published builder-owned page missing snapshot payload:
 *   - homepage rows -> published_homepage_snapshot
 *   - standard pages -> published_page_snapshot
 *   - site shell rows -> published_page_snapshot
 *
 * Exits non-zero when any gaps are found.
 *
 * Usage:
 *   tsx --env-file=.env.local scripts/verify-published-page-snapshots.ts --all-active
 *   tsx --env-file=.env.local scripts/verify-published-page-snapshots.ts --tenant <tenant-uuid>
 */

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  validateBuilderNodeTree,
  type BuilderNodeValidationIssue,
} from "../src/lib/site-admin/builder-node/validate";
import {
  builderSectionNodeAddressKey,
  indexBuilderSectionNodeIds,
} from "../src/lib/site-admin/builder-node/snapshot-tree";
import type { BuilderNodeTree } from "../src/lib/site-admin/builder-node/types";

interface CliArgs {
  tenant: string | null;
  locale: string | null;
  allActive: boolean;
  requireBuilderTree: boolean;
}

interface CmsPageRow {
  id: string;
  tenant_id: string;
  locale: string;
  slug: string | null;
  title: string;
  status: "draft" | "published" | "archived";
  system_template_key: string | null;
  published_homepage_snapshot: unknown;
  published_page_snapshot: unknown;
}

type SnapshotPageKind = "homepage" | "site_shell" | "standard_page";

interface MissingSnapshotRow {
  pageId: string;
  locale: string;
  slug: string | null;
  title: string;
  kind: SnapshotPageKind;
  expectedColumn: "published_homepage_snapshot" | "published_page_snapshot";
}

interface BuilderTreeGapRow {
  pageId: string;
  locale: string;
  slug: string | null;
  title: string;
  kind: SnapshotPageKind;
}

interface InvalidBuilderTreeRow extends BuilderTreeGapRow {
  issues: ReadonlyArray<BuilderNodeValidationIssue>;
}

interface BuilderTreeAlignmentRow extends BuilderTreeGapRow {
  issues: string[];
}

interface MalformedSnapshotRow extends BuilderTreeGapRow {
  issues: string[];
}

interface TenantVerificationResult {
  ok: true;
  tenantId: string;
  scannedPublishedRows: number;
  missing: MissingSnapshotRow[];
  missingBuilderTree: BuilderTreeGapRow[];
  malformedSnapshot: MalformedSnapshotRow[];
  invalidBuilderTree: InvalidBuilderTreeRow[];
  misalignedBuilderTree: BuilderTreeAlignmentRow[];
}

const LEGACY_SEED_NON_RFC_SECTION_ID_PAGE_IDS = new Set<string>([
  // Seeded QA page with deterministic section ids that predate strict UUID
  // variant enforcement in BuilderNode validation.
  "b4e8f2a1-0000-0000-0000-000000000001",
]);

function parseArgs(argv: string[]): CliArgs {
  const out: CliArgs = {
    tenant: null,
    locale: null,
    allActive: false,
    requireBuilderTree: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--tenant") {
      out.tenant = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg === "--locale") {
      out.locale = argv[i + 1] ?? null;
      i += 1;
      continue;
    }
    if (arg === "--all-active") {
      out.allActive = true;
      continue;
    }
    if (arg === "--require-builder-tree") {
      out.requireBuilderTree = true;
      continue;
    }
  }
  return out;
}

function inferKind(row: CmsPageRow): SnapshotPageKind {
  if (row.system_template_key === "homepage") return "homepage";
  if (row.system_template_key === "site_shell") return "site_shell";
  return "standard_page";
}

function snapshotFromRow(row: CmsPageRow): unknown {
  return inferKind(row) === "homepage"
    ? row.published_homepage_snapshot
    : row.published_page_snapshot;
}

function isSnapshotMissing(row: CmsPageRow): boolean {
  const kind = inferKind(row);
  if (kind === "homepage") return row.published_homepage_snapshot == null;
  return row.published_page_snapshot == null;
}

function isBuilderTreeMissing(row: CmsPageRow): boolean {
  const snapshot = snapshotFromRow(row);
  if (!snapshot || typeof snapshot !== "object") return false;
  const candidate = snapshot as { builderTree?: unknown };
  return candidate.builderTree == null;
}

function findMalformedSnapshot(row: CmsPageRow): MalformedSnapshotRow | null {
  const snapshot = snapshotFromRow(row);
  if (!snapshot || typeof snapshot !== "object") return null;
  const candidate = snapshot as {
    version?: unknown;
    publishedAt?: unknown;
    pageVersion?: unknown;
    locale?: unknown;
    templateSchemaVersion?: unknown;
    fields?: unknown;
    slots?: unknown;
  };

  const issues: string[] = [];
  if (candidate.version !== 1) {
    issues.push(`snapshot.version must be 1 (received ${String(candidate.version)})`);
  }
  if (
    typeof candidate.publishedAt !== "string" ||
    candidate.publishedAt.trim().length === 0
  ) {
    issues.push("snapshot.publishedAt must be a non-empty string");
  }
  if (typeof candidate.pageVersion !== "number" || !Number.isFinite(candidate.pageVersion)) {
    issues.push("snapshot.pageVersion must be a finite number");
  }
  if (typeof candidate.locale !== "string" || candidate.locale.trim().length === 0) {
    issues.push("snapshot.locale must be a non-empty string");
  }
  if (
    typeof candidate.templateSchemaVersion !== "number" ||
    !Number.isFinite(candidate.templateSchemaVersion)
  ) {
    issues.push("snapshot.templateSchemaVersion must be a finite number");
  }
  if (!candidate.fields || typeof candidate.fields !== "object" || Array.isArray(candidate.fields)) {
    issues.push("snapshot.fields must be an object");
  }
  if (!Array.isArray(candidate.slots)) {
    issues.push("snapshot.slots must be an array");
  }
  if (issues.length === 0) return null;

  return {
    pageId: row.id,
    locale: row.locale,
    slug: row.slug,
    title: row.title,
    kind: inferKind(row),
    issues,
  };
}

function findInvalidBuilderTree(row: CmsPageRow): InvalidBuilderTreeRow | null {
  const snapshot = snapshotFromRow(row);
  if (!snapshot || typeof snapshot !== "object") return null;
  const candidate = snapshot as { builderTree?: unknown };
  if (candidate.builderTree == null) return null;

  const validated = validateBuilderNodeTree(candidate.builderTree);
  if (validated.ok) return null;

  const issues = validated.issues.filter((issue) => {
    if (
      LEGACY_SEED_NON_RFC_SECTION_ID_PAGE_IDS.has(row.id) &&
      issue.path.endsWith(".props") &&
      issue.message.includes("sectionId: Invalid UUID")
    ) {
      return false;
    }
    return true;
  });
  if (issues.length === 0) return null;

  return {
    pageId: row.id,
    locale: row.locale,
    slug: row.slug,
    title: row.title,
    kind: inferKind(row),
    issues,
  };
}

function findBuilderTreeAlignmentGap(row: CmsPageRow): BuilderTreeAlignmentRow | null {
  const snapshot = snapshotFromRow(row);
  if (!snapshot || typeof snapshot !== "object") return null;
  const candidate = snapshot as { builderTree?: unknown; slots?: unknown };
  if (!Array.isArray(candidate.slots) || candidate.builderTree == null) return null;

  const validated = validateBuilderNodeTree(candidate.builderTree);
  if (!validated.ok) return null;

  const tree = validated.tree as BuilderNodeTree;
  const sectionIndex = indexBuilderSectionNodeIds(tree);
  const actual = new Set<string>(sectionIndex.keys());
  const expected = new Set<string>();

  for (const rawSlot of candidate.slots) {
    if (!rawSlot || typeof rawSlot !== "object") continue;
    const slot = rawSlot as {
      sectionId?: unknown;
      slotKey?: unknown;
      sortOrder?: unknown;
    };
    if (
      typeof slot.sectionId !== "string" ||
      typeof slot.slotKey !== "string" ||
      typeof slot.sortOrder !== "number"
    ) {
      continue;
    }
    const key = builderSectionNodeAddressKey({
      sectionId: slot.sectionId,
      slotKey: slot.slotKey,
      sortOrder: slot.sortOrder,
    });
    if (key) expected.add(key);
  }

  const issues: string[] = [];
  for (const key of expected) {
    if (!actual.has(key)) {
      issues.push(`missing section node for composition slot "${key}"`);
    }
  }
  for (const [key, nodeId] of sectionIndex.entries()) {
    if (!expected.has(key)) {
      issues.push(`section node "${nodeId}" has no matching composition slot`);
    }
  }
  if (issues.length === 0) return null;

  return {
    pageId: row.id,
    locale: row.locale,
    slug: row.slug,
    title: row.title,
    kind: inferKind(row),
    issues,
  };
}

async function loadTargetTenants(
  supabase: SupabaseClient,
  args: CliArgs,
): Promise<string[]> {
  if (args.tenant) return [args.tenant];
  if (!args.allActive) {
    console.error(
      "Usage: --tenant <tenant-uuid> [--locale <locale>] OR --all-active [--locale <locale>]",
    );
    process.exit(1);
  }

  const { data, error } = await supabase
    .from("agencies")
    .select("id")
    .not("status", "in", "(cancelled,archived)");
  if (error) {
    console.error(`Couldn't load active tenants: ${error.message}`);
    process.exit(1);
  }
  return ((data ?? []) as Array<{ id: string }>).map((row) => row.id);
}

async function verifyTenant(
  supabase: SupabaseClient,
  tenantId: string,
  locale: string | null,
): Promise<TenantVerificationResult | { ok: false; error: string }> {
  const query = supabase
    .from("cms_pages")
    .select(
      "id, tenant_id, locale, slug, title, status, system_template_key, published_homepage_snapshot, published_page_snapshot",
    )
    .eq("tenant_id", tenantId)
    .eq("status", "published")
    .order("locale", { ascending: true })
    .order("title", { ascending: true });

  if (locale) query.eq("locale", locale);

  const { data, error } = await query;
  if (error) {
    return { ok: false, error: error.message };
  }

  const rows = (data ?? []) as CmsPageRow[];
  const missing = rows
    .filter(isSnapshotMissing)
    .map((row): MissingSnapshotRow => ({
      pageId: row.id,
      locale: row.locale,
      slug: row.slug,
      title: row.title,
      kind: inferKind(row),
      expectedColumn:
        inferKind(row) === "homepage"
          ? "published_homepage_snapshot"
          : "published_page_snapshot",
    }));

  const missingBuilderTree = rows
    .filter(isBuilderTreeMissing)
    .map((row): BuilderTreeGapRow => ({
      pageId: row.id,
      locale: row.locale,
      slug: row.slug,
      title: row.title,
      kind: inferKind(row),
    }));
  const malformedSnapshot = rows
    .map(findMalformedSnapshot)
    .filter((row): row is MalformedSnapshotRow => row !== null);

  const invalidBuilderTree = rows
    .map(findInvalidBuilderTree)
    .filter((row): row is InvalidBuilderTreeRow => row !== null);
  const misalignedBuilderTree = rows
    .map(findBuilderTreeAlignmentGap)
    .filter((row): row is BuilderTreeAlignmentRow => row !== null);

  return {
    ok: true,
    tenantId,
    scannedPublishedRows: rows.length,
    missing,
    missingBuilderTree,
    malformedSnapshot,
    invalidBuilderTree,
    misalignedBuilderTree,
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
  const tenants = await loadTargetTenants(supabase, args);

  const summaries: TenantVerificationResult[] = [];
  let scannedPublishedRows = 0;
  let totalMissing = 0;
  let totalMissingBuilderTree = 0;
  let totalMalformedSnapshot = 0;
  let totalInvalidBuilderTree = 0;
  let totalMisalignedBuilderTree = 0;

  for (const tenantId of tenants) {
    const result = await verifyTenant(supabase, tenantId, args.locale);
    if (!result.ok) {
      console.error(`[snapshot-gate] tenant ${tenantId}: ${result.error}`);
      process.exit(1);
    }
    scannedPublishedRows += result.scannedPublishedRows;
    totalMissing += result.missing.length;
    totalMissingBuilderTree += result.missingBuilderTree.length;
    totalMalformedSnapshot += result.malformedSnapshot.length;
    totalInvalidBuilderTree += result.invalidBuilderTree.length;
    totalMisalignedBuilderTree += result.misalignedBuilderTree.length;
    summaries.push(result);
  }

  const output = {
    mode: args.allActive ? "all-active" : "single-tenant",
    tenantCount: tenants.length,
    locale: args.locale ?? null,
    requireBuilderTree: args.requireBuilderTree,
    scannedPublishedRows,
    totalMissing,
    totalMissingBuilderTree,
    totalMalformedSnapshot,
    totalInvalidBuilderTree,
    totalMisalignedBuilderTree,
    summaries,
  };

  console.log(JSON.stringify(output, null, 2));

  if (
    totalMissing > 0 ||
    (args.requireBuilderTree &&
      (totalMissingBuilderTree > 0 ||
        totalMalformedSnapshot > 0 ||
        totalInvalidBuilderTree > 0 ||
        totalMisalignedBuilderTree > 0))
  ) {
    process.exit(2);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
