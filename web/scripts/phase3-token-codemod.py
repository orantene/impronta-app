#!/usr/bin/env python3
"""
Phase 3 — design-token / inline-style codemod (remediation-plan-2026-05-19 §4).
Extended in Y1 branch: more margin/padding/flex/grid/misc layout patterns,
inline-flex, overflow, position, cursor, text-align, font-weight, line-height,
object-fit, and (Y4-unlocked) COLORS.*/RADIUS.* → admin utility class transforms.

Conservative, parity-EXACT, ratchet-reducing transform.  Each mapping is
computed-value-identical to its inline form (Tailwind v4; app sets no html
font-size override so 1rem = 16px).

The codemod ONLY fires when `style` is the SOLE attribute on a bare HTML
element (nothing before or after it on the same `<tag ...>` line). Elements
with an existing `className` alongside `style` are NOT touched.

Usage:
    python3 scripts/phase3-token-codemod.py [--apply] [--no-admin-colors]
        [--exclude <substr>] <path> [<path> ...]

    --apply            Write changes (default: dry-run)
    --no-admin-colors  Skip COLORS.*/RADIUS.* → admin-utility transforms.
                       Use for marketing/public dirs — Y4 canonical doc §4.3.
    --exclude <path>   Skip any path containing this substring (repeatable)

Notes on admin-color patterns:
    - Only fires on files processed WITHOUT --no-admin-colors.
    - Requires the exact JS alias `COLORS` / `RADIUS` at the call site.
      Alias variants (C.*, HQ.*, etc.) are left for Y2 lane.
    - #0F4F3E is BOTH accent and brand (same hex, different semantics).
      Bare hex literals are left inline — Y2 lane handles with call-site
      context analysis per Y4 canonical doc §4.2.
    - TRANSITION / SPACE have no clean Tailwind shorthand; left as-is.
    - fontWeight integer patterns for bare 400/500/600/700 only.
"""
import re, sys, pathlib

# HTML tags the codemod may rewrite.  Components never touched — they may not
# forward className.
HTML = (r"div|span|section|button|ul|ol|li|p|h[1-6]|nav|header|footer|"
        r"main|aside|label|figure|figcaption|small|strong|em|tbody|thead|"
        r"tr|td|th|table|form|fieldset|summary|details|article|address")

