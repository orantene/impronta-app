/**
 * TUL-1773 guard: public routes ship only the public message subtrees.
 *
 * - The root-layout payload (`getClientMessagesPayload(locale)`) carries no admin-only subtree.
 * - A direct client translator file that reads an ADMIN subtree must only be reachable from
 *   `app/(workspace)/**` entries (the route group whose layout adds the admin subtrees). If a
 *   public route (talent page, tenant site, /w, marketing, auth) can reach it, move the subtree
 *   to PUBLIC_CLIENT_MESSAGE_SUBTREES (and list the reason in PUBLIC_SHARED_EXCEPTIONS) or stop
 *   importing the component from the public tree.
 */
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve, dirname } from "node:path";
import { test } from "node:test";

import en from "../../messages/en.json";
import es from "../../messages/es.json";

import {
  ADMIN_CLIENT_MESSAGE_SUBTREES,
  CLIENT_MESSAGE_SUBTREES,
  PUBLIC_CLIENT_MESSAGE_SUBTREES,
} from "./client-subtrees";
import { mergeClientMessages, CLIENT_MESSAGES_GLOBAL } from "./messages.client";
import { getClientMessagesPayload } from "./messages";

const WEB = join(__dirname, "..", "..");
const SRC = join(WEB, "src");

/**
 * Subtrees under the admin-looking `dashboard.*` / `admin.*` top-level namespaces that are
 * deliberately PUBLIC because a public tree reaches them. Documented exceptions, each with why.
 */
const PUBLIC_SHARED_EXCEPTIONS: Record<string, string> = {
  "dashboard.adminSupport": "SupportCardRenderer is mounted by the support chat from the root layout and the marketing pages",
  "dashboard.mediaField": "owner edit chrome (media-field) mounts on public tenant sites",
  "dashboard.mediaLibrary": "owner edit chrome (media picker / library) mounts on public tenant sites",
  "dashboard.mediaPickerLock": "owner edit chrome (media picker) mounts on public tenant sites",
  "dashboard.uploadGuard": "shared upload guard used by the media field and the talent editor",
};

type Catalog = Record<string, unknown>;

test("public and admin sets are disjoint and every entry exists in en.json", () => {
  const overlap = PUBLIC_CLIENT_MESSAGE_SUBTREES.filter((p) => (ADMIN_CLIENT_MESSAGE_SUBTREES as readonly string[]).includes(p));
  assert.deepEqual(overlap, []);
  assert.equal(CLIENT_MESSAGE_SUBTREES.length, PUBLIC_CLIENT_MESSAGE_SUBTREES.length + ADMIN_CLIENT_MESSAGE_SUBTREES.length);
  for (const p of ADMIN_CLIENT_MESSAGE_SUBTREES) {
    const [ns, sub] = p.split(".");
    assert.ok((en as Catalog)[ns] && ((en as Catalog)[ns] as Catalog)[sub] !== undefined, `${p} missing from en.json`);
  }
});

test("only documented exceptions keep an admin/dashboard subtree in the public set", () => {
  const stray = PUBLIC_CLIENT_MESSAGE_SUBTREES.filter(
    (p) => /^(admin|dashboard)\./.test(p) && !(p in PUBLIC_SHARED_EXCEPTIONS),
  );
  assert.deepEqual(stray, [], "add the subtree to ADMIN_CLIENT_MESSAGE_SUBTREES or document it in PUBLIC_SHARED_EXCEPTIONS");
  for (const p of Object.keys(PUBLIC_SHARED_EXCEPTIONS)) {
    assert.ok((PUBLIC_CLIENT_MESSAGE_SUBTREES as readonly string[]).includes(p), `${p} is documented but not in the public set`);
  }
});

test("the public payload (root layout) contains no admin-only subtree, in every locale", () => {
  for (const locale of ["en", "es", "fr"]) {
    const payload = getClientMessagesPayload(locale) as Record<string, Catalog>;
    for (const catalog of Object.values(payload)) {
      for (const p of ADMIN_CLIENT_MESSAGE_SUBTREES) {
        const [ns, sub] = p.split(".");
        assert.equal((catalog[ns] as Catalog | undefined)?.[sub], undefined, `${locale}: ${p} leaked into the public payload`);
      }
      // Beyond the documented exceptions, no admin/dashboard namespace at all.
      for (const ns of ["admin", "dashboard"]) {
        for (const sub of Object.keys((catalog[ns] as Catalog | undefined) ?? {})) {
          assert.ok(`${ns}.${sub}` in PUBLIC_SHARED_EXCEPTIONS, `${locale}: ${ns}.${sub} is in the public payload`);
        }
      }
    }
  }
});

test("the admin payload carries exactly the admin subtrees, public + admin = the old payload", () => {
  const admin = getClientMessagesPayload("es", "admin") as Record<string, Catalog>;
  const pub = getClientMessagesPayload("es") as Record<string, Catalog>;
  const adminPaths = new Set(
    Object.values(admin).flatMap((c) => Object.entries(c).flatMap(([ns, subs]) => Object.keys(subs as Catalog).map((s) => `${ns}.${s}`))),
  );
  for (const p of adminPaths) assert.ok((ADMIN_CLIENT_MESSAGE_SUBTREES as readonly string[]).includes(p), `${p} is not an admin subtree`);
  assert.ok(adminPaths.has("dashboard.adminTabs"));
  assert.ok(!("public" in admin.es) && !("public" in (admin.en ?? {})));
  assert.ok(JSON.stringify(pub.es).length > 10_000);
  assert.equal(typeof ((admin.es.admin as Catalog).account as Catalog).title, "string");
  assert.equal(typeof (es as Catalog).admin, "object");
});

