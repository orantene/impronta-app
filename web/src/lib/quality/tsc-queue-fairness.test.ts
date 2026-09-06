/**
 * The typecheck queue must hand out turns in ARRIVAL order.
 *
 * WHY THIS IS A TEST AND NOT A COMMENT. Before this, acquire was a bare `mkdir`
 * inside a retry loop: every waiter raced on each release and the winner was
 * whichever woke closest to it. Observed 2026-09-05 — a checkout queued at
 * 22:26 watched the lock pass to two checkouts that arrived AFTER it and was
 * still waiting an hour later. Nothing failed; the machine looked busy and
 * healthy while one session simply never got a turn. Livelock has no error
 * message, so the only way to hold this property is to assert it.
 *
 * The queue is driven through TSC_QUEUE_CMD so this exercises the real script's
 * real locking without running four real typechecks.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { WEB_ROOT } from "./supabase-unchecked-read";

const SCRIPT = join(WEB_ROOT, "scripts/tsc-queue.sh");

function start(label: string, out: string, holdMs: number, dir: string) {
  // Each run appends its label the moment it OWNS the lock, so the file records
  // the order turns were granted, not the order processes were spawned.
  return spawn("bash", [SCRIPT], {
    cwd: WEB_ROOT,
    env: {
      ...process.env,
      CI: "",
      // Isolated paths: this exercises the real script's real locking without
      // touching — or waiting on — whatever the machine is actually running.
      TSC_QUEUE_LOCK: join(dir, "lock"),
      TSC_QUEUE_TICKETS: join(dir, "tickets"),
      TSC_QUEUE_CMD: `printf '%s\\n' ${label} >> ${out}; sleep ${holdMs / 1000}`,
    },
    stdio: "ignore",
  });
}

const wait = (p: ReturnType<typeof spawn>) =>
  new Promise<void>((r) => p.on("exit", () => r()));

test("turns are granted in arrival order, not to whoever wakes first", async () => {
  const dir = mkdtempSync(join(tmpdir(), "tscq-"));
  const out = join(dir, "order");
  try {
    // A holds the lock; B and C arrive behind it in a known order. The waiters
    // poll on a 10s cycle, so A must hold long enough for both to be waiting.
    const a = start("A", out, 12_000, dir);
    await new Promise((r) => setTimeout(r, 1_500));
    const b = start("B", out, 500, dir);
    await new Promise((r) => setTimeout(r, 1_500));
    const c = start("C", out, 500, dir);

    await Promise.all([wait(a), wait(b), wait(c)]);

    const order = readFileSync(out, "utf8").trim().split("\n");
    assert.deepEqual(
      order,
      ["A", "B", "C"],
      `turns were granted as ${order.join(",")}; C arrived last and must not run before B`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a ticket does not outlive the process holding it", async () => {
  // A waiter killed mid-wait must leave NOTHING behind. A stale ticket would
  // block every later arrival behind a queue position nobody is standing in —
  // the same starvation this change exists to remove, reintroduced by the fix.
  const dir = mkdtempSync(join(tmpdir(), "tscq-"));
  const out = join(dir, "order");
  const tickets = join(dir, "tickets");
  try {
    const holder = start("H", out, 8_000, dir);
    await new Promise((r) => setTimeout(r, 1_500));
    const doomed = start("X", out, 500, dir);
    await new Promise((r) => setTimeout(r, 1_500));

    assert.equal(readdirSync(tickets).length, 2, "holder and waiter should both hold tickets");

    doomed.kill("SIGTERM");
    await wait(doomed);

    assert.deepEqual(
      readdirSync(tickets).filter((f) => f.endsWith(`.${doomed.pid}`)),
      [],
      "the killed waiter left its ticket behind",
    );

    // And the holder still owns its lock: a waiter's cleanup must never remove
    // a lock it does not hold. Before the ownership check this exact scenario
    // silently deleted the live holder's lock on the way out.
    assert.ok(existsSync(join(dir, "lock")), "the killed waiter removed the HOLDER's lock");

    await wait(holder);
    assert.deepEqual(readFileSync(out, "utf8").trim().split("\n"), ["H"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("exit 127 is reported as DID NOT RUN, never as a failing gate", async () => {
  // 127 is "command not found" — on this repo almost always `tsx: No such file
  // or directory` in a worktree with no node_modules. Nothing was typechecked.
  // A red 127 in a CI log reads exactly like a failing gate, and the natural
  // response is to hunt for a type error that does not exist. It cost a real
  // detour on 2026-09-05.
  const dir = mkdtempSync(join(tmpdir(), "tscq-"));
  try {
    const out = await new Promise<string>((resolve) => {
      const p = spawn("bash", [SCRIPT], {
        cwd: WEB_ROOT,
        env: {
          ...process.env,
          CI: "",
          TSC_QUEUE_LOCK: join(dir, "lock"),
          TSC_QUEUE_TICKETS: join(dir, "tickets"),
          TSC_QUEUE_CMD: "exit 127",
        },
        stdio: ["ignore", "ignore", "pipe"],
      });
      let buf = "";
      p.stderr!.on("data", (d) => (buf += String(d)));
      p.on("exit", () => resolve(buf));
    });
    assert.match(out, /DID NOT RUN/);
    assert.match(out, /NOT A RESULT/);
    assert.doesNotMatch(out, /TSC FAIL/, "127 must not be reported as a type failure");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
