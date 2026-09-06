/**
 * gate-queue fairness. MANUAL lane, deliberately — run it by hand after
 * touching the acquire loop, the ticket, the displacement branch, or cleanup:
 *
 *   npm run manual:gate-queue-fairness
 *
 * It is not on the structural gate because its sibling
 * (tsc-queue-fairness.manual.test.ts) failed on the Linux runner twice with
 * "Promise resolution is still pending but the event loop has already resolved"
 * while passing on macOS, and named assertions plus captured stderr never
 * rendered — the spawned queues never emit exit OR error there. Timing-
 * dependent process tests do not belong on a gate every merge waits behind:
 * flaky there, they redden main for teams who never touched this file. The
 * PROPERTIES are written into gate-queue.sh's own header so they survive
 * without a gate watching them.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { WEB_ROOT } from "./supabase-unchecked-read";

const SCRIPT = join(WEB_ROOT, "scripts/gate-queue.sh");
const logs: Record<string, string> = {};
const diagnostics = () =>
  Object.entries(logs)
    .map(([k, v]) => `--- ${k} ---\n${v.trim() || "(no output)"}`)
    .join("\n");

function start(
  label: string,
  opts: { lane: string; cap: number; tickets: string; cmd: string; cwd?: string },
) {
  const p = spawn(
    "bash",
    [SCRIPT, opts.lane, String(opts.cap), "--", "sh", "-c", opts.cmd],
    {
      // The cwd IS the checkout identity: gate-queue derives its claim key from
      // `pwd`. Two spawns sharing a cwd are the SAME checkout, and the newer
      // one DISPLACES the older by design — so an arrival-order test must give
      // each participant its own directory or it measures displacement instead.
      cwd: opts.cwd ?? WEB_ROOT,
      env: { ...process.env, CI: "", GATE_QUEUE_TICKETS: opts.tickets },
      // stderr kept: a test that spawns a process must keep what it said, or a
      // failure elsewhere cannot be read.
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  logs[label] = "";
  p.stderr!.on("data", (d) => (logs[label] += String(d)));
  return p;
}

/** Settles on error too: a failed spawn emits "error" and never "exit". */
const wait = (p: ReturnType<typeof spawn>) =>
  new Promise<Error | null>((r) => {
    p.on("error", (e) => r(e));
    p.on("exit", () => r(null));
  });

async function waitOk(p: ReturnType<typeof spawn>, label: string) {
  const err = await wait(p);
  assert.equal(err, null, `spawning ${label} failed: ${err?.message}\n\n${diagnostics()}`);
}

const uniqueLane = () => `fairtest${Date.now()}${Math.floor(Math.random() * 1e6)}`;

test("the preconditions these tests spawn against exist", () => {
  assert.ok(existsSync(SCRIPT), `gate-queue.sh not found at ${SCRIPT}`);
});

