#!/usr/bin/env python3
"""
rsc-audit.py — Phase F1 RSC classifier.

Reads every `"use client"` file under web/src/ and buckets it into:
  - Class A: server-renderable today (no client-only signals)
  - Class B: interactive island extractable (small interactivity inside
    otherwise-static content; parent can become a server component, child
    extracted as the island)
  - Class C: necessarily client (heavy state, routing, drag/drop,
    real-time, browser-API-heavy)
  - Unsure: signals conflict; needs human triage in F2/F3

This script is READ-ONLY against web/src/. It DOES NOT remove any
"use client" directive — that is the work of F2/F3.

Output: web/docs/rsc-audit-2026-05-19.csv
Columns: file_path, class, loc, interactivity_signals, estimated_effort_hours, notes

Heuristics are grounded in:
  * `web/node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-client.md`
    — the "use client" directive marks an entry point into the client
    bundle. Removing it means the file is callable as a Server Component
    and its props must be serializable.
  * Local sampling: ~15 representative files across admin/marketing/
    client/talent/edit-chrome surfaces.

The classifier is intentionally conservative on the boundary between B
and C (we'd rather mark something C than promise easy extraction). The
boundary between A and B is the bigger judgment call — see the
`classify` function for the rules.

Run from repo root:
  cd web && python3 scripts/rsc-audit.py

Or from the f1 worktree root:
  python3 web/scripts/rsc-audit.py
"""

from __future__ import annotations

import csv
import os
import re
import sys
from dataclasses import dataclass, field
from pathlib import Path
from typing import Iterable

# ── Detection patterns ──────────────────────────────────────────────────────

# React hooks that imply client-side state / lifecycle.
# (useId is borderline — it works in RSC too, so we don't count it.)
REACT_CLIENT_HOOKS = {
    "useState",
    "useEffect",
    "useReducer",
    "useRef",
    "useContext",
    "useLayoutEffect",
    "useImperativeHandle",
    "useTransition",
    "useDeferredValue",
    "useSyncExternalStore",
    "useActionState",  # React 19 form-state hook (client only)
}

# React hooks that are OK in server components — flag separately, don't
# count toward "needs client".
REACT_NEUTRAL_HOOKS = {"useId", "useMemo", "useCallback"}

# next/navigation hooks — all require client.
NEXT_NAV_HOOKS = {
    "useRouter",
    "usePathname",
    "useSearchParams",
    "useParams",
    "useSelectedLayoutSegment",
    "useSelectedLayoutSegments",
}

# react-dom client-only hooks.
REACT_DOM_HOOKS = {"useFormState", "useFormStatus"}

# Other Next.js client hooks.
NEXT_OTHER_HOOKS = {"useReportWebVitals"}

# React APIs that imply the file IS a client entry point (refs / lazy /
# context creation). These are NOT hooks but their presence means the
# component cannot be a pure Server Component.
#   - forwardRef: the wrapped component receives a ref → ref attaches to
#     a client DOM node, so the component must be client.
#   - lazy: client-side dynamic import wrapper.
#   - createContext: creating a context (vs only reading it) typically
#     pairs with a Provider that must be client.
REACT_CLIENT_PRIMITIVES = {"forwardRef", "lazy", "createContext"}

# Client-only libraries — if imported, the file is client by nature.
CLIENT_ONLY_LIBRARIES = {
    "framer-motion",
    "react-hook-form",
    "react-dnd",
    "react-dnd-html5-backend",
    "@dnd-kit/core",
    "@dnd-kit/sortable",
    "@dnd-kit/utilities",
    "@dnd-kit/modifiers",
    "@dnd-kit/accessibility",
    "recharts",
    "zustand",
    "jotai",
    "swiper",
    "react-pdf",
    "react-toastify",
    "sonner",  # toast() calls only work client-side
    "@react-google-maps/api",
}

# Event-handler props in JSX. Match attributes like `onClick=`, `onChange=`,
# etc. (We use a broad regex; React event props are conventionally
# `on[A-Z][a-zA-Z]+`.)
EVENT_HANDLER_RE = re.compile(r"(?<![A-Za-z0-9_])on[A-Z][A-Za-z]+\s*=")

