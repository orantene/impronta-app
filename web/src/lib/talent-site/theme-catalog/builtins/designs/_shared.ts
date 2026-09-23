/**
 * Shared payload builder for the built-in Designs. Every `designs/*.ts` entry
 * calls `buildBuiltinDesignPayload(key)` — never hand-authors a tree — so a
 * built-in Design payload is ALWAYS exactly what
 * `max-site-templates/registry.ts` (the 0.A section kit) produces for that
 * starter-template key, converted for the catalog with two fixes the raw
 * registry call does not give you:
 *
 *   1. DETERMINISTIC IDS. `buildMaxSiteTemplateTrees` defaults to
 *      `crypto.randomUUID`, which is fine for a one-off apply but WRONG for a
 *      built-in: `sync-builtins.server.ts` hashes the built payload to decide
 *      whether to bump `version`, and a random id would make every sync look
 *      like a content change (spurious version bumps on a no-op resync, and
 *      every talent who applied the design would look "out of date" for no
 *      reason). A per-key sequential id factory makes `buildPayload()`
 *      byte-identical across calls, so the hash is stable.
 *
 *   2. A DEFERRED COPYRIGHT YEAR. `MaxSiteTemplateContext` has no `year`
 *      field and none of the five templates' `buildShellTree` forward one to
 *      the kit shell builders, so the shell footer bakes in
 *      `new Date().getFullYear()` — the REAL year at sync time, not a
 *      `{{year}}` token. `theme-apply-core.ts`'s `resolveYearToken` only
 *      replaces a literal `"{{year}}"` substring, so a stored payload that
 *      skipped this step would freeze every site's footer at the sync year
 *      forever (a wedding site synced in 2026 would say "© 2026" in 2031).
 *      `deferCopyrightYear` restores the token after the kit builds the tree,
 *      the same fix `section-kit.static.test.ts` / `theme-apply-core.test.ts`
 *      exercise by passing `year: "{{year}}"` directly to the kit shell
 *      builders — those tests bypass `buildMaxSiteTemplateTrees` entirely, so
 *      they never hit this gap; a built-in that calls the registry function
 *      the way `Deliver: 1` describes does.
 */
import type { BuilderNode } from "@/lib/site-admin/builder-node/types";
import { buildMaxSiteTemplateTrees } from "@/lib/talent-site/max-site-templates/registry";
import type { MaxSiteTemplateKey } from "@/lib/talent-site/max-site-templates/types";
import type { DesignPayload } from "../../types";

/** `© <4-digit-year>` — the literal text `buildDefaultShellTree` /
 * `section-kit-shell.ts`'s `copyrightLine` bakes in when no `year` is given. */
const BAKED_COPYRIGHT_YEAR_RE = /©\s*\d{4}\b/;

function makeSeqIdFactory(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}-${(n += 1)}`;
}

function deferCopyrightYear(node: BuilderNode): BuilderNode {
  const props = (node.props ?? {}) as Record<string, unknown>;
  const children = "children" in node && Array.isArray(node.children) ? node.children : null;
  const isCopyright = props.layerLabel === "Copyright" && typeof props.text === "string";
  return {
    ...node,
    props: isCopyright
      ? { ...props, text: (props.text as string).replace(BAKED_COPYRIGHT_YEAR_RE, "© {{year}}") }
      : props,
    ...(children ? { children: children.map(deferCopyrightYear) } : {}),
  } as BuilderNode;
}

/**
 * Build a built-in Design payload from the 0.A section-kit registry for one
 * starter-template `key`. Deterministic: calling this twice for the same key
 * returns byte-identical output, which `sync-builtins.server.ts` depends on.
 */
export function buildBuiltinDesignPayload(key: MaxSiteTemplateKey): DesignPayload {
  const { shellTree, homeTree } = buildMaxSiteTemplateTrees(
    key,
    { displayName: "{{displayName}}" },
    makeSeqIdFactory(`builtin-${key}`),
  );
  return { shellTree: shellTree.map(deferCopyrightYear), homeTree };
}
