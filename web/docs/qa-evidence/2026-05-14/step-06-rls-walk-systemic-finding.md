# Step 6 evidence — RLS walk reveals systemic client-side blocker

## Method

`web/scripts/qa-walk-rls.mjs` signed in as each of the 4 seeded roles
and probed the exact `.eq("version", expectedVersion)` UPDATE pattern
used by all 17 inquiry-engine call sites, plus a representative
`inquiry_messages` INSERT.

Target: in-flight inquiry `d76a4bf9…` (status=submitted, version=6,
submitted by qa-client-1).

## Result

| Role | Read | UPDATE inquiries | INSERT inquiry_messages |
|---|---|---|---|
| admin (qa-admin) | ✅ v=6 | ✅ OK v=6 | ✅ OK |
| coord (qa-client-2 promoted) | ✅ v=6 | ✅ OK v=6 | ✅ OK |
| talent-coord hybrid (Sofia) | ✅ v=6 | ✅ OK v=6 | ✅ OK |
| **client (qa-client-1, the submitter)** | **✅ v=6** | **❌ silent-null (RLS-filtered)** | **❌ RLS row-violation** |
| service-role (baseline) | ✅ | ✅ | n/a |

## Diagnosis

The client (qa-client-1) **submitted this inquiry**, can read it, but
**cannot UPDATE it or INSERT messages into it** through their own
session. RLS filters them on both write paths.

This is the **same bug class** the v1 walk caught in `createOffer`
(commit `85729cbc7`) — but only the `createOffer` call site was
fixed. The other 16+ engine paths still use the user-session
client for the write, including **every client-facing action**:

| Engine path | Used by | Status |
|---|---|---|
| `createOffer` | admin / coord | ✅ FIXED 2026-05-14 (service-role self-elevation) |
| `clientAcceptOffer` | **client** | ❌ user-session UPDATE — silently fails today |
| `clientRejectOffer` | **client** | ❌ user-session UPDATE — silently fails today |
| `submitApproval` | client / talent / coord | ❌ user-session UPDATE |
| `rejectApproval` | client / talent / coord | ❌ user-session UPDATE |
| `sendMessage` (client → private thread) | **client** | ❌ user-session INSERT — RLS-blocks |
| `submitTalentRate` | talent / talent-coord | ⚠️ talent passed UPDATE in this walk, but the hybrid happens to also be coord — pure talent may not |
| `acceptTalentInvitation` | talent | ⚠️ same caveat — needs pure-talent walk |
| `declineTalentInvitation` | talent | ⚠️ same caveat |
| `moveToCoordination` | admin / coord | ✅ admin + coord work |
| `assignCoordinator` | admin | ✅ admin works |
| `acceptCoordinatorAssignment` | coord | ✅ coord works |
| `declineCoordinatorAssignment` | coord | ✅ coord works |
| `addSecondaryCoordinator` | admin | ✅ admin works |
| `removeSecondaryCoordinator` | admin | ✅ admin works |
| `promoteToPrimary` | admin | ✅ admin works |
| `sendOffer` | admin / coord | ✅ admin + coord work (audit deeper) |
| `updateOfferDraft` | admin / coord | ✅ admin + coord work (audit deeper) |
| `counterOffer` | admin / coord | ✅ admin + coord work (audit deeper) |
| `convertToBooking` | admin | ✅ admin works |
| `freezeInquiry` | admin | ✅ admin works |
| `unfreezeInquiry` | admin | ✅ admin works |
| `archiveInquiry` | admin | ✅ admin works |

## Impact

**Client-side funnel is entirely blocked at engine level today.**

The client cannot:
- Accept or reject offers in their workspace inquiry detail
- Submit or reject approvals
- Send messages in their own inquiry thread (private OR group)

This means even if the admin Offer tab were fully wired (it's mocked
per v1 #5), the client side could not respond. The funnel cannot
close.

The walk also surfaces a **pure-talent unknown**: this walk's "talent"
role was the hybrid (Sofia is now coordinator in impronta after
fixture seed). A pure-talent walk against a separate inquiry's talent
participants is needed to confirm `acceptTalentInvitation`,
`declineTalentInvitation`, `submitTalentRate` work for unprivileged
talent. Plan v2 follow-up.

## Fix pattern

Same as `createOffer` (commit 85729cbc7):

```ts
// After validateActorPermission has gated the action:
const { createServiceRoleClient } = await import("@/lib/supabase/admin");
const admin = createServiceRoleClient();
const writeClient = admin ?? supabase;
const { data: updated, error: uerr } = await writeClient
  .from("inquiries")
  .update(updatePayload)
  .eq("id", ctx.inquiryId)
  .eq("tenant_id", ctx.tenantId)
  .eq("version", ctx.expectedVersion)
  .select("id")
  .maybeSingle();
if (uerr) return { success: false, error: uerr.message };
if (!updated) return { success: false, conflict: true, reason: "version_conflict" };
```

The permission gate (`validateActorPermission`) is the security check.
Once it passes, the engine has authorized the actor — RLS as a second
gate is redundant AND wrong for the cases above. Service-role for the
WRITE only (reads remain RLS-gated for visibility correctness).

## Action

Apply the service-role-write pattern to (at minimum):
1. `clientAcceptOffer`
2. `clientRejectOffer`
3. `submitApproval`
4. `rejectApproval`
5. `sendMessage` (for client-thread inserts) — message inserts already
   use service-role for system events; needs same for client messages
6. `submitTalentRate` (defensive — needs pure-talent walk first)
7. `acceptTalentInvitation` + `declineTalentInvitation` (defensive)

After fixes, re-run `qa-walk-rls.mjs` and confirm the client column flips green.
