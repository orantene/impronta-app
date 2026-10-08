// EPIC E P0: client session refresh on talent-site hosts, behind
// CLIENT_ACCOUNT_HOSTS. Pins: flag off is byte-identical, anonymous visitors
// build no client, a refresh lands on the talent response without touching its
// server-set request headers, and a custom domain only ever gets host-only
// auth cookies.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { NextRequest, NextResponse } from "next/server";

import {
  clientAccountTalentHostsEnabled,
  talentHostAuthCookieDomain,
  withTalentHostClientSession,
  type TalentHostSessionDeps,
} from "./talent-host-session";

const AUTH = "sb-abcdefgh-auth-token";
const PROFILE_HEADER = "x-impronta-talent-profile";
const SUBDOMAIN = { hostname: "book-jorgelina.tulala.digital", hostKind: "subdomain" as const };
const CUSTOM = { hostname: "jorgelina.com", hostKind: "custom" as const };

function req(host: string, cookie?: string, extra?: Record<string, string>): NextRequest {
  const headers = new Headers(extra);
  headers.set("host", host);
  if (cookie) headers.set("cookie", cookie);
  return new NextRequest(new URL(`https://${host}/`), { headers });
}

/** What talentSiteHostResponse returns for a page: a rewrite carrying server-set headers. */
function talentResponse(host: string): NextResponse {
  const talentHeaders = new Headers();
  talentHeaders.set(PROFILE_HEADER, "server-resolved-profile-id");
  talentHeaders.set("x-impronta-host-context", "talent_site");
  const res = NextResponse.rewrite(new URL(`https://${host}/_talent-site`), {
    request: { headers: talentHeaders },
  });
  res.cookies.set("locale", "es", { path: "/" });
  return res;
}

type SetAll = (c: { name: string; value: string; options: Record<string, unknown> }[], h?: Record<string, string>) => void;

function fakeClient(onGetSession: (setAll: SetAll) => void) {
  const calls = { created: 0, getSession: 0 };
  const createClient = ((_url: string, _key: string, opts: { cookies: { setAll: SetAll } }) => {
    calls.created += 1;
    return {
      auth: {
        async getSession() {
          calls.getSession += 1;
          onGetSession(opts.cookies.setAll);
          return { data: { session: null }, error: null };
        },
      },
    };
  }) as unknown as NonNullable<TalentHostSessionDeps["createClient"]>;
  return { calls, createClient };
}

const NO_STORE = { "Cache-Control": "private, no-cache, no-store, must-revalidate, max-age=0", Expires: "0", Pragma: "no-cache" };
const env = { url: "https://example.supabase.co", anonKey: "anon" };

function refreshingClient(libraryDomain?: string) {
  return fakeClient((setAll) =>
    setAll(
      [
        { name: AUTH, value: "fresh-session", options: { path: "/", sameSite: "lax", maxAge: 400, ...(libraryDomain ? { domain: libraryDomain } : {}) } },
        { name: "not-an-auth-cookie", value: "x", options: { path: "/" } },
      ],
      NO_STORE,
    ),
  );
}

