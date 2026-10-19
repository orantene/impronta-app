# Welcome email sequence (TUL-1219): design for Oran's decision

Status: DRAFT, docs only. Nothing here is built. Oran decides the open
questions at the bottom before any code, migration or send.

Scope boundary: this doc does not touch the transactional templates
(`src/lib/email/workspace-welcome.ts`, `src/lib/notifications/email-copy/*`).
Those stay owned by the emails/reviews/SEO builder. The sequence below is
lifecycle mail that follows the transactional "your workspace is ready" email;
it never replaces it.

## 1. Goal

A new owner (a person with a talent page, or a business with a workspace)
reaches the first real result fast: a published page and a first inquiry.
Five short emails over 14 days, each with one action. Stop the moment the
action is done.

## 2. Audience and branching

Two tracks, chosen at sign-up from the plan intent already captured by `/start`
(`person` or `business`). Same five slots, different copy. Language follows the
account locale (ES or EN), never the browser guess.

## 3. The five emails

Voice: plain, warm, tu form in Spanish (Mexican, never voseo). No em dashes. No
price or fee figures in copy (they come from the plan catalog and the commission
config, never typed). One button per email.

### E1. Day 0, sent about 10 minutes after the workspace is ready

Trigger: workspace or talent profile created, and the transactional welcome
already sent. Exit: none (always sent once).

- Subject EN: Your page is live. Here is the one thing to do next
- Subject ES: Tu página ya está en línea. Esto es lo que sigue
- Body EN: Welcome to Tulala. Your page exists, but it only starts working when
  it has a photo and one service. That takes about five minutes. Button: Finish
  my page.
- Body ES: Te damos la bienvenida a Tulala. Tu página ya existe, pero empieza a
  trabajar cuando tiene una foto y un servicio. Son unos cinco minutos. Botón:
  Terminar mi página.
- Link: the onboarding checklist step that is still open (deep link, signed-in).

### E2. Day 2

Trigger: 48 hours after E1. Exit: page published (skip, jump to E4).

- Subject EN: People book pages that show one clear service
- Subject ES: Reservan las páginas con un servicio claro
- Body EN: One service with a price and a duration beats five vague ones. Add
  yours, then publish. Button: Add my first service.
- Body ES: Un servicio con precio y duración vale más que cinco confusos. Agrega
  el tuyo y publica. Botón: Agregar mi primer servicio.

### E3. Day 5

Trigger: 5 days after E1, page still unpublished. Exit: published.

- Subject EN: Your page is ready to be seen
- Subject ES: Tu página está lista para que la vean
- Body EN: You are one click from publishing. Once it is live, share the link
  anywhere you already get messages. Button: Publish my page.
- Body ES: Estás a un clic de publicar. Cuando esté en línea, comparte el enlace
  donde ya recibes mensajes. Botón: Publicar mi página.

### E4. Day 8

Trigger: page published, no inquiry yet. Exit: first inquiry received.

- Subject EN: Share your link, get your first inquiry
- Subject ES: Comparte tu enlace y recibe tu primera solicitud
- Body EN: Put your link in your Instagram bio and your WhatsApp status. Your
  page has a QR code too. Button: Copy my link.
- Body ES: Pon tu enlace en la bio de Instagram y en el estado de WhatsApp. Tu
  página también tiene un código QR. Botón: Copiar mi enlace.

### E5. Day 14

Trigger: 14 days after E1, any state. Exit: none.

- Subject EN: How is it going? Reply and a person answers
- Subject ES: ¿Cómo va todo? Responde y te contesta una persona
- Body EN: Two weeks in. If something is stuck, reply to this email and our team
  answers, usually the same day. If you are on the free plan and want more, here
  is what the paid plans add. Button: See plans.
- Body ES: Van dos semanas. Si algo se atoró, responde este correo y nuestro
  equipo te contesta, normalmente el mismo día. Si estás en el plan gratis y
  quieres más, aquí ves lo que agregan los planes de pago. Botón: Ver planes.
- Button target: `/pricing` (the page from TUL-1192). Plan names and prices are
  read there from the catalog, never copied into the email.

## 4. Triggers and stop rules

| Email | Fires | Skipped or stopped when |
|---|---|---|
| E1 | workspace or profile created, plus 10 min | never |
| E2 | E1 + 2 days | page already published |
| E3 | E1 + 5 days | page already published |
| E4 | publish + 3 days, or E1 + 8 days if published earlier | first inquiry exists |
| E5 | E1 + 14 days | never |

Global stop: unsubscribed, account deleted, or any email bounced or complained.
A person who replies to any email is marked "in conversation" and receives no
further automated mail until support closes the thread.

Evaluation: a daily scheduled job reads "who is due", re-checks the stop rule at
send time (never at enqueue time), and records one row per send so a retry can
never double send. Quiet hours: send 09:00 to 11:00 in the account timezone.

## 5. Unsubscribe

Lifecycle mail is marketing-adjacent, so it carries a real unsubscribe:

- Footer link plus RFC 8058 `List-Unsubscribe` and `List-Unsubscribe-Post`
  headers, pointing at the existing one-click endpoint
  (`/api/unsubscribe/[token]?cat=...`) and `applyCategoryUnsubscribe`.
- New category `lifecycle_onboarding`, off by one click, independent of
  transactional mail. Transactional mail (receipts, booking confirmations,
  security) is never affected.
- The token is the per-user `user_prefs.unsubscribe_token`, the same bearer
  secret already used by other categories. It is not logged and not exported.
- Preference is also visible and reversible in account notification settings.

## 6. Reply-to-support handoff

- `Reply-To: support@tulala.digital` on every email in the sequence. The sender
  name is a person-style name ("Equipo Tulala" in ES, "The Tulala team" in EN).
- The existing inbound mail path (`resend-inbound-forward`) already forwards
  support@ mail to the team. A reply carries a thread header with the user id so
  support sees the account without asking.
- A reply flags the user "in conversation" (section 4) and pauses the sequence.
- Not built here: any auto-reply. A person answers.

## 7. Build outline (after approval)

1. Migration: `lifecycle_email_state` (user, step, sent_at, stopped_reason) and
   the `lifecycle_onboarding` notification category. One migration, `db:push`
   before merge.
2. Pure planner: `(state, signals) -> next send or stop`, unit tested for every
   stop rule and for both languages.
3. Templates: five ES/EN render functions on the shared email layout, no price
   literals, no em dashes (a static test greps for both).
4. Daily job and a dry-run mode that logs who would receive what, with sending
   off by default behind a platform setting.
5. Staging proof with Stripe test and a seeded test user only, never a real
   tenant.

## 8. Success measure

Share of new accounts with a published page by day 7, and with a first inquiry by
day 14, compared with the last 30 days before launch. Unsubscribe rate watched;
above 2 percent per email pauses the sequence for review.

## 9. Open questions for Oran

1. Approve five emails over 14 days, or fewer (E1, E3, E5)?
2. Sender name and address: confirm `support@tulala.digital` as reply-to and
   which display name.
3. Do paid-plan owners get E5's plans button, or a different closing email?
4. Marketing consent: is a one-click unsubscribe enough for MX and EU owners, or
   do we need an explicit opt-in checkbox at `/start`?
5. Send window: account timezone mornings (proposed), or immediate?
