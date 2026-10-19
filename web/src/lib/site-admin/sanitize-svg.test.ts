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

test("elements and attributes outside the brand-mark policy are rejected", () => {
  reject('<svg><style>*{fill:red}</style></svg>', "style element");
  reject('<svg><rect style="fill:red"/></svg>', "style attribute");
  reject('<svg><a href="https://evil.example"><rect/></a></svg>', "link");
  reject('<svg><image href="https://evil.example/x.png"/></svg>', "image");
  reject('<svg><animate attributeName="href" values="javascript:alert(1)"/></svg>', "animate");
  reject('<svg><use href="javascript:alert(1)"/></svg>', "javascript href");
  reject('<svg><rect data-x="1"/></svg>', "data attribute");
  reject('<svg><title><img src=x onerror=alert(1)></title></svg>', "mXSS-style payload");
  reject('<?xml version="1.0"?><svg></svg>', "prolog");
  reject('<svg></svg><script>alert(1)</script>', "trailing content");
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

test("a mark that fails the sanitizer yields no svg, and every render site drops it", async () => {
  assert.equal(sanitizeBrandMarkSvg("<svg onload=alert(1)></svg>").svg, undefined);
  const { readFileSync } = await import("node:fs");
  const { join } = await import("node:path");
  for (const f of ["src/components/public-header.tsx", "src/components/marketing/tenant-register-mount.tsx", "src/app/share/pitch/[token]/page.tsx"]) {
    assert.match(readFileSync(join(process.cwd(), f), "utf8"), /sanitizeBrandMarkSvg\([^)]*\)\.svg \?\? null/, f);
  }
});
