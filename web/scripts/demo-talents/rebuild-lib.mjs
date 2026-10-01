// Pure helpers for scripts/demo-talents/rebuild.mjs (unit-tested).

export const DESIGNS = ["maison-v2", "folio", "gridline"];
export const DEFAULT_BASE_URL = "http://localhost:3005";

/** Returns { ok: true, opts } or { ok: false, error }. Default is a dry run. */
export function parseArgs(argv) {
  const opts = {
    design: undefined,
    only: undefined,
    write: false,
    publish: true,
    baseUrl: DEFAULT_BASE_URL,
    restore: undefined,
    allowRemote: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i];
    const eq = raw.indexOf("=");
    const flag = eq > 0 ? raw.slice(0, eq) : raw;
    const inline = eq > 0 ? raw.slice(eq + 1) : undefined;
    const value = () => {
      if (inline !== undefined) return inline;
      const next = argv[i + 1];
      if (next === undefined || next.startsWith("--")) return null;
      i++;
      return next;
    };
    switch (flag) {
      case "--design": {
        const v = value();
        if (!DESIGNS.includes(v)) return { ok: false, error: `--design must be one of ${DESIGNS.join(", ")}` };
        opts.design = v;
        break;
      }
      case "--only": {
        const v = value();
        const codes = (v ?? "").split(",").map((s) => s.trim()).filter(Boolean);
        if (!codes.length || !codes.every((c) => /^TAL-[A-Z0-9]{3,24}$/.test(c))) {
          return { ok: false, error: "--only needs a comma list of profile codes like TAL-93020" };
        }
        opts.only = codes;
        break;
      }
      case "--base-url": {
        const v = value();
        if (!v) return { ok: false, error: "--base-url needs a value" };
        opts.baseUrl = v;
        break;
      }
      case "--restore": {
        const v = value();
        if (!v || !/^[0-9a-f-]{36}$/i.test(v)) return { ok: false, error: "--restore needs a run id (uuid)" };
        opts.restore = v;
        break;
      }
      case "--dry-run":
        opts.write = false;
        break;
      case "--write":
        opts.write = true;
        break;
      case "--no-publish":
        opts.publish = false;
        break;
      case "--allow-remote":
        opts.allowRemote = true;
        break;
      default:
        return { ok: false, error: `Unknown argument: ${raw}` };
    }
  }
  return { ok: true, opts };
}

/** Local hosts only, unless the caller passed --allow-remote. */
export function checkBaseUrl(baseUrl, allowRemote) {
  let u;
  try {
    u = new URL(baseUrl);
  } catch {
    return { ok: false, error: `Not a valid URL: ${baseUrl}` };
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") return { ok: false, error: "Base URL must be http or https" };
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "[::1]";
  if (!local && !allowRemote) {
    return { ok: false, error: `Refusing non-local base URL ${u.origin}. Pass --allow-remote to target it.` };
  }
  return { ok: true, origin: u.origin };
}

/** Dotenv-style parse (KEY=VALUE, optional quotes, # comments). No expansion. */
export function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    const q = v[0];
    if ((q === '"' || q === "'") && v.endsWith(q) && v.length >= 2) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, "");
    out[m[1]] = v;
  }
  return out;
}

export function buildRebuildBody(opts) {
  const body = { dryRun: !opts.write, publish: opts.publish };
  if (opts.design) body.design = opts.design;
  if (opts.only) body.only = opts.only;
  return body;
}

/** Compact fixed-width table. A row is failed when status is failed or refused. */
export function formatRows(rows) {
  const head = ["code", "design", "version", "status", "changed", "runId/error"];
  const data = rows.map((r) => [
    r.profileCode,
    r.design,
    r.version == null ? "-" : `v${r.version}`,
    r.status,
    r.changed?.length ? r.changed.join(",") : "-",
    r.runId ?? r.error ?? "",
  ]);
  const widths = head.map((h, c) => Math.max(h.length, ...data.map((d) => d[c].length)));
  const line = (cells) => cells.map((cell, c) => cell.padEnd(widths[c])).join("  ").trimEnd();
  return [line(head), ...data.map(line)].join("\n");
}

export function anyFailed(rows) {
  return rows.some((r) => r.status === "failed" || r.status === "refused");
}
