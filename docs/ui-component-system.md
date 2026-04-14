# UI component system (Phase 8.9)

## Implementation status

**Partial:** The **ten** primitive modules exist under `web/src/components/ui/`. Phase **8.9** is complete only after **adoption** on real surfaces (internals only, layout frozen). **`docs/acceptance-checklist.md`** defines two **hard rules**: (1) **≥3** high-traffic surfaces; (2) **at least one legacy replacement each** for **card**, **chips**, **skeleton**, **empty**, and **drawer** — prevents shipping unused primitives. Remove or decision-log duplicate ad-hoc patterns. **Recommended order:** after **8.6A**, before **8.8** wiring.

## Location

`web/src/components/ui/*`

## Primitives

| File | Exports | Role |
|------|---------|------|
| `card.tsx` | `Card`, `CardHeader`, `CardBody`, `CardFooter` | Shared card shell |
| `filter-chips.tsx` | `FilterChips`, `FilterChip` | Directory filters — **not** AI chips |
| `section-header.tsx` | `SectionHeader` | Section titles + actions |
| `empty-state.tsx` | `EmptyState` | No results / empty |
| `skeleton.tsx` | `Skeleton`, `SkeletonCard`, `SkeletonList` | Loading |
| `drawer.tsx` | `Drawer`, `Panel`, `SidePanel` | Sheet-based panels |
| `badge.tsx` | `Badge`, `StatusBadge`, `TagBadge` | Labels |
| `inline-toolbar.tsx` | `InlineToolbar` | Edit toolbars |
| `action-bar.tsx` | `ActionBar` | Header actions |
| `list-row.tsx` | `ListRow` | Tables / lists |

## Adoption

**Internals only** — do not move directory/profile/admin grid shells. Migrate duplicated markup gradually; exceptions → `decision-log.md`.

## Cross-link

`ai-component-system.md` — AI layer composes this tree.
