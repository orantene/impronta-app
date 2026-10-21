/**
 * TUL-1463: save a service (heart) and see it in the account.
 *  - a guest save asks for sign-in and writes nothing (no anonymous rows);
 *  - a client saves only a service visible on THIS site's tenant; the stored tenant is the offering's;
 *  - reads and writes are the session client's own rows only;
 *  - the Saved tab lists this site's saved services, ES and EN.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { ClientAccountArea } from "@/components/client-account/ClientAccountArea";
import { SaveServiceButton } from "@/components/client-account/SaveServiceButton";
import en from "../../../messages/en.json";
import es from "../../../messages/es.json";

import { guestSaveOutcome } from "./save-service-ui";
import {
  cleanOfferingIds, decideServiceSave, isMissingTable, savedServiceHref, shapeSavedServices,
  type SavedServiceOffering, type SavedServiceRow, type SavedServiceSite,
} from "./saved-services";

const ID = "aaaaaaaa-1111-4111-8111-111111111111";
const visible = { id: ID, tenant_id: "tenant-a", status: "published", moderation_state: "approved", visibility: "public" };

test("a guest save asks for sign-in: the decision refuses before anything is read or written", () => {
  assert.deepEqual(decideServiceSave({ sessionUserId: null, siteTenantId: "tenant-a", offering: visible }), { ok: false, reason: "sign_in" });
  assert.equal(guestSaveOutcome({ ok: false, reason: "sign_in" }), "sign_in");
  // The action returns sign_in for a guest BEFORE its first database call.
  const action = readFileSync(join(process.cwd(), "src/lib/client-account/save-service-actions.ts"), "utf8");
  const save = action.slice(action.indexOf("export async function setServiceSaved"), action.indexOf("export async function savedServiceStatus"));
  assert.ok(save.indexOf('reason: "sign_in"') > 0 && save.indexOf('reason: "sign_in"') < save.indexOf(".from("), "guest refused before any read or write");
  const status = action.slice(action.indexOf("export async function savedServiceStatus"));
  assert.ok(status.indexOf("signedIn: false") < status.indexOf(".from("), "a guest status read touches nothing");
});

test("the button turns a guest's answer into the sign-in prompt; talent accounts and errors revert", () => {
  assert.equal(guestSaveOutcome({ ok: true, saved: true }), "ok");
  assert.equal(guestSaveOutcome({ ok: false, reason: "not_client" }), "clients_only");
  assert.equal(guestSaveOutcome({ ok: false, reason: "unavailable" }), "error");
  assert.equal(guestSaveOutcome(null), "error");
  const btn = readFileSync(join(process.cwd(), "src/components/client-account/SaveServiceButton.tsx"), "utf8");
  // Sign-in opens on the same page and finishes the save afterwards (the visitor returns to the same place).
  assert.match(btn, /<ClientAccountButton[\s\S]{0,200}defaultOpen[\s\S]{0,120}onSignedIn=\{\(\) => void save\(true\)\}/);
  assert.doesNotMatch(btn, /window\.location\s*=|router\.push|href=/, "never navigates away");
});

test("a client saves only a visible service of this site's tenant; the tenant stored is the offering's", () => {
  assert.deepEqual(decideServiceSave({ sessionUserId: "u1", siteTenantId: "tenant-a", offering: visible }), { ok: true, tenantId: "tenant-a" });
  assert.deepEqual(decideServiceSave({ sessionUserId: "u1", siteTenantId: "tenant-a", offering: { ...visible, visibility: "on_request" } }), { ok: true, tenantId: "tenant-a" });
  for (const offering of [
    { ...visible, tenant_id: "tenant-b" },
    { ...visible, tenant_id: null },
    { ...visible, status: "draft" },
    { ...visible, moderation_state: "pending" },
    { ...visible, visibility: "agency_only" },
    null,
  ]) {
    assert.deepEqual(decideServiceSave({ sessionUserId: "u1", siteTenantId: "tenant-a", offering }), { ok: false, reason: "not_found" }, JSON.stringify(offering));
  }
  assert.deepEqual(decideServiceSave({ sessionUserId: "u1", siteTenantId: null, offering: visible }), { ok: false, reason: "not_found" });
});

test("scoping: every read and write is the session client's own rows; the tenant comes from the host", () => {
  const action = readFileSync(join(process.cwd(), "src/lib/client-account/save-service-actions.ts"), "utf8");
  assert.match(action, /assertNotImpersonating\(\)/);
  assert.match(action, /resolveAccountTenant\(\)/);
  assert.match(action, /client_user_id: userId, offering_id: parsed\.data\.offeringId, tenant_id: decision\.tenantId/);
  assert.equal((action.match(/from\("client_favorite_services"\)/g) ?? []).length, 3);
  assert.equal((action.match(/\.eq\("client_user_id", userId\)/g) ?? []).length, 2, "delete and status read are own-rows only");
  assert.doesNotMatch(action, /client_user_id: (input|parsed)/);
  assert.doesNotMatch(action, /tenantId: (input|parsed)|tenant_id: (input|parsed)/);
  const loader = readFileSync(join(process.cwd(), "src/lib/client-account/saved-services.server.ts"), "utf8");
  assert.match(loader, /\.eq\("client_user_id", userId\)\s*\.eq\("tenant_id", tenantId\)/);
  // Links are decided from the host headers the renderer read, never from the browser.
  assert.match(readFileSync(join(process.cwd(), "src/lib/client-account/render-area.tsx"), "utf8"), /loadSavedServices\(userId, tenantId, locale, \{ hostKind: host\.hostContext, hostTalentProfileId: talentProfileId \}\)/);
  assert.match(readFileSync(join(process.cwd(), "src/lib/client-account/render-tenant-area.tsx"), "utf8"), /loadSavedServices\(userId, tenantId, locale, \{ hostKind: hostContext, hostTalentProfileId: null \}\)/);
  assert.match(loader, /businessServicePagesOn\(admin, tenantId\)/);
});

const TALENT_SITE: SavedServiceSite = { hostKind: "talent_site", hostTalentProfileId: "tp1", businessPagesOn: false, nonMenuIds: new Set() };
const AGENCY_PAGES: SavedServiceSite = { hostKind: "agency", hostTalentProfileId: null, businessPagesOn: true, nonMenuIds: new Set() };
const AGENCY_NO_PAGES: SavedServiceSite = { ...AGENCY_PAGES, businessPagesOn: false };

const offering = (over: Partial<SavedServiceOffering> = {}): SavedServiceOffering => ({
  ...visible, title: "Haircut", title_i18n: { es: "Corte de pelo" }, kind: "service", owner_kind: "talent", talent_profile_id: "tp1", attributes: {}, ...over,
});
const row = (over: Partial<SavedServiceRow> = {}): SavedServiceRow => ({
  added_at: "2026-10-01T00:00:00Z", offering_id: ID, tenant_id: "tenant-a", talent_offerings: offering(), ...over,
});

test("the Saved list: this tenant only, still-visible only, newest first, share-link href, localized title", () => {
  const other = "bbbbbbbb-2222-4222-8222-222222222222";
  const rows = [
    row(),
    row({ offering_id: other, added_at: "2026-10-05T00:00:00Z", talent_offerings: offering({ id: other, title: "Color" }) }),
    row({ tenant_id: "tenant-b", talent_offerings: offering({ tenant_id: "tenant-b", title: "Elsewhere" }) }),
    row({ talent_offerings: offering({ status: "archived", title: "Gone" }) }),
    row({ talent_offerings: null }),
  ];
  const out = shapeSavedServices(rows, "tenant-a", "en", TALENT_SITE);
  assert.deepEqual(out.map((s) => s.title), ["Color", "Haircut"]);
  assert.equal(out[1]!.href, "/servicio-haircut-aaaaaaaa");
  assert.equal(shapeSavedServices([row()], "tenant-a", "es", TALENT_SITE)[0]!.title, "Corte de pelo");
});

test("a saved service always opens: business page, else the talent's service page, else /book preselected, never a home anchor", () => {
  const house = offering({ owner_kind: "workspace", talent_profile_id: null });
  // 1. Business service page when the workspace has them (word follows the account language; the page 301s to canonical).
  assert.equal(savedServiceHref(house, AGENCY_PAGES, "en"), "/services/haircut-aaaaaaaa");
  assert.equal(savedServiceHref(house, AGENCY_PAGES, "es"), "/servicios/haircut-aaaaaaaa");
  assert.equal(savedServiceHref(offering({ owner_kind: "workspace", kind: "package" }), AGENCY_PAGES, "en"), "/services/haircut-aaaaaaaa");
  // No business page for: a plan without pages, a talent-owned row, a product, a non-menu row.
  assert.equal(savedServiceHref(house, AGENCY_NO_PAGES, "en"), `/book?service=${ID}`);
  assert.equal(savedServiceHref(offering({ owner_kind: "talent" }), AGENCY_PAGES, "en"), `/book?service=${ID}`);
  assert.equal(savedServiceHref(offering({ owner_kind: "workspace", kind: "product" }), AGENCY_PAGES, "en"), `/book?service=${ID}`);
  assert.equal(savedServiceHref(house, { ...AGENCY_PAGES, nonMenuIds: new Set([ID]) }, "en"), `/book?service=${ID}`);
  // 2. Talent site: the talent's own service page (TUL-586).
  assert.equal(savedServiceHref(offering(), TALENT_SITE, "en"), "/servicio-haircut-aaaaaaaa");
  // "In lists only" has no page of its own: the booking page with it preselected.
  assert.equal(savedServiceHref(offering({ attributes: { presence: "lists_only" } }), TALENT_SITE, "en"), `/book?service=${ID}`);
  // Another talent's service on this talent's site: no page here shows it, so no link.
  assert.equal(savedServiceHref(offering({ talent_profile_id: "tp2" }), TALENT_SITE, "en"), null);
  // 4. Hub / app hosts serve no /book and no service page: listed without a link.
  assert.equal(savedServiceHref(house, { ...AGENCY_PAGES, hostKind: "hub" }, "en"), null);
  assert.equal(savedServiceHref(house, { ...AGENCY_PAGES, hostKind: "app" }, "en"), null);
  for (const site of [TALENT_SITE, AGENCY_PAGES, AGENCY_NO_PAGES]) {
    for (const o of [offering(), house, offering({ attributes: { presence: "lists_only" } })]) {
      const href = savedServiceHref(o, site, "en");
      assert.ok(href === null || !href.includes("#"), `never a fragment: ${href}`);
    }
  }
});

test("held table missing fails closed; status ids are cleaned and bounded", () => {
  assert.equal(isMissingTable({ code: "42P01" }), true);
  assert.equal(isMissingTable({ code: "PGRST205" }), true);
  assert.equal(isMissingTable({ code: "23505" }), false);
  assert.deepEqual(cleanOfferingIds([ID, ID.toUpperCase(), "nope", 5, null]), [ID]);
  assert.equal(cleanOfferingIds(Array.from({ length: 100 }, (_, i) => `aaaaaaaa-1111-4111-8111-${String(i).padStart(12, "0")}`)).length, 60);
  const sql = readFileSync(join(process.cwd(), "../supabase/migrations/_pending_pm/20261231422300_client_favorite_services_tul1463.sql"), "utf8");
  assert.match(sql, /PRIMARY KEY \(client_user_id, offering_id\)/, "one save per client per service");
  assert.match(sql, /ENABLE ROW LEVEL SECURITY/);
  assert.match(sql, /USING \(client_user_id = \(SELECT auth\.uid\(\)\)\)/);
});

const area = (locale: "en" | "es", savedServices: ReturnType<typeof shapeSavedServices>, saved: Array<{ displayName: string; city: string | null; href: string }> = []) =>
  renderToStaticMarkup(
    createElement(ClientAccountArea, {
      locale, audience: "client", view: { kind: "home", tab: "saved" }, talentName: "Ana", email: "c@example.com", timeZone: "UTC",
      data: { saved, savedServices, profile: { name: "Cli", phone: "", locale, marketingOptIn: false } },
    } as never),
  );

test("the Saved tab shows saved services with a next/link, ES and EN; with people too, both get a heading", () => {
  const list = shapeSavedServices([row()], "tenant-a", "en", TALENT_SITE);
  const enHtml = area("en", list);
  assert.match(enHtml, /data-testid="client-saved-services"/);
  assert.match(enHtml, /href="\/servicio-haircut-aaaaaaaa"/);
  assert.match(enHtml, /View service/);
  assert.doesNotMatch(enHtml, new RegExp(ID));
  assert.match(area("es", shapeSavedServices([row()], "tenant-a", "es", TALENT_SITE)), /Ver servicio/);
  // No sure page: listed by name, no link, no "View service".
  const unlinked = area("en", [{ title: "Haircut", href: null }]);
  assert.match(unlinked, /Haircut/);
  assert.doesNotMatch(unlinked, /View service|href="\/#/);
  const both = area("en", list, [{ displayName: "Rafa", city: null, href: "https://x.test/t/TAL-1" }]);
  assert.ok(both.indexOf("People") < both.indexOf("Rafa") && both.indexOf("Services") < both.indexOf("Haircut"));
  const comp = readFileSync(join(process.cwd(), "src/components/client-account/ClientAccountArea.tsx"), "utf8");
  assert.doesNotMatch(comp, /<a href=\{s\.href\}/);
});

test("the save button renders an accessible 44px toggle, no prompt until a guest taps it", () => {
  const html = renderToStaticMarkup(createElement(SaveServiceButton, { offeringId: ID, title: "Haircut", locale: "es", showLabel: true }));
  assert.match(html, /aria-pressed="false"/);
  assert.match(html, /aria-label="Guardar Haircut"/);
  assert.match(html, /min-height:44px/);
  assert.doesNotMatch(html, /data-save-service-prompt/);
});

test("copy: ES and EN for every new key, plain, no em dashes; the client bundle ships the subtree", () => {
  const keys = ["save", "saved", "saveAria", "removeAria", "promptTitle", "promptBody", "signIn", "notNow", "error", "clientsOnly"] as const;
  const area = ["savedPeople", "savedServices", "viewService", "reviewVisitTitle", "reviewRating", "reviewStar", "reviewBody", "reviewSend", "reviewThanks", "reviewDone", "reviewNote", "reviewPickRating", "reviewErr", "reviewErrNotCompleted"] as const;
  for (const cat of [en, es] as Array<{ public: Record<string, Record<string, string>> }>) {
    for (const k of keys) assert.ok(cat.public.saveService?.[k]?.trim(), k);
    for (const k of area) assert.ok(cat.public.clientAccountArea?.[k]?.trim(), k);
    for (const v of [...keys.map((k) => cat.public.saveService![k]!), ...area.map((k) => cat.public.clientAccountArea![k]!)]) {
      assert.doesNotMatch(v, /—/, v);
    }
  }
  const subtrees = readFileSync(join(process.cwd(), "src/i18n/client-subtrees.ts"), "utf8");
  assert.match(subtrees, /"public\.saveService"/);
});
