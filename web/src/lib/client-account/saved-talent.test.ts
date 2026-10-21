/**
 * TUL-1317 slice 1: "Saved" in the client account. The signed-in client's heart-saved
 * talent (`client_favorites`, one list per client) shown in full under /account. Only
 * talent that is still public are listed; guests have no list (sign-in prompt).
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ClientAccountArea } from "@/components/client-account/ClientAccountArea";
import { ACCOUNT_TABS, parseAccountTab } from "./area-pure";
import { shapeSavedTalent, type SavedTalentRow } from "./saved-talent";

const row = (over: Partial<SavedTalentRow> = {}): SavedTalentRow => ({
  added_at: "2026-10-01T00:00:00Z",
  talent_profile_id: "tp1",
  talent_profiles: {
    id: "tp1", display_name: "Rafa Chef", profile_code: "TAL-1", home_city_text: "Cancún",
    deleted_at: null, is_publicly_hidden: false, is_publicly_listed: true, visibility: "public", profile_kind: "talent",
  },
  ...over,
});

test("the Saved and Reviews tabs exist and parse; unknown tabs still fall back to Visits", () => {
  assert.ok(ACCOUNT_TABS.includes("saved"));
  assert.ok(ACCOUNT_TABS.includes("reviews"));
  assert.equal(parseAccountTab("saved"), "saved");
  assert.equal(parseAccountTab("reviews"), "reviews");
  assert.equal(parseAccountTab("nonsense"), "visits");
});

test("shape: newest first, name + code + city, and a profile link on the hub", () => {
  const out = shapeSavedTalent(
    [row({ added_at: "2026-09-01T00:00:00Z" }), row({ added_at: "2026-10-05T00:00:00Z", talent_profile_id: "tp2", talent_profiles: { ...row().talent_profiles!, id: "tp2", display_name: "Ana", profile_code: "TAL-2" } })],
    "https://tulala.digital",
  );
  assert.deepEqual(out.map((s) => s.displayName), ["Ana", "Rafa Chef"]);
  assert.equal(out[1]!.href, "https://tulala.digital/t/TAL-1");
  assert.equal(out[1]!.city, "Cancún");
});

test("a talent hidden, deleted, unlisted or without a code is not shown (same public predicate as the directory)", () => {
  for (const over of [
    { is_publicly_hidden: true }, { deleted_at: "2026-10-01" }, { is_publicly_listed: false },
    { visibility: "private" }, { profile_kind: "resource" }, { profile_code: null },
  ]) {
    const r = row();
    r.talent_profiles = { ...r.talent_profiles!, ...over } as never;
    assert.deepEqual(shapeSavedTalent([r], "https://x.test"), [], JSON.stringify(over));
  }
  assert.deepEqual(shapeSavedTalent([row({ talent_profiles: null })], "https://x.test"), [], "a missing profile row");
});

const area = (tab: "saved", locale: "en" | "es", saved: ReturnType<typeof shapeSavedTalent>) =>
  renderToStaticMarkup(
    createElement(ClientAccountArea, {
      locale, audience: "client", view: { kind: "home", tab }, talentName: "Ana", email: "c@example.com", timeZone: "UTC",
      data: { saved, profile: { name: "Cli", phone: "", locale, marketingOptIn: false } },
    } as never),
  );

test("the Saved tab lists the client's talent with a link, ES and EN; no ids or tenant data in the markup", () => {
  const saved = shapeSavedTalent([row()], "https://tulala.digital");
  const en = area("saved", "en", saved);
  assert.match(en, /Saved/);
  assert.match(en, /Rafa Chef/);
  assert.match(en, /href="https:\/\/tulala\.digital\/t\/TAL-1"/);
  assert.doesNotMatch(en, /tp1/);
  const es = area("saved", "es", saved);
  assert.match(es, /Guardados/);
  assert.match(es, /Ver perfil/);
});

test("empty Saved says how to save one, ES and EN", () => {
  assert.match(area("saved", "en", []), /You have not saved anything yet/);
  assert.match(area("saved", "es", []), /Aún no has guardado nada/);
});

test("wiring: the page loads the list for the signed-in client only, from the one favourites table", () => {
  const render = readFileSync(join(process.cwd(), "src/lib/client-account/render-area.tsx"), "utf8");
  assert.match(render, /view\.tab === "saved"[\s\S]{0,120}loadSavedTalent\(userId, tenantId\)/);
  const loader = readFileSync(join(process.cwd(), "src/lib/client-account/saved-talent.server.ts"), "utf8");
  assert.match(loader, /from\("client_favorites"\)/);
  assert.match(loader, /\.eq\("client_user_id", userId\)/);
});

test("a tenant's site shows only saved talents on that tenant's roster; the hub (null) shows all", () => {
  const pub = { deleted_at: null, is_publicly_hidden: false, is_publicly_listed: true, visibility: "public", profile_kind: "talent" };
  const row = (id: string, code: string) => ({
    added_at: "2026-10-01T00:00:00Z", talent_profile_id: id,
    talent_profiles: { id, ...pub, display_name: code, profile_code: code, home_city_text: null },
  });
  const rows = [row("a", "AAA"), row("b", "BBB")];
  assert.deepEqual(shapeSavedTalent(rows, "https://x.test", new Set(["a"])).map((s) => s.displayName), ["AAA"]);
  assert.deepEqual(shapeSavedTalent(rows, "https://x.test", null).map((s) => s.displayName).sort(), ["AAA", "BBB"]);
  assert.equal(shapeSavedTalent(rows, "https://x.test", new Set()).length, 0);
});

test("wiring: roster-scoped on tenant hosts, unscoped only on the hub; links use next/link", () => {
  const tenant = readFileSync(join(process.cwd(), "src/lib/client-account/render-tenant-area.tsx"), "utf8");
  assert.match(tenant, /loadSavedTalent\(userId, hostContext === "hub" \? null : tenantId\)/);
  const loader = readFileSync(join(process.cwd(), "src/lib/client-account/saved-talent.server.ts"), "utf8");
  assert.match(loader, /from\("agency_talent_roster"\)[\s\S]*\.eq\("tenant_id", tenantId\)/);
  const comp = readFileSync(join(process.cwd(), "src/components/client-account/ClientAccountArea.tsx"), "utf8");
  assert.doesNotMatch(comp, /<a href=\{s\.href\}/);
});
