import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { DEFAULT_POLICY_ANSWERS } from "../../src/lib/talent-policies/answers";
import type { CustomClauses } from "../../src/lib/talent-policies/custom-clauses";
import type { PolicyFacts } from "../../src/lib/talent-policies/facts";
import { policyContentHash } from "../../src/lib/talent-policies/hash";
import {
  approvedClauses,
  assertMode,
  assertProfileCode,
  assertSiteSlug,
  parseArgs,
  run,
  type CurrentPolicy,
  type Io,
} from "./load-clauses-plan";

const RAW: unknown = JSON.parse(readFileSync(new URL("./custom-clauses.json", import.meta.url), "utf8"));
const CLAUSES = approvedClauses(RAW);
const PID = "00000000-0000-4000-8000-0000000000aa";
const FACTS: PolicyFacts = {
  displayName: "Jorgelina",
  depositPct: 30,
  inPersonMethods: ["cash"],
  cancelHours: 24,
  where: ["studio"],
  zone: "Roma Norte",
  contact: { chat: true, whatsapp: false, email: false },
};

function version(n: number, clauses: CustomClauses | null): CurrentPolicy {
  return {
    version: n,
    contentHash: policyContentHash(FACTS, DEFAULT_POLICY_ANSWERS, clauses),
    answers: DEFAULT_POLICY_ANSWERS,
    // Stored jsonb comes back with arbitrary key order; the guard must not care.
    facts: JSON.parse(JSON.stringify(FACTS)),
    customClauses: clauses,
  };
}

interface Fake extends Io {
  rows: CurrentPolicy[];
  logs: string[];
  publishCalls: number;
  liveFactsValue: unknown;
  profileCode: string;
  siteSlug: string | null;
}

function fake(rows: CurrentPolicy[], over: Partial<Pick<Fake, "liveFactsValue" | "profileCode" | "siteSlug">> = {}): Fake {
  const f: Fake = {
    rows: [...rows],
    logs: [],
    publishCalls: 0,
    liveFactsValue: FACTS,
    profileCode: "TAL-93938",
    siteSlug: "book-jorgelina",
    ...over,
    async load() {
      return {
        profile: { id: PID, profile_code: f.profileCode },
        siteSlug: f.siteSlug,
        current: f.rows.length ? f.rows[f.rows.length - 1]! : null,
      };
    },
    async liveFacts() {
      return f.liveFactsValue;
    },
    async readVersion(_p, n) {
      const r = f.rows.find((x) => x.version === n);
      return r ? { contentHash: r.contentHash, customClauses: r.customClauses } : null;
    },
    async publish({ answers, customClauses }) {
      f.publishCalls++;
      const last = f.rows[f.rows.length - 1]!;
      const row: CurrentPolicy = {
        version: last.version + 1,
        contentHash: policyContentHash(last.facts as PolicyFacts, answers, customClauses),
        answers,
        facts: last.facts,
        customClauses,
      };
      f.rows.push(row);
      return { ok: true, unchanged: false, version: row.version, contentHash: row.contentHash };
    },
    log: (l) => f.logs.push(l),
  };
  return f;
}

test("the approved file is 7 ES + 7 EN, within the feature limits, no em dash", () => {
  assert.equal(CLAUSES.es.length, 7);
  assert.equal(CLAUSES.en.length, 7);
  assert.deepEqual(CLAUSES, RAW);
  assert.ok(![...CLAUSES.es, ...CLAUSES.en].some((l) => l.includes("—")));
});

test("guards: profile, site and mode", () => {
  assert.throws(() => assertProfileCode("TAL-93900"), /QA talent/);
  assert.throws(() => assertProfileCode("TAL-1"), /only TAL-93938/);
  assert.doesNotThrow(() => assertProfileCode("TAL-93938"));
  assert.throws(() => assertSiteSlug("jorg-beauty-qa"), /QA site/);
  assert.throws(() => assertSiteSlug("other"), /expected book-jorgelina/);
  assert.throws(() => assertSiteSlug(null), /expected book-jorgelina/);
  assert.doesNotThrow(() => assertSiteSlug("book-jorgelina"));
  assert.throws(() => assertMode(parseArgs(["--apply"])), /needs --yes/);
  assert.throws(() => assertMode(parseArgs(["--yes"])), /without --apply/);
  assert.throws(() => parseArgs(["--force"]), /unknown argument/);
  assert.doesNotThrow(() => assertMode(parseArgs(["--apply", "--yes"])));
});

