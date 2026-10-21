import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import {
  dismissCookieName,
  parseDismissedMs,
  selectWhatsNew,
  type WhatsNewRow,
  type WhatsNewViewer,
} from "./whats-new";

function row(id: string, over: Partial<WhatsNewRow> = {}): WhatsNewRow {
  return {
    notion_page_id: id,
    status: "published",
    tier: 2,
    badge: "New",
    title_en: "Promos",
    title_es: "Promos ES",
    summary_en: "Make a discount.",
    summary_es: "Crea un descuento.",
    audience: ["Talent"],
    plans: ["Paid"],
    help_url: "https://tulala.digital/help/articles/promos",
    cover_image_url: null,
    published_at: "2026-10-14T00:00:00Z",
    release_date: null,
    ...over,
  };
}

const talentPaid: WhatsNewViewer = { audiences: ["Talent"], plan: "paid", locale: "es" };
const talentFree: WhatsNewViewer = { audiences: ["Talent"], plan: "free", locale: "en" };

test("TUL-1395: a Talent + Paid entry shows only to paid talents, in their language", () => {
  const rows = [row("a")];
  const paid = selectWhatsNew(rows, talentPaid, 0);
  assert.equal(paid.length, 1);
  assert.equal(paid[0].title, "Promos ES");
  assert.deepEqual(selectWhatsNew(rows, talentFree, 0), []);
  assert.equal(selectWhatsNew(rows, { ...talentPaid, locale: "en" }, 0)[0].title, "Promos");
});

test("TUL-1395: audience, tier and status filters", () => {
  const rows = [
    row("biz", { audience: ["Business"], plans: [] }),
    row("tier1", { tier: 1, plans: [] }),
    row("paused", { status: "paused", plans: [] }),
    row("everyone", { audience: [], plans: [] }),
  ];
  assert.deepEqual(selectWhatsNew(rows, talentFree, 0).map((i) => i.id), ["everyone"]);
  const biz: WhatsNewViewer = { audiences: ["Business", "Agency"], plan: "free", locale: "en" };
  assert.deepEqual(selectWhatsNew(rows, biz, 0).map((i) => i.id).sort(), ["biz", "everyone"]);
});

test("TUL-1395: dismiss persists until something newer is published", () => {
  const rows = [row("old", { published_at: "2026-10-01T00:00:00Z", plans: [] }), row("new", { published_at: "2026-10-18T00:00:00Z", plans: [] })];
  const dismissedAt = Date.parse("2026-10-18T00:00:00Z");
  assert.deepEqual(selectWhatsNew(rows, talentFree, dismissedAt), []);
  const later = [...rows, row("newer", { published_at: "2026-10-19T00:00:00Z", plans: [] })];
  assert.deepEqual(selectWhatsNew(later, talentFree, dismissedAt).map((i) => i.id), ["newer"]);
  assert.equal(parseDismissedMs("1760000000000"), 1760000000000);
  assert.equal(parseDismissedMs("junk"), 0);
  assert.equal(parseDismissedMs(undefined), 0);
});

test("TUL-1395: the dismissal cookie is per user", () => {
  assert.notEqual(dismissCookieName("aaaaaaaa-1111"), dismissCookieName("bbbbbbbb-2222"));
  assert.match(dismissCookieName("a-b-c"), /^tulala_wn_[a-zA-Z0-9]+$/);
});

function walk(dir: string, out: string[] = []): string[] {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(n)) out.push(p);
  }
  return out;
}

test("TUL-1395: the card is mounted on the two private dashboards and on no public site", () => {
  const root = join(process.cwd(), "src");
  const users = walk(root).filter((f) => !f.endsWith(".test.ts") && /WhatsNewCard|changelog\/whats-new/.test(readFileSync(f, "utf8")));
  const rel = users.map((f) => f.slice(root.length + 1)).sort();
  for (const f of rel) {
    assert.ok(
      f.startsWith("lib/changelog/") ||
        f.startsWith("components/changelog/") ||
        f === "app/(workspace)/talent/today/page.tsx" ||
        f === "app/(workspace)/[tenantSlug]/admin/page.tsx",
      `unexpected user of the What's new card: ${f}`,
    );
  }
  assert.ok(rel.includes("app/(workspace)/talent/today/page.tsx"));
  assert.ok(rel.includes("app/(workspace)/[tenantSlug]/admin/page.tsx"));
});

test("TUL-1395: the card is a server component with a form dismiss and no em dashes", () => {
  const src = readFileSync(join(process.cwd(), "src/components/changelog/WhatsNewCard.tsx"), "utf8");
  assert.doesNotMatch(src, /^"use client"/m);
  assert.match(src, /dismissWhatsNewAction/);
  assert.ok(!src.includes("—"));
  assert.match(src, /Novedades/);
  assert.match(src, /Try it/);
});
