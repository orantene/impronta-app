/**
 * The footer socket on every public surface: agency storefront hosts and the
 * legacy /t/[profileCode] templates. One socket, one credit, whitelabel hides
 * the credit, policy links per surface, token-styled.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { CSSProperties } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { TalentSiteSocket } from "@/components/talent-site/talent-site-socket";
import { ProfileFooterSocket } from "@/app/t/[profileCode]/_shared/ProfileFooterSocket";
import { createFooterEditorialPreset } from "@/lib/site-admin/builder-node/composition-preset-factories-noir-footer";
import {
  buildAgencySocketModel,
  isDesignCreditText,
  pickPolicyLinks,
  stripDesignCredits,
  TULALA_LEGAL_PRIVACY_URL,
  localizedLegalUrl,
  TULALA_LEGAL_TERMS_URL,
} from "./footer-socket";

function agencyHtml(over: { whitelabel?: boolean; locale?: string; links?: { href: string; label: string }[] } = {}) {
  const model = buildAgencySocketModel({
    locale: over.locale ?? "en",
    whitelabel: over.whitelabel ?? false,
    footerLinks: over.links ?? [],
  });
  const style = {
    "--token-color-surface-raised": "var(--background)",
    "--token-color-ink": "var(--foreground)",
    "--token-color-line": "var(--border)",
  } as CSSProperties;
  return renderToStaticMarkup(
    <div style={style}>
      <TalentSiteSocket model={model} clearDock={false} />
    </div>,
  );
}

const count = (html: string, re: RegExp) => (html.match(re) ?? []).length;

const PROFILE_TOKENS = { surface: "var(--pp-bg)", ink: "var(--pp-ink)", line: "var(--pp-line)" };

function profileHtml(whitelabel: boolean, locale = "en") {
  return renderToStaticMarkup(
    <ProfileFooterSocket locale={locale} whitelabel={whitelabel} tokens={PROFILE_TOKENS} />,
  );
}

test("agency surface: one socket, one credit, Tulala terms and privacy", () => {
  const out = agencyHtml();
  assert.equal(count(out, /data-tulala-socket/g), 1);
  assert.equal(count(out, /data-socket-credit/g), 1);
  assert.equal(count(out, /Site made with/g), 1);
  assert.ok(out.includes(TULALA_LEGAL_TERMS_URL) || out.includes(localizedLegalUrl(TULALA_LEGAL_TERMS_URL, "es")));
  assert.ok(out.includes(TULALA_LEGAL_PRIVACY_URL));
});

test("agency surface: whitelabel hides the credit, keeps Tulala documents", () => {
  const out = agencyHtml({ whitelabel: true });
  assert.equal(count(out, /data-tulala-socket/g), 1);
  assert.equal(count(out, /data-socket-credit/g), 0);
  assert.equal(out.includes("Powered by Tulala"), false);
  assert.ok(out.includes(TULALA_LEGAL_TERMS_URL) || out.includes(localizedLegalUrl(TULALA_LEGAL_TERMS_URL, "es")));
});

test("agency surface: its own policy pages lead, otherwise only Tulala documents", () => {
  const none = agencyHtml({ links: [{ href: "/p/about", label: "About" }] });
  assert.equal(none.includes("This site"), false);
  assert.equal(none.includes("/politicas"), false);
  const withPolicy = agencyHtml({
    links: [
      { href: "/p/about", label: "About" },
      { href: "/p/privacy", label: "Privacy policy" },
      { href: "/p/terms", label: "Terms of service" },
    ],
  });
  assert.ok(withPolicy.includes('href="/p/privacy"'));
  assert.ok(withPolicy.includes('href="/p/terms"'));
  assert.equal(withPolicy.includes('href="/p/about"'), false);
  assert.equal(pickPolicyLinks([{ href: "/p/about", label: "About" }]).length, 0);
});

test("agency surface: Spanish copy", () => {
  const out = agencyHtml({ locale: "es" });
  assert.match(out, /Sitio creado con/);
  assert.match(out, /Términos/);
});

test("legacy profile templates: one socket, one credit, token-styled", () => {
  const out = profileHtml(false);
  assert.equal(count(out, /data-tulala-socket/g), 1);
  assert.equal(count(out, /data-socket-credit/g), 1);
  assert.equal(count(out, /Site made with/g), 1);
  assert.ok(out.includes(TULALA_LEGAL_PRIVACY_URL));
  assert.equal(out.includes("/politicas"), false);
  assert.equal(/#[0-9a-fA-F]{3,8}\b/.test(out.replace(/href="[^"]*"/g, "")), false);
  assert.match(out, /--token-color-surface-raised:var\(--pp-bg\)/);
  assert.match(profileHtml(false, "es"), /Sitio creado con/);
});

test("legacy profile templates: whitelabel hides the credit", () => {
  const out = profileHtml(true);
  assert.equal(count(out, /data-tulala-socket/g), 1);
  assert.equal(count(out, /data-socket-credit/g), 0);
  assert.equal(out.includes("Powered by Tulala"), false);
});

test("templates carry no credit of their own, each mounts the socket once", () => {
  const dir = join(process.cwd(), "src/app/t/[profileCode]");
  for (const t of ["_noir/NoirProfileLayout", "_lumen/LumenProfileLayout", "_atelier/AtelierProfileLayout", "_light/LightProfileLayout", "_maison/MaisonProfileLayout"]) {
    const src = readFileSync(join(dir, `${t}.tsx`), "utf8");
    assert.equal(count(src, /<(ProfileFooterSocket|LightProfileFooter)/g), 1, `${t} mounts the socket once`);
    assert.equal(/Powered by\s*<em>|Hecho con\s*<em>/.test(src), false, `${t} keeps no own credit`);
  }
});

test("agency noir preset carries no credit; stored credits are stripped at render", () => {
  const shell = JSON.stringify(createFooterEditorialPreset()).toLowerCase();
  assert.equal(shell.includes("powered by"), false);
  assert.equal(isDesignCreditText("Powered by {i}Tulala{/i}"), true);
  assert.equal(isDesignCreditText("Hecho con <em>Tulala</em>"), true);
  const tree = [{ kind: "container", children: [{ kind: "paragraph", props: { text: "Powered by {i}Tulala{/i}" } }, { kind: "paragraph", props: { text: "Copyright" } }] }];
  assert.equal(JSON.stringify(stripDesignCredits(tree)).includes("Powered"), false);
});

test("agency storefront and public footer mount the socket; PoweredByTulala is gone", () => {
  const root = process.cwd();
  const store = readFileSync(join(root, "src/components/home/agency-home-storefront.tsx"), "utf8");
  assert.equal(count(store, /<AgencyFooterSocket/g), 1);
  assert.equal(store.includes("PoweredByTulala"), false);
  const pub = readFileSync(join(root, "src/components/public-footer.tsx"), "utf8");
  assert.equal(count(pub, /<AgencyFooterSocket/g), 2);
});
