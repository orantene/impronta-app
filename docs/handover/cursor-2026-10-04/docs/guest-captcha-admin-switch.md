# Guest captcha — platform admin switch

**Lane owner:** [Own captcha OFF prove ON](https://cursor.com/agents/bc-c81d48b1-f116-55e4-872e-7823a8f82e8e) (`bc-c81d48b1`) — OFF-prove → money unblock → ON before handover.  
**#2509 author:** [bc-32186601](https://cursor.com/agents/bc-32186601-e1fc-5870-9896-941eff869d1c) · MERGED `339dec9b8`  
**Widget hotfix:** [#2520](https://github.com/orantene/impronta-app/pull/2520) `cursor/guest-captcha-site-wire-2e8e`  
**Money:** [bc-08ebe404](https://cursor.com/agents/bc-08ebe404-ac0b-5bec-9608-f42ebb7aba4a) — blocked until OFF-prove PASS

## LIVE status (2026-10-04 ~05:12Z)

| Layer | State |
|---|---|
| Remote DB `guest_captcha_enforced` | **`true` (ON)** since **05:11:02Z** |
| Tip `a384e274b` / `dpl_8gvjZEZ` on `jorg-beauty-qa` | LIVE |
| Guest Continuar al pago skips captcha (HQ OFF) | **PASS** 05:10Z |
| Guest Continuar al pago shows captcha (HQ ON) | **PASS** 05:12Z |
| Money Soft Gel PAID | already PASS |
| Re-enable | **done** — leave ON for guest traffic |

Evidence: `internal/guest-captcha-off-prove-pass-a384e.md` · `internal/guest-captcha-on-prove-pass-a384e.md` · `inbox/captcha-off-on-both-pass-handover.md`

## What it does

`platform_settings.guest_captcha_enforced` (schema default **true**):

- **ON:** guest Continuar al pago / instant-book requires hCaptcha/Turnstile when keys are configured.
- **OFF (current):** server skips verify; booking chrome hides the widget.

Not a public / `NEXT_PUBLIC_*` flag.

## Where to flip (HQ UI)

1. Platform admin → **Settings** (`/platform/admin/settings`)
2. Card **Guest booking captcha**
3. Uncheck = OFF / check = ON → Save (~30s memo TTL)

Captcha **keys** stay under **Integrations**.

## SQL

```sql
-- OFF (current testing)
update public.platform_settings
set guest_captcha_enforced = false, updated_at = now()
where id is true;

-- ON before real guest traffic
update public.platform_settings
set guest_captcha_enforced = true, updated_at = now()
where id is true;
```

## Code map

| Layer | File |
|---|---|
| Column | `supabase/migrations/20261231342000_platform_settings_guest_captcha_enforced.sql` |
| Read/write | `web/src/lib/platform/guest-captcha-enforcement.ts` |
| Form vs booking split | `splitGuestCaptchaConfigs` in `guest-captcha-enforcement-resolve.ts` → `options.bookingCaptcha` (catalog) vs `options.captcha` (CMS forms) |
| Server gate | `web/src/lib/scheduling/instant-book-guest.ts` → `verifyTenantCaptchaToken` |
| UI chrome | `web/src/lib/scheduling/guest-instant-chrome.ts` |
| Vanity Max | `web/src/lib/talent-site/server/render-max-site.tsx` (#2520) |
| HQ card | `…/platform/admin/settings/PlatformGuestCaptchaCard.tsx` |
