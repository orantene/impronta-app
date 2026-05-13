# Adoption notes — premium-execution primitives

Tier 1 of the marathon shipped a handful of UI primitives in `web/src/lib/ui/`.
This doc explains the canonical adoption pattern + records which surfaces
have migrated.

## Primitives

| Primitive | What it replaces | Adoption status |
|---|---|---|
| `IconButton` | Inline `<button>` with `<Icon>` only | Pattern established (see below); incremental migration |
| `SaveStateIndicator` | Inline "Saving…" / "Saved" / "Unsaved" copy | Used by C.7 prefs drawer; other surfaces incremental |
| `HoverActions` + `data-hover-row` | Inline `opacity:0` / `:hover { opacity:1 }` | Pattern established; incremental |
| `STATUS_TONES` | Inline `statusTone()` hex pairs | C.6 lint baseline; incremental |
| `formatMessageTime` / `useRelativeTime` | Inline `new Date().toLocaleString` | Pattern established; incremental |
| `personalizeEmpty` | Inline empty-state copy | Available for adoption |
| `DisabledReason` | Disabled buttons with bespoke title | Available for adoption |
| `useFormPersistence` | Per-form localStorage drafts | F.9 inquiry form; talent-location onboarding |
| `useUnsavedChangesGuard` | Inline `beforeunload` handlers | Available for adoption |
| `useOptimisticMutation` | Pin / archive / mark-read toggles | Available for adoption |
| `TalentStatusChip` | Inline workflow_status pills | Available for adoption |

## Why incremental, not big-bang

Existing inline icon-buttons have bespoke sizing (22, 28, 32, 34, 40 px)
tuned to tight layouts — checklists, drawer headers, message composer
bars. A naive sweep to a 44px primitive breaks visual rhythm. Real
adoption happens per-surface during natural refactors of that surface,
not as a one-shot codemod.

The primitive's job is to:
1. Make new buttons consistent without thinking
2. Catch missing aria-labels at compile time (TS-required)
3. Give a clean migration target when a surface gets its next polish pass

## Migration pattern (IconButton example)

Before:
```tsx
<button
  type="button"
  onClick={onClose}
  aria-label="Close"
  style={{ width: 32, height: 32, ...inlineStyle }}
>
  <Icon name="x" size={14} />
</button>
```

After (when the parent surface gets its next polish pass):
```tsx
<IconButton aria-label="Close" onClick={onClose} size={32}>
  <Icon name="x" size={14} />
</IconButton>
```

If the surface tolerates a 44px button, drop the `size` prop and the
primitive defaults to WCAG min touch target.

## What is NOT done

- The full inline-button sweep across `talent.tsx` (~30+ candidates) and
  `workspace.tsx` (~20+ candidates). These migrate when those shells
  get their next polish session.
- Migrating inline `statusTone()` helpers in inquiries/today pages to
  `STATUS_TONES` — same reasoning; the pages already pass WCAG AA today
  with the inline values.
- Replacing every `new Date(...).toLocaleString` with `formatMessageTime`
  — most existing call sites have tight format choices that don't
  one-to-one map onto the canonical helper.

## Decision rule

When you touch a file for any reason (bug fix, feature, polish):
- if you're already editing a button → consider migrating to `IconButton`
- if you're already touching a chip/badge → consider `STATUS_TONES`
- if you're already touching a timestamp → consider `formatMessageTime`

Otherwise leave existing patterns in place. The premium-execution-runbook
Tier 1 marathon shipped the primitives; the long tail of adoption is
normal codebase hygiene, not a separate ticket.