test("mergeClientMessages adds admin subtrees without dropping the public ones (browser only)", () => {
  const g = globalThis as Record<string, unknown>;
  const hadWindow = "window" in g;
  const prior = g[CLIENT_MESSAGES_GLOBAL];
  g.window = g;
  try {
    g[CLIENT_MESSAGES_GLOBAL] = { en: { public: { auth: { a: "A" } }, admin: { account: { keep: "K" } } } };
    mergeClientMessages({ en: { admin: { talent: { t: "T" } }, dashboard: { adminTabs: { x: "X" } } }, es: { admin: { roster: { r: "R" } } } });
    assert.deepEqual(g[CLIENT_MESSAGES_GLOBAL], {
      en: { public: { auth: { a: "A" } }, admin: { account: { keep: "K" }, talent: { t: "T" } }, dashboard: { adminTabs: { x: "X" } } },
      es: { admin: { roster: { r: "R" } } },
    });
  } finally {
    if (!hadWindow) delete g.window;
    if (prior === undefined) delete g[CLIENT_MESSAGES_GLOBAL];
    else g[CLIENT_MESSAGES_GLOBAL] = prior;
  }
});

test("mergeClientMessages is a no-op on the server (no cross-request global pollution)", () => {
  const g = globalThis as Record<string, unknown>;
  assert.ok(!("window" in g));
  const before = g[CLIENT_MESSAGES_GLOBAL];
  mergeClientMessages({ en: { admin: { talent: { t: "T" } } } });
  assert.equal(g[CLIENT_MESSAGES_GLOBAL], before);
});

test("root layout inlines the public payload only; the workspace layout merges the admin one", () => {
  const root = readFileSync(join(SRC, "app/layout.tsx"), "utf8");
  assert.match(root, /getClientMessagesPayload\(locale\)/);
  assert.doesNotMatch(root, /getClientMessagesPayload\([^)]*"admin"/);
  const ws = readFileSync(join(SRC, "app/(workspace)/layout.tsx"), "utf8");
  assert.match(ws, /getClientMessagesPayload\(locale, "admin"\)/);
  assert.match(ws, /<AdminClientMessages /);
});

// ---- Reachability: no public route can reach a component that reads an ADMIN subtree ----

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (/\.(tsx?|mts)$/.test(e.name) && !/\.test\./.test(e.name)) out.push(p);
  }
  return out;
}

function directClientTranslatorFiles(): string[] {
  const listed = execSync(`git grep -lE "i18n/(messages|translator-for|use-public-t)\\"" -- src`, { cwd: WEB, encoding: "utf8" })
    .trim()
    .split("\n")
    .filter((f) => f && !/\.test\.tsx?$/.test(f));
  return listed.filter((f) => {
    const src = readFileSync(join(WEB, f), "utf8");
    const lightImporter = /i18n\/(translator-for|use-public-t)"/.test(src);
    return (lightImporter || /^\s*["']use client["']/.test(src)) && /\b(createTranslator|getMessageStringArray|translatorFor|usePublicT)\b/.test(src);
  });
}

test("a component reading an admin subtree is reachable only from app/(workspace) entries", () => {
  const files = walk(SRC);
  const fileSet = new Set(files);
  const reverse = new Map<string, string[]>();
  const resolveSpec = (from: string, spec: string): string | null => {
    let base: string;
    if (spec.startsWith("@/")) base = join(SRC, spec.slice(2));
    else if (spec.startsWith(".")) base = resolve(dirname(from), spec);
    else return null;
    for (const c of [`${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx"), base]) if (fileSet.has(c)) return c;
    return null;
  };
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    for (const m of src.matchAll(/(?:from|import)\s*\(?\s*["']([^"']+)["']/g)) {
      const t = resolveSpec(f, m[1]);
      if (t) (reverse.get(t) ?? reverse.set(t, []).get(t)!).push(f);
    }
  }

  const admin = new Set<string>(ADMIN_CLIENT_MESSAGE_SUBTREES);
  const readers: string[] = [];
  for (const f of directClientTranslatorFiles()) {
    const src = readFileSync(join(WEB, f), "utf8");
    const calls = src.matchAll(/\b(?:t|copy|getMessageStringArray\([^,]+,)\s*\(?\s*["'`]([A-Za-z0-9_]+)\.([A-Za-z0-9_]+)\./g);
    if ([...calls].some((m) => admin.has(`${m[1]}.${m[2]}`))) readers.push(join(WEB, f));
  }
  assert.ok(readers.length >= 8, "the scan found the admin readers");

  const offenders: string[] = [];
  for (const start of readers) {
    const seen = new Set([start]);
    const queue = [start];
    while (queue.length) {
      const cur = queue.pop()!;
      for (const parent of reverse.get(cur) ?? []) {
        if (seen.has(parent)) continue;
        seen.add(parent);
        queue.push(parent);
      }
    }
    for (const f of seen) {
      const rel = relative(SRC, f);
      if (/^app\/.*\/(page|layout|route|loading|template|default|not-found|error)\.tsx?$|^app\/(layout|page)\.tsx$/.test(rel) && !rel.startsWith("app/(workspace)/")) {
        offenders.push(`${relative(WEB, start)} <- ${rel}`);
      }
    }
  }
  assert.deepEqual(offenders, [], "a public route reaches a component that reads an admin-only subtree: make that subtree public (with a documented exception) or cut the import");
});
