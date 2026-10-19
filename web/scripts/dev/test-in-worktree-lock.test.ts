/**
 * TUL-1190: the machine-wide lock in scripts/dev/test-in-worktree.sh (only ONE test run per
 * machine; the Oct 15 crash ran 4-5 at once). Static shape plus a behavioural run in a temp dir:
 * the script is copied into a throwaway `web/` with a stub `tsx`, `sysctl` and `uptime` so no real
 * test, no load wait and no real lock (`TULALA_TEST_LOCK` points into the temp dir) is involved.
 */
import assert from "node:assert/strict";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { chmodSync, copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const SCRIPT_SRC = join(process.cwd(), "scripts", "dev", "test-in-worktree.sh");

function sandbox(tsxExit = 0) {
  const root = mkdtempSync(join(tmpdir(), "wt-lock-"));
  const web = join(root, "web");
  mkdirSync(join(web, "scripts", "dev"), { recursive: true });
  mkdirSync(join(web, "node_modules", ".bin"), { recursive: true }); // a REAL dir: the script leaves it alone
  const script = join(web, "scripts", "dev", "test-in-worktree.sh");
  copyFileSync(SCRIPT_SRC, script);
  writeFileSync(join(web, "scripts", "register-server-only-test.cjs"), ""); // preloaded via NODE_OPTIONS
  const stubBin = join(root, "bin");
  mkdirSync(stubBin);
  const tsx = `#!/bin/sh\necho "STUB-TSX-RAN lock_exists=$([ -d "$TULALA_TEST_LOCK" ] && echo yes || echo no)"\nexit ${tsxExit}\n`;
  writeFileSync(join(web, "node_modules", ".bin", "tsx"), tsx);
  chmodSync(join(web, "node_modules", ".bin", "tsx"), 0o755);
  writeFileSync(join(stubBin, "tsx"), tsx);
  chmodSync(join(stubBin, "tsx"), 0o755);
  // Idle machine: the load gate (5-min load > 12 waits) must never wait in this test.
  writeFileSync(join(stubBin, "sysctl"), "#!/bin/sh\necho '{ 0.10 0.10 0.10 }'\n");
  chmodSync(join(stubBin, "sysctl"), 0o755);
  const lock = join(root, "test.lock");
  const env = (): NodeJS.ProcessEnv => {
    const e = { ...process.env, PATH: `${stubBin}:${process.env.PATH ?? ""}`, TULALA_TEST_LOCK: lock };
    // A child node:test run must not think it is a subprocess of THIS run.
    delete e.NODE_TEST_CONTEXT;
    delete e.TEST_IN_WT_CHECK_ONLY;
    return e;
  };
  return { root, script, lock, env, cleanup: () => rmSync(root, { recursive: true, force: true }) };
}

const run = (s: ReturnType<typeof sandbox>) =>
  spawnSync("bash", [s.script, "some.test.ts"], { encoding: "utf8", env: s.env(), timeout: 60_000 });

test("TUL-1190: static shape, atomic mkdir lock, stale check, release on exit", () => {
  const src = readFileSync(SCRIPT_SRC, "utf8");
  assert.match(src, /LOCK="\$\{TULALA_TEST_LOCK:-\$HOME\/\.tulala-test\.lock\}"/);
  assert.match(src, /while ! mkdir "\$LOCK" 2>\/dev\/null; do/);
  assert.match(src, /kill -0 "\$holder_pid"/);
  assert.match(src, /removing stale lock/);
  assert.match(src, /waiting for the machine test lock, held by:/);
  assert.match(src, /trap 'cleanup; release_lock' EXIT/);
  assert.match(src, /release_lock\(\) \{ \[ "\$HAVE_LOCK" = 1 \] && rm -rf "\$LOCK"; \}/);
  // The lock is taken BEFORE the test runner starts.
  assert.ok(src.indexOf('mkdir "$LOCK"') < src.lastIndexOf("tsx --test"));
});

test("TUL-1190: a free lock is taken, owner and pid are written, and it is released after a green run", () => {
  const s = sandbox();
  try {
    const r = run(s);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /STUB-TSX-RAN lock_exists=yes/, "the lock is held while the tests run");
    assert.equal(existsSync(s.lock), false, "released on exit");
  } finally {
    s.cleanup();
  }
});

test("TUL-1190: the real exit code is forwarded and the lock is still released on a red run", () => {
  const s = sandbox(7);
  try {
    const r = run(s);
    assert.equal(r.status, 7, r.stderr);
    assert.equal(existsSync(s.lock), false);
  } finally {
    s.cleanup();
  }
});

test("TUL-1190: a lock whose holder pid is dead is removed, then the run proceeds", () => {
  const s = sandbox();
  try {
    const dead = spawnSync(process.execPath, ["-e", ""]);
    assert.equal(dead.status, 0);
    const deadPid = dead.pid;
    mkdirSync(s.lock);
    writeFileSync(join(s.lock, "pid"), String(deadPid));
    writeFileSync(join(s.lock, "owner"), "ghost");
    const r = run(s);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stderr, new RegExp(`removing stale lock \\(pid ${deadPid} is gone\\)`));
    assert.match(r.stdout, /STUB-TSX-RAN/);
    assert.equal(existsSync(s.lock), false);
  } finally {
    s.cleanup();
  }
});

test("TUL-1190: a second caller WAITS, names the holder, and only runs after the holder is gone", async () => {
  const s = sandbox();
  let holder: ChildProcess | undefined;
  try {
    holder = spawn("sleep", ["120"], { stdio: "ignore" });
    const holderPid = holder.pid;
    assert.ok(holderPid);
    mkdirSync(s.lock);
    writeFileSync(join(s.lock, "pid"), String(holderPid));
    writeFileSync(join(s.lock, "owner"), "pid-of-holder · other-worktree · since 00:00:00");

    const child = spawn("bash", [s.script, "some.test.ts"], { env: s.env(), stdio: ["ignore", "pipe", "pipe"] });
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    const exited = new Promise<number | null>((res) => child.on("close", (c) => res(c)));

    const t0 = Date.now();
    while (!/waiting for the machine test lock/.test(err) && Date.now() - t0 < 15_000) {
      await new Promise((r) => setTimeout(r, 100));
    }
    assert.match(err, /waiting for the machine test lock, held by: pid-of-holder · other-worktree/);
    assert.equal(out.includes("STUB-TSX-RAN"), false, "must not run while the holder is alive");
    assert.equal(existsSync(s.lock), true, "the holder's lock is left alone");

    holder.kill("SIGKILL"); // the holder dies: its lock is now stale
    const code = await Promise.race([
      exited,
      new Promise<"timeout">((r) => setTimeout(() => r("timeout"), 30_000)),
    ]);
    assert.equal(code, 0, err);
    assert.match(err, /removing stale lock/);
    assert.match(out, /STUB-TSX-RAN/);
    assert.equal(existsSync(s.lock), false);
  } finally {
    holder?.kill("SIGKILL");
    s.cleanup();
  }
});
