/**
 * LOCAL-ONLY bake check — re-bakes createImprontaNoirHomePreset(), validates the
 * tree, counts nodes, and asserts the structural gates. Does NOT touch Supabase
 * (pure computation), so it verifies the design changes before the prod publish.
 */
import { createImprontaNoirHomePreset } from "../src/lib/site-admin/builder-node/composition-preset-factories-noir-home";
import { validateBuilderNodeTree } from "../src/lib/site-admin/builder-node/validate";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function walk(node: any, fn: (n: any) => void) {
  if (!node || typeof node !== "object") return;
  fn(node);
  const kids = (node as { children?: unknown[] }).children;
  if (Array.isArray(kids)) kids.forEach((c) => walk(c, fn));
}

const root = createImprontaNoirHomePreset();
const tree = [root];

const validation = validateBuilderNodeTree(tree, { maxDepth: 16 });
let nodeCount = 0;
walk(root, () => nodeCount++);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let hero: any = null;
walk(root, (n) => {
  if (!hero && n.kind === "carousel" && n.props?.variant === "hero") hero = n;
});
const heroSlides = hero?.children?.length ?? 0;

// Divisions tile assertions — confirm the redesign survived validation.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let divisionsRow: any = null;
walk(root, (n) => {
  if (
    !divisionsRow &&
    n.props?.dataBinding?.sourceKey === "tenant_directory_search" &&
    n.props?.dataBinding?.repeat
  )
    divisionsRow = n;
});
const divTemplate = divisionsRow?.children?.[0];
let divImageBound = false;
let divNodeCount = 0;
walk(divTemplate, (n) => {
  divNodeCount++;
  if (n.kind === "image" && n.props?.src === "{{imageUrl}}") divImageBound = true;
});

const contactHrefs: string[] = [];
walk(root, (n) => {
  const href = n.props?.href ?? n.props?.url;
  if (typeof href === "string" && href.includes("/contact")) contactHrefs.push(href);
});
let heroH1 = 0;
walk(hero, (n) => {
  if (n.kind === "heading" && (n.props?.level === 1 || n.props?.level === "1")) heroH1++;
});

// Featured mobile slider survived (display/itemsPerView not stripped by validate).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let featuredSlider = false;
walk(root, (n) => {
  const m = n.props?.responsive?.mobile;
  if (m && m.display === "slider" && m.itemsPerView) featuredSlider = true;
});

console.log("── LOCAL bake check ──");
console.log("  valid:", validation.ok);
if (!validation.ok) console.log("  ISSUES:", JSON.stringify(validation, null, 2));
console.log("  nodes:", nodeCount, nodeCount <= 280 ? "(<=280 ✓)" : "(OVER 280 ✗)");
console.log("  hero slides:", heroSlides, heroSlides === 5 ? "✓" : "✗");
console.log("  hero height:", hero?.props?.heightMode, hero?.props?.minHeightPx + "px");
console.log("  /contact hrefs:", contactHrefs.length, contactHrefs.length === 0 ? "✓" : "✗");
console.log("  hero H1s:", heroH1, heroH1 === 1 ? "✓" : "✗");
console.log("  divisions template nodes:", divNodeCount);
console.log("  divisions {{imageUrl}} image bound:", divImageBound ? "✓" : "✗ (MISSING — was it stripped?)");
console.log("  featured mobile slider preserved:", featuredSlider ? "✓" : "✗ (STRIPPED — registry gap!)");

const gatesOk =
  validation.ok && nodeCount <= 280 && heroSlides === 5 && contactHrefs.length === 0 && heroH1 === 1 && divImageBound && featuredSlider;
console.log(gatesOk ? "\n✓ ALL GATES PASS — ready to publish" : "\n✗ GATES FAILED");
process.exit(gatesOk ? 0 : 1);
