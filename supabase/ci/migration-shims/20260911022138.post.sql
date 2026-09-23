-- POST-SHIM for 20260911022138_onboarding_rpcs_pass_profile_self_update_guard.sql
--
-- WHY THIS CANNOT APPLY CLEANLY FROM SCRATCH
-- The migration's proof block inserts two users directly into `auth.users`:
--
--   INSERT INTO auth.users (
--     id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
--     raw_app_meta_data, raw_user_meta_data, created_at, updated_at
--   ) VALUES ...
--
-- It names eleven columns. It does NOT name `confirmation_token` or its sibling
-- token columns, which have no NOT NULL and no DEFAULT, so those rows land with
-- NULL in them. Rows created by GoTrue itself always carry '' instead.
--
-- GoTrue's Go model scans these columns into a plain `string`, not a
-- `sql.NullString`. One NULL anywhere in the table breaks the ADMIN LIST
-- endpoint for EVERY user:
--
--   GET /auth/v1/admin/users -> 500
--   {"code":500,"error_code":"unexpected_failure","msg":"Database error finding users"}
--   auth container: "unable to fetch records: sql: Scan error on column index 3,
--                    name \"confirmation_token\": converting NULL to string is unsupported"
--
-- That is what stopped the fixture seed: its very first call is
-- `listUsers` (seed.ts findAuthUserByEmail), so nothing could be seeded at all.
--
-- WHAT PRODUCTION ACTUALLY HOLDS
-- Zero NULLs. Checked on both real projects rather than assumed:
--   production (pluhdapdnuiulvxmyspd): null_confirmation 0 of 36 users
--   QA         (fxlankepwnvelxjrahwk): null_confirmation 0 of 194 users
-- So this is a REPLAY-ONLY artifact and not a production defect. This shim
-- reproduces production's real state rather than inventing a convenience.
--
-- Normalises every GoTrue token column that is declared NOT NULL-less but read
-- as a string, not only the one that happened to fail first — the scan breaks on
-- whichever column index comes first, so fixing one at a time would just move
-- the error.
-- =============================================================================

UPDATE auth.users
   SET confirmation_token         = COALESCE(confirmation_token, ''),
       recovery_token             = COALESCE(recovery_token, ''),
       email_change_token_new     = COALESCE(email_change_token_new, ''),
       email_change               = COALESCE(email_change, ''),
       email_change_token_current = COALESCE(email_change_token_current, ''),
       phone_change               = COALESCE(phone_change, ''),
       phone_change_token         = COALESCE(phone_change_token, ''),
       reauthentication_token     = COALESCE(reauthentication_token, '')
 WHERE confirmation_token IS NULL
    OR recovery_token IS NULL
    OR email_change_token_new IS NULL
    OR email_change IS NULL
    OR email_change_token_current IS NULL
    OR phone_change IS NULL
    OR phone_change_token IS NULL
    OR reauthentication_token IS NULL;
