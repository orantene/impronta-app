# TUL-526 Custom domains for talents, end to end: plan (Oct 15, 2026)

Status: PLAN ONLY. Nothing here buys a domain, changes DNS, touches Stripe/billing or writes data.
Writes (DNS, registrar, Vercel domains, Stripe) are Oran's. Code that is safe to ship is listed at the end.

## What exists in the repo today (verified by reading the tree)
- Host resolution: `src/lib/saas/host-context.ts` + `talent-site-host-routing.ts` (a talent custom domain is rewritten to `app/%5Ftalent-site/[[...pageSlug]]`), gated by `resolveGatedTalentProfileId`.
- Buy through Tulala: `src/lib/saas/vercel-domains-registrar.ts` (search/quote), `src/lib/talent-site/server/talent-domain-purchase-actions.ts`, `src/lib/stripe/talent-domain-billing.ts` (money, not touched here).
- Connect your own: `src/components/talent/site/DomainSetupDrawer.tsx`, `TalentSiteDomainPanel.tsx`.
- Auto-verify: `src/app/api/cron/domain-verification/route.ts`.
- Cookies/SSO on custom domains: `lib/auth/sso-handoff-pure.ts`, `post-auth-return.ts` (#3718 S1 work).
- Captcha on custom domains: `lib/captcha/platform-hosts.ts` (own keys win, otherwise none; guard test TUL-1141).
- SEO per host: `lib/seo/robots-rules.ts` (guard test TUL-1146), not-found noindex + real 404 (TUL-857).

## What the card says is missing (audit 2026-10-09, to be re-verified before building)
1. Redirect of the talent's subdomain and the hub profile to the custom domain once it is live.
2. Domain health/renewal and the downgrade lifecycle (expiry persistence was explicitly deferred).
No part of the flow was live on prod at the audit.

## Plan, in order
1. **Re-verify the two gaps** against `origin/main` (grep + read), write the result on the card. No code.
2. **Redirect to the custom domain** (code, no env): when a talent site has a verified custom domain, the
   `<slug>.tulala.digital` host and the hub `/t/<code>` page 308 to it; canonical already points at the primary host.
   Tests: pure routing function + static test on the proxy hook. Needs `proxy.ts` budget (it is at its 800-line cap:
   put the rule in `talent-site-host-routing.ts`, call it from the existing talent-site branch, net 0 lines in proxy.ts).
3. **Health/renewal read model** (code, read-only): a pure `domainHealth()` from the registrar/DNS facts the verification
   cron already reads (status, expires_at when known). UI badge in `TalentSiteDomainPanel`. Persistence of expiry needs a
   column: that is a migration, so it is added as a file in the PR and the card stays Blocked until Oran OKs it.
4. **Downgrade lifecycle**: on plan downgrade the domain keeps serving for a grace window, then the site falls back to the
   subdomain with a notice. Pure state machine + tests; the scheduler is the existing cron. Billing events are read, never written.
5. **Docs**: Oran runbook (below) in `docs/runbooks/` once steps 2 to 4 are in review.

## Oran-only steps (I will not do these)
- Registrar purchases and renewals (real money; Stripe stays in test mode for any QA).
- DNS records at the registrar (A/CNAME/TXT) and adding the domain to the Vercel project (Vercel domains/env are not mine).
- Applying the expiry-persistence migration on prod (after it is merged on main). TUL-443 migration stays held.
- A QA custom domain for end-to-end proof (a domain Oran owns, pointed at the staging project by Oran).

## Proof I can capture without those steps
Unit tests for the redirect rule, health model and lifecycle; CI run of #PR; static tests that the proxy stays at 800 lines;
a localhost walk-through is NOT possible (no servers per repo rules), so the live proof is QA's once Oran provides the QA domain.

## Risks and file overlaps
- `proxy.ts` cap (800): keep new logic in `talent-site-host-routing.ts`.
- Open PRs in other lanes: none touch `talent-site-host-routing.ts` (Booking #3817, Client #3820/#3822, Promos #3821, Onboarding #3780).
- Money PRs (#3741/#3777/#3812/#3786): no overlap; billing files are read-only for this card.
