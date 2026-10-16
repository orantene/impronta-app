import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { BUILTIN_DESIGNS, BUILTIN_LOOKS } from "./builtins";
import type { BuiltinDesignEntry, BuiltinLookEntry } from "./builtins/types";
import { MAISON_BUILTIN_DESIGN, MAISON_BUILTIN_LOOKS } from "./maison/builtins";
import { COLLECTION_DESIGNS } from "./collection/designs";
import { FOLIO_BUILTIN_LOOKS } from "./collection/folio-looks";
import { GRIDLINE_BUILTIN_LOOKS } from "./collection/gridline-looks";
import { TALENT_THEME_SCHEMA_VERSION, type DesignPayload, type TalentThemeKind } from "./types";
import { validateDesign, validateLook } from "./validate";
import { createDraftRelease, shouldCreateDraftRelease } from "../theme-releases/releases.server";
import { generateReleaseItems } from "../theme-releases/release-notes";
import type { ReleaseItem, ReleaseNotes } from "../theme-releases/types";
import { writeThemeVersionSnapshots } from "../theme-releases/theme-versions.server";
import { decideAuthoredSync, type SnapshotMeta } from "./authored-sync-rule";
import { catalogDriftVersion } from "./catalog-version-drift";
import { authoredOverlayVersion } from "./collection/authored";

/**
 * Talent theme gallery: BUILT-IN SYNC. Code (`./builtins`) → published
 * `talent_theme_catalog` rows, upserted on the table's own
 * `talent_theme_catalog_kind_slug_key` unique index (`kind, slug`).
 *
 * INVOCATION — there is no deploy/boot hook for this table today. The one
 * precedent, `syncBuiltinLooks` (`site_looks`, a sibling built-in-sync for
 * the AGENCY-side Look registry), is likewise NOT run on deploy/boot: it is
 * wired to a manual "Sync built-in looks" button a platform admin clicks
 * (`app/(workspace)/platform/admin/builder-lab/looks/actions.ts` →
 * `actionSyncBuiltinLooks`, gated by `isPlatformAdmin`). There is no cron
 * either. `syncBuiltinTalentThemes` mirrors that shape (a plain
 * `(admin, userId) => result` function a "use server" action can call), but
 * wiring an equivalent admin button/action is left to whoever owns the
 * platform-admin shell — this phase's file scope is `theme-catalog/**`, and
 * the gallery UI (theme-gallery/**, template-preview/**) is owned by a
 * concurrent agent. `load-catalog.server.ts`'s built-in fallback means the
 * gallery works correctly even before the first sync ever runs.
 *
 * VERSION discipline: `version` tracks the PAYLOAD (the thing a
 * `talent_sites.theme_design_version` pin cares about), not metadata. A
 * title/summary/tag/tier/sort_order edit updates the row every sync (code is
 * the source of truth) but does NOT bump `version` — only a payload content
 * change does, decided by comparing `hashBuiltinPayload(new)` against the
 * hash of the row's STORED payload (there is no separate hash column; the
 * stored payload IS the previous hash's input, so this is exact and needs no
 * extra column). `schema_version` always writes the current in-code
 * `TALENT_THEME_SCHEMA_VERSION`, independent of the hash.
 *
 * `source = 'authored'` rows are NEVER upserted here, even when their slug
 * collides with a built-in's (kind, slug) — `planBuiltinSync` routes those
 * into `skippedAuthored` instead of the upsert list.
 */

export type BuiltinThemeEntry = BuiltinDesignEntry | BuiltinLookEntry;

/** Deterministic (key-order-independent) JSON serialization for hashing. */
function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    // Undefined-valued keys vanish in a jsonb round trip; hash them as absent
    // or a stored payload never equals the freshly built one (spurious bump).
    const keys = Object.keys(record)
      .filter((k) => record[k] !== undefined)
      .sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`).join(",")}}`;
  }
  // undefined / functions inside arrays become null (as JSON does); NaN too.
  return JSON.stringify(value) ?? "null";
}

