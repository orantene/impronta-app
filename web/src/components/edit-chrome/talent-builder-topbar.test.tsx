/**
 * Talent builder top bar: back arrow to the dashboard, identity menu instead of
 * the page picker. The workspace builder keeps its page picker unchanged.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createElement } from "react";
import { renderToString } from "react-dom/server";

import {
  TalentBackLink,
  TalentBuilderIdentityProvider,
  TalentIdentityMenu,
  resolveTalentBackHref,
  talentQuickLinks,
} from "./talent-builder-identity";
import { DashboardLocaleProvider } from "@/i18n/use-dashboard-locale";
import { TALENT_PAGES } from "@/components/admin/shell/internal/state/fixtures";

function renderTalent(el: ReturnType<typeof createElement>, locale = "es"): string {
  return renderToString(
    createElement(
      DashboardLocaleProvider as never,
      { locale } as never,
      createElement(TalentBuilderIdentityProvider, { value: { displayName: "Jorg Beauty", headshotUrl: null } }, el),
    ),
  );
}

test("talent identity trigger shows avatar initials, the name and no page actions", () => {
  const html = renderTalent(createElement(TalentIdentityMenu));
  assert.match(html, /data-talent-identity-trigger/);
  assert.match(html, /data-talent-avatar/);
  assert.match(html, />JB</);
  assert.match(html, /Jorg Beauty/);
  for (const bad of ["Add new page", "New page", "Manage pages", "No pages yet"]) {
    assert.ok(!html.includes(bad), bad);
  }
});

test("avatar uses the profile photo when there is one", () => {
  const html = renderToString(
    createElement(
      TalentBuilderIdentityProvider,
      { value: { displayName: "Jorg Beauty", headshotUrl: "https://cdn.example/a.jpg" } },
      createElement(TalentIdentityMenu),
    ),
  );
  assert.match(html, /<img[^>]+src="https:\/\/cdn\.example\/a\.jpg"/);
});

test("quick links mirror the dashboard nav in order, in Spanish", () => {
  const links = talentQuickLinks("es");
  assert.equal(links.length, TALENT_PAGES.length);
  assert.deepEqual(
    links.map((l) => l.label),
    ["Hoy", "Mensajes", "Calendario", "Clientes", "Dinero", "Perfil", "Mi presencia", "Servicios", "Reseñas", "Ajustes"],
  );
  assert.equal(links[0]?.href, "/talent/today");
  assert.equal(links.find((l) => l.page === "public-page")?.href, "/talent/site");
  assert.equal(talentQuickLinks("en")[0]?.label, "Today");
});

test("back arrow targets the talent dashboard", () => {
  const html = renderTalent(createElement(TalentBackLink));
  assert.match(html, /data-talent-builder-back/);
  assert.match(html, /href="\/talent\/site"/);
  assert.match(resolveTalentBackHref("https://app.example/talent/money", "https://app.example"), /^\/talent\/money$/);
  assert.equal(resolveTalentBackHref("https://app.example/talent/page-builder", "https://app.example"), "/talent/site");
  assert.equal(resolveTalentBackHref("https://evil.example/talent/money", "https://app.example"), "/talent/site");
  assert.equal(resolveTalentBackHref("", "https://app.example"), "/talent/site");
});

test("workspace builder keeps its page picker and exit form (no provider, pinned)", () => {
  const src = readFileSync(path.join(process.cwd(), "src/components/edit-chrome/topbar.tsx"), "utf8");
  for (const s of ["Manage pages…", "Add new page", "No pages yet.", "listPagesForPickerAction"]) {
    assert.ok(src.includes(s), s);
  }
  assert.match(src, /\{talentIdentity \? <TalentBackLink \/> : <ExitForm/);
  assert.match(src, /talentIdentity \? <TalentIdentityMenu \/> : <PagePicker/);
});
