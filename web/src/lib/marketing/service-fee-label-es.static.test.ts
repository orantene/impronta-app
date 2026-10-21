import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { getPricingLaddersCopy } from "./pricing-ladders-copy";
import { buildGuestCorpus } from "@/lib/support/guest-corpus";

/**
 * The Spanish name of the Tulala fee is "cargo por servicio de Tulala" (PM decision F8,
 * TUL-1481): it is what live checkout already says. The ticket fee table, the pricing
 * ladders and the guest bot corpus must not call the same fee "cuota de servicio",
 * "tarifa de servicio" or just "la misma tarifa".
 *
 * The message catalogue (messages/es.json) is held to the same label: its "serviceFee"
 * keys must read "Cargo por servicio" and no value may use the off-label words.
 *
 * Out of scope on purpose: the terms clause (F2), the percentage (F1), the refund rule
 * (F5) and the launch announcement (F7) wait for Oran, and "cuota fija" in the ticket
 * table is the generic flat-fee idea (Eventbrite's fixed fee), not the Tulala fee.
 */

const FILES = [
  "src/components/marketing/ticket-fee-table.tsx",
  "src/lib/marketing/pricing-ladders-copy.ts",
  "src/lib/support/guest-corpus.ts",
];

const OFF_LABEL = /cuota de servicio|tarifa de servicio|la misma tarifa/i;

function copyLines(file: string): Array<{ n: number; text: string }> {
  return readFileSync(file, "utf8")
    .split("\n")
    .map((text, i) => ({ n: i + 1, text }))
    .filter(({ text }) => !/^\s*(\/\/|\*|\/\*)/.test(text)); // comments are not user-facing
}

test("the ticket table, pricing ladders and bot corpus use only the final Spanish fee label", () => {
  const hits: string[] = [];
  for (const f of FILES) {
    for (const { n, text } of copyLines(f)) {
      if (OFF_LABEL.test(text)) hits.push(`${f}:${n}: ${text.trim().slice(0, 100)}`);
    }
  }
  assert.deepEqual(hits, [], `off-label Spanish fee wording:\n${hits.join("\n")}`);
});

test("each of the three still says the fee in the final words", () => {
  const ticket = readFileSync(FILES[0], "utf8");
  assert.match(ticket, /Nuestro cargo por servicio lo fija tu plan/);
  const ladders = JSON.stringify(getPricingLaddersCopy("es").fee);
  assert.match(ladders, /El mismo cargo por servicio aplica/);
  assert.ok(!OFF_LABEL.test(ladders), "rendered pricing ladder fee card still uses an off-label word");
  const corpus = buildGuestCorpus("es")
    .map((e) => `${e.purpose} ${(e.youCanHere ?? []).join(" ")} ${(e.faqs ?? []).map((q) => `${q.q} ${q.a}`).join(" ")}`)
    .join("\n");
  assert.match(corpus, /El mismo cargo por servicio desde el hub/);
  assert.ok(!OFF_LABEL.test(corpus), "the Spanish guest corpus still uses an off-label word");
});

test("messages/es.json uses one label for the fee everywhere customers see it", () => {
  const es = JSON.parse(readFileSync("messages/es.json", "utf8")) as unknown;
  const hits: string[] = [];
  const labels: Array<[string, string]> = [];
  (function walk(node: unknown, path: string) {
    if (typeof node === "string") {
      if (OFF_LABEL.test(node)) hits.push(`${path}: ${node.slice(0, 80)}`);
      return;
    }
    if (node && typeof node === "object") {
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
        const here = path ? `${path}.${k}` : k;
        if (k === "serviceFee" && typeof v === "string") labels.push([here, v]);
        walk(v, here);
      }
    }
  })(es, "");
  assert.deepEqual(hits, [], `off-label Spanish fee wording in messages/es.json:\n${hits.join("\n")}`);
  assert.ok(labels.length >= 1, 'expected at least one "serviceFee" label in messages/es.json');
  for (const [path, value] of labels) assert.equal(value, "Cargo por servicio", path);
});

test('"cargo" is masculine: no feminine pronoun is left near it in the Spanish fee copy', () => {
  // Changing "cuota" (feminine) to "cargo" (masculine) must carry the pronouns with it:
  // "lo fija", "Lo paga", "lo ve", "el más alto". Looks at the 240 characters after each mention.
  const FEMININE_LEFTOVER = /\bla fija\b|\bLa paga\b|\bla ve antes\b|\bla más alta\b/;
  const hits: string[] = [];
  for (const f of FILES) {
    const text = readFileSync(f, "utf8");
    for (const m of text.matchAll(/cargo por servicio/gi)) {
      const near = text.slice(m.index ?? 0, (m.index ?? 0) + 240);
      const bad = FEMININE_LEFTOVER.exec(near);
      if (bad) hits.push(`${f}: "${bad[0]}" near "${near.slice(0, 60).replace(/\n/g, " ")}..."`);
    }
  }
  assert.deepEqual(hits, [], `feminine pronoun left after "cargo por servicio":\n${hits.join("\n")}`);
  // The sentence itself, spelled out.
  const ticket = readFileSync(FILES[0], "utf8");
  assert.match(ticket, /Lo paga el comprador al final, y lo ve antes de pagar\. La tabla usa el más alto\./);
});
