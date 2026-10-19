import assert from "node:assert/strict";
import test from "node:test";

import { sanitizeBrandMarkSvg } from "./sanitize-svg";

const reject = (svg: string, why: string) => {
  const r = sanitizeBrandMarkSvg(svg);
  assert.equal(r.ok, false, `${why}: ${svg}`);
};

test("TUL-1269: handlers hidden behind a slash or a missing space are rejected", () => {
  reject("<svg/onload=alert(1)></svg>", "slash separator, unquoted");
  reject('<svg><path d="M0 0"/onclick="x()"/></svg>', "slash separator before quoted handler");
  reject('<svg><path d="M0 0"onclick="x()"/></svg>', "no space after quoted value");
  reject("<svg\nonload=alert(1)></svg>", "newline separator");
  reject('<svg><use href=//evil.example/x.svg#a /></svg>', "unquoted external href");
});

test("external and script-bearing attribute values are rejected", () => {
  reject('<svg><rect fill="url(https://evil.example/x.svg#a)"/></svg>', "external url()");
  reject('<svg><use xlink:href="data:image/svg+xml,x"/></svg>', "data href");
  reject('<svg><rect fill="&#106;avascript:x"/></svg>', "entity in value");
  reject('<svg><script>alert(1)</script></svg>', "script");
  reject('<svg><foreignObject><div/></foreignObject></svg>', "foreignObject");
});

test("a normal brand mark still passes", () => {
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" aria-label="Logo">' +
    '<defs><linearGradient id="g"><stop offset="0" stop-color="#000"/></linearGradient></defs>' +
    '<path d="M2 2h20v20H2z" fill="url(#g)" stroke="currentColor"/><use href="#g"/></svg>';
  const r = sanitizeBrandMarkSvg(svg);
  assert.deepEqual(r.errors, []);
  assert.equal(r.ok, true);
});
