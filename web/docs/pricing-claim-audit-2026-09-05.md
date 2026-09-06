# Pricing claim audit — 2026-09-05

**Question asked:** does the pricing and plan-comparison copy on tulala.digital claim
more or less than `plan_capabilities` (six rows) plus the fail-open default?

**Headline:** the public compare table makes **134 claims**. Code decides **4 of them**
via `plan_capabilities`, and roughly twenty more via enforced counts. The remaining
**130 rows are marketing copy no code decides** — not wrong, *unverifiable*. That is the
real finding, and it is larger than any individual bad line.

---

## The shape of the problem

`plan_capabilities` holds six rows across three capabilities, all `included = false`,
all on Free and Studio. **A capability with no row is granted to every plan.**

That fail-open default makes exactly one direction of marketing claim checkable, and it
happens to be the dangerous one:

> A row that says a plan does **not** get something the product actually grants it.

That is a promise that upgrading buys the customer something. If no row withholds it,
the upgrade buys nothing. The opposite direction — a row claiming a plan *does* get
something — is only checkable when a row withholds it. Everything else is unfalsifiable
from this table, and the new guard says so rather than implying coverage.

---

## Claims a capability the code does not have

These are not drift. The feature does not exist anywhere in the codebase.

| Where | Claim | Reality |
|---|---|---|
| `get-started-form.tsx` | Network: "SSO, custom domain, and dedicated onboarding **unlock at checkout**" | No SAML/Okta/SSO implementation exists. The only occurrence of "SSO" outside marketing copy is an unrelated cross-domain session comment. Payment would unlock nothing. |
| `organizations/page.tsx` (en + es) | "SSO, advanced roles, **API access**, white-label options…" | No `/api/v1`, no public API surface. |
| `legal/privacy/page.tsx` | "export is available on every paid plan (CSV + JSON; **API access on Network**)" | Same. This one is a legal representation, which is why it is the worst placement. |
| `product_features` (DB) | hub — SSO "On request"; Data export "API access"; Analytics "Full + export API" | Same. **Not fixed here** — these are DB rows, see below. |

**Fixed in this PR:** the four code-resident ones. The hedged list entries on
`organizations/page.tsx` ("SSO … on request", "API access (roadmap)") are left alone —
a hedge is a sales posture, and deleting them is a commercial call, not mine.

## Claims a differentiator that is not enforced

Every plan already gets these. The compare table withholds them from Free (and often
Studio) on paper only, so the upgrade sells something the customer already has.

| Claim | Why it is not a differentiator |
|---|---|
| **Multi-locale** (agency+) | `max_locales` is `null` — unlimited — for free, studio, agency and network, and **no code reads it** outside the generated DB types. Nothing gates locales by plan. |
| **WhatsApp inquiry notifications** (studio+) | The channel is implemented and wired into the dispatcher with **no plan gate**. A Free workspace that sets the preference receives them. |
| **Priority email routing** (studio+) | No implementation of any kind. |
| **Roles & permissions** (studio+) | Roles are global; `roles.ts` has no plan predicate. |
| **Audit log — 30 days / 90 days / Full history** | No per-plan retention anywhere. There is one global cap. |
| The six **media / watermark** rows | No plan or capability gate in `src/lib/media` or `src/lib/branding`. |

These live in `product_features` (DB rows), so **this PR does not change them.** Fixing
them edits live pricing copy for eleven waiting businesses, and that is the CEO's call,
not a side effect of a guard PR. The guard now reports them as UNBACKED on every run.

## Claims the code enforces but the page never mentions

Two of the three real withholdings are invisible to a customer:

- `agency.site_admin.design.publish` — withheld from Free and Studio.
- `agency.pitch.manage` — withheld from Free and Studio.

Only `manage_agency_domains` surfaces, as "Custom domain". A Studio customer cannot
learn from the pricing page that they do not get design publish or pitch tools. The
Stripe product description for Agency already promises "pitch tools", so the withholding
is real and sold — just not comparable.

## Wrong numbers

| Where | Said | Enforced |
|---|---|---|
| `help-guides.ts` | Studio "up to **50** profiles" | **15** (`PLAN_SEAT_CAPS.studio`) |

Same error I fixed in the compare table earlier, surviving in a second file — the guard
scanned one tree. Now **derived** from `PLAN_SEAT_CAPS` and `PLAN_LIMITS` rather than
retyped, so it cannot drift again. The "up to 3 seats" in the same sentence was correct.

---

## What the guard now does

`plan-claim-audit.ts` classifies every compare row into three buckets that are kept
**separate**: `agrees`, `contradictions`, `unbacked`.

The separation is the point. The previous version of the sibling numeric guard printed:

> `compare-table drift: 134 row(s) checked, none contradict enforcement`

That sentence was true and read as full coverage while it evaluated roughly twenty rows.
A count of rows *looked at* is not a count of rows *checked*. It now prints:

> `compare-table: 134 row(s) read, 4 decided by a capability, 130 backed by no capability`
> `NOTE: 130 row(s) are marketing copy no code decides. That is an UNKNOWN, not a pass.`

The label→capability map is deliberately short and stays short: compare labels are
marketing prose, capability keys are enforcement identifiers, and a wrong mapping makes
the guard confidently wrong — worse than no guard. A mapping onto a key the registry
does not have would resolve fail-open forever and pass while checking nothing, so
`unknownMappedCapabilities()` fails the run on exactly that.

## Owed

1. **Decide the 130 unbacked rows** — delete, qualify, or build. Mostly a commercial call.
2. **The DB rows** need a data migration once (1) is decided.
3. **SSO and API access** should come off the hedged lists too if they are not roadmap.
