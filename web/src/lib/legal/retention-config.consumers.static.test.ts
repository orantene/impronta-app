import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { RETENTION_PERIODS } from "./retention-config";

/**
 * The config must not lie: every period in RETENTION_PERIODS has to be read by
 * real (non-test) code under src/, other than the config file itself. A period
 * nobody reads is a promise in the privacy policy with no job behind it.
 */

const SRC_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CONFIG_FILE = "retention-config.ts";

function walk(dir: string, out: string[]): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === "node_modules") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|selftest)\.(ts|tsx)$/.test(name) && name !== CONFIG_FILE) {
      out.push(full);
    }
  }
  return out;
}

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/[^\n]*/g, "$1");
}

test("every RETENTION_PERIODS key is consumed by non-test code", () => {
  const sources = walk(SRC_ROOT, []).map((f) => stripComments(readFileSync(f, "utf8")));
  const unconsumed = Object.keys(RETENTION_PERIODS).filter(
    (key) => !sources.some((s) => new RegExp(`RETENTION_PERIODS\\s*\\.\\s*${key}\\b`).test(s)),
  );
  assert.deepEqual(unconsumed, [], `RETENTION_PERIODS keys with no consumer: ${unconsumed.join(", ")}`);
});
