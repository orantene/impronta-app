#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// CI-only: the two HTTP services a Supabase client expects, without Docker.
//
// WHY THIS EXISTS
//   `local-postgres.sh` gives a faithful DATABASE. It does not give the HTTP
//   surface `@supabase/supabase-js` talks to, and every data path in `web/`
//   goes through that surface: `supabase.from(...)` is PostgREST, and
//   `supabase.auth.*` is GoTrue. `supabase start` would run both in Docker;
//   Docker image pulls are blocked by egress policy in the agent containers,
//   so the seed script and the app could not run at all.
//
//   This process is a gateway on ONE port that answers both prefixes:
//     /rest/v1/*     → reverse-proxied to a REAL PostgREST binary (so query
//                      semantics — filters, embeds, on_conflict, Prefer,
//                      Range, rpc — are PostgREST's own, not a re-implementation)
//     /auth/v1/*     → a MINIMAL stand-in, implemented here against auth.users
//     /storage/v1/*  → refused, by name, with what it would take (see below)
//
// WHAT IS FAITHFUL AND WHAT IS A STAND-IN
//   FAITHFUL: everything under /rest/v1. It is PostgREST 12.x itself,
//   connected as `authenticator`, switching to anon/authenticated/service_role
//   from the JWT exactly as Supabase's does. RLS therefore behaves as in
//   production (service_role bypasses it, as it does on a real project).
//
//   STAND-IN: /auth/v1. GoTrue is a separate Go service with its own schema
//   management, email flows, and bcrypt password hashing. This implements only
//   the endpoints this repo's seed and journeys use, writing auth.users rows
//   directly (which is what the task asks for: seed sessions rather than stand
//   up GoTrue). Consequences, stated rather than hidden:
//     - passwords are stored as `ci-sha256:<hex>`, NOT bcrypt. Nothing here
//       verifies a bcrypt hash and nothing writes one. A real GoTrue pointed at
//       this database would reject every fixture login until the password is
//       reset. That is intentional: a fake bcrypt hash would be worse.
//     - the access tokens minted here are signed with the local JWT secret and
//       carry the claims PostgREST and the app read (sub, role, email, aud).
//       They are not GoTrue tokens: no refresh-token rotation, no AAL/AMR, no
//       session revocation.
//     - no email delivery, no OAuth, no MFA, no rate limiting.
//   STAND-IN: /storage/v1 is not implemented at all. Nothing in the seed or in
//   the talent-site render path reads it (fixture media rows carry placeholder
//   storage paths and are never fetched); a journey that needs a real object
//   download needs the real storage service, i.e. `supabase start`.
//
// KEYS
//   The anon / service_role keys are minted here from the Supabase CLI's own
//   PUBLISHED local development secret. They are not credentials: they unlock
//   nothing but a throwaway loopback database. Nothing in this directory ever
//   reads a production key.
//
// USAGE
//   node supabase/ci/local-services.mjs --print-keys   # env exports only
//   node supabase/ci/local-services.mjs                # run in the foreground
//   (started/stopped for you by supabase/ci/local-services.sh)
//
// Environment knobs (all have defaults):
//   SUPABASE_PORT   gateway port                (default 54321)
//   PGRST_PORT      PostgREST port              (default 3111)
//   POSTGREST_BIN   PostgREST binary            (default supabase/ci/.bin/postgrest)
//   PGHOST/PGPORT/PGUSER/PGDATABASE/PGPASSWORD  the target cluster
// ─────────────────────────────────────────────────────────────────────────────
import { createRequire } from "node:module";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import http from "node:http";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, "../..");

// `pg` is a dependency of web/ already (web/package.json). Resolve from there
// so this script needs no install of its own.
const require = createRequire(path.join(REPO, "web/package.json"));

