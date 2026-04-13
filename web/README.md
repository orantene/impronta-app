## Impronta Models & Talent

Next.js App Router frontend for the Impronta Models & Talent platform. The repo root also contains the Supabase migrations and seed scripts used by the app.

## Requirements

- Node.js `>=20.9.0`
- npm `>=10`
- Supabase project with the repo migrations applied

## Environment

Create `web/.env.local` with:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

`NEXT_PUBLIC_SITE_URL` is used for email auth redirects and Google OAuth callbacks.

**Staff “Generate new password” (Admin → Users)** uses the Supabase Admin API on the server. For that to work in **production or staging**, set the same variables as above **plus** a server-only secret in your host’s environment (for example Vercel: Project → Settings → Environment Variables):

```bash
SUPABASE_SERVICE_ROLE_KEY=...
```

Copy the **service_role** key from Supabase → Project Settings → API. Treat it like a root password: never commit it, never prefix with `NEXT_PUBLIC_`, and do not expose it to the browser. After saving the variable, redeploy so the server process picks it up.

For local auth to work end to end, `NEXT_PUBLIC_SITE_URL` must exactly match the browser origin you use while testing, including protocol and port.

Optional **country and city autocomplete** (canonical “Lives in” / “Originally from” fields) uses Google Places from the server when a key is set:

```bash
GOOGLE_PLACES_API_KEY=...
```

See comments in `web/.env.example` for enabling Places API, billing, and key restrictions. After `npm run dev`, search for a country, then a city in that country; if the key is misconfigured, the dev server terminal logs `[google-places] Autocomplete: ...` and the UI falls back to your `countries` / `locations` tables plus OpenStreetMap. Location fields debounce input (~320ms) before calling the search APIs to reduce Google usage.

## Local Development

Install dependencies and run the frontend from `web/`:

```bash
cd web
npm install
npm run dev
```

Open `http://localhost:3000`.

## Verification Commands

```bash
cd web
npm run lint
npm run build
```

If your shell is on an older Node version, `next build` and the default ESLint path will fail before app verification starts.

## Supabase

Schema and seed files live outside the frontend:

- `supabase/migrations/`
- `supabase/seed_demo.sql`
- `supabase/seed_runtime_smoke.sql`

Apply them with the Supabase CLI or SQL editor before verifying public discovery, auth onboarding, saved talent, and inquiry flows.

## Auth Setup Checklist

In Supabase Dashboard:

1. Go to `Authentication` -> `URL Configuration`.
2. Set `Site URL` to your frontend origin, for example `http://localhost:3000`.
3. Add these redirect URLs (OAuth, email confirmation, and password recovery all return through `/auth/callback` with optional `next=`):
   - `http://localhost:3000/auth/callback`
   - `https://YOUR-STAGING-DOMAIN/auth/callback`
4. Go to `Authentication` -> `Providers` -> `Google`.
5. Enable Google and paste the Google OAuth client ID and secret.
6. In Google Cloud Console, add the Supabase callback URL shown in that provider screen as an authorized redirect URI.
7. Go to `Authentication` -> `Providers` -> `Email`.
8. Enable Email provider.
9. For local or staging smoke testing, disable `Confirm email` if you want email signup to land in the app immediately after registration. If you leave it enabled, signup still works, but users must click the confirmation email and return through `/auth/callback`.

### Password recovery and Google sign-in

- **Forgot password** (`/forgot-password`) calls Supabase `resetPasswordForEmail` with `redirectTo` `{SITE_URL}/auth/callback?next=/update-password`. The user sets a new password on `/update-password`, then is redirected to their dashboard. Ensure **Site URL** and **Redirect URLs** in Supabase include your real frontend origin; mismatched `NEXT_PUBLIC_SITE_URL` breaks the link in the email.
- **Google-only users** do not need a password; they can add one from **Account** in the talent, client, or admin dashboard to enable email login as well.
- Passwords are stored in Supabase **Auth** (`auth.users`); no extra app database tables are required.

## Admin Access

Admins use the same `/login` screen as every other user. Staff access is controlled only by the `public.profiles.app_role` value in Supabase.

For the production/staging admin email currently hardcoded in the repo (`orantene@gmail.com`), the latest auth migrations bootstrap `super_admin` automatically when the auth user exists and when that user signs in.

Manual fallback for local/staging or for a different admin email:

1. Create the admin user by signing up in the app or by creating the user in `Authentication` -> `Users`.
2. Open the SQL Editor in Supabase.
3. Run this query with the real admin email address:

```sql
UPDATE public.profiles
SET
  app_role = 'super_admin',
  account_status = 'active',
  onboarding_completed_at = COALESCE(onboarding_completed_at, now()),
  updated_at = now()
WHERE id = (
  SELECT id
  FROM auth.users
  WHERE email = 'admin@example.com'
);
```

4. Sign in at `/login`.
5. Open `/admin`.

Users without `super_admin` or `agency_staff` are redirected away from `/admin`.

To verify or fix real dashboard users with a service role key from your shell:

```bash
cd web
NEXT_PUBLIC_SUPABASE_URL=... \
SUPABASE_SERVICE_ROLE_KEY=... \
CLIENT_EMAIL=client@example.com \
npm run verify:dashboard-users
```

The script prints before/after `app_role` and `account_status` for the admin, talent, and optional client user.

For local routing diagnostics in development, append `?__auth_debug=1` to any page and inspect the response headers:

- `x-impronta-auth-user-id`
- `x-impronta-profile-found`
- `x-impronta-app-role`
- `x-impronta-account-status`
- `x-impronta-dashboard-destination`

## Notes

- The app currently uses `src/middleware.ts`; Next 16 warns that the preferred convention is now `proxy`.
- Public media URLs are expected to come from Supabase Storage buckets configured by the migrations.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
