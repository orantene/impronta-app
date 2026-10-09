# Guest booking WITHOUT captcha bypass on 8e76b7a5b (isolated fxlank): PASS

- Site: http://rosa-r6a-ahjjta.tulala.digital:3008/ (account A, myself, instant-book "Limpieza profunda"). Same mechanism as run6: chromium --host-resolver-rules=MAP *.tulala.digital 127.0.0.1, direct to :3008. No extra proxy needed or started.
- Hub captcha row (tenant_integrations 0000...0002, integration_key captcha) config_json = {} (verified read-only before and after; updated_at 04:40:31Z unchanged). No provider borrow, no DB writes.
- Widget: .cf-turnstile slot rendered ([data-guest-instant-captcha]); loaded challenges.cloudflare.com/turnstile/v0/api.js and the challenge URL with site key 1x00000000000000000000AA (Cloudflare always-pass test key). Token (cf-turnstile-response, 21 chars) arrived before Confirm.
- Confirm: sheet "CONFIRMADA · PAGAS EN TU CITA ... Viernes 9 de oct, 09:00", POST / 200, no refusal text, no alerts.
- DB (read only): inquiry c73a32f7-eecb-4e77-ae23-43ba65254968 created_at 2026-10-09T04:47:28.679599Z status new (tenant hub 0000...0002); order 3e380962-fac9-4222-9bf6-364c7f5399a3 pending_payment, source_channel instant_book, 850 MXN.
- Server log: booking.confirmed notification for the guest email, no captcha/forbidden errors (only unrelated Upstash and RESEND-unset warnings).
- Files: booking-01-slot.png, booking-02-details-widget.png, booking-03-after-confirm.png, booking-result.json (script: scratchpad/booking.mjs). Note: booking-result.json capBefore/capAfter are empty only because the script queried the wrong column name (key vs integration_key); the correct check is above.
- Caveat: always-pass test keys accept any token, so this proves widget render, token flow and acceptance, not rejection of bad tokens.
