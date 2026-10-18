# PKG-7 card triage, 2026-10-18

Scope: every Notion card with Status "Building - Dev & Action Taking" that is not in PKG-1..6 and not in an open PR.
Skipped by order: TUL-934, TUL-984, TUL-52, TAL-93938. Legend: OPEN-PR = fix is in an open PR, pending merge; ON-MAIN = fix already merged; WORK = real work done in this PR; PARKED = blocker named.

## Real work (this PR)

| Card | Title (short) | Result |
|---|---|---|
| TUL-973 | QA Journeys EN page shows Spanish section copy | WORK: page-less workspace home was composed with a hardcoded `es` base; now uses the tenant default locale (TUL-506 rule). Not browser-verified. |
| TUL-711 | Workspace public ES polish (EXP7) | WORK for the last open item: rosterless `/w/<slug>/directory` redirected to the platform `/book`; now keeps the `/w/<slug>` base. Scroll cue, Skip to content, titles: ON-MAIN (#3828, #3920). "Empty sections public copy": PARKED, product call (keep). |
| TUL-1227 | Fresh talent: dashboard stuck on "Loading your space"; name doubled | No code change. The stall is a 45-50 s first render (no seed-hop loop, see #3977 body): OPEN-PR #3981 (dashboard speed, TUL-1177 class) and #3977 (hardening). Doubled name: not reproducible from code (one fact write, `person.professional_name`, trimmed once); needs a staging re-run. |

## Covered by an open PR (no work here)

| Card | PR |
|---|---|
| 589, 591, 697, 702, 721, 729 | #3996 |
| 808, 810, 815, 818, 819, 841, 842, 846 | #3995 |
| 1013, 1024, 1075, 1246 | #3983 |
| 1068 | #3983 + #3988 |
| 1070 | #3983 |
| 1177, 1182, 1240, 1244, 1245 | #3981 |
| 1176 | merged #3876, only a stale Failed flag |
| 817, 829, 830, 831, 835 | #3982 (see parked) |
| 36, 43, 533, 727, 828, 976, 1061, 1243 / 146..1248 / 1022..933 / 621..1256 / 39..1261 / 1003..1249 | PKG-1..6 (#4000-#4005) |

## Fix already on main (needs staging QA, not code)

| Card | Evidence |
|---|---|
| 875 | #3828 merged: ES directory cards link to `/es/t/<code>`. The remaining "unprefixed `/t/<code>` follows the cookie" is the deliberate TUL-1187 rule (`resolve-request-locale.ts`); reversing it is a product decision, PARKED (recommendation: keep the cookie rule, since the link half is fixed). |
| 662 | #3823 merged, PASS on staging; AI cost switch is Oran's. |
| 751 | #3807 merged (write side). Backfill of 140 prod rows is a prod data write: PARKED. |
| 1131 | #3834 and #3855 merged, guards in lane. Only the Failed flag is stale. |
| 984 | skipped by order. |

## Group tasks and QA batches (not dev work)

15 (themes, paused by Oran), 49, 68, 75, 99, 100, 101, 102, 104, 110 (themes paused), 111, 112, 532 (PKG-6), 1055, 1060, 1062. These are containers; their children are tracked above or in PKG-1..6.

## Parked with exact blocker

| Card | Blocker | Who |
|---|---|---|
| 15, 88, 110, 165, 639 | Themes paused ("do not work until he unblocks") | Oran |
| 186 | Stripe MX webhook proof needs a live test event on production | Oran / money |
| 304 | Real Turnstile check solved by hand | Oran |
| 540 | Needs a staging trace of the Batch 19 run | QA with staging access |
| 700 | Cannot reproduce from code; needs perf trace of the calendar on a fresh workspace | QA |
| 746 | 11 English template descriptions and 3 site addresses not locatable in repo | Oran (content) |
| 752, 1017 | Oran adds Vercel secret / Cloudflare Turnstile setup | Oran |
| 751 | Prod backfill (migration 20261231381300) via Production Migration Manager | Oran GO |
| 814, 911 | Supabase Send Email hook is enabled by Oran; remaining is a staging retest of ES/EN subjects after the next build | QA |
| 817, 829, 830, 831, 835 | Billing: needs Stripe TEST prices seeded on staging (#3982) and money review; computation changes not allowed in this package | Oran / money owner |
| 896 | Staging data (confirmation already shows reference + place) | QA |
| 1020 | Prod user anonymize (data write) via Production Migration Manager | Oran GO |
| 1030 | Vercel env cleanup, Oran's | Oran |
| 1180 | Folio release rows cleanup, paused by Oran, prod data | Oran |
| 1181 | Needs a measured cold-render probe on a build | Dev with a build slot |
| 1237 | Cannot reproduce from code; links resolve through locale helpers | QA re-run |
| 1251 | Cannot reproduce from code; mode switch is a plain button | QA re-run |
| 934 | skipped by order (promos, Oran) | Oran |