/** Stable sha256 of a Design/Look payload. Same payload in → same hash out, key order irrelevant. */
export function hashBuiltinPayload(payload: unknown): string {
  return createHash("sha256").update(stableStringify(payload)).digest("hex");
}

export interface ExistingBuiltinRow {
  kind: TalentThemeKind;
  slug: string;
  version: number;
  payload: unknown;
  source: "builtin" | "authored";
}

export interface BuiltinUpsertRow {
  kind: TalentThemeKind;
  slug: string;
  title: string;
  summary: string;
  category: string | null;
  tags: string[];
  for_design: string | null;
  payload: unknown;
  preview: unknown;
  required_talent_tier: string;
  status: "published";
  source: "builtin";
  version: number;
  schema_version: number;
  sort_order: number;
  is_new_until: string | null;
  updated_by: string | null;
}

/** Stored history of one Design: insert-only snapshots + released to-versions. */
export interface DesignSnapshot {
  version: number;
  payload: unknown;
  /** 'sync' | 'authored' | ... ; absent on old reads. */
  source?: string | null;
  meta?: SnapshotMeta | null;
}

export interface DesignHistory {
  snapshots: ReadonlyArray<DesignSnapshot>;
  releaseToVersions: ReadonlyArray<number>;
}

/** A design payload change that needs a snapshot and (maybe) a draft release. */
export interface DesignChange {
  slug: string;
  fromVersion: number;
  toVersion: number;
  /** Payload at fromVersion (the latest known one, not the lagging catalog row). */
  basePayload: unknown;
}

/** Highest version the design has EVER had: catalog row, snapshots, releases. */
export function highestKnownVersion(catalogVersion: number, history: DesignHistory | undefined): number {
  let max = catalogVersion;
  for (const s of history?.snapshots ?? []) if (s.version > max) max = s.version;
  for (const v of history?.releaseToVersions ?? []) if (v > max) max = v;
  return max;
}

/** The newest payload on record (catalog row wins a version tie). */
export function latestDesignState(
  prior: { version: number; payload: unknown },
  history: DesignHistory | undefined,
): DesignSnapshot {
  let best: DesignSnapshot = { version: prior.version, payload: prior.payload, source: null, meta: null };
  for (const s of history?.snapshots ?? []) if (s.version > best.version) best = s;
  return best;
}

export interface AuthoredPendingDesign {
  slug: string;
  /** The authored snapshot version the code has not reflected yet. */
  version: number;
}

export interface BuiltinSyncPlan {
  upserts: BuiltinUpsertRow[];
  /** Design payload changes (snapshot + draft release), one per changed design. */
  designChanges: DesignChange[];
  /** (kind, slug) pairs a built-in wanted to write but an authored row already owns. */
  skippedAuthored: Array<{ kind: TalentThemeKind; slug: string }>;
  /** Designs whose latest snapshot is editor-authored and not yet in code: skipped. */
  authoredPending: AuthoredPendingDesign[];
  /** Subset of authoredPending where the code also moved since the editor's base. */
  authoredConflict: AuthoredPendingDesign[];
  /** `kind:slug` keys whose row carried the latest payload under a stale version number. */
  driftFixes: ReadonlySet<string>;
  created: number;
  updated: number;
  unchanged: number;
}

/**
 * PURE decision: which rows to upsert, at which version, and which built-in
 * (kind, slug) pairs are shadowed by an authored row and must not be
 * touched. Built from already-computed `{ entry, payload }` pairs (not
 * `BuiltinThemeEntry[]` directly) so a caller — and `sync-builtins.test.ts`
 * — controls exactly what "the payload" is without needing a live section
 * kit / theme-preset registry.
 */
