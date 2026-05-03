# Trust & Verification — System Handoff

> **Status:** Phase 1 + Phase 2.1–2.4 shipped end-to-end in the prototype as of 2026-05-01. Phase 2.5 (real IG Graph API webhook) deferred until backend exists.
> **Source files:** [`_state.tsx`](./_state.tsx) (schema, seeds, context), [`_drawers.tsx`](./_drawers.tsx) (admin queue, talent flows, platform admin console), [`_primitives.tsx`](./_primitives.tsx) (`TrustBadgeGroup`, `ProfilePhotoBadgeOverlay`, `ProfileClaimStatusChip`, `RiskScorePill`).
> **Drawer-by-drawer help copy:** [`DRAWERS.md`](./DRAWERS.md) → "Trust & Verification" section, mirrored from [`_help.tsx`](./_help.tsx).
> **Roadmap status:** WS-5 in [`ROADMAP.md`](./ROADMAP.md) — sub-tasks 5.9, 5.10, 5.11, 5.15, 5.16, 5.17, 5.18, 5.19, 5.20, 5.21 all marked ✅.

---

## 1. The three concerns

The trust system separates three concepts that are usually conflated. This separation is **load-bearing** — flows, badges, and policy all flow from it:

1. **Account verification** — security signal. Confirms the human behind the account. Email, phone, ID. **Never appears as a public badge.** Drives security flows (password reset, payout changes) and the risk-health score.
2. **Profile claiming** — ownership signal. Says "this profile belongs to this user." When an agency creates a talent profile, the talent has to *claim* it via emailed invite to take ownership. Talent can also dispute the claim ("that's not me").
3. **Profile trust verification** — public credibility signal. Public-facing badges (Instagram Verified, Tulala Verified, Domain Verified, Business Verified). This is the only concern that produces visible badges on the storefront.

Conflating them produces bugs. If "verified email" granted a public badge, an attacker who controls a throwaway address could appear trusted. The hard rule lives in `_state.tsx` as `VERIFICATION_TYPE_META[type].publicEligible` + `ProfileVerification.publicBadgeEnabled`.

---

## 2. The 8 verification types

Defined in `VerificationType` union (`_state.tsx`, line ~5410). Metadata for each in `VERIFICATION_TYPE_META`:

| Type | Concern | Default review | Default visibility | Default tier gate | Evidence req? | Default expiry |
|---|---|---|---|---|---|---|
| `instagram_verified` | Trust | Manual (DM lookup) | `public_profile` | All | No | Never |
| `tulala_verified` | Trust | Manual (admin curates) | `public_profile` | All | No | Never |
| `agency_confirmed` | Trust | Automated (agency adds) | `public_profile` | All | No | Never |
| `phone_verified` | Account | Automated (OTP) | `admin_only` | All | No | 365d |
| `id_verified` | Account | Manual (admin reviews doc) | `admin_only` | Pro / Portfolio | **Yes** | 730d |
| `business_verified` | Trust | Manual (admin reviews) | `public_profile` | Pro / Portfolio | Yes | 365d |
| `domain_verified` | Trust | Automated (DNS TXT) | `public_profile` | Portfolio only | No | 90d |
| `payment_verified` | Account | Automated (Stripe ping) | `admin_only` | All | No | 365d |

**These are defaults baked into `SEED_VERIFICATION_METHOD_CONFIG`.** Platform admin can override every column at runtime via `platform-verification-methods`. The 5 Phase-2 methods ship **disabled** by default — platform admin opts them in.

---

## 3. Data model

### Core types (in `_state.tsx`)

```ts
VerificationSubjectType  = "talent_profile" | "client_profile" | "brand_profile" | "agency_profile" | "user_account"
VerificationContext      = "hub" | "agency" | "studio" | "client" | "platform"
VerificationMethod       = "instagram_dm" | "manual_review" | "agency_confirmation" | "domain" | "payment" | "phone" | "email"
VerificationType         = (the 8 above)
VerificationRequestStatus = "draft" | "pending_user_action" | "submitted" | "in_review" | "approved" | "rejected" | "expired" | "cancelled" | "needs_more_info"
VerificationActiveStatus = "active" | "revoked" | "expired"
ProfileClaimStatus       = "unclaimed" | "invite_sent" | "claimed" | "disputed" | "released"
TalentContactGate        = "open" | "verified_only" | "trusted_only"
```