const SUPABASE_PORT = Number(process.env.SUPABASE_PORT || 54321);
const PGRST_PORT = Number(process.env.PGRST_PORT || 3111);
const PGHOST = process.env.PGHOST || "127.0.0.1";
const PGPORT = Number(process.env.PGPORT || 55432);
const PGUSER = process.env.PGUSER || "postgres";
const PGDATABASE = process.env.PGDATABASE || "postgres";
const PGPASSWORD = process.env.PGPASSWORD || "postgres";

// The Supabase CLI's published local development JWT secret. Public by design.
const JWT_SECRET =
  process.env.SUPABASE_JWT_SECRET || "super-secret-jwt-token-with-at-least-32-characters-long";

const b64url = (buf) => Buffer.from(buf).toString("base64url");

function signJwt(claims, { expiresInSeconds = 60 * 60 * 24 * 365 } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const payload = { iss: "supabase-ci", iat: now, exp: now + expiresInSeconds, ...claims };
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const body = b64url(JSON.stringify(payload));
  const sig = crypto.createHmac("sha256", JWT_SECRET).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

function verifyJwt(token) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) return null;
  const expected = crypto
    .createHmac("sha256", JWT_SECRET)
    .update(`${parts[0]}.${parts[1]}`)
    .digest("base64url");
  if (
    expected.length !== parts[2].length ||
    !crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts[2]))
  ) {
    return null;
  }
  try {
    return JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    return null;
  }
}

export const ANON_KEY = signJwt({ role: "anon" });
export const SERVICE_ROLE_KEY = signJwt({ role: "service_role" });

if (process.argv.includes("--print-keys")) {
  process.stdout.write(
    [
      `export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:${SUPABASE_PORT}`,
      `export NEXT_PUBLIC_SUPABASE_ANON_KEY=${ANON_KEY}`,
      `export SUPABASE_SERVICE_ROLE_KEY=${SERVICE_ROLE_KEY}`,
      `export SUPABASE_JWT_SECRET=${JWT_SECRET}`,
      "",
    ].join("\n"),
  );
  process.exit(0);
}

// ── the database handle the auth stand-in writes through ─────────────────────
const { Pool } = require("pg");
const pool = new Pool({
  host: PGHOST,
  port: PGPORT,
  user: PGUSER,
  database: PGDATABASE,
  password: PGPASSWORD,
  max: 4,
});

const hashPassword = (pw) => `ci-sha256:${crypto.createHash("sha256").update(String(pw)).digest("hex")}`;

// ── PostgREST ────────────────────────────────────────────────────────────────
function resolvePostgrestBin() {
  const explicit = process.env.POSTGREST_BIN;
  const candidates = [
    explicit,
    path.join(HERE, ".bin/postgrest"),
    "/usr/local/bin/postgrest",
    "/usr/bin/postgrest",
  ].filter(Boolean);
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function startPostgrest() {
  const bin = resolvePostgrestBin();
  if (!bin) {
    console.error(
      [
        "[local-services] no PostgREST binary found.",
        "  Looked in: $POSTGREST_BIN, supabase/ci/.bin/postgrest, /usr/local/bin, /usr/bin",
        "  It is a single static binary — no Docker, no runtime deps:",
        "    mkdir -p supabase/ci/.bin && curl -sSL \\",
        "      https://github.com/PostgREST/postgrest/releases/download/v12.2.8/postgrest-v12.2.8-linux-static-x86-64.tar.xz \\",
        "      | tar -xJ -C supabase/ci/.bin",
        "  (supabase/ci/.bin is git-ignored: a binary is never committed to this repo.)",
      ].join("\n"),
    );
    process.exit(1);
  }
  const conf = path.join(process.env.RUNTIME_DIR || "/tmp", "impronta-postgrest.conf");
  fs.writeFileSync(
    conf,
    [
      `db-uri = "postgres://authenticator:${PGPASSWORD}@${PGHOST}:${PGPORT}/${PGDATABASE}"`,
      `db-schemas = "public"`,
      `db-anon-role = "anon"`,
      `db-extra-search-path = "public, extensions"`,
      `jwt-secret = "${JWT_SECRET}"`,
      `server-host = "127.0.0.1"`,
      `server-port = ${PGRST_PORT}`,
      `db-pool = 10`,
      `db-channel-enabled = false`,
      `log-level = "error"`,
      "",
    ].join("\n"),
  );
  const child = spawn(bin, [conf], { stdio: ["ignore", "inherit", "inherit"] });
  child.on("exit", (code) => {
    console.error(`[local-services] PostgREST exited with code ${code}`);
    process.exit(code ?? 1);
  });
  return child;
}

async function waitForPostgrest(timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      const res = await fetch(`http://127.0.0.1:${PGRST_PORT}/`);
      if (res.status < 500) return;
    } catch {
      /* not up yet */
    }
    if (Date.now() > deadline) throw new Error("PostgREST did not become ready in time");
    await new Promise((r) => setTimeout(r, 250));
  }
}

