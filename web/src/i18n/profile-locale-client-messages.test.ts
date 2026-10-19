import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import vm from "node:vm";

import en from "../../messages/en.json";
import es from "../../messages/es.json";
import { inlineCatalogScript, profileLocaleMessagesScript } from "./profile-locale-client-messages";
import { getClientMessagesPayload } from "./messages";

type Catalog = Record<string, unknown>;
const walk = (c: unknown, key: string): unknown =>
  key.split(".").reduce<unknown>((cur, p) => (cur && typeof cur === "object" ? (cur as Catalog)[p] : undefined), c);

/** The browser translator's lookup over the injected global (messages.client.ts). */
function browserT(store: Record<string, Catalog>, locale: string, key: string): string {
  for (const code of [locale, "en"]) {
    const v = walk(store[code], key);
    if (typeof v === "string") return v;
  }
  return key;
}

test("TUL-1272/C3: a Spanish profile on an English request gets Spanish client strings", () => {
  const before = getClientMessagesPayload("en");
  assert.equal(before.es, undefined, "request payload alone has no es: the bug");
  assert.equal(browserT(before, "es", "public.profileCta.inquireAbout"), "Inquire about {name}");

  const script = profileLocaleMessagesScript("es", "en");
  assert.ok(script);
  const ctx = { self: { __TULALA_MSGS__: structuredClone(before) } as Record<string, unknown> };
  vm.runInNewContext(script!, ctx);
  const store = ctx.self.__TULALA_MSGS__ as Record<string, Catalog>;
  assert.equal(browserT(store, "es", "public.profileCta.inquireAbout"), "Consultar sobre {name}");
  assert.equal(browserT(store, "es", "public.guestChat.fabHoverLabel"), "Escríbeme");
  assert.ok(store.en, "request locale untouched");
});

test("TUL-1272/C3: same locale or unknown locale adds nothing; an existing catalog is not replaced", () => {
  assert.equal(profileLocaleMessagesScript("es", "es"), null);
  assert.equal(profileLocaleMessagesScript("ES-mx", "es"), null);
  assert.equal(profileLocaleMessagesScript("xx", "en"), null);
  const ctx = { self: { __TULALA_MSGS__: { es: { marker: "kept" } } } as Record<string, unknown> };
  vm.runInNewContext(profileLocaleMessagesScript("es", "en")!, ctx);
  assert.deepEqual((ctx.self.__TULALA_MSGS__ as Catalog).es, { marker: "kept" });
});

test("TUL-1272/C3: the strings named in the bug are translated in es and differ from en", () => {
  for (const key of ["public.profileCta.inquireAbout", "public.guestChat.fabHoverLabel"]) {
    const e = walk(es, key), n = walk(en, key);
    assert.equal(typeof e, "string");
    assert.notEqual(e, n, `${key} must not be English in es`);
  }
});

test("TUL-1272/C3: the profile page mounts the messages script and the footer follows the profile locale", () => {
  const root = join(__dirname, "..");
  const view = readFileSync(join(root, "app/t/[profileCode]/profile-view.tsx"), "utf8");
  assert.match(view, /<ProfileLocaleMessages profileLocale=\{locale\} requestLocale=\{requestLocale\} \/>/);
  assert.match(view, /<MarketingFooter priceCurrency=\{profilePriceCurrency\(storefrontOfferings\)\} locale=\{locale\} \/>/);
  const footer = readFileSync(join(root, "components/marketing/footer.tsx"), "utf8");
  assert.match(footer, /localeOverride \?\? \(await getRequestLocale\(\)\)/);
});

test("TUL-1272/C3 part 1: offerings render on the hub profile without a services menu (already so on main)", () => {
  const root = join(__dirname, "..");
  const layout = readFileSync(join(root, "app/t/[profileCode]/_light/LightProfileLayout.tsx"), "utf8");
  assert.match(layout, /storefrontOfferings\.length > 0 \? \(\s*<TalentStorefront[\s\S]*?\) : \(\s*<ServiceMenuBlock/);
  const loader = readFileSync(join(root, "lib/talent/offerings-public.ts"), "utf8");
  assert.match(loader, /\.eq\("moderation_state", "approved"\)\s*\.in\("visibility", \["public", "on_request"\]\)/);
});

test("TUL-1272/C3: hostile message text cannot end the inline script and round-trips", () => {
  const nasty = 'a</script><script>alert(1)</script> <!-- b \u2028 c \u2029 d </SCRIPT>';
  const script = inlineCatalogScript("es", { public: { profileCta: { inquireAbout: nasty } } });
  assert.doesNotMatch(script, /<\/script/i);
  assert.ok(!script.includes("<!--"));
  assert.ok(!script.includes("\u2028") && !script.includes("\u2029"));
  const ctx = { self: {} as Record<string, unknown> };
  vm.runInNewContext(script, ctx);
  const store = ctx.self.__TULALA_MSGS__ as Record<string, Catalog>;
  assert.equal(walk(store.es, "public.profileCta.inquireAbout"), nasty);
});
