#!/usr/bin/env python3
"""
Phase 3 — design-token / inline-style codemod (remediation-plan-2026-05-19 §4).

Conservative, parity-EXACT, ratchet-reducing transform: collapse a vetted
allowlist of *fully static, pure-layout* `style={{...}}` objects into the
computed-identical Tailwind utility class, but ONLY when `style` is the sole
attribute on a bare HTML element (no className to merge, no component that
might not forward className). Every mapping below is computed-value-identical
to its inline form (Tailwind root 1rem = 16px; the app sets no html font-size
override, so the rem scale is exact):

  flex:1                -> flex-1            (flex:1 == flex:1 1 0%)
  minWidth:0            -> min-w-0           (min-width:0)
  gap:N (px)            -> gap-{N/4}         (4,6,8,10,12,16,20,24 on-scale)
  margin*/padding N px  -> m*/p* {N/4}      (on 4px grid only)
  display:flex          -> flex
  flexDirection:column  -> flex-col
  alignItems:center     -> items-center  (etc.)
  justifyContent:*      -> justify-*
  position:relative     -> relative

Anything with COLORS/FONTS/TRANSITION/RADIUS/SPACE refs, ${}, ternaries,
off-grid numbers, or a non-HTML tag is left untouched (honest tail).

Usage:  python3 scripts/phase3-token-codemod.py --apply <dir> [<dir> ...]
        (omit --apply for a dry-run report)
"""
import re, sys, pathlib

HTML = r"div|span|section|button|ul|ol|li|p|h[1-6]|nav|header|footer|main|aside|label|figure|figcaption|small|strong|em|tbody|thead|tr|td|th|table"

# Exact source -> exact className. Each is parity-verified (computed-identical).
EXACT = {
    'style={{ flex: 1, minWidth: 0 }}': 'flex-1 min-w-0',
    'style={{ minWidth: 0, flex: 1 }}': 'flex-1 min-w-0',
    'style={{ flex: 1 }}': 'flex-1',
    'style={{ minWidth: 0 }}': 'min-w-0',
    'style={{ position: "relative" }}': 'relative',
    'style={{ flexShrink: 0 }}': 'shrink-0',
    'style={{ flex: 1, overflowY: "auto" }}': 'flex-1 overflow-y-auto',
    'style={{ display: "flex", flexDirection: "column" }}': 'flex flex-col',
    'style={{ display: "flex", alignItems: "center" }}': 'flex items-center',
    'style={{ display: "flex", alignItems: "center", gap: 4 }}': 'flex items-center gap-1',
    'style={{ display: "flex", alignItems: "center", gap: 6 }}': 'flex items-center gap-1.5',
    'style={{ display: "flex", alignItems: "center", gap: 8 }}': 'flex items-center gap-2',
    'style={{ display: "flex", alignItems: "center", gap: 10 }}': 'flex items-center gap-2.5',
    'style={{ display: "flex", alignItems: "center", gap: 12 }}': 'flex items-center gap-3',
    'style={{ display: "flex", alignItems: "center", gap: 16 }}': 'flex items-center gap-4',
    'style={{ display: "flex", flexDirection: "column", gap: 4 }}': 'flex flex-col gap-1',
    'style={{ display: "flex", flexDirection: "column", gap: 6 }}': 'flex flex-col gap-1.5',
    'style={{ display: "flex", flexDirection: "column", gap: 8 }}': 'flex flex-col gap-2',
    'style={{ display: "flex", flexDirection: "column", gap: 10 }}': 'flex flex-col gap-2.5',
    'style={{ display: "flex", flexDirection: "column", gap: 12 }}': 'flex flex-col gap-3',
    'style={{ display: "flex", flexDirection: "column", gap: 16 }}': 'flex flex-col gap-4',
    'style={{ display: "flex", flexDirection: "column", gap: 24 }}': 'flex flex-col gap-6',
    'style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}': 'flex items-center justify-between',
    'style={{ display: "flex", alignItems: "center", justifyContent: "center" }}': 'flex items-center justify-center',
    'style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}': 'flex items-center gap-2 mb-2',
    'style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}': 'flex items-center gap-2 mb-3',
    'style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 12 }}': 'flex items-baseline justify-between gap-3 mb-3',
    'style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}': 'flex flex-col gap-1.5 flex-1',
    'style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}': 'flex flex-col gap-2 flex-1',
    'style={{ display: "grid", gap: 8 }}': 'grid gap-2',
    'style={{ display: "grid", gap: 12 }}': 'grid gap-3',
    'style={{ display: "grid", gap: 16 }}': 'grid gap-4',
    'style={{ width: "100%" }}': 'w-full',
    'style={{ height: "100%" }}': 'h-full',
    'style={{ display: "flex", gap: 8 }}': 'flex gap-2',
    'style={{ display: "flex", gap: 12 }}': 'flex gap-3',
    'style={{ display: "flex", gap: 6 }}': 'flex gap-1.5',
}

def build_pattern(src):
    # <htmltag  STYLE >  with style as the SOLE attribute (nothing between
    # tag name and the style attr except whitespace, nothing after but >).
    return re.compile(r'<(' + HTML + r')\s+' + re.escape(src) + r'\s*>')

PATS = [(build_pattern(s), s, cls) for s, cls in EXACT.items()]

def process(text):
    n = 0
    for pat, _src, cls in PATS:
        def repl(m):
            nonlocal n
            n += 1
            return f'<{m.group(1)} className="{cls}">'
        text = pat.sub(repl, text)
    return text, n

def main():
    args = sys.argv[1:]
    apply = "--apply" in args
    excludes = [args[i + 1] for i, a in enumerate(args) if a == "--exclude"]
    dirs = [a for a in args if a != "--apply" and a != "--exclude" and a not in excludes]
    total, files = 0, 0
    for d in dirs:
        for p in sorted(pathlib.Path(d).rglob("*.tsx")):
            if any(x in str(p) for x in excludes):
                continue
            orig = p.read_text()
            new, n = process(orig)
            if n:
                total += n
                files += 1
                print(f"{n:4d}  {p}")
                if apply:
                    p.write_text(new)
    print(f"--- {'APPLIED' if apply else 'DRY-RUN'}: {total} objects across {files} files ---")

if __name__ == "__main__":
    main()
