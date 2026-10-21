/**
 * Local, gitignored seed config for generated credentials (web/.env.stage2-seed.local, mode 600).
 * Passwords and PINs are generated here, written ONLY to that file, and never printed, logged, put in a row or in a backup file.
 * `.gitignore` already covers `.env.*.local` (a test asserts it with git check-ignore).
 */
import { randomBytes, randomInt } from "node:crypto";
import { chmodSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const SEED_CONFIG_PATH = fileURLToPath(new URL("../../.env.stage2-seed.local", import.meta.url));
export const pwName = (key) => `S2_PW_${key.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;
export const pinName = (key) => `S2_PIN_${key.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`;

export const genPassword = () => randomBytes(18).toString("base64url");
export const genPin = () => String(randomInt(0, 10000)).padStart(4, "0");

export function parseSeedConfig(text) {
  const out = new Map();
  for (const line of String(text).split("\n")) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (m) out.set(m[1], m[2]);
  }
  return out;
}

/** The credentials the plan needs: Map(name -> value). Existing values are kept; only missing ones are generated. */
export function resolveSecrets(ops, existing = new Map()) {
  const secrets = new Map(existing);
  for (const op of ops) {
    if (op.kind === "authUser") {
      const n = pwName(op.row.secretKey);
      if (!secrets.has(n)) secrets.set(n, genPassword());
    }
    if (op.kind === "pin") {
      const n = pinName(op.secretKey);
      if (!secrets.has(n)) secrets.set(n, genPin());
    }
  }
  return secrets;
}

/** Write the config (new file mode 600; an existing file is only ever extended, never overwritten). Returns the path. */
export function writeSeedConfig(secrets, path = SEED_CONFIG_PATH) {
  const header = "# Stage 2 seed credentials. Generated, local only, gitignored. Never paste, print or commit.\n";
  const body = [...secrets].map(([k, v]) => `${k}=${v}`).join("\n") + "\n";
  writeFileSync(path, header + body, { mode: 0o600 });
  chmodSync(path, 0o600);
  return path;
}

export function loadSeedConfig(path = SEED_CONFIG_PATH) {
  if (!existsSync(path)) return new Map();
  const mode = statSync(path).mode & 0o777;
  if (mode & 0o077) throw new Error(`${path}: mode must be 600 (found ${mode.toString(8)}); fix with chmod 600`);
  return parseSeedConfig(readFileSync(path, "utf8"));
}
