# Language bar × service/chat dock — fix notes

**PR:** draft [#2527](https://github.com/orantene/impronta-app/pull/2527) — branch `cursor/language-bar-dock-yield-0f6c`  
**Choice:** yield (hide) while dock/pill is up — not remove the feature  
**SHA tip (branch):** `847659aaa` — booking CSS pin → `a338ff242c45b5d20172ae965eb94651dc0e9ac60c3e5b0c5efa16345bdf148e`  
**CI:** green on tip (8/8)

## What was wrong

`LocaleSuggestionBannerClient` is `position: fixed; bottom: 0; z-50`. Maison / services-catalog chrome uses `.cb-bar` (“See services” pill + pink chat) and `.cb-dock` at `z-index` 80–81. The language strip sat **behind** that chrome, so Switch / No thanks could not be reached — the prompt looked stuck.

## What we did

Matched the existing consent-banner yield in `web/src/components/public-booking/catalog-booking-styles.ts`:

```css
body:has(.cb-dock[data-show="true"]) [data-locale-suggestion],
body:has(.cb-bar[data-show="true"]) [data-locale-suggestion] { display: none }
```

(same compound rule as `[data-consent-banner]`). Documented on the banner client. Static assertion in `selection-dock-chrome.test.tsx`.

Talent bilingual sites already have `PublicLanguageToggle` (ES/EN) in the header — that remains the control while the dock owns the bottom edge. The suggestion banner still paints on public surfaces **without** an up dock/bar.

## Gates run

| Gate | Result |
|---|---|
| `npm run typecheck` | PASS (`NODE_OPTIONS=--max-old-space-size=12288`; 8GB queue OOM on this VM) |
| `npm run lint` | PASS |
| `selection-dock-chrome.test.tsx` | 14/14 PASS |

## How to verify on Maison / demo

1. Open a bilingual Maison host, e.g. `https://camila-nails.tulala.digital` or `https://book-jorgelina.tulala.digital` (or a QA pool alias of this PR’s preview).
2. Prefer a browser language that is **not** the URL locale (or clear site cookies except as needed), and ensure `locale-suggest-dismissed` is absent so the suggestion would otherwise fire.
3. With the bottom **See services** pill / chat dock visible: the dark “Would you rather read…” strip must **not** appear under or behind it.
4. Switch language via the header **ES / EN** control — still works.
5. Optional: on a bilingual marketing/directory page with no `.cb-bar`/`.cb-dock`, the suggestion strip may still show at the bottom and dismiss with No thanks.

## Files

- `web/src/components/public-booking/catalog-booking-styles.ts`
- `web/src/components/locale-suggestion-banner-client.tsx`
- `web/src/components/public-booking/selection-dock-chrome.test.tsx`