### Three core records

**`VerificationRequest`** — one per verification attempt. Lifecycle: `draft → pending_user_action → submitted → in_review → approved | rejected | needs_more_info | expired | cancelled`. Carries `claimedIdentifier` (handle / domain / VAT etc.), `verificationCode` (OTP / DNS TXT value), `evidenceUrl` + `evidenceNote`, `publicMessage` (visible to talent), `adminNotes` (admin-only).

**`ProfileVerification`** — the active badge record. Created on approval. Has `publicBadgeEnabled` (badge appears on public surfaces only when true), `status: "active" | "revoked" | "expired"`, optional `expiresAt`.

**`ProfileClaimInvitation`** — one per agency-created profile that needs talent acceptance. Status: `pending | accepted | expired | revoked | disputed`.

### Platform-admin layer (Phase 2)

```ts
VerificationMethodConfig = {
  type, enabled, reviewMode, visibleOn[], availableToTiers[], evidenceRequired, expiresAfterDays
}
VerificationMethodAuditEntry = {
  id, methodType, changedByUserId, changeKind, before, after, at
}
```

`SEED_VERIFICATION_METHOD_CONFIG` is the source of truth. Every change goes through `updateVerificationMethod(type, patch)` which emits one audit entry per modified key.

---

## 4. Context API — what UI surfaces call

All exposed via `useProto()` (`_state.tsx`):

### Reads
- `verificationRequests: VerificationRequest[]`
- `profileVerifications: ProfileVerification[]`
- `profileClaims: ProfileClaimInvitation[]`
- `claimStatusByTalent: Record<string, ProfileClaimStatus>`
- `verificationMethodConfigs: VerificationMethodConfig[]`
- `verificationMethodAudit: VerificationMethodAuditEntry[]`
- `getTrustSummary(subjectType, subjectId): TrustSummary` — **single source of truth** for every trust UI surface
- `getRiskScore(subjectType, subjectId): number` — 0-100 heuristic
- `isVerificationMethodEnabled(type): boolean`
- `getVerificationMethodConfig(type): VerificationMethodConfig`
- `listEnabledMethods(): VerificationType[]`
- `getTalentContactGate(talentId): TalentContactGate`
- `canClientContactTalent(talentId, clientId): boolean`

### Writes
- `createVerificationRequest(input): VerificationRequest`
- `updateVerificationRequest(id, patch)`
- `approveVerificationRequest(id)` — flips request `→ approved`, auto-creates active `ProfileVerification`
- `rejectVerificationRequest(id, reason, publicMessage?)`
- `revokeProfileVerification(id)`
- `revokeInstagramOnHandleChange(subjectType, subjectId, newHandle)` — auto-revokes IG badge when talent edits handle
- `sendProfileClaimInvite(input)`
- `resolveProfileClaimDispute(claimId, "release" | "uphold" | "remove", adminNotes?)`
- `updateVerificationMethod(type, patch)` — emits audit entry per changed key
- `setTalentContactGate(talentId, gate)`

---

## 5. UI surfaces (which file does what)

### Admin
- **`trust-verification-queue`** (`_drawers.tsx`) — review queue. Tabs by status, filter by method, search, bulk-approve, detail panel with evidence + activity log + risk-score pill + decision buttons.
- **`trust-disputed-claims`** (`_drawers.tsx`) — dispute resolution. List + detail with three resolutions.
- **`platform-verification-methods`** (HQ-only, `_drawers.tsx`) — registry console. List + per-method detail with toggle + review-mode + visibility + tier-gate + evidence + expiry + audit log.

### Talent
- **`talent-trust-detail`** (`_drawers.tsx`) — dashboard. Trust Health panel (score + earn-+X suggestions), claim status, IG / Tulala flows, More verifications grid (Phone / ID / Business / Domain / Payment, gated on platform-admin enable), contact-gate radio.
- **`talent-claim-invite`** (`_drawers.tsx`) — claim / dispute / report.
- **`talent-phone-verify`**, **`talent-id-verify`**, **`talent-business-verify`**, **`talent-domain-verify`**, **`talent-payment-verify`** (`_drawers.tsx`) — per-method flows. Each short-circuits to `MethodDisabledNotice` when platform admin disables it.

