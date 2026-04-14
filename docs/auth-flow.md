# Auth, roles, and routing

## Roles (`profiles.app_role`)

| DB value | Product name | Typical area |
|----------|--------------|--------------|
| `super_admin` | Super admin | `/admin` — full access |
| `agency_staff` | Agency staff | `/admin` |
| `talent` | Talent | `/talent` |
| `client` | Client | `/client` |

**Visitor:** not logged in — `auth.uid()` null. Public routes: directory, profiles, marketing pages per middleware.

## Post-login destinations

Implemented in `web/src/lib/auth-flow.ts` (`resolvePostAuthDestination`) and `web/src/lib/auth-routing.ts` (`resolveAuthRoutingDecision`):

- **Talent** → `/talent` (or validated `next` query).
- **Client** → `/client`.
- **Staff** → `/admin`.

`next` after login is **validated** so users are not sent to another role’s dashboard (`isPostAuthNextAllowedForActiveUser`).

## Middleware

`web/src/lib/supabase/middleware.ts`:

- Dashboard segments require session.
- `/admin` requires staff role (`super_admin` | `agency_staff`).
- `/talent`, `/client` require auth and matching role.

## Onboarding

Talent onboarding uses RPCs such as `complete_talent_onboarding_with_locations` (see migrations under `202604092*` / `202604101*`). Checklist alignment: `web/src/lib/talent-dashboard.ts` and talent status pages.

## Verification checklist

- [ ] Register talent → lands on talent dashboard after onboarding rules.
- [ ] Register client → client dashboard.
- [ ] Staff user → `/admin`.
- [ ] Unauthenticated user cannot access `/admin`, `/talent`, `/client` (redirect to login).
- [ ] Public directory and `/t/{profileCode}` work without login.