# Names of event-handler-bearing JSX props (for signal listing).
COMMON_EVENT_HANDLERS = {
    "onClick", "onChange", "onSubmit", "onInput", "onFocus", "onBlur",
    "onKeyDown", "onKeyUp", "onKeyPress", "onMouseEnter", "onMouseLeave",
    "onMouseDown", "onMouseUp", "onMouseMove", "onWheel", "onScroll",
    "onDragStart", "onDragEnd", "onDragOver", "onDrop", "onDragEnter",
    "onDragLeave", "onTouchStart", "onTouchEnd", "onTouchMove",
    "onAnimationEnd", "onTransitionEnd", "onLoad", "onError",
    "onPointerDown", "onPointerUp", "onPointerMove",
}

# Browser globals — direct references usually mean client.
# (We use word-boundary regex; `window.matchMedia`, `document.body`, etc.)
BROWSER_GLOBALS = {
    "window", "document", "navigator", "localStorage", "sessionStorage",
    "requestAnimationFrame", "cancelAnimationFrame", "matchMedia",
    "IntersectionObserver", "ResizeObserver", "MutationObserver",
    "URL.createObjectURL", "FileReader", "Blob", "performance.now",
}

# Tokens that should NOT be treated as browser-global hits even though
# they share a name with one. e.g. `document` appears in many template
# strings ("New document", "edit document"). Length-balance check helps.
BROWSER_GLOBAL_RE = re.compile(
    r"(?<![A-Za-z0-9_])(window|document|navigator|localStorage|sessionStorage|"
    r"requestAnimationFrame|cancelAnimationFrame|matchMedia|"
    r"IntersectionObserver|ResizeObserver|MutationObserver|FileReader)"
    r"(?=\s*[.\(])"
)

# JSX node opener — counts both <Foo and <div. Self-closing & block-tag
# count once. Component-style names (capital first letter) and HTML tags
# both count.
JSX_OPEN_RE = re.compile(r"<([A-Za-z][A-Za-z0-9_.]*)\b")

# Custom-hook usage call sites — function call of a name matching
# `use[A-Z]…`. We use this to catch hooks defined elsewhere (e.g.
# `useT()`, `useDebouncedValue()`).
CUSTOM_HOOK_CALL_RE = re.compile(r"(?<![A-Za-z0-9_.])(use[A-Z][A-Za-z0-9]+)\s*\(")

# Heavy-state threshold: a file with this many useState calls is almost
# certainly Class C.
HEAVY_STATE_USESTATE_THRESHOLD = 3

# Big-file threshold for forced Class C classification.
HEAVY_LOC_THRESHOLD = 1500

# Strip /* ... */ comments and // ... line comments — keeps the regex
# signal counts honest (long doc comments at the top of files were
# accidentally inflating event-handler counts in early runs).
BLOCK_COMMENT_RE = re.compile(r"/\*.*?\*/", re.DOTALL)
LINE_COMMENT_RE = re.compile(r"//[^\n]*")
STRING_RE = re.compile(r"\"(?:[^\"\\]|\\.)*\"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`")

# Import-from regex — `from "x"` / `from 'x'` (we don't need named-imports
# parsing for library detection).
IMPORT_FROM_RE = re.compile(r"from\s+[\"']([^\"']+)[\"']")

# Named-import block parser: e.g. `import { useState, useEffect } from "react"`.
NAMED_IMPORT_BLOCK_RE = re.compile(
    r"import\s*(?:type\s*)?\{([^}]+)\}\s*from\s*[\"']([^\"']+)[\"']"
)

# ── Models ──────────────────────────────────────────────────────────────────


