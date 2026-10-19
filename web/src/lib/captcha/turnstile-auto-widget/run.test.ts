import assert from "node:assert/strict";
import { test } from "node:test";

import type { FetchLike } from "./cloudflare-client";
import type { CaptchaConfigView } from "./decision";
import {
  provisionAutoTurnstileWidgets,
  releaseAutoTurnstileWidget,
  type AutoWidgetDeps,
  type ManagedCaptchaStore,
} from "./run";

const FULL_ENV = {
  CAPTCHA_AUTO_WIDGET: "1",
  CLOUDFLARE_ACCOUNT_ID: "acct",
  CLOUDFLARE_TURNSTILE_API_TOKEN: "tok",
};

type Call = { method: string; url: string; body: unknown };

/** In-memory Cloudflare: list / create / delete on a widget array. */
function fakeCloudflare(opts: { widgets?: Array<{ sitekey: string; name: string }>; fail?: "list" | "create" | "delete" } = {}) {
  const widgets = [...(opts.widgets ?? [])];
  const calls: Call[] = [];
  let n = 0;
  const fetch: FetchLike = async (url, init) => {
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    calls.push({ method, url, body });
    if (method === "GET") {
      if (opts.fail === "list") return Response.json({ success: false }, { status: 500 });
      return Response.json({ success: true, result: widgets, result_info: { total_count: widgets.length } });
    }
    if (method === "POST") {
      if (opts.fail === "create") return Response.json({ success: false }, { status: 400 });
      n += 1;
      const w = { sitekey: `0xNEW${n}`, secret: `0xSECRET${n}`, name: (body as { name: string }).name };
      widgets.push({ sitekey: w.sitekey, name: w.name });
      return Response.json({ success: true, result: w });
    }
    if (opts.fail === "delete") return Response.json({ success: false }, { status: 500 });
    return Response.json({ success: true, result: {} });
  };
  return { fetch, calls, widgets };
}

type Saved = { siteKey: string; secret: string; domain: string; widgetName: string };

function fakeStore(initial: Record<string, CaptchaConfigView | null> = {}, opts: { saveFails?: boolean } = {}) {
  const configs = new Map<string, CaptchaConfigView | null>(Object.entries(initial));
  const secrets = new Set<string>();
  const saved: Array<{ tenantId: string } & Saved> = [];
  const cleared: string[] = [];
  const store: ManagedCaptchaStore = {
    async getConfig(t) {
      return configs.get(t) ?? null;
    },
    async hasSecret(t) {
      return secrets.has(t);
    },
    async saveManaged(t, input) {
      if (opts.saveFails) return false;
      saved.push({ tenantId: t, ...input });
      secrets.add(t);
      configs.set(t, {
        provider: "turnstile",
        site_key: input.siteKey,
        managed_by: "tulala-auto",
        managed_domain: input.domain,
        managed_widget_name: input.widgetName,
      });
      return true;
    },
    async clearManaged(t) {
      cleared.push(t);
      configs.set(t, {});
      secrets.delete(t);
      return true;
    },
  };
  return { store, saved, cleared, configs };
}

function deps(env: Record<string, string | undefined>, fetch: FetchLike, store: ManagedCaptchaStore) {
  const logs: Array<Record<string, unknown>> = [];
  const d: AutoWidgetDeps = { env, fetch, store, log: (_c, detail) => logs.push(detail) };
  return { d, logs };
}

const DOMAIN = { tenantId: "t1", hostname: "maria-nails.com" };

test("flag off: zero fetch calls, nothing stored, nothing logged", async () => {
  for (const flag of [undefined, "0", "true"]) {
    const cf = fakeCloudflare();
    const st = fakeStore();
    const { d, logs } = deps({ ...FULL_ENV, CAPTCHA_AUTO_WIDGET: flag }, cf.fetch, st.store);
    const r = await provisionAutoTurnstileWidgets([DOMAIN], d);
    assert.equal(r.ran, false);
    assert.equal(cf.calls.length, 0);
    assert.equal(st.saved.length, 0);
    assert.equal(logs.length, 0);
    assert.equal(await releaseAutoTurnstileWidget(DOMAIN, d), "flag_off");
    assert.equal(cf.calls.length, 0);
  }
});

test("flag on but missing env: zero fetch calls, logged once, captcha stays none", async () => {
  for (const missing of ["CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_TURNSTILE_API_TOKEN"]) {
    const cf = fakeCloudflare();
    const st = fakeStore();
    const { d, logs } = deps({ ...FULL_ENV, [missing]: undefined }, cf.fetch, st.store);
    const r = await provisionAutoTurnstileWidgets([DOMAIN, { tenantId: "t2", hostname: "b.com" }], d);
    assert.equal(r.ran, false);
    assert.equal(cf.calls.length, 0);
    assert.equal(st.saved.length, 0);
    assert.equal(logs.length, 1);
    assert.equal(await releaseAutoTurnstileWidget(DOMAIN, d), "missing_env");
    assert.equal(cf.calls.length, 0);
  }
});

test("new active domain without own keys: list, create, store as tulala-auto", async () => {
  const cf = fakeCloudflare();
  const st = fakeStore();
  const { d, logs } = deps(FULL_ENV, cf.fetch, st.store);
  const r = await provisionAutoTurnstileWidgets([DOMAIN], d);
  assert.equal(r.created, 1);
  assert.deepEqual(
    cf.calls.map((c) => c.method),
    ["GET", "POST"],
  );
  assert.deepEqual(cf.calls[1]?.body, {
    name: "tulala:maria-nails.com",
    domains: ["maria-nails.com", "www.maria-nails.com"],
    mode: "managed",
  });
  assert.deepEqual(st.saved, [
    { tenantId: "t1", siteKey: "0xNEW1", secret: "0xSECRET1", domain: "maria-nails.com", widgetName: "tulala:maria-nails.com" },
  ]);
  assert.equal(logs.length, 0);
});

