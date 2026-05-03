# ICONS.md — Tulala Admin Icon Registry

> All icons are inline SVG via the `<Icon name="..." size={n} color="..." stroke={1.8} />` primitive.  
> Source: `_primitives.tsx → function Icon({ name, ... })`.

---

## 1. Icon Inventory

| Name | Visual description | When to use | When NOT to use |
|---|---|---|---|
| `arrow-right` | Right-pointing arrow | Navigation forward, "view detail", pagination next | Generic "go" when chevron is more appropriate |
| `chevron-right` | Right-angled bracket › | Row disclosure (table row → detail), breadcrumb separator, menu item with sub-menu | Full navigation arrow |
| `chevron-down` | Downward angled bracket ˅ | Expanded/collapsed toggle, dropdown opener | Navigation |
| `x` | × cross | Close button, clear field, remove tag | Delete/destroy actions (use trash icon instead if one is added) |
| `lock` | Padlock | Premium tier gate, restricted content, "requires upgrade" | Generic "private" — use only for upgrade moments |
| `check` | Checkmark ✓ | Completed, approved, confirmed, success | "Select" or checkbox states |
| `plus` | + cross | Add new item, create, invite | Remove, toggle |
| `sparkle` | 4-spoke star ✦ | AI assist, magic/auto features, "all clear" empty states, premium | General stars or ratings (use `star` instead) |
| `external` | Box with arrow out ↗ | Link that opens in new tab | Same-page navigation |
| `search` | Magnifying glass | Search inputs, search empty states, "find" actions | Navigation or filtering without text input |
| `filter` | Funnel lines | Active filter state, filter trigger | Sorting |
| `info` | Circle with ℹ | Informational hint, tooltip trigger, system status | Warnings (use `alert`) or errors (use `alert` + red) |
| `user` | Person silhouette | Individual talent, single person, "my profile" | Groups or teams |
| `team` | Two people | Group, team, multi-person roster action | Single person |
| `globe` | Globe with meridians | Public page, website URL, public-facing content | International/language settings |
| `palette` | Artist palette | Branding, theme customization, design settings | Generic settings |
| `credit` | Credit card | Payment method, billing, payout | Financial data in general |
| `settings` | Gear/cog | Configuration, preferences, workspace settings | Any non-settings context |
| `calendar` | Month grid | Booking dates, scheduling, calendar page | Any date display that isn't interactive |
| `mail` | Envelope | Messages, inbox, email, send actions | Notifications (use `bell`) |
| `bolt` | Lightning bolt ⚡ | System actions, automation, fast/instant actions, general "activity" | Warnings (use `alert`) |
| `circle` | Hollow circle ○ | Bullet point, step indicator, status dot outline | Status dot (use `StatDot` component instead) |
| `alert` | Triangle with ! | Warning, error, something needs attention | Informational hints (use `info`) |
| `star` | 5-pointed star ★ | Rating, favourite, featured | AI/premium (use `sparkle`) |
| `bell` | Notification bell 🔔 | Notifications, alerts panel | Messages/inbox (use `mail`) |
| `moon` | Crescent moon | Dark mode, quiet hours, sleep/away | Any other "mode" |
| `map-pin` | Location pin 📍 | Location, city, travel availability, shooting location | Generic "place" decorations |
| `archive` | Archive box | Archive action, archived state, bulk archive | Delete/trash |

---

## 2. Size Guidelines

| Context | Size | Stroke |
|---|---|---|
| Nav rail icons | 18–20 | 1.6 |
| Inline body text icons | 14 | 1.8 |
| Button icons | 15–16 | 1.7 |
| Card/tile icons (solo) | 20–24 | 1.6 |
| ActivityFeedItem icons | 13 | 1.7 |
| Empty state icons | 24–28 | 1.5 |
| Status chip icons | 10–12 | 1.8 |
| Avatar fallback icon | 18 | 1.6 |

---

## 3. Color Conventions

| Context | Color token |
|---|---|
| Default icon | `COLORS.inkMuted` |
| Active nav item | `COLORS.accent` |
| Success icon | `COLORS.success` |
| Warning icon | `COLORS.amber` |
| Critical/error icon | `COLORS.critical` |
| Premium/locked icon | `COLORS.royal` |
| White icon on dark bg | `#fff` |
| Muted/disabled icon | `COLORS.inkDim` |

---

## 4. Icon Combinations

### Icon + label (inline)

```tsx
<span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
  <Icon name="calendar" size={14} color={COLORS.inkMuted} stroke={1.8} />
  <span>May 8 · Rome</span>
</span>
```

### Icon-only button (with accessible label)

```tsx
<button type="button" aria-label="Close">
  <Icon name="x" size={16} color={COLORS.inkMuted} />
</button>
```

### Icon in status chip

```tsx
<span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
  <Icon name="check" size={11} color={COLORS.success} stroke={2} />
  <span>Confirmed</span>
</span>
```

### Icon in ActivityFeedItem

Pass `iconName` for a named icon, or `icon` for an emoji:

```tsx
// Named icon (preferred for admin actions):
<ActivityFeedItem iconName="check" actor="Client" action="confirmed booking" target="" timestamp="1h ago" />

// Emoji icon (for timeline events with contextual symbols):
<ActivityFeedItem icon="✅" actor="Client" action="confirmed booking" target="" timestamp="1h ago" />
```

---

## 5. Icon Selection Quick Reference

| I want to show... | Icon |
|---|---|
| An action happened (generic) | `bolt` |
| A message was sent | `mail` |
| Something was completed | `check` |
| A booking was confirmed | `check` |
| A date/time | `calendar` |
| A person's profile | `user` |
| A group/team | `team` |
| A setting was changed | `settings` |
| Something was archived | `archive` |
| A warning | `alert` |
| An informational note | `info` |
| AI-generated content | `sparkle` |
| A locked/premium feature | `lock` |
| A payment/billing item | `credit` |
| A public-facing URL | `globe` |
| A search result | `search` |
| A notification | `bell` |
| Adding something | `plus` |
| Removing/closing | `x` |

---

## 6. Icons NOT in the Registry (do not invent)

If you need an icon not in the list above, add it to `_primitives.tsx → Icon` and document it here.

Do not:
- Embed random SVG strings inline in component files
- Use emoji as primary icons in admin UI (only acceptable in user-generated content and timeline context markers)
- Use icon fonts or image assets for icons

When adding a new icon:
1. Add the `case` to the `Icon` switch statement in `_primitives.tsx`
2. Add the type to the `name` union
3. Add a row in the inventory table above with use/not-use guidance
