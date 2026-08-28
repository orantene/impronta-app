/**
 * INVARIANT — any <TalentCardActions> that can ADD to the lineup must hand over
 * a portraitUrl.
 *
 * `registerCartTalent` is the OPTIMISTIC presentation layer: the card knows the
 * photo it is already rendering, so it seeds the launcher rail and the lineup
 * instantly. Pass nothing and the entry falls through to
 * `useResolveCartPortraits`, which debounces 250ms and then does a server
 * round-trip — so the freshly added talent sits as a grey placeholder for a
 * visible beat while the ones added from a better-wired surface show a photo.
 *
 * Reported from the Impronta storefront: adding from FEATURED TALENT left the
 * new row grey while the rows beside it had photos. `featured_talent` and one
 * arm of `DirectoryCardAdapter` were both omitting the prop.
 *
 * Only ADD surfaces matter. A call site with `hideInquiry` renders the favorite
 * control alone, never touches the cart, and is correctly exempt.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (p.endsWith(".tsx")) out.push(p);
  }
  return out;
}

/**
 * Extract each real <TalentCardActions ... /> element as raw text. Prose in
 * comments mentions the component by name constantly, so require the tag to be
 * followed by whitespace (a real element opens onto its props) and drop any
 * match that starts on a comment line.
 */
function elements(src: string): string[] {
  const out: string[] = [];
  const re = /<TalentCardActions\s[^]*?\/>/g;
  for (const m of src.matchAll(re)) {
    const lineStart = src.lastIndexOf("\n", m.index ?? 0) + 1;
    const line = src.slice(lineStart, m.index).trimStart();
    if (line.startsWith("//") || line.startsWith("*")) continue;
    out.push(m[0]);
  }
  return out;
}

test("every lineup-adding TalentCardActions passes portraitUrl", () => {
  const offenders: string[] = [];

  for (const file of walk(SRC)) {
    const src = readFileSync(file, "utf8");
    if (!src.includes("<TalentCardActions")) continue;
    // Card Design Studio renders inert demo cards for the admin preview.
    if (file.includes("page-modules/CardDesignStudio")) continue;

    for (const el of elements(src)) {
      if (el.includes("hideInquiry")) continue;      // favorite-only, never adds
      if (el.includes("portraitUrl")) continue;
      offenders.push(path.relative(process.cwd(), file));
    }
  }

  assert.deepEqual(
    [...new Set(offenders)],
    [],
    "These surfaces add to the lineup without handing over the photo they are " +
      "already rendering, so the new row shows a grey placeholder until a " +
      "debounced server round-trip fills it in:\n\n" +
      [...new Set(offenders)].join("\n") +
      "\n\nPass portraitUrl={<the card's image url>}, or hideInquiry if the " +
      "surface should not add to the lineup at all.",
  );
});
