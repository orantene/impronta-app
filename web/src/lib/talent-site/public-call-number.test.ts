import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { talentContactHrefs } from "./contact-channels";
import {
  callHrefFromSocialLinks,
  decodeShellTel,
  encodeShellTel,
  findShellTel,
  normaliseE164,
  withPublicCallNumber,
} from "./public-call-number";

test("E.164 normalisation needs a country code and never guesses", () => {
  assert.equal(normaliseE164("+52 81 1234 5678"), "+528112345678");
  assert.equal(normaliseE164("(+52) 81-1234-5678"), "+528112345678");
  assert.equal(normaliseE164("0052 81 1234 5678"), "+528112345678");
  assert.equal(normaliseE164("81 1234 5678"), null);
  assert.equal(normaliseE164("+0 123456789"), null);
  assert.equal(normaliseE164("+52 123"), null);
  assert.equal(normaliseE164("+1234567890123456"), null);
  assert.equal(normaliseE164("+52 81 abc 5678"), null);
  assert.equal(normaliseE164("+52+81 1234 5678"), null);
  assert.equal(normaliseE164(""), null);
  assert.equal(normaliseE164(null), null);
});

test("shell tel round-trips and rejects junk", () => {
  const href = encodeShellTel("+528112345678");
  assert.equal(href, "shell://tel/528112345678");
  assert.equal(decodeShellTel(href), "+528112345678");
  assert.equal(decodeShellTel("shell://tel/abc"), null);
  assert.equal(decodeShellTel("shell://tel/123"), null);
  assert.equal(decodeShellTel("shell://whatsapp/528112345678"), null);
  assert.equal(encodeShellTel("nope"), "");
});

test("PRIVACY: nothing leaks when the call number is not set", () => {
  const privatePhone = { phone: "+52 998 111 2233", phoneE164: "+529981112233" };
  assert.equal(talentContactHrefs(privatePhone).callHref, "");
  // Even with WhatsApp and email opted in, the call link stays empty.
  const links = [{ href: "shell://whatsapp/529981112233" }, { href: "mailto:a@b.co" }];
  const hrefs = talentContactHrefs({ ...privatePhone, socialLinks: links });
  assert.equal(hrefs.callHref, "");
  assert.equal(callHrefFromSocialLinks(links), "");
  assert.equal(callHrefFromSocialLinks(null), "");
  assert.equal(callHrefFromSocialLinks([{ href: "tel:+529981112233" }]), "");
  assert.equal(findShellTel(undefined), null);
});

test("the explicit number becomes tel:, and never the private phone", () => {
  const hrefs = talentContactHrefs({
    phone: "+52 998 111 2233",
    phoneE164: "+529981112233",
    socialLinks: [{ href: "shell://tel/528112345678" }],
  });
  assert.equal(hrefs.callHref, "tel:+528112345678");
  assert.ok(!hrefs.callHref.includes("9981112233"));
});

test("set and clear only touch the tel entry", () => {
  const base = [
    { label: "Instagram", href: "https://instagram.com/x" },
    { label: "Shell · WhatsApp", href: "shell://whatsapp/529981112233" },
  ];
  const on = withPublicCallNumber(base, "+528112345678");
  assert.equal(on.length, 3);
  assert.deepEqual(on.slice(0, 2), base);
  assert.equal(findShellTel(on), "+528112345678");
  const changed = withPublicCallNumber(on, "+528199998888");
  assert.equal(changed.length, 3);
  assert.equal(findShellTel(changed), "+528199998888");
  const off = withPublicCallNumber(changed, null);
  assert.deepEqual(off, base);
  assert.equal(callHrefFromSocialLinks(off), "");
  // An invalid value clears rather than storing junk.
  assert.deepEqual(withPublicCallNumber(on, "123"), base);
});

test("contact-channels never reads the private phone for the call link", () => {
  const src = readFileSync(new URL("./contact-channels.ts", import.meta.url), "utf8");
  const fn = src.slice(src.indexOf("export function talentContactHrefs"));
  assert.doesNotMatch(fn, /input\.phone/);
  const lib = readFileSync(new URL("./public-call-number.ts", import.meta.url), "utf8");
  assert.doesNotMatch(lib, /phoneE164|\.phone\b/);
});

test("the call button copy and the setting are in EN and ES", () => {
  const es = readFileSync(
    new URL("../../components/admin/shell/internal/dashboard-i18n-website-settings.ts", import.meta.url),
    "utf8",
  );
  assert.match(es, /"Show a call button": "Mostrar un botón de llamar"/);
  assert.match(es, /"Taking emergencies today": "Atiendo emergencias hoy"/);
});