export function planBuiltinSync(
  built: ReadonlyArray<{ entry: BuiltinThemeEntry; payload: unknown }>,
  existing: readonly ExistingBuiltinRow[],
  userId: string | null = null,
  history: ReadonlyMap<string, DesignHistory> = new Map(),
  overlayVersionOf: (slug: string) => number = authoredOverlayVersion,
): BuiltinSyncPlan {
  const bySlug = new Map(existing.map((row) => [`${row.kind}:${row.slug}`, row]));
  const upserts: BuiltinUpsertRow[] = [];
  const skippedAuthored: BuiltinSyncPlan["skippedAuthored"] = [];
  const designChanges: DesignChange[] = [];
  const authoredPending: AuthoredPendingDesign[] = [];
  const authoredConflict: AuthoredPendingDesign[] = [];
  const driftFixes = new Set<string>();
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const { entry, payload } of built) {
    const key = `${entry.kind}:${entry.slug}`;
    const prior = bySlug.get(key);
    if (prior && prior.source === "authored") {
      skippedAuthored.push({ kind: entry.kind, slug: entry.slug });
      continue;
    }

    const newHash = hashBuiltinPayload(payload);
    let version = 1;
    if (prior && entry.kind === "design") {
      // A gated sync leaves the catalog row behind, so the truth is the
      // newest snapshot, not the row. Same payload as that = nothing to do.
      const h = history.get(entry.slug);
      const latest = latestDesignState(prior, h);
      const decision = decideAuthoredSync({
        codeHash: newHash,
        latestHash: hashBuiltinPayload(latest.payload),
        latest,
        overlayVersion: overlayVersionOf(entry.slug),
      });
      if (decision.kind === "authored_pending") {
        // Editor work the code does not include yet: never revert it.
        const pending = { slug: entry.slug, version: decision.latestVersion };
        authoredPending.push(pending);
        if (decision.conflict) authoredConflict.push(pending);
        continue;
      }
      if (decision.kind === "unchanged") {
        unchanged += 1;
        if (latest.version > prior.version) {
          // Held state (row carries an older payload): no write. Version-only drift
          // (row already carries the latest payload): write the number the payload is.
          const fixed = catalogDriftVersion({
            priorVersion: prior.version,
            priorHash: hashBuiltinPayload(prior.payload),
            latestVersion: latest.version,
            latestHash: hashBuiltinPayload(latest.payload),
          });
          if (fixed === null) continue;
          version = fixed;
          driftFixes.add(key);
        } else {
          version = prior.version;
        }
      } else {
        version = highestKnownVersion(prior.version, h) + 1;
        updated += 1;
        designChanges.push({
          slug: entry.slug,
          fromVersion: latest.version,
          toVersion: version,
          basePayload: latest.payload,
        });
      }
    } else if (prior) {
      const priorHash = hashBuiltinPayload(prior.payload);
      version = priorHash === newHash ? prior.version : prior.version + 1;
      if (priorHash === newHash) unchanged += 1;
      else updated += 1;
    } else {
      created += 1;
    }

    const forDesign =
      entry.kind === "look" && "for_design" in entry && typeof entry.for_design === "string"
        ? entry.for_design
        : null;

    upserts.push({
      kind: entry.kind,
      slug: entry.slug,
      title: entry.title,
      summary: entry.summary,
      category: entry.category,
      tags: entry.tags,
      for_design: forDesign,
      payload,
      preview: entry.preview,
      required_talent_tier: entry.required_talent_tier,
      status: "published",
      source: "builtin",
      version,
      schema_version: TALENT_THEME_SCHEMA_VERSION,
      sort_order: entry.sort_order,
      is_new_until: entry.is_new_until,
      updated_by: userId,
    });
  }

  return { upserts, designChanges, skippedAuthored, authoredPending, authoredConflict, driftFixes, created, updated, unchanged };
}

export interface ReleaseDraftCandidate {
  kind: TalentThemeKind;
  slug: string;
  version: number;
  /** Stored version before this sync, or null when the row is new. */
  priorVersion: number | null;
}

/**
 * Pure: which DESIGN rows need a DRAFT release row. Only designs whose
 * version moved past an existing prior version; `existing` holds
 * `${slug}:${toVersion}` keys already released (idempotence).
 */
