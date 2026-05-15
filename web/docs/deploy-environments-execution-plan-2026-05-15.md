# Deploy + environments execution plan

**Date:** 2026-05-15
**Owner:** Oran
**Goal:** Move from `phase-1`-as-trunk + ghost-locked `main` to standard SaaS-shape: `main` = production, `staging` branch = staging subdomain, feature flags for canary rollouts.

---

## Why this plan exists

Currently:
- `phase-1` is the active dev branch (legacy from a since-finished "phase one" milestone)
- Vercel's production branch is locked to `main` (a Hobby-plan artifact — fixable now that you're on Pro)
- No staging environment — every test happens on `tulala.digital` (real users would see broken things)
- Deploy ritual is: push to `phase-1` → manual UI Promote → manual alias → smoke test. Easy to skip steps.

Target state:
- `main` = production, auto-deploys on push
- `staging` branch → `staging.tulala.digital` for pre-prod testing
- Per-PR Vercel previews (already work) for code review
- Feature flags (Vercel Flags) for canary rollouts
- One-button deploy: `git push origin main`

This plan is broken into **3 phases × ~30 min each**. Do them in order. Each phase is independent — you can stop after any phase and the system stays healthy.

---

## Phase A — Rename `phase-1` → `main`, fix Vercel (30 min)

### A.1 — Pre-flight checks

Before any changes, capture current state so you can roll back.

```bash
# Save current production deployment URL for emergency rollback
cd /Users/oranpersonal/Desktop/impronta-app/web
npm run deploy:check > /tmp/deploy-state-before.txt
cat /tmp/deploy-state-before.txt
```

Note the URL `tulala.digital` currently points to. If anything goes sideways in this phase, you can `vercel alias set <that-url> tulala.digital --scope oran-tenes-projects` to roll back.

Also: make sure no other agent is mid-commit on `phase-1`:

```bash
git fetch origin && git log --oneline origin/phase-1..origin/main 2>&1 | head -5
# Should be empty or only commits you recognize.
```

### A.2 — Rename the branch on GitHub

This is a one-button operation, doesn't break PRs or aliases:

1. Open https://github.com/orantene/impronta-app/settings/branches
2. Under "Branches", find `phase-1`. Click the **pencil icon** next to it → **Rename** → `main`
3. GitHub will:
   - Update the default branch
   - Redirect open PRs from `phase-1` → `main`
   - Update branch protection rules
   - Show a banner with the commands collaborators need to run locally

**Reference:** https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-branches-in-your-repository/renaming-a-branch

### A.3 — Update local clone

```bash
cd /Users/oranpersonal/Desktop/impronta-app
git branch -m phase-1 main
git fetch origin
git branch --set-upstream-to=origin/main main
git remote set-head origin -a
```

Verify: `git status` should say "On branch main" and "Your branch is up to date with 'origin/main'".

### A.4 — Update Vercel's production branch

Now that you're on **Pro** (the Hobby restriction is gone):

