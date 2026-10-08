/* eslint-disable @typescript-eslint/no-require-imports -- Node CJS helper script. */
/**
 * lane-paths.cjs — the ONE place a test-lane argument becomes something
 * `node --test` will actually run.  (TUL-288)
 *
 * WHY
 * ───
 * Node 22 (CI) treats EVERY `--test` argument as a glob.  A literal path with
 * `[profileCode]` / `[tenantSlug]` / `[key]` is then a character class that
 * matches nothing, and when other arguments DO match, Node skips it silently
 * (exit 0, no warning).  62 test files under bracketed folders therefore never
 * gated CI.  Backslash escapes do not work in Node 22; `?` in place of `[`/`]`
 * does.  Node 20 (older local installs) does NOT glob at all: a `?` path is
 * "Could not find", while the literal bracket path works.  So the right form
 * depends on the running Node major, and this file decides it.
 *
 * The shell must never see the `?` form: an unquoted `?` is expanded by `sh`
 * straight back to the literal `[profileCode]` path.  So lanes pass patterns
 * QUOTED (with `?`/`*`, never brackets) to scripts/lane-test.cjs, which
 * resolves them here against the filesystem and spawns tsx itself.
 *
 * An argument that resolves to ZERO files is an error, never a skip.
 */
const fs = require("node:fs");
const path = require("node:path");

const WEB_ROOT = path.join(__dirname, "..");

/** Node major version. */
function nodeMajor() {
  return Number(process.versions.node.split(".")[0]);
}

/** The form of a literal repo-relative path that THIS Node's `--test` accepts. */
function toNodeArg(rel, major = nodeMajor()) {
  return major >= 21 ? rel.replace(/[[\]]/g, "?") : rel;
}

function segmentRegExp(segment) {
  let src = "";
  for (const ch of segment) {
    if (ch === "*") src += "[^/]*";
    else if (ch === "?") src += "[^/]";
    else src += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${src}$`);
}

function isFile(root, rel) {
  try {
    return fs.statSync(path.join(root, rel)).isFile();
  } catch {
    return false;
  }
}

/**
 * Resolve one lane argument (a literal path, or a pattern whose `*` / `?`
 * stay inside one path segment) to the real files it names.  Brackets are
 * always literal here.  Sorted, repo-relative, `/`-separated.
 */
function resolveLaneArg(arg, root = WEB_ROOT) {
  if (isFile(root, arg)) return [arg];
  let bases = [""];
  for (const segment of arg.split("/").filter(Boolean)) {
    const next = [];
    for (const base of bases) {
      if (!/[*?]/.test(segment)) {
        next.push(base ? `${base}/${segment}` : segment);
        continue;
      }
      let entries = [];
      try {
        entries = fs.readdirSync(path.join(root, base));
      } catch {
        continue;
      }
      const re = segmentRegExp(segment);
      for (const name of entries.sort()) {
        if (re.test(name)) next.push(base ? `${base}/${name}` : name);
      }
    }
    bases = next;
  }
  return bases.filter((p) => isFile(root, p)).sort();
}

/** Resolve many arguments; `empty` lists every argument that matched nothing. */
function resolveLaneArgs(args, root = WEB_ROOT) {
  const files = new Set();
  const empty = [];
  for (const arg of args) {
    const hits = resolveLaneArg(arg, root);
    if (hits.length === 0) empty.push(arg);
    for (const h of hits) files.add(h);
  }
  return { files: [...files], empty };
}

module.exports = { WEB_ROOT, nodeMajor, toNodeArg, resolveLaneArg, resolveLaneArgs };
