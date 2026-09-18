/**
 * The passwordless QA-fixture sign-in, as an ordering (D-173).
 *
 * CREATE, THEN MINT, THEN VERIFY. The route used to mint a magic link first
 * and create the user only when that failed, then mint again and verify. For
 * a brand-new `@impronta.test` address the FIRST call answered 401 "Email
 * link is invalid or has expired" and the second 307: the link minted before
 * the user existed (or against the user Supabase had just created) was not a
 * token `verifyOtp(magiclink)` accepts. Creating first makes every mint a
 * plain magic link for an existing, confirmed user, so one call succeeds.
 *
 * Injected clients so the ordering is a unit test, not a Supabase run.
 */

export type FixtureAdmin = {
  createUser: (input: { email: string; email_confirm: true }) => Promise<{ error: { message?: string } | null }>;
  generateLink: (input: { type: "magiclink"; email: string }) => Promise<{
    data: { properties?: { hashed_token?: string | null } | null } | null;
    error: { message?: string } | null;
  }>;
};

export type FixtureVerify = (input: { type: "magiclink"; token_hash: string }) => Promise<{ error: { message?: string } | null }>;

export type FixtureSessionResult =
  | { ok: true }
  | { ok: false; status: 401 | 500; message: string };

export const ALREADY_REGISTERED = /already|registered|exists/i;

export async function mintFixtureSession(
  admin: FixtureAdmin,
  verifyOtp: FixtureVerify,
  email: string,
): Promise<FixtureSessionResult> {
  // 1. The user exists after this line, whether or not it did before.
  const { error: createError } = await admin.createUser({ email, email_confirm: true });
  if (createError && !ALREADY_REGISTERED.test(createError.message ?? "")) {
    return { ok: false, status: 500, message: `Failed to create fixture user: ${createError.message ?? "unknown"}` };
  }
  // 2. One magic link for that user.
  const { data, error: linkError } = await admin.generateLink({ type: "magiclink", email });
  const tokenHash = data?.properties?.hashed_token ?? null;
  if (linkError || !tokenHash) {
    return { ok: false, status: 500, message: `Failed to generate sign-in link: ${linkError?.message ?? "no hashed_token"}` };
  }
  // 3. Verified once, against the token just minted.
  const { error: otpError } = await verifyOtp({ type: "magiclink", token_hash: tokenHash });
  if (otpError) return { ok: false, status: 401, message: `Sign-in failed: ${otpError.message ?? "unknown"}` };
  return { ok: true };
}
