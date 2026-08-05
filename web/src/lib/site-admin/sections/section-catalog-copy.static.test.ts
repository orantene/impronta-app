/**
 * section-catalog-copy.static.test.ts — copy guard for the hand-written section
 * catalog (FIX #7).
 *
 * WHY THIS FILE EXISTS
 * The owner's copy rules are enforced in two places today and this directory was
 * in neither:
 *   - `components/edit-chrome/editor-i18n.test.ts` bans em dashes, but only
 *     inside the editor i18n CATALOG (the EN keys + ES values). Source strings
 *     that were never wrapped in `t()` are invisible to it.
 *   - `lib/site-admin/builder-core/ai/eval-scorecard.ts` scores em dashes and
 *     banned commerce vocab, but only on AI-GENERATED nodes at generation time.
 *     Hand-written catalog copy never passes through it.
 * The result: ~115 prose em dashes accumulated under `sections/**` (56 in
 * `shared/default-content.ts` alone, which SHIPS TO PUBLISHED TENANT SITES as
 * seed content), plus two "inquiry-cart" strings that violate the commerce-
 * vocabulary rule in a surface the AI scorecard never sees. This guard closes
 * that gap by scanning the SOURCE TEXT of the section catalog directly.
 *
 * SCOPE — user-visible copy only. Code comments (`//`, `/* … *\/`, and JSX
 * `{​/* … *\/}`) are exempt: the rules are about product copy, not about how
 * engineers annotate the code. The scanner strips comments before matching.
 *
 * Test runner: node:test + node:assert/strict
 * Run:  npm run test:builder
 */

import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const HERE = dirname(fileURLToPath(import.meta.url));
const SECTIONS_ROOT = resolve(HERE); // src/lib/site-admin/sections

/**
 * Banned commerce vocabulary. Deliberately the SAME list as `BANNED_VOCAB` in
 * `builder-core/ai/eval-scorecard.ts` — the owner rule ("never buyer / cart /
 * pay to DM; the person booking talent is a CLIENT") does not care whether a
 * string was written by the model or by us, but until FIX #7 only the model's
 * output was ever checked.
 */
const BANNED_VOCAB = /\b(buyer|cart|checkout|add to cart|shop|purchase|pay to dm)\b/i;

/**
 * Structure nouns that leak implementation detail into operator-facing copy.
 * The product vocabulary is "section" and "block" (plus "canvas" where it
 * genuinely means the canvas). See the sibling sweep in edit-chrome.
 */
const STRUCTURE_JARGON = /\b(nodes?|viewports?|slots?|freeform|hydrates?)\b/i;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name) && !name.includes(".test.")) out.push(full);
  }
  return out;
}

/**
 * Yield `[lineNumber, codeText]` for every line, with comments blanked out.
 * Handles `//` trailing comments, `/* … *\/` blocks, and the JSX `{​/* … *\/}`
 * form. Deliberately simple: it can only ever UNDER-report (by blanking a line
 * that was really code), never invent a violation in a comment.
 */
