/**
 * media-kit-font.ts — load the Unicode typeface the media-kit PDF embeds.
 *
 * WHY THIS EXISTS
 * ───────────────
 * `pdf-lib`'s `StandardFonts.Helvetica` is WinAnsi-encoded, and `drawText`
 * THROWS on any character that encoding cannot represent. The stopgap for that
 * was `toWinAnsiSafe` in `media-kit-pdf.ts`, which turns "Анна Петрова" into
 * "? ?" so the download degrades instead of 500ing. This module replaces the
 * degradation for Latin/Greek/Cyrillic with actual glyphs, by embedding a
 * subset of Noto Sans through `@pdf-lib/fontkit`.
 *
 * COVERAGE IS READ FROM THE FILE, NOT ASSUMED
 * ───────────────────────────────────────────
 * A custom font does NOT reproduce the WinAnsi throw. `pdf-lib` happily draws
 * an uncovered codepoint as `.notdef` — the reader sees a blank box or nothing
 * at all, with no error anywhere. That is a WORSE failure than the placeholder,
 * because it is silent. So the loader derives the real covered codepoint set
 * from the font's own `characterSet` and hands it back; the renderer sanitises
 * against that set before it draws anything. Widening the subset therefore
 * widens what renders with no code change, and can never produce tofu.
 *
 * SERVERLESS PATH RESOLUTION
 * ──────────────────────────
 * `src/` is compiled away at runtime, so the `.ttf` files are NOT in the
 * serverless bundle by default — Next only traces `import`ed modules, and a
 * `readFile` path is invisible to the tracer. `next.config.ts` therefore lists
 * `src/lib/talent/fonts/*.ttf` under `outputFileTracingIncludes` for the
 * media-kit route, which copies them into the Function preserving their path
 * relative to the project root. `process.cwd()` is that root in a Vercel
 * Function, so the first candidate below resolves there and in `tsx`/`next dev`
 * alike. The extra candidates cover a cwd that is the repo root rather than
 * `web/`.
 *
 * If every candidate misses, `loadMediaKitTypeface()` returns null and the
 * caller falls back to Helvetica + the placeholder sanitiser. A font that
 * failed to ship must degrade the PDF, never fail the download.
 */

import { readFile } from "node:fs/promises";
import path from "node:path";

import fontkit from "@pdf-lib/fontkit";

export type MediaKitTypeface = {
  regular: Uint8Array;
  bold: Uint8Array;
  /** Codepoints BOTH faces can actually draw. */
  coverage: ReadonlySet<number>;
};

const FONT_DIR_FROM_WEB_ROOT = path.join("src", "lib", "talent", "fonts");
const REGULAR_FILE = "noto-sans-regular.ttf";
const BOLD_FILE = "noto-sans-bold.ttf";

function candidateDirs(): string[] {
  const cwd = process.cwd();
  return [
    // Vercel Function / `next dev` / `tsx` run from `web/`.
    path.join(cwd, FONT_DIR_FROM_WEB_ROOT),
    // A cwd of the repo root rather than the Next project root.
    path.join(cwd, "web", FONT_DIR_FROM_WEB_ROOT),
    // Last resort: relative to this module, for any bundler that keeps it.
    // `typeof` guard, not truthiness: in a pure-ESM context `__dirname` is not
    // merely undefined, referencing it is a ReferenceError.
    typeof __dirname === "string" ? path.join(__dirname, "fonts") : "",
  ].filter(Boolean);
}

async function readPair(dir: string): Promise<{ regular: Uint8Array; bold: Uint8Array }> {
  const [regular, bold] = await Promise.all([
    readFile(path.join(dir, REGULAR_FILE)),
    readFile(path.join(dir, BOLD_FILE)),
  ]);
  return { regular: new Uint8Array(regular), bold: new Uint8Array(bold) };
}

/**
 * Codepoints the face can draw. `characterSet` comes straight from the font's
 * cmap, so it is the truth about this specific subset file.
 */
function coverageOf(bytes: Uint8Array): Set<number> {
  const font = fontkit.create(Buffer.from(bytes)) as unknown as {
    characterSet?: number[];
  };
  return new Set(font.characterSet ?? []);
}

/**
 * Walk a candidate list and return the first readable, sane pair. Exported so a
 * test can drive the miss path — the "font did not ship" branch is the one that
 * decides whether a bad deploy degrades or 500s, so it needs to be exercisable
 * without deleting files from the repo.
 */
export async function loadMediaKitTypefaceFrom(
  dirs: readonly string[],
): Promise<MediaKitTypeface | null> {
  for (const dir of dirs) {
    let pair: { regular: Uint8Array; bold: Uint8Array };
    try {
      pair = await readPair(dir);
    } catch {
      continue;
    }
    try {
      const regularCoverage = coverageOf(pair.regular);
      const boldCoverage = coverageOf(pair.bold);
      // Only claim a codepoint if BOTH faces have it — headings are bold and
      // body copy is not, and a glyph present in one face only would render as
      // tofu in the other.
      const coverage = new Set<number>();
      for (const cp of regularCoverage) {
        if (boldCoverage.has(cp)) coverage.add(cp);
      }
      // A parse that yields (almost) nothing means a corrupt or wrong-format
      // file; treat it as absent rather than embedding a font that draws every
      // name as blank boxes.
      if (coverage.size < 128) continue;
      return { regular: pair.regular, bold: pair.bold, coverage };
    } catch {
      continue;
    }
  }
  return null;
}

let cached: Promise<MediaKitTypeface | null> | null = null;

/**
 * Read and validate the embeddable typeface. Cached for the life of the
 * process — the files are immutable and re-reading 234 KB per download is
 * pointless. Returns null on ANY problem, which the caller reads as
 * "fall back to Helvetica".
 */
export function loadMediaKitTypeface(): Promise<MediaKitTypeface | null> {
  cached ??= loadMediaKitTypefaceFrom(candidateDirs());
  return cached;
}