### Public / shared
- **`TrustBadgeGroup`** (`_primitives.tsx`) — pill-style badge row. Filters by surface ("public_profile" hides admin-only methods; admin surfaces show disabled-method badges with a grey-dot annotation).
- **`ProfilePhotoBadgeOverlay`** (`_primitives.tsx`) — photo-corner badge stack (Instagram gradient + Tulala forest-green). Public-only filter applied.
- **`ProfileClaimStatusChip`** (`_primitives.tsx`) — status pill (Unclaimed / Invite sent / Disputed / Released).
- **`RiskScorePill`** (`_primitives.tsx`) — 0-100 score pill, color-coded healthy / watchful / review. Admin surfaces only.

### Where badges appear
| Surface | Component | Variant |
|---|---|---|
| Roster cell | `RosterTrustCell` (`_pages.tsx`) | `surface="admin_roster"` (sees disabled-method badges with annotation; shows Disputed / Invite-sent claim chips) |
| Roster card photo | `RosterPhotoBadgeOverlay` (`_pages.tsx`) | corner overlay |
| Public profile preview | `TalentPublicPreviewDrawer` (`_talent_drawers.tsx`) | corner overlay + `surface="public_profile"` strip |
| Discover card | `ClientDiscoverPhotoBadge` + `ClientDiscoverTrustRow` (`_client.tsx`) | corner overlay + `surface="public_profile"` strip |
| Discover detail sheet | `ClientTalentDetailSheet` hero (`_client.tsx`) | corner overlay + `surface="public_profile"` strip |
| Chat header (admin / talent / client POV) | `ParticipantTrustStrip` (`_messages.tsx`) | `surface="chat_header"` |
| Inquiry workspace peek | `InquiryTrustPanel` (`_drawers.tsx`) | client + talent two-column with `RiskScorePill` |
| Trust queue detail | inline (`_drawers.tsx`) | full activity timeline + evidence + `RiskScorePill` |

---

## 6. Critical wiring rules

### 6.1 Email-verified ≠ public badge
Hardcoded: `account.emailVerified` is read from `SEED_ACCOUNT_VERIFICATION` and influences `getRiskScore` (+5), but never produces a `ProfileVerification` row. Production must keep this separation.

### 6.2 Method-disable cascade
When platform admin flips `enabled: true → false`:
- The `confirm-disable` modal warns about active badges.
- `getTrustSummary` resolves each badge with `methodEnabled = isVerificationMethodEnabled(type)`.
- Public surfaces (`TrustBadgeGroup` with `surface="public_profile"`, `ProfilePhotoBadgeOverlay`) filter out badges where `methodEnabled === false`.
- Admin surfaces show them with a grey-dot corner annotation + a hover title `"… method disabled platform-wide (still active until expiry)"`.
- New requests of disabled types are **not** blocked by the `createVerificationRequest` call itself; the talent-side drawers (`Talent*VerifyDrawer`) short-circuit to `MethodDisabledNotice` so the talent can't even start.

### 6.3 Required-evidence gate
`cfg.evidenceRequired` is **descriptive metadata** at the platform-admin level. The Talent ID drawer and Talent Business drawer read it and gate submission. Phone / Domain / Payment ignore it because their flow itself is evidence (OTP, DNS lookup, payment hold). If a future method needs to honor it, mirror the ID/Business pattern.

### 6.4 Risk score formula
Lives in `getRiskScore` in `_state.tsx`:
- Baseline: 50
- Each active badge: +12
- `claimStatus === "claimed"`: +10
- `claimStatus === "disputed"`: −25
- `account.emailVerified`: +5
- `account.phoneVerified`: +5
- Each recent rejected/expired request: −8
- Clamped to 0–100

Heuristic only. Production should rebase to a real risk engine. Never expose to public users.

### 6.5 Contact gate enforcement
`canClientContactTalent(talentId, clientId)` returns:
- `true` if the talent's gate is `"open"`
- `true` if gate is `"verified_only"` AND the client has at least one active `ProfileVerification`
- `true` if gate is `"trusted_only"` AND the client's score is ≥ 60
- `false` otherwise

