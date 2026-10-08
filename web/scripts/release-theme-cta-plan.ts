/**
 * TUL-366 / THEME CORE P0-3: the Maison CTA release script is RETIRED.
 *
 * Patch planning lives in `src/lib/talent-site/theme-catalog/code-seed-cta.ts`
 * and ships through Builder Lab (Factory → Review code seed → demos → talents).
 * This module re-exports the pure patch helpers for unit tests and keeps a
 * thin `planCta` diagnostic. `run()` always refuses apply/publish.
 * The former `scripts/release-theme-patch-cta.mts` entry point was deleted.
 *
 * Exit codes: 2 REFUSED (retired).
 */
import { isDeepStrictEqual } from "node:util";

import {
  parseArgs,
  type Args,
  type DraftInfo,
  type PayloadLike,
  type Ports,
  type Released,
} from "./release-theme-i18n-plan";

// Re-export pure CTA patch helpers from the Builder Lab path (single source).
export {
  BOOK_HREF,
  BOOK_LABEL,
  CTA_ALLOWED_SLUGS,
  diffLeaves,
  patchMaisonCtaTrees,
  stripDesignKey,
  type CtaEdit as Edit,
  type CtaPatch,
  type SeedTrees,
} from "../src/lib/talent-site/theme-catalog/code-seed-cta";
import {
  CTA_ALLOWED_SLUGS,
  patchMaisonCtaTrees,
  stripDesignKey,
  type CtaPatch,
  type SeedTrees,
} from "../src/lib/talent-site/theme-catalog/code-seed-cta";

/** The ports this script needs: Builder Lab's, minus the i18n lookup, plus the code seed. */
export type CtaPorts = Omit<Ports, "lookup"> & { seed(): SeedTrees };

/** Adapter: script PayloadLike → lib patch (same shape for shell/home trees). */
export function patchTrees(base: PayloadLike, seed: SeedTrees): CtaPatch {
  return patchMaisonCtaTrees(
    { shellTree: base.shellTree ?? [], homeTree: base.homeTree ?? [] } as Parameters<
      typeof patchMaisonCtaTrees
    >[0],
    seed as Parameters<typeof patchMaisonCtaTrees>[1],
  );
}

// ── Plan (diagnostic only; apply path is retired) ────────────────────────────
export interface CtaPlan {
  slug: string;
  releasedVersion: number | null;
  draft: { rev: number; updatedAt: string; updatedBy: string | null; baseVersion: number } | null;
  willOpenDraft: boolean;
  patch: CtaPatch;
  refusals: string[];
}

export function planCta(slug: string, released: Released | null, draft: DraftInfo | null, seed: SeedTrees): CtaPlan {
  const refusals: string[] = [];
  if (!(CTA_ALLOWED_SLUGS as readonly string[]).includes(slug)) {
    refusals.push(`"${slug}" is not on the allow-list (${CTA_ALLOWED_SLUGS.join(", ")}).`);
  }
  if (!released) refusals.push("No released version found for this design.");
  if (draft && released && !isDeepStrictEqual(stripDesignKey(draft.payload), stripDesignKey(released.payload))) {
    refusals.push(
      `Open draft (rev ${draft.rev}, updated ${draft.updatedAt} by ${draft.updatedBy ?? "unknown"}, base v${draft.baseVersion}) ` +
        `differs from released v${released.version} by more than props.designKey. Release or discard it first.`,
    );
  }
  const base = (draft?.payload ?? released?.payload ?? {}) as PayloadLike;
  const patch = patchTrees(base, seed);
  refusals.push(...patch.refusals);
  return {
    slug,
    releasedVersion: released?.version ?? null,
    draft: draft
      ? { rev: draft.rev, updatedAt: draft.updatedAt, updatedBy: draft.updatedBy, baseVersion: draft.baseVersion }
      : null,
    willOpenDraft: !draft,
    patch,
    refusals,
  };
}

export function printCtaPlan(p: CtaPlan, log: (l: string) => void): void {
  log(`\n=== ${p.slug} ===`);
  log(`released version: ${p.releasedVersion === null ? "none found" : `v${p.releasedVersion}`}`);
  log(
    p.draft
      ? `open draft: yes, rev ${p.draft.rev}, base v${p.draft.baseVersion}, last change ${p.draft.updatedAt} by ${p.draft.updatedBy ?? "unknown"}`
      : "open draft: none",
  );
  log(`edits: ${p.patch.edits.length}`);
  for (const e of p.patch.edits) {
    log(`  ${e.prefix} [${e.what}]\n    - ${JSON.stringify(e.before)}\n    + ${JSON.stringify(e.after)}`);
  }
  if (p.patch.alreadyDone) log("already patched: nothing to do.");
  for (const r of p.refusals) log(`REFUSED: ${r}`);
  log(
    "next step: Talent Template Factory → Review code seed in Builder Lab → publish demos → open to talents (script retired).",
  );
}

export { parseArgs };

/** Retired: always refuses. Use Factory → Review code seed in Builder Lab. */
export async function run(args: Args, ports: CtaPorts): Promise<number> {
  const log = ports.log;
  log("REFUSED: release-theme-patch-cta is retired (TUL-366 / THEME CORE P0-3).");
  log(
    "Ship Maison booking CTA via Builder Lab: Talent Template Factory → Review code seed → publish demos → open to talents.",
  );
  log("Then export the overlay from Factory (Copy overlay for git) or npm run theme:pull-authored.");
  try {
    const slug = args.designs[0] ?? "maison-v2";
    if ((CTA_ALLOWED_SLUGS as readonly string[]).includes(slug)) {
      const [released, draft] = await Promise.all([ports.loadReleased(slug), ports.loadDraft(slug)]);
      const plan = planCta(slug, released, draft, ports.seed());
      printCtaPlan(plan, log);
    }
  } catch {
    /* diagnostic only */
  }
  return 2;
}
