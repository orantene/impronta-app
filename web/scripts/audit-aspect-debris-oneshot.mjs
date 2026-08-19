// Aspect/fit debris sweep (one-shot, READ-ONLY).
//
// WHY: `aspectRatio` / `aspectRatioFree` / `objectFit` / `objectPosition` are
// honored at the BASE layer only for image/video/embed — on any other kind the
// renderer drops them. The tablet/mobile lanes, however, apply the same keys
// kind-agnostically. That inversion is a bug (it shipped three 0-height cards
// on a live homepage), and the fix is to honor the keys at base for every kind.
//
// But stored trees may ALREADY carry these keys on non-media nodes — dead
// today, live after the fix. This sweep answers "what exactly changes?" BEFORE
// the change ships. Two classes:
//
//   MATCHED       the node's customCss already declares the same aspect-ratio
//                 (the documented workaround) → enabling the prop is a visual
//                 no-op. Expected for the noir preset factories.
//   ACTIVE-CHANGE no matching customCss → this node's rendering WILL change.
//                 Every one of these needs a human look before deploy.
//
// Reads cms_pages (draft blocks + both published snapshots) and talent_sites
// published snapshots. Writes nothing, ever.
//
// Run from the worktree root:
//   node --env-file=web/.env.local web/scripts/audit-aspect-debris-oneshot.mjs
//   node --env-file=web/.env.local web/scripts/audit-aspect-debris-oneshot.mjs --json > report.json

import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });
const asJson = process.argv.includes("--json");

/** The kinds whose BASE layer already honors these keys — not debris. */
const MEDIA_KINDS = new Set(["image", "video", "embed"]);
const KEYS = ["aspectRatio", "aspectRatioFree", "objectFit", "objectPosition"];

/** A node carries debris when a non-media kind sets any of the four keys. */
function debrisOf(style) {
  if (!style || typeof style !== "object") return null;
  const found = {};
  for (const k of KEYS) {
    const v = style[k];
    // aspectRatio:"auto" is the schema default and renders nothing either way.
    if (v === undefined || v === null || v === "auto") continue;
    found[k] = v;
  }
  return Object.keys(found).length > 0 ? found : null;
}

/**
 * MATCHED = the node's own customCss already declares aspect-ratio, i.e. the
 * documented workaround is in place and the prop is decorative.
 */
function customCssDeclaresAspect(style) {
  const css = typeof style?.customCss === "string" ? style.customCss : "";
  return /aspect-ratio\s*:/.test(css);
}

function walk(nodes, visit, path = []) {
  if (!Array.isArray(nodes)) return;
  for (const [i, node] of nodes.entries()) {
    if (!node || typeof node !== "object") continue;
    visit(node, [...path, node.id ?? `#${i}`]);
    if (Array.isArray(node.children)) walk(node.children, visit, [...path, node.id ?? `#${i}`]);
  }
}

/** A snapshot column may hold the tree directly or wrap it. */
function treesIn(value) {
  if (!value) return [];
  if (Array.isArray(value)) return [value];
  if (typeof value !== "object") return [];
  const out = [];
  for (const k of ["blocks", "tree", "nodes", "body"]) {
    if (Array.isArray(value[k])) out.push(value[k]);
  }
  return out;
}

const findings = [];

function scanTree(tree, source) {
  walk(tree, (node, path) => {
    if (MEDIA_KINDS.has(node.kind)) return;
    const style = node?.props?.style;
    const debris = debrisOf(style);
    if (!debris) return;
    findings.push({
      ...source,
      nodeId: node.id ?? null,
      nodeKind: node.kind ?? null,
      path: path.join(" > "),
      values: debris,
      classification: customCssDeclaresAspect(style) ? "MATCHED" : "ACTIVE-CHANGE",
    });
  });
}

async function main() {
  const { data: pages, error } = await supabase
    .from("cms_pages")
    .select("id, tenant_id, locale, slug, status, blocks, published_page_snapshot, published_homepage_snapshot");
  if (error) throw new Error(`cms_pages read failed: ${error.message}`);

  for (const page of pages ?? []) {
    const base = { table: "cms_pages", pageId: page.id, tenantId: page.tenant_id, locale: page.locale, slug: page.slug, status: page.status };
    if (Array.isArray(page.blocks)) scanTree(page.blocks, { ...base, column: "blocks" });
    for (const col of ["published_page_snapshot", "published_homepage_snapshot"]) {
      for (const tree of treesIn(page[col])) scanTree(tree, { ...base, column: col });
    }
  }

  // talent_sites is a separate publish surface with its own snapshot column.
  const { data: sites, error: siteErr } = await supabase
    .from("talent_sites")
    .select("id, tenant_id, published_snapshot");
  if (siteErr) {
    console.error(`(talent_sites skipped: ${siteErr.message})`);
  } else {
    for (const site of sites ?? []) {
      for (const tree of treesIn(site.published_snapshot)) {
        scanTree(tree, { table: "talent_sites", siteId: site.id, tenantId: site.tenant_id, column: "published_snapshot" });
      }
    }
  }

  const active = findings.filter((f) => f.classification === "ACTIVE-CHANGE");
  const matched = findings.filter((f) => f.classification === "MATCHED");

  if (asJson) {
    console.log(JSON.stringify({ scannedPages: pages?.length ?? 0, total: findings.length, active, matched }, null, 1));
    return;
  }

  console.log(`Scanned ${pages?.length ?? 0} cms_pages rows (+ talent_sites snapshots).\n`);
  console.log(`MATCHED (customCss already declares aspect-ratio → visual no-op): ${matched.length}`);
  console.log(`ACTIVE-CHANGE (rendering WILL change when the base keys go live): ${active.length}\n`);
  for (const f of active) {
    console.log(
      `  ${(f.slug ?? f.siteId ?? "?").padEnd(20)} ${String(f.locale ?? "-").padEnd(3)} ${String(f.status ?? "-").padEnd(10)} ${String(f.column).padEnd(28)} ${String(f.nodeKind).padEnd(14)} ${f.nodeId ?? "?"}  ${JSON.stringify(f.values)}`,
    );
  }
  if (active.length === 0) console.log("  (none — the change is a no-op on every stored tree)");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
