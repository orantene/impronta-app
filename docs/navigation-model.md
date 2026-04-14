# Navigation model (Phase 8.5)

## `navigation_items`

- `menu_key`: `header` | `footer` (extend as needed).
- `label`, `locale`, `href`, `sort_order`, `visible`, optional `parent_id`, `target`, optional `role_visibility`.

## i18n

- No parallel locale universe: extend existing `web/src/i18n/` patterns; document fallback (e.g. EN default).

## Anti-duplication

Before adding a nav editor, audit existing hardcoded nav in layouts — outcomes in `admin-content-ownership.md`.
