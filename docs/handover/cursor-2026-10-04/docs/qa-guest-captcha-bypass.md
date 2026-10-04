# QA guest captcha bypass (production)

**Decision trail (Oran 2026-10-03):**
1. Production guest hCaptcha stays for real guests.
2. First proposal: `@impronta.test` + server env secret (not a public flag).
3. **Update:** Oran wants a **platform-admin UI switch** to temporarily deactivate guest captcha for everyone (QA convenience). Sibling **[Platform admin captcha switch](https://cursor.com/agents/bc-32186601-e1fc-5870-9896-941eff869d1c)** owns that ship — see [guest-captcha-admin-switch.md](./guest-captcha-admin-switch.md).

---

## Status (this agent)

| Item | Status |
|---|---|
| Locate verify path | Done (below) |
| `@impronta.test` + `QA_GUEST_CAPTCHA_BYPASS_SECRET` PR | **Paused / not shipped** — no commit, no PR; local WIP discarded to avoid colliding with admin switch |
| Conflicting public / `NEXT_PUBLIC_*` flag | **Not shipping** |
| Platform-admin temporary deactivate | Owned by sibling `bc-32186601` |

After the admin switch lands, money S4–S6 on TAL-93900 can flip the switch (or use Take Control). The narrow `@impronta.test`+secret path remains a possible later add-on for unattended automation **without** turning captcha off for all guests — only if still needed.

---

## Where guest Continuar al pago validates captcha

| Layer | File | Role |
|---|---|---|
| Server verify | `web/src/lib/scheduling/instant-book-guest.ts` → `verifyTenantCaptchaToken` | hCaptcha/Turnstile `siteverify` for guest instant book |
| Actor gate | same → `resolveInstantBookActor` | Captcha fail → challenge error |
| Action | `web/src/lib/server-actions/instant-book-action.ts` → `createInstantBookingAction` | Continuar al pago / instant-book |
| UI catalog | `web/src/components/public-booking/CatalogBookingSheet.tsx` | Widget + `captchaRequired` |
| UI shared contact | `web/src/components/public-booking/GuestInstantContact.tsx` | Slot picker / purchase / OfferingInstantMount |
| Chrome load | `web/src/lib/scheduling/guest-instant-chrome.ts` | Resolves tenant captcha config for widgets |

Dev-only host skip (`TULALA_ALLOW_DEV_SURFACES` + localhost/`*.lvh.me`) does **not** apply on `*.tulala.digital`.

---

## Handoff for platform-admin switch (sibling)

**Hook the off-switch in `verifyTenantCaptchaToken`** (same place a QA bypass would land): when platform says guest captcha is temporarily off, return `{ configured: false, ok: true }` before `resolveTenantCaptcha` / siteverify.

**UI half:** when the switch is off, `loadGuestInstantChrome` / captcha config passed to CatalogBookingSheet + GuestInstantContact should not require the widget (else guests/QA are stuck with a challenge that the server no longer accepts tokens for — or the opposite mismatch). Mirror client + server.

**Pattern to copy (not a public env flag):**
- `platform_settings` boolean + HQ card, like `PlatformWorkspaceUiCard` / `web/src/lib/platform/workspace-ui.ts`
- Server action under platform admin scope only
- Default **ON** (captcha enforced) — fail closed when row/column missing
- Document in FEATURES.md: temporary ops switch, owner Oran/eng

**Do not:** `NEXT_PUBLIC_*`, query `?skipCaptcha=`, or client-only hide without server gate.

---

## Deferred alternative (not conflicting)

If later we still want unattended Playwright **without** flipping the platform-wide switch:

- Guest email `@impronta.test` **and**
- Server env `QA_GUEST_CAPTCHA_BYPASS_SECRET` matching header `x-qa-guest-captcha-bypass`
- Fail closed if either missing

That path was prototyped then discarded when Oran prioritized the admin UI switch. Revisit only if the switch is too coarse for production QA.
