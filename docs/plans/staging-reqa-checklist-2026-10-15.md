# Staging re-QA checklist (Oct 15, 2026)

One pass for QA on the next staging build. Every card below is **fixed on main** but was **not in production `a744cd7`** when it was last tested, so its old FAIL or open finding is stale. Oran approves this list for the next staging build.

**Before you start**
- The build under test must contain main at or after `fc929eb` (#3780). Check that the build SHA is a descendant of every commit listed below.
- Staging shares the production database, so tests are **read-only**. No real payments, no messages to real people. Use the QA accounts only (talent **TAL-93900** / QA Max, client **qa client**). Never TAL-93938.
- "ES + EN" means: run the step with the dashboard or page in Spanish, then in English. "390" means a 390x844 viewport, "1440" means desktop.
- Record one line per card on its Notion card: `PASS|FAILED · <build sha> · <url> · <viewport> · <what you saw>`.

---

## 1. Client sign-up and sign-in (client)

| Card | Fixed by | Steps | Expected |
|---|---|---|---|
| 759 | #3822 `3eff88c` | Signed out, at 390 + 1440: from the hub home, a talent profile and the marketing header, look for a client "Create account" link. | A clear client sign-up entry that goes to `/register?as=client`, not the seller `/start`. |
| 761 | #3822 `3eff88c` | Open `/register?as=client` (ES + EN). | The left panel talks to clients (no "Your business"), and the email placeholder is not `you@studio.com`. |
| 762 | #3822 `3eff88c` | Same page. | The form asks for a name. |
| 766 | #3822 `3eff88c` | Start a client sign-up up to the code step, then reload. | The code step is kept in the URL, and the reload lands back on the code step, not an empty form. |
| 767 | #3822 `3eff88c` | Log in with an account that is not verified yet. | The message says the account is unverified and offers to resend the code (no generic error). |
| 771 | #3822 `3eff88c` | Finish a client sign-up from `/register?as=client`. | No `/onboarding/role` question; the client role is already saved. (Folded into TUL-772.) |
| 778 | #3822 `3eff88c` | Look at `/login` and `/register` buttons (ES + EN). | One wording for the code button everywhere, and the password submit reads as a normal sign-in. |
| 782 | #3822 `3eff88c` | Sign in as two different client accounts. | Both land on the same client home. |
| 787 | #3824 `e2de963` | Public site at 390: signed in, then signed out. | Signed in: avatar plus name. Signed out: a visible "Sign in" outside the hamburger. |
| 788 | #3829 `a1461a8` | Open two tabs signed in, sign out in one, switch to the other. | The second tab notices the sign-out without a manual reload. |
| 826 | #3829 `a1461a8` | Sign-up code step at 390 + 1440: tap/click the code boxes. | The input takes focus easily, and typing fills the boxes. |
| 851 | #3829 `a1461a8` | `/login` (ES + EN). | No warning that blames `+` addresses or the user's inbox. |
| 893 | #3829 `a1461a8` | `/register` in ES: type `abc@` and submit. | An inline error in Spanish (no English browser tooltip). The page opens in the visitor's language. |
| 909 | #3829 `a1461a8` | `/login` code step: type 7 digits. | The field shows the digit count / boxes and a resend countdown, and a short code gets a specific message. |
| 910 | #3829 `a1461a8` | `/login` flow (ES + EN), 390 + 1440. | Short confirmation text, a plain eyebrow, and the card does not jump between steps. |

## 2. Talent dashboard, settings and support panel (talent, TAL-93900)

| Card | Fixed by | Steps | Expected |
|---|---|---|---|
| 543 | `b2073f9` (Posts G4) | `/talent/today` and inbox counts. | Dashboard counts match the inbox and studio. |
| 579 | `0598375` (Posts G2) | `/talent/today` on a free and a paid talent. | Dashboard text matches the plan and the publish status. |
| 582 | `0598375` (Posts G2) | `/talent/today`. | A "Mi presencia" stats card (visits, sources, bookings). |
| 600 | Posts G6 `fdac30a` | Support: start a NEW ticket. | The new-ticket form has an attachment field. |
| 717 | #3760 `4ef0be7` | `/talent/clients`. | "Nuevo N" counts only new clients, not all of them. |
| 726 | #3787 `9ec9a6e` | `/talent/settings` in ES, talent with no agencies, 390 + 1440. | No English in Quién puede contactarte (Básico / Verificado / Plata / De confianza), the Plan card, Ocultar en todas partes, or the notice copy. |
| 728 | `5ec78ee` (#3760) | `/talent/settings` → hide a public page. | It does not hang on "Cargando tu sitio…" (it retries or finishes). |
| 824 | `f9a0224` (#3757) | Open `/talent/services`. | The page loads without about 10 s of "Cargando". |
| 906 | #3760 `4ef0be7` | On the talent dashboard press `?`. | Only the Keyboard shortcuts dialog opens (no Ctrl+K palette), and one Escape closes it. |
| 907 | `5ec78ee` / Posts G7 `e401675` | 390: tap the header name chip, open More, widen to desktop; check "Request a booking" and the "Close" link. | The chip opens the profile, More does not stay full-screen on desktop, and the bottom nav covers nothing. |
| 914 | `a7684d1` (Posts G6) | Open Dinero, the page builder and the editor (390 + 1440). | The loading skeleton sits inside the app shell, not above it. |
| 915 | #3757 | `/talent/services` banner and subtitle (ES). | The same word in both (elemento or artículo). |
| 916 | #3760 `4ef0be7` | `/talent/settings`, screen reader / accessibility tree. | "Cerrar tu cuenta" and the panel ✕ have different accessible names. |
| 917 | #3791 `44a7c0e` | Page-builder preview for the QA talent (ES). | No "Seeded fixture…" or "(draft edit)". Existing staging rows may need a staging data edit (see commit). |
| 926 | #3823 | Support chat at 390, then desktop. | No 20 px right gap, "Leave an email" fully visible, and on desktop it does not cover the hero. |
| 942 | #3823 | Support: ask something that escalates. | "Hablar con una persona" appears once. |
| 943 | #3823 | After escalating. | "¿Te ayudó esto?" shows both Sí and No. |
| 949 | Posts G10 `1e59307` | Support box at 390: type, press Enter. | Enter sends (Shift+Enter adds a new line). |
| 950 | `0598375` (Posts G2) | `/talent/today` at 390. | The top bar does not cover "Buenas tardes", and Lo que sigue names are not cut. |
| 980 | #3818 `8679bff` | Go to `/talent/inbox` and other pages. | "Soporte" stays in the sidebar on every page. |
| 986 | #3787 `9ec9a6e` | 390: open the Más menu. | It has a Plan entry that opens the plan comparison, with the same labels as desktop. |
| 1027 | `003b93e` (Posts G5) | Theme editor at 1440 (ES). | Theme and font names wrap, not truncated ("Malla rosa", "Cinzel editorial"). |
| 1028 | #3811 `92a12b9` | `/talent/site` at 390 + 1440. | Copy and ↗ icons sit beside the domain pill. The "tiene una actualización" notice is one compact row and does not push the preview down. (Already PASSED on staging 003b93eb / 5934c24c.) |

## 3. Inbox, inquiries, bell and client hub

| Card | Fixed by | Steps | Expected |
|---|---|---|---|
| 951 | #3759 `4ef0be7` | `/es/t/<hub talent>` → open the inquiry drawer. | Fully Spanish (no "Send a request / Review / Send to coordinator / Inquiry sent"). |
| 952 | #3759 | Inquiry drawer: fill name + email + brief, no phone. | "Review" enables, and a missing field is named. |
| 958 | #3759 | Talent sends an offer, then checks their own bell. | The bell says the offer is waiting on the client, not "Tienes una oferta por revisar". |
| 960 | `4c86657` | 390: open the bell. | The bottom sheet has a dimmed backdrop. |
| 961 | #3787 `9ec9a6e` | Talent → Dinero → payment requests. | The client slot shows the client name (or "Cliente"), never the service name. |
| 965 | #3759 | Signed-in client opens the hub inquiry drawer. | No empty "New client" box, and the name is prefilled. |
| 967 | #3759 | Client inquiry list. | Inquiries with a brief show a title, not "Unnamed inquiry". |
| 969 | #3787 `9ec9a6e` | `/client/hub` with one MXN and one USD booking (ES + EN). | "$900 MXN" and "$50 USD" (no "MX$900.00" next to a bare "$50.00"). |

## 4. Public site, directory, booking and marketing (signed out)

| Card | Fixed by | Steps | Expected |
|---|---|---|---|
| 565 | #3832 `09db5ee` | Marketing home at 1440 + 390. | Even headings, no lone feature card on its own row. |
| 802 | #3816 `f464428` | `/es/directory?q=limpieza` and `?q=casa`. | Matching cleaning/home talents are returned. (A "Limpieza de casas" facet row is taxonomy data, not code.) |
| 822 | #3810 `f28d3f2` | Talent → Horario → time zone picker in ES. | Spanish city names (Ciudad de México, Cancún, Bogotá, Nueva York…). EN unchanged. |
| 978 | #3791 `44a7c0e` | `hub.staging` home. | No `.local` / `.localhost` entries, and a search box. |
| 984 | #3792 `d201e05` | Talent at 390 → Calendario tab. | The page title matches the tab ("Calendario"). Also check the large blank area is gone; if it is still there, mark that part FAILED. |
| 1066 | #3817 `8cc039c` | Concierge on a talent site. | "In your inquiry" / "Saved" sit in an inquiry tray, not in the scrolling tabs. |
| 1159 | #3780 `fc929eb` | Concierge dock at 1440. | The "Talent & services" tab label is not truncated. |

## 5. Already live: production proof only (no staging run needed)

| Card | Fixed by | Steps on production |
|---|---|---|
| 671 | #3555 `86113bf` | Talent profile editor: the Campos de agencia panel settles, shows no debug copy, and is staff-only. |
| 88 | integ batch 6 `64a0f1f` | Maison v2 talent site header + hero show a main "Reservar cita" button. |

## Not in this build (do not re-test yet)

These have an earlier fix on main that **failed** QA. The rework sits in an open PR, so testing them on this build would just fail again.

| Card | Why | Where the rework is |
|---|---|---|
| 729 | Help row lost its shortcuts and help-centre link (QA 1:51 PM) | Posts lane |
| 821 | Time zone moved to the top of Horario | PR #3806 (open) |
| 946 | Blank /admin page before redirect | Client g10 follow-on |
| 953 | Partial-date inline error (guest chat date editor) | Booking rework PR (open) |
| 955, 956, 962 | Inbox original message, per-thread URL, button wrap | PR #3835 (open) |
| 959 | Bell "Nueva cita confirmada" rows clickable | PR #3843 (open) |
| 670, 702, 721, 734, 736, 799 | Failed with their original fix included | PR #3857 (open) |
| 738 | ES directory accents and role titles | No fix in flight |

Not on main at all (still open work): 823, 922, 944, 947, 948, 927, 966, 968, 970, 971.
