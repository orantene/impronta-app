/**
 * Guarded release of the Spanish + English seed overlay as NEW theme versions,
 * through Builder Lab's OWN release code (no parallel writer, no raw SQL
 * beyond two read-only SELECTs for the actor and the draft's updater).
 *
 * DRY RUN by default. Writes only with `--apply --yes --design <slug>`.
 *
 *   dry run, all designs:
 *     npm run qa:release-theme-i18n -- --design maison-v2 --design folio
 *   release one design to DEMOS only:
 *     npm run qa:release-theme-i18n -- --apply --yes --design folio
 *   later, separate step (after pull-authored overlay is committed and deployed):
 *     npm run qa:release-theme-i18n -- --release-to-talents --apply --yes --design folio --rollout 100
 *
 * Flags: --include-open-draft <slug> (layer on a non-maison-v2 open draft),
 *        --actor <uuid> (override the super_admin lookup), --rollout <1-100>.
 *
 * Needs (set by the operator): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
 * DEMO_SEED_TARGET_REF (must match the URL). Run through tsx like pull-authored:
 *   NODE_PATH=scripts/demo-talents/stubs NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' \
 *   npx tsx --tsconfig scripts/demo-talents/tsconfig.json --env-file=<env> scripts/release-theme-i18n-overlay.mts ...
 * (the npm script wires the first two). Never makes a design the default.
 */
import { createClient } from "@supabase/supabase-js";

import {
  buildLookup,
  parseArgs,
  run,
  type DraftInfo,
  type PayloadLike,
  type Ports,
  type ReleaseRow,
} from "./release-theme-i18n-plan";

const parsed = parseArgs(process.argv.slice(2));
if (!parsed.ok) {
  console.error(`REFUSED: ${parsed.error}`);
  process.exit(2);
}
const args = parsed.args;

// Refuse early (before any import of the server code) when nothing can run.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const targetRef = process.env.DEMO_SEED_TARGET_REF?.trim();
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!targetRef || !url.includes(`${targetRef}.supabase.co`) || !key)) {
  console.error("REFUSED: set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and a matching DEMO_SEED_TARGET_REF.");
  process.exit(2);
}
const admin = createClient(url, key!, { auth: { persistSession: false, autoRefreshToken: false } });

// Builder Lab's own modules, loaded lazily so the arg guards above stay cheap.
const drafts = await import("../src/lib/talent-site/theme-template/drafts.server");
const publish = await import("../src/lib/talent-site/theme-template/publish.server");
const manager = await import("../src/lib/talent-site/theme-releases/manager/release-manager.server");
const releasesDb = await import("../src/lib/talent-site/theme-releases/releases.server");
const versions = await import("../src/lib/talent-site/theme-releases/theme-versions.server");
const catalogRow = await import("../src/lib/talent-site/server/maison-catalog-row");
const { BUILTIN_DESIGNS } = await import("../src/lib/talent-site/theme-catalog/builtins");
const { COLLECTION_DESIGNS } = await import("../src/lib/talent-site/theme-catalog/collection/designs");
const { MAISON_BUILTIN_DESIGN } = await import("../src/lib/talent-site/theme-catalog/maison/builtins");
const { MODE_DEPENDENT_LABELS } = await import("../src/lib/talent-site/theme-catalog/seed-i18n");

const SEED_ENTRIES = [MAISON_BUILTIN_DESIGN, ...COLLECTION_DESIGNS].filter((e) =>
  ["maison", "maison-v2", "folio", "solace", "mono", "frame", "gridline"].includes(e.slug),
);
void BUILTIN_DESIGNS;