1. Open https://vercel.com/oran-tenes-projects/tulala/settings/git
2. Under **"Production Branch"**, change from `main` (or whatever it was) → `main` (confirm it's pointing at the renamed branch)
3. Save

**This is the single change that eliminates the "ghost-locked branch" problem documented in `CLAUDE.md`.** Every future push to `main` will build and deploy to production automatically — no UI Promote, no alias step.

**Reference:** https://vercel.com/docs/deployments/git#production-branch

### A.5 — Verify the new flow

Make a tiny no-op commit and push:

```bash
cd /Users/oranpersonal/Desktop/impronta-app
git commit --allow-empty -m "chore: verify main-as-prod-branch is wired"
git push origin main
```

Watch https://vercel.com/oran-tenes-projects/tulala/deployments — the new deployment should appear with **Environment: Production** (not Preview) within seconds. Wait ~2-3 min for the build to be Ready.

Then run the smoke test:

```bash
cd /Users/oranpersonal/Desktop/impronta-app/web
npm run deploy:smoke
```

All 9 checks should pass. The custom domains should auto-alias to the new prod deploy (no manual alias step).

### A.6 — Clean up obsolete artifacts

```bash
# Archive the old "stable-work" branch for safety, then delete
git push origin stable-work:archive/stable-work
git push origin --delete stable-work
git push origin --delete phase-1   # GitHub's rename already handles this, but just to be safe
```

Update `CLAUDE.md` — replace `phase-1` with `main` everywhere in the multi-agent rules. I'll handle this in the same PR if you want.

**Phase A done. Production is now standard trunk-based.**

---

## Phase B — Add `staging` environment (30 min)

### B.1 — Create the staging branch

```bash
cd /Users/oranpersonal/Desktop/impronta-app
git checkout main && git pull
git checkout -b staging
git push origin staging
```

Vercel auto-builds a preview. Note its URL from the deployments page.

### B.2 — Reserve the staging subdomain in DNS

You own `tulala.digital` (DNS managed where?). For the rest of this section I'll assume Vercel manages your DNS — adjust if you're using Cloudflare or another provider.

1. Open https://vercel.com/oran-tenes-projects/tulala/settings/domains
2. Click **Add Domain** → enter `staging.tulala.digital` → Add
3. Vercel will show DNS records to add (if you don't host DNS there). Add them at your DNS provider:
   - `CNAME staging cname.vercel-dns.com.`
4. Wait for DNS to propagate (~1-5 min). Vercel shows ✓ next to the domain when ready.

### B.3 — Assign the subdomain to the `staging` branch

In the same Domains page:

1. Find `staging.tulala.digital` in the list
2. Click **Edit** → set **Git Branch** → `staging`
3. Save

Now every push to `staging` auto-deploys to `staging.tulala.digital`.

**Reference:** https://vercel.com/docs/projects/domains/assigning-a-domain-to-a-git-branch

### B.4 — Add `staging.tulala.digital` to the middleware allowlist

Your middleware blocks unknown hosts with a 404. Add the staging host to `public.agency_domains`:

```sql
INSERT INTO public.agency_domains (host, tenant_slug, kind)
VALUES ('staging.tulala.digital', 'impronta', 'workspace');
```

Run via:

```bash
node web/scripts/qa-sql-query.mjs "INSERT INTO public.agency_domains (host, tenant_slug, kind) VALUES ('staging.tulala.digital', 'impronta', 'workspace')"
```

(Adjust the `tenant_slug` if you want staging to default to a different tenant for QA.)

### B.5 — Verify

```bash
curl -sSI https://staging.tulala.digital/ | head -3
# Should be 200, not 404.
```

Visit `https://staging.tulala.digital` in a browser. You should see the Tulala app (logged-out state).

### B.6 — Optional now, recommended pre-launch: wildcard staging subdomain

If you want per-tenant staging URLs (`impronta.staging.tulala.digital`, `nova.staging.tulala.digital`), add a wildcard domain (Vercel Pro feature, **$20/year per wildcard**):

1. Same Domains page → Add Domain → `*.staging.tulala.digital`
2. Add CNAME wildcard at your DNS: `CNAME *.staging cname.vercel-dns.com.`
3. Add each tenant's staging host to `agency_domains` as needed.

**Phase B done. You have a staging URL.**

---

## Phase C — Feature flags for safe rollouts (45 min)

### C.1 — Why this matters more than staging

Staging environments catch "does the code work". Feature flags catch "should this be on for THIS tenant THIS week". For multi-tenant SaaS, flags are the bigger win.

Example: when you're ready to enable Stripe live-mode payments, you don't want it on for every tenant at once. You enable for `impronta` (your own), watch for a week, then ramp.

### C.2 — Install Vercel Flags (free on Pro)

```bash
cd /Users/oranpersonal/Desktop/impronta-app/web
npm install @vercel/flags
```

Create `web/src/lib/flags.ts`:

```ts
import { unstable_flag as flag } from "@vercel/flags/next";

// Flag definitions — single source of truth.
// Tenants identified by their `tenant_slug` get the flag turned on
// independently of code deploys.
export const stripeLiveMode = flag({
  key: "stripe-live-mode",
  defaultValue: false,
  description: "Switch payments from Stripe test mode to live charges",
  // Per-tenant rollout: read tenant slug from request and check allow-list
  decide: async ({ identify }) => {
    const { tenant } = await identify();
    return ["impronta"].includes(tenant ?? "");
  },
});

export const discoverPayments = flag({
  key: "discover-payments",
  defaultValue: false,
  description: "Show the in-Discover inquiry payment sheet",
});

// Add other risky features here.
```

Wire `identify` to extract tenant from your middleware context. **Reference:** https://flags-sdk.dev/docs/identify

### C.3 — Use a flag in code

Wrap a feature so it can be toggled per-tenant without a deploy:

```ts
import { discoverPayments } from "@/lib/flags";

export async function InquiryPaymentSheet() {
  if (!(await discoverPayments())) return null;
  return <RealPaymentSheet />;
}
```

### C.4 — Toggle flags from the Vercel dashboard

After your next deploy, the flags page populates automatically:

1. Open https://vercel.com/oran-tenes-projects/tulala/flags
2. Each flag from `flags.ts` shows up
3. Toggle per-environment (production / staging / dev) without redeploying

**Reference:** https://vercel.com/docs/feature-flags

### C.5 — Wrap your 5 riskiest features

In priority order, put these behind flags before launch:

1. `stripe-live-mode` — toggle from test mode to real charges per tenant
2. `discover-payments` — in-app inquiry payment sheet
3. `multi-tenant-inquiry-fanout` — the Discover D5 cross-tenant fan-out
4. `talent-self-edit-paid-features` — Pro/Portfolio tier features
5. `client-shortlist-sharing` — Discover D4 slice 2

That's it for Phase C.

---

## Phase D — Separate staging Supabase (defer to week-before-launch)

You only have one Supabase project (`pluhdapdnuiulvxmyspd`). Staging shares prod data. **That's fine pre-launch** because you have no real customers. Once you do:

### D.1 — Create staging project

1. Open https://supabase.com/dashboard/projects
2. Click **New Project** → name `tulala-staging`, region `us-east-2` (match prod)
3. ~$25/month on Supabase Pro tier (which you'll need for Branching anyway)

### D.2 — Mirror schema to staging

```bash
# From your local repo
cd /Users/oranpersonal/Desktop/impronta-app
npx supabase link --project-ref <STAGING_PROJECT_REF>
npx supabase db push --linked
# Then re-link to prod when done:
npx supabase link --project-ref pluhdapdnuiulvxmyspd
```

### D.3 — Add staging env vars to Vercel

1. Open https://vercel.com/oran-tenes-projects/tulala/settings/environment-variables
2. For each `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`:
   - Click Edit
   - Add a **second** value scoped to **Preview** + **Development** only (NOT production)
   - Use the staging project's credentials
3. Save

### D.4 — Enable Supabase Branching

Free on Supabase Pro. Each Vercel PR gets its own DB branch with a copy of staging.

1. https://supabase.com/dashboard/project/<STAGING_PROJECT_REF>/branches
2. Click **Enable Branching**
3. Connect to your GitHub repo
4. Pick `staging` as the base branch (so PRs branch off staging, not prod)

**Reference:** https://supabase.com/docs/guides/platform/branching

---

## Decision tree: which phase to do today

| If… | Do |
|---|---|
| You want the minimum-viable fix | Phase A only (~30 min) |
| You want staging before agency demos | Phase A + B (~1 hr) |
| You want safe per-tenant rollouts before launch | Phase A + B + C (~2 hrs) |
| You have real paying customers | All four phases |

My recommendation for **this week**: Phase A + B. Phase C the week before launch. Phase D the week of launch.

---

## Rollback for each phase

| Phase | If something breaks |
|---|---|
| A | `git push origin main:phase-1` to recreate the old branch name; in Vercel, change Production Branch back to whatever it was |
| B | Delete the `staging` branch on Vercel and GitHub. Remove the DNS CNAME. No data impact. |
| C | Set every flag's `defaultValue: false` and redeploy — flags become no-ops |
| D | Switch the Vercel staging env vars back to the prod Supabase project. The staging Supabase project is independent — no impact on prod. |

---

## Concepts to learn (not required, but worth it)

| Topic | Best free resource |
|---|---|
| Trunk-based development (the why) | https://trunkbaseddevelopment.com — short read, the canonical reference |
| Feature flags vs branches | https://martinfowler.com/articles/feature-toggles.html |
| Vercel Git integration | https://vercel.com/docs/deployments/git |
| Vercel Flags SDK | https://flags-sdk.dev |
| Supabase Branching | https://supabase.com/docs/guides/platform/branching |
| SaaS architecture patterns | https://github.com/dwmkerr/saas — opinionated checklist |
| Multi-tenant patterns | https://supabase.com/docs/guides/database/postgres/row-level-security — RLS is your tenant boundary |

---

## My offer

I can execute any phase for you, but I need explicit go-ahead each time because each phase touches production. The safest sequence is:

1. **You** do step A.1 (pre-flight snapshot) yourself, paste me the output
2. **I** do A.2 → A.6, you watch
3. We run smoke test together, confirm green
4. **You** decide whether to continue to Phase B

Tell me which phase to start with and I'll execute, asking for explicit go/no-go before each destructive step.
