---
cursor:
  subagentId: "bc-c81d48b1-f116-55e4-872e-7823a8f82e8e"
---

# LIVE re-prove — **PASS** (2026-10-04 ~05:10Z)

| Item | Value |
|---|---|
| Tip / LIVE | Git `production`=`a384e274b` (#2524) · HTML `dpl_8gvjZEZiziwcJ6kLzFoi9TTRzrtK` on `jorg-beauty-qa` |
| DB `guest_captcha_enforced` | **false** (OFF during prove) |
| Result | **`PASS_SKIP_CAPTCHA`** |
| CTA | Continuar al pago present |
| Captcha | absent (`iframeN=0`, `dataN=0`, `soyN=0`, no Soy humano) |
| Evidence | `media/guest-captcha-off/01–07-*.png` + `result.json` · `/tmp/guest-captcha-off-prove-a384.log` |

## Fix verified

#2524 `GUEST_CAPTCHA_BOOKING_OFF = {provider:"none"}` — booking chrome no longer falls through `bookingCaptcha ?? formCaptcha` to CMS hCaptcha.

## Next

1. Flip HQ `guest_captcha_enforced=true`
2. LIVE prove widget / Soy humano returns
3. Handover inbox ping when ON also PASS

Money Soft Gel already PAID.