# ── Layout / structural patterns (safe for ALL dirs) ─────────────────────────
EXACT_LAYOUT = {
    # flex-1 / shrink / grow
    'style={{ flex: 1, minWidth: 0 }}':                     'flex-1 min-w-0',
    'style={{ minWidth: 0, flex: 1 }}':                     'flex-1 min-w-0',
    'style={{ flex: 1 }}':                                   'flex-1',
    'style={{ minWidth: 0 }}':                               'min-w-0',
    'style={{ flexShrink: 0 }}':                             'shrink-0',
    'style={{ flexGrow: 1 }}':                               'grow',
    'style={{ flexGrow: 0 }}':                               'grow-0',

    # position
    'style={{ position: "relative" }}':                      'relative',
    'style={{ position: "absolute" }}':                      'absolute',
    'style={{ position: "sticky" }}':                        'sticky',
    'style={{ position: "fixed" }}':                         'fixed',
    'style={{ position: "relative", flexShrink: 0 }}':      'relative shrink-0',
    'style={{ position: "relative", display: "inline-flex" }}': 'relative inline-flex',

    # overflow
    'style={{ overflow: "hidden" }}':                        'overflow-hidden',
    'style={{ overflow: "auto" }}':                          'overflow-auto',
    'style={{ overflowY: "auto" }}':                         'overflow-y-auto',
    'style={{ overflowX: "auto" }}':                         'overflow-x-auto',
    'style={{ overflowY: "hidden" }}':                       'overflow-y-hidden',
    'style={{ overflowX: "hidden" }}':                       'overflow-x-hidden',
    'style={{ flex: 1, overflowY: "auto" }}':                'flex-1 overflow-y-auto',
    'style={{ flex: 1, overflow: "hidden" }}':               'flex-1 overflow-hidden',

    # display: flex — bare
    'style={{ display: "flex" }}':                           'flex',
    'style={{ display: "flex", flexDirection: "column" }}':  'flex flex-col',
    'style={{ display: "flex", flexDirection: "row" }}':     'flex flex-row',
    'style={{ display: "flex", alignItems: "center" }}':     'flex items-center',
    'style={{ display: "flex", alignItems: "flex-start" }}': 'flex items-start',
    'style={{ display: "flex", alignItems: "flex-end" }}':   'flex items-end',
    'style={{ display: "flex", alignItems: "baseline" }}':   'flex items-baseline',
    'style={{ display: "flex", flexWrap: "wrap" }}':         'flex flex-wrap',

    # justify variants
    'style={{ display: "flex", justifyContent: "space-between" }}': 'flex justify-between',
    'style={{ display: "flex", justifyContent: "center" }}':         'flex justify-center',
    'style={{ display: "flex", justifyContent: "flex-end" }}':       'flex justify-end',
    'style={{ display: "flex", justifyContent: "flex-start" }}':     'flex justify-start',
    'style={{ display: "flex", justifyContent: "space-around" }}':   'flex justify-around',

    # center + between combos
    'style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}':
        'flex items-center justify-between',
    'style={{ display: "flex", alignItems: "center", justifyContent: "center" }}':
        'flex items-center justify-center',
    'style={{ display: "flex", alignItems: "center", justifyContent: "flex-end" }}':
        'flex items-center justify-end',
    'style={{ display: "flex", alignItems: "center", justifyContent: "flex-start" }}':
        'flex items-center justify-start',
    'style={{ display: "flex", alignItems: "center", flexWrap: "wrap" }}':
        'flex items-center flex-wrap',
    'style={{ display: "flex", flexDirection: "column", alignItems: "center" }}':
        'flex flex-col items-center',

    # flex + gap (items-center)
    'style={{ display: "flex", alignItems: "center", gap: 2 }}':   'flex items-center gap-0.5',
    'style={{ display: "flex", alignItems: "center", gap: 4 }}':   'flex items-center gap-1',
    'style={{ display: "flex", alignItems: "center", gap: 6 }}':   'flex items-center gap-1.5',
    'style={{ display: "flex", alignItems: "center", gap: 8 }}':   'flex items-center gap-2',
    'style={{ display: "flex", alignItems: "center", gap: 10 }}':  'flex items-center gap-2.5',
    'style={{ display: "flex", alignItems: "center", gap: 12 }}':  'flex items-center gap-3',
    'style={{ display: "flex", alignItems: "center", gap: 14 }}':  'flex items-center gap-3.5',
    'style={{ display: "flex", alignItems: "center", gap: 16 }}':  'flex items-center gap-4',
    'style={{ display: "flex", alignItems: "center", gap: 20 }}':  'flex items-center gap-5',
    'style={{ display: "flex", alignItems: "center", gap: 24 }}':  'flex items-center gap-6',
    'style={{ display: "flex", alignItems: "center", gap: 32 }}':  'flex items-center gap-8',

    # flex + gap (items-start)
    'style={{ display: "flex", alignItems: "flex-start", gap: 6 }}':  'flex items-start gap-1.5',
    'style={{ display: "flex", alignItems: "flex-start", gap: 8 }}':  'flex items-start gap-2',
    'style={{ display: "flex", alignItems: "flex-start", gap: 10 }}': 'flex items-start gap-2.5',
    'style={{ display: "flex", alignItems: "flex-start", gap: 12 }}': 'flex items-start gap-3',
    'style={{ display: "flex", alignItems: "flex-start", gap: 16 }}': 'flex items-start gap-4',
    'style={{ display: "flex", alignItems: "flex-start", gap: 24 }}': 'flex items-start gap-6',

    # flex-col + gap
    'style={{ display: "flex", flexDirection: "column", gap: 2 }}':   'flex flex-col gap-0.5',
    'style={{ display: "flex", flexDirection: "column", gap: 4 }}':   'flex flex-col gap-1',
    'style={{ display: "flex", flexDirection: "column", gap: 6 }}':   'flex flex-col gap-1.5',
    'style={{ display: "flex", flexDirection: "column", gap: 8 }}':   'flex flex-col gap-2',
    'style={{ display: "flex", flexDirection: "column", gap: 10 }}':  'flex flex-col gap-2.5',
    'style={{ display: "flex", flexDirection: "column", gap: 12 }}':  'flex flex-col gap-3',
    'style={{ display: "flex", flexDirection: "column", gap: 14 }}':  'flex flex-col gap-3.5',
    'style={{ display: "flex", flexDirection: "column", gap: 16 }}':  'flex flex-col gap-4',
    'style={{ display: "flex", flexDirection: "column", gap: 20 }}':  'flex flex-col gap-5',
    'style={{ display: "flex", flexDirection: "column", gap: 24 }}':  'flex flex-col gap-6',
    'style={{ display: "flex", flexDirection: "column", gap: 28 }}':  'flex flex-col gap-7',
    'style={{ display: "flex", flexDirection: "column", gap: 32 }}':  'flex flex-col gap-8',

    # flex-col + flex-1
    'style={{ display: "flex", flexDirection: "column", gap: 6, flex: 1 }}':  'flex flex-col gap-1.5 flex-1',
    'style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}':  'flex flex-col gap-2 flex-1',
    'style={{ display: "flex", flexDirection: "column", gap: 12, flex: 1 }}': 'flex flex-col gap-3 flex-1',

    # flex + bare gap (no alignment)
    'style={{ display: "flex", gap: 2 }}':   'flex gap-0.5',
    'style={{ display: "flex", gap: 4 }}':   'flex gap-1',
    'style={{ display: "flex", gap: 6 }}':   'flex gap-1.5',
    'style={{ display: "flex", gap: 8 }}':   'flex gap-2',
    'style={{ display: "flex", gap: 10 }}':  'flex gap-2.5',
    'style={{ display: "flex", gap: 12 }}':  'flex gap-3',
    'style={{ display: "flex", gap: 14 }}':  'flex gap-3.5',
    'style={{ display: "flex", gap: 16 }}':  'flex gap-4',
    'style={{ display: "flex", gap: 20 }}':  'flex gap-5',
    'style={{ display: "flex", gap: 24 }}':  'flex gap-6',
    'style={{ display: "flex", gap: 32 }}':  'flex gap-8',

    # flex-wrap + gap (two prop-order variants)
    'style={{ display: "flex", flexWrap: "wrap", gap: 4 }}':   'flex flex-wrap gap-1',
    'style={{ display: "flex", flexWrap: "wrap", gap: 6 }}':   'flex flex-wrap gap-1.5',
    'style={{ display: "flex", flexWrap: "wrap", gap: 8 }}':   'flex flex-wrap gap-2',
    'style={{ display: "flex", flexWrap: "wrap", gap: 10 }}':  'flex flex-wrap gap-2.5',
    'style={{ display: "flex", flexWrap: "wrap", gap: 12 }}':  'flex flex-wrap gap-3',
    'style={{ display: "flex", flexWrap: "wrap", gap: 16 }}':  'flex flex-wrap gap-4',
    'style={{ display: "flex", gap: 8, flexWrap: "wrap" }}':   'flex gap-2 flex-wrap',
    'style={{ display: "flex", gap: 12, flexWrap: "wrap" }}':  'flex gap-3 flex-wrap',

    # items-center + flexWrap + gap
    'style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 6 }}':
        'flex items-center flex-wrap gap-1.5',
    'style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 }}':
        'flex items-center flex-wrap gap-2',
    'style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 12 }}':
        'flex items-center flex-wrap gap-3',

    # flex-1 + flex combos
    'style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}':
        'flex-1 flex items-center justify-center',
    'style={{ flex: 1, display: "flex", alignItems: "center" }}':
        'flex-1 flex items-center',

    # center/between + marginBottom
    'style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}':
        'flex items-center gap-2 mb-2',
    'style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}':
        'flex items-center gap-2 mb-3',
    'style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}':
        'flex items-center gap-2 mb-4',
    'style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 12 }}':
        'flex items-baseline justify-between gap-3 mb-3',
    'style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}':
        'flex justify-between mb-2',
    'style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}':
        'flex justify-between mb-3',
    'style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}':
        'flex justify-between mb-4',
    'style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}':
        'flex justify-between mb-6',

    # display: inline-flex
    'style={{ display: "inline-flex" }}':                                'inline-flex',
    'style={{ display: "inline-flex", alignItems: "center" }}':          'inline-flex items-center',
    'style={{ display: "inline-flex", alignItems: "center", gap: 2 }}':  'inline-flex items-center gap-0.5',
    'style={{ display: "inline-flex", alignItems: "center", gap: 4 }}':  'inline-flex items-center gap-1',
    'style={{ display: "inline-flex", alignItems: "center", gap: 6 }}':  'inline-flex items-center gap-1.5',
    'style={{ display: "inline-flex", alignItems: "center", gap: 8 }}':  'inline-flex items-center gap-2',
    'style={{ display: "inline-flex", alignItems: "center", gap: 10 }}': 'inline-flex items-center gap-2.5',
    'style={{ display: "inline-flex", alignItems: "center", gap: 12 }}': 'inline-flex items-center gap-3',
    'style={{ display: "inline-flex", gap: 2 }}':   'inline-flex gap-0.5',
    'style={{ display: "inline-flex", gap: 4 }}':   'inline-flex gap-1',
    'style={{ display: "inline-flex", gap: 6 }}':   'inline-flex gap-1.5',
    'style={{ display: "inline-flex", gap: 8 }}':   'inline-flex gap-2',
    'style={{ display: "inline-flex", gap: 10 }}':  'inline-flex gap-2.5',
    'style={{ display: "inline-flex", gap: 12 }}':  'inline-flex gap-3',

    # display: grid
    'style={{ display: "grid" }}':           'grid',
    'style={{ display: "grid", gap: 2 }}':   'grid gap-0.5',
    'style={{ display: "grid", gap: 4 }}':   'grid gap-1',
    'style={{ display: "grid", gap: 6 }}':   'grid gap-1.5',
    'style={{ display: "grid", gap: 8 }}':   'grid gap-2',
    'style={{ display: "grid", gap: 10 }}':  'grid gap-2.5',
    'style={{ display: "grid", gap: 12 }}':  'grid gap-3',
    'style={{ display: "grid", gap: 14 }}':  'grid gap-3.5',
    'style={{ display: "grid", gap: 16 }}':  'grid gap-4',
    'style={{ display: "grid", gap: 20 }}':  'grid gap-5',
    'style={{ display: "grid", gap: 24 }}':  'grid gap-6',
    'style={{ display: "grid", gap: 32 }}':  'grid gap-8',

    # display: none
    'style={{ display: "none" }}':           'hidden',

    # gap standalone
    'style={{ gap: 2 }}':   'gap-0.5',
    'style={{ gap: 4 }}':   'gap-1',
    'style={{ gap: 6 }}':   'gap-1.5',
    'style={{ gap: 8 }}':   'gap-2',
    'style={{ gap: 10 }}':  'gap-2.5',
    'style={{ gap: 12 }}':  'gap-3',
    'style={{ gap: 14 }}':  'gap-3.5',
    'style={{ gap: 16 }}':  'gap-4',
    'style={{ gap: 20 }}':  'gap-5',
    'style={{ gap: 24 }}':  'gap-6',
    'style={{ gap: 32 }}':  'gap-8',

    # width / height
    'style={{ width: "100%" }}':                'w-full',
    'style={{ height: "100%" }}':               'h-full',
    'style={{ width: "100%", height: "100%" }}': 'w-full h-full',

    # margin (on-scale integers only — off-grid numbers left inline)
    'style={{ margin: "0 auto" }}':    'mx-auto',
    'style={{ marginBottom: 2 }}':     'mb-0.5',
    'style={{ marginBottom: 4 }}':     'mb-1',
    'style={{ marginBottom: 6 }}':     'mb-1.5',
    'style={{ marginBottom: 8 }}':     'mb-2',
    'style={{ marginBottom: 10 }}':    'mb-2.5',
    'style={{ marginBottom: 12 }}':    'mb-3',
    'style={{ marginBottom: 14 }}':    'mb-3.5',
    'style={{ marginBottom: 16 }}':    'mb-4',
    'style={{ marginBottom: 20 }}':    'mb-5',
    'style={{ marginBottom: 24 }}':    'mb-6',
    'style={{ marginBottom: 28 }}':    'mb-7',
    'style={{ marginBottom: 32 }}':    'mb-8',
    'style={{ marginTop: 2 }}':        'mt-0.5',
    'style={{ marginTop: 4 }}':        'mt-1',
    'style={{ marginTop: 6 }}':        'mt-1.5',
    'style={{ marginTop: 8 }}':        'mt-2',
    'style={{ marginTop: 10 }}':       'mt-2.5',
    'style={{ marginTop: 12 }}':       'mt-3',
    'style={{ marginTop: 16 }}':       'mt-4',
    'style={{ marginTop: 20 }}':       'mt-5',
    'style={{ marginTop: 24 }}':       'mt-6',
    'style={{ marginTop: 28 }}':       'mt-7',
    'style={{ marginTop: 32 }}':       'mt-8',
    'style={{ marginLeft: 2 }}':       'ml-0.5',
    'style={{ marginLeft: 4 }}':       'ml-1',
    'style={{ marginLeft: 6 }}':       'ml-1.5',
    'style={{ marginLeft: 8 }}':       'ml-2',
    'style={{ marginLeft: 12 }}':      'ml-3',
    'style={{ marginLeft: 16 }}':      'ml-4',
    'style={{ marginLeft: 24 }}':      'ml-6',
    'style={{ marginRight: 2 }}':      'mr-0.5',
    'style={{ marginRight: 4 }}':      'mr-1',
    'style={{ marginRight: 6 }}':      'mr-1.5',
    'style={{ marginRight: 8 }}':      'mr-2',
    'style={{ marginRight: 12 }}':     'mr-3',
    'style={{ marginRight: 16 }}':     'mr-4',
    'style={{ marginRight: 24 }}':     'mr-6',

    # padding (bare integer and quoted-px on-scale)
    'style={{ padding: 4 }}':            'p-1',
    'style={{ padding: 8 }}':            'p-2',
    'style={{ padding: 12 }}':           'p-3',
    'style={{ padding: 16 }}':           'p-4',
    'style={{ padding: 20 }}':           'p-5',
    'style={{ padding: 24 }}':           'p-6',
    'style={{ padding: "4px" }}':        'p-1',
    'style={{ padding: "8px" }}':        'p-2',
    'style={{ padding: "12px" }}':       'p-3',
    'style={{ padding: "12px 12px" }}':  'p-3',
    'style={{ padding: "16px" }}':       'p-4',
    'style={{ padding: "20px" }}':       'p-5',
    'style={{ padding: "24px" }}':       'p-6',
    'style={{ paddingTop: 4 }}':         'pt-1',
    'style={{ paddingTop: 8 }}':         'pt-2',
    'style={{ paddingTop: 12 }}':        'pt-3',
    'style={{ paddingTop: 16 }}':        'pt-4',
    'style={{ paddingTop: 20 }}':        'pt-5',
    'style={{ paddingTop: 24 }}':        'pt-6',
    'style={{ paddingBottom: 4 }}':      'pb-1',
    'style={{ paddingBottom: 8 }}':      'pb-2',
    'style={{ paddingBottom: 12 }}':     'pb-3',
    'style={{ paddingBottom: 16 }}':     'pb-4',
    'style={{ paddingBottom: 20 }}':     'pb-5',
    'style={{ paddingBottom: 24 }}':     'pb-6',
    'style={{ paddingLeft: 4 }}':        'pl-1',
    'style={{ paddingLeft: 8 }}':        'pl-2',
    'style={{ paddingLeft: 12 }}':       'pl-3',
    'style={{ paddingLeft: 16 }}':       'pl-4',
    'style={{ paddingLeft: 24 }}':       'pl-6',
    'style={{ paddingRight: 4 }}':       'pr-1',
    'style={{ paddingRight: 8 }}':       'pr-2',
    'style={{ paddingRight: 12 }}':      'pr-3',
    'style={{ paddingRight: 16 }}':      'pr-4',
    'style={{ paddingRight: 24 }}':      'pr-6',

    # typography helpers
    'style={{ textAlign: "center" }}':          'text-center',
    'style={{ textAlign: "left" }}':            'text-left',
    'style={{ textAlign: "right" }}':           'text-right',
    'style={{ fontWeight: 400 }}':              'font-normal',
    'style={{ fontWeight: 500 }}':              'font-medium',
    'style={{ fontWeight: 600 }}':              'font-semibold',
    'style={{ fontWeight: 700 }}':              'font-bold',
    'style={{ fontStyle: "italic" }}':          'italic',
    'style={{ lineHeight: 1 }}':                'leading-none',
    'style={{ lineHeight: 1.25 }}':             'leading-tight',
    'style={{ lineHeight: 1.5 }}':              'leading-normal',
    'style={{ textTransform: "uppercase" }}':   'uppercase',
    'style={{ textTransform: "lowercase" }}':   'lowercase',
    'style={{ textTransform: "capitalize" }}':  'capitalize',
    'style={{ userSelect: "none" }}':           'select-none',
    'style={{ whiteSpace: "nowrap" }}':         'whitespace-nowrap',
    'style={{ whiteSpace: "pre-wrap" }}':       'whitespace-pre-wrap',

    # cursor
    'style={{ cursor: "pointer" }}':    'cursor-pointer',
    'style={{ cursor: "default" }}':    'cursor-default',
    'style={{ cursor: "not-allowed" }}': 'cursor-not-allowed',
    'style={{ cursor: "move" }}':       'cursor-move',
    'style={{ cursor: "grab" }}':       'cursor-grab',
    'style={{ cursor: "grabbing" }}':   'cursor-grabbing',
    'style={{ cursor: "crosshair" }}':  'cursor-crosshair',

    # misc visual
    'style={{ objectFit: "cover" }}':    'object-cover',
    'style={{ objectFit: "contain" }}':  'object-contain',
    'style={{ borderRadius: "50%" }}':   'rounded-full',
    'style={{ appearance: "none" }}':    'appearance-none',
    'style={{ listStyle: "none" }}':     'list-none',
    'style={{ pointerEvents: "none" }}': 'pointer-events-none',
    'style={{ pointerEvents: "auto" }}': 'pointer-events-auto',
    'style={{ visibility: "hidden" }}':  'invisible',
}