The gate is enforced in **one place** for now: `ClientTalentDetailSheet` Send-inquiry button (`_client.tsx`). To add more enforcement points, call `canClientContactTalent` from the relevant button and disable + tooltip on `false`.

### 6.6 Activity log derivation
The Trust queue detail panel shows a synthesized timeline (`ActivityLogPanel` in `_drawers.tsx`) derived from `request.createdAt` / `updatedAt` / `reviewedAt` + current status. **There is no separate event-log table.** When the system grows past prototype, replace this with a real event-sourced log so multi-step transitions (`submitted → in_review → needs_more_info → submitted → approved`) preserve all timestamps.

### 6.7 Audit log for the registry
Every `updateVerificationMethod(type, patch)` emits one `VerificationMethodAuditEntry` per modified key. The detail panel shows the last 8 entries scoped to the selected method. Production wires this to a real audit table with retention policy.

---

## 7. Lifecycle examples

### A. Talent submits Instagram verification
1. Talent opens `talent-trust-detail`, taps "📸 Verify Instagram".
2. Modal opens: enter handle → optional evidence URL/note → click "Generate code & continue".
3. `createVerificationRequest({ method: "instagram_dm", verificationType: "instagram_verified", verificationCode: "TUL-1234", claimedIdentifier: "@yourhandle", status: "pending_user_action", expiresAt: +72h })`.
4. Drawer shows "Send the DM" instructions. Talent sends DM, returns, taps "I sent it".
5. `updateVerificationRequest(id, { status: "submitted" })`. Lands in admin queue.
6. Admin opens `trust-verification-queue`, sees Marta's request under Pending. Clicks → activity log shows Created + Submitted. Risk score pill renders. Admin clicks "Approve".
7. `approveVerificationRequest(id)`: flips request `→ approved`, creates `ProfileVerification` with `publicBadgeEnabled: true`, `status: "active"`.
8. Public surfaces re-render via `getTrustSummary`. Marta's photo now shows the Instagram-gradient corner badge on Discover, Roster, public preview.

### B. Agency creates profile, talent disputes
1. Agency admin invites Lucas via `sendProfileClaimInvite({ profileId: "t8-disputed", email: "lucas@…" })`. `claimStatusByTalent.t8-disputed = "invite_sent"`.
2. Lucas opens emailed link, lands on `talent-claim-invite`. Reviews profile, picks "Not me".
3. `ProfileClaimInvitation.status = "disputed"`, `claimStatusByTalent.t8-disputed = "disputed"`.
4. Workspace admin sees red ⚠ Disputed pill on the roster cell + a count badge on the Disputed claims settings row.
5. Admin opens `trust-disputed-claims`, reviews. Lucas's risk score is low (−25 for the dispute). Admin picks "Release to talent" → `resolveProfileClaimDispute("pci-002", "release")` → claim status becomes `"released"`, profile freed.

### C. Platform admin disables Domain Verification
1. Platform admin opens `platform-verification-methods`, picks Domain Verified, flips toggle off.
2. If any active badges of this type exist, confirm-disable modal appears: "X active badges will stay valid until expiry but be hidden from public profiles immediately."
3. Admin confirms. `updateVerificationMethod("domain_verified", { enabled: false })` runs; emits audit entry.
4. `getTrustSummary` re-resolves; every badge of this type now has `methodEnabled: false`.
5. Public surfaces (Discover, public preview, roster card photo) drop the badge instantly. Admin surfaces show it with a grey-dot annotation. Talent's `talent-domain-verify` short-circuits to "method not enabled" notice.

---

## 8. Production-wiring TODO

When the prototype meets the real backend, these are the points that need real implementation:

