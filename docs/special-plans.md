# Special-plans register

Every plan with `is_visible = false OR is_self_serve = false` (in the future `plans` table; in `web/src/lib/access/plan-catalog.ts` until Track C) gets a row here. Adding a special plan without a row is a process violation. See `OPERATING.md` §"Plan governance" and the architecture brief §special-plan naming discipline.

## Active special plans

| plan_key | created | base | tenants | reason | retire by | linked PR |
|---|---|---|---|---|---|---|
| `legacy` | 2026-04-15 | (none) | tenant #1 (Impronta Models Tulum) | Pre-pricing-model launch; grandfathered tenant before public plans existed. Differs from `agency`: unlimited team seats, all entitlement flags ON, support_tier=enterprise. | When tenant #1 contract permits migration to `agency` | n/a (predates this register) |

## Archived special plans

_(none yet)_

## Adding a row

1. Migration creates the plan in DB (post-Track-C) or adds a `PlanDef` to `plan-catalog.ts` (Phase 1).
2. Same PR adds a row above with: `plan_key`, today's date, the closest standard plan as `base`, the tenant slug(s) on it, a reason that names the customer/contract and what differs, a retire-by date, and the PR number.
3. Reviewer confirms the plan_key follows the naming convention (`legacy` | `enterprise_<slug>` | `<base>_<year><quarter>` | `<base>_<reason>_<year>`).

## Retiring a row

When a special plan no longer has any tenants on it:
1. Set `is_archived = true` (or, in Phase 1, mark as deprecated in `plan-catalog.ts`).
2. Move its row from "Active" to "Archived" with the archive date appended.
3. After 12 months in Archived with no tenants, drop the rows entirely (plan + capability rows + limit rows) in a follow-up migration.

## Anti-mess thresholds

When `count(active special plans) >= 5` OR `count(near-duplicate pairs) >= 3` OR `count(tenants on special plans) >= 10` — schedule the override-table build (architecture brief §override governance, §3 of the tightening response).

Run the metric SQL from `OPERATING.md` quarterly. Record the three numbers. If any threshold is crossed, the next "add special plan" PR is blocked until the override-table work is scheduled or an existing special plan is retired.