// ── auth stand-in ────────────────────────────────────────────────────────────
const USER_COLUMNS = `id, aud, role, email, email_confirmed_at, last_sign_in_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at, phone, confirmed_at,
  banned_until, deleted_at, is_anonymous`;

function toGotrueUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    aud: row.aud || "authenticated",
    role: row.role || "authenticated",
    email: row.email,
    email_confirmed_at: row.email_confirmed_at,
    confirmed_at: row.confirmed_at,
    phone: row.phone || "",
    last_sign_in_at: row.last_sign_in_at,
    app_metadata: row.raw_app_meta_data || { provider: "email", providers: ["email"] },
    user_metadata: row.raw_user_meta_data || {},
    identities: [],
    created_at: row.created_at,
    updated_at: row.updated_at,
    is_anonymous: row.is_anonymous === true,
  };
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on("error", reject);
  });
}

const sendJson = (res, status, body) => {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(payload),
    "access-control-allow-origin": "*",
  });
  res.end(payload);
};

function bearer(req) {
  const h = req.headers.authorization || "";
  return h.toLowerCase().startsWith("bearer ") ? h.slice(7).trim() : "";
}

function requireServiceRole(req, res) {
  const claims = verifyJwt(bearer(req) || req.headers.apikey);
  if (!claims || claims.role !== "service_role") {
    sendJson(res, 401, { code: 401, msg: "this endpoint requires the service_role key" });
    return false;
  }
  return true;
}

