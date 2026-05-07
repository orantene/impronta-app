# Roster Page — Next Steps After This Marathon

**As of:** 2026-05-07 evening
**Marathon commits:** 11 local (see `git log ec583139..HEAD`)
**Status:** Roster's most-critical behavior shipped at the code level. Migration + photo-upload UI + Services-tab schema + live QA still owed.

---

## What ships in this marathon (committed locally, not pushed)

| Slice | Files | Status |
|---|---|---|
| Real-data identity banner + sign-out | `_real-identity-banner.tsx`, `admin/layout.tsx` | ✅ shipped |
| Phase 1 — bridge tenant + session identity | `_data-bridge.ts`, `_state.tsx`, `_pages.tsx` | ✅ shipped |
| Phase 1 — sync `state.plan` + `state.role` from bridge | `_state.tsx` | ✅ shipped (unblocked Settings/Team) |
| Phase 1 — TENANT singleton mutation | `_state.tsx` | ✅ shipped (cascades to ~30 mock-string sites) |
| Roster headshots from `media_assets` | `_data-bridge.ts` | ✅ shipped (5/6 cards verified) |
| Real greeting + remove `length>0?real:MOCK` fallback | `_pages.tsx` | ✅ shipped |
| **CRITICAL: New Inquiry save → real DB write** | `admin-inquiries.ts`, `_messages.tsx` | ✅ shipped |
| Talent identity migration (7 columns) | `supabase/migrations/20260907130000_talent_identity_fields.sql` | ⏳ **needs apply** |
| `updateTalentIdentity` server action | `admin-talent-identity.ts` | ✅ code · ⏳ runtime blocked by migration |
| Drawer Identity autosave (debounced 800ms) | `_drawers.tsx` | ✅ code · ⏳ runtime blocked by migration |
| Remove from roster action (delete ≠ delete account) | `admin-talent-roster.ts` | ✅ shipped |
| Drawer Remove button + confirm dialog | `_drawers.tsx` | ✅ shipped |
| Drawer autosave status pill (Saving / Saved / Error) | `_drawers.tsx` | ✅ shipped |
| `setTalentCardPhoto` action (server-side metadata write) | `admin-talent-roster.ts` | ✅ code · ❌ no UI yet |

---

## Next steps in priority order

### 1 — Apply the migration (60 sec, blocks autosave testing)
Open Supabase Studio for project `pluhdapdnuiulvxmyspd` → SQL Editor → paste contents of `supabase/migrations/20260907130000_talent_identity_fields.sql` → Run. Without this:
- Drawer's Identity autosave fails at runtime with "column legal_name does not exist"
- The Vercel build fails the migration-drift check

### 2 — Wire the actual photo-upload UI (~2-4 hr)
The server action (`setTalentCardPhoto`) is ready. The UI needs:
1. Add a "Change photo" button next to the talent's avatar in the drawer header
2. File picker (`<input type="file" accept="image/*">`)
3. Client-side upload to Supabase Storage at `${talentId}/avatar-${Date.now()}.${ext}`
4. Read image dimensions (`createImageBitmap` or `<img>` natural dimensions)
5. Call `setTalentCardPhoto({ talent_profile_id, storage_path, width, height })`
6. On success, update the in-memory state.coverPhotoUrl + invalidate roster query

**RLS check first:** verify storage bucket `media-public` has a policy that lets staff upload to `${talentId}/*`. Probably exists (canonical roster page uses it) — confirm before wiring.

### 3 — Verify Add Talent end-to-end live (~30 min, after migration applied)
Already wired (`createRosterTalent` is real per audit). Steps:
1. Apply migration
2. Push to Vercel (or test on localhost)
3. Sign in as `qa-admin@impronta.test`
4. Roster → Add talent → fill form → Save
5. Verify new row in `agency_talent_roster` + `talent_profiles`
6. Refresh roster — new talent shows

### 4 — Test Remove button live (~10 min, after migration applied)
1. Open any roster card (Adriana Vega, Carmen Díaz, etc.)
2. Click "✕ Remove" in drawer header
3. Confirm prompt: "Remove [Name] from your roster? They'll keep their Tulala account…"
4. Click OK
5. Drawer closes, toast "[Name] removed from your roster"
6. Verify in DB: `agency_talent_roster.status = 'removed'`, `removed_at` set, `removed_by` = qa-admin's user_id
7. Verify `talent_profiles` and `auth.users` UNTOUCHED
8. Roster list refreshes — talent gone from view
9. Use `restoreToRoster` (no UI yet — call directly from JS console or a dev helper) to verify reversibility

