# Admin Workspace — Deep QA Findings

**Date:** 2026-05-07
**Tester:** Claude (via Chrome MCP, localhost:3000)
**Logged in as:** qa-admin@impronta.test (Admin role on Impronta tenant, AGENCY plan)
**Method:** Click every CTA, follow drawer/redirect/save flows to the end, verify DB writes where applicable.

---

## Severity legend
- **S1** — broken / blocks user task
- **S2** — visible mismatch with reality (mock data leaked, wrong gating)
- **S3** — UX issue / friction / unclear copy
- **S4** — polish / nice-to-have

## Status
- 🔴 = open
- 🟡 = noted, deferred to phase plan
- 🟢 = fixed in this marathon

---

## A. Top bar / chrome

(findings populated as I walk)

## B. Overview / Today

### B.1 — "+ New inquiry" drawer (top-right CTA)
- **Status:** 🟢 **S0 — FIXED in this marathon (was the most critical bug found)**
- Drawer opens with a real 4-section form (Category chips / Who's it for / When / Where / Who you want).
- **Initial finding:** Filled `Contact name`, `Contact email` and clicked **Save inquiry** → silent no-op. NO DB write. Verified by querying `inquiries` table directly: zero rows with the test email. Most recent real inquiry was 4 days old (seed data).
- **Root cause:** `_messages.tsx:8552` `send()` handler called `__inquiryStore.push(record)` — a client-side mock store. Then triggered `useSaveAndClose` which is just `toast(); closeDrawer();` — NO server action. The toast "Inquiry created" was a lie; nothing reached the database.
- **Severity (initial):** S0 — the agency's CORE WORKFLOW (Inquiry → Coordination → Offer → Approvals → Booking) was BROKEN AT STEP 1. Real Impronta could not create inquiries through the UI. The 3 open inquiries showing were all seed data ("Sarah Chen / Luxe Brands", "Marco Rivera", "Anna Kowalski / Vogue MX"). Every "Create" attempt since the prototype shell took over silently failed.
- **Fix shipped:**
  1. New server action `createAgencyInquiry` in `lib/server-actions/admin-inquiries.ts`. Validates with zod, requires staff tenant scope, INSERTs into `inquiries` with proper `tenant_id`, links talent via `inquiry_talent`, writes audit log entry, revalidates layout.
  2. Replaced `InquiryComposer.send()` in `_messages.tsx`. When `mode === "admin"`, calls the new server action with the draft fields. On success: toast + `router.refresh()` + `onSubmit()`. On error: keeps drawer open so user can retry. Includes `isSaving` guard against double-submit.
  3. Hub/client modes still use the prototype mock store (their canonical write paths live elsewhere — public inquiry submit + hub intake).
- **Cosmetic bug remaining:** two sections labeled "2." (Who's it for + When) — visual numbering bug, deferred.
- **Master plan phase:** Phase 3 (drawer actions wired). Pattern established for the remaining ~30 toast-only stub handlers.

### B.2 — Activation arc CTAs ("Send your first inquiry", "Set up payouts", "Configure domain")
- TODO test individually

### B.3 — "Load demo data" banner
- TODO

### B.4 — "Open today's pulse"
- TODO

### B.5 — KPI strip (Needs you / Active / Confirmed / Views 7d)
- 🟡 S2 — confirmed mock per earlier audit. "Views 7d: 284" hardcoded; no analytics backend.

## C. Roster

## D. Messages / Inquiry workspace

## E. Calendar

## F. Clients

## G. Operations

## H. Production

## I. Website

## J. Settings

## K. Plan tier matrix (Free / Studio / Agency)

## L. Recommendations