# ── Admin-surface color / radius / shadow patterns (Y4-unlocked) ─────────────
# Per Y4 canonical doc §4.3: only apply to admin/**, talent/**, client/**
# dashboards.  Pass --no-admin-colors for marketing/* and app/(public)/**.
# Requires exact alias `COLORS` / `RADIUS` at call-site (not C.*, HQ.*, etc.).
# Ambiguous hex #0F4F3E (accent == brand) is left inline — Y2 lane.
EXACT_ADMIN = {
    # color: COLORS.* → text-admin-*
    'style={{ color: COLORS.ink }}':            'text-admin-ink',
    'style={{ color: COLORS.inkMuted }}':        'text-admin-ink-muted',
    'style={{ color: COLORS.inkDim }}':          'text-admin-ink-dim',
    'style={{ color: COLORS.accent }}':          'text-admin-accent',
    'style={{ color: COLORS.accentDeep }}':      'text-admin-accent-deep',
    'style={{ color: COLORS.green }}':           'text-admin-green',
    'style={{ color: COLORS.amber }}':           'text-admin-amber',
    'style={{ color: COLORS.amberDeep }}':       'text-admin-amber-deep',
    'style={{ color: COLORS.red }}':             'text-admin-red',
    'style={{ color: COLORS.coral }}':           'text-admin-coral',
    'style={{ color: COLORS.coralDeep }}':       'text-admin-coral-deep',
    'style={{ color: COLORS.indigo }}':          'text-admin-indigo',
    'style={{ color: COLORS.indigoDeep }}':      'text-admin-indigo-deep',
    'style={{ color: COLORS.brand }}':           'text-admin-brand',
    'style={{ color: COLORS.brandDeep }}':       'text-admin-brand-deep',
    'style={{ color: COLORS.success }}':         'text-admin-success',
    'style={{ color: COLORS.successDeep }}':     'text-admin-success-deep',
    'style={{ color: COLORS.critical }}':        'text-admin-critical',
    'style={{ color: COLORS.criticalDeep }}':    'text-admin-critical-deep',
    'style={{ color: COLORS.royal }}':           'text-admin-royal',
    'style={{ color: COLORS.royalDeep }}':       'text-admin-royal-deep',
    'style={{ color: COLORS.fill }}':            'text-admin-fill',
    'style={{ color: COLORS.fillDeep }}':        'text-admin-fill-deep',

    # background: COLORS.* → bg-admin-*
    'style={{ background: COLORS.surface }}':      'bg-admin-surface',
    'style={{ background: COLORS.surfaceAlt }}':   'bg-admin-surface-alt',
    'style={{ background: COLORS.card }}':         'bg-admin-card',
    'style={{ background: COLORS.accent }}':       'bg-admin-accent',
    'style={{ background: COLORS.accentSoft }}':   'bg-admin-accent-soft',
    'style={{ background: COLORS.accentDeep }}':   'bg-admin-accent-deep',
    'style={{ background: COLORS.brand }}':        'bg-admin-brand',
    'style={{ background: COLORS.brandSoft }}':    'bg-admin-brand-soft',
    'style={{ background: COLORS.brandDeep }}':    'bg-admin-brand-deep',
    'style={{ background: COLORS.successSoft }}':  'bg-admin-success-soft',
    'style={{ background: COLORS.criticalSoft }}': 'bg-admin-critical-soft',
    'style={{ background: COLORS.amberSoft }}':    'bg-admin-amber-soft',
    'style={{ background: COLORS.coralSoft }}':    'bg-admin-coral-soft',
    'style={{ background: COLORS.indigoSoft }}':   'bg-admin-indigo-soft',
    'style={{ background: COLORS.royalSoft }}':    'bg-admin-royal-soft',
    'style={{ background: COLORS.fillSoft }}':     'bg-admin-fill-soft',
    'style={{ background: COLORS.fill }}':         'bg-admin-fill',
    'style={{ background: COLORS.fillDeep }}':     'bg-admin-fill-deep',
    'style={{ background: COLORS.navyBg }}':       'bg-admin-navy-bg',
    'style={{ background: COLORS.green }}':        'bg-admin-green',
    'style={{ background: COLORS.red }}':          'bg-admin-red',
    # backgroundColor variant
    'style={{ backgroundColor: COLORS.surface }}':     'bg-admin-surface',
    'style={{ backgroundColor: COLORS.card }}':        'bg-admin-card',
    'style={{ backgroundColor: COLORS.accent }}':      'bg-admin-accent',
    'style={{ backgroundColor: COLORS.accentSoft }}':  'bg-admin-accent-soft',
    'style={{ backgroundColor: COLORS.brand }}':       'bg-admin-brand',
    'style={{ backgroundColor: COLORS.successSoft }}': 'bg-admin-success-soft',
    'style={{ backgroundColor: COLORS.criticalSoft }}':'bg-admin-critical-soft',

    # borderColor: COLORS.* → border-admin-*
    'style={{ borderColor: COLORS.border }}':       'border-admin-border',
    'style={{ borderColor: COLORS.borderSoft }}':   'border-admin-border-soft',
    'style={{ borderColor: COLORS.borderStrong }}': 'border-admin-border-strong',

    # boxShadow: COLORS.shadow* → shadow-admin-*
    'style={{ boxShadow: COLORS.shadow }}':      'shadow-admin-rest',
    'style={{ boxShadow: COLORS.shadowHover }}': 'shadow-admin-hover',

    # borderRadius: RADIUS.* → rounded-admin-*
    'style={{ borderRadius: RADIUS.sm }}': 'rounded-admin-sm',
    'style={{ borderRadius: RADIUS.md }}': 'rounded-admin-md',
    'style={{ borderRadius: RADIUS.lg }}': 'rounded-admin-lg',
    'style={{ borderRadius: RADIUS.xl }}': 'rounded-admin-xl',
}


