/**
 * RETIRED (TUL-366 / THEME CORE P0-3).
 *
 * Maison v2 booking CTA ships through Builder Lab only:
 *   Talent Template Factory → Review code seed → publish demos → open to talents.
 * Export overlay via Factory "Copy overlay for git" or `npm run theme:pull-authored`.
 *
 * This entry point always exits 2 and never writes.
 */
import { parseArgs, run, type CtaPorts } from "./release-theme-cta-plan";

const parsed = parseArgs(process.argv.slice(2));
const args = parsed.ok
  ? parsed.args
  : {
      designs: ["maison-v2"] as string[],
      apply: false,
      yes: false,
      releaseToTalents: false,
      includeOpenDraft: [] as string[],
      actor: null as string | null,
      rollout: null as number | null,
    };

if (!parsed.ok) {
  console.error(`REFUSED: ${parsed.error}`);
}

const ports: CtaPorts = {
  seed: () => ({ shellTree: [], homeTree: [] }),
  log: (l) => console.error(l),
  findActor: async () => null,
  loadReleased: async () => null,
  loadDraft: async () => null,
  openDraft: async () => ({ ok: false, error: "retired" }),
  saveTree: async () => ({ ok: false, error: "retired" }),
  preview: async () => ({ ok: false, error: "retired" }),
  publishDemos: async () => ({ ok: false, error: "retired" }),
  findRelease: async () => null,
  setRollout: async () => ({ ok: false, error: "retired" }),
  openToTalents: async () => ({ ok: false, error: "retired" }),
};

process.exit(await run(args, ports));
