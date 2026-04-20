# Open Decisions Tracker (O1–O7)

Live tracker for the seven open decisions that **block Phase 1**. Source: Plan §25 + Decision Log §27.

> **Phase 0 can proceed without these resolved. Phase 1 cannot.**
> To resolve an Open Decision: pick one option, move it to Locked in the Plan's Decision Log with rationale, update the row below.

---

| # | Decision | Status | Resolution | Blocker For |
|---|---|---|---|---|
| O1 | Confirm production DNS matches Product Surfaces & Domain Strategy (`app.studiobooking.io`, `studiobooking.io`, `talenthub.io`, `{slug}.studiobooking.io`, tenant custom domains) | **OPEN** | — | Middleware routing, DNS, CMS `context` routing, all URL constants |
| O2 | Tenant #1 slug for current workspace | **OPEN** | — | Subdomain registration, reserved slug checks |
| O3 | Deployment platform confirmation (Vercel assumed — wildcard domains + Domains API) | **OPEN** | — | Domain provisioning implementation (Phase 5) |
| O4 | `agency_staff` role enum migration strategy (keep name / rename later / add new role + migrate over time) | **OPEN** | — | Phase 2 auth refactor |
| O5 | Admin URL pattern for agency context (path-based `/a/{slug}/admin` / cookie-based single `/admin` / hybrid) | **OPEN** | — | Phase 3 admin refactor |
| O6 | Client relationship model (global `client_profiles` + `agency_client_relationships` overlay / separate per-agency records / hybrid) | **OPEN** | — | Phase 1 data model |
| O7 | Can a single person be both talent and agency staff? (Yes / no / yes with UX guardrails) | **OPEN** | — | Membership model, auth routing |

---

## Resolution note template

When closing a decision, append under the relevant O# heading below and update the table above + the Plan's Decision Log §27.

```
### O# — <title>
Resolved: YYYY-MM-DD
Chosen: <option>
Rationale: <one paragraph>
Consequences (what this unblocks / what it locks out):
Plan update: <pointer to Plan section + Decision Log L# entry>
```

---

## Related locked decisions (context for resolution)

- **L1** — Row-level multi-tenancy, shared schema/DB
- **L2** — Central admin on central app host (affects O5)
- **L4** — Agency storefronts on `{slug}.studiobooking.io` by default (affects O1, O2)
- **L13** — Tenant #1 UUID = `00000000-0000-0000-0000-000000000001`
- **L34** — Four product surfaces A–D explicit and hostname-routed
- **L40** — Surface C = `studiobooking.io`; tenant #1 storefront may be `improntamodels.com`