test("limits: 20 lines and 400 chars are enforced, text is never altered", () => {
  const ok = (n: number) => Array.from({ length: n }, (_, i) => `line ${i}`);
  assert.throws(() => approvedClauses({ es: ok(21), en: ok(7) }), /expected 7/);
  assert.throws(() => approvedClauses({ es: [...ok(6), "x".repeat(401)], en: ok(7) }), /longer than 400/);
  assert.throws(() => approvedClauses({ es: [...ok(6), " padded "], en: ok(7) }), /never altered/);
  assert.throws(() => approvedClauses({ es: [...ok(6), "a — b"], en: ok(7) }), /em dash/);
  assert.throws(() => approvedClauses({ es: ok(7) }), /must be/);
});

test("dry run (the default) writes nothing and shows the diff", async () => {
  const f = fake([version(3, null)]);
  const r = await run([], RAW, f);
  assert.equal(r.status, "dry-run");
  assert.equal(r.exitCode, 0);
  assert.equal(f.publishCalls, 0);
  assert.equal(f.rows.length, 1);
  const out = f.logs.join("\n");
  assert.match(out, /Current policy version: 3/);
  assert.match(out, /\(null\)/);
  assert.match(out, /7 ES \+ 7 EN/);
  assert.match(out, /Would create version 4/);
});

test("--apply without --yes is refused and writes nothing", async () => {
  const f = fake([version(3, null)]);
  const r = await run(["--apply"], RAW, f);
  assert.equal(r.status, "refused");
  assert.equal(r.exitCode, 2);
  assert.equal(f.publishCalls, 0);
});

test("refuses the QA profile, a wrong profile, and a wrong or QA site", async () => {
  for (const argv of [["--profile", "TAL-93900"], ["--profile=TAL-1"]]) {
    const f = fake([version(1, null)]);
    assert.equal((await run(argv, RAW, f)).status, "refused");
    assert.equal(f.publishCalls, 0);
  }
  for (const siteSlug of ["jorg-beauty-qa", "someone-else", null]) {
    const f = fake([version(1, null)], { siteSlug });
    assert.equal((await run(["--apply", "--yes"], RAW, f)).status, "refused");
    assert.equal(f.publishCalls, 0);
  }
  const f = fake([version(1, null)], { profileCode: "TAL-93900" });
  assert.equal((await run(["--apply", "--yes"], RAW, f)).status, "refused");
  assert.equal(f.publishCalls, 0);
});

test("apply creates ONE new version, keeps facts and answers, leaves the old row alone", async () => {
  const f = fake([version(2, null), version(3, null)]);
  const r = await run(["--apply", "--yes"], RAW, f);
  assert.equal(r.status, "applied");
  assert.equal(r.exitCode, 0);
  assert.equal(f.publishCalls, 1);
  assert.equal(f.rows.length, 3);
  const [, old, next] = f.rows as [CurrentPolicy, CurrentPolicy, CurrentPolicy];
  assert.deepEqual(old, version(3, null));
  assert.equal(next.version, 4);
  assert.deepEqual(next.customClauses, CLAUSES);
  assert.deepEqual(next.facts, old.facts);
  assert.deepEqual(next.answers, old.answers);
  assert.equal(next.contentHash, policyContentHash(FACTS, DEFAULT_POLICY_ANSWERS, CLAUSES));
});

test("idempotent: the current version already has exactly these clauses", async () => {
  const f = fake([version(4, CLAUSES)]);
  const r = await run(["--apply", "--yes"], RAW, f);
  assert.equal(r.status, "no-op");
  assert.equal(r.exitCode, 0);
  assert.equal(f.publishCalls, 0);
});

test("refuses when no policy version exists", async () => {
  const f = fake([]);
  const r = await run(["--apply", "--yes"], RAW, f);
  assert.equal(r.status, "refused");
  assert.equal(f.publishCalls, 0);
});

test("refuses when the live facts drifted from the current version", async () => {
  const f = fake([version(3, null)], { liveFactsValue: { ...FACTS, depositPct: 50 } });
  const r = await run(["--apply", "--yes"], RAW, f);
  assert.equal(r.status, "refused");
  assert.equal(f.publishCalls, 0);
});

test("a store that changes the facts is caught by the post-apply verification", async () => {
  const f = fake([version(3, null)]);
  const real = f.publish.bind(f);
  f.publish = async (i) => {
    const res = await real(i);
    f.rows[f.rows.length - 1]!.facts = { ...FACTS, zone: "Elsewhere" };
    return res;
  };
  const r = await run(["--apply", "--yes"], RAW, f);
  assert.equal(r.status, "failed");
  assert.equal(r.exitCode, 1);
  assert.match(f.logs.join("\n"), /facts changed/);
});

test("a publish error is reported as failed", async () => {
  const f = fake([version(3, null)]);
  f.publish = async () => ({ ok: false, reason: "unavailable" });
  const r = await run(["--apply", "--yes"], RAW, f);
  assert.equal(r.status, "failed");
  assert.equal(r.exitCode, 1);
});
