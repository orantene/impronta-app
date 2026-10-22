/** TUL-1719: configure-stripe-webhook.sh has an UPDATE mode that only ever adds events. Runs the real script against a stub `stripe`. */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test } from "node:test";

const SCRIPT = join(process.cwd(), "../scripts/ops/configure-stripe-webhook.sh");

function run(args: string[], endpoint: { enabled_events: string[] }) {
  const dir = mkdtempSync(join(tmpdir(), "stripe-stub-"));
  const log = join(dir, "calls.log");
  const stub = join(dir, "stripe");
  writeFileSync(
    stub,
    `#!/usr/bin/env bash
echo "$@" >> "${log}"
if [ "$1" = "webhook_endpoints" ] && [ "$2" = "retrieve" ]; then cat <<'JSON'
${JSON.stringify(endpoint)}
JSON
fi
`,
  );
  chmodSync(stub, 0o755);
  const r = spawnSync("bash", [SCRIPT, ...args], { env: { ...process.env, PATH: `${dir}:${process.env.PATH}` }, encoding: "utf8" });
  let calls = "";
  try { calls = readFileSync(log, "utf8"); } catch { /* no stripe call */ }
  return { ...r, calls: calls.trim().split("\n").filter(Boolean) };
}

describe("configure-stripe-webhook.sh --update", () => {
  const existing = { enabled_events: ["checkout.session.completed", "customer.created", "invoice.payment_failed"] };

  test("adds the missing events to the existing endpoint and KEEPS the ones it already had (union, never a removal)", () => {
    const r = run(["test", "us", "--update", "we_1"], existing);
    assert.equal(r.status, 0, r.stderr);
    const update = r.calls.find((c) => c.startsWith("webhook_endpoints update we_1"));
    assert.ok(update, "calls webhook_endpoints update on that endpoint");
    const csv = update!.split("--enabled-events ")[1]!;
    const events = csv.split(",");
    for (const keep of existing.enabled_events) assert.ok(events.includes(keep), `${keep} is kept`);
    for (const added of ["invoice.created", "invoice.finalized", "invoice.paid", "checkout.session.expired", "charge.dispute.closed"]) assert.ok(events.includes(added), `${added} is added`);
    assert.equal(new Set(events).size, events.length, "no duplicates");
    assert.ok(!r.calls.some((c) => c.startsWith("webhook_endpoints create")), "never creates a second endpoint");
  });

  test("--dry-run reads the endpoint, prints what would be added and changes nothing", () => {
    const r = run(["test", "us", "--update", "we_1", "--dry-run"], existing);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /\+ invoice\.created/);
    assert.match(r.stdout, /--dry-run: nothing changed/);
    assert.deepEqual(r.calls.filter((c) => c.startsWith("webhook_endpoints update")), []);
  });

  test("an endpoint that already receives every event, or '*', is left alone", () => {
    const all = run(["test", "us", "--update", "we_1"], { enabled_events: ["*"] });
    assert.match(all.stdout, /already receives ALL events/);
    assert.deepEqual(all.calls.filter((c) => c.startsWith("webhook_endpoints update")), []);
    const first = run(["test", "us", "--update", "we_1", "--dry-run"], existing);
    const adds = [...first.stdout.matchAll(/\+ (\S+)/g)].map((m) => m[1]!);
    const full = run(["test", "us", "--update", "we_1"], { enabled_events: [...existing.enabled_events, ...adds] });
    assert.match(full.stdout, /already receives every event on the list/);
    assert.deepEqual(full.calls.filter((c) => c.startsWith("webhook_endpoints update")), []);
  });

  test("--update without an id is refused; the MX endpoint uses the MX route; plain mode still CREATES", () => {
    assert.notEqual(run(["test", "us", "--update"], existing).status, 0);
    const create = run(["test", "mx"], existing);
    const created = create.calls.find((c) => c.startsWith("webhook_endpoints create"));
    assert.ok(created);
    assert.match(created!, /--url https:\/\/app\.tulala\.digital\/api\/webhooks\/stripe-mx/);
  });

  test("the list carries every rent event on both endpoints", () => {
    const src = readFileSync(SCRIPT, "utf8");
    for (const e of ["invoice.created", "invoice.finalized", "invoice.paid", "invoice.payment_failed", "invoice.payment_succeeded", "checkout.session.expired"]) assert.match(src, new RegExp(`^\\s+${e.replace(".", "\\.")}$`, "m"));
  });
});