async function handleAuth(req, res, url) {
  const p = url.pathname.replace(/^\/auth\/v1/, "") || "/";

  if (p === "/health" || p === "/settings") {
    return sendJson(res, 200, { external: {}, disable_signup: false, mailer_autoconfirm: true });
  }

  // GET /admin/users?page=&per_page=
  if (p === "/admin/users" && req.method === "GET") {
    if (!requireServiceRole(req, res)) return;
    const page = Math.max(1, Number(url.searchParams.get("page") || 1));
    const perPage = Math.min(1000, Number(url.searchParams.get("per_page") || 50));
    const { rows } = await pool.query(
      `select ${USER_COLUMNS} from auth.users order by created_at asc, id asc limit $1 offset $2`,
      [perPage, (page - 1) * perPage],
    );
    return sendJson(res, 200, { users: rows.map(toGotrueUser), aud: "authenticated" });
  }

  // POST /admin/users
  if (p === "/admin/users" && req.method === "POST") {
    if (!requireServiceRole(req, res)) return;
    const body = await readJson(req);
    const email = String(body.email || "").toLowerCase();
    if (!email) return sendJson(res, 422, { code: 422, msg: "email is required" });
    const id = body.id || crypto.randomUUID();
    const now = new Date().toISOString();
    try {
      const { rows } = await pool.query(
        `insert into auth.users
           (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at, is_anonymous)
         values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated',
                 $2, $3, $4, $5, $6, $7, $7, false)
         returning ${USER_COLUMNS}`,
        [
          id,
          email,
          body.password ? hashPassword(body.password) : null,
          body.email_confirm === false ? null : now,
          JSON.stringify({ provider: "email", providers: ["email"] }),
          JSON.stringify(body.user_metadata || {}),
          now,
        ],
      );
      return sendJson(res, 200, toGotrueUser(rows[0]));
    } catch (err) {
      if (err && err.code === "23505") {
        return sendJson(res, 422, {
          code: 422,
          error_code: "email_exists",
          msg: "A user with this email address has already been registered",
        });
      }
      throw err;
    }
  }

  // GET|PUT|DELETE /admin/users/:id
  const adminUserMatch = p.match(/^\/admin\/users\/([0-9a-fA-F-]{36})$/);
  if (adminUserMatch) {
    if (!requireServiceRole(req, res)) return;
    const id = adminUserMatch[1];
    if (req.method === "GET") {
      const { rows } = await pool.query(`select ${USER_COLUMNS} from auth.users where id = $1`, [id]);
      if (!rows[0]) return sendJson(res, 404, { code: 404, msg: "User not found" });
      return sendJson(res, 200, toGotrueUser(rows[0]));
    }
    if (req.method === "PUT") {
      const body = await readJson(req);
      const sets = ["updated_at = now()"];
      const vals = [id];
      if (body.password !== undefined) {
        vals.push(hashPassword(body.password));
        sets.push(`encrypted_password = $${vals.length}`);
      }
      if (body.email !== undefined) {
        vals.push(String(body.email).toLowerCase());
        sets.push(`email = $${vals.length}`);
      }
      if (body.email_confirm === true) sets.push("email_confirmed_at = coalesce(email_confirmed_at, now())");
      if (body.user_metadata !== undefined) {
        vals.push(JSON.stringify(body.user_metadata));
        sets.push(`raw_user_meta_data = $${vals.length}::jsonb`);
      }
      const { rows } = await pool.query(
        `update auth.users set ${sets.join(", ")} where id = $1 returning ${USER_COLUMNS}`,
        vals,
      );
      if (!rows[0]) return sendJson(res, 404, { code: 404, msg: "User not found" });
      return sendJson(res, 200, toGotrueUser(rows[0]));
    }
    if (req.method === "DELETE") {
      await pool.query("delete from auth.users where id = $1", [id]);
      return sendJson(res, 200, {});
    }
  }

  // POST /token?grant_type=password — what a Playwright login journey needs.
  // Mints a session directly rather than standing up GoTrue (see header).
  if (p === "/token" && req.method === "POST") {
    const body = await readJson(req);
    const grant = url.searchParams.get("grant_type") || "password";
    if (grant !== "password") {
      return sendJson(res, 400, { error: "unsupported_grant_type", error_description: grant });
    }
    const email = String(body.email || "").toLowerCase();
    const { rows } = await pool.query(
      `select ${USER_COLUMNS}, encrypted_password from auth.users where email = $1`,
      [email],
    );
    const row = rows[0];
    if (!row || row.encrypted_password !== hashPassword(body.password)) {
      return sendJson(res, 400, { error: "invalid_grant", error_description: "Invalid login credentials" });
    }
    await pool.query("update auth.users set last_sign_in_at = now() where id = $1", [row.id]);
    const expiresIn = 60 * 60;
    const accessToken = signJwt(
      {
        sub: row.id,
        email: row.email,
        role: "authenticated",
        aud: "authenticated",
        app_metadata: row.raw_app_meta_data || {},
        user_metadata: row.raw_user_meta_data || {},
        session_id: crypto.randomUUID(),
      },
      { expiresInSeconds: expiresIn },
    );
    return sendJson(res, 200, {
      access_token: accessToken,
      token_type: "bearer",
      expires_in: expiresIn,
      expires_at: Math.floor(Date.now() / 1000) + expiresIn,
      refresh_token: crypto.randomBytes(16).toString("hex"),
      user: toGotrueUser(row),
    });
  }

  // GET /user — the call @supabase/ssr makes to validate a session cookie.
  if (p === "/user" && req.method === "GET") {
    const claims = verifyJwt(bearer(req));
    if (!claims?.sub) return sendJson(res, 401, { code: 401, msg: "invalid claim: missing sub claim" });
    const { rows } = await pool.query(`select ${USER_COLUMNS} from auth.users where id = $1`, [claims.sub]);
    if (!rows[0]) return sendJson(res, 404, { code: 404, msg: "User not found" });
    return sendJson(res, 200, toGotrueUser(rows[0]));
  }

  if (p === "/logout") return sendJson(res, 204, {});

  return sendJson(res, 501, {
    code: 501,
    msg: `[local-services] GoTrue endpoint ${req.method} ${p} is not implemented by the CI auth stand-in. ` +
      "Implement it in supabase/ci/local-services.mjs or run a real Supabase (supabase start).",
  });
}