@dataclass
class FileSignals:
    path: Path
    loc: int = 0
    react_hooks: set[str] = field(default_factory=set)
    react_primitives: set[str] = field(default_factory=set)
    nav_hooks: set[str] = field(default_factory=set)
    dom_hooks: set[str] = field(default_factory=set)
    next_other_hooks: set[str] = field(default_factory=set)
    custom_hook_calls: set[str] = field(default_factory=set)
    client_libs: set[str] = field(default_factory=set)
    event_handler_count: int = 0
    browser_global_hits: set[str] = field(default_factory=set)
    jsx_node_count: int = 0
    use_state_count: int = 0
    use_effect_count: int = 0
    is_admin_shell: bool = False
    is_edit_chrome: bool = False
    is_hook_file: bool = False  # filename starts with `use-` or under hooks/

    def signal_strings(self) -> list[str]:
        signals: list[str] = []
        if self.react_hooks:
            signals.append("react:" + ",".join(sorted(self.react_hooks)))
        if self.react_primitives:
            signals.append("react-primitives:" + ",".join(sorted(self.react_primitives)))
        if self.nav_hooks:
            signals.append("nav:" + ",".join(sorted(self.nav_hooks)))
        if self.dom_hooks:
            signals.append("react-dom:" + ",".join(sorted(self.dom_hooks)))
        if self.next_other_hooks:
            signals.append("next:" + ",".join(sorted(self.next_other_hooks)))
        if self.custom_hook_calls:
            signals.append("custom-hooks:" + ",".join(sorted(self.custom_hook_calls)))
        if self.client_libs:
            signals.append("libs:" + ",".join(sorted(self.client_libs)))
        if self.event_handler_count:
            signals.append(f"events:{self.event_handler_count}")
        if self.browser_global_hits:
            signals.append("browser:" + ",".join(sorted(self.browser_global_hits)))
        signals.append(f"jsx-nodes:{self.jsx_node_count}")
        return signals


# ── Parsing ─────────────────────────────────────────────────────────────────


def strip_noise(src: str) -> str:
    """Remove comments and string literals from source so regex counts
    don't pick up event-handler-shaped substrings inside docs / strings.

    We replace strings/comments with whitespace so character offsets
    stay roughly aligned (helps line-aware reporting if needed later).
    """
    src = BLOCK_COMMENT_RE.sub(lambda m: " " * len(m.group(0)), src)
    src = LINE_COMMENT_RE.sub(lambda m: " " * len(m.group(0)), src)
    src = STRING_RE.sub(lambda m: " " * len(m.group(0)), src)
    return src


def scan_file(path: Path) -> FileSignals:
    raw = path.read_text(encoding="utf-8", errors="replace")
    loc = raw.count("\n") + 1
    cleaned = strip_noise(raw)
    # `cleaned` wipes string literals — including the `"react"` source
    # in import statements. We need the un-stripped source for import
    # parsing. Use `raw_no_comments` (only block + line comments removed)
    # so we still ignore commented-out imports.
    raw_no_comments = LINE_COMMENT_RE.sub(
        lambda m: " " * len(m.group(0)),
        BLOCK_COMMENT_RE.sub(lambda m: " " * len(m.group(0)), raw),
    )

    sig = FileSignals(path=path, loc=loc)

    # File-context flags.
    posix = path.as_posix()
    sig.is_admin_shell = "components/admin/shell/" in posix
    sig.is_edit_chrome = "components/edit-chrome/" in posix or "edit-chrome/" in posix
    sig.is_hook_file = (
        path.name.startswith("use-")
        or "/hooks/" in posix
        or path.name.startswith("use") and path.suffix in {".ts", ".tsx"} and not path.name[3:4].islower()
    )

    # Imports: detect named hook imports & client libraries. Use the
    # un-string-stripped source so the `from "..."` clause survives.
    for block_match in NAMED_IMPORT_BLOCK_RE.finditer(raw_no_comments):
        names_blob, source = block_match.group(1), block_match.group(2).strip()
        # Bucket hooks by source.
        names = {n.strip().split(" as ")[0] for n in names_blob.split(",") if n.strip()}
        if source == "react":
            sig.react_hooks |= names & REACT_CLIENT_HOOKS
            sig.react_primitives |= names & REACT_CLIENT_PRIMITIVES
        elif source == "next/navigation":
            sig.nav_hooks |= names & NEXT_NAV_HOOKS
        elif source in {"react-dom", "react-dom/server"}:
            sig.dom_hooks |= names & REACT_DOM_HOOKS
        elif source.startswith("next/web-vitals") or source == "next/web-vitals":
            sig.next_other_hooks |= names & NEXT_OTHER_HOOKS

    # All `from "lib"` — collect client-only library hits.
    for from_match in IMPORT_FROM_RE.finditer(raw_no_comments):
        source = from_match.group(1)
        if source in CLIENT_ONLY_LIBRARIES:
            sig.client_libs.add(source)
        elif source.startswith("@dnd-kit/"):
            sig.client_libs.add(source)

    # Custom hook callsites — anything that looks like `useFoo(…)` after
    # we've stripped strings/comments. Filter out React's own hooks (we
    # already counted them above via imports) and neutral hooks.
    for m in CUSTOM_HOOK_CALL_RE.finditer(cleaned):
        name = m.group(1)
        if name in REACT_CLIENT_HOOKS or name in REACT_NEUTRAL_HOOKS:
            continue
        if name in NEXT_NAV_HOOKS or name in REACT_DOM_HOOKS or name in NEXT_OTHER_HOOKS:
            continue
        sig.custom_hook_calls.add(name)

    # Count specifically useState / useEffect for the heavy-state heuristic.
    sig.use_state_count = len(re.findall(r"(?<![A-Za-z0-9_])useState\s*[<\(]", cleaned))
    sig.use_effect_count = len(re.findall(r"(?<![A-Za-z0-9_])useEffect\s*\(", cleaned))

    # Event handlers in JSX (after string strip).
    sig.event_handler_count = len(EVENT_HANDLER_RE.findall(cleaned))

    # Browser globals.
    for m in BROWSER_GLOBAL_RE.finditer(cleaned):
        sig.browser_global_hits.add(m.group(1))

    # JSX node count.
    sig.jsx_node_count = len(JSX_OPEN_RE.findall(cleaned))

    return sig


