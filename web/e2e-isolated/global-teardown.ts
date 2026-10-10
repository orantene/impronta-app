/**
 * After the paid-QA run: cancel every pay link global-setup.ts minted that is still open (the decline
 * case, or a case that failed before paying). Paid sales stay: they are the run's evidence and the
 * after-pay spec's input. Each file's read-back of open links must be 0.
 */
import { spawnSync } from "node:child_process";

export default async function globalTeardown() {
  const files = (process.env.PAID_QA_MINTED_FILES ?? "").split(",").filter(Boolean);
  let failed = false;
  for (const file of files) {
    const run = spawnSync("npx", ["tsx", "--tsconfig", "tsconfig.json", "scripts/qa/paid-qa-mint-links.mts", "--teardown", file], {
      encoding: "utf8",
      env: { ...process.env, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --require ./scripts/register-server-only-test.cjs`.trim() },
      maxBuffer: 32 * 1024 * 1024,
    });
    const last = (run.stdout ?? "").split("\n").filter(Boolean).pop() ?? "";
    console.log(`[paid-qa] teardown ${file}: ${last || `exit ${run.status}`}`);
    if (run.status !== 0) failed = true;
  }
  if (failed) process.exitCode = 1;
}
