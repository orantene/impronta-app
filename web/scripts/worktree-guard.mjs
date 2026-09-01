#!/usr/bin/env node
/**
 * worktree-guard.mjs — refuse to work in a worktree that changed underneath you.
 *
 * WHY: an agent reported its worktree "stolen mid-session" — another tool
 * checked a different branch into `.claude/worktrees/<name>` and the
 * uncommitted work was lost. Nothing warned anybody; the next command simply
 * operated on a different branch's files.
 *
 *   node scripts/worktree-guard.mjs claim     # stamp this worktree as yours
 *   node scripts/worktree-guard.mjs check     # exit 1 if the branch moved
 *
 * Advisory on purpose: a script an agent runs, never a git hook that could
 * block a human mid-rescue.
 */
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const mode = process.argv[2] ?? "check";
const root = execSync("git rev-parse --show-toplevel", { encoding: "utf8" }).trim();
const stamp = join(root, ".worktree-owner");

function branch() {
  return execSync("git rev-parse --abbrev-ref HEAD", { encoding: "utf8" }).trim();
}

if (mode === "claim") {
  const owner = {
    branch: branch(),
    claimedAt: new Date().toISOString(),
    agent: process.env.CLAUDE_AGENT_ID ?? process.env.USER ?? "unknown",
  };
  writeFileSync(stamp, JSON.stringify(owner, null, 2) + "\n");
  console.log(`claimed ${root} on branch ${owner.branch}`);
  process.exit(0);
}

if (!existsSync(stamp)) {
  console.log("no .worktree-owner stamp — run `claim` first if you want this protection");
  process.exit(0);
}

const owner = JSON.parse(readFileSync(stamp, "utf8"));
const now = branch();
if (owner.branch !== now) {
  console.error(
    `\nWORKTREE CHANGED UNDERNEATH YOU\n` +
      `  path:     ${root}\n` +
      `  claimed:  ${owner.branch} (by ${owner.agent} at ${owner.claimedAt})\n` +
      `  current:  ${now}\n\n` +
      `Something checked a different branch into this worktree. Any uncommitted\n` +
      `work from the claimed branch may be gone. Do NOT keep building here:\n` +
      `check 'git stash list' and 'git reflog', or create a fresh worktree.\n`,
  );
  process.exit(1);
}
console.log(`worktree intact on ${now}`);
