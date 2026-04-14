# Admin content ownership (Phase 8.5)

## Audit summary (baseline)

| Area | Current owner | 8.6 action |
|------|---------------|------------|
| Talent / directory data | Admin → Fields, Directory filters, Taxonomy, Locations | **Extend**, do not duplicate |
| Translations | Admin → Translations | **Extend** i18n |
| Site toggles | Admin → Settings (`public.settings`) | **Keep**; Site Settings System links here until split |
| Media (talent) | Admin → Media | **Distinct** from future CMS media bucket |
| Taxonomy (operational) | Admin → Taxonomy | CMS may **reference** for editorial; not source for matching |

## Rule

If a capability already exists, **link or extend** — no second manager without decision-log exception.