- **IG Graph API webhook** (5.22) — replace manual DM-lookup with webhook receiver + signature verification + auto-approve on match.
- **DNS resolution** — `talent-domain-verify` simulates a 1.5s lookup. Replace with `/api/verify/domain` calling a real DNS resolver, with retry semantics for propagation lag.
- **Stripe payment ping** — `talent-payment-verify` simulates auto-approve. Wire to `PaymentIntent` (`capture_method: manual` then `cancel`).
- **Twilio Verify (or equivalent) for OTP** — `talent-phone-verify` shows the code inline. Replace with real SMS dispatch + server-side code validation.
- **Secure file upload for ID** — `talent-id-verify` accepts a URL. Replace with direct S3 / R2 upload via signed URL + virus scan + auto-redact PII.
- **Audit table persistence** — `verificationMethodAudit` is in-memory. Move to a real DB table with retention.
- **Activity log persistence** — `ActivityLogPanel` synthesizes timeline from current state. Move to event-sourced records so multi-hop transitions preserve all timestamps.
- **Real risk engine** — `getRiskScore` is a hardcoded heuristic. Production should plug in a real signals platform (account-age, behavior, fraud-pattern scores).
- **Public storefront route** (5.23) — `/[profileCode]` doesn't render trust badges yet; only the in-prototype preview drawer does.
- **Notifications** — when a badge is approved / rejected / expires / revoked, the talent should be notified (email + in-app). Currently the prototype only renders state changes inline.

---

## 9. Glossary

| Term | Meaning |
|---|---|
| **Account verification** | Security signal — confirms the human (email, phone, ID). Never a public badge. |
| **Profile claim** | Ownership signal — talent has accepted a profile created in their name. |
| **Trust verification** | Public credibility signal — public-facing badges (IG / Tulala / Domain / Business). |
| **Method-disable cascade** | Hiding badges from public surfaces immediately when platform admin disables the method, while keeping them valid for admin surfaces until expiry. |
| **Risk-health score** | 0–100 internal heuristic combining badges + claim status + account verifications + recent rejections. |
| **Contact gate** | Per-talent setting (Anyone / Verified clients only / Trusted clients only) gating who can send inquiries. |
| **Evidence URL/note** | Talent-provided supporting material on a verification request — e.g. screenshot of DM, link to public registry record. |
| **Public-eligible** | Per-method static flag (`publicEligible: true|false` in `VERIFICATION_TYPE_META`) — whether this badge type **can** ever appear publicly. Distinct from `publicBadgeEnabled` per-record (whether *this specific record* shows on public surfaces). |

---

## 10. File map

| Concern | File | Anchors |
|---|---|---|
| Schema + seeds + context | `_state.tsx` | `VerificationType` (~5410), `VerificationRequest` (~5440), `VerificationMethodConfig` (~5450), `SEED_*` blocks (~5680, ~5790), context fns (~6800–7060) |
| Admin queue + disputed + platform-admin console + per-method drawers + Trust Health panel | `_drawers.tsx` | `TrustVerificationQueueDrawer` (~12894), `DisputedClaimsDrawer` (~13409), `PlatformVerificationMethodsDrawer` (~14290), `Talent*VerifyDrawer` (~14633–14945), `TalentTrustDetailDrawer` (~13684), `TalentTrustHealthPanel` (~13614), `ActivityLogPanel` (~12816), `SubjectRiskScoreRow` (~12805) |
| Badge primitives | `_primitives.tsx` | `TrustBadgeGroup` (~2540), `ProfilePhotoBadgeOverlay` (~2321), `ProfileClaimStatusChip` (~2267), `RiskScorePill` (~2517) |
| Roster integration | `_pages.tsx` | `RosterTrustCell` (~6003), `RosterPhotoBadgeOverlay` (~6010), topbar nav split badge (~542), settings count badges (~8378) |
| Discover + send-inquiry gate | `_client.tsx` | `ClientDiscoverPage` filter chips (~1330), `ClientDiscoverTrustRow` (~1574), `ClientTalentDetailSheet` Send gate (~1818) |
| Inquiry trust panel | `_drawers.tsx` | `InquiryTrustPanel` (~10537) |
| Chat header strip | `_messages.tsx` | `ParticipantTrustStrip` (search by name) |
| Talent public preview | `_talent_drawers.tsx` | `TalentPublicPreviewDrawer` (~5766) |
| Talent settings card | `_talent.tsx` | `TalentTrustCard` (search by name) |
| Help registry (drawer-by-drawer) | `_help.tsx` | "Trust & Verification" block at end |
| Reference docs | `DRAWERS.md`, `ROADMAP.md` (WS-5), this file | — |
