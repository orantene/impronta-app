/**
 * hex-literal-ratchet.ts — the mechanism behind the hardcoded-colour gate.
 *
 * WHY THIS EXISTS
 * ───────────────
 * A colour rule that lives in a checklist and a doc is not enforced. The
 * 2026-09-03 four-surface audit measured 1,476 six-digit hex literals on the
 * workspace admin surface and 152 on marketing, including brass golds that the
 * PR checklist bans by name, sitting three lines under a comment explaining
 * why they should not be there. Nothing could fail on any of them.
 *
 * This ratchet freezes what exists and refuses what is new. Every file on an
 * enrolled surface carries a recorded count of hex literals; a commit may lower
 * a file's count, never raise it, and a file that is not in the baseline may
 * carry none at all. The design tokens (`--tl-*` for marketing,
 * `--color-admin-*` / the `admin-*` utilities for the workspace) are the way
 * to paint a pixel; a raw hex is a decision that needs a name.
 *
 * WHAT COUNTS
 * ───────────
 *   • `#RRGGBB` and `#RRGGBBAA`, case-insensitive, not followed by another
 *     hex-ish character. Three-digit `#fff` is NOT counted: the audit's number
 *     was six-digit only, and this gate reproduces that number before it
 *     tightens anything. Widening the pattern is a one-line change plus a
 *     re-baseline, and it should be its own PR.
 *   • Only in CODE. Comments are blanked before scanning (`blankComments`), so
 *     a history note such as "was #8A6F1A" never trips the gate and never
 *     satisfies it. The Creative Director's J7 ruling: comments are text.
 *   • Only in source that paints: `.ts` `.tsx` `.js` `.jsx` `.mjs` `.cjs`
 *     `.css`. Test files are skipped: a test asserting a hex is measuring a
 *     pixel, not painting one.
 *
 * EXEMPTIONS ARE DELIBERATE, WITH A REASON EACH
 * ────────────────────────────────────────────
 * Email HTML must carry inline hex because mail clients drop stylesheets and
 * custom properties alike. That file is exempt here on purpose, so that nobody
 * discovers the gate by hitting it on an email template and switches the gate
 * off. Add to `EXEMPT_FILES` only with a reason a reviewer can check.
 *
 * THE RATCHET TURNS BOTH WAYS
 * ───────────────────────────
 *   • OVER the recorded count → fail, naming each new literal with its line.
 *   • UNDER the recorded count → fail too, asking for a re-record, so the win
 *     is locked in and the slack cannot become headroom for the next hardcode.
 *   • A file in the baseline that no longer has any literal, or no longer
 *     exists, is a stale entry and fails the liveness test.
 *
 * Re-record with `node scripts/regen-hex-literal-ratchet-baseline.mjs` AFTER
 * you have fixed or justified the drift, never to turn a red test green.
 *
 * This module deliberately does NOT import `node:test`, so `next build` and
 * `tsc` can treat it like any other source file. The tests live in
 * `hex-literal-ratchet.static.test.ts`, on the `test:size-ratchet` lane.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

import { WEB_ROOT, blankComments } from "./supabase-unchecked-read";

export { WEB_ROOT };

/**
 * The enrolled surfaces, as directories relative to `web/`. These are the two
 * the Creative Director's audit gated: the workspace admin and the marketing
 * site. Public tenant surfaces sit at zero on purpose and are not enrolled,
 * because a zero has nothing to ratchet; directory and profile surfaces are a
 * later enrolment once their owner has agreed the path set.
 */
export const SURFACES: Readonly<Record<string, readonly string[]>> = {
  admin: ["src/app/(workspace)", "src/components/admin"],
  marketing: ["src/app/(marketing)", "src/components/marketing"],
};

/**
 * Files inside an enrolled surface that may carry hex literals without a count.
 * Every entry names its reason; an entry without a reason is a hole.
 */
export const EXEMPT_FILES: Readonly<Record<string, string>> = {
  "src/app/(marketing)/get-started/actions.ts":
    "Email HTML. Mail clients drop stylesheets and custom properties, so the inline hex is the only colour that survives delivery.",
};

/** File extensions that can paint a pixel. */
const PAINTING_EXTENSIONS = /\.(?:tsx?|jsx?|mjs|cjs|css)$/;

/** Test and story files measure pixels; they do not paint them. */
const NON_PAINTING_FILE = /\.(?:test|spec|stories)\.[a-z]+$/;

/**
 * Six- or eight-digit hex, not embedded in a longer identifier-ish run. The
 * trailing guard stops `#abcdef12345` and `#deadbeefcafe` (both hashes, not
 * colours) from counting as a colour plus noise, and stops a six-digit match
 * from being taken out of the middle of an eight-digit one.
 */
