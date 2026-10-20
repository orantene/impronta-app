import assert from "node:assert/strict";
import test from "node:test";

import {
  WORK_STYLE_CHOICES,
  exampleFor,
  isWorkStyleChoice,
  presetFor,
  choiceCopy,
  rowToChoice,
} from "./work-style";

test("there are exactly five choices, in the order the owner reads them", () => {
  assert.deepEqual([...WORK_STYLE_CHOICES], ["coordinator_agency", "open_network", "team_studio", "rental_studio", "friends_collective"]);
});

test("ES and EN copy match the approved wording and carry no settings jargon", () => {
  assert.equal(choiceCopy("coordinator_agency", "en").title, "I coordinate my people");
  assert.equal(choiceCopy("open_network", "en").title, "People sell directly, I take a share");
  assert.equal(choiceCopy("team_studio", "en").title, "My team works for my business");
  assert.equal(choiceCopy("rental_studio", "en").title, "I rent stations or rooms");
  assert.equal(choiceCopy("friends_collective", "en").title, "A few friends working together");
  assert.equal(choiceCopy("coordinator_agency", "es").title, "Yo coordino a mi gente");
  assert.equal(choiceCopy("open_network", "es").title, "Cada quien vende y yo cobro una parte");
  assert.equal(choiceCopy("team_studio", "es").title, "Mi equipo trabaja para mi negocio");
  assert.equal(choiceCopy("rental_studio", "es").title, "Rento estaciones o espacios");
  assert.equal(choiceCopy("friends_collective", "es").title, "Unos amigos trabajamos juntos");
  for (const c of WORK_STYLE_CHOICES) for (const l of ["es", "en"] as const) {
    const copy = choiceCopy(c, l);
    assert.ok(copy.line.length > 0 && copy.line.length <= 90, `${c}/${l} one short line`);
    assert.doesNotMatch(`${copy.title} ${copy.line}`, /preset|bps|margin|tenant|workspace_|—|–/i);
  }
});

test("each choice presets who gets requests, who sees the chat, the price shown, the split and the safety officer", () => {
  const a = presetFor("coordinator_agency");
  assert.deepEqual([a.requestsGoTo, a.chatSeenBy, a.priceShown, a.split.kind, a.safetyOfficer], ["workspace", "workspace", "talent_plus_margin", "margin", false]);
  const b = presetFor("open_network");
  assert.deepEqual([b.requestsGoTo, b.chatSeenBy, b.priceShown, b.split.kind, b.safetyOfficer], ["talent", "talent", "talent_price", "percent", true]);
  const c = presetFor("team_studio");
  assert.deepEqual([c.requestsGoTo, c.chatSeenBy, c.priceShown, c.split.kind], ["workspace", "workspace", "workspace_price", "all"]);
  const d = presetFor("rental_studio");
  assert.deepEqual([d.requestsGoTo, d.chatSeenBy, d.priceShown, d.split.kind], ["talent", "talent", "talent_price", "rent"]);
  const e = presetFor("friends_collective");
  assert.deepEqual([e.requestsGoTo, e.chatSeenBy, e.priceShown, e.split.kind], ["workspace", "workspace", "talent_price", "percent"]);
});

test("a split never takes more than the 90% cap and a rental studio has no default rent", () => {
  for (const c of WORK_STYLE_CHOICES) {
    const s = presetFor(c).split;
    if (s.kind === "percent" || s.kind === "margin") assert.ok(s.bps !== null && s.bps >= 0 && s.bps <= 9000, c);
  }
  const rent = presetFor("rental_studio").split;
  assert.equal(rent.kind, "rent");
  assert.equal("amountCents" in rent && rent.amountCents, null);
});

test("presetFor hands out a copy, never the shared object", () => {
  const p = presetFor("open_network");
  (p as { requestsGoTo: string }).requestsGoTo = "workspace";
  assert.equal(presetFor("open_network").requestsGoTo, "talent");
});

test("isWorkStyleChoice fails closed on anything else", () => {
  assert.equal(isWorkStyleChoice("team_studio"), true);
  for (const bad of ["", "Team_Studio", null, undefined, 3, {}, "agency"]) assert.equal(isWorkStyleChoice(bad), false);
});

test("examples rotate by trade and fall back to a stable generic one, in both languages", () => {
  assert.match(exampleFor("coordinator_agency", "chefs", "en"), /chef/i);
  assert.match(exampleFor("coordinator_agency", "cleaners", "es"), /limpieza/i);
  assert.match(exampleFor("rental_studio", "nails", "en"), /nail/i);
  assert.equal(exampleFor("team_studio", "unknown-trade", "en"), exampleFor("team_studio", null, "en"));
  for (const c of WORK_STYLE_CHOICES) for (const t of ["chefs", "cleaners", "nails", "guides", "models", null]) for (const l of ["es", "en"] as const) {
    const ex = exampleFor(c, t, l);
    assert.ok(ex.length > 0 && !/[—–]/.test(ex), `${c}/${t}/${l}`);
  }
});

test("rowToChoice reads the stored row and fails closed on a bad one", () => {
  assert.equal(rowToChoice({ work_model: "rental_studio" }), "rental_studio");
  assert.equal(rowToChoice({ work_model: "nonsense" }), null);
  assert.equal(rowToChoice(null), null);
  assert.equal(rowToChoice({}), null);
});

import { afterWorkspaceCreatedPath, workStyleOnboardingEnabled } from "./work-style";

test("the onboarding question is dark unless the flag is exactly true", () => {
  assert.equal(workStyleOnboardingEnabled("true"), true);
  for (const v of [undefined, "", "1", "TRUE", "yes", "false"]) assert.equal(workStyleOnboardingEnabled(v), false);
});

test("a new workspace lands on the question only when enabled", () => {
  assert.equal(afterWorkspaceCreatedPath("/acme/admin", false), "/acme/admin");
  assert.equal(afterWorkspaceCreatedPath("/acme/admin", true), "/acme/admin/work-style");
  assert.equal(afterWorkspaceCreatedPath("/acme/admin/", true), "/acme/admin/work-style");
});