// ── gateway ──────────────────────────────────────────────────────────────────
function proxyToPostgrest(req, res, url) {
  const target = url.pathname.replace(/^\/rest\/v1/, "") + url.search;
  const headers = { ...req.headers };
  delete headers.host;
  delete headers.connection;
  // PostgREST authenticates from the JWT; supabase-js sends it in both places.
  if (!headers.authorization && headers.apikey) headers.authorization = `Bearer ${headers.apikey}`;
  const proxied = http.request(
    { host: "127.0.0.1", port: PGRST_PORT, method: req.method, path: target || "/", headers },
    (upstream) => {
      res.writeHead(upstream.statusCode || 502, upstream.headers);
      upstream.pipe(res);
    },
  );
  proxied.on("error", (err) => {
    sendJson(res, 502, { message: `[local-services] PostgREST unreachable: ${err.message}` });
  });
  req.pipe(proxied);
}

async function main() {
  const postgrest = startPostgrest();
  // PostgREST is a child process, so a bare `kill` on this gateway would leave
  // it holding its port and its database pool. Take it down with us.
  for (const sig of ["SIGINT", "SIGTERM"]) {
    process.on(sig, () => {
      try {
        postgrest.kill("SIGTERM");
      } catch {
        /* already gone */
      }
      process.exit(0);
    });
  }
  await waitForPostgrest();

  const server = http.createServer((req, res) => {
    const url = new URL(req.url || "/", `http://127.0.0.1:${SUPABASE_PORT}`);
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": "*",
        "access-control-allow-headers": "authorization, apikey, content-type, prefer, x-client-info, range",
        "access-control-allow-methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
      });
      return res.end();
    }
    if (url.pathname.startsWith("/rest/v1")) return proxyToPostgrest(req, res, url);
    if (url.pathname.startsWith("/auth/v1")) {
      return handleAuth(req, res, url).catch((err) => {
        console.error("[local-services] auth error", err);
        sendJson(res, 500, { code: 500, msg: String(err?.message || err) });
      });
    }
    if (url.pathname.startsWith("/storage/v1")) {
      return sendJson(res, 501, {
        message:
          "[local-services] Storage is not implemented without Docker. Fixture media rows carry " +
          "placeholder storage paths and are never fetched; a journey that needs a real object " +
          "needs `supabase start`.",
      });
    }
    return sendJson(res, 404, { message: `[local-services] no handler for ${url.pathname}` });
  });

  server.listen(SUPABASE_PORT, "127.0.0.1", () => {
    console.log(`[local-services] gateway  http://127.0.0.1:${SUPABASE_PORT}`);
    console.log(`[local-services]   /rest/v1 -> PostgREST 127.0.0.1:${PGRST_PORT}`);
    console.log(`[local-services]   /auth/v1 -> CI auth stand-in (auth.users direct)`);
    console.log(`[local-services] database  postgres://${PGUSER}@${PGHOST}:${PGPORT}/${PGDATABASE}`);
  });
}

main().catch((err) => {
  console.error("[local-services] fatal", err);
  process.exit(1);
});