function codeLines(text: string): Array<[number, string]> {
  const out: Array<[number, string]> = [];
  let inBlock = false;
  text.split("\n").forEach((line, i) => {
    const trimmed = line.trim();
    const wasBlock = inBlock;
    if (inBlock) {
      if (trimmed.includes("*/")) inBlock = false;
    } else if (/\/\*/.test(trimmed) && !/\*\//.test(trimmed)) {
      inBlock = true;
    }
    if (wasBlock) return;
    if (/^(\/\/|\*|\/\*|\{\s*\/\*)/.test(trimmed)) return;
    const code = line.replace(/\/\/[^"'`]*$/, "");
    out.push([i + 1, code]);
  });
  return out;
}

function rel(file: string): string {
  return file.slice(SECTIONS_ROOT.length + 1).split("\\").join("/");
}

/**
 * The COPY CANDIDATES on a line: the fragments a human being could actually
 * read in the product. Two shapes, both deliberately conservative:
 *
 *   1. Quoted string literals CONTAINING A SPACE. The space test is what keeps
 *      identifiers, import paths, prop names, enum values and CSS classes out
 *      (`"@/lib/talent-cards/use-inquiry-cart"`, `"checkoutUrl"`, `"—"`), while
 *      keeping every real sentence in. A single word is never a copy rule
 *      violation worth failing a build over; a sentence is.
 *   2. Bare JSX text — a line with no quotes at all and none of the punctuation
 *      that marks it as code (`=`, `;`, `=>`). Multi-line JSX bodies land here,
 *      which is exactly how the "inquiry-cart affordance" prose was written.
 *
 * Consequence worth knowing: this can only UNDER-report. A violation smuggled
 * into a one-word string or a template hole slips through. That is the right
 * trade for a guard that must never fire on `import … from "…/use-inquiry-cart"`.
 */
function copyCandidates(code: string): string[] {
  const out: string[] = [];
  const quoted = code.match(/"[^"]*"|'[^']*'|`[^`]*`/g) ?? [];
  for (const q of quoted) {
    const inner = q.slice(1, -1);
    if (inner.includes(" ")) out.push(inner);
  }
  if (quoted.length === 0) {
    const t = code.trim();
    if (t && !/[=;]|=>/.test(t)) out.push(t);
  }
  return out;
}

function scan(match: (copy: string) => boolean, onlyMetaFiles = false): string[] {
  const offenders: string[] = [];
  for (const file of walk(SECTIONS_ROOT)) {
    const r = rel(file);
    if (onlyMetaFiles && !r.endsWith("/meta.ts")) continue;
    for (const [lineNo, code] of codeLines(readFileSync(file, "utf8"))) {
      for (const copy of copyCandidates(code)) {
        if (match(copy)) {
          offenders.push(`${r}:${lineNo}  ${copy.trim()}`);
          break;
        }
      }
    }
  }
  return offenders;
}

test("self-check: copy extraction keeps prose and drops identifiers", () => {
  // Real copy is picked up …
  assert.deepEqual(
    copyCandidates('successMessage: "Thanks — we\'ll be in touch.",'),
    ["Thanks — we'll be in touch."],
  );
  // … bare JSX text is picked up …
  assert.deepEqual(
    copyCandidates("        the shell — the same discovery cluster it uses"),
    ["the shell — the same discovery cluster it uses"],
  );
  // … single-word strings, import paths and identifiers are not.
  assert.deepEqual(
    copyCandidates('import { useInquiryCart } from "@/lib/use-inquiry-cart";'),
    [],
  );
  assert.deepEqual(copyCandidates("  const cart = useInquiryCart();"), []);
  // A lone "—" empty-value placeholder is a glyph, not prose.
  assert.deepEqual(copyCandidates('<option value="">—</option>'), []);
  assert.deepEqual(copyCandidates('if (["-", "—", ""].includes(v)) return "—";'), []);
});

test("no em dashes in section catalog copy (owner copy rule)", () => {
  const offenders = scan((copy) => copy.includes("—"));
  assert.equal(
    offenders.length,
    0,
    `Em dashes are banned in user-facing copy (owner rule). Use a colon, a ` +
      `comma, parentheses, or a sentence break, whichever reads best for that ` +
      `particular string. A lone "—" as an empty-value placeholder is fine and ` +
      `is not matched here. Note that shared/default-content.ts SHIPS TO ` +
      `PUBLISHED TENANT SITES as seed content. Offenders:\n` +
      offenders.join("\n"),
  );
});

test("no banned commerce vocabulary in section catalog copy", () => {
  const offenders = scan((copy) => BANNED_VOCAB.test(copy));
  assert.equal(
    offenders.length,
    0,
    `Banned commerce vocabulary (owner rule): the person booking talent is a ` +
      `CLIENT, never a "buyer", and they build a LINEUP, never a "cart". This ` +
      `is the same vocabulary the AI scorecard enforces on generated copy ` +
      `(builder-core/ai/eval-scorecard.ts); hand-written catalog copy is held ` +
      `to it too. Offenders:\n` +
      offenders.join("\n"),
  );
});

test("no structure jargon in add-block gallery copy (meta.ts)", () => {
  // `meta.ts` only: those `label` / `description` strings are what the operator
  // reads on the add-block gallery cards. Schemas and components use the same
  // words as real identifiers, which is legitimate.
  const offenders = scan((copy) => STRUCTURE_JARGON.test(copy), true);
  assert.equal(
    offenders.length,
    0,
    `Add-block gallery copy must use only "section" and "block" as structure ` +
      `nouns (plus "canvas" where it really means the canvas). "node", ` +
      `"viewport", "slot", "freeform" and "hydrate" are implementation words ` +
      `the operator never needs to learn. Offenders:\n` +
      offenders.join("\n"),
  );
});