# ── Classification ──────────────────────────────────────────────────────────


def has_any_client_signal(sig: FileSignals) -> bool:
    """True if the file has ANY signal that proves it must run on the client."""
    return bool(
        sig.react_hooks
        or sig.react_primitives
        or sig.nav_hooks
        or sig.dom_hooks
        or sig.next_other_hooks
        or sig.custom_hook_calls
        or sig.client_libs
        or sig.event_handler_count
        or sig.browser_global_hits
    )


def classify(sig: FileSignals) -> tuple[str, float, str]:
    """Return (class, estimated_effort_hours, notes)."""
    posix = sig.path.as_posix()

    # ── Hook files (.ts under hooks/ or use-*.ts/tsx) ──────────────────────
    # A hook file is INHERENTLY client-only — it defines client behavior.
    # The "use client" directive is correct; do not flip.
    if sig.is_hook_file and sig.path.suffix in {".ts", ".tsx"} and "components" not in posix:
        # only treat as hook-file when filename pattern + no JSX
        if sig.jsx_node_count == 0:
            return ("C", 0.0, "hook file — client by nature")

    # ── A0: No client signals at all → Class A ─────────────────────────────
    if not has_any_client_signal(sig):
        notes = []
        if sig.is_admin_shell:
            notes.append("admin-shell")
        if sig.is_edit_chrome:
            notes.append("edit-chrome")
        if sig.jsx_node_count == 0:
            notes.append("no JSX — pure module export")
        return ("A", 0.25, "; ".join(notes) or "pure presentational")

    # ── C0: Hard-Class-C signals ───────────────────────────────────────────
    # Drag/drop, animation, charts, forms, real-time → keep client.
    if sig.client_libs:
        return (
            "C",
            0.0,
            "client-only library: " + ",".join(sorted(sig.client_libs)),
        )

    # Heavy state machinery.
    if sig.use_state_count >= HEAVY_STATE_USESTATE_THRESHOLD:
        return (
            "C",
            0.0,
            f"heavy state ({sig.use_state_count} useState)",
        )

    # Reducers, refs, layout effects, transitions are all sticky.
    if "useReducer" in sig.react_hooks or "useLayoutEffect" in sig.react_hooks:
        return ("C", 0.0, "useReducer/useLayoutEffect — stateful boundary")

    # Real-time / context — sticky.
    if "useContext" in sig.react_hooks and not sig.is_admin_shell:
        return ("C", 0.0, "consumes React Context")

    # React client primitives (forwardRef / lazy / createContext) — the
    # file itself defines a client-coupled entity. Small enough surfaces
    # could be Class B (extract the primitive as an island) but the
    # default is C unless the file is otherwise trivial.
    if sig.react_primitives and (
        sig.event_handler_count >= 1 or sig.loc >= 100 or sig.react_hooks
    ):
        return (
            "C",
            0.0,
            "react primitive: " + ",".join(sorted(sig.react_primitives)),
        )

    # Edit-chrome is client-by-charter — even small files in edit-chrome
    # tend to be islands inside the live editor. F5 handles boundary
    # tightening; default classification is C.
    if sig.is_edit_chrome and (
        sig.event_handler_count >= 1
        or sig.react_hooks
        or sig.custom_hook_calls
    ):
        return ("C", 0.0, "edit-chrome live-editor island (F5 territory)")

    # Real-time + routing hooks → client.
    if sig.nav_hooks and (sig.use_state_count >= 1 or sig.use_effect_count >= 1):
        return (
            "C",
            0.0,
            "navigation hook + state/effect — route-aware interactive shell",
        )

    # Huge files with interactivity → Class C by default.
    if sig.loc >= HEAVY_LOC_THRESHOLD:
        return (
            "C",
            0.0,
            f"large file ({sig.loc} LOC) — too coarse for island extraction",
        )

    # Real-time custom hooks (subscriptions, websockets).
    realtime_indicators = {
        "useInquiryRealtime", "useRealtimeChannel", "useSupabaseChannel",
        "useThreadRealtime", "useSubscription",
    }
    if sig.custom_hook_calls & realtime_indicators:
        return ("C", 0.0, "real-time subscription hook")

    # ── B/A judgment ───────────────────────────────────────────────────────
    # If the file has SOME interactivity but the interactive footprint is
    # small relative to the JSX tree, it's a Class B candidate: extract
    # the small island, flip parent to server.

    interactive_score = (
        len(sig.react_hooks) * 2
        + len(sig.react_primitives)
        + len(sig.nav_hooks) * 2
        + len(sig.dom_hooks) * 2
        + len(sig.custom_hook_calls)
        + sig.event_handler_count
        + len(sig.browser_global_hits)
    )
    # Density: how much of the JSX is interactive-prop-bearing?
    jsx_density = (
        sig.event_handler_count / max(sig.jsx_node_count, 1)
        if sig.jsx_node_count
        else 0
    )

    # Edge: file has a single event handler and lots of static JSX → B.
    if (
        sig.jsx_node_count >= 5
        and sig.event_handler_count <= 2
        and jsx_density < 0.20
        and not sig.react_hooks
        and not sig.nav_hooks
        and not sig.dom_hooks
        and not sig.custom_hook_calls
    ):
        return (
            "B",
            min(4.0 + sig.loc / 100, 16.0),
            f"static JSX wrapper with {sig.event_handler_count} small handler(s) "
            f"(density {jsx_density:.2f})",
        )

    # Edge: file uses ONE nav hook (usePathname) for an active-link check,
    # and no state/effects → B (extract the active-link strip).
    if (
        sig.nav_hooks
        and not sig.react_hooks
        and not sig.dom_hooks
        and not sig.custom_hook_calls
        and sig.use_state_count == 0
        and sig.use_effect_count == 0
        and sig.event_handler_count == 0
        and sig.jsx_node_count >= 8
    ):
        return (
            "B",
            4.0 + sig.loc / 100,
            "uses pathname for active-link only — wrap nav strip as island",
        )

    # Edge: only client signal is `useTransition` + a couple handlers
    # over otherwise-static markup → B.
    if (
        sig.react_hooks == {"useTransition"}
        and sig.event_handler_count <= 3
        and sig.jsx_node_count >= 10
        and jsx_density < 0.20
    ):
        return (
            "B",
            4.0 + sig.loc / 100,
            "useTransition + small actions — wrap actions as island",
        )

    # Edge: only `useId` (server-safe) + small handler set → B (rare).
    if (
        not sig.react_hooks
        and not sig.nav_hooks
        and not sig.dom_hooks
        and not sig.custom_hook_calls
        and sig.event_handler_count <= 3
        and sig.jsx_node_count >= 12
        and jsx_density < 0.15
    ):
        return ("B", 4.0 + sig.loc / 100, "thin interactivity over static shell")

    # ── Default: C ─────────────────────────────────────────────────────────
    # Anything that has interactivity AND doesn't pass the B heuristics
    # above is Class C.  We tag the reason coarsely so the integrator can
    # spot-check.
    reasons = []
    if sig.react_hooks:
        reasons.append("react-hooks=" + ",".join(sorted(sig.react_hooks)))
    if sig.react_primitives:
        reasons.append("react-primitives=" + ",".join(sorted(sig.react_primitives)))
    if sig.nav_hooks:
        reasons.append("nav-hooks=" + ",".join(sorted(sig.nav_hooks)))
    if sig.dom_hooks:
        reasons.append("dom-hooks=" + ",".join(sorted(sig.dom_hooks)))
    if sig.next_other_hooks:
        reasons.append("next-hooks=" + ",".join(sorted(sig.next_other_hooks)))
    if sig.custom_hook_calls:
        # cap the printed list
        names = sorted(sig.custom_hook_calls)
        if len(names) > 4:
            names = names[:4] + ["..."]
        reasons.append("custom-hooks=" + ",".join(names))
    if sig.event_handler_count and not sig.react_hooks and not sig.custom_hook_calls:
        reasons.append(f"events={sig.event_handler_count}")
    if sig.browser_global_hits:
        reasons.append("browser=" + ",".join(sorted(sig.browser_global_hits)))

    notes = "; ".join(reasons) or "interactivity present"
    return ("C", 0.0, notes)


