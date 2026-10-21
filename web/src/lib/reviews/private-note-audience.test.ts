/**
 * TUL-1686: the client's private-note label says who reads it.
 * Team studio -> the workspace by name; other models -> the talent; unknown -> no one.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, test } from "node:test";

import { privateNoteAudience, privateNoteLabelKey, privateNotePageLabel } from "./private-note-audience";
import { REVIEW_PAGE_EN, REVIEW_PAGE_ES } from "./review-page-copy";

const messages = (loc: string) =>
  JSON.parse(readFileSync(join(process.cwd(), `messages/${loc}.json`), "utf8")).public.reviews.form as Record<string, string>;
const fill = (tpl: string, name: string | null) => tpl.split("{name}").join(name ?? "");

const STUDIO = { workModel: "team_studio", name: "Salón Luna" };

describe("who the note is for", () => {
  test("team studio: the workspace, by name", () => {
    assert.deepEqual(privateNoteAudience(STUDIO, "Ana"), { kind: "workspace", name: "Salón Luna" });
  });
  test("every other model (and no model set): the talent, as before", () => {
    for (const workModel of ["coordinator_agency", "open_network", "rental_studio", "friends_collective", null]) {
      assert.deepEqual(privateNoteAudience({ workModel, name: "Biz" }, "Ana"), { kind: "talent", name: "Ana" }, String(workModel));
    }
  });
  test("model could not be read: neutral, names no one", () => {
    assert.deepEqual(privateNoteAudience(null, "Ana"), { kind: "neutral" });
    assert.deepEqual(privateNoteAudience(undefined, "Ana"), { kind: "neutral" });
  });
  test("team studio with no name, or no talent name: neutral (never a wrong or empty name)", () => {
    assert.deepEqual(privateNoteAudience({ workModel: "team_studio", name: "  " }, "Ana"), { kind: "neutral" });
    assert.deepEqual(privateNoteAudience({ workModel: "open_network", name: "Biz" }, " "), { kind: "neutral" });
  });
});

describe("in-workspace form (LeaveReviewCard), EN and ES", () => {
  for (const loc of ["en", "es"] as const) {
    const m = messages(loc);
    test(`${loc}: team studio names the workspace`, () => {
      const k = privateNoteLabelKey(privateNoteAudience(STUDIO, "Ana"));
      const text = fill(m[k.key.replace("public.reviews.form.", "")], k.name);
      assert.ok(text.includes("Salón Luna") && !text.includes("Ana"), text);
      assert.equal(text, loc === "es" ? "Nota privada. Solo Salón Luna la ve." : "Private note. Only Salón Luna sees this.");
    });
    test(`${loc}: other models keep the talent label`, () => {
      const k = privateNoteLabelKey(privateNoteAudience({ workModel: "open_network", name: "Biz" }, "Ana"));
      assert.equal(k.key, "public.reviews.form.privateNoteLabel");
      assert.equal(fill(m.privateNoteLabel, k.name), m.privateNoteLabel.replace("{name}", "Ana"));
    });
    test(`${loc}: unknown model is neutral and names no one`, () => {
      const k = privateNoteLabelKey(privateNoteAudience(null, "Ana"));
      const text = m[k.key.replace("public.reviews.form.", "")];
      assert.equal(text, loc === "es" ? "Nota privada, no se muestra públicamente." : "Private note, not shown publicly.");
      assert.ok(!text.includes("{name}"));
    });
  }
  test("fr has the same keys (no missing-key fallback)", () => {
    const m = messages("fr");
    assert.ok(m.privateNoteLabelWorkspace?.includes("{name}"));
    assert.ok(m.privateNoteLabelNeutral && !m.privateNoteLabelNeutral.includes("{name}"));
  });
});

describe("/review/{token} page form (ReviewTokenForm), EN and ES", () => {
  test("team studio names the workspace", () => {
    assert.equal(privateNotePageLabel(privateNoteAudience(STUDIO, "Ana"), REVIEW_PAGE_EN), "Private note. Only Salón Luna sees this.");
    assert.equal(privateNotePageLabel(privateNoteAudience(STUDIO, "Ana"), REVIEW_PAGE_ES), "Nota privada. Solo Salón Luna la ve.");
  });
  test("other models keep the talent label", () => {
    const a = privateNoteAudience({ workModel: "coordinator_agency", name: "Biz" }, "Ana");
    assert.equal(privateNotePageLabel(a, REVIEW_PAGE_EN), "Private note. Only Ana sees this, to help them improve.");
    assert.equal(privateNotePageLabel(a, REVIEW_PAGE_ES), "Nota privada. Solo Ana la ve, para ayudar a mejorar.");
  });
  test("unknown model is neutral", () => {
    assert.equal(privateNotePageLabel(privateNoteAudience(null, "Ana"), REVIEW_PAGE_EN), "Private note, not shown publicly.");
    assert.equal(privateNotePageLabel(privateNoteAudience(null, "Ana"), REVIEW_PAGE_ES), "Nota privada, no se muestra públicamente.");
  });
});

describe("wiring", () => {
  const read = (rel: string) => readFileSync(join(process.cwd(), rel), "utf8");
  test("both forms take the workspace and use the audience, not a hard-coded talent label", () => {
    const card = read("src/app/(workspace)/[tenantSlug]/client/_components/LeaveReviewCard.tsx");
    assert.match(card, /privateNoteLabelKey\(privateNoteAudience\(booking\.noteWorkspace, talentLabel\)\)/);
    assert.doesNotMatch(card, /tt\("public\.reviews\.form\.privateNoteLabel", \{ name: talentLabel \}\)/);
    const form = read("src/app/review/[token]/ReviewTokenForm.tsx");
    assert.match(form, /privateNotePageLabel\(privateNoteAudience\(noteWorkspace, talentName\), t\)/);
    assert.doesNotMatch(form, /fillCopy\(t\.privateNote,/);
    assert.match(read("src/app/review/[token]/page.tsx"), /noteWorkspace=\{invite\.noteWorkspace\}/);
  });
  test("both loaders read the workspace on the server", () => {
    assert.match(read("src/lib/reviews/review-actions.ts"), /readNoteWorkspace\(svc, tenantId\)[\s\S]*noteWorkspace,\n\s+existingReview:/);
    assert.match(read("src/lib/reviews/review-token-actions.ts"), /noteWorkspace: await readNoteWorkspace\(svc, row\.tenant_id\)/);
  });
});
