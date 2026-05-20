#!/usr/bin/env python3
"""
Q3 codemod: console.{log,warn,error,info,debug} → improntaLog / logServerError

Dispatch rules (integrator-approved, all refinements applied):

  console.error(…errVar…)   (any bare error-like arg)  → logServerError(ctx, err)
  console.error("plain msg")                            → improntaLog("stem.error", {…})
  console.error("msg", { fields })                      → improntaLog("stem.error", {…})
  console.warn(…)                                       → improntaLog("stem.warn", {…})
  console.log(…) / console.info(…)                     → improntaLog("stem.info", {…})
  console.debug(…)  no error var                        → deleted (flagged in report)
  console.debug(…)  has error var                       → logServerError (don't lose signal)

Error-var detection: bare identifier matching /^(err|error|e|ex|exception|cause|thrown)$/i
Catch-block detection: heuristic scan 15 lines back (needed only for context, not dispatch).

Event naming (Refinement 4): 2-3 path segments joined with _
  lib/server-actions/foo.ts  → "foo.warn"       (server-actions stripped)
  lib/site-admin/server/homepage.ts → "site_admin_homepage.warn"
  components/admin/shell/internal/messages/*.tsx → "admin_messages.warn"

Import idempotency: only injects an import if the identifier is not already present.

Files skipped (logger internals):
  src/lib/server/structured-log.ts
  src/lib/server/safe-error.ts

Usage:
  python3 scripts/q3-console-to-logger.py file1.ts [file2.ts …]
  python3 scripts/q3-console-to-logger.py           # all src/ violations
  python3 scripts/q3-console-to-logger.py --dry-run file1.ts …
"""

import re
import sys
import os
from pathlib import Path
from typing import Optional

SKIP_FILES = {
    "src/lib/server/structured-log.ts",
    "src/lib/server/safe-error.ts",
}

CONSOLE_RE = re.compile(r"console\.(log|warn|error|info|debug)\s*\(")
IMPORT_IMPRONTOLOG = 'import { improntaLog } from "@/lib/server/structured-log";'
IMPORT_SERVER_ERROR = 'import { logServerError } from "@/lib/server/safe-error";'

ERROR_VAR_RE = re.compile(r"^(err|error|e|ex|exception|cause|thrown)$", re.IGNORECASE)

# Path segments stripped when deriving event names.
_STRIP_OUTER = frozenset({"lib", "components", "app", "src"})
_SKIP_SEG    = frozenset({"server-actions", "internal", "shared", "shell",
                          "server", "client", "api"})
_GENERIC_FN  = frozenset({"page", "route", "layout", "loading", "error",
                          "index", "not-found"})


# ─────────────────────────────────────────────────────
# Event-name derivation (2-3 path segments)
# ─────────────────────────────────────────────────────

def derive_event(filepath: str) -> str:
    """
    Derives a snake_case event stem from the file path.
    e.g. src/lib/site-admin/server/homepage.ts → "site_admin_homepage"
         src/lib/server-actions/admin-talent-skills.ts → "admin_talent_skills"
         src/components/admin/shell/internal/messages/shared/machinery-8.tsx
           → "admin_machinery_8"
    """
    rel = re.sub(r".*[/\\]src[/\\]", "", filepath)
    rel = re.sub(r"\.(tsx?|jsx?)$", "", rel)

    # Drop dynamic Next.js segments [foo] and grouped routes (foo)
    parts = [
        p for p in rel.split("/")
        if p
        and not p.startswith("(")
        and not (p.startswith("[") and p.endswith("]"))
    ]
    if not parts:
        return "unknown"

    # Strip all leading container dirs (src / lib / components / app — may stack)
    while parts and parts[0] in _STRIP_OUTER:
        parts = parts[1:]

    # Drop generic filename (page.tsx, route.ts, …) — use parent dirs instead
    if parts and parts[-1] in _GENERIC_FN:
        parts = parts[:-1]

    # Filter known-generic middle dirs
    filtered = [p for p in parts if p not in _SKIP_SEG]
    if not filtered:
        filtered = parts  # fallback

    # Cap at 2 segments: first-meaningful + last-meaningful
    if len(filtered) > 2:
        filtered = [filtered[0], filtered[-1]]

    raw = "_".join(filtered)
    raw = re.sub(r"[^a-zA-Z0-9]", "_", raw).lower()
    return re.sub(r"_+", "_", raw).strip("_")


