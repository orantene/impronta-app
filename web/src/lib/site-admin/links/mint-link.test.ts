import assert from "node:assert/strict";
import { test } from "node:test";

import { mintLink, type MintLinkDeps } from "./mint-link";

const okGuard: MintLinkDeps["guard"] = async () => ({ ok: true, tenantId: "tenant-A", userId: "user-1" });

function recording() {
  const calls: unknown[] = [];
  const createLink: MintLinkDeps["createLink"] = async (input) => {
    calls.push(input);
    return {
      ok: true,
      link: {
        id: "L1", tenant_id: input.tenantId, code: input.code, code_mode: "readable", name: input.name,
        kind: input.kind, targets: input.targets, context: {}, status: "active", printed_count: 0,
      },
    };
  };
  return { calls, createLink };
}

test("refuses without a guard and never touches the store", async () => {
  const { calls, createLink } = recording();
  const res = await mintLink({ code: "lumina", name: "x", targetPath: "/lumina" }, {
    guard: async () => ({ ok: false, error: "Not authorized." }),
    createLink,
  });
  assert.deepEqual(res, { ok: false, error: "Not authorized." });
  assert.equal(calls.length, 0);
});

test("the tenant is the guard's, never the input's", async () => {
  const { calls, createLink } = recording();
  const res = await mintLink(
    { code: "lumina", name: "LUMINA landing", targetPath: "/lumina", tenantId: "tenant-B" },
    { guard: okGuard, createLink },
  );
  assert.ok(res.ok);
  const call = calls[0] as { tenantId: string; codeMode: string; kind: string; targets: Array<{ when: string; to: { to: string; label: string } }>; createdBy: string };
  assert.equal(call.tenantId, "tenant-A");
  assert.equal(call.createdBy, "user-1");
  assert.equal(call.codeMode, "readable");
  assert.equal(call.kind, "other");
  assert.deepEqual(call.targets, [{ when: "always", to: { to: "/lumina", label: "lumina" } }]);
  if (res.ok) assert.deepEqual(res.link, { id: "L1", code: "lumina", name: "LUMINA landing", kind: "other", status: "active" });
});

test("only a path on this site can be a destination", async () => {
  const { calls, createLink } = recording();
  for (const targetPath of ["https://evil.example/x", "//evil.example", "lumina", "/lum ina", "/a\\b"]) {
    const res = await mintLink({ code: "lumina", name: "x", targetPath }, { guard: okGuard, createLink });
    assert.equal(res.ok, false, targetPath);
  }
  assert.equal(calls.length, 0);
});

test("the code follows CODE_PATTERN and is lower-cased", async () => {
  const { calls, createLink } = recording();
  for (const code of ["-lumina", "lumina-", "lu mina", "LUM/INA", ""]) {
    const res = await mintLink({ code, name: "x", targetPath: "/lumina" }, { guard: okGuard, createLink });
    assert.equal(res.ok, false, code);
  }
  const res = await mintLink({ code: "LUMINA", name: "x", targetPath: "/lumina" }, { guard: okGuard, createLink });
  assert.ok(res.ok);
  assert.equal((calls[0] as { code: string }).code, "lumina");
});

test("a store refusal is passed through as the product sentence", async () => {
  const res = await mintLink({ code: "lumina", name: "x", targetPath: "/lumina" }, {
    guard: okGuard,
    createLink: async () => ({ ok: false, reason: 'The code "lumina" is already in use on this site.' }),
  });
  assert.deepEqual(res, { ok: false, error: 'The code "lumina" is already in use on this site.' });
});
