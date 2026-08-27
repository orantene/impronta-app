/**
 * Refresh the fixtures the i18n coverage guard reads.
 *
 * WHY THIS EXISTS: `translatable-text-coverage.test.ts` proves that every
 * copy-looking string on a real page is reachable by `translatableTextOf`. It
 * reads COMMITTED fixtures, so it cannot know about a component shape that
 * ships after they were captured — that window is the guard's one documented
 * limit. Run this when a new component lands (or periodically) and commit the
 * result; the guard then fails loudly on any copy key the definition misses.
 *
 * Captures ONE representative node per (kind + prop-key signature) — enough to
 * cover every shape on the site without committing the whole site.
 *
 *   npx tsx scripts/refresh-nested-text-fixtures.ts            # write fixtures
 *   npx tsx scripts/refresh-nested-text-fixtures.ts --check    # CI-style diff
 *
 * ENV (web/.env.local): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Read-only: it never writes to the database.
 *
 * No top-level side effects — `main()` runs only under the import guard at the
 * bottom, so importing this module can never touch the filesystem.
 */
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FIXTURE = path.join(
  process.cwd(),
  "src/lib/site-admin/builder-node/__fixtures__/site-nodes.json",
);

function walk(node: unknown, visit: (n: Record<string, unknown>) => void): void {
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, visit));
    return;
  }
  if (!node || typeof node !== "object") return;
  const record = node as Record<string, unknown>;
  visit(record);
  walk(record.children, visit);
}

async function main(check: boolean): Promise<number> {
  loadEnv({ path: ".env.local" });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.");
    return 1;
  }
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data, error } = await db
    .from("cms_pages")
    .select("slug, blocks")
    .eq("is_freeform", true)
    .eq("locale", "en");
  if (error) {
    console.error(`Read failed: ${error.message}`);
    return 1;
  }

  const bySignature = new Map<string, unknown>();
  for (const page of data ?? []) {
    walk(page.blocks, (node) => {
      const props = node.props;
      if (!props || typeof props !== "object") return;
      const signature = `${String(node.kind)}:${Object.keys(props).sort().join(",")}`;
      if (bySignature.has(signature)) return;
      bySignature.set(signature, {
        id: node.id,
        kind: node.kind,
        props,
        ...(node.i18n ? { i18n: node.i18n } : {}),
      });
    });
  }

  const nodes = [...bySignature.values()];
  const next = JSON.stringify(nodes);
  const current = fs.existsSync(FIXTURE) ? fs.readFileSync(FIXTURE, "utf8") : "";

  if (check) {
    if (next === current) {
      console.log(`Fixtures current — ${nodes.length} shapes.`);
      return 0;
    }
    console.error(
      `Fixtures are STALE: the site has shapes these fixtures do not cover, so ` +
        `the coverage guard is checking less than it appears to.\n` +
        `Re-run without --check and commit the result.`,
    );
    return 1;
  }

  fs.writeFileSync(FIXTURE, next);
  console.log(
    `${next === current ? "Unchanged" : "Updated"} — ${nodes.length} shapes, ` +
      `${(next.length / 1024).toFixed(0)} KB.`,
  );
  return 0;
}

const invokedDirectly =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (invokedDirectly) {
  main(process.argv.includes("--check"))
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
