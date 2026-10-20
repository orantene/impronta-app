import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  asksAboutChanges,
  audienceForSurface,
  selectChangelogGrounding,
  type GroundingChangelogRow,
} from "./support-grounding";

function row(id: string, over: Partial<GroundingChangelogRow> = {}): GroundingChangelogRow {
  return {
    notion_page_id: id,
    status: "published",
    title_en: "Promo codes now apply at checkout",
    title_es: "Los códigos de promo ya se aplican al pagar",
    summary_en: "Fixed: a promo code was ignored on some bookings.",
    summary_es: "Arreglado: un código de promo se ignoraba en algunas reservas.",
    audience: ["Talent"],
    categories: ["Promos"],
    help_url: null,
    published_at: "2026-10-14T00:00:00Z",
    release_date: null,
    ...over,
  };
}

test("TUL-1396: only questions about changes pull the changelog in", () => {
  assert.equal(asksAboutChanges("what's new?"), true);
  assert.equal(asksAboutChanges("¿Qué hay de nuevo?"), true);
  assert.equal(asksAboutChanges("was the promo bug fixed"), true);
  assert.equal(asksAboutChanges("¿ya arreglaron el error de las promos?"), true);
  assert.equal(asksAboutChanges("how do I change my price"), false);
});

test("TUL-1396: unpublished entries are never used", () => {
  const out = selectChangelogGrounding([row("a", { status: "paused" }), row("b", { status: "draft" })], {
    question: "what's new", locale: "en", audience: "Talent",
  });
  assert.deepEqual(out, []);
});

test("TUL-1396: the entry comes back in the asker's language", () => {
  const es = selectChangelogGrounding([row("a")], { question: "ya arreglaron el error de promos", locale: "es-MX", audience: "Talent" });
  assert.equal(es[0]?.title, "Los códigos de promo ya se aplican al pagar");
  const en = selectChangelogGrounding([row("a")], { question: "was the promo bug fixed", locale: "en", audience: "Talent" });
  assert.equal(en[0]?.title, "Promo codes now apply at checkout");
  assert.equal(en[0]?.slug, "changelog:a");
  const fb = selectChangelogGrounding([row("a", { title_es: "", summary_es: "" })], { question: "what's new", locale: "es", audience: "Talent" });
  assert.equal(fb[0]?.title, "Promo codes now apply at checkout");
});

test("TUL-1396: audience filtering", () => {
  const rows = [row("t", { audience: ["Talent"] }), row("b", { audience: ["Business"] }), row("all", { audience: [] })];
  const ids = (a: "Talent" | "Business" | "Client" | null) =>
    selectChangelogGrounding(rows, { question: "what's new", locale: "en", audience: a }).map((e) => e.slug.slice(10)).sort();
  assert.deepEqual(ids("Talent"), ["all", "t"]);
  assert.deepEqual(ids("Business"), ["all", "b"]);
  assert.deepEqual(ids("Client"), ["all"]);
  assert.deepEqual(ids(null), ["all"]);
  assert.equal(audienceForSurface("talent"), "Talent");
  assert.equal(audienceForSurface("workspace"), "Business");
  assert.equal(audienceForSurface("guest"), null);
});

test("TUL-1396: a fix question needs real overlap; news questions list newest first and cap", () => {
  const rows = [
    row("old", { published_at: "2026-09-01T00:00:00Z", title_en: "Posts get covers", summary_en: "Add a cover.", categories: ["Posts"] }),
    row("new", { published_at: "2026-10-20T00:00:00Z" }),
  ];
  const fix = selectChangelogGrounding(rows, { question: "is the reviews export fixed", locale: "en", audience: "Talent" });
  assert.deepEqual(fix, []);
  const news = selectChangelogGrounding(rows, { question: "what's new", locale: "en", audience: "Talent", limit: 1 });
  assert.deepEqual(news.map((e) => e.slug), ["changelog:new"]);
});

test("TUL-1396: the support route wires the changelog and keeps the help grounding", () => {
  const route = readFileSync(join(process.cwd(), "src/app/api/ai/support-chat/route.ts"), "utf8");
  assert.match(route, /retrieveHelpEntriesForLocale\(/);
  assert.match(route, /selectChangelogGrounding\(/);
  assert.match(route, /CHANGELOG_SYSTEM_RULE/);
  assert.match(route, /\n      changelog,\n/);
});
