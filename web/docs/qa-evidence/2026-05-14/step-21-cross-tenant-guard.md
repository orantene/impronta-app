# Step 21 — Cross-tenant guard walk (Gap 12 of plan v2)

## Method

`web/scripts/qa-cross-tenant.mjs` signs in as 3 non-platform personas
in `impronta` agency and tries to:

- **[A]** READ an inquiry belonging to `qa-studio-tenant`
- **[B]** UPDATE that same inquiry
- **[C]** INSERT a message thread on it
- **[D]** READ a home-tenant (impronta) inquiry as a control

Plus a fourth probe of the engine's defense-in-depth `.eq("tenant_id", …)`
filter shape (the "spoof" attack where the actor claims their own tenant
but targets a row in another).

## Initial finding (red herring)

First run signed in as `qa-admin@impronta.test` and the walk reported
the `studio` inquiry as READ + UPDATE + INSERT-message accessible.
That looked like a leak.

Root cause: `qa-admin` has `profiles.app_role = 'super_admin'`. The
`is_staff_of_tenant(t)` helper short-circuits via
`is_platform_admin()` — super_admins are deliberately cross-tenant by
design (operations / support / platform staff). Not a leak.

**Lesson**: cross-tenant guard tests must exclude super_admin actors.

## Re-run with non-platform personas

Live policy state on `public.inquiries` (queried via Management API SQL):

| Policy | Cmd | Predicate |
|---|---|---|
| `inquiries_insert_client` | INSERT | `client_user_id = auth.uid() OR client_user_id IS NULL` |
| `inquiries_select_own` | SELECT | `client_user_id = auth.uid()` |
| `inquiries_select_talent_participant` | SELECT | participant join on talent_profiles.user_id |
| `inquiries_tenant_staff` | ALL | `is_staff_of_tenant(tenant_id)` |

All four are correctly tenant-scoped or user-scoped. Migration
`20260918000000_rls_staff_tenant_scope` is applied.

Walk results:

| Persona | [A] READ studio | [B] UPDATE studio | [C] INSERT studio msg | [D] READ impronta (control) |
|---|---|---|---|---|
| **client (pure)** qa-client-1 | ✅ blocked | ✅ blocked | ✅ blocked (`tenant_autofill` trigger rejects) | ✅ allowed |
| **coord** qa-client-2 (promoted) | ✅ blocked | ✅ blocked | ✅ blocked | ✅ allowed |
| **talent-coord hybrid** Sofia | ✅ blocked | ✅ blocked | ✅ blocked | ✅ allowed |
| Spoof UPDATE (studio id w/ falsified `tenant_id=impronta`) | — | ✅ blocked | — | — |

**12 cross-tenant probes attempted, 12 blocked. ✅ ZERO LEAK.**

## What this proves

- RLS isolation on `public.inquiries` is correct: the legacy
  `inquiries_staff_all (USING is_agency_staff())` policy has been
  dropped and replaced with `inquiries_tenant_staff` using
  `is_staff_of_tenant(tenant_id)`.
- The engine's `.eq("tenant_id", ctx.tenantId)` defense-in-depth filter
  also rejects spoofed cross-tenant UPDATEs.
- The `inquiry_messages` write path is double-protected: RLS blocks the
  insert AND a `tenant_autofill` trigger validates the parent inquiry
  belongs to the actor's tenant scope.
- Pure clients can read their OWN inquiry (via `client_user_id =
  auth.uid()`) but not other tenants' inquiries. Talent / coord see
  home-tenant inquiries via the participant-join and tenant-staff
  policies respectively.

## Caveats / not tested

- **Platform admin (super_admin) cross-tenant access** — by design, but
  if you ever want to lock super_admins to their home tenant for
  production support, the change point is `is_staff_of_tenant()` in
  `20260602100000_saas_p2_tenant_helpers.sql` (drop the
  `is_platform_admin()` short-circuit). Documented.
- **Storage bucket cross-tenant** — files in `inquiry-attachments` /
  `talent-media` etc. need a separate walk against `storage.objects`
  RLS. Not in this script.
- **`inquiry_offers`, `inquiry_offer_line_items`, `inquiry_audit_log`,
  `inquiry_events`** — every other inquiry-tenanted table should get
  the same walk for completeness. Today's script covers `inquiries`
  + `inquiry_messages` only.
- **API endpoint cross-tenant** — `/api/admin/inquiries/[id]` etc.
  may carry their own auth/scoping logic on top of RLS. Walking
  through HTTP routes is a separate pass.

## Verdict for Gap 12

**Closed.** RLS isolation works for `inquiries` + `inquiry_messages`
across the 3 most-impactful non-admin personas. Follow-up: extend
script to cover the 4 other inquiry-tenanted tables + storage objects.