export function planReleaseDrafts(
  candidates: ReleaseDraftCandidate[],
  existing: ReadonlySet<string>,
): Array<{ designSlug: string; fromVersion: number; toVersion: number }> {
  return candidates
    .filter(
      (c) =>
        c.kind === "design" &&
        c.priorVersion !== null &&
        c.version > c.priorVersion &&
        !existing.has(`${c.slug}:${c.version}`),
    )
    .map((c) => ({
      designSlug: c.slug,
      fromVersion: c.priorVersion as number,
      toVersion: c.version,
    }));
}

function validateEntry(entry: BuiltinThemeEntry, payload: unknown): string[] {
  const check = entry.kind === "design" ? validateDesign(payload) : validateLook(payload);
  return check.ok ? [] : check.errors.map((e) => `${entry.kind}:${entry.slug} — ${e}`);
}

export interface SyncBuiltinOptions {
  /**
   * Old behaviour: a design version bump also overwrites its catalog row.
   * Default (false): the bump is HELD BACK. The snapshot + draft release are
   * written, the catalog row stays at its current version, and the release
   * manager's "Make default" step flips it. New applies keep getting the
   * version production code understands until then.
   */
  flipCatalog?: boolean;
}

/**
 * PURE: split the planned upserts into what may touch the catalog now and the
 * design version bumps that wait for "Make default". Only a design that
 * ALREADY has a row and whose version moved is held; new rows, metadata-only
 * refreshes (same version) and looks always write.
 */
export function splitGatedUpserts<T extends { kind: TalentThemeKind; slug: string; version: number }>(
  upserts: readonly T[],
  priorVersions: ReadonlyMap<string, number>,
  flipCatalog: boolean,
  /** Version-only drift fixes (`kind:slug`): the payload is already in the row, so never held. */
  exempt: ReadonlySet<string> = new Set(),
): { catalogUpserts: T[]; held: T[] } {
  if (flipCatalog) return { catalogUpserts: [...upserts], held: [] };
  const held: T[] = [];
  const catalogUpserts: T[] = [];
  for (const u of upserts) {
    const prior = priorVersions.get(`${u.kind}:${u.slug}`);
    if (u.kind === "design" && prior !== undefined && u.version > prior && !exempt.has(`${u.kind}:${u.slug}`)) held.push(u);
    else catalogUpserts.push(u);
  }
  return { catalogUpserts, held };
}

const MISSING_TABLE_CODES = new Set(["42P01", "PGRST205"]);
/** Undefined column (the `meta` migration may not be applied yet). */
const MISSING_COLUMN_CODES = new Set(["42703", "PGRST204"]);

type SnapshotRow = { design: string; version: number; payload: unknown; source?: string | null; meta?: unknown };

/** Snapshots with `source` + `meta`; retries without `meta` when that column is absent. */
async function selectSnapshotsWithMeta(
  admin: SupabaseClient,
  slugs: string[],
): Promise<{ rows: SnapshotRow[]; error: { code?: string; message: string } | null }> {
  const full = await admin.from("talent_theme_versions").select("design, version, payload, source, meta").in("design", slugs);
  if (!full.error) return { rows: (full.data ?? []) as SnapshotRow[], error: null };
  if (!(full.error.code && MISSING_COLUMN_CODES.has(full.error.code))) return { rows: [], error: full.error };
  const lean = await admin.from("talent_theme_versions").select("design, version, payload, source").in("design", slugs);
  return { rows: (lean.data ?? []) as SnapshotRow[], error: lean.error };
}