test("own keys: never calls Cloudflare, never touches the row", async () => {
  const cf = fakeCloudflare();
  const st = fakeStore({ t1: { provider: "turnstile", site_key: "0xOWN" } });
  const { d } = deps(FULL_ENV, cf.fetch, st.store);
  const r = await provisionAutoTurnstileWidgets([DOMAIN], d);
  assert.deepEqual(r.results, [{ hostname: "maria-nails.com", outcome: "own_keys" }]);
  assert.equal(cf.calls.length, 0);
  assert.equal(st.saved.length, 0);
});

test("existing tulala:<domain> widget without a stored secret: skip and log once (no rotate)", async () => {
  const cf = fakeCloudflare({ widgets: [{ sitekey: "0xOLD", name: "tulala:maria-nails.com" }] });
  const st = fakeStore();
  const { d, logs } = deps(FULL_ENV, cf.fetch, st.store);
  const r = await provisionAutoTurnstileWidgets([DOMAIN], d);
  assert.deepEqual(r.results, [{ hostname: "maria-nails.com", outcome: "skip_reuse_no_secret" }]);
  assert.deepEqual(
    cf.calls.map((c) => c.method),
    ["GET"],
  );
  assert.equal(logs.length, 1);
  assert.equal(st.saved.length, 0);
});

test("cap: at most N creations per run, one list call for the whole run", async () => {
  const cf = fakeCloudflare();
  const st = fakeStore();
  const { d } = deps(FULL_ENV, cf.fetch, st.store);
  const domains = ["a.com", "b.com", "c.com", "d.com"].map((hostname, i) => ({ tenantId: `t${i}`, hostname }));
  const r = await provisionAutoTurnstileWidgets(domains, d, { cap: 2 });
  assert.equal(r.created, 2);
  assert.equal(r.skipped, 2);
  assert.equal(cf.calls.filter((c) => c.method === "GET").length, 1);
  assert.equal(cf.calls.filter((c) => c.method === "POST").length, 2);
});

test("list failure: fail safe, nothing created, logged", async () => {
  const cf = fakeCloudflare({ fail: "list" });
  const st = fakeStore();
  const { d, logs } = deps(FULL_ENV, cf.fetch, st.store);
  const r = await provisionAutoTurnstileWidgets([DOMAIN, { tenantId: "t2", hostname: "b.com" }], d);
  assert.equal(r.failed, 1);
  assert.equal(r.created, 0);
  assert.equal(cf.calls.length, 1);
  assert.equal(st.saved.length, 0);
  assert.deepEqual(logs, [{ event: "list_http_error", hostname: "maria-nails.com", status: 500 }]);
});

test("create failure: nothing stored, logged with status only", async () => {
  const cf = fakeCloudflare({ fail: "create" });
  const st = fakeStore();
  const { d, logs } = deps(FULL_ENV, cf.fetch, st.store);
  const r = await provisionAutoTurnstileWidgets([DOMAIN], d);
  assert.equal(r.failed, 1);
  assert.equal(st.saved.length, 0);
  assert.deepEqual(logs, [{ event: "create_http_error", hostname: "maria-nails.com", status: 400 }]);
  assert.equal(JSON.stringify(logs).includes("tok"), false);
});

test("store failure after create: the orphan widget is deleted", async () => {
  const cf = fakeCloudflare();
  const st = fakeStore({}, { saveFails: true });
  const { d } = deps(FULL_ENV, cf.fetch, st.store);
  const r = await provisionAutoTurnstileWidgets([DOMAIN], d);
  assert.equal(r.failed, 1);
  assert.deepEqual(
    cf.calls.map((c) => c.method),
    ["GET", "POST", "DELETE"],
  );
  assert.match(cf.calls[2]?.url ?? "", /\/challenges\/widgets\/0xNEW1$/);
});

test("detach: deletes the managed widget and clears stored keys", async () => {
  const cf = fakeCloudflare();
  const st = fakeStore();
  const { d } = deps(FULL_ENV, cf.fetch, st.store);
  await provisionAutoTurnstileWidgets([DOMAIN], d);
  cf.calls.length = 0;
  assert.equal(await releaseAutoTurnstileWidget(DOMAIN, d), "deleted");
  assert.deepEqual(
    cf.calls.map((c) => c.method),
    ["DELETE"],
  );
  assert.match(cf.calls[0]?.url ?? "", /\/challenges\/widgets\/0xNEW1$/);
  assert.deepEqual(st.cleared, ["t1"]);
});

test("detach never touches a workspace's own keys", async () => {
  const cf = fakeCloudflare();
  const st = fakeStore({ t1: { provider: "turnstile", site_key: "0xOWN" } });
  const { d } = deps(FULL_ENV, cf.fetch, st.store);
  assert.equal(await releaseAutoTurnstileWidget(DOMAIN, d), "skip_not_managed");
  assert.equal(cf.calls.length, 0);
  assert.equal(st.cleared.length, 0);
});

test("detach: Cloudflare error keeps the stored keys and logs", async () => {
  const cf = fakeCloudflare({ fail: "delete" });
  const st = fakeStore({
    t1: {
      provider: "turnstile",
      site_key: "0xM",
      managed_by: "tulala-auto",
      managed_domain: "maria-nails.com",
      managed_widget_name: "tulala:maria-nails.com",
    },
  });
  const { d, logs } = deps(FULL_ENV, cf.fetch, st.store);
  assert.equal(await releaseAutoTurnstileWidget(DOMAIN, d), "delete_failed");
  assert.equal(st.cleared.length, 0);
  assert.equal(logs.length, 1);
});