def build_pattern(src: str) -> re.Pattern:
    """
    Match <htmltag STYLE> where STYLE is the sole attribute — only optional
    whitespace between the tag name and the style attr, and only optional
    whitespace before the closing >.
    """
    return re.compile(r'<(' + HTML + r')\s+' + re.escape(src) + r'\s*>')


LAYOUT_PATS = [(build_pattern(s), cls) for s, cls in EXACT_LAYOUT.items()]


# ── Y2 multi-property splitter ───────────────────────────────────────────────
# Extends Y1's sole-attribute restriction.  Given `style={{ A, B, C }}` on a
# bare HTML element (no other attributes / no existing className), pull every
# attribute that maps to a known admin utility into a `className=`, keep the
# rest inline.  Subsumes Y1's single-attr ADMIN_PATS (when every attr converts,
# the result has no `style={{}}` left, matching Y1's behaviour exactly).
#
# Conservative rules:
#   - Element must be a bare HTML tag with `style={{ ... }}` as the SOLE attr.
#     (Same surface area as the layout codemod.)
#   - Attribute value must be EXACTLY `COLORS.<key>` / `RADIUS.<key>` —
#     no ternaries, template literals, function calls, fallback `??`, etc.
#     Anything more complex is left inline.
#   - Off-grid attrs (fontSize: 13, marginTop: 2) stay inline.  Y2 only pulls
#     admin-color/radius/shadow attrs out.