# ─────────────────────────────────────────────────────
# Parsing helpers
# ─────────────────────────────────────────────────────

def extract_bracket_context(s: str) -> Optional[str]:
    """'[inquiry_action_log] insert failed' → 'inquiry_action_log'"""
    s = s.strip().strip('"\'`')
    m = re.match(r"^\[([^\]]+)\]", s)
    if m:
        raw = re.sub(r"[^a-zA-Z0-9]", "_", m.group(1)).lower().strip("_")
        return raw or None
    return None


def find_call_end(text: str, start: int) -> int:
    depth = 0
    i = start
    in_str: Optional[str] = None
    n = len(text)
    while i < n:
        c = text[i]
        if in_str:
            if c == "\\" and i + 1 < n:
                i += 2
                continue
            if c == in_str:
                in_str = None
        elif c in ('"', "'", "`"):
            in_str = c
        elif c == "(":
            depth += 1
        elif c == ")":
            depth -= 1
            if depth == 0:
                return i
        i += 1
    return -1


def split_top_level(text: str, sep: str = ",") -> list:
    parts = []
    depth = 0
    in_str: Optional[str] = None
    current = []
    i = 0
    n = len(text)
    while i < n:
        c = text[i]
        if in_str:
            if c == "\\" and i + 1 < n:
                current += [c, text[i + 1]]
                i += 2
                continue
            if c == in_str:
                in_str = None
            current.append(c)
        elif c in ('"', "'", "`"):
            in_str = c
            current.append(c)
        elif c in ("(", "[", "{"):
            depth += 1
            current.append(c)
        elif c in (")", "]", "}"):
            depth -= 1
            current.append(c)
        elif c == sep and depth == 0:
            parts.append("".join(current).strip())
            current = []
        else:
            current.append(c)
        i += 1
    tail = "".join(current).strip()
    if tail:
        parts.append(tail)
    return parts


def is_string_literal(s: str) -> bool:
    s = s.strip()
    return bool(re.match(r'^["\']', s) or s.startswith("`"))


def is_object_literal(s: str) -> bool:
    s = s.strip()
    return s.startswith("{") and s.endswith("}")


def extract_object_fields(obj_str: str) -> list:
    inner = obj_str.strip()
    if inner.startswith("{"):
        inner = inner[1:]
    if inner.endswith("}"):
        inner = inner[:-1]
    raw = split_top_level(inner.strip(), ",")
    return [f.strip().rstrip(",").strip() for f in raw if f.strip().rstrip(",").strip()]


def get_indent(text: str, pos: int) -> str:
    line_start = text.rfind("\n", 0, pos)
    line_start = 0 if line_start == -1 else line_start + 1
    m = re.match(r"^(\s*)", text[line_start:])
    return m.group(1) if m else ""


# ─────────────────────────────────────────────────────
# Error-var detection (Refinement 1)
# ─────────────────────────────────────────────────────

def find_bare_error_var(args: list) -> Optional[str]:
    """
    Returns the first bare error-like identifier in args, or None.
    'bare' means a single token with no property access (no dot).
    """
    for arg in args:
        a = arg.strip()
        if ERROR_VAR_RE.match(a) and "." not in a:
            return a
    return None


# ─────────────────────────────────────────────────────
# Field normalisation for ImprontaLogFields
# (Record<string, string|number|boolean|null|undefined> — no unknown)
# ─────────────────────────────────────────────────────

def sanitize_field(field_str: str) -> str:
    """
    Normalise object fields for ImprontaLogFields (no unknown values).
    - Bare error var shorthand: "err" → "error: String(err)"
    - Property access shorthand: "error.message" → "error: error.message"
    - key: bareErrVar → "key: String(errVar)"
    """
    s = field_str.strip()
    # Shorthand bare error var
    if ERROR_VAR_RE.match(s) and "." not in s:
        return "error: String(" + s + ")"
    # Shorthand property access (e.g. "error.message" in { error.message } — INVALID JS)
    # Convert to explicit: "error.message" → "error: error.message"
    if re.match(r"^[a-zA-Z_$][\w$]*(\.[a-zA-Z_$][\w$]*)+$", s):
        obj = s.split(".", 1)[0]
        return obj + ": " + s
    # key: val — wrap val if bare error var
    kv = s.split(":", 1)
    if len(kv) == 2:
        key, val = kv[0].strip(), kv[1].strip()
        if ERROR_VAR_RE.match(val) and "." not in val:
            return key + ": String(" + val + ")"
    return field_str