/** Read-only: snapshots + released to-versions per design. Missing tables read as empty. */
async function loadDesignHistories(
  admin: SupabaseClient,
  slugs: string[],
): Promise<Map<string, DesignHistory>> {
  const out = new Map<string, { snapshots: DesignSnapshot[]; releaseToVersions: number[] }>();
  const slot = (slug: string) => {
    let h = out.get(slug);
    if (!h) out.set(slug, (h = { snapshots: [], releaseToVersions: [] }));
    return h;
  };
  const snaps = await selectSnapshotsWithMeta(admin, slugs);
  if (snaps.error) {
    if (!(snaps.error.code && MISSING_TABLE_CODES.has(snaps.error.code))) {
      logServerError("talentTheme.syncBuiltins.history", snaps.error);
    }
  } else {
    for (const r of snaps.rows) {
      slot(r.design).snapshots.push({
        version: r.version,
        payload: r.payload,
        source: r.source ?? null,
        meta: r.meta && typeof r.meta === "object" ? (r.meta as SnapshotMeta) : null,
      });
    }
  }
  const rels = await admin.from("talent_theme_releases").select("design_slug, to_version").in("design_slug", slugs);
  if (rels.error) {
    if (!(rels.error.code && MISSING_TABLE_CODES.has(rels.error.code))) {
      logServerError("talentTheme.syncBuiltins.history", rels.error);
    }
  } else {
    for (const r of (rels.data ?? []) as Array<{ design_slug: string; to_version: number }>) {
      slot(r.design_slug).releaseToVersions.push(r.to_version);
    }
  }
  return out;
}

export type SyncBuiltinTalentThemesResult =
  | {
      ok: true;
      created: number;
      updated: number;
      unchanged: number;
      skippedAuthored: Array<{ kind: TalentThemeKind; slug: string }>;
      /** Designs skipped because editor-authored work is not in code yet. */
      authoredPending: AuthoredPendingDesign[];
      authoredConflict: AuthoredPendingDesign[];
      /** `slug@version` design bumps written as snapshot + draft release only. */
      heldBack?: string[];
    }
  | { ok: false; error: string };

/**
 * Sync every built-in Design + Look into `talent_theme_catalog`. Builds each
 * entry's payload fresh from code, refuses to write ANY row if one built-in
 * fails its own validator (a code bug must fail loudly, not publish a broken
 * theme), then upserts on `(kind, slug)` per `planBuiltinSync`'s decision.
 */