function setCookieFor(res: NextResponse, name: string): string | undefined {
  return res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`));
}

describe("clientAccountTalentHostsEnabled (mirrors #2553 CLIENT_ACCOUNT_HOSTS parsing)", () => {
  it("is OFF when unset, empty or not listing talent", () => {
    for (const raw of [undefined, "", "  ", ",", "agency", "hub,app", "talents", "all", "1"]) {
      assert.equal(clientAccountTalentHostsEnabled(raw), false, String(raw));
    }
  });
  it("is ON when talent is listed, trimmed and case-insensitive", () => {
    for (const raw of ["talent", " Talent ", "agency, talent", "TALENT,hub"]) {
      assert.equal(clientAccountTalentHostsEnabled(raw), true, raw);
    }
  });
});

describe("talentHostAuthCookieDomain", () => {
  it("shares .tulala.digital on a platform talent subdomain (same scope app writes)", () => {
    assert.equal(talentHostAuthCookieDomain(SUBDOMAIN), ".tulala.digital");
  });
  it("is host-only for a custom domain, an unknown kind, and localhost", () => {
    assert.equal(talentHostAuthCookieDomain(CUSTOM), undefined);
    assert.equal(talentHostAuthCookieDomain({ hostname: "book-x.tulala.digital" }), undefined);
    assert.equal(talentHostAuthCookieDomain({ hostname: "localhost", hostKind: "subdomain" }), undefined);
  });
});

describe("withTalentHostClientSession", () => {
  it("flag off: returns the talent response untouched and never builds a client", async () => {
    const { calls, createClient } = refreshingClient();
    const original = talentResponse(SUBDOMAIN.hostname);
    const before = [...original.headers.entries()];
    const res = await withTalentHostClientSession(
      req(SUBDOMAIN.hostname, `${AUTH}=stale`),
      SUBDOMAIN,
      async () => original,
      { enabled: () => false, createClient, env },
    );
    assert.equal(res, original);
    assert.deepEqual([...res.headers.entries()], before);
    assert.equal(calls.created, 0);
  });

  it("flag off by default when CLIENT_ACCOUNT_HOSTS is unset", async () => {
    const prev = process.env.CLIENT_ACCOUNT_HOSTS;
    delete process.env.CLIENT_ACCOUNT_HOSTS;
    try {
      const { calls, createClient } = refreshingClient();
      await withTalentHostClientSession(req(SUBDOMAIN.hostname, `${AUTH}=stale`), SUBDOMAIN, async () => talentResponse(SUBDOMAIN.hostname), { createClient, env });
      assert.equal(calls.created, 0);
    } finally {
      if (prev !== undefined) process.env.CLIENT_ACCOUNT_HOSTS = prev;
    }
  });

  it("flag on, no Supabase auth cookie: no client, no refresh, response untouched", async () => {
    const { calls, createClient } = refreshingClient();
    const original = talentResponse(SUBDOMAIN.hostname);
    const before = [...original.headers.entries()];
    const res = await withTalentHostClientSession(
      req(SUBDOMAIN.hostname, "impronta_guest=abc.sig; locale=es"),
      SUBDOMAIN,
      async () => original,
      { enabled: () => true, createClient, env },
    );
    assert.equal(calls.created, 0);
    assert.equal(calls.getSession, 0);
    assert.deepEqual([...res.headers.entries()], before);
  });

  it("flag on + auth cookie on a subdomain: refreshes and merges .tulala.digital cookies onto the talent response", async () => {
    const { calls, createClient } = refreshingClient();
    const res = await withTalentHostClientSession(
      req(SUBDOMAIN.hostname, `${AUTH}=stale`),
      SUBDOMAIN,
      async () => talentResponse(SUBDOMAIN.hostname),
      { enabled: () => true, createClient, env },
    );
    assert.equal(calls.getSession, 1);
    const auth = setCookieFor(res, AUTH);
    assert.ok(auth, "auth cookie written");
    assert.match(auth!, /fresh-session/);
    assert.match(auth!, /Domain=\.tulala\.digital/i);
    assert.equal(setCookieFor(res, "not-an-auth-cookie"), undefined, "only Supabase auth cookies are written");
    assert.ok(setCookieFor(res, "locale"), "the talent response's own cookies survive");
    // The render in this same request reads the fresh token.
    assert.match(res.headers.get("x-middleware-set-cookie") ?? "", new RegExp(`${AUTH}=fresh-session`));
    // talentSiteHostResponse's server-set request headers are untouched.
    assert.equal(res.headers.get(`x-middleware-request-${PROFILE_HEADER}`), "server-resolved-profile-id");
    assert.match(res.headers.get("x-middleware-rewrite") ?? "", /\/_talent-site$/);
    assert.match(res.headers.get("cache-control") ?? "", /no-store/);
  });

  it("custom domain: host-only cookie, even if the library or a spoofed host header suggests a parent domain", async () => {
    const { createClient } = refreshingClient(".tulala.digital");
    const res = await withTalentHostClientSession(
      req(CUSTOM.hostname, `${AUTH}=stale`, { "x-impronta-host-name": "app.tulala.digital" }),
      CUSTOM,
      async () => talentResponse(CUSTOM.hostname),
      { enabled: () => true, createClient, env },
    );
    const auth = setCookieFor(res, AUTH);
    assert.ok(auth, "auth cookie written");
    assert.doesNotMatch(auth!, /Domain=/i);
  });

  it("valid session (nothing to refresh): response untouched", async () => {
    const { calls, createClient } = fakeClient(() => {});
    const original = talentResponse(SUBDOMAIN.hostname);
    const before = [...original.headers.entries()];
    const res = await withTalentHostClientSession(req(SUBDOMAIN.hostname, `${AUTH}=valid`), SUBDOMAIN, async () => original, { enabled: () => true, createClient, env });
    assert.equal(calls.getSession, 1);
    assert.deepEqual([...res.headers.entries()], before);
  });

  it("redirects and 404s are passed through without a refresh", async () => {
    for (const build of [
      () => NextResponse.redirect(new URL("https://book-jorgelina.tulala.digital/en"), 302),
      () => NextResponse.rewrite(new URL("https://book-jorgelina.tulala.digital/_page-not-found"), { status: 404 }),
    ]) {
      const { calls, createClient } = refreshingClient();
      await withTalentHostClientSession(req(SUBDOMAIN.hostname, `${AUTH}=stale`), SUBDOMAIN, async () => build(), { enabled: () => true, createClient, env });
      assert.equal(calls.created, 0);
    }
  });

  it("a throwing refresh never breaks the talent response", async () => {
    const { createClient } = fakeClient(() => {
      throw new Error("Invalid Refresh Token");
    });
    const res = await withTalentHostClientSession(req(SUBDOMAIN.hostname, `${AUTH}=stale`), SUBDOMAIN, async () => talentResponse(SUBDOMAIN.hostname), { enabled: () => true, createClient, env });
    assert.equal(setCookieFor(res, AUTH), undefined);
    assert.equal(res.headers.get(`x-middleware-request-${PROFILE_HEADER}`), "server-resolved-profile-id");
  });
});

describe("real @supabase/ssr client (fetch stubbed, no network)", () => {
  it("an expired session cookie is refreshed by getSession and the rotated token is written scoped", async () => {
    const user = { id: "u1", aud: "authenticated", role: "authenticated", email: "a@b.c", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
    const now = Math.floor(Date.now() / 1000);
    const session = { access_token: "old.at.x", refresh_token: "old-rt", token_type: "bearer", expires_in: 3600, expires_at: now - 60, user };
    const cookie = `sb-abcdefgh-auth-token=base64-${Buffer.from(JSON.stringify(session)).toString("base64url")}`;
    const urls: string[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (input: RequestInfo | URL) => {
      urls.push(String(input));
      const body = { ...session, access_token: "new.at.y", refresh_token: "new-rt", expires_at: now + 3600 };
      return new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    }) as typeof fetch;
    try {
      for (const host of [SUBDOMAIN, CUSTOM]) {
        urls.length = 0;
        const res = await withTalentHostClientSession(req(host.hostname, cookie), host, async () => NextResponse.next(), {
          enabled: () => true,
          env: { url: "https://abcdefgh.supabase.co", anonKey: "anon" },
        });
        assert.ok(urls.some((u) => u.includes("grant_type=refresh_token")), `${host.hostname}: refresh called`);
        const auth = res.headers.getSetCookie().filter((c) => c.startsWith("sb-abcdefgh-auth-token"));
        assert.ok(auth.length > 0, `${host.hostname}: rotated cookie written`);
        for (const c of auth) {
          if (host === CUSTOM) assert.doesNotMatch(c, /Domain=/i);
          else assert.match(c, /Domain=\.tulala\.digital/i);
        }
        assert.match(res.headers.get("cache-control") ?? "", /no-store/);
      }
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("proxy.ts wiring", () => {
  it("the talent_site branch wraps talentSiteHostResponse (sanitized headers) in withTalentHostClientSession", () => {
    const proxy = readFileSync(join(process.cwd(), "src/proxy.ts"), "utf8");
    const at = proxy.indexOf('if (hostContext.kind === "talent_site") {');
    assert.ok(at > 0);
    const branch = proxy.slice(at, proxy.indexOf("}", at));
    assert.match(
      branch,
      /return withTalentHostClientSession\(request, hostContext, \(\) => talentSiteHostResponse\(request, pathname, sanitizedInboundHeaders, hostContext\)\);/,
    );
  });
});
