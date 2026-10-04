# Maison website — PR 3 evidence

**Branch:** `cursor/maison-pr3-completion-8b57`  
**Closes:** W17–W23  
**Base:** `754ad546a` (PR2 W9–W16)

## Delivered

| W | Work | Proof |
|---|---|---|
| W17 | One completion source for website unlock | `WebsiteRewardControl` / Today card / eligibility panel all read `getWebsiteEligibility` — never checklist `%` |
| W18 | Profession-aware requirement sets | `website-eligibility.ts` modes `bookings` / `inquiries` / `quotes` + `inferWebsiteWorkingMode` + tests |
| W19 | Unlock threshold **100%** everywhere | `website-reward.ts` `< 100`; tests assert 80–99 stay unfinished |
| W20 | Header states Unlock / Activate / Finish / Website live | `websiteRewardCopy` §4.1 titles + control actions |
| W21 | Finish with AI: no large black chat bubbles | `FinishWithAiPanel.tsx` + `finish-with-ai-chrome.static.test.ts` |
| W22 | Unlocked card: Activate + suggested address | `WebsiteTodayUnlockCard` + nudge gated on `eligibility.unlocked` |
| W23 | Live never shows Unlock | `websiteRewardState` published → `live` first; copy test; Today card returns null when published |

## Gates

- `npm run typecheck`
- `npm run lint`
- Unit: `website-reward.test.ts`, `website-eligibility.test.ts`, `finish-with-ai-chrome.static.test.ts`, `site-activation-state.test.ts`

## Migrations

None in PR 3.

## Notes

- Jor Beauty live Unlock check remains a PR9 read-only e2e (architecture covered here).
- Visual mz_today / mz_ai pixel match **BLOCKED** until owner PDF/prototype land — chrome contract + tests ship now.
