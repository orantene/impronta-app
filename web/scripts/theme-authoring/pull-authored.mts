/**
 * Export the latest editor-AUTHORED version of a Design into a committed
 * overlay (`src/lib/talent-site/theme-catalog/collection/authored/<slug>.overlay.json`)
 * and register it, so the code reflects the authored version and git has its
 * history. READ-ONLY on the database (one SELECT).
 *
 * Run (from web/):
 *   NODE_PATH=scripts/demo-talents/stubs DEMO_SEED_TARGET_REF=<ref> \
 *     npx tsx --tsconfig scripts/demo-talents/tsconfig.json --env-file=<env> \
 *     scripts/theme-authoring/pull-authored.mts --design folio
 *
 * Refuses unless: the latest snapshot is `source = 'authored'`, the overlay
 * reproduces it exactly (publish-core payloadHash == meta.payload_hash, and
 * the sync hash equals the stored payload's), and the code has not moved since
 * the editor's base (meta.code_hash), unless --allow-code-moved.
 */
import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { COLLECTION_DESIGNS } from "../../src/lib/talent-site/theme-catalog/collection/designs";
import {
  applyAuthoredOverlay,
  diffToOverlay,
  type AuthoredOverlayFile,
} from "../../src/lib/talent-site/theme-catalog/collection/authored/overlay";
import { hashBuiltinPayload } from "../../src/lib/talent-site/theme-catalog/sync-builtins.server";
import { payloadHash } from "../../src/lib/talent-site/theme-template/publish-core";
import type { DesignPayload } from "../../src/lib/talent-site/theme-catalog/types";
import { stableStringify as stableJson } from "../../src/lib/talent-site/theme-releases/origin";

const arg = (name: string): string | null => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
};
const slug = arg("--design")?.trim().toLowerCase();
if (!slug || !/^[a-z0-9-]+$/.test(slug)) throw new Error("Usage: pull-authored.mts --design <slug>");
const allowCodeMoved = process.argv.includes("--allow-code-moved");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ?? "";
const targetRef = process.env.DEMO_SEED_TARGET_REF?.trim();
if (!targetRef || !url.includes(`${targetRef}.supabase.co`)) {
  throw new Error(`REFUSE: DEMO_SEED_TARGET_REF (${targetRef}) does not match ${url}`);
}
const admin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const entry = COLLECTION_DESIGNS.find((e) => e.slug === slug);
if (!entry) throw new Error(`REFUSE: "${slug}" is not a collection design`);
const raw = (entry.buildPayloadRaw ?? entry.buildPayload)();
const codeHash = hashBuiltinPayload(raw);

const { data, error } = await admin
  .from("talent_theme_versions")
  .select("version, source, meta, payload")
  .eq("design", slug)
  .order("version", { ascending: false })
  .limit(1);
if (error) throw new Error(`read talent_theme_versions: ${error.message}`);
const latest = data?.[0] as
  | { version: number; source: string | null; meta: Record<string, unknown> | null; payload: DesignPayload }
  | undefined;
if (!latest) throw new Error(`REFUSE: no versions for "${slug}"`);
if (latest.source !== "authored") {
  throw new Error(`REFUSE: latest ${slug} v${latest.version} is source=${latest.source}, not authored`);
}
const expectedHash = typeof latest.meta?.payload_hash === "string" ? latest.meta.payload_hash : null;
if (!expectedHash) throw new Error(`REFUSE: v${latest.version} has no meta.payload_hash`);
const basedOn = typeof latest.meta?.code_hash === "string" ? latest.meta.code_hash : null;
if (basedOn && basedOn !== codeHash) {
  const msg = `code moved since the editor's base (meta.code_hash ${basedOn} != raw ${codeHash}); the overlay would revert those code changes`;
  if (!allowCodeMoved) throw new Error(`REFUSE: ${msg}. Re-run with --allow-code-moved only after review.`);
  console.warn(`WARN: ${msg}`);
}

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, "../../src/lib/talent-site/theme-catalog/collection/authored");
const file = join(dir, `${slug}.overlay.json`);
const prior = existsSync(file) ? (JSON.parse(readFileSync(file, "utf8")) as Partial<AuthoredOverlayFile>) : null;

const diff = diffToOverlay(raw, latest.payload);
const overlay: AuthoredOverlayFile = {
  authoredVersion: latest.version,
  codeHash,
  payloadHash: expectedHash,
  tokenDefaults: diff.tokenDefaults,
  props: diff.props,
  removed: diff.removed,
  added: diff.added,
  order: diff.order,
  labelsEs: prior?.labelsEs ?? {},
};

// Verify before writing anything.
const applied = applyAuthoredOverlay(raw, overlay);
const got = payloadHash(applied);
if (process.env.PULL_DEBUG_DIR) {
  const s = (v: unknown) => JSON.stringify(JSON.parse(stableJson(v)), null, 1);
  writeFileSync(join(process.env.PULL_DEBUG_DIR, "applied.json"), s(applied));
  writeFileSync(join(process.env.PULL_DEBUG_DIR, "stored.json"), s(latest.payload));
}
if (got !== expectedHash) throw new Error(`REFUSE: apply(raw, overlay) hashes ${got}, snapshot payload_hash is ${expectedHash}`);
const syncGot = hashBuiltinPayload(applied);
const syncWant = hashBuiltinPayload(latest.payload);
if (syncGot !== syncWant) throw new Error(`REFUSE: sync hash ${syncGot} != stored payload ${syncWant}`);

writeFileSync(file, `${JSON.stringify(overlay, null, 2)}\n`);

const indexFile = join(dir, "index.ts");
let index = readFileSync(indexFile, "utf8");
const ident = `${slug.replace(/-([a-z0-9])/g, (_m, c: string) => c.toUpperCase())}Overlay`;
if (!index.includes(`"./${slug}.overlay.json"`)) {
  index = index
    .replace("// pull-authored:imports", `import ${ident} from "./${slug}.overlay.json";\n// pull-authored:imports`)
    .replace("  // pull-authored:entries", `  ${JSON.stringify(slug)}: ${ident},\n  // pull-authored:entries`);
  writeFileSync(indexFile, index);
}

console.log(
  JSON.stringify(
    {
      design: slug,
      authoredVersion: overlay.authoredVersion,
      codeHash,
      payloadHash: got,
      tokenDefaults: Object.keys(overlay.tokenDefaults),
      propsNodes: Object.keys(overlay.props),
      removed: overlay.removed,
      added: overlay.added.map((a) => `${a.parentKey} after ${a.afterKey}`),
      order: Object.keys(overlay.order),
      file,
    },
    null,
    2,
  ),
);