const asDraft = async (d: Awaited<ReturnType<typeof drafts.loadThemeDraft>>): Promise<DraftInfo | null> => {
  if (!d.ok) return null;
  // Read-only: who last changed it (not part of ThemeDraft).
  const { data, error } = await admin
    .from("talent_theme_drafts")
    .select("updated_by")
    .eq("id", d.value.id)
    .maybeSingle();
  if (error) throw new Error(`read talent_theme_drafts.updated_by: ${error.message}`);
  return {
    id: d.value.id,
    rev: d.value.rev,
    baseVersion: d.value.baseVersion,
    updatedAt: d.value.updatedAt,
    updatedBy: (data as { updated_by?: string | null } | null)?.updated_by ?? null,
    payload: d.value.payload as unknown as PayloadLike,
  };
};
const res = <T>(r: { ok: true; value: T } | { ok: false; code?: string; error: string }) => r;

const ports: Ports = {
  async findActor() {
    const { data, error } = await admin
      .from("profiles")
      .select("id, created_at")
      .eq("app_role", "super_admin")
      .order("created_at", { ascending: true })
      .limit(1);
    if (error) throw new Error(`read profiles: ${error.message}`);
    const row = (data as Array<{ id: string }> | null)?.[0];
    return row ? { id: row.id, label: "first super_admin by created_at" } : null;
  },
  async loadReleased(slug) {
    // Mirrors drafts.server latestSnapshot (private there): newest version row, else catalog row.
    const row = await catalogRow.loadMaisonCatalogRow(admin, "design", slug);
    const { data, error } = await admin
      .from("talent_theme_versions")
      .select("version")
      .eq("design", slug)
      .order("version", { ascending: false })
      .limit(1);
    if (error) throw new Error(`read talent_theme_versions: ${error.message}`);
    const top = (data as Array<{ version: number }> | null)?.[0]?.version;
    if (typeof top === "number" && (!row || top > row.version)) {
      const payload = await versions.loadThemeVersionPayload(admin, slug, top);
      if (payload) return { version: top, payload: payload as unknown as PayloadLike };
    }
    return row ? { version: row.version, payload: row.payload as unknown as PayloadLike } : null;
  },
  loadDraft: async (slug) => asDraft(await drafts.loadThemeDraft(admin, slug)),
  async openDraft(slug, actorId) {
    const r = await drafts.openThemeDraft(admin, slug, actorId);
    if (!r.ok) return r;
    const d = await asDraft(r);
    return d ? { ok: true, value: d } : { ok: false, error: "opened draft could not be re-read" };
  },
  async saveTree(input) {
    const r = await drafts.saveThemeDraftTree(admin, input as never);
    if (!r.ok) return r;
    const d = await asDraft(r);
    return d ? { ok: true, value: d } : { ok: false, error: "saved draft could not be re-read" };
  },
  async preview(slug) {
    const r = await publish.previewThemeDraftPublish(admin, slug);
    return r.ok ? { ok: true, value: r.value } : { ok: false, error: r.error };
  },
  async publishDemos(input) {
    const r = await publish.publishAndUpdateDemos(admin, input);
    return r.ok
      ? { ok: true, value: r.value }
      : { ok: false, error: r.error, releaseId: (r as { releaseId?: string }).releaseId, version: (r as { version?: number }).version };
  },
  async findRelease(slug) {
    const list = await releasesDb.listReleases(admin, slug);
    return (list[0] as unknown as ReleaseRow | undefined) ?? null; // newest to_version
  },
  async setRollout(release, pct) {
    const full = await manager.loadRelease(admin, release.id);
    if (!full) return { ok: false, error: "release not found" };
    const r = await manager.changeRollout(admin, full, pct);
    return r.ok ? { ok: true, value: null } : r;
  },
  async openToTalents(release) {
    const full = await manager.loadRelease(admin, release.id);
    if (!full) return { ok: false, error: "release not found" };
    const r = await manager.changeChannel(admin, full, "optin");
    return res(r.ok ? { ok: true as const, value: r } : { ok: false as const, error: r.error });
  },
  lookup: () =>
    buildLookup(
      SEED_ENTRIES.map((e) => ({ slug: e.slug, payload: e.buildPayload() as unknown as PayloadLike })),
      MODE_DEPENDENT_LABELS,
    ),
  log: (l) => console.log(l),
};

process.exitCode = await run(args, ports);