def build_improntolog_fields(first: str, rest: list) -> list:
    fields = []
    if first:
        fields.append("message: " + first)
    for arg in rest:
        arg = arg.strip()
        if not arg:
            continue
        if is_object_literal(arg):
            for f in extract_object_fields(arg):
                if f:
                    fields.append(sanitize_field(f))
        elif re.match(r"^[a-zA-Z_$][\w$]*(\.[a-zA-Z_$][\w$]*)+$", arg):
            # Property access (e.g. error.message, pgErr.code) → "obj: obj.prop"
            obj = arg.split(".", 1)[0]
            fields.append(obj + ": " + arg)
        elif re.match(r"^[a-zA-Z_$][\w$]*$", arg):
            # Bare identifier
            fields.append(sanitize_field(arg))
        else:
            fields.append("detail: " + arg)
    return fields


# ─────────────────────────────────────────────────────
# Call builders
# ─────────────────────────────────────────────────────

def build_improntolog_call(event: str, fields: list, indent: str) -> str:
    i2 = indent + "  "
    q = '"' + event + '"'
    fstr = ", ".join(fields)
    single = "void improntaLog(" + q + ", { " + fstr + " })"
    if len(indent + single) <= 100 and "\n" not in fstr:
        return single
    lines = ["void improntaLog(" + q + ", {"]
    for f in fields:
        lines.append(i2 + f + ",")
    lines.append(indent + "})")
    return "\n".join(lines)


def build_logservererror_call(context: str, err_var: str) -> str:
    return 'logServerError("' + context + '", ' + err_var + ")"


# ─────────────────────────────────────────────────────
# Import injection (idempotent)
# ─────────────────────────────────────────────────────

def already_imports(text: str, identifier: str) -> bool:
    return bool(re.search(r"import[^;]*\b" + re.escape(identifier) + r"\b", text))


def add_import(text: str, import_line: str) -> str:
    lines = text.split("\n")
    insert_at = 0
    for i, line in enumerate(lines):
        s = line.strip()
        if s in ('"use client";', "'use client';", '"use server";', "'use server';"):
            insert_at = i + 1
            break
    if insert_at == 0:
        for i, line in enumerate(lines):
            if line.startswith("import "):
                insert_at = i
                break
    lines.insert(insert_at, import_line)
    return "\n".join(lines)


# ─────────────────────────────────────────────────────
# Per-file transformation
# ─────────────────────────────────────────────────────

