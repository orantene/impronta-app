/**
 * Catalog website control (follow-up to TUL-1329): the Status control
 * (Draft / Published / Stopped / Archived) and the website presence control
 * (Own page / In lists only / Not on the site). No migration: both live in
 * `attributes`, and "Stopped" is a draft that was switched off on purpose, so
 * the ONE sellable rule already refuses it in every context.
 *
 * Run: node_modules/.bin/tsx --test src/components/admin/shell/internal/page-modules/catalog/catalog-website-control.test.ts
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, test } from "node:test";

import { isSellable, type SellContext } from "@/lib/offerings/sellable";
import { isServicePageEligible } from "@/lib/talent-site/service-page";
import { blankOffering, offeringPriceLabel, type TalentOffering } from "@/lib/talent/offerings-types";
import {
  presenceChoiceOf,
  presencePatch,
  statusChoiceOf,
  statusPatch,
  type PresenceChoice,
  type StatusChoice,
} from "./catalog-website-control";

function item(patch: Partial<TalentOffering> = {}): TalentOffering {
  return {
    ...blankOffering({ kind: "workspace", tenantId: "t1" }, "USD", 0),
    id: "o1",
    title: "Private tour",
    amountCents: 45000,
    status: "published",
    ...patch,
  };
}
const apply = (o: TalentOffering, p: Partial<TalentOffering>): TalentOffering => ({ ...o, ...p });
const CONTEXTS: SellContext[] = ["guest", "client", "guest_request", "pos_desk"];
const STATUSES: StatusChoice[] = ["draft", "published", "stopped", "archived"];
const PRESENCES: PresenceChoice[] = ["own_page", "lists_only", "hidden"];

describe("status control", () => {
  test("round trip: each choice reads back as itself", () => {
    for (const choice of STATUSES) {
      assert.equal(statusChoiceOf(apply(item(), statusPatch(item(), choice))), choice);
    }
  });

  test("Stopped is a draft with a flag, so it is NEVER sellable in any context", () => {
    const stopped = apply(item(), statusPatch(item(), "stopped"));
    assert.equal(stopped.status, "draft");
    for (const c of CONTEXTS) assert.equal(isSellable(stopped, c), false, c);
  });

  test("a draft or archived item with a stale stopped flag does not read as Stopped once published", () => {
    const stale = item({ status: "published", attributes: { stopped: true } });
    assert.equal(statusChoiceOf(stale), "published");
    assert.equal(statusChoiceOf(apply(stale, statusPatch(stale, "draft"))), "draft");
    assert.equal(statusPatch(stale, "published").attributes?.stopped, undefined);
  });

  test("other attributes survive a status change", () => {
    const o = item({ attributes: { matrix: { warranty: "1 year" } } });
    assert.deepEqual(statusPatch(o, "stopped").attributes?.matrix, { warranty: "1 year" });
  });
});

describe("website presence control", () => {
  test("round trip: each choice reads back as itself", () => {
    for (const choice of PRESENCES) {
      assert.equal(presenceChoiceOf(apply(item(), presencePatch(item(), choice))), choice);
    }
  });

  test("In lists only has no page of its own (no page, link or sitemap entry); Own page does; Not on the site neither", () => {
    const pageOk = (o: TalentOffering) => isServicePageEligible(o);
    assert.equal(pageOk(apply(item(), presencePatch(item(), "own_page"))), true);
    assert.equal(pageOk(apply(item(), presencePatch(item(), "lists_only"))), false);
    assert.equal(pageOk(apply(item(), presencePatch(item(), "hidden"))), false);
  });

  test("coming back from Not on the site restores the website, not a leak", () => {
    const hidden = apply(item(), presencePatch(item(), "hidden"));
    assert.equal(hidden.visibility, "agency_only");
    const back = apply(hidden, presencePatch(hidden, "own_page"));
    assert.equal(back.visibility, "public");
  });
});

describe("D-10a: on_request shows no price anywhere, in every state of both controls", () => {
  const onRequest = item({ visibility: "on_request", priceDisplay: "exact", amountCents: 45000 });

  test("every status x presence combination keeps the public price line free of the price", () => {
    for (const s of STATUSES) {
      for (const p of PRESENCES) {
        let o = apply(onRequest, statusPatch(onRequest, s));
        o = apply(o, presencePatch(o, p));
        // Presence choices that leave the website on must still be on request (never public).
        if (o.visibility !== "agency_only") assert.equal(o.visibility, "on_request", `${s}/${p}`);
        // Round-trip back to the website: still no price.
        const back = apply(o, presencePatch(o, "own_page"));
        assert.notEqual(back.visibility, "public", `${s}/${p} back`);
        assert.doesNotMatch(offeringPriceLabel(back, "en"), /450|\$/, `${s}/${p}`);
      }
    }
  });
});

describe("wiring and rules", () => {
  const dir = "src/components/admin/shell/internal/page-modules/catalog/";
  const read = (p: string) => readFileSync(p, "utf8");

  test("the Channels tab draws both controls and writes only through the pure patches", () => {
    const tab = read(`${dir}item-tab-channels.tsx`);
    assert.match(tab, /<WebsiteControls /);
    const controls = read(`${dir}WebsiteControls.tsx`);
    assert.match(controls, /statusPatch\(/);
    assert.match(controls, /presencePatch\(/);
    assert.match(controls, /data-testid="catalog-status-select"/);
    assert.match(controls, /data-testid="catalog-presence-select"/);
  });

  test("the list row's publish toggle goes through statusPatch so it never leaves a stale flag", () => {
    assert.match(read(`${dir}CatalogListRow.tsx`), /statusPatch\(/);
  });

  test("no new moderation_state / status / visibility chains and no client libs: the rule stays in sellable.ts", () => {
    for (const f of ["catalog-website-control.ts", "WebsiteControls.tsx"]) {
      const src = read(`${dir}${f}`);
      assert.doesNotMatch(src, /moderation_state|moderationState|\.eq\("status"/, f);
      assert.doesNotMatch(src, /from "(@supabase|react-query|date-fns|lodash)/, f);
    }
  });

  test("ES and EN labels exist", () => {
    for (const [l, own, lists, hidden, stopped] of [
      ["en", "Own page", "In lists only", "Not on the site", "Stopped"],
      ["es", "Página propia", "Solo en listas", "No aparece en el sitio", "Detenido"],
    ] as const) {
      const m = JSON.parse(read(`messages/${l}.json`)).dashboard.catalog.websiteControl;
      assert.equal(m.presence.own_page, own);
      assert.equal(m.presence.lists_only, lists);
      assert.equal(m.presence.hidden, hidden);
      assert.equal(m.status.stopped, stopped);
      for (const k of ["draft", "published", "archived"]) assert.ok(m.status[k], `${l} status.${k}`);
    }
  });
});
