import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * The Spanish Terms / Privacy / Cookies bodies must stay equivalent to the
 * English ones: same sections, same links and mailboxes, same figures (retention
 * periods, durations, fees, uptime), and the same DRAFT PENDING LEGAL REVIEW
 * marker. A paragraph added to the English page without its Spanish twin fails
 * here instead of shipping a one-language legal page.
 */
const read = (p: string) => readFileSync(p, "utf8");
const PAGES = ["terms", "privacy", "cookies", "refunds"] as const;
const dir = (n: string) => `src/app/(marketing)/legal/${n}`;

const headings = (s: string) => [...s.matchAll(/heading: "([^"]+)"/g)].map((m) => m[1]);
const hrefs = (s: string) => [...s.matchAll(/href="(https?:\/\/[^"]+|\/legal\/[a-z]+)"/g)].map((m) => m[1]).sort();
const mailboxes = (s: string) => [...s.matchAll(/mailto:([a-z]+)@/g)].map((m) => m[1]).sort();
/** Numbers in the prose and table cells only: attributes, comments and imports are stripped. */
const figures = (s: string) =>
  [
    ...s
      .replace(/\\u[0-9a-fA-F]{4}/g, "")
      .replace(/^import [^\n]*$/gm, "")
      .replace(/\/\/[^\n]*/g, "")
      .replace(/className="[^"]*"/g, "")
      .replace(/style=\{[^}]*\}/g, "")
      .replace(/https?:\/\/[^"]+/g, "")
      .replace(/\d{4}-\d{2}-\d{2}/g, "")
      .matchAll(/\d+(?:\.\d+)?/g),
  ]
    .map((m) => m[0])
    .sort();

for (const n of PAGES) {
  const en = read(`${dir(n)}/page.tsx`);
  const es = read(`${dir(n)}/${n}-es.tsx`);

  test(`${n}: Spanish body is served by locale and keeps the review marker`, () => {
    // Accept either inline `await getRequestLocale()` or a prior `const locale = …`
    // binding (privacy/cookies stash locale for withLocaleHref cross-links).
    assert.match(
      en,
      /if \((?:\(await getRequestLocale\(\)\)|locale) === "es"\) return <\w+ \/>;/,
    );
    assert.match(en, /DRAFT PENDING LEGAL REVIEW/);
    assert.match(es, /DRAFT PENDING LEGAL REVIEW/);
  });

  test(`${n}: same number of sections, links, mailboxes and figures as English`, () => {
    assert.equal(headings(es).length, headings(en).length, "section count");
    assert.deepEqual(hrefs(es), hrefs(en), "links");
    assert.deepEqual(mailboxes(es), mailboxes(en), "mailboxes");
    assert.deepEqual(figures(es), figures(en), "numbers (periods, durations, fees)");
  });

  test(`${n}: Spanish is tú-form, no voseo, no em dashes`, () => {
    assert.doesNotMatch(es, /—/);
    assert.doesNotMatch(es, /\b(tenés|aceptás|podés|querés|sos|confirmá|revisá|vos)\b/i);
  });
}
