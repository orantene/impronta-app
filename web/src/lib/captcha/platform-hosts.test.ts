import { test } from "node:test";
import assert from "node:assert/strict";
import {
  chooseCaptchaSource,
  hostFromHeaders,
  isPlatformCaptchaHost,
  normalizeHost,
} from "./platform-hosts";

const noEnv = {};

test("platform hosts are covered", () => {
  for (const h of [
    "tulala.digital",
    "app.tulala.digital",
    "jor.tulala.digital:443",
    "localhost:3001",
    "x.localhost",
    "127.0.0.1:3000",
  ]) {
    assert.equal(isPlatformCaptchaHost(h, noEnv), true, h);
  }
});

test("custom domains and lookalikes are not covered", () => {
  for (const h of ["maria-nails.com", "www.maria-nails.com", "eviltulala.digital", "tulala.digital.evil.com"]) {
    assert.equal(isPlatformCaptchaHost(h, noEnv), false, h);
  }
});

test("missing host keeps today's behavior (platform)", () => {
  assert.equal(isPlatformCaptchaHost(null, noEnv), true);
});

test("TURNSTILE_PLATFORM_HOSTS matches entry and its subdomains", () => {
  const env = { TURNSTILE_PLATFORM_HOSTS: " impronta.mx, *.ownbrand.com " };
  assert.equal(isPlatformCaptchaHost("impronta.mx", env), true);
  assert.equal(isPlatformCaptchaHost("www.impronta.mx", env), true);
  assert.equal(isPlatformCaptchaHost("a.ownbrand.com", env), true);
  assert.equal(isPlatformCaptchaHost("ownbrand.com", env), true);
  assert.equal(isPlatformCaptchaHost("notimpronta.mx", env), false);
});

test("decision: platform host -> platform, custom+own -> own, custom without own -> none", () => {
  assert.equal(chooseCaptchaSource({ ownUsable: false, host: "app.tulala.digital", env: noEnv }), "platform");
  assert.equal(chooseCaptchaSource({ ownUsable: true, host: "maria-nails.com", env: noEnv }), "own");
  assert.equal(chooseCaptchaSource({ ownUsable: true, host: "app.tulala.digital", env: noEnv }), "own");
  assert.equal(chooseCaptchaSource({ ownUsable: false, host: "maria-nails.com", env: noEnv }), "none");
});

test("normalizeHost + hostFromHeaders", () => {
  assert.equal(normalizeHost("HTTPS://Www.Example.com:8443/path"), "www.example.com");
  assert.equal(normalizeHost("a.com, b.com"), "a.com");
  const h = new Map([
    ["host", "b.com"],
    ["x-forwarded-host", "a.com"],
  ]);
  assert.equal(hostFromHeaders({ get: (k) => h.get(k) ?? null }), "a.com");
  assert.equal(hostFromHeaders({ get: (k) => (k === "host" ? "b.com" : null) }), "b.com");
});