test("with CAP slots, CAP jobs run AT ONCE — fairness must not serialise the lane", { timeout: 120_000 }, async () => {
  // The single-lowest-ticket rule would pass every ordering test and quietly
  // turn a 2-slot lane into a 1-slot lane. That is why concurrency is asserted
  // before order: a fairness fix that halves throughput is not a fix.
  const dir = mkdtempSync(join(tmpdir(), "gq-"));
  const out = join(dir, "out");
  const lane = uniqueLane();
  try {
    const a = start("A", { lane, cap: 2, tickets: join(dir, "t"), cmd: `echo A-in >> ${out}; sleep 4; echo A-out >> ${out}` });
    const b = start("B", { lane, cap: 2, tickets: join(dir, "t"), cmd: `sleep 1; echo B-in >> ${out}; sleep 1` });
    await Promise.all([waitOk(a, "A"), waitOk(b, "B")]);

    const order = readFileSync(out, "utf8").trim().split("\n");
    assert.deepEqual(
      order,
      ["A-in", "B-in", "A-out"],
      `B must start while A still holds the other slot; got ${order.join(",")}\n\n${diagnostics()}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("beyond CAP, turns are granted in arrival order", { timeout: 180_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "gq-"));
  const out = join(dir, "out");
  const lane = uniqueLane();
  const tickets = join(dir, "t");
  try {
    // CAP 1 so the third and fourth genuinely queue.
    // Three DISTINCT checkouts. Sharing one cwd would make B and C the same
    // checkout, and C would displace B rather than queue behind it.
    const cwds = ["a", "b", "c"].map((n) => {
      const d = join(dir, `co-${n}`);
      mkdirSync(d, { recursive: true });
      return d;
    });
    const a = start("A", { lane, cap: 1, tickets, cmd: `echo A >> ${out}; sleep 14`, cwd: cwds[0] });
    await new Promise((r) => setTimeout(r, 1_500));
    const b = start("B", { lane, cap: 1, tickets, cmd: `echo B >> ${out}; sleep 1`, cwd: cwds[1] });
    await new Promise((r) => setTimeout(r, 1_500));
    const c = start("C", { lane, cap: 1, tickets, cmd: `echo C >> ${out}; sleep 1`, cwd: cwds[2] });

    await Promise.all([waitOk(a, "A"), waitOk(b, "B"), waitOk(c, "C")]);
    const order = readFileSync(out, "utf8").trim().split("\n");
    assert.deepEqual(
      order,
      ["A", "B", "C"],
      `C arrived last and must not run before B; got ${order.join(",")}\n\n${diagnostics()}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a killed waiter leaves no ticket, and never removes a live holder's slot", { timeout: 120_000 }, async () => {
  const dir = mkdtempSync(join(tmpdir(), "gq-"));
  const out = join(dir, "out");
  const lane = uniqueLane();
  const tickets = join(dir, "t");
  try {
    const holder = start("H", { lane, cap: 1, tickets, cmd: `echo H >> ${out}; sleep 10` });
    await new Promise((r) => setTimeout(r, 1_500));
    const doomed = start("X", { lane, cap: 1, tickets, cmd: `echo X >> ${out}` });
    await new Promise((r) => setTimeout(r, 1_500));

    doomed.kill("SIGTERM");
    await waitOk(doomed, "X");

    assert.deepEqual(
      readdirSync(tickets).filter((f) => f.endsWith(`.${doomed.pid}`)),
      [],
      `the killed waiter left its ticket behind\n\n${diagnostics()}`,
    );
    assert.ok(
      existsSync(`/tmp/tulala-gate-${lane}.1.lock`),
      `the killed waiter removed the HOLDER's slot\n\n${diagnostics()}`,
    );

    await waitOk(holder, "H");
    assert.deepEqual(readFileSync(out, "utf8").trim().split("\n"), ["H"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("DECISION 2: a newer job from the SAME checkout inherits the displaced waiter's place", { timeout: 180_000 }, async () => {
  // Displacement exists so a checkout does not lose its turn to its own newer
  // job. If the newcomer took a fresh ticket it would go to the BACK, punishing
  // exactly the re-run the mechanism was built for — so B2, which displaces B1,
  // must still run before C, which arrived after B1.
  const dir = mkdtempSync(join(tmpdir(), "gq-"));
  const out = join(dir, "out");
  const lane = uniqueLane();
  const tickets = join(dir, "t");
  const co = (n: string) => {
    const d = join(dir, `co-${n}`);
    mkdirSync(d, { recursive: true });
    return d;
  };
  try {
    const a = start("A", { lane, cap: 1, tickets, cmd: `echo A >> ${out}; sleep 16`, cwd: co("a") });
    await new Promise((r) => setTimeout(r, 1_000));
    const shared = co("b");
    const b1 = start("B1", { lane, cap: 1, tickets, cmd: `echo B1 >> ${out}; sleep 1`, cwd: shared });
    await new Promise((r) => setTimeout(r, 1_000));
    const c = start("C", { lane, cap: 1, tickets, cmd: `echo C >> ${out}; sleep 1`, cwd: co("c") });
    await new Promise((r) => setTimeout(r, 1_000));
    // Same cwd as B1 -> displaces it, and inherits its queue position.
    const b2 = start("B2", { lane, cap: 1, tickets, cmd: `echo B2 >> ${out}; sleep 1`, cwd: shared });

    await Promise.all([waitOk(a, "A"), waitOk(b1, "B1"), waitOk(c, "C"), waitOk(b2, "B2")]);

    const order = readFileSync(out, "utf8").trim().split("\n");
    assert.deepEqual(
      order,
      ["A", "B2", "C"],
      `B2 displaced B1 and must inherit its place ahead of C; got ${order.join(",")}\n\n${diagnostics()}`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