STYLE_ELEM_RE = re.compile(
    r'<(' + HTML + r')\s+style=\{\{\s*(.*?)\s*\}\}\s*>',
    re.DOTALL,
)

# Build (attr_js, token_key) → utility map from EXACT_ADMIN single-attr table.
VALID_ATTR_KEY: dict[tuple[str, str], str] = {}
_ADMIN_KEY_RE = re.compile(
    r'^style=\{\{\s*(\w+):\s*(COLORS|RADIUS)\.(\w+)\s*\}\}$'
)
for _src, _util in EXACT_ADMIN.items():
    _m = _ADMIN_KEY_RE.match(_src)
    if _m:
        VALID_ATTR_KEY[(_m.group(1), _m.group(3))] = _util


def _split_style_attrs(inner: str) -> list[str]:
    """Split `key: value, key: value` at top-level commas.  Tracks brace/
    bracket/paren depth + string + template-literal state so commas inside
    nested values are not mistaken for separators."""
    parts: list[str] = []
    buf: list[str] = []
    depth = 0
    in_str: str | None = None
    in_back = False
    i = 0
    while i < len(inner):
        c = inner[i]
        if in_str:
            buf.append(c)
            if c == '\\' and i + 1 < len(inner):
                buf.append(inner[i + 1])
                i += 2
                continue
            if c == in_str:
                in_str = None
        elif in_back:
            buf.append(c)
            if c == '`':
                in_back = False
        elif c == '`':
            in_back = True
            buf.append(c)
        elif c in ('"', "'"):
            in_str = c
            buf.append(c)
        elif c in '({[':
            depth += 1
            buf.append(c)
        elif c in ')}]':
            depth -= 1
            buf.append(c)
        elif c == ',' and depth == 0:
            parts.append(''.join(buf).strip())
            buf = []
        else:
            buf.append(c)
        i += 1
    tail = ''.join(buf).strip()
    if tail:
        parts.append(tail)
    return parts


