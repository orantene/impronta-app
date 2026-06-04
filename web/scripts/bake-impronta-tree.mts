/**
 * Bake the registered "impronta" page-design into a self-contained freeform
 * BuilderNode tree (repeaters expanded, fresh ids) and print it as JSON.
 * Pure tree transform — no server / DB imports.
 *
 *   npx tsx scripts/bake-impronta-tree.mts > /tmp/impronta-tree.json
 */
import { getPageDesign, bakePageDesignTree } from "@/lib/site-admin/builder-node/page-designs";

const design = getPageDesign("impronta");
if (!design) throw new Error("impronta design not found");
const tree = bakePageDesignTree(design.tree, design.dataSources);
process.stdout.write(JSON.stringify(tree));