### 5 — Services tab schema + autosave (~1 day)
The Services tab in the prototype edits 6+ slices: primaryType, secondaryTypes, aspirations, specialties, contexts, skillEntries, rates, packages.

Already-wired:
- primaryType / secondaryTypes → `talent_profile_taxonomy` via `addTalentTaxonomyTerm` / `removeTalentTaxonomyTerm`

Schema gaps (need migration):
- `aspirations TEXT[]` (array of strings)
- `specialties TEXT[]` (array of strings)
- `contexts TEXT[]` (e.g. "weddings", "editorial", "campaigns")
- `skill_entries JSONB` (array of `{ skillId: string, proficiency: 1-5 }`)
- `rate_card JSONB` (per-service-type rates)
- `package_offerings JSONB` (named packages with bundled services + price)

Build pattern (matches Identity slice):
1. Migration: ADD COLUMN for each
2. `updateTalentServices` action with zod validation
3. Drawer autosave hook for `state.aspirations`, `state.specialties`, etc. (debounced)
4. Status pill already exists — same UI for Services autosave

### 6 — Other tabs (each ~½–1 day)

**Location** — `serviceArea` (homeBase, serviceCities, travelKm, travelFee, remoteOnly), `seasonalWindows` array. Some fields exist (home_city_text, residence_city_id) but the prototype's richer shape needs new columns or a `talent_service_area` enrichment.

**Media** — `coverPhotoUrl` (banner photo, distinct from card avatar), gallery photos. Builds on the photo-upload pattern from #2 but with multiple variants.

**Albums** — `albumsPro` array of `{ id, name, items: PhotoMeta[] }`. Needs new tables: `talent_albums` + `album_items` (or JSONB on talent_profiles).

**Polaroids** — Standard 5-pose set (front/side/back/smile/no-makeup). Schema as `polaroids JSONB` on talent_profiles or dedicated `talent_polaroids` table. Probably JSONB is fine.

**About** — Bios already partial (bio_en/bio_es fields exist). The prototype's `bios: LocaleBio[]` array shape is richer — multiple locales beyond en/es. Needs migration to support arbitrary locales OR keep current 2-language model and document limit.

### 7 — Pending self-registrations queue ("3 self-registrations waiting")
Currently mock per audit. Wire to real `verification_requests` table (already exists). Replace `SEED_PENDING_TALENT` consumption in roster page.

### 8 — Other stub handlers across the workspace
Same pattern repeats elsewhere:
- Settings → Branding "Save" → toast-only stub
- Settings → Workspace fields → toast-only stub
- New Booking drawer → toast-only stub
- Invite teammate → toast-only stub (but team-management caps blocked by plan tier so harder to test)
- ~25+ others per audit

Each needs: server action + drawer wiring. Pattern is now established (see `createAgencyInquiry` for the simplest template).

---

## Key principles established this marathon

1. **Prototype = product spec. Schema must catch up to UI, not the reverse.** Where the prototype shows a field that has no column, ADD COLUMN. Don't strip the UI down to existing schema.

2. **`useSaveAndClose` is the prototype's signature lie.** Every "Save / Publish" button using it is a toast-only stub. Audit every reference (~30 spots) and replace with real server actions one by one.

3. **`__inquiryStore.push(record)` and similar client-side stores never reach DB.** They live for the session and vanish on refresh. Replace with server actions, every time.

4. **Singleton mutation > 30 inline replacements.** When a `const` constant like `TENANT` or `MY_TALENT_PROFILE` is referenced in many places, mutate the object's fields once in `ProtoProvider` from bridge data. Cascades to every consumer.

5. **`state.plan` and `state.role` drive capability gates.** Sync them from bridge identity at init. Otherwise admin-tier users see free-tier locks.

6. **"Delete" in this product = remove from roster, NOT account deletion.** Talent keeps Tulala account, all data, and history. Only the agency relationship is severed (`agency_talent_roster.status = 'removed'`). Hard delete only allowed when (a) talent's `user_id` is NULL (unclaimed) AND (b) only this agency has them on roster.

---

## Recommended cadence going forward

- **One tab per session/marathon** (Identity took this whole session — and that was just one tab of one drawer of one page)
- **Migration first, code second, UI third** — apply migration → build action → wire autosave → add status pill UI → live QA
- **Sonnet for UI wiring + small actions, Opus for schema design + cross-file refactors**
- **Push every successful slice to Vercel** — local-only commits accumulate risk