# ── Driver ──────────────────────────────────────────────────────────────────


def find_use_client_files(root: Path) -> list[Path]:
    files: list[Path] = []
    src = root / "web" / "src"
    if not src.exists():
        print(f"error: web/src not found relative to {root}", file=sys.stderr)
        sys.exit(2)
    # The directive must precede any code, but a leading file-comment
    # block is allowed. We strip leading whitespace + block comments and
    # then check the first non-comment statement. This matches what we
    # observed in `web/src/components/reservation-thread/*.tsx` and
    # `admin/shell/internal/messages.tsx` (comment-first files).
    leading_re = re.compile(
        r"""^\s*(?:/\*.*?\*/\s*)*\s*["']use client["']""",
        re.DOTALL,
    )
    for ext in (".tsx", ".ts"):
        for p in src.rglob(f"*{ext}"):
            try:
                head = p.read_text(encoding="utf-8", errors="replace")[:4000]
            except Exception:
                continue
            if leading_re.match(head):
                files.append(p)
    return sorted(files)


def main(argv: list[str]) -> int:
    # Resolve repo root (parent of `web/`).
    here = Path(__file__).resolve()
    # web/scripts/rsc-audit.py → web/scripts → web → repo root
    repo_root = here.parent.parent.parent

    files = find_use_client_files(repo_root)
    print(f"scanned {len(files)} use-client files under web/src/", file=sys.stderr)

    rows: list[dict[str, str]] = []
    by_class: dict[str, int] = {"A": 0, "B": 0, "C": 0, "Unsure": 0}
    loc_by_class: dict[str, int] = {"A": 0, "B": 0, "C": 0, "Unsure": 0}
    hours_by_class: dict[str, float] = {"A": 0.0, "B": 0.0, "C": 0.0, "Unsure": 0.0}

    for path in files:
        sig = scan_file(path)
        cls, hours, notes = classify(sig)
        by_class[cls] += 1
        loc_by_class[cls] += sig.loc
        hours_by_class[cls] += hours

        rel = path.relative_to(repo_root).as_posix()
        rows.append(
            {
                "file_path": rel,
                "class": cls,
                "loc": str(sig.loc),
                "interactivity_signals": " | ".join(sig.signal_strings()),
                "estimated_effort_hours": f"{hours:.2f}",
                "notes": notes,
            }
        )

    # Write CSV.
    out_csv = repo_root / "web" / "docs" / "rsc-audit-2026-05-19.csv"
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    with out_csv.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=[
                "file_path",
                "class",
                "loc",
                "interactivity_signals",
                "estimated_effort_hours",
                "notes",
            ],
        )
        writer.writeheader()
        for r in rows:
            writer.writerow(r)

    print(f"wrote {out_csv.relative_to(repo_root)}", file=sys.stderr)
    print("class distribution:", file=sys.stderr)
    for k in ("A", "B", "C", "Unsure"):
        print(
            f"  {k}: {by_class[k]:>4} files | "
            f"{loc_by_class[k]:>7} LOC | {hours_by_class[k]:>7.1f}h",
            file=sys.stderr,
        )
    total = sum(by_class.values())
    print(f"  total: {total} (input was {len(files)})", file=sys.stderr)
    assert total == len(files), "classifier dropped a file"

    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