def transform_file(path: str, dry_run: bool = False) -> dict:
    rel = re.sub(r".*[/\\]src[/\\]", "src/", path)
    for skip in SKIP_FILES:
        if rel.endswith(skip):
            return {"file": rel, "count": 0, "skipped": True, "flags": []}

    text = Path(path).read_text(encoding="utf-8")
    stem = derive_event(path)

    replacements = []
    need_improntolog = False
    need_logservererror = False
    flags = []

    for m in CONSOLE_RE.finditer(text):
        method = m.group(1)
        open_paren = m.end() - 1
        close_paren = find_call_end(text, open_paren)
        if close_paren == -1:
            ln = text.count("\n", 0, m.start()) + 1
            flags.append("WARN unmatched parens at " + rel + ":" + str(ln))
            continue

        args_str = text[open_paren + 1: close_paren]
        args = split_top_level(args_str, ",")
        first = args[0].strip() if args else ""
        rest  = [a.strip() for a in args[1:] if a.strip()]
        indent = get_indent(text, m.start())
        ln = text.count("\n", 0, m.start()) + 1

        # ── console.debug ───────────────────────────────────────────
        if method == "debug":
            all_args = ([first] if first else []) + rest
            err_var = find_bare_error_var(all_args)
            orig_snippet = text[m.start(): close_paren + 1].split("\n")[0].strip()
            if err_var:
                # Has error var → route to logServerError (don't lose signal)
                str_arg = next((a for a in all_args if is_string_literal(a) and a != err_var), None)
                ctx = extract_bracket_context(str_arg) if str_arg else stem
                ctx = ctx or stem
                new_call = build_logservererror_call(ctx, err_var)
                need_logservererror = True
                replacements.append((m.start(), close_paren + 1, new_call))
                flags.append("DELETE→logServerError debug: " + rel + ":" + str(ln)
                             + " — " + orig_snippet)
            else:
                # No error var → delete the call (replace with void 0 no-op)
                replacements.append((m.start(), close_paren + 1, "void 0"))
                flags.append("DELETED debug: " + rel + ":" + str(ln)
                             + " — " + orig_snippet)
            continue

        # ── console.error ───────────────────────────────────────────
        if method == "error":
            all_args = ([first] if first else []) + rest
            err_var = find_bare_error_var(all_args)

            if err_var:
                # Any bare error var → logServerError(ctx, err)
                str_arg = next((a for a in all_args if is_string_literal(a) and a != err_var), None)
                ctx = extract_bracket_context(str_arg) if str_arg else stem
                ctx = ctx or stem
                new_call = build_logservererror_call(ctx, err_var)
                need_logservererror = True
                replacements.append((m.start(), close_paren + 1, new_call))
            else:
                # No error var → improntaLog("stem.error", {…})
                fields = build_improntolog_fields(first, rest)
                new_call = build_improntolog_call(stem + ".error", fields, indent)
                need_improntolog = True
                replacements.append((m.start(), close_paren + 1, new_call))
            continue

        # ── console.warn / log / info ───────────────────────────────
        level_suffix = "warn" if method == "warn" else "info"
        fields = build_improntolog_fields(first, rest)
        new_call = build_improntolog_call(stem + "." + level_suffix, fields, indent)
        need_improntolog = True
        replacements.append((m.start(), close_paren + 1, new_call))

    if not replacements:
        return {"file": rel, "count": 0, "skipped": False, "flags": flags}

    result = text
    for start, end, new_call in reversed(replacements):
        result = result[:start] + new_call + result[end:]

    if need_improntolog and not already_imports(result, "improntaLog"):
        result = add_import(result, IMPORT_IMPRONTOLOG)
    if need_logservererror and not already_imports(result, "logServerError"):
        result = add_import(result, IMPORT_SERVER_ERROR)

    if not dry_run:
        Path(path).write_text(result, encoding="utf-8")

    return {"file": rel, "count": len(replacements), "skipped": False, "flags": flags}


def collect_violations(src_dir: str) -> list:
    files = []
    for root, _dirs, filenames in os.walk(src_dir):
        for fname in filenames:
            if not (fname.endswith(".ts") or fname.endswith(".tsx")):
                continue
            if ".test." in fname or ".spec." in fname:
                continue
            fpath = os.path.join(root, fname)
            rel = re.sub(r".*[/\\]src[/\\]", "src/", fpath)
            if any(rel.endswith(skip) for skip in SKIP_FILES):
                continue
            if CONSOLE_RE.search(Path(fpath).read_text(encoding="utf-8")):
                files.append(fpath)
    return sorted(files)


if __name__ == "__main__":
    argv = sys.argv[1:]
    dry_run = "--dry-run" in argv
    argv = [a for a in argv if not a.startswith("--")]

    if not argv:
        src_dir = Path(__file__).parent.parent / "src"
        files = collect_violations(str(src_dir))
    else:
        files = argv

    total = 0
    all_flags = []
    for f in files:
        result = transform_file(f, dry_run=dry_run)
        if result["skipped"]:
            print("  SKIP: " + result["file"])
        elif result["count"] > 0:
            print("  " + str(result["count"]).rjust(3) + "  " + result["file"])
        for flag in result["flags"]:
            print("       " + flag)
            all_flags.append(flag)
        total += result["count"]

    print("\nTotal: " + str(total) + " replacements across " + str(len(files)) + " files")
    if all_flags:
        print("Flags: " + str(len(all_flags)) + " items requiring report")
    if dry_run:
        print("(dry run — no files written)")
