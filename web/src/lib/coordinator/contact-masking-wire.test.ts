import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import { CONTACT_MASKING_FLAG } from "./contact-masking";
import { contactMaskingActive } from "./contact-masking.server";

type Rows = Record<string, { data?: unknown[]; error?: { code?: string; message: string } | null }>;
function fake(rows: Rows) {
  const calls: string[] = [];
  const from = (table: string) => {
    calls.push(table);
    const b: Record<string, unknown> = {};
    const chain = () => b;
    b.select = chain; b.eq = chain; b.neq = chain; b.in = chain; b.limit = chain;
    b.then = (ok: (v: unknown) => unknown) => Promise.resolve({ data: rows[table]?.data ?? [], error: rows[table]?.error ?? null }).then(ok);
    return b;
  };
  return { admin: { from } as never, calls };
}
async function withFlag<T>(v: string | undefined, run: () => Promise<T>) {
  const prev = process.env[CONTACT_MASKING_FLAG];
  if (v === undefined) delete process.env[CONTACT_MASKING_FLAG];
  else process.env[CONTACT_MASKING_FLAG] = v;
  try {
    return await run();
  } finally {
    if (prev === undefined) delete process.env[CONTACT_MASKING_FLAG];
    else process.env[CONTACT_MASKING_FLAG] = prev;
  }
}
const input = { inquiryId: "i", tenantId: "t" };
const lineup = { inquiry_participants: { data: [{ talent_profile_id: "p1" }] } };

test("flag off (default): no masking and not one database read", async () => {
  const f = fake({});
  assert.equal(await withFlag(undefined, () => contactMaskingActive(f.admin, input)), false);
  assert.deepEqual(f.calls, []);
});

test("flag on: accepted terms that keep the workspace as the contact mask before booking", async () => {
  const f = fake({ ...lineup, workspace_talent_terms: { data: [{ talent_profile_id: "p1", version: 1, show_contact: false, client_contact: "workspace" }] } });
  assert.equal(await withFlag("true", () => contactMaskingActive(f.admin, input)), true);
});

test("flag on: the highest accepted version decides", async () => {
  const f = fake({
    ...lineup,
    workspace_talent_terms: { data: [
      { talent_profile_id: "p1", version: 1, show_contact: false, client_contact: "workspace" },
      { talent_profile_id: "p1", version: 2, show_contact: true, client_contact: "talent" },
    ] },
  });
  assert.equal(await withFlag("true", () => contactMaskingActive(f.admin, input)), false);
});

test("flag on: a confirmed booking ends masking", async () => {
  const f = fake({ talent_bookings: { data: [{ id: "b" }] }, ...lineup, workspace_talent_terms: { data: [{ talent_profile_id: "p1", version: 1, show_contact: false, client_contact: "workspace" }] } });
  assert.equal(await withFlag("true", () => contactMaskingActive(f.admin, input)), false);
});

test("flag on: failed reads mask (privacy fails closed); a missing terms table means no terms", async () => {
  assert.equal(await withFlag("true", () => contactMaskingActive(fake({ talent_bookings: { error: { message: "boom" } } }).admin, input)), true);
  assert.equal(await withFlag("true", () => contactMaskingActive(fake({ ...lineup, workspace_talent_terms: { error: { code: "XX000", message: "boom" } } }).admin, input)), true);
  assert.equal(await withFlag("true", () => contactMaskingActive(fake({ ...lineup, workspace_talent_terms: { error: { code: "42P01", message: "no table" } } }).admin, input)), false);
});

test("sendMessage masks only the client chat, and uses the masked text for notifications and edits", () => {
  const src = readFileSync(join(process.cwd(), "src/lib/inquiry/inquiry-engine-messages.ts"), "utf8");
  assert.match(src, /ctx\.threadType === "private" && \(await contactMaskingActive\(/);
  assert.match(src, /body: storedBody,\s+metadata:/);
  assert.doesNotMatch(src.slice(src.indexOf("export async function sendMessage"), src.indexOf("export async function markThreadRead")), /body: ctx\.body/);
  assert.match(src, /msg\.thread_type === "private" && \(await contactMaskingActive\(/);
});
