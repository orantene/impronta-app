/**
 * Re-bake createImprontaNoirHomePreset() and replace the published EN homepage
 * snapshot's builderTree (cms_pages 90552cf6) with it. Dry-run by default;
 * pass --apply to write. Validates structure + asserts the audit fixes landed.
 */
import { createClient } from "@supabase/supabase-js";
import { createImprontaNoirHomePreset } from "../src/lib/site-admin/builder-node/composition-preset-factories-noir-home";
import { validateBuilderNodeTree } from "../src/lib/site-admin/builder-node/validate";

// Both Impronta homepage rows — EN + ES. The baked tree carries i18n.es
// overlays, so the SAME builderTree serves both locales (the render resolves the
// language per-request); writing it to both keeps EN/ES structurally in sync.
const PAGES = [
  { id: "90552cf6-2230-4a40-8320-c2e303e3ee56", locale: "en" },
  { id: "651d6ea9-ed4e-4c1f-a4e6-5fcc3e346f4e", locale: "es" },
];
const APPLY = process.argv.includes("--apply");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) throw new Error("missing SUPABASE env");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function walk(node: any, fn: (n: any) => void) {
  if (!node || typeof node !== "object") return;
  fn(node);
  const kids = (node as { children?: unknown[] }).children;
  if (Array.isArray(kids)) kids.forEach((c) => walk(c, fn));
}

const root = createImprontaNoirHomePreset();
const tree = [root];

// --- structural gates ---
const validation = validateBuilderNodeTree(tree, { maxDepth: 16 });
if (!validation.ok) {
  console.error("INVALID tree:", JSON.stringify(validation, null, 2));
  process.exit(1);
}
let nodeCount = 0;
walk(root, () => nodeCount++);

// --- find the hero carousel + audit-fix assertions ---
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let hero: any = null;
walk(root, (n) => {
  if (!hero && n.kind === "carousel" && n.props?.variant === "hero") hero = n;
});
if (!hero) throw new Error("hero carousel not found");
const heroSlides = hero.children?.length ?? 0;

// no dead /contact href anywhere
const contactHrefs: string[] = [];
walk(root, (n) => {
  const href = n.props?.href ?? n.props?.url;
  if (typeof href === "string" && href.includes("/contact")) contactHrefs.push(href);
});

// exactly one level-1 heading inside the hero (slide 1 only)
let heroH1 = 0;
walk(hero, (n) => {
  if (n.kind === "heading" && (n.props?.level === 1 || n.props?.level === "1")) heroH1++;
});

console.log("── bake report ──");
console.log("  valid:", validation.ok);
console.log("  nodes:", nodeCount, nodeCount <= 280 ? "(<=280 ✓)" : "(OVER 280 ✗)");
console.log("  hero slides:", heroSlides, heroSlides === 5 ? "✓" : "✗");
console.log("  hero height:", hero.props?.heightMode, hero.props?.minHeightPx + "px", hero.props?.heightMode === "fixed" && hero.props?.minHeightPx === 600 ? "✓ (600px band)" : "(check)");
console.log("  /contact hrefs in tree:", contactHrefs.length, contactHrefs.length === 0 ? "✓ (P0 fix)" : `✗ ${JSON.stringify(contactHrefs)}`);
console.log("  level-1 headings in hero:", heroH1, heroH1 === 1 ? "✓ (single H1)" : "✗");

const gatesOk =
  validation.ok && nodeCount <= 280 && heroSlides === 5 && contactHrefs.length === 0 && heroH1 === 1;
if (!gatesOk) {
  console.error("GATES FAILED — not writing.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

for (const { id, locale } of PAGES) {
  const { data: page, error: readErr } = await supabase
    .from("cms_pages")
    .select("published_homepage_snapshot")
    .eq("id", id)
    .single();
  if (readErr) {
    console.error(`\n[${locale}] read failed (${id}):`, readErr.message, "— skipping");
    continue;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const snapshot = (page as any).published_homepage_snapshot ?? {};
  let currentSlides = 0;
  walk({ children: snapshot.builderTree ?? [] }, (n) => {
    if (n.kind === "carousel" && n.props?.variant === "hero")
      currentSlides = n.children?.length ?? 0;
  });
  console.log(`\n── [${locale}] LIVE snapshot ── current hero slides: ${currentSlides}`);

  if (!APPLY) {
    console.log(`  DRY RUN — pass --apply to write [${locale}].`);
    continue;
  }

  const nextSnapshot = { ...snapshot, builderTree: tree };
  const { error: writeErr } = await supabase
    .from("cms_pages")
    .update({ published_homepage_snapshot: nextSnapshot })
    .eq("id", id);
  if (writeErr) throw writeErr;
  console.log(
    `  ✓ [${locale}] WROTE. new hero slides: ${heroSlides} | /contact hrefs: ${contactHrefs.length} | hero H1s: ${heroH1}`,
  );
}

if (!APPLY) {
  console.log("\nDRY RUN complete — pass --apply to write both locales.");
}
