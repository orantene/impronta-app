# Meta + TikTok app registration checklist (owner action)

Start this TODAY — App Review is the long pole (weeks). Everything in Phase 2/3 of
`social-feed-integration-plan-2026-07-24.md` waits on the 4 env vars at the bottom.

Assumption: **Tulala owns one app for all tenants** (the recommended model — tenants get
true one-click connect, nobody else does a review).

The agent cannot do these steps: they need your identity, your business verification, and
your Meta/TikTok logins. Do not share credentials — just complete them and hand over the
4 values at the end.

---

## A. Instagram (Meta)

**Product to enable: "Instagram API with Instagram Login".**
NOT "Basic Display" (shut down Dec 2024) and NOT "Instagram API with Facebook Login"
(forces tenants to have a linked Facebook Page — worse UX, more support load).

1. https://developers.facebook.com → My Apps → Create App → type **Business**
2. Add product → **Instagram** → set up → **Instagram API with Instagram Login**
3. **Permissions — request ONLY:**
   - `instagram_business_basic`

   Do NOT request `instagram_business_manage_messages`,
   `instagram_business_content_publish`, or insights scopes. Each extra scope adds review
   scrutiny and rejection risk, and the feed widget needs none of them.
4. **Valid OAuth Redirect URI** (exact, no trailing slash):
   ```
   https://app.tulala.digital/api/connections/oauth/callback/instagram
   ```
   Add this one too if you want to test against a preview host later:
   ```
   https://tulala.digital/api/connections/oauth/callback/instagram
   ```
5. **Business verification** — Meta will ask for business documents. Start this early; it
   is often slower than the review itself.
6. **Privacy policy URL** — must be live at a real domain before submitting.
   `https://tulala.digital/privacy` (confirm the route exists and is public).
7. **App Review submission** needs a screencast showing:
   - an operator clicking Connect in Tulala's Settings → Integrations
   - the Instagram login + consent screen
   - the connected account's posts rendering on a public Tulala storefront page

   Write the use-case description as: *"Business/Creator accounts connect their own
   Instagram to display their own recent posts on their own public website built with
   Tulala."* That is a well-understood, low-risk use case.

**Tenant-side requirement to document in our UI:** their Instagram must be a
**Business or Creator** account. Personal accounts cannot connect. We should say this on
the card *before* they click, not after a failed OAuth.

---

## B. TikTok

1. https://developers.tiktok.com → Manage apps → Create app
2. Add product → **Login Kit** + **Display API**
3. **Scopes — request ONLY:**
   - `user.info.basic`
   - `video.list`
4. **Redirect URI:**
   ```
   https://app.tulala.digital/api/connections/oauth/callback/tiktok
   ```
5. **Production audit** needs: privacy policy URL, a demo video covering every requested
   scope, and a data-handling description.
6. Same use-case framing: read-only display of the connecting user's own videos on their
   own website.

---

## C. Hand over (put in Vercel env, all environments)

```
INSTAGRAM_OAUTH_CLIENT_ID=
INSTAGRAM_OAUTH_CLIENT_SECRET=
TIKTOK_OAUTH_CLIENT_KEY=
TIKTOK_OAUTH_CLIENT_SECRET=
```

`CONNECTION_OAUTH_STATE_SECRET` already exists (the YouTube flow uses it) — reuse it, do
not mint a new one.

**Never paste secrets into chat.** Add them in the Vercel dashboard directly.

---

## D. While review is pending

The code ships behind an honest gate: the Instagram/TikTok cards render with a
**"Setup required"** state and a short explanation, never a Connect button that 500s.
The moment the env vars land the cards go live with no redeploy of the UI.