export const HEX_LITERAL = /#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?(?![0-9a-zA-Z_-])/g;

export interface HexHit {
  /** Path relative to `web/`, always forward-slashed. */
  readonly file: string;
  /** 1-based line in the ORIGINAL source (comment blanking preserves lines). */
  readonly line: number;
  readonly value: string;
}

/** Every hex literal in one file's code, comments excluded. */
export function findHexLiterals(source: string, file: string): HexHit[] {
  const code = blankComments(source);
  const hits: HexHit[] = [];
  const lines = code.split("\n");
  for (let i = 0; i < lines.length; i++) {
    for (const m of lines[i].matchAll(HEX_LITERAL)) {
      hits.push({ file, line: i + 1, value: m[0] });
    }
  }
  return hits;
}

function walk(dir: string, out: string[]): string[] {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (PAINTING_EXTENSIONS.test(entry) && !NON_PAINTING_FILE.test(entry)) out.push(full);
  }
  return out;
}

/** Whether a `web/`-relative path is inside an enrolled surface. */
export function surfaceOf(webRelativePath: string): string | null {
  for (const [name, roots] of Object.entries(SURFACES)) {
    if (roots.some((root) => webRelativePath === root || webRelativePath.startsWith(`${root}/`))) {
      return name;
    }
  }
  return null;
}

/** Scan every enrolled surface. Exempt files are skipped, not counted. */
export function scanSurfaces(root = WEB_ROOT): HexHit[] {
  const out: HexHit[] = [];
  for (const roots of Object.values(SURFACES)) {
    for (const surfaceRoot of roots) {
      for (const abs of walk(join(root, surfaceRoot), [])) {
        const rel = relative(root, abs).split(sep).join("/");
        if (rel in EXEMPT_FILES) continue;
        out.push(...findHexLiterals(readFileSync(abs, "utf8"), rel));
      }
    }
  }
  return out;
}

/** `web/`-relative path → number of hex literals. Files at zero are omitted. */
export type Baseline = Readonly<Record<string, number>>;

export function countByFile(hits: readonly HexHit[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const hit of hits) counts[hit.file] = (counts[hit.file] ?? 0) + 1;
  return counts;
}

export interface Drift {
  readonly file: string;
  readonly recorded: number;
  readonly actual: number;
  /** The literals present now, so an "over" message can name the new ones. */
  readonly hits: readonly HexHit[];
}

/** Files whose count moved in EITHER direction from the recorded baseline. */
export function diffAgainstBaseline(hits: readonly HexHit[], baseline: Baseline): Drift[] {
  const actual = countByFile(hits);
  const files = new Set([...Object.keys(actual), ...Object.keys(baseline)]);
  const drift: Drift[] = [];
  for (const file of [...files].sort()) {
    const recorded = baseline[file] ?? 0;
    const now = actual[file] ?? 0;
    if (recorded !== now) {
      drift.push({ file, recorded, actual: now, hits: hits.filter((h) => h.file === file) });
    }
  }
  return drift;
}

/** Sum of a baseline, per enrolled surface, for the report line. */
export function totalsBySurface(baseline: Baseline): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const name of Object.keys(SURFACES)) totals[name] = 0;
  for (const [file, n] of Object.entries(baseline)) {
    const surface = surfaceOf(file);
    if (surface) totals[surface] += n;
  }
  return totals;
}

export function explainDrift(drift: readonly Drift[]): string {
  return drift
    .map((d) => {
      if (d.actual > d.recorded) {
        const listed = d.hits
          .slice(0, 12)
          .map((h) => `      ${h.file}:${h.line}  ${h.value}`)
          .join("\n");
        const more = d.hits.length > 12 ? `\n      … and ${d.hits.length - 12} more` : "";
        return (
          `  ${d.file}: ${d.actual} hex literal(s), recorded ${d.recorded} (+${d.actual - d.recorded}).\n` +
          `    Paint with a design token instead: \`--tl-*\` on marketing surfaces, the\n` +
          `    \`admin-*\` scale on workspace surfaces (see src/styles/admin-color-bridge.css).\n` +
          `    A raw hex needs a name; if it truly has none yet, ask the Creative Director\n` +
          `    for one rather than inventing it here.\n` +
          `    Literals in this file now:\n${listed}${more}`
        );
      }
      return (
        `  ${d.file}: ${d.actual} hex literal(s), recorded ${d.recorded} (${d.actual - d.recorded}).\n` +
        `    Good: lock it in. Re-record the baseline so the reduction cannot become headroom.`
      );
    })
    .join("\n\n");
}
