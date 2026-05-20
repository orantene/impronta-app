#!/usr/bin/env python3
"""
Phase B / Y3 — off-grid fontSize codemod.

Converts SINGLE-PROP inline style objects that only contain fontSize
to Tailwind className equivalents:

  style={{ fontSize: 13 }}   →  className="text-admin-13"
  style={{ fontSize: 12 }}   →  className="text-xs"
  style={{ fontSize: 14 }}   →  className="text-sm"
  etc.

Also handles the two-prop case when the second prop is fontWeight only:
  style={{ fontSize: 11, fontWeight: 600 }}  →  className="text-admin-11 font-semibold"

Conservative rules:
  - Only HTML elements (not Components)
  - style must be the ONLY attribute OR there's also a className (merges)
  - If element already has className, the new classes are appended
  - fontWeight integer → Tailwind font-* mappings
  - Does NOT touch anything else

Usage:
  python3 scripts/phase-b-fontsize-codemod.py [--apply] <path> [<path> ...]
"""
import re, sys, pathlib

# HTML tags only — components may not forward className
HTML = (r"div|span|section|button|ul|ol|li|p|h[1-6]|nav|header|footer|"
        r"main|aside|label|figure|figcaption|small|strong|em|tbody|thead|"
        r"tr|td|th|input|textarea|select|form|article|time|address|blockquote|"
        r"pre|code|dt|dd|dl")

# fontSize value → Tailwind class
FONTSIZE_MAP: dict[float, str] = {
    9.0:  "text-admin-9",
    9.5:  "text-admin-9h",
    10.0: "text-admin-10",
    10.5: "text-admin-10h",
    11.0: "text-admin-11",
    11.5: "text-admin-11h",
    12.0: "text-xs",        # Tailwind default: 0.75rem = 12px
    12.5: "text-admin-12h",
    13.0: "text-admin-13",
    13.5: "text-admin-13h",
    14.0: "text-sm",        # Tailwind default: 0.875rem = 14px
    15.0: "text-admin-15",
    16.0: "text-base",      # Tailwind default: 1rem = 16px
    17.0: "text-admin-17",
    18.0: "text-lg",        # Tailwind default: 1.125rem = 18px
    19.0: "[text-[19px]]",  # one-off, use arbitrary
    20.0: "text-xl",        # Tailwind default: 1.25rem = 20px
    22.0: "text-admin-22",
    24.0: "text-2xl",       # Tailwind default: 1.5rem = 24px
    26.0: "text-admin-26",
    28.0: "text-[28px]",    # one-off
    32.0: "text-[32px]",    # one-off
    36.0: "text-4xl",       # Tailwind default: 2.25rem = 36px
    40.0: "text-[40px]",    # one-off
}

# fontWeight int → Tailwind class
FONTWEIGHT_MAP: dict[int, str] = {
    400: "font-normal",
    500: "font-medium",
    600: "font-semibold",
    700: "font-bold",
    800: "font-extrabold",
}

# Pattern: <TAG ...style={{ fontSize: N [, fontWeight: W] }} ...>
# Captures:
#   group 1: tag
#   group 2: attributes before style (may include className="...")
#   group 3: fontSize value (may be float like 11.5)
#   group 4: optional ", fontWeight: NNN"
#   group 5: attributes after the style prop
_SINGLE_PROP = re.compile(
    r'(<(' + HTML + r')\b'    # opening tag + tag name
    r'([^>]*?))'              # attrs BEFORE style (group 3)
    r'\s+style=\{\{[  ]*'
    r'fontSize: ([0-9]+(?:\.[0-9]+)?)'   # fontSize value (group 4)
    r'(?:,[  ]*fontWeight: ([0-9]+))?'   # optional fontWeight (group 5)
    r'[  ]*\}\}'              # closing }}
    r'((?:\s[^>]*)?)'         # attrs AFTER style (group 6)
    r'(>|/>)',                # close bracket (group 7)
    re.DOTALL,
)

def convert(m: "re.Match") -> "str | None":
    """Return the replacement string, or None to leave unchanged."""
    prefix = m.group(1)   # <TAG attrs_before
    # tag = m.group(2)  # not used directly
    attrs_before = m.group(3)
    fs_raw = m.group(4)
    fw_raw = m.group(5)
    attrs_after = m.group(6) or ""
    close = m.group(7)

    fs = float(fs_raw)
    if fs not in FONTSIZE_MAP:
        return None  # unknown value, leave

    fs_class = FONTSIZE_MAP[fs]
    # Skip malformed classes (shouldn't happen but guard)
    if fs_class.startswith("["):
        fs_class = fs_class[1:-1]  # strip outer []

    extra_classes = ""
    if fw_raw:
        fw = int(fw_raw)
        if fw in FONTWEIGHT_MAP:
            extra_classes = " " + FONTWEIGHT_MAP[fw]
        else:
            return None  # unknown fontWeight, leave

    new_classes = fs_class + extra_classes

    # Check if there's already a className in attrs_before or attrs_after
    all_attrs = attrs_before + attrs_after

    # Merge with existing className if present
    existing_cn = re.search(r'className="([^"]*)"', all_attrs)
    if existing_cn:
        old_cn = existing_cn.group(1)
        merged_cn = (old_cn + " " + new_classes).strip()
        # Replace the existing className in the full match area
        new_attrs_before = re.sub(r'className="[^"]*"', f'className="{merged_cn}"', attrs_before)
        new_attrs_after = re.sub(r'className="[^"]*"', f'className="{merged_cn}"', attrs_after)
        # One of them changed; reconstruct
        if new_attrs_before != attrs_before:
            return f"{prefix[:-len(attrs_before)]}{new_attrs_before}{attrs_after}{close}"
        else:
            return f"{prefix}{new_attrs_after}{close}"
    else:
        # No existing className: add it after the tag+attrs_before, drop style
        return f"{prefix} className=\"{new_classes}\"{attrs_after}{close}"


def process(src: "str") -> "tuple[str, int]":
    changes = 0
    def replacer(m: re.Match) -> str:
        nonlocal changes
        r = convert(m)
        if r is None:
            return m.group(0)
        changes += 1
        return r
    new_src = _SINGLE_PROP.sub(replacer, src)
    return new_src, changes


def main() -> None:
    apply = "--apply" in sys.argv
    paths = [p for p in sys.argv[1:] if not p.startswith("--")]
    if not paths:
        print("Usage: phase-b-fontsize-codemod.py [--apply] <path> [<path> ...]")
        sys.exit(1)

    total = 0
    for p_str in paths:
        p = pathlib.Path(p_str)
        if p.is_dir():
            files = list(p.rglob("*.tsx"))
        else:
            files = [p]
        for f in files:
            src = f.read_text(encoding="utf-8")
            new_src, n = process(src)
            if n:
                total += n
                print(f"  {f}: {n} conversion(s)")
                if apply:
                    f.write_text(new_src, encoding="utf-8")
    print(f"\nTotal: {total} conversion(s) {'applied' if apply else '(dry-run, add --apply)'}")


if __name__ == "__main__":
    main()
