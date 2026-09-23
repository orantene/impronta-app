# Ask: can the chat launcher accept an "ask a question" entry point?

**From:** the Jorg Beauty talent-profile redesign (Maison template)
**To:** whoever owns `TalentProfileChatLauncher` / the guest chat popup
**Status:** a question, not a change request. Nothing is blocked on you.

## The gap

A public talent profile today offers exactly one action: **book**. For a solo
beauty professional that loses the visitor who is not ready to pick a slot yet:

- "I have very fine natural lashes — do 2D fans work for me, or classics?"
- "One nail lifted after four days, is that a repair or a new set?"
- "Can you do this design?" (with a photo)
- "I only have Saturday afternoon, do you ever open later?"

Right now she either books blind or leaves. There is no WhatsApp number or
Instagram on the profile — Jorgelina has not confirmed either — so the only
honest destination is the Tulala inquiry thread you own.

## What I already built (works today, no change from you)

`MaisonAskButton` (`web/src/app/t/[profileCode]/_maison/MaisonAsk.tsx`) fires
two events on click:

```ts
// 1. the INTENT, named for what it is
window.dispatchEvent(new CustomEvent("tulala:ask-question", {
  detail: { talentName, sourcePage, offeringId, offeringTitle, from },
}));

// 2. the seam that already works
window.dispatchEvent(new CustomEvent("tulala:offering-request"));
```

The second one works **because of how your listener is written**:

```ts
// TalentProfileChatLauncher.tsx ~line 174
const onOfferingRequest = (e: Event) => {
  const detail = (e as CustomEvent).detail;
  if (detail && typeof detail === "object") setPendingOffering(detail);
  setOpen(true);                       // ← runs even when detail is null
};
```

A bare `CustomEvent` has `detail === null`, so it skips `setPendingOffering`
and opens the launcher clean, with nothing pre-attached. That is exactly the
behaviour an "ask a question" button wants, and I am relying on it.

## The questions

1. **Is that null-detail path intentional, or incidental?** If someone later
   makes `detail` required, or early-returns when it is missing, my button
   silently stops opening the chat. If it is incidental, I would rather not
   depend on it — which leads to:

2. **Would you take `tulala:ask-question` as a first-class event?** Same
   `setOpen(true)`, but it carries context I cannot pass through the offering
   event without pretending the visitor picked a service:
   - `offeringId` / `offeringTitle` — the service she was *looking at* (may be
     null). Different from "requesting this service": she has not chosen it.
   - `from` — `"menu"` | `"sheet"` | `"visit"`, i.e. where she asked.
   - `sourcePage`, `talentName`.

3. **Can the first message reflect that difference?** The offering path
   prefixes "Requesting: …". For a question the useful prefix is closer to
   "Question about <service>" — or no prefix at all when `offeringId` is null.
   Does the launcher's first-message composer allow that, or is the prefix
   fixed to the requesting shape?

4. **What happens when instant booking is not available?**
   `appointments-plan-policy.ts` caps the free tier at `request`, and
   `loadInstantBookEligibility` only arms on an agency host. So on some
   profiles there is no same-day confirmation at all. Should the launcher be
   the documented fallback in that case — that is, should the profile route
   "book" itself into chat when direct booking is off, rather than showing a
   booking flow that cannot confirm?

5. **Guest identity:** the ask path has no email yet (that is the point — she
   has not filled the booking form). Does the launcher handle an anonymous
   open and collect identity itself, or does it expect a guest cookie to exist
   already?

## Where to see it

```bash
cd web && TULALA_ALLOW_DEV_SURFACES=1 npm run dev -- --port 3200
```

`http://localhost:3200/dev/jor-beauty` → "Tu cita" → **Hacer una pregunta**,
and inside the booking sheet → **"¿Tenés una duda? Preguntá antes de reservar"**.

The dev harness has no launcher (no tenant, no guest cookie, no Supabase), so
a stand-in panel opens instead and prints the exact payload it dispatched —
expand "Ver lo que se envió al chat". That payload is the thing I am asking
you to accept.

## What I am NOT asking for

No visual change to the launcher, no redesign, no new surface. Just: is the
seam safe to build on, and would you rather have a named event than my
null-detail trick.
