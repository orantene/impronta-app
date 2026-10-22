#!/usr/bin/env node
// TUL-1769: boot the PRODUCTION build the way Vercel runs it, and prove it serves pages.
//
// Why: on 2026-10-21 every page 500'd on Vercel (isomorphic-dompurify -> jsdom 30, a CJS package
// require()-ing an ESM-only one) while tsc, lint, `next build` and every CI check were green.
// Vercel runs Node with --no-experimental-require-module, so require(esm) throws ERR_REQUIRE_ESM
// at RUNTIME; locally and on stock CI Node 22 it silently works. This script reproduces that:
//
//   1. `next build` (skip with --skip-build or RUNTIME_SMOKE_SKIP_BUILD=1 when .next already exists; ci.yml does)
//   2. `next start` with NODE_OPTIONS=--no-experimental-require-module, VERCEL_ENV=preview
//   3. GET / and an admin path, following redirects, require a final 200
//   4. fail if the server output contains ERR_REQUIRE_ESM (even if the pages answered 200)
//
// Host gating: proxy.ts 404s hosts not in agency_domains, but with VERCEL_ENV=preview a host
// matching tulala-<x>-oran-tenes-projects.vercel.app resolves as the platform `app` host WITHOUT a
// database (src/lib/saas/preview-host.ts). We connect to 127.0.0.1 and send that Host header,
// following redirects by hand so the header survives each hop.
//
// Env stubs are placeholders, never secrets. Run from web/.

import { spawn } from "node:child_process";
import http from "node:http";
import { createWriteStream, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const ESM_ERROR_PATTERNS = [/ERR_REQUIRE_ESM/, /require\(\) of ES Module/i];
export const REQUIRE_MODULE_FLAG = "--no-experimental-require-module";
export const SMOKE_HOST = "tulala-ci-oran-tenes-projects.vercel.app";
export const SMOKE_PATHS = ["/", "/admin"];

/** Returns the log lines that show a require(esm) failure (empty array = clean). */
export function detectEsmRequireErrors(log) {
  return String(log)
    .split("\n")
    .filter((line) => ESM_ERROR_PATTERNS.some((p) => p.test(line)));
}

/** Merge the flag into an existing NODE_OPTIONS string without duplicating it. */
export function withRequireModuleOff(existing) {
  const parts = String(existing ?? "").split(/\s+/).filter(Boolean);
  if (!parts.includes(REQUIRE_MODULE_FLAG)) parts.push(REQUIRE_MODULE_FLAG);
  return parts.join(" ");
}

/**
 * One GET over node:http. Global fetch (undici) silently DROPS a custom Host header and sends
 * 127.0.0.1:<port>, which the proxy then 404s as an unregistered host; node:http honors it.
 */
export function getWithHost(port, path, host = SMOKE_HOST) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: "127.0.0.1", port: Number(port), path, method: "GET", headers: { host } },
      (res) => {
        res.resume();
        res.on("end", () => resolve({ status: res.statusCode ?? 0, location: res.headers.location ?? null }));
      },
    );
    req.setTimeout(60000, () => req.destroy(new Error("request timed out")));
    req.on("error", reject);
    req.end();
  });
}

/** GET with manual redirect following (max 5) so the Host header survives each hop. */
export async function fetchFinal(port, path, host = SMOKE_HOST) {
  let target = path;
  const hops = [];
  for (let i = 0; i < 6; i++) {
    const res = await getWithHost(port, target, host);
    hops.push(`${res.status} ${target}`);
    if (res.status >= 300 && res.status < 400 && res.location) {
      const next = new URL(res.location, `http://${host}:${port}`);
      target = `${next.pathname}${next.search}`;
      continue;
    }
    return { status: res.status, hops };
  }
  return { status: 0, hops: [...hops, "too many redirects"] };
}

function run(cmd, args, env) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: "inherit", env });
    p.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited ${code}`))));
  });
}

async function main() {
  const port = process.env.RUNTIME_SMOKE_PORT ?? "3100";
  const logPath = process.env.RUNTIME_SMOKE_LOG ?? "/tmp/runtime-boot-smoke.log";
  const stub = {
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://placeholder.supabase.co",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "placeholder-anon-key",
  };

  if (process.env.RUNTIME_SMOKE_SKIP_BUILD !== "1" && !process.argv.includes("--skip-build")) {
    // Build WITHOUT the flag, like ci.yml's bundle gate; the failure class is a runtime one.
    await run("npx", ["next", "build"], {
      ...process.env,
      ...stub,
      NODE_OPTIONS: process.env.RUNTIME_SMOKE_BUILD_NODE_OPTIONS ?? "--max-old-space-size=11264",
    });
  }

  const logStream = createWriteStream(logPath);
  const server = spawn("npx", ["next", "start", "-p", port], {
    env: {
      ...process.env,
      ...stub,
      VERCEL_ENV: "preview", // makes the preview host resolve as the app host with no database
      NODE_OPTIONS: withRequireModuleOff(process.env.NODE_OPTIONS),
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.pipe(logStream, { end: false });
  server.stderr.pipe(logStream, { end: false });
  let exited = false;
  server.on("exit", () => (exited = true));

  const failures = [];
  try {
    let up = false;
    for (let i = 0; i < 60 && !exited; i++) {
      try {
        await getWithHost(port, "/");
        up = true;
        break;
      } catch {
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
    if (!up) failures.push("server never came up within 120s (or exited early)");

    if (up) {
      for (const p of SMOKE_PATHS) {
        const { status, hops } = await fetchFinal(port, p);
        console.log(`[runtime-boot-smoke] ${p} -> ${status}  (${hops.join(" | ")})`);
        if (status !== 200) failures.push(`${p} final status ${status}, expected 200`);
      }
    }
  } finally {
    server.kill("SIGTERM");
    await new Promise((r) => setTimeout(r, 500));
    logStream.end();
  }

  const log = readFileSync(logPath, "utf8");
  const esm = detectEsmRequireErrors(log);
  if (esm.length > 0) {
    failures.push(`ERR_REQUIRE_ESM in server output (a CJS dependency requires an ESM-only package; Vercel disables require(esm)): ${esm.slice(0, 5).join(" // ")}`);
  }
  if (failures.length > 0) {
    console.error(`::error title=Runtime boot smoke failed::${failures.join(" ; ")}`);
    console.error("--- last 80 lines of server log ---\n" + log.split("\n").slice(-80).join("\n"));
    process.exit(1);
  }
  console.log("[runtime-boot-smoke] OK: / and /admin returned 200, no ERR_REQUIRE_ESM");
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