_ATTR_RE = re.compile(
    r'^(color|background|backgroundColor|borderColor|borderRadius|boxShadow):\s*'
    r'(COLORS|RADIUS)\.([a-zA-Z]+)\s*$'
)


def split_admin_multi(text: str) -> tuple[str, int]:
    """Pull admin-token attrs out of multi-property inline styles."""
    converted = 0

    def repl(m: re.Match) -> str:
        nonlocal converted
        tag = m.group(1)
        inner = m.group(2)
        if not inner.strip():
            return m.group(0)
        try:
            parts = _split_style_attrs(inner)
        except Exception:
            return m.group(0)
        kept: list[str] = []
        classes: list[str] = []
        for p in parts:
            am = _ATTR_RE.match(p)
            if am:
                util = VALID_ATTR_KEY.get((am.group(1), am.group(3)))
                if util:
                    classes.append(util)
                    continue
            kept.append(p)
        if not classes:
            return m.group(0)
        converted += len(classes)
        cls_attr = f' className="{" ".join(classes)}"'
        if kept:
            return f'<{tag} style={{{{ {", ".join(kept)} }}}}{cls_attr}>'
        return f'<{tag}{cls_attr}>'

    new = STYLE_ELEM_RE.sub(repl, text)
    return new, converted


def process(text: str, admin_colors: bool) -> tuple[str, int]:
    n = 0
    # Layout (sole-attr exact matches) — unchanged from Y1.
    for pat, cls in LAYOUT_PATS:
        def repl(m: re.Match, cls: str = cls) -> str:
            nonlocal n
            n += 1
            return f'<{m.group(1)} className="{cls}">'
        text = pat.sub(repl, text)
    # Admin colors (Y2: multi-prop splitter; subsumes Y1's single-attr table).
    if admin_colors:
        text, k = split_admin_multi(text)
        n += k
    return text, n


def main() -> None:
    args = sys.argv[1:]
    apply        = '--apply' in args
    no_admin_col = '--no-admin-colors' in args
    admin_colors = not no_admin_col

    excludes: list[str] = []
    i = 0
    while i < len(args):
        if args[i] == '--exclude' and i + 1 < len(args):
            excludes.append(args[i + 1])
            i += 2
        else:
            i += 1

    paths = [a for a in args
             if a not in ('--apply', '--no-admin-colors', '--exclude')
             and a not in excludes]

    total, files = 0, 0
    for d in paths:
        p = pathlib.Path(d)
        fpaths = sorted(p.rglob('*.tsx')) if p.is_dir() else [p]
        for fp in fpaths:
            if any(x in str(fp) for x in excludes):
                continue
            orig = fp.read_text()
            new, n = process(orig, admin_colors)
            if n:
                total += n
                files += 1
                print(f'{n:4d}  {fp}')
                if apply:
                    fp.write_text(new)

    mode = 'APPLIED' if apply else 'DRY-RUN'
    color_note = '' if admin_colors else ' (layout-only; --no-admin-colors)'
    print(f'--- {mode}{color_note}: {total} objects across {files} files ---')


if __name__ == '__main__':
    main()
