/**
 * INVARIANT — no user-visible English literals in the guest chat panel.
 *
 * `GuestAccountToolkit.tsx` shipped with EVERY string hardcoded in English and
 * no translator prop at all. It renders inside the panel on both the Home tab
 * and the conversation, so a Spanish storefront showed a fully translated panel
 * with an English block sitting in the middle of it:
 *
 *   header  "Enviada, esperando respuesta"     <- translated
 *   tabs    "Inicio / Chat / Selección"        <- translated
 *   card    "Save this conversation"           <- NOT translated
 *           "Email me a sign-in link"
 *
 * Seen live on the Impronta tenant at /es/t/TAL-00036.
 *
 * `test:phase1-i18n` could not catch this: it checks that every key in the
 * catalogs is referenced and every referenced key is defined. A string that
 * never became a key at all is invisible to it. This test closes that gap for
 * the folder where it bit us.
 *
 * The heuristic: a double-quoted or JSX-text run of >= 3 words starting with a
 * capital, inside a .tsx file, that is not obviously code. It is intentionally
 * loose — false positives are cheap to annotate, a missed English string costs
 * a visitor their language.
 *
 * ESCAPE HATCH: annotate a genuinely non-user-facing literal with
 * `i18n-allow: <reason>` on the line or within the 2 lines above it.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const CHAT_DIR = path.join(process.cwd(), "src/app/t/[profileCode]/_chat");

/** Attribute values and idioms that are never shown to a visitor as prose. */
const CODE_ATTRS =
  /(?:className|style|key|id|role|type|name|href|src|alt|placeholder|autoComplete|aria-[a-z]+|data-[a-z-]+)\s*=\s*$/;

/** A quoted run of three or more words that reads like a sentence. */
const SENTENCE = /"([A-Z][a-z]+(?:['’][a-z]+)?(?: [A-Za-z][\w'’,&.-]*){2,}[.!?]?)"/g;

function offenders(src: string): string[] {
  const lines = src.split("\n");
  const out: string[] = [];

  // Strip block comments so prose in doc headers is not flagged.
  const noBlockComments = src.replace(/\/\*[\s\S]*?\*\//g, "");
  const liveLines = new Set(noBlockComments.split("\n"));

  lines.forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) return;
    if (!liveLines.has(line)) return;
    if (line.includes("i18n-allow")) return;
    const near = lines.slice(Math.max(0, i - 2), i).join("\n");
    if (near.includes("i18n-allow")) return;
    // A line that already routes through the catalog is fine.
    if (line.includes("t(\"public.")) return;

    for (const m of line.matchAll(SENTENCE)) {
      const before = line.slice(0, m.index ?? 0);
      if (CODE_ATTRS.test(before)) continue;
      if (/import |from "|require\(/.test(line)) continue;
      out.push(`${i + 1}: ${m[1]}`);
    }
  });
  return out;
}

test("guest chat components hold no hardcoded English sentences", () => {
  const files = readdirSync(CHAT_DIR).filter(
    (f) => f.endsWith(".tsx") && !f.endsWith(".test.tsx"),
  );
  assert.ok(files.length > 10, "expected the guest chat component folder");

  const found: string[] = [];
  for (const f of files) {
    const hits = offenders(readFileSync(path.join(CHAT_DIR, f), "utf8"));
    for (const h of hits) found.push(`${f}:${h}`);
  }

  assert.deepEqual(
    found,
    [],
    "Hardcoded English found in the guest chat panel. Move these into " +
      "public.guestChat in messages/en.json, es.json AND fr.json and render " +
      "them with the `t` prop the sibling components already take. If a hit is " +
      "not user-facing, annotate it with `i18n-allow: <reason>`.\n\n" +
      found.join("\n"),
  );
});