export async function syncBuiltinTalentThemes(
  admin: SupabaseClient,
  userId: string | null = null,
  options: SyncBuiltinOptions = {},
): Promise<SyncBuiltinTalentThemesResult> {
  // Maison Design + scoped Looks sync even while the flag is off so rows are
  // ready when the owner flips TALENT_MAISON_THEME_ENABLED. loadTalentThemeCatalog
  // still hides them until the flag is on.
  const entries: BuiltinThemeEntry[] = [
    ...BUILTIN_DESIGNS,
    MAISON_BUILTIN_DESIGN,
    ...COLLECTION_DESIGNS,
    ...BUILTIN_LOOKS,
    ...MAISON_BUILTIN_LOOKS,
    ...FOLIO_BUILTIN_LOOKS,
    ...GRIDLINE_BUILTIN_LOOKS,
  ];
  const built = entries.map((entry) => ({ entry, payload: entry.buildPayload() }));

  const errors = built.flatMap(({ entry, payload }) => validateEntry(entry, payload));
  if (errors.length > 0) {
    logServerError("talentTheme.syncBuiltins.invalid", { errors });
    return { ok: false, error: errors.slice(0, 8).join(" · ") };
  }

  const { data, error } = await admin
    .from("talent_theme_catalog")
    .select("kind, slug, version, payload, source")
    .in(
      "kind",
      Array.from(new Set(entries.map((e) => e.kind))),
    );
  if (error) {
    logServerError("talentTheme.syncBuiltins.read", error);
    return { ok: false, error: error.message };
  }

  const history = await loadDesignHistories(
    admin,
    entries.filter((e) => e.kind === "design").map((e) => e.slug),
  );
  const plan = planBuiltinSync(built, (data ?? []) as ExistingBuiltinRow[], userId, history);
  if (plan.skippedAuthored.length > 0) {
    logServerError("talentTheme.syncBuiltins.authoredShadowed", {
      skipped: plan.skippedAuthored,
    });
  }
  if (plan.authoredPending.length > 0) {
    logServerError("talentTheme.syncBuiltins.authoredPending", {
      pending: plan.authoredPending,
      conflict: plan.authoredConflict,
    });
  }
  if (plan.upserts.length === 0) {
    return {
      ok: true,
      created: plan.created,
      updated: plan.updated,
      unchanged: plan.unchanged,
      skippedAuthored: plan.skippedAuthored,
      authoredPending: plan.authoredPending,
      authoredConflict: plan.authoredConflict,
    };
  }

  const priorVersions = new Map(
    ((data ?? []) as ExistingBuiltinRow[]).map((r) => [`${r.kind}:${r.slug}`, r.version]),
  );
  const { catalogUpserts, held } = splitGatedUpserts(
    plan.upserts,
    priorVersions,
    options.flipCatalog === true,
    plan.driftFixes,
  );
  if (catalogUpserts.length > 0) {
    const { error: writeErr } = await admin
      .from("talent_theme_catalog")
      .upsert(catalogUpserts as never, { onConflict: "kind,slug" });
    if (writeErr) {
      logServerError("talentTheme.syncBuiltins.write", writeErr);
      return { ok: false, error: writeErr.message };
    }
  }

  // Staged releases: a changed design payload gets a DRAFT release row and a
  // snapshot. Held-back bumps stay OFF the catalog until "Make default"; with
  // `flipCatalog` they also publish as before. Never opens to talents;
  // missing-table tolerant (migration may not be applied yet). The release
  // runs from the LATEST snapshot (not the lagging catalog row) to the new
  // version, so release 15 -> 16 exists even while the catalog sits at 14.
  const released = new Set<string>();
  for (const [slug, h] of history) for (const v of h.releaseToVersions) released.add(`${slug}:${v}`);
  const drafts = planReleaseDrafts(
    plan.designChanges.map((c) => ({
      kind: "design" as const,
      slug: c.slug,
      version: c.toVersion,
      priorVersion: c.fromVersion,
    })),
    released,
  );
  for (const d of drafts) {
    const change = plan.designChanges.find((c) => c.slug === d.designSlug)!;
    const prior = change.basePayload as DesignPayload;
    const next = plan.upserts.find((u) => u.kind === "design" && u.slug === d.designSlug)?.payload as
      | DesignPayload
      | undefined;
    let items: ReleaseItem[] = [];
    let notes: ReleaseNotes = {};
    if (next) {
      try {
        const gen = generateReleaseItems(
          d.designSlug,
          { payload: prior, version: d.fromVersion },
          { payload: next, version: d.toVersion },
        );
        items = gen.items;
        notes = gen.notes;
      } catch (err) {
        logServerError("talentTheme.syncBuiltins.diff", err);
      }
    }
    // An empty diff has nothing to tell talents: no release row (the snapshot
    // below is still written, so pinned sites keep an exact base).
    if (!shouldCreateDraftRelease(items)) continue;
    await createDraftRelease(admin, { ...d, items, notes, basePayload: prior, createdBy: userId });
  }

  // Payload snapshot per design version (exact merge base for pinned sites).
  // Insert-only: the from-version row already exists after the first gated
  // sync, and the new version always lands as a fresh row.
  await writeThemeVersionSnapshots(admin, [
    ...plan.designChanges.map((c) => ({
      design: c.slug,
      version: c.fromVersion,
      payload: c.basePayload as DesignPayload,
      source: "sync",
    })),
    ...plan.upserts
      .filter(
        (u) =>
          u.kind === "design" &&
          (!priorVersions.has(`${u.kind}:${u.slug}`) ||
            plan.designChanges.some((c) => c.slug === u.slug)),
      )
      .map((u) => ({ design: u.slug, version: u.version, payload: u.payload as DesignPayload, source: "sync" })),
  ]);

  return {
    ok: true,
    created: plan.created,
    updated: plan.updated,
    unchanged: plan.unchanged,
    skippedAuthored: plan.skippedAuthored,
    authoredPending: plan.authoredPending,
    authoredConflict: plan.authoredConflict,
    ...(held.length > 0 ? { heldBack: held.map((u) => `${u.slug}@${u.version}`) } : {}),
  };
}
