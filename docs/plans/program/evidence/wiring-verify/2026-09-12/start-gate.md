# Start gate — 2026-09-12

Host commit confirmed from Vercel metadata (SSO blocked raw HTML `sentry-release`):

- `origin/main`: `898c211aa`
- `program/journeys-2026-09` latest READY deploy: `898c211aa` (`dpl_8oQK92RRKmeVJQCyAF15i8HnUouE`)
- Messages seam 1: every `POS_MODE_META` destination includes `messages`; `page.tsx` mounts `messagesModeView` for `?view=messages`

Isolated database `fxlankepwnvelxjrahwk` (read via MCP, never production):

- tenants `33333333-…333` / `…334` present
- hosts `staging-qa-journeys.tulala.digital` and `-b` are active
- `settings.pos.locations.default.modes` was `["counter","projects"]` at gate time

Blocked in this Cloud Agent VM:

- `web/.env.capacity-isolated.local` is absent
- `VERCEL_AUTOMATION_BYPASS_SECRET` is unset
- `SUPABASE_SERVICE_ROLE_KEY` / `DATABASE_URL` are unset
- Playwright extra headers therefore cannot send `x-vercel-protection-bypass`

QA HTML fetch without the bypass header returns Vercel SSO (`302` to `vercel.com/sso-api`).
