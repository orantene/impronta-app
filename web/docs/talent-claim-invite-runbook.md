# Claim invite runbook — getting the roster owned

**Status:** ready to run once real phone numbers exist. Nothing has been sent.
**Owner of this doc:** Directory & Profile Engine.

## Why this is the first job

87 of 92 talent profiles have `user_id IS NULL` — no human owns them. One
claim invitation has ever been created, and it was never redeemed. Every other
quality number on the platform is a symptom: 144 of 261 fields have never been
filled, 51 of 78 listed profiles have no bio, and exactly **one** listed
profile meets the platform's own publish floor.

No editor change, field, validator or template moves those numbers. A human on
the other end of the profile does.

## The one thing that blocks it

**Every email address on the roster is invented.** They were typed in by the
agency when the profiles were created, and the talent never confirmed them.
Measured on Impronta's 47 real candidates:

| verdict | n | examples |
|---|---:|---|
| structurally unroutable | 13 | `@placeholder.impronta.test`, `gmail.comest`, `hmail.com`, one with no `@` at all |
| plausible but unverified | 34 | gmail / hotmail / icloud, typed from memory |

Sending to any of it risks hard bounces on a domain with **zero** sending
history (`email_suppressions` is empty). Do not mass-send email.

**What is needed instead: a way to reach each talent.** WhatsApp, Instagram, in
person. A phone number is enough. An email is not required at all.

## How the flow actually works

1. `sendTalentClaimInvite({ talent_profile_id, email?, phone? })` takes the
   contact **as a parameter**. It does NOT read `talent_profiles.invitation_email`,
   so the junk in the database is never used and never mailed.
2. It revokes any prior pending invite for that talent, inserts a fresh row in
   `talent_claim_invitations`, stamps `invited_to_claim_at`, and returns a
   `redeem_url` of the form `/register?invitation=<id>`.
3. The admin UI now shows that link with a Copy button, as an absolute URL on
   the current host. **This is the delivery channel.** SMS is a later phase and
   is not switched on; email goes only to whatever address was typed.
4. The talent opens the link, signs up, and `claim_talent_profile(invitation_id,
   email)` links their new account to the existing profile. It returns one of
   twelve explicit verdicts and never throws.

### Email or phone — which to use

**Prefer phone.** If the invite carries an email, the RPC enforces
`email_mismatch`: the talent must sign up with that exact address. Against
invented data that guarantees failure. A phone-only invite carries no email
constraint, so the talent signs up with whatever address they really use.

## Running it

Per talent, in the workspace roster:

1. Open the talent's profile drawer → the claim card ("You own this profile ·
   talent has no account yet").
2. **Send claim invite** → enter the **phone number**, leave email blank.
3. Copy the claim link.
4. Send it to them on WhatsApp with a line of context. Suggested, in Spanish,
   because this roster is Argentinian:

   > Hola {nombre}, soy {tu nombre} de Impronta. Te preparamos tu perfil y ya
   > está listo. Con este link lo reclamás y podés editar tus fotos, tu bio y
   > tus tarifas vos misma: {link}

5. If they lose it, **Resend invite** issues a fresh link and revokes the old
   one.

### Start small

Do **five** first, from talent you can reach today and who will actually
reply. Confirm end to end that a claim completes and the profile shows as
claimed. Only then work through the rest. A batch of 64 links sent before the
first one is proven is 64 chances to discover the same problem.

## What to watch

| signal | where | healthy |
|---|---|---|
| invites created | `talent_claim_invitations` | rising |
| redeemed | `talent_claim_invitations.redeemed_at` | rising behind it |
| owned profiles | `talent_profiles.user_id IS NOT NULL` | rising, currently 5 |
| claim failures | `claim_talent_profile` verdicts | `email_mismatch` should be ~0 if invites are phone-only |

## After the claim

A claimed profile is not a finished one. The roster card now shows what each
profile still needs ("Still needs: a bio, 1 language") drawn from the same gate
the Publish button enforces, so the follow-up is visible per talent rather than
guessed.

## Open decisions

- **9 test accounts** sit on the Impronta roster and should not be invited.
  Disposition not yet decided; the safe default is a reversible soft-delete
  (`deleted_at`) rather than a hard delete.
- **Twilio** is unconfigured. Only needed if the platform should send the SMS
  itself; the copy-link flow does not need it.
