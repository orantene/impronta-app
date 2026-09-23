import "server-only";

import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logServerError } from "@/lib/server/safe-error";
import { BUILTIN_DESIGNS, BUILTIN_LOOKS } from "./builtins";
import type { BuiltinDesignEntry, BuiltinLookEntry } from "./builtins/types";
import { TALENT_THEME_SCHEMA_VERSION, type TalentThemeKind } from "./types";
import { validateDesign, validateLook } from "./validate";

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
    const keys = Object.keys(record).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(record[k])}`).join(",")}}`;
  }
  return JSON.stringify(value);
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

export interface BuiltinSyncPlan {
  upserts: BuiltinUpsertRow[];
  /** (kind, slug) pairs a built-in wanted to write but an authored row already owns. */
  skippedAuthored: Array<{ kind: TalentThemeKind; slug: string }>;
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
): BuiltinSyncPlan {
  const bySlug = new Map(existing.map((row) => [`${row.kind}:${row.slug}`, row]));
  const upserts: BuiltinUpsertRow[] = [];
  const skippedAuthored: BuiltinSyncPlan["skippedAuthored"] = [];
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
    if (prior) {
      const priorHash = hashBuiltinPayload(prior.payload);
      version = priorHash === newHash ? prior.version : prior.version + 1;
      if (priorHash === newHash) unchanged += 1;
      else updated += 1;
    } else {
      created += 1;
    }

    upserts.push({
      kind: entry.kind,
      slug: entry.slug,
      title: entry.title,
      summary: entry.summary,
      category: entry.category,
      tags: entry.tags,
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

  return { upserts, skippedAuthored, created, updated, unchanged };
}

function validateEntry(entry: BuiltinThemeEntry, payload: unknown): string[] {
  const check = entry.kind === "design" ? validateDesign(payload) : validateLook(payload);
  return check.ok ? [] : check.errors.map((e) => `${entry.kind}:${entry.slug} — ${e}`);
}

export type SyncBuiltinTalentThemesResult =
  | {
      ok: true;
      created: number;
      updated: number;
      unchanged: number;
      skippedAuthored: Array<{ kind: TalentThemeKind; slug: string }>;
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
): Promise<SyncBuiltinTalentThemesResult> {
  const entries: BuiltinThemeEntry[] = [...BUILTIN_DESIGNS, ...BUILTIN_LOOKS];
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

  const plan = planBuiltinSync(built, (data ?? []) as ExistingBuiltinRow[], userId);
  if (plan.skippedAuthored.length > 0) {
    logServerError("talentTheme.syncBuiltins.authoredShadowed", {
      skipped: plan.skippedAuthored,
    });
  }
  if (plan.upserts.length === 0) {
    return {
      ok: true,
      created: plan.created,
      updated: plan.updated,
      unchanged: plan.unchanged,
      skippedAuthored: plan.skippedAuthored,
    };
  }

  const { error: writeErr } = await admin
    .from("talent_theme_catalog")
    .upsert(plan.upserts as never, { onConflict: "kind,slug" });
  if (writeErr) {
    logServerError("talentTheme.syncBuiltins.write", writeErr);
    return { ok: false, error: writeErr.message };
  }

  return {
    ok: true,
    created: plan.created,
    updated: plan.updated,
    unchanged: plan.unchanged,
    skippedAuthored: plan.skippedAuthored,
  };
}
